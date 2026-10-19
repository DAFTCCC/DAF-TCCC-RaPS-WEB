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
  permissions(id){
    const c=db.classes.find(row=>row.id===id),userId=currentCloudUserId();
    window.RAPS_CLOUD={user:{id:userId},connected:true,offlineCached:false,
      memberships:[{id:'test-pm',user_id:userId,role:'program_manager',active:true,
        base_id:'synthetic-test-base',majcom_id:null,bases:{id:'synthetic-test-base',code:'TEST-BEALE',
          majcom_id:'synthetic-test-command',active:true,majcoms:{active:true}}}]};
    window.RAPS_PERMISSIONS.registerBases([{id:'synthetic-test-base',code:'TEST-BEALE',majcom_id:'synthetic-test-command',active:true},
      {id:'synthetic-live-base',code:'BEALE',majcom_id:'synthetic-live-command',active:true}]);
    return {own:window.RAPS_PERMISSIONS.canClass('manageClass',c),
      live:window.RAPS_PERMISSIONS.canClass('manageClass',{...c,homeInstallationId:'BEALE',cloudScope:undefined})};
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
        expect(show_all).to_be_disabled()
        assert home.locator('option').count() == 74  # 73 TEST, empty
        assert home.locator('option[value^="TEST-"]').count() == 73
        assert home.locator('option[value="__OTHER__"]').count() == 0
        assert training.locator('option[value^="TEST-"]').count() == 73
        assert training.locator('option[value="BEALE"]').count() == 0
        home.select_option('TEST-BEALE')
        expect(home.locator('option:checked')).to_contain_text('Beale AFB (TEST)')
        checks.append('TEST switches both location lists to all 73 separate TEST installations')

        command.select_option('ACC')
        expect(show_all).to_be_enabled()
        expect(home).to_have_value('')
        assert home.locator('option[value^="TEST-"]').count() == 0
        checks.append('switching from TEST clears the TEST choice before a live class can be saved')

        command.select_option('TEST')
        home.select_option('TEST-BEALE')
        page.locator('#classForm [name="name"]').fill('Synthetic TEST Class')
        page.locator('#classForm button[type="submit"]').click()
        expect(page.locator('#formModal')).not_to_have_class('modal open')
        records = page.evaluate('window.__testMajcom.records()')
        assert len(records) == 1
        course = records[0]
        assert course['majcom'] == 'TEST'
        assert course['homeInstallationId'] == 'TEST-BEALE'
        assert course['homeInstallationName'] == 'Beale AFB (TEST)'
        assert course['trainingInstallationId'] == 'TEST-BEALE'
        assert page.evaluate('(id)=>window.__testMajcom.csv(id)', course['id'])[:5] == [
            'ACTIVE_DUTY', 'TEST', 'TEST-BEALE', 'Beale AFB (TEST)', 'TEST']
        checks.append('saving and CSV export retain distinct TEST IDs and visible TEST labels')

        page.evaluate('(id)=>window.__testMajcom.edit(id,true)', course['id'])
        expect(home).to_be_disabled()
        assert command.locator('option[value="ACC"]').evaluate('(option)=>option.disabled')
        assert not command.locator('option[value="TEST"]').evaluate('(option)=>option.disabled')
        page.evaluate('''()=>{
          const f=document.getElementById('classForm');
          f.elements.majcom.value='ACC';
          f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
        }''')
        assert alerts and 'TEST installations require the TEST MAJCOM' in alerts[-1]
        assert page.evaluate('window.__testMajcom.records()')[0]['majcom'] == 'TEST'
        checks.append('published TEST scope remains locked and rejects a tampered live command')

        result = page.evaluate('(id)=>window.__testMajcom.permissions(id)', course['id'])
        assert result == {'own': True, 'live': False}
        assert page.evaluate('window.__testMajcom.infer("Beale AFB")') == 'BEALE'
        assert page.evaluate('window.__testMajcom.infer("Beale AFB (TEST)")') == 'TEST-BEALE'
        checks.append('ordinary TEST Program Manager manages its TEST installation without a live scope grant')

        page.set_viewport_size({'width': 320, 'height': 640})
        page.evaluate('window.__testMajcom.openNew()')
        command.select_option('TEST')
        longest = home.locator('option[value^="TEST-"]').evaluate_all(
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
