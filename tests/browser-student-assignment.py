"""Student assignment in the real UI.

Run: python tests/browser-student-assignment.py
Requires Python Playwright and Chromium (or set CHROMIUM_EXECUTABLE).
Reuses the isolated fixture from browser-workflow.py. No request leaves the page.
"""

import importlib.util
import json
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('browser_workflow', ROOT / 'tests' / 'browser-workflow.py')
workflow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workflow)

EXTRA_ADAPTER = r"""
window.__assignTest = {
  setup() {
    window.__setRapsFixtureRole('enterprise_admin');
    localStorage.removeItem('RAPS_MY_STUDENT_GROUP:assign-class');
    const c={id:'assign-class',name:'Assign Class',tierId:'1',tierSnapshot:deep(TIERS['1']),status:'draft',scenario:'Range',scenarioVersion:'1',
      scenarioNT:[],homeInstallationId:'TEST',localCreatedByUserId:currentCloudUserId(),students:[],cloudSync:{enabled:false},date:'2026-11-03',roster:'TEST'};
    for(let i=1;i<=6;i++)c.students.push({id:'s'+i,name:'Learner '+i,rank:'A1C',trainingId:'T'+i,attempts:{}});
    db={schemaVersion:5,deviceId:'assign-device',classes:[c]};saveDb(c.id);openClass(c.id);
  },
  groups:()=>deep(db.classes[0].studentGroups||{}),
  attempts:()=>db.classes[0].students.filter(s=>Object.keys(s.attempts||{}).length).length,
  order:()=>[...document.querySelectorAll('#rosterList .rosterRow .rowTitle')].map(x=>x.textContent.trim()),
};
"""


def main():
    checks, errors, external, dialogs = [], [], [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), headless=True)
        context = browser.new_context(service_workers='block', viewport={'width': 390, 'height': 844})
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

        page.goto(workflow.ORIGIN + '/', wait_until='networkidle')
        page.wait_for_function('!!window.__assignTest')
        page.locator('#safetyAck').check()
        page.locator('#safetyEnterBtn').click()
        page.evaluate('window.__assignTest.setup()')
        expect(page.locator('#myGroupPicker')).to_be_hidden()

        # Manager assigns: two instructors, split evenly.
        page.locator('#assignStudentsBtn').click()
        page.locator('#assignLabels').fill('SSgt Alpha, TSgt Bravo')
        page.locator('#assignSplitBtn').click()
        page.locator('#assignSaveBtn').click()
        groups = page.evaluate('window.__assignTest.groups()')
        assert sorted(groups.values()) == ['SSgt Alpha'] * 3 + ['TSgt Bravo'] * 3, groups
        expect(page.locator('.rosterRow', has_text='Learner 1')).to_contain_text('SSgt Alpha')
        checks.append('a manager splits the roster between instructors and each row shows its instructor')

        # This device is SSgt Alpha's: those students list first.
        expect(page.locator('#myGroupPicker')).to_be_visible()
        page.locator('#myGroupSelect').select_option('SSgt Alpha')
        order = page.evaluate('window.__assignTest.order()')
        alpha = [n for n, l in groups.items() if l == 'SSgt Alpha']
        first_three = [t.split(' ', 1)[1] for t in order[:3]]
        assert sorted(first_three) == sorted(f'Learner {n[1:]}' for n in alpha), (order, alpha)
        page.locator('#mineFilterChip').click()
        expect(page.locator('#rosterList .rosterRow')).to_have_count(3)
        page.locator('[data-roster-filter="all"]').click()
        checks.append('an instructor picks their group; their students list first and the Mine filter shows only them')

        # Starting a Bravo student asks first; declining creates nothing.
        bravo = next(n for n, l in groups.items() if l == 'TSgt Bravo')

        def decline(dialog):
            dialogs.append(dialog.message)
            dialog.dismiss()
        page.once('dialog', decline)
        page.locator(f'[data-start="{bravo}"][data-attempt="1"]').click()
        assert 'assigned to TSgt Bravo, not SSgt Alpha' in dialogs[-1]
        expect(page.locator('#formModal')).not_to_have_class('modal open')
        assert page.evaluate('window.__assignTest.attempts()') == 0
        checks.append('starting another instructor\'s student asks first, and declining starts nothing')

        # Own student: no question asked.
        own = alpha[0]
        before = len(dialogs)
        page.locator(f'[data-start="{own}"][data-attempt="1"]').click()
        expect(page.locator('#beginAttemptBtn')).to_be_visible()
        assert len(dialogs) == before
        checks.append('starting one of your own students goes straight to the start screen')
        browser.close()

    assert not errors, errors
    assert not external, external
    print(json.dumps({'checks': checks, 'external_requests': len(external), 'page_errors': len(errors)}, indent=2))


if __name__ == '__main__':
    main()
