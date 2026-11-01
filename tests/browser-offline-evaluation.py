"""Evaluator UI with no connection: start, grade, finalize, reload, retest rules.

Run: python tests/browser-offline-evaluation.py
Requires Python Playwright and Chromium (or set CHROMIUM_EXECUTABLE).
Reuses the isolated fixture from browser-workflow.py: assets are served from
this checkout in memory, cloud scripts are omitted, and no request leaves the
page. The signed-in identity is the cached offline identity a phone keeps after
its morning sync.
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

OFFLINE_IDENTITY = r"""
if (localStorage.getItem('raps-test-offline') === '1') {
  const id = window.RAPS_CLOUD?.user?.id || 'test-evaluator';
  window.RAPS_CLOUD = {...window.RAPS_CLOUD, connected: false, offlineCached: true, mode: 'offline'};
}
"""
EXTRA_ADAPTER = r"""
window.__offlineTest = {
  setup() {
    const c={id:'field-class',name:'Field Class',tierId:'1',tierSnapshot:deep(TIERS['1']),status:'draft',scenario:'Range',
      scenarioVersion:'1',scenarioNT:[],homeInstallationId:'TEST',localCreatedByUserId:currentCloudUserId(),students:[],
      leadEvaluator:'Test Evaluator',cloudSync:{enabled:true,status:'synced',createdBy:currentCloudUserId()},date:'2026-11-03',roster:'TEST'};
    for(const [id,name] of [['s1','Pass Learner'],['s2','Fail Learner'],['s3','Retest Learner']])c.students.push({id,name,rank:'A1C',trainingId:id,attempts:{}});
    db={schemaVersion:5,deviceId:'phone-1',classes:[c]};saveDb(c.id);openClass(c.id);
  },
  open:()=>openClass('field-class'),
  attempt:(sid,n)=>deep(db.classes[0].students.find(s=>s.id===sid).attempts[String(n)]||null),
  stored:(sid,n)=>JSON.parse(localStorage.getItem(DB_KEY)).classes[0].students.find(s=>s.id===sid).attempts[String(n)]||null,
  failCritical(){const st=evalState(),t=tier();const crit=allItems(t).find(i=>i.critical);st.ratings[crit.id]='fail';
    st.failureDetails[crit.id]={mode:'omission',contributor:'knowledge',classifiedAt:now(),at:now()};saveDb();renderEval();},
  reachable:()=>cloudReachable(),
};
"""


def main():
    checks, errors, external, dialogs = [], [], [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), headless=True)
        context = browser.new_context(service_workers='block', viewport={'width': 390, 'height': 844})
        context.add_init_script(workflow.IDENTITY_FIXTURE + OFFLINE_IDENTITY)

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

        def accept(dialog):
            dialogs.append(dialog.message)
            dialog.accept()
        page.on('dialog', accept)

        def enter():
            page.goto(workflow.ORIGIN + '/', wait_until='networkidle')
            page.wait_for_function('!!window.__offlineTest')
            if page.locator('#safetyAck').is_visible():
                page.locator('#safetyAck').check()
                page.locator('#safetyEnterBtn').click()

        page.goto(workflow.ORIGIN + '/', wait_until='networkidle')
        page.evaluate("localStorage.setItem('raps-test-offline','1')")
        enter()
        page.evaluate('window.__offlineTest.setup()')
        assert page.evaluate('window.__offlineTest.reachable()') is False, 'Fixture must be offline'
        panel = page.locator('#offlineReadyPanel')
        expect(panel).to_be_visible()
        expect(panel).to_contain_text('NOT OFFLINE READY')
        expect(panel).to_contain_text('Reload RaPS once while connected')
        checks.append('the Offline Ready panel names what is missing (app not saved for offline use in this fixture)')

        # Start A1 with no connection.
        page.locator('[data-start="s1"][data-attempt="1"]').click()
        page.locator('#beginAttemptAck').check()
        page.locator('#beginAttemptBtn').click()
        expect(page.locator('#attemptBadge')).to_contain_text('OFFLINE')
        a = page.evaluate('window.__offlineTest.attempt("s1",1)')
        assert a['pendingServerClaim'] is True and a['fieldStartedAt'] == a['startedAt']
        checks.append('an assessment starts offline and is saved immediately')

        # Grade and finalize with no connection.
        page.evaluate('window.__rapsTest.allPassAndMet()')
        page.locator('#reviewModeBtn').click()
        page.locator('#finalizeBtn').click()
        page.locator('#confirmFinalizeBtn').click()
        expect(page.locator('#attemptBadge')).to_contain_text('FINALIZED · AWAITING SYNC')
        assert any('Finalize this evaluation on this device' in d for d in dialogs)
        a = page.evaluate('window.__offlineTest.attempt("s1",1)')
        assert a['pendingServerFinalization'] is True and a['finalResult'] == 'PASS' and a['fieldFinalizedAt'] == a['finalizedAt']
        expect(page.locator('#finalizeBtn')).to_be_disabled()
        assert page.locator('#items button.choice').first.is_disabled(), 'Sealed record must be read-only'
        checks.append('finalizing offline seals the record read-only as FINALIZED · AWAITING SYNC')

        # Survive a full reload.
        enter()
        page.evaluate('window.__offlineTest.open()')
        expect(page.locator('.rosterRow', has_text='Pass Learner')).to_contain_text('FINALIZED · AWAITING SYNC')
        expect(page.locator('.rosterRow', has_text='Pass Learner')).to_contain_text('PASS · ON DEVICE')
        stored = page.evaluate('window.__offlineTest.stored("s1",1)')
        assert stored['pendingServerFinalization'] is True and stored['finalResult'] == 'PASS'
        checks.append('the sealed record and its status survive a reload')

        # A1 FAIL: the same evaluator cannot retest.
        page.locator('[data-start="s2"][data-attempt="1"]').click()
        page.locator('#beginAttemptAck').check()
        page.locator('#beginAttemptBtn').click()
        page.evaluate('window.__rapsTest.allPassAndMet()')
        page.evaluate('window.__offlineTest.failCritical()')
        page.locator('#reviewModeBtn').click()
        page.locator('#finalizeBtn').click()
        page.locator('#confirmFinalizeBtn').click()
        expect(page.locator('#attemptBadge')).to_contain_text('FINALIZED · AWAITING SYNC')
        page.evaluate('window.__offlineTest.open()')
        retest = page.locator('[data-start="s2"][data-attempt="2"]')
        expect(retest).to_be_disabled()
        expect(retest).to_contain_text('Different Evaluator Required')
        expect(retest).to_have_attribute('title', re.compile('different evaluator', re.I))
        checks.append('the A1 evaluator sees A2 locked: a different evaluator must retest')

        # Retest a student whose A1 FAIL is on another phone.
        page.locator('[data-start-retest="s3"]').click()
        expect(page.locator('#formModalBody')).to_contain_text('Retest from another phone')
        page.locator('#remediationReason').select_option(index=1)
        page.locator('#remediationAction').fill('Coached repetition on tourniquet placement')
        page.locator('#beginAttemptAck').check()
        page.locator('#beginAttemptBtn').click()
        expect(page.locator('#attemptBadge')).to_contain_text('Attempt 2')
        r = page.evaluate('window.__offlineTest.attempt("s3",2)')
        assert r['pendingServerClaim'] is True and r['remediation']['attempt1OnAnotherDevice'] is True
        checks.append('a retest for a student graded on another phone starts offline and waits for server verification')

        page.evaluate("localStorage.removeItem('raps-test-offline')")
        browser.close()

    assert not errors, errors
    assert not external, external
    print(json.dumps({'checks': checks, 'external_requests': len(external), 'page_errors': len(errors)}, indent=2))


if __name__ == '__main__':
    main()
