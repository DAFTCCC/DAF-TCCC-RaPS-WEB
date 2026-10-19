"""Exercise the real finalization-blocker cues using synthetic local attempts.

Run: python3 -B tests/browser-unresolved-navigation.py
All network requests are fulfilled from this checkout or blocked. The adapter
only prepares isolated assessment fixtures; user actions exercise the real UI.
No deployed accounts, classes, permissions, or grading data are accessed.
"""

import importlib.util
import json
import mimetypes
import os
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


SPEC = importlib.util.spec_from_file_location(
    'raps_browser_workflow', Path(__file__).with_name('browser-workflow.py'))
WORKFLOW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKFLOW)
ARTIFACTS = Path('/tmp/raps-unresolved-navigation')
ADAPTER = WORKFLOW.ADAPTER + r"""
window.__unresolvedNavigationTest = {
  prepare(kind='criteria') {
    window.__rapsTest.setup('3');window.__rapsTest.allPassAndMet();
    const t=tier(),st=evalState(),items=allItems(t),linkedIds=new Set(t.timers.map(d=>d.linkedItemId));
    const critical=items.filter(i=>i.critical&&!linkedIds.has(i.id));
    const regular=items.filter(i=>!i.critical&&!linkedIds.has(i.id));
    const blank=regular.find(i=>i.section==='COMMS')||regular.at(-1);
    const validFail=regular.find(i=>i.id!==blank.id);
    const global=t.timers.find(d=>d.section==='GLOBAL');
    const linked=t.timers.filter(d=>d.linkedItemId);
    const meta={blank:blank.id,blankSection:blank.section,criticalNt:critical[0].id,
      criticalFail:critical[1].id,criticalFailSection:critical[1].section,
      validFail:validFail.id,global:global.id,linked:linked[0].id,
      linkedItem:linked[0].linkedItemId,linkedSection:linked[0].section,
      active:linked[1].id,activeItem:linked[1].linkedItemId,activeSection:linked[1].section};
    st.observeMode=false;st.fieldMode=false;
    if(kind==='criteria'){
      delete st.ratings[blank.id];st.ratings[critical[0].id]='nt';
      st.ratings[critical[1].id]='fail';delete st.failureDetails[critical[1].id];
      st.ratings[validFail.id]='fail';
    }else if(kind==='timers'||kind==='global-only'){
      st.timers[global.id]={instances:[],currentIndex:-1};
      if(kind==='timers'){
        st.timers[linked[0].id]={instances:[],currentIndex:-1};
        st.timers[linked[1].id]={instances:[],currentIndex:-1};
        timerAction(linked[1].id,'start');
      }
    }else if(kind==='valid-fail'){
      st.ratings[critical[1].id]='fail';
      st.failureDetails[critical[1].id]={mode:'incorrect',modeLabel:'Incorrect',
        contributor:'skill-execution',contributorLabel:'Skill / Execution',classifiedAt:now()};
      st.ratings[validFail.id]='nt';
      st.ntReasons[validFail.id]={code:'scenario',label:'Scenario did not trigger criterion'};
      st.observations[blank.id]={reviewNeeded:true,tags:['prompted'],observedAt:now()};
    }else if(kind==='global-notmet'){
      const x=st.timers[global.id].instances[0];
      x.finalDurationMs=(global.seconds+1)*1000;
      x.wallStart=now()-x.finalDurationMs-1000;x.wallStop=now()-1000;x.result='notmet';
    }
    saveDb();renderEval();return meta;
  },
  metrics:()=>evaluationStickyMetrics(),
};
"""


def review(page):
    page.locator('#finalizeBtn').click()
    expect(page.locator('#reportModal')).to_have_class(re.compile(r'\bopen\b'))


def jump(page, key):
    page.locator(f'[data-finalization-jump="{key}"]').click()
    expect(page.locator('#reportModal')).not_to_have_class(re.compile(r'\bopen\b'))
    page.wait_for_timeout(230)


def assert_target_visible(page, target):
    geometry = target.evaluate("""target=>{
      const r=target.getBoundingClientRect(),nav=document.getElementById('evalPhaseNav').getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,obstruction:window.__unresolvedNavigationTest.metrics().unobstructedTop,
        navTop:nav.top};
    }""")
    assert geometry['top'] >= geometry['obstruction'] - 2, geometry
    assert geometry['top'] < geometry['navTop'], geometry


def assert_red(page, target, color_property):
    color = target.evaluate('(target,property)=>getComputedStyle(target)[property]', color_property)
    channels = [int(channel) for channel in re.findall(r'\d+', color)[:3]]
    assert len(channels) == 3 and channels[0] > channels[1] * 1.3 and channels[0] > channels[2] * 1.3, color


def assert_active_phase_visible(page):
    for strip in ('#checklistBottomTabs', '#bottomTabs'):
        bounds = page.locator(strip).evaluate("""bar=>{
          const active=bar.querySelector('[aria-pressed="true"]'),b=bar.getBoundingClientRect(),a=active.getBoundingClientRect();
          return {barLeft:b.left,barRight:b.right,activeLeft:a.left,activeRight:a.right};
        }""")
        assert bounds['barLeft'] - 1 <= bounds['activeLeft'], (strip, bounds)
        assert bounds['activeRight'] <= bounds['barRight'] + 1, (strip, bounds)


def main():
    checks, errors, external, screenshots = [], [], [], []
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

        # Assertions below intentionally use visible labels and real pointer
        # actions, in addition to fixture state, to catch unusable jump targets.
        meta = page.evaluate("window.__unresolvedNavigationTest.prepare('criteria')")
        assert page.evaluate('window.__rapsTest.score().result') == 'INCOMPLETE'
        expect(page.locator('#evalView .resolutionFlag')).to_have_count(0)
        before = page.evaluate('window.__rapsTest.state()')
        review(page)
        expect(page.locator('#confirmFinalizeBtn')).to_be_disabled()
        expect(page.locator('#finalizationIssues')).to_contain_text('Finalization blocked')
        actual = page.locator('[data-finalization-jump]').evaluate_all(
            '(buttons)=>buttons.map(button=>button.dataset.finalizationJump)')
        assert set(actual) == {f'item:{meta[key]}' for key in ('blank', 'criticalNt', 'criticalFail')}, actual
        expect(page.locator(f'[data-finalization-jump="item:{meta["criticalNt"]}"]')).to_contain_text('cannot be NT')
        expect(page.locator(f'[data-finalization-jump="item:{meta["criticalFail"]}"]')).to_contain_text('failure mode and contributor')
        expect(page.locator(f'[data-finalization-jump="item:{meta["validFail"]}"]')).to_have_count(0)
        assert page.evaluate('window.__rapsTest.state().ratings') == before['ratings']
        for strip in ('#tabs', '#checklistBottomTabs', '#bottomTabs'):
            phase = page.locator(f'{strip} [data-section="{meta["blankSection"]}"]')
            expect(phase).to_have_class(re.compile(r'\bneedsResolution\b'))
            expect(phase).to_have_attribute('data-finalization-count', '1')
            expect(phase).to_have_attribute('aria-label', re.compile('1 unresolved location'))
            expect(phase.locator('.resolutionFlag')).to_have_text('! 1')
            assert_red(page, phase, 'backgroundColor')
        checks.append('blocked review identifies exact blank / critical NT / critical classification locations in all three phase rows without changing grades')

        jump(page, f'item:{meta["blank"]}')
        assert_active_phase_visible(page)
        article = page.locator(f'[data-article="{meta["blank"]}"]')
        expect(article).to_have_class(re.compile(r'\bneedsResolution\b'))
        expect(article.locator('[data-finalization-item]')).to_contain_text('Unresolved: Needs a grade')
        assert_red(page, article, 'borderInlineStartColor')
        assert_target_visible(page, article)
        screenshot = ARTIFACTS / 'highlighted-criterion-mobile.png'
        page.screenshot(path=str(screenshot))
        screenshots.append(str(screenshot))
        page.evaluate('window.__rapsTest.render()')
        assert_active_phase_visible(page)
        page.locator('#nextUnresolvedBottomBtn').scroll_into_view_if_needed()
        screenshot = ARTIFACTS / 'inline-phase-row-unresolved-mobile.png'
        page.screenshot(path=str(screenshot))
        screenshots.append(str(screenshot))
        page.evaluate("document.documentElement.dataset.fieldDisplay='daylight'")
        for strip in ('#tabs', '#checklistBottomTabs', '#bottomTabs'):
            assert_red(page, page.locator(f'{strip} [data-section="{meta["blankSection"]}"]'), 'backgroundColor')
        assert_red(page, article, 'borderInlineStartColor')
        screenshot = ARTIFACTS / 'inline-phase-row-unresolved-daylight.png'
        page.screenshot(path=str(screenshot))
        screenshots.append(str(screenshot))
        page.evaluate("document.documentElement.dataset.fieldDisplay='dark'")
        article.locator('[data-rating="pass"]').click()
        expect(page.locator(f'[data-finalization-item="{meta["blank"]}"]')).to_have_count(0)
        for strip in ('#tabs', '#checklistBottomTabs', '#bottomTabs'):
            expect(page.locator(f'{strip} [data-section="{meta["blankSection"]}"]')).not_to_have_class(re.compile(r'\bneedsResolution\b'))
        page.locator('#nextUnresolvedBottomBtn').scroll_into_view_if_needed()
        screenshot = ARTIFACTS / 'inline-phase-row-mobile.png'
        page.screenshot(path=str(screenshot))
        screenshots.append(str(screenshot))
        checks.append('modal location jumps to a readable red criterion; correcting its grade clears that criterion and every phase marker')

        review(page)
        jump(page, f'item:{meta["criticalNt"]}')
        page.locator(f'[data-article="{meta["criticalNt"]}"] [data-rating="pass"]').click()
        review(page)
        jump(page, f'item:{meta["criticalFail"]}')
        critical = page.locator(f'[data-article="{meta["criticalFail"]}"]')
        expect(critical.locator('[data-finalization-item]')).to_contain_text('failure mode and contributor')
        critical.locator('[data-failure]').first.click()
        page.locator('#failureMode').select_option('incorrect')
        page.locator('#failureContributor').select_option('skill-execution')
        page.locator('#failureReasonForm button[type="submit"]').click()
        expect(page.locator('#evalView .resolutionFlag')).to_have_count(0)
        assert page.evaluate('window.__rapsTest.state().ratings')[meta['criticalFail']] == 'fail'
        assert page.evaluate('window.__rapsTest.score().result') == 'FAIL'
        review(page)
        expect(page.locator('#finalizationIssues')).not_to_be_visible()
        expect(page.locator('#confirmFinalizeBtn')).to_be_enabled()
        expect(page.locator('#confirmFinalizeBtn')).to_have_text('Finalize FAIL')
        page.locator('[data-close="reportModal"]').click()
        checks.append('critical NT and missing failure details clear through real controls; classified FAIL stays FAIL and becomes finalizable')

        meta = page.evaluate("window.__unresolvedNavigationTest.prepare('timers')")
        review(page)
        actual = page.locator('[data-finalization-jump]').evaluate_all(
            '(buttons)=>buttons.map(button=>button.dataset.finalizationJump)')
        expected = {f'timer:{meta[key]}' for key in ('global', 'linked', 'active')}
        expected.update(f'item:{meta[key]}' for key in ('linkedItem', 'activeItem'))
        assert set(actual) == expected and len(actual) == len(expected), actual
        expect(page.locator('#unresolvedTop')).to_have_text(str(len(expected)))
        expect(page.locator(f'[data-finalization-jump="timer:{meta["global"]}"]')).to_contain_text('Complete overall timing evidence')
        expect(page.locator(f'[data-finalization-jump="timer:{meta["active"]}"]')).to_contain_text('active or paused timer')
        jump(page, f'timer:{meta["linked"]}')
        timer = page.locator('#evalView .toolCard:focus-within')
        if timer.count() != 1:
            page.screenshot(path=str(ARTIFACTS / 'failed-timer-jump.png'))
            raise AssertionError(page.evaluate("""()=>({active:document.activeElement.outerHTML,scrollY,
              targets:[...document.querySelectorAll('[data-finalization-timer]')].map(flag=>({id:flag.dataset.finalizationTimer,
                rect:flag.parentElement.getBoundingClientRect().toJSON(),inert:!!flag.closest('[inert]')}))})"""))
        expect(timer).to_have_class(re.compile(r'\bneedsResolution\b'))
        expect(timer.locator(f'[data-finalization-timer="{meta["linked"]}"]')).to_have_count(1)
        expect(timer).to_contain_text('Unresolved: Resolve required timing evidence')
        assert_red(page, timer, 'borderInlineStartColor')
        assert_target_visible(page, timer)
        expect(page.locator(f'[data-finalization-item="{meta["linkedItem"]}"]')).to_contain_text('PASS requires')
        expect(page.locator('#blockCloseoutHint')).to_contain_text('highlighted locations')
        review(page)
        jump(page, f'timer:{meta["global"]}')
        overall = page.locator('#evalView .toolCard:focus-within')
        expect(overall).to_have_class(re.compile(r'\bneedsResolution\b'))
        expect(overall.locator(f'[data-finalization-timer="{meta["global"]}"]')).to_have_count(1)
        assert_target_visible(page, overall)
        page.evaluate("document.documentElement.dataset.fieldDisplay='daylight'")
        assert_red(page, overall, 'borderInlineStartColor')
        page.evaluate("document.documentElement.dataset.fieldDisplay='dark'")
        screenshot = ARTIFACTS / 'highlighted-overall-timer-mobile.png'
        page.screenshot(path=str(screenshot))
        screenshots.append(str(screenshot))
        checks.append('missing linked evidence, running timer and incomplete overall timer identify both criterion / timer targets with deduplicated location counts')
        checks.append('red phase, criterion and timer location cues remain red in both dark and daylight displays')

        # Refreshing evidence must also clear stale timer and linked-item cues.
        page.evaluate('window.__rapsTest.allPassAndMet()')
        expect(page.locator('#evalView .resolutionFlag')).to_have_count(0)
        checks.append('fresh valid timing evidence clears all previously highlighted timer and linked-criterion locations')

        meta = page.evaluate("window.__unresolvedNavigationTest.prepare('global-only')")
        review(page)
        expect(page.locator('[data-finalization-jump]')).to_have_count(1)
        page.locator('[data-close="reportModal"]').click()
        page.locator('#nextUnresolvedBottomBtn').click()
        page.wait_for_timeout(230)
        overall = page.locator('#evalView .toolCard:focus-within')
        expect(overall.locator(f'[data-finalization-timer="{meta["global"]}"]')).to_have_count(1)
        assert_target_visible(page, overall)
        overall.locator('[data-act="start"]').click()
        overall = page.locator(f'#globalTimer .toolCard')
        overall.locator('[data-act="stop"]').click()
        expect(page.locator('#evalView .resolutionFlag')).to_have_count(0)
        assert page.evaluate('window.__rapsTest.score().result') == 'PASS'
        expect(page.locator('#blockCloseoutHint')).to_contain_text('All finalization requirements are resolved')
        screenshot = ARTIFACTS / 'resolved-assessment-mobile.png'
        page.screenshot(path=str(screenshot))
        screenshots.append(str(screenshot))
        checks.append('Next Unresolved reaches the sole overall timer blocker; real START / STOP resolves it and clears all red cues')

        for scenario in ('valid-fail', 'global-notmet'):
            page.evaluate('(scenario)=>window.__unresolvedNavigationTest.prepare(scenario)', scenario)
            assert page.evaluate('window.__rapsTest.score().result') == 'FAIL'
            review(page)
            expect(page.locator('#finalizationIssues')).not_to_be_visible()
            expect(page.locator('#evalView .resolutionFlag')).to_have_count(0)
            expect(page.locator('#confirmFinalizeBtn')).to_be_enabled()
            expect(page.locator('#confirmFinalizeBtn')).to_have_text('Finalize FAIL')
            page.locator('[data-close="reportModal"]').click()
        checks.append('complete FAIL / permitted noncritical NT / optional diagnostic review and completed global NOT MET are not mislabeled as unresolved')

        page.evaluate("window.__rapsTest.setup('3');window.__rapsTest.allPassAndMet();window.__rapsTest.sealFixture()")
        for strip in ('#checklistBottomTabs', '#bottomTabs'):
            control = page.locator(f'{strip} [data-section="COMMS"]')
            control.evaluate('(button)=>button.scrollIntoView({block:"center",inline:"center"})')
            control.click()
            assert page.evaluate('window.__rapsTest.state().section') == 'COMMS'
            assert all(button.is_disabled() for button in page.locator('#items [data-item]').all())
        expect(page.locator('#finalizeBtn')).to_be_disabled()
        expect(page.locator('#evalView .resolutionFlag')).to_have_count(0)
        checks.append('finalized attempts retain both lower navigation rows while grading / finalization remain locked')

        assert not external, external
        assert not errors, errors
        assert page.evaluate('window.__cloudOperations.length') == 0
        browser.close()

    print(json.dumps({'checks': checks, 'screenshots': screenshots,
                      'page_errors': errors, 'external_requests': external}, indent=2))


if __name__ == '__main__':
    main()
