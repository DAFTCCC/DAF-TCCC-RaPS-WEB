"""Check evaluator keyboard and accessible names with isolated UI fixtures.

Run: python3 -B tests/browser-accessibility.py
Uses the same synthetic adapter as browser-workflow.py. All requests are served
in memory from this checkout; cloud/auth scripts and external requests are blocked.
"""

import importlib.util
import json
import mimetypes
import os
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


SOURCE = Path(__file__).with_name('browser-workflow.py')
SPEC = importlib.util.spec_from_file_location('raps_browser_workflow', SOURCE)
WORKFLOW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKFLOW)


def main():
    checks, errors, external = [], [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'),
            headless=True,
        )
        context = browser.new_context(service_workers='block', viewport={'width': 1024, 'height': 768})
        context.add_init_script(WORKFLOW.IDENTITY_FIXTURE)

        def fulfill(route):
            url = urlsplit(route.request.url)
            if url.hostname != '127.0.0.1' or url.port != 8765:
                external.append(route.request.url)
                return route.abort()
            relative = unquote(url.path).lstrip('/') or 'index.html'
            target = (WORKFLOW.ROOT / relative).resolve()
            if WORKFLOW.ROOT not in target.parents or not target.is_file():
                return route.fulfill(status=404, body='Not found')
            if relative == 'index.html':
                body = WORKFLOW.test_html().encode()
            elif relative == 'app.js':
                source = target.read_text()
                marker = '\nrenderHome();\n})();'
                assert source.count(marker) == 1
                body = source.replace(marker, '\n' + WORKFLOW.ADAPTER + marker, 1).encode()
            elif relative == 'cloud-auth.js':
                source = target.read_text()
                marker = '\n})();'
                assert source.count(marker) == 1
                adapter = "\nwindow.__rapsAuthUiTest={setGate:open=>setGate(open,'Synthetic accessibility fixture')};\n"
                body = source.replace(marker, adapter + marker, 1).encode()
            else:
                body = target.read_bytes()
            route.fulfill(status=200, body=body,
                          content_type=mimetypes.guess_type(str(target))[0] or 'application/octet-stream')

        context.route('**/*', fulfill)
        page = context.new_page()
        page.set_default_timeout(7000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.dismiss())
        page.goto(WORKFLOW.ORIGIN + '/')
        page.locator('#safetyAck').check()
        page.locator('#safetyEnterBtn').click()
        page.evaluate('window.__rapsTest.setup()')

        grade = page.locator('[data-item][data-rating="pass"]').first
        criterion = grade.get_attribute('data-item')
        grade.focus()
        grade.press('Enter')
        expect(page.locator(f'[data-item="{criterion}"][data-rating="pass"]')).to_be_focused()
        assert page.evaluate('window.__rapsTest.state().ratings')[criterion] == 'pass'
        checks.append('keyboard grading retains focus on the replacement criterion control')

        phase = page.locator('#tabs [data-section]').nth(1)
        section = phase.get_attribute('data-section')
        phase.focus()
        phase.press('Enter')
        expect(page.locator(f'#tabs [data-section="{section}"]')).to_be_focused()
        expect(page.locator(f'#tabs [data-section="{section}"]')).to_have_attribute('aria-pressed', 'true')
        expect(page.locator(f'#bottomTabs [data-section="{section}"]')).to_have_attribute('aria-pressed', 'true')
        assert page.locator('#tabs [data-section][aria-pressed="true"]').count() == 1
        assert page.locator('#bottomTabs [data-section][aria-pressed="true"]').count() == 1
        checks.append('both phase selectors expose their state and top selection preserves keyboard focus')

        page.locator('#reviewModeBtn').click()
        for name, target in [('Evaluator name', 'trainerSign'), ('Evaluator ID', 'attemptEvaluatorId'),
                             ('Student acknowledgment name', 'studentSign'),
                             ('Overall evaluator comments / notes', 'overallNotes')]:
            expect(page.get_by_label(name, exact=True)).to_have_attribute('id', target)
            assert page.locator(f'label[for="{target}"]').is_visible()
        for note in page.locator('[data-note]').all():
            assert note.get_attribute('aria-label') == f'{note.get_attribute("data-note")} evaluator note'
        assert all(button.get_attribute('aria-label') for button in page.locator('[data-timer]').all())
        checks.append('sign-off, notes, and timer controls have persistent or criterion-specific names')

        # The source timer action is unchanged; its now-disabled START control
        # hands keyboard focus to STOP in the same timer container.
        start = page.locator('#quickCufTimer [data-act="start"]')
        timer = start.get_attribute('data-timer')
        start.focus()
        start.press('Enter')
        expect(page.locator(f'#quickCufTimer [data-timer="{timer}"][data-act="stop"]')).to_be_focused()
        page.locator(f'#quickCufTimer [data-timer="{timer}"][data-act="stop"]').press('Enter')
        checks.append('starting a timer hands focus to its STOP control without changing timer behavior')

        trigger = page.locator('[data-failure]').first
        item = trigger.get_attribute('data-failure')
        trigger.focus()
        before_ratings = page.evaluate('window.__rapsTest.state().ratings')
        trigger.press('Enter')
        modal = page.get_by_role('dialog', name=re.compile(r'Observation & Coaching'))
        expect(modal).to_be_visible()
        expect(page.locator('#failureComment')).to_be_focused()
        assert page.locator('#evalView').evaluate('(element)=>element.inert')
        close = modal.locator('[data-close]')
        submit = modal.locator('button[type="submit"]')
        close.focus()
        close.press('Shift+Tab')
        expect(submit).to_be_focused()
        submit.press('Tab')
        expect(close).to_be_focused()
        page.keyboard.press('Escape')
        expect(modal).not_to_be_visible()
        expect(page.locator(f'[data-failure="{item}"]').first).to_be_focused()
        assert not page.locator('#evalView').evaluate('(element)=>element.inert')
        checks.append('named dialogs contain forward/backward Tab, close with Escape, and restore their trigger')

        page.locator(f'[data-failure="{item}"]').first.press('Enter')
        page.locator('#failureComment').fill('Synthetic observed evidence for keyboard review')
        page.locator('#failureReasonForm button[type="submit"]').click()
        expect(page.locator('#formModal')).not_to_be_visible()
        expect(page.locator(f'[data-failure="{item}"]').first).to_be_focused()
        assert page.evaluate('window.__rapsTest.state().ratings') == before_ratings
        checks.append('saving coaching restores a replaced trigger and leaves official grades unchanged')

        # A caller can change the visible section while a modal is open. When
        # its original control no longer exists, use a visible navigation control.
        page.locator(f'[data-failure="{item}"]').first.press('Enter')
        other = page.evaluate("TCCC_TIERS['1'].sections.find(section=>section.code!==__rapsTest.state().section&&section.items.length).items[0].id")
        page.evaluate('(id)=>__rapsTest.showItem(id)', other)
        page.keyboard.press('Escape')
        expect(page.locator('#reviewModeBtn')).to_be_focused()
        checks.append('closing a dialog whose trigger disappeared uses a visible focus fallback')

        footer = page.locator('[data-brand-footer]')
        footer.evaluate('(element)=>element.inert=true')
        page.locator('[data-failure]').first.click()
        page.keyboard.press('Escape')
        assert footer.evaluate('(element)=>element.inert')
        footer.evaluate('(element)=>element.inert=false')
        checks.append('modal dismissal preserves pre-existing background inert state')

        about = page.locator('[data-open-branding]')
        about.click()
        branding = page.get_by_role('dialog', name='About / Ownership / Contact', exact=True)
        expect(branding).to_be_visible()
        page.keyboard.press('Escape')
        expect(branding).not_to_be_visible()
        expect(about).to_be_focused()
        checks.append('the independently opened branding dialog shares keyboard and focus handling')

        # Load the real authentication UI only after the app's coaching modal
        # has isolated its background. Missing config makes initialization stop
        # before SDK construction, sessions, or any authentication operation.
        page.locator('[data-failure]').first.click()
        expect(page.locator('#failureComment')).to_be_focused()
        assert page.evaluate('!window.RAPS_CLOUD_CONFIG && !window.supabase')
        page.add_script_tag(url=WORKFLOW.ORIGIN + '/cloud-auth.js?accessibility-fixture=1')
        gate = page.get_by_role('dialog', name='Sign in to TCCC Evaluation Suite', exact=True)
        expect(gate).to_be_visible()
        expect(page.locator('#cloudAuthTitle')).to_be_focused()
        assert page.locator('#formModal').evaluate('(element)=>element.inert')
        assert page.locator('#evalView').evaluate('(element)=>element.inert')
        page.locator('#cloudAuthEmail').focus()
        page.keyboard.press('Shift+Tab')
        expect(page.locator('#cloudRequestAccessBtn')).to_be_focused()
        page.keyboard.press('Tab')
        expect(page.locator('#cloudAuthEmail')).to_be_focused()
        page.keyboard.press('Escape')
        expect(page.locator('#formModal')).to_be_visible()
        expect(gate).to_be_visible()
        expect(page.locator('#cloudAuthEmail')).to_be_focused()
        page.evaluate('window.__rapsAuthUiTest.setGate(false)')
        expect(gate).not_to_be_visible()
        expect(page.locator('#failureComment')).to_be_focused()
        assert not page.locator('#formModal').evaluate('(element)=>element.inert')
        assert page.locator('#evalView').evaluate('(element)=>element.inert')
        page.keyboard.press('Escape')
        assert not page.locator('#evalView').evaluate('(element)=>element.inert')
        expect(page.locator('[data-failure]').first).to_be_focused()
        assert page.evaluate('!window.RAPS_SUPABASE')
        checks.append('the actual authentication gate traps focus above coaching, then restores its modal and finally the application background')

        page.locator('#finalizeBtn').click()
        report = page.get_by_role('dialog', name='Evaluation Review', exact=True)
        expect(report).to_be_visible()
        page.locator('#copyAar').focus()
        page.keyboard.press('Tab')
        expect(report.locator('[data-close]')).to_be_focused()
        page.keyboard.press('Escape')
        expect(page.locator('#finalizeBtn')).to_be_focused()
        checks.append('the named review dialog traps keyboard focus without invoking finalization')

        assert not external, external
        assert not errors, errors
        browser.close()
    print(json.dumps({'checks_passed': len(checks), 'checks': checks,
                      'external_requests': len(external), 'page_errors': len(errors)}, indent=2))


if __name__ == '__main__':
    main()
