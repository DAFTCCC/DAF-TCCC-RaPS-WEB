"""Check TEST and live class forms with the actual app and isolated identities.

Run: python3 tests/browser-test-majcom.py
No production authentication, requests, records, or writes are used.
"""

import importlib.util
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


SPEC = importlib.util.spec_from_file_location('raps_browser_workflow', Path(__file__).with_name('browser-workflow.py'))
WORKFLOW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKFLOW)
ROOT = WORKFLOW.ROOT
ORIGIN = WORKFLOW.ORIGIN
ADAPTER = r"""
window.__testMajcom = {
  openNew(){window.__setRapsFixtureRole('enterprise_admin');showHome();newClassForm();},
  records:()=>deep(db.classes),
  edit(id,published=false){
    window.__setRapsFixtureRole('enterprise_admin');
    currentClassId=id;const c=cls();
    if(published){c.cloudScope={baseId:'synthetic-test-base',majcomId:'synthetic-test-command',baseCode:c.homeInstallationId};c.cloudSync.createdBy=currentCloudUserId();}
    newClassForm(c);
  },
  csv(id){return classLocationExportValues(db.classes.find(c=>c.id===id));},
  legacy(){
    const c=deep(db.classes[0]);c.id='legacy-test-class';c.majcom='TEST';
    c.homeInstallationId='TEST-BEALE';c.homeInstallationName='';
    c.trainingLocationType='SAME_AS_HOME';c.trainingInstallationId='TEST-BEALE';c.trainingLocationName='';
    ensureLocationFields(c);db.classes.push(c);return c.id;
  },
  permissions(id){
    const c=db.classes.find(row=>row.id===id),userId=currentCloudUserId();
    c.cloudScope={baseId:'physical-base',baseCode:'BEALE',majcomId:'host-command'};
    window.RAPS_CLOUD={user:{id:userId},connected:true,offlineCached:false,
      memberships:[{id:'ordinary-pm',user_id:userId,role:'program_manager',active:true,
        base_id:'physical-base',majcom_id:null,bases:{id:'physical-base',code:'BEALE',
          majcom_id:'host-command',active:true,majcoms:{active:true}}}]};
    window.RAPS_PERMISSIONS.registerBases([{id:'physical-base',code:'BEALE',majcom_id:'host-command',active:true},
      {id:'other-base',code:'EDWARDS',majcom_id:'other-command',active:true}]);
    return {own:window.RAPS_PERMISSIONS.canClass('manageClass',c),
      other:window.RAPS_PERMISSIONS.canClass('manageClass',{...c,homeInstallationId:'EDWARDS',
        cloudScope:{baseId:'other-base',baseCode:'EDWARDS',majcomId:'other-command'},
        cloudSync:{createdBy:'someone-else'}})};
  },
  infer:inferInstallationId
};
"""


def main():
    checks = []
    errors = []
    external_requests = []
    alerts = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), headless=True)
        context = browser.new_context(service_workers='block', viewport={'width': 1280, 'height': 900})
        context.add_init_script(WORKFLOW.IDENTITY_FIXTURE)

        def fulfill(route):
            url = urlsplit(route.request.url)
            if url.hostname != '127.0.0.1' or url.port != 8765:
                external_requests.append(route.request.url)
                return route.abort()
            relative = unquote(url.path).lstrip('/') or 'index.html'
            target = (ROOT / relative).resolve()
            if ROOT not in target.parents or not target.is_file():
                return route.fulfill(status=404, body='Not found')
            if relative == 'index.html':
                body = WORKFLOW.test_html().encode()
            elif relative == 'app.js':
                source = target.read_text()
                marker = '\nrenderHome();\n})();'
                assert source.count(marker) == 1
                body = source.replace(marker, '\n' + ADAPTER + marker, 1).encode()
            else:
                body = target.read_bytes()
            route.fulfill(status=200, body=body,
                          content_type=mimetypes.guess_type(str(target))[0] or 'application/octet-stream')

        context.route('**/*', fulfill)
        page = context.new_page()
        page.set_default_timeout(7000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: (alerts.append(dialog.message), dialog.dismiss()))
        page.goto(ORIGIN + '/', wait_until='networkidle')
        page.wait_for_function('!!window.__testMajcom')
        page.locator('#safetyAck').check()
        page.locator('#safetyEnterBtn').click()
        page.evaluate('window.__testMajcom.openNew()')

        command = page.locator('#classForm [name="majcom"]')
        home = page.locator('#classForm [name="homeInstallationId"]')
        training = page.locator('#classForm [name="trainingInstallationId"]')
        show_all = page.locator('#classForm [name="showAllInstallations"]')

        assert command.locator('option[value="TEST"]').count() == 1
        command.select_option('ACC')
        assert home.locator('option[value^="TEST-"]').count() == 0
        show_all.check()
        assert home.locator('option').count() == 75  # 73 live, empty, custom
        assert training.locator('option[value^="TEST-"]').count() == 0
        checks.append('live Show all keeps every real installation and excludes TEST copies')

        command.select_option('TEST')
        expect(show_all).to_be_enabled()
        assert home.locator('option').count() == 75
        assert home.locator('option[value^="TEST-"]').count() == 0
        assert home.locator('option[value="__OTHER__"]').count() == 1
        assert training.locator('option[value^="TEST-"]').count() == 0
        assert training.locator('option[value="BEALE"]').count() == 1
        home.select_option('BEALE')
        expect(home.locator('option:checked')).to_contain_text('Beale AFB')
        checks.append('TEST uses the same 73 physical installations and custom-location choices')

        command.select_option('ACC')
        expect(show_all).to_be_enabled()
        expect(home).to_have_value('BEALE')
        command.select_option('TEST')
        expect(home).to_have_value('BEALE')
        checks.append('switching supported command preserves an ordinary installation')

        page.locator('#classForm [name="name"]').fill('Synthetic TEST Class')
        page.locator('#classForm button[type="submit"]').click()
        expect(page.locator('#formModal')).not_to_have_class('modal open')
        records = page.evaluate('window.__testMajcom.records()')
        assert len(records) == 1
        course = records[0]
        assert course['majcom'] == 'TEST'
        assert course['homeInstallationId'] == 'BEALE'
        assert course['homeInstallationName'] == 'Beale AFB'
        assert course['trainingInstallationId'] == 'BEALE'
        assert page.evaluate('(id)=>window.__testMajcom.csv(id)', course['id'])[:5] == [
            'ACTIVE_DUTY', 'TEST', 'BEALE', 'Beale AFB', 'ACC']
        checks.append('TEST creation and export preserve ordinary installation IDs and host command')

        page.evaluate('(id)=>window.__testMajcom.edit(id,true)', course['id'])
        expect(home).to_be_disabled()
        assert not command.locator('option[value="ACC"]').evaluate('(option)=>option.disabled')
        command.select_option('ACC')
        page.locator('#classForm button[type="submit"]').click()
        edited = page.evaluate('window.__testMajcom.records()')[0]
        assert edited['majcom'] == 'ACC' and edited['homeInstallationId'] == 'BEALE'
        checks.append('published home stays locked while supported MAJCOM follows normal editing')

        legacy_id = page.evaluate('window.__testMajcom.legacy()')
        page.evaluate('(id)=>window.__testMajcom.edit(id,true)', legacy_id)
        expect(home).to_be_disabled()
        expect(home).to_have_value('TEST-BEALE')
        assert home.locator('option[value^="TEST-"]').count() == 1
        page.locator('#classForm [name="name"]').fill('Retained legacy record')
        page.locator('#classForm button[type="submit"]').click()
        legacy_record = next(row for row in page.evaluate('window.__testMajcom.records()') if row['id'] == legacy_id)
        assert legacy_record['homeInstallationId'] == 'TEST-BEALE'
        assert legacy_record['name'] == 'Retained legacy record'
        checks.append('legacy records stay editable without silently changing scope')

        result = page.evaluate('(id)=>window.__testMajcom.permissions(id)', course['id'])
        assert result == {'own': True, 'other': False}
        assert page.evaluate('window.__testMajcom.infer("Beale AFB")') == 'BEALE'
        assert page.evaluate('window.__testMajcom.infer("Beale AFB (TEST)")') == 'TEST-BEALE'
        checks.append('supported TEST label grants no access beyond assigned installation')

        page.set_viewport_size({'width': 320, 'height': 640})
        page.evaluate('window.__testMajcom.openNew()')
        command.select_option('TEST')
        longest = home.locator('option[value]:not([value=""]):not([value="__OTHER__"])').evaluate_all(
            '(options)=>options.sort((a,b)=>b.textContent.length-a.textContent.length)[0].value')
        home.select_option(longest)
        for selector in ['#formModal .sheet', '#classForm', '#classForm [name="majcom"]', '#classForm [name="homeInstallationId"]']:
            assert page.locator(selector).evaluate('(node)=>node.scrollWidth<=node.clientWidth+1'), selector
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
        page.screenshot(path='/tmp/raps-test-majcom-phone.png')
        checks.append('TEST class form and longest installation name fit a 320px phone viewport')

        assert not external_requests, external_requests
        assert not errors, errors
        browser.close()
    print(json.dumps({'checks': checks, 'external_requests': len(external_requests), 'page_errors': errors}, indent=2))


if __name__ == '__main__':
    main()
