"""Remove Student in the real UI, with an unfinished evaluation on the device.

Run: python tests/browser-remove-student.py
Requires Python Playwright and Chromium (or set CHROMIUM_EXECUTABLE).
Reuses the isolated fixture from browser-workflow.py: assets are served from
this checkout in memory, cloud scripts are omitted, and no request leaves the
page. Reproduces the field report where every Remove Student button was
disabled while any evaluation was in progress.
"""

import importlib.util
import json
import os
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('browser_workflow', ROOT / 'tests' / 'browser-workflow.py')
workflow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workflow)

ORIGIN = workflow.ORIGIN
EXTRA_ADAPTER = r"""
window.__rosterTest = {
  setup() {
    window.__setRapsFixtureRole('enterprise_admin');
    localStorage.removeItem(ROSTER_WITHDRAWAL_PREFIX+'roster-class');
    const c={id:'roster-class',name:'Roster Class',tierId:'1',tierSnapshot:deep(TIERS['1']),
      status:'active',scenario:'Roster test',scenarioVersion:'1',scenarioNT:[],homeInstallationId:'TEST',
      localCreatedByUserId:currentCloudUserId(),students:[],leadEvaluator:'Test Evaluator',
      cloudSync:{enabled:true,status:'synced'},date:'2026-10-31',roster:'TEST'};
    const busy={id:'busy-student',name:'Busy Learner',rank:'SrA',trainingId:'T-1',attempts:{}};
    const free={id:'free-student',name:'Free Learner',rank:'A1C',trainingId:'T-2',attempts:{}};
    c.students.push(busy,free);
    db={schemaVersion:5,deviceId:'test-device',classes:[c]};
    currentClassId=c.id;currentStudentId=busy.id;currentAttemptNo=1;
    busy.attempts['1']=makeAttempt(c,busy,1);busy.attempts['1'].startedAt=now();
    saveDb(c.id);openClass(c.id);
  },
  lockActive:()=>!!findActiveEvaluationLock(),
  studentIds:()=>(db.classes.find(c=>c.id==='roster-class')?.students||[]).map(s=>s.id),
  storedIds:()=>JSON.parse(localStorage.getItem(DB_KEY)).classes.find(c=>c.id==='roster-class').students.map(s=>s.id),
  queue:()=>JSON.parse(localStorage.getItem(ROSTER_WITHDRAWAL_PREFIX+'roster-class')||'null'),
  open:()=>openClass('roster-class'),
};
"""


def main():
    checks, errors, external, dialogs = [], [], [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), headless=True)
        context = browser.new_context(service_workers='block', viewport={'width': 1366, 'height': 900})
        context.add_init_script(workflow.IDENTITY_FIXTURE)

        def fulfill(route):
            url = urlsplit(route.request.url)
            if url.hostname != '127.0.0.1' or url.port != 8765:
                external.append(route.request.url)
                return route.abort()
            relative = unquote(url.path).lstrip('/') or 'index.html'
            target = (ROOT / relative).resolve()
            if ROOT not in target.parents or not target.is_file():
                return route.fulfill(status=404, body='Not found')
            if relative == 'index.html':
                body = workflow.test_html().encode()
            elif relative == 'app.js':
                source = target.read_text()
                marker = '\nrenderHome();\n})();'
                assert source.count(marker) == 1
                body = source.replace(marker, '\n' + workflow.ADAPTER + EXTRA_ADAPTER + marker, 1).encode()
            else:
                body = target.read_bytes()
            route.fulfill(status=200, body=body, content_type='text/html' if relative.endswith('.html')
                          else 'application/javascript' if relative.endswith('.js') else 'text/css')

        context.route('**/*', fulfill)
        page = context.new_page()
        page.set_default_timeout(7000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(ORIGIN + '/', wait_until='networkidle')
        page.wait_for_function('!!window.__rosterTest')
        page.locator('#safetyAck').check()
        page.locator('#safetyEnterBtn').click()
        page.evaluate('window.__rosterTest.setup()')

        assert page.evaluate('window.__rosterTest.lockActive()'), 'Fixture must reproduce an active evaluation'
        free_btn = page.locator('[data-delete-student="free-student"]')
        busy_btn = page.locator('[data-delete-student="busy-student"]')
        expect(free_btn).to_be_enabled()
        checks.append('Remove Student stays enabled for a student with no assessment while another evaluation is active')
        expect(busy_btn).to_be_disabled()
        expect(busy_btn).to_have_attribute('title', re.compile('started assessment'))
        checks.append('a student with a started assessment is protected and the tooltip states the real reason')

        def accept(dialog):
            dialogs.append(dialog.message)
            dialog.accept()
        page.once('dialog', accept)
        free_btn.click()
        expect(page.locator('[data-delete-student="free-student"]')).to_have_count(0)
        assert page.evaluate('window.__rosterTest.studentIds()') == ['busy-student']
        assert page.evaluate('window.__rosterTest.storedIds()') == ['busy-student']
        assert 'synchronized to every device' in dialogs[-1]
        queue = page.evaluate('window.__rosterTest.queue()')
        assert [item['studentId'] for item in queue['items']] == ['free-student']
        assert 'Free Learner' not in json.dumps(queue), 'Queue must not store names'
        checks.append('confirming removes the student, saves the roster, and queues a server withdrawal')

        page.reload(wait_until='networkidle')
        page.wait_for_function('!!window.__rosterTest')
        if page.locator('#safetyAck').is_visible():
            page.locator('#safetyAck').check()
            page.locator('#safetyEnterBtn').click()
        page.evaluate('window.__rosterTest.open()')
        expect(page.locator('[data-delete-student="free-student"]')).to_have_count(0)
        assert [item['studentId'] for item in page.evaluate('window.__rosterTest.queue()')['items']] == ['free-student']
        checks.append('the removal and its sync queue survive a page reload')

        browser.close()

    assert not errors, errors
    assert not external, external
    print(json.dumps({'checks': checks, 'external_requests': len(external), 'page_errors': len(errors)}, indent=2))


if __name__ == '__main__':
    main()
