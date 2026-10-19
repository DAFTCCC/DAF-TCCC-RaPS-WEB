"""Check the real persistent phase controls using synthetic local assessments.

Run: python3 -B tests/browser-phase-navigation.py
Uses the workflow fixture, blocks external requests, and never signs in or writes
to a deployed server. Screenshots are saved under /tmp/raps-phase-navigation.
"""

import importlib.util
import json
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


SPEC = importlib.util.spec_from_file_location(
    'raps_browser_workflow', Path(__file__).with_name('browser-workflow.py'))
WORKFLOW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKFLOW)
ARTIFACTS = Path('/tmp/raps-phase-navigation')
ADAPTER = WORKFLOW.ADAPTER + r"""
window.__phaseNavigationTest = {
  metrics:()=>evaluationStickyMetrics(),
  home:()=>showHome(),
  roster:()=>openClass(currentClassId),
  expected:()=>tier().sections.map(s=>({code:s.code,label:sectionTabLabel(s.code)})),
};
"""


PHASE_BARS = ('#tabs', '#checklistBottomTabs', '#bottomTabs')


def reveal_phase(page, code, strip='#bottomTabs'):
    """Reveal the control in its own horizontal strip for a pointer click."""
    button = page.locator(f'{strip} [data-section="{code}"]')
    button.evaluate("""button=>{
      const strip=button.parentElement;
      strip.scrollLeft=button.offsetLeft-strip.offsetLeft-(strip.clientWidth-button.offsetWidth)/2;
    }""")
    return button


def assert_selected(page, code):
    for selector in PHASE_BARS:
        assert page.locator(f'{selector} [data-section][aria-pressed="true"]').count() == 1
        expect(page.locator(f'{selector} [data-section="{code}"]')).to_have_attribute('aria-pressed', 'true')
    assert page.evaluate('window.__rapsTest.state().section') == code


def assert_geometry(page):
    geometry = page.evaluate(r"""()=>{
      const nav=document.getElementById('evalPhaseNav'),n=nav.getBoundingClientRect();
      const buttons=[...document.querySelectorAll('#bottomTabs [data-section]')];
      const visible=buttons.filter(button=>{const r=button.getBoundingClientRect();return r.right>n.left&&r.left<n.right;});
      return {viewport:[innerWidth,innerHeight],pageWidth:document.documentElement.scrollWidth,
        nav:{left:n.left,right:n.right,top:n.top,bottom:n.bottom,height:n.height},
        buttons:buttons.map(button=>{const r=button.getBoundingClientRect();return {code:button.dataset.section,width:r.width,height:r.height};}),
        visible:visible.length,position:getComputedStyle(nav).position};
    }""")
    width, height = geometry['viewport']
    assert geometry['position'] == 'fixed', geometry
    assert geometry['pageWidth'] <= width, geometry
    assert -1 <= geometry['nav']['left'] and geometry['nav']['right'] <= width + 1, geometry
    assert 0 <= geometry['nav']['top'] < geometry['nav']['bottom'] <= height + 1, geometry
    assert geometry['visible'] > 0, geometry
    assert all(button['width'] >= 43.5 and button['height'] >= 43.5
               for button in geometry['buttons']), geometry
    return geometry


def select_and_check(page, code, strip='#bottomTabs'):
    page.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)')
    button = reveal_phase(page, code, strip)
    button.click()
    assert_selected(page, code)
    expect(page.locator(f'{strip} [data-section="{code}"]')).to_be_focused()
    # Header collapse and its CSS transition may change the inset after a jump.
    page.wait_for_timeout(230)
    position = page.evaluate(r"""()=>{
      const item=[...document.querySelectorAll('#items [data-article]')].find(el=>!el.classList.contains('hiddenNt'));
      const r=item.getBoundingClientRect(),nav=document.getElementById('evalPhaseNav').getBoundingClientRect();
      return {itemTop:r.top,itemBottom:r.bottom,obstruction:window.__phaseNavigationTest.metrics().unobstructedTop,
        navTop:nav.top,scrollY,viewport:[innerWidth,innerHeight]};
    }""")
    position['phase'] = code
    if position['itemTop'] < position['obstruction'] - 2 or position['itemTop'] >= position['navTop']:
        page.screenshot(path=str(ARTIFACTS / 'failed-phase-jump.png'))
    assert position['itemTop'] >= position['obstruction'] - 2, position
    assert position['itemTop'] < position['navTop'], position
    return position


def main():
    checks, errors, external, screenshots, stop_measurements = [], [], [], [], []
    ARTIFACTS.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), headless=True)
        context = browser.new_context(service_workers='block', viewport={'width': 390, 'height': 844})
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
                body = source.replace(marker, '\n' + ADAPTER + marker, 1).encode()
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
        expect(page.locator('#evalPhaseNav')).not_to_be_visible()

        for tier in ('1', '2', '3', '4'):
            page.evaluate('(tier)=>window.__rapsTest.setup(tier)', tier)
            expected = page.evaluate('window.__phaseNavigationTest.expected()')
            for selector in PHASE_BARS:
                actual = page.locator(f'{selector} [data-section]').evaluate_all(
                    '(buttons)=>buttons.map(button=>({code:button.dataset.section,label:button.textContent.trim()}))')
                assert actual == expected, (tier, selector, actual, expected)
            course = page.locator('#evalPhaseCourse').inner_text()
            assert {'1': 'ASM', '2': 'CLS', '3': 'CMC', '4': 'CPP'}[tier] in course, course
            assert_geometry(page)
            order = page.evaluate("""()=>{
              const strip=document.getElementById('checklistBottomTabs');
              const next=document.getElementById('nextUnresolvedBottomBtn');
              return {before:!!(strip.compareDocumentPosition(next)&Node.DOCUMENT_POSITION_FOLLOWING),
                sameCloseout:!!strip.closest('.blockCloseout')&&strip.closest('.blockCloseout')===next.closest('.blockCloseout')};
            }""")
            assert order['before'] and order['sameCloseout'], order
            for strip in ('#bottomTabs', '#checklistBottomTabs'):
                for code in ('COMMS', 'DOC', 'EVAC'):
                    select_and_check(page, code, strip)
            checks.append(f'tier {tier}: all three phase rows match; checklist row precedes Next Unresolved; native COM / DOC / EVAC access')

        for width, height in ((320, 740), (390, 844), (844, 390), (1366, 900)):
            page.set_viewport_size({'width': width, 'height': height})
            page.evaluate("window.__rapsTest.setup('3');window.__rapsTest.allPassAndMet();window.__rapsTest.clearTimer('cmc_overall');window.__rapsTest.timer('cmc_overall','start')")
            before = page.evaluate('window.__rapsTest.state()')
            for code in ('C', 'COMMS', 'DOC', 'EVAC'):
                select_and_check(page, code)
                assert_geometry(page)
            after = page.evaluate('window.__rapsTest.state()')
            assert after['ratings'] == before['ratings']
            assert after['timers']['cmc_overall'] == before['timers']['cmc_overall']
            assert after['finalizedAt'] == before['finalizedAt']
            assert after['timers']['cmc_overall']['instances'][-1]['running']
            # A grading/status rerender must not reset a late phase to the strip's beginning.
            control = reveal_phase(page, 'EVAC')
            control.focus()
            scroll_left = page.locator('#bottomTabs').evaluate('(strip)=>strip.scrollLeft')
            page.evaluate('window.__rapsTest.render()')
            expect(page.locator('#bottomTabs [data-section="EVAC"]')).to_be_focused()
            assert abs(page.locator('#bottomTabs').evaluate('(strip)=>strip.scrollLeft') - scroll_left) <= 1
            assert_selected(page, 'EVAC')
            image = ARTIFACTS / f'phase-navigation-{width}x{height}.png'
            page.screenshot(path=str(image))
            screenshots.append(str(image))
            stop_geometry = page.locator('#activeTimers [data-active-timer-stop="cmc_overall"]').evaluate(r"""button=>{
              const r=button.getBoundingClientRect(),dock=document.getElementById('activeTimersCard').getBoundingClientRect();
              const header=document.getElementById('evalHeader').getBoundingClientRect(),nav=document.getElementById('evalPhaseNav').getBoundingClientRect();
              const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
              return {x,y,width:r.width,height:r.height,visibleHeight:Math.min(r.bottom,dock.bottom,nav.top,innerHeight)-Math.max(r.top,dock.top,header.bottom,0),
                hit:hit===button||button.contains(hit),dockHeight:dock.height};
            }""")
            assert stop_geometry['visibleHeight'] >= 43.5 and stop_geometry['hit'], (width, height, stop_geometry)
            stop_measurements.append({'viewport': [width, height], **stop_geometry})
            # A coordinate click cannot silently scroll a clipped STOP into view.
            page.mouse.click(stop_geometry['x'], stop_geometry['y'])
            assert not page.evaluate('window.__rapsTest.state().timers.cmc_overall.instances.at(-1).running')
            checks.append(f'{width}x{height}: pinned navigation, unobscured target, touch size, state/focus/strip stability with running timer')
            checks.append(f'{width}x{height}: active timer STOP is fully visible and accepts a pointer click')

        page.set_viewport_size({'width': 390, 'height': 844})
        page.evaluate("window.__rapsTest.setup('3');window.__rapsTest.allPassAndMet();window.__rapsTest.sealFixture()")
        sealed = page.evaluate('window.__rapsTest.state()')
        select_and_check(page, 'COMMS')
        assert all(button.is_disabled() for button in page.locator('#items [data-item]').all())
        assert page.locator('#bottomTabs [data-section]:disabled').count() == 0
        assert page.locator('#checklistBottomTabs [data-section]:disabled').count() == 0
        after = page.evaluate('window.__rapsTest.state()')
        assert after['ratings'] == sealed['ratings'] and after['timers'] == sealed['timers']
        assert after['finalizedAt'] == sealed['finalizedAt']
        checks.append('finalized assessments retain phase navigation while grading remains locked')

        page.locator('#reviewModeBtn').click()
        page.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)')
        footer = page.locator('#finalizeBtn').bounding_box()
        nav = page.locator('#evalPhaseNav').bounding_box()
        assert footer['y'] + footer['height'] <= nav['y'] + 1, (footer, nav)
        checks.append('reserved footer space keeps finalization controls above the fixed navigator')

        page.evaluate('window.__phaseNavigationTest.roster()')
        expect(page.locator('#evalPhaseNav')).not_to_be_visible()
        page.evaluate('window.__phaseNavigationTest.home()')
        expect(page.locator('#evalPhaseNav')).not_to_be_visible()
        checks.append('phase navigator is hidden on roster and home')
        assert not external, external
        assert not errors, errors
        assert page.evaluate('window.__cloudOperations.length') == 0
        browser.close()

    print(json.dumps({'checks': checks, 'screenshots': screenshots,
                      'active_stop_geometry': stop_measurements,
                      'page_errors': errors, 'external_requests': external}, indent=2))


if __name__ == '__main__':
    main()
