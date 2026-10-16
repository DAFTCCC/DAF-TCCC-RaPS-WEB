"""Exercise the real evaluator UI with isolated fixtures and no external network.

Run: python tests/browser-workflow.py
Requires Python Playwright and Chromium (or set CHROMIUM_EXECUTABLE).
All assets are fulfilled from this checkout in memory. Cloud/auth scripts are
omitted from this test page, and no production authentication or writes occur.
The fixture adapter is injected into the served script, never into app.js.
"""

import base64
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import subprocess
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://127.0.0.1:8765'
SCRIPTS = {'version.js', 'tiers.js', 'branding.js', 'installations.js', 'app.js'}
ADAPTER = r"""
window.__rapsTest = {
  setup(tierId='1') {
    const c={id:'test-class',name:'Simulator Class',tierId,tierSnapshot:deep(TIERS[tierId]),
      status:'active',scenario:'Isolated training test',scenarioVersion:'1',scenarioNT:[],
      students:[],leadEvaluator:'Test Evaluator',cloudSync:{enabled:false},
      date:'2026-10-15',roster:'TEST'};
    const s={id:'test-student',name:'Synthetic Learner',rank:'Sgt',trainingId:'TEST-ONLY',attempts:{}};
    c.students.push(s);
    db={schemaVersion:5,deviceId:'test-device',classes:[c]};
    currentClassId=c.id;currentStudentId=s.id;currentAttemptNo=1;
    s.attempts['1']=makeAttempt(c,s,1);
    saveDb();showView('evalView');renderEval();
  },
  resume() {
    currentClassId='test-class';currentStudentId='test-student';currentAttemptNo=1;
    showView('evalView');renderEval();
  },
  state:()=>deep(evalState()),
  stored:()=>JSON.parse(localStorage.getItem(DB_KEY)),
  score:()=>deep(proficiency()),
  exportResult:()=>deep(proficiencyFor(tier(),evalState())),
  review:()=>buildReviewText(),
  timer:(id,action)=>timerAction(id,action),
  render:()=>renderEval(),
  showItem(id){evalState().section=itemById(id).section;renderEval();},
  allPassAndMet() {
    const st=evalState(),t=tier();
    for(const i of allItems(t))st.ratings[i.id]='pass';
    for(const d of t.timers){
      const duration=(d.mode==='range'?d.minSeconds:d.seconds)*1000;
      const x={...blankInstance(d.id,0),wallStart:now()-duration-1000,
        wallStop:now()-1000,finalDurationMs:duration,result:'met',runtimeId:RUNTIME_ID};
      st.timers[d.id]={instances:[x],currentIndex:0};
    }
    saveDb();renderEval();
  },
  clearTimer(id){evalState().timers[id]={instances:[],currentIndex:-1};saveDb();renderEval();},
  sealFixture(){const st=evalState();st.finalizedAt=now();st.finalResult='FAIL';saveDb();renderEval();},
  forceQuotaFailure(){
    window.__originalStorageSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key===DB_KEY)throw new DOMException('Synthetic storage quota failure','QuotaExceededError');
      return window.__originalStorageSetItem.call(this,key,value);
    };
  },
  restoreStorage(){Storage.prototype.setItem=window.__originalStorageSetItem;},
  coachingPdfStress(){
    const st=evalState(),t=tier(),items=allItems(t).slice(0,9);
    for(const i of items){
      st.ratings[i.id]='fail';
      st.failureDetails[i.id]={mode:'incorrect',modeLabel:'Incorrect',contributor:'skill-execution',
        contributorLabel:'Skill / Execution',confidence:'uncertain',
        comment:`EVIDENCE_ITEM_${i.id}\n`+'The observed synthetic task endpoint was incomplete; verify the cue and technique. '.repeat(5),
        learnerExplanation:'I noticed the scenario cue but could not consistently perform the approved technique.',
        practicePlan:'Practice the approved skill in isolation with specific feedback, then integrate it into a new scenario.',
        reassessmentPlan:'Demonstrate the unchanged approved criterion independently under comparable conditions.',
        reassessmentOutcome:'not-assessed',retentionDueAt:new Date('2026-11-15T10:00:00Z').getTime(),
        classifiedAt:now(),at:now()};
      st.observations[i.id]={tags:['prompted'],reviewNeeded:false,observedAt:now(),recordedAt:now()};
    }
    st.overallNotes=Array.from({length:70},(_,n)=>`Evaluator note segment ${n+1}: keep the recorded evidence separate from contributor hypotheses.`).join(' ')+'\nLAST_COACHING_EVIDENCE_VERIFIED';
    const pages=buildCoachingDetailPages(t,st,student().name);
    const text=pages.flatMap(ops=>ops.filter(op=>op.type==='text').map(op=>op.text));
    return {base64:bytesToBase64(buildIndividualSummaryPdf()),pages:1+pages.length,
      completeMarkers:items.every(i=>text.some(line=>line.includes(`EVIDENCE_ITEM_${i.id}`))),
      finalMarker:text.at(-1),pageTextWithinBounds:pages.every(ops=>ops.filter(op=>op.type==='text').every(op=>op.y>=48&&op.y<=760))};
  },
};
"""


def test_html():
    html = (ROOT / 'index.html').read_text()

    def keep_script(match):
        return match.group(0) if urlsplit(match.group(1)).path.rsplit('/', 1)[-1] in SCRIPTS else ''

    return re.sub(r'<script\s+src="([^"]+)"[^>]*></script>', keep_script, html)


def main():
    checks = []
    external_requests = []
    errors = []
    dialogs = []
    artifacts = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'),
            headless=True,
        )
        context = browser.new_context(service_workers='block', viewport={'width': 1366, 'height': 900})
        context.add_init_script("""
          window.RAPS_CLOUD={user:{id:'test-evaluator'},role:'evaluator',
            client:{rpc:async()=>{throw new Error('No cloud operations allowed in isolated UI test');}}};
        """)

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
                body = test_html().encode()
            elif relative == 'app.js':
                source = target.read_text()
                marker = '\nrenderHome();\n})();'
                assert source.count(marker) == 1, 'Main application fixture insertion point changed'
                body = source.replace(marker, '\n' + ADAPTER + marker, 1).encode()
            else:
                body = target.read_bytes()
            route.fulfill(status=200, body=body,
                          content_type=mimetypes.guess_type(str(target))[0] or 'application/octet-stream')

        context.route('**/*', fulfill)
        page = context.new_page()
        page.set_default_timeout(7000)
        page.on('pageerror', lambda error: errors.append(str(error)))

        def dismiss_dialog(dialog):
            dialogs.append(dialog.message)
            dialog.dismiss()

        page.on('dialog', dismiss_dialog)
        page.goto(ORIGIN + '/', wait_until='networkidle')
        page.wait_for_function('!!window.__rapsTest')
        page.locator('#safetyAck').check()
        page.locator('#safetyEnterBtn').click()
        page.evaluate('window.__rapsTest.setup()')
        expect(page.locator('#studentLabel')).to_contain_text('Synthetic Learner')
        expect(page.locator('#attemptBadge')).to_contain_text('Attempt 1')
        checks.append('isolated evaluator fixture starts with learner and attempt visible')

        # A failure must be saved before any classification form is completed.
        page.locator('[data-item="ASM-004"][data-rating="fail"]').click()
        state = page.evaluate('window.__rapsTest.state()')
        assert state['ratings']['ASM-004'] == 'fail'
        assert state['stamps']['ASM-004'] > 0
        expect(page.locator('#formModal')).not_to_have_class(re.compile(r'\bopen\b'))
        stored = page.evaluate('window.__rapsTest.stored()')
        assert stored['classes'][0]['students'][0]['attempts']['1']['ratings']['ASM-004'] == 'fail'
        checks.append('critical FAIL persists immediately without opening classification form')

        page.locator('#undoObservationBtn').click()
        state = page.evaluate('window.__rapsTest.state()')
        assert 'ASM-004' not in state['ratings']
        assert any('undo' in (event['label'] + ' ' + event.get('detail', '')).lower()
                   for event in state['events'])
        checks.append('undo restores prior grade and retains an audit event')

        page.locator('[data-mark-observation="ASM-001"]').click()
        page.locator('#reviewModeBtn').click()
        page.locator('[data-observation-item="ASM-001"][data-observation-tag="not-observed"]').click()
        state = page.evaluate('window.__rapsTest.state()')
        assert 'ASM-001' not in state['ratings'], 'A diagnostic marker must not grade or assign NT'
        assert state['observations']['ASM-001']['reviewNeeded']
        assert 'not-observed' in state['observations']['ASM-001']['tags']
        page.locator('[data-observation-item="ASM-001"][data-observation-tag="independent"]').click()
        state = page.evaluate('window.__rapsTest.state()')
        assert 'independent' in state['observations']['ASM-001']['tags']
        assert 'not-observed' not in state['observations']['ASM-001']['tags']
        page.locator('[data-observation-item="ASM-001"][data-observation-tag="prompted"]').click()
        state = page.evaluate('window.__rapsTest.state()')
        assert 'prompted' in state['observations']['ASM-001']['tags']
        assert 'independent' not in state['observations']['ASM-001']['tags']
        assert 'ASM-001' not in state['ratings']
        checks.append('review/assistance/unobserved markers leave grading untouched and contradictory independence tags are excluded')

        page.locator('#observeModeBtn').click()
        page.locator('[data-mark-observation="ASM-004"]').click()
        marked_at = page.evaluate('window.__rapsTest.state().observations["ASM-004"].observedAt')
        page.wait_for_timeout(100)
        page.locator('[data-item="ASM-004"][data-rating="fail"]').click()
        grade_stamp = page.evaluate('window.__rapsTest.state().stamps["ASM-004"]')
        state = page.evaluate('window.__rapsTest.state()')
        assert state['observations']['ASM-004']['observedAt'] == marked_at
        assert state['observations']['ASM-004']['recordedAt'] == grade_stamp
        assert grade_stamp > marked_at
        checks.append('a moment marked before grading retains its original observation time and later recording time')
        page.wait_for_timeout(100)
        page.locator('#reviewModeBtn').click()
        expect(page.locator('#diagnosticReviewQueue')).to_be_visible()
        page.locator('[data-failure="ASM-004"]').first.click()
        page.locator('#failureMode').select_option('incorrect')
        page.locator('#failureContributor').select_option('skill-execution')
        page.locator('[name="additionalContributor"][value="environment-system"]').check()
        page.locator('#failureComment').fill('Observed incomplete task endpoint in this synthetic assessment.')
        page.locator('#failureLearnerExplanation').fill('I noticed the cue but had difficulty executing the technique.')
        page.locator('#failureConfidence').select_option('uncertain')
        page.locator('#failurePracticePlan').fill('Demonstrate the approved task in isolation, then in an integrated scenario.')
        page.locator('#failureReassessmentPlan').fill('Repeat independently against the unchanged approved criterion.')
        page.locator('#failureReassessmentOutcome').select_option('not-assessed')
        page.locator('#failureRetentionDueAt').fill('2026-11-15T10:00')
        page.locator('#failureReasonForm button[type="submit"]').click()
        state = page.evaluate('window.__rapsTest.state()')
        assert state['ratings']['ASM-004'] == 'fail'
        assert state['failureDetails']['ASM-004']['mode'] == 'incorrect'
        assert state['failureDetails']['ASM-004']['contributor'] == 'skill-execution'
        assert state['failureDetails']['ASM-004']['additionalContributors'] == ['environment-system']
        assert state['stamps']['ASM-004'] == grade_stamp, 'Later explanation must not change the grade timestamp'
        assert state['observations']['ASM-004']['observedAt'] == marked_at
        assert state['failureDetails']['ASM-004']['classifiedAt'] > grade_stamp
        assert state['failureDetails']['ASM-004']['learnerExplanation'].startswith('I noticed the cue')
        assert state['failureDetails']['ASM-004']['practicePlan'].startswith('Demonstrate the approved')
        assert 'Observed incomplete task endpoint' in page.evaluate('window.__rapsTest.review()')
        checks.append('critical failure review preserves grade and carries actual observation into debrief')

        page.reload(wait_until='networkidle')
        page.wait_for_function('!!window.__rapsTest')
        if page.locator('#safetyAck').is_visible():
            page.locator('#safetyAck').check()
            page.locator('#safetyEnterBtn').click()
        page.evaluate('window.__rapsTest.resume()')
        state = page.evaluate('window.__rapsTest.state()')
        assert state['failureDetails']['ASM-004']['comment'].startswith('Observed incomplete')
        assert state['failureDetails']['ASM-004']['confidence'] == 'uncertain'
        assert state['failureDetails']['ASM-004']['additionalContributors'] == ['environment-system']
        assert state['failureDetails']['ASM-004']['learnerExplanation'].startswith('I noticed the cue')
        assert state['failureDetails']['ASM-004']['practicePlan'].startswith('Demonstrate the approved')
        assert state['failureDetails']['ASM-004']['reassessmentPlan'].startswith('Repeat independently')
        assert state['failureDetails']['ASM-004']['retentionDueAt'] > 0
        assert state['observations']['ASM-001']['tags'] == ['prompted']
        checks.append('rich diagnostic record, assistance, and follow-up survive a real page reload')

        page.set_viewport_size({'width': 390, 'height': 900})
        page.locator('#observeModeBtn').click()
        page.evaluate('window.scrollTo(0,0)')
        expect(page.locator('#gradedTop')).not_to_be_visible()
        assert page.locator('#tabs').bounding_box()['y'] < 700, 'The phone view should reach the phase tabs without both timers filling the screen'
        for selector in ['#globalTimer [data-act="start"]', '#globalTimer [data-act="stop"]',
                         '#quickCufTimer [data-act="start"]', '#quickCufTimer [data-act="stop"]']:
            assert page.locator(selector).bounding_box()['height'] >= 44, selector
        observe_image = Path('/tmp/raps-evaluator-observe.png')
        page.screenshot(path=str(observe_image))
        artifacts.append(str(observe_image))
        page.set_viewport_size({'width': 1366, 'height': 900})
        page.locator('#reviewModeBtn').click()
        expect(page.locator('#gradedTop')).to_be_visible()
        page.locator('[data-failure="ASM-004"]').first.click()
        modal_image = Path('/tmp/raps-evaluator-review-modal.png')
        page.screenshot(path=str(modal_image))
        artifacts.append(str(modal_image))
        page.locator('#formModal [data-close="formModal"]').click()

        before_correction = page.evaluate('window.__rapsTest.state().failureDetails["ASM-004"]')
        page.locator('[data-item="ASM-004"][data-rating="pass"]').click()
        corrected = page.evaluate('window.__rapsTest.state()')
        corrected_stamp = corrected['stamps']['ASM-004']
        corrected_observed_at = corrected['observations']['ASM-004']['observedAt']
        page.locator('[data-failure="ASM-004"]').first.click()
        expect(page.locator('#failureMode')).to_have_count(0)
        page.locator('#failureReasonForm button[type="submit"]').click()
        corrected = page.evaluate('window.__rapsTest.state()')
        assert corrected['ratings']['ASM-004'] == 'pass'
        assert corrected['stamps']['ASM-004'] == corrected_stamp
        assert corrected['observations']['ASM-004']['observedAt'] == corrected_observed_at
        for key in ['mode', 'contributor', 'additionalContributors', 'comment', 'learnerExplanation', 'practicePlan', 'reassessmentPlan']:
            assert corrected['failureDetails']['ASM-004'][key] == before_correction[key], key
        checks.append('coaching edits after a FAIL-to-PASS correction preserve contributor history, notes, and grade timestamps')

        # Test the originally reproduced export defect with the real timing state.
        page.evaluate('window.__rapsTest.allPassAndMet()')
        assert page.evaluate('window.__rapsTest.score().result') == 'PASS'
        page.evaluate("window.__rapsTest.clearTimer('asm_overall')")
        assert page.evaluate('window.__rapsTest.score().result') == 'INCOMPLETE'
        export = page.evaluate('window.__rapsTest.exportResult()')
        assert export['result'] != 'PASS', export
        checks.append('unfinalized summary cannot report PASS when required global timing is absent')

        page.locator('#observeModeBtn').click()
        page.evaluate("window.__rapsTest.timer('asm_overall','start')")
        stop = page.locator('[data-active-timer-stop="asm_overall"]')
        expect(stop).to_be_visible()
        stop.focus()
        stop.evaluate('(node)=>{window.__stopNode=node;}')
        page.wait_for_timeout(700)
        assert page.evaluate('window.__stopNode.isConnected && document.activeElement===window.__stopNode')
        box = stop.bounding_box()
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.mouse.down()
        page.wait_for_timeout(500)
        page.mouse.up()
        assert not page.evaluate('window.__rapsTest.state().timers.asm_overall.instances.at(-1).running')
        checks.append('active STOP control survives refresh, retains focus, and accepts a press spanning refresh')

        for width in (390, 1366):
            page.set_viewport_size({'width': width, 'height': 900})
            page.evaluate('window.scrollTo(0,500)')
            page.wait_for_timeout(100)
            expect(page.locator('#studentLabel')).to_be_visible()
            expect(page.locator('#attemptBadge')).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), width
        checks.append('learner/attempt remain visible while scrolling at phone and desktop widths without horizontal overflow')

        page.set_viewport_size({'width': 1366, 'height': 900})
        page.evaluate('window.__rapsTest.sealFixture()')
        for selector in ['[data-item]', '[data-failure]', '[data-mark-observation]', '[data-observation-tag]']:
            assert page.locator('#evalView ' + selector).evaluate_all('(nodes)=>nodes.every(node=>node.disabled)'), selector
        before = page.evaluate('window.__rapsTest.state()')
        # A programmatic click must also be guarded even when UI editing is disabled.
        page.locator('[data-mark-observation="ASM-001"]').evaluate('(node)=>node.click()')
        page.locator('[data-item="ASM-001"][data-rating="fail"]').evaluate('(node)=>node.click()')
        assert page.evaluate('window.__rapsTest.state()') == before
        checks.append('finalized fixture is read-only for official grades and diagnostic observations')

        page.evaluate('window.__rapsTest.setup()')
        page.evaluate('window.__rapsTest.forceQuotaFailure()')
        page.locator('[data-item="ASM-001"][data-rating="pass"]').click()
        assert 'ASM-001' not in page.evaluate('window.__rapsTest.state().ratings'), 'Failed persistence must roll back the attempted grade'
        assert page.evaluate('!!window.rapsLocalSaveState.error')
        expect(page.locator('#localSaveStatus')).to_have_text('LOCAL SAVE FAILED')
        expect(page.locator('#observationFeedbackText')).to_contain_text('not saved')
        page.evaluate('window.__rapsTest.restoreStorage()')
        page.locator('[data-item="ASM-001"][data-rating="pass"]').click()
        assert page.evaluate('window.__rapsTest.state().ratings["ASM-001"]') == 'pass'
        expect(page.locator('#localSaveStatus')).to_have_text('Saved on this device')
        checks.append('quota failure reports an unsaved change, rolls it back, and recovers after storage returns')

        pdf = page.evaluate('window.__rapsTest.coachingPdfStress()')
        pdf_path = Path('/tmp/raps-coaching.pdf')
        pdf_path.write_bytes(base64.b64decode(pdf['base64']))
        assert pdf['completeMarkers'], 'All nine criteria must appear in coaching pages, including those beyond the summary top five'
        assert pdf['finalMarker'] == 'LAST_COACHING_EVIDENCE_VERIFIED', 'The complete evaluator note must reach the last page'
        assert pdf['pageTextWithinBounds'], 'Coaching text must stay inside page bounds'
        assert pdf['pages'] > 2, 'Rich observation fixture must exercise pagination'
        assert pdf_path.read_bytes().startswith(b'%PDF-1.4')
        artifacts.append(str(pdf_path))
        if shutil.which('pdfinfo'):
            info = subprocess.check_output(['pdfinfo', str(pdf_path)], text=True)
            pages = re.search(r'^Pages:\s+(\d+)', info, re.MULTILINE)
            assert pages and int(pages.group(1)) == pdf['pages'], info
        if shutil.which('pdftotext'):
            # Production PDFs are canvas JPEG pages, so pdftotext cannot verify
            # their text. Verify complete drawing operations above instead.
            subprocess.run(['pdftotext', str(pdf_path), '/tmp/raps-coaching-extracted.txt'], check=True)
        if shutil.which('pdftoppm'):
            subprocess.run(['pdftoppm', '-f', '2', '-singlefile', '-scale-to', '1400', '-png',
                            str(pdf_path), '/tmp/raps-coaching-page-2'], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            artifacts.append('/tmp/raps-coaching-page-2.png')
            subprocess.run(['pdftoppm', '-f', str(pdf['pages']), '-singlefile', '-scale-to', '1400', '-png',
                            str(pdf_path), '/tmp/raps-coaching-last-page'], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            artifacts.append('/tmp/raps-coaching-last-page.png')
        checks.append(f'actual {pdf["pages"]}-page PDF is valid and includes all nine coaching records and the end of long evaluator notes')

        page.evaluate("window.__rapsTest.setup('3')")
        page.evaluate("window.__rapsTest.showItem('CMC-014')")
        page.locator('[data-item="CMC-014"][data-rating="nt"]').click()
        page.locator('#ntReasonCode').select_option('scenario')
        page.locator('#ntReasonForm button[type="submit"]').click()
        assert page.evaluate('window.__rapsTest.state().ratings["CMC-014"]') == 'nt'
        page.locator('#reviewModeBtn').click()
        page.locator('#showNtToggle').check()
        page.locator('#observeModeBtn').click()
        page.locator('[data-item="CMC-014"][data-rating="pass"]').click()
        page.evaluate("window.__rapsTest.timer('cmc_wound_pressure','start')")
        page.locator('#undoObservationBtn').click()
        state = page.evaluate('window.__rapsTest.state()')
        assert state['ratings']['CMC-014'] == 'pass', 'Undo must not restore NT after a linked intervention starts'
        assert 'CMC-014' not in state['ntReasons']
        expect(page.locator('#observationFeedbackText')).to_contain_text('timing changed')
        checks.append('undo cannot restore a prior NT after its linked clinical timer starts')

        # Resizing a sticky header must not feed back into its own scroll
        # threshold. Exercise both the old boundary and an actual collapse,
        # using the real CSS transitions and normal browser scroll anchoring.
        page.evaluate("window.__rapsTest.setup('3')")
        page.locator('#reviewModeBtn').click()
        page.evaluate('''() => {
          window.__headerStates=[];
          window.__headerObserver=new MutationObserver(records => {
            for (const record of records) if (record.attributeName==='class')
              window.__headerStates.push({y:scrollY,collapsed:record.target.classList.contains('collapsed')});
          });
          window.__headerObserver.observe(document.getElementById('evalHeader'),{attributes:true});
        }''')
        for width in (390, 1366):
            page.set_viewport_size({'width': width, 'height': 900})
            page.evaluate('window.scrollTo(0,0)')
            page.wait_for_function("() => !document.getElementById('evalHeader').classList.contains('collapsed')")
            page.wait_for_function("() => document.getElementById('evalHeader').getAnimations().every(a => a.playState !== 'running')")
            for position in (160, 180):
                page.evaluate('(position) => {window.__headerStates=[];window.scrollTo(0,position)}', position)
                page.wait_for_timeout(800)
                states=page.evaluate('window.__headerStates')
                assert len(states)<=1, {'width':width,'position':position,'states':states}
            page.evaluate('''() => {
              window.__headerStates=[];
              window.scrollTo(0,document.getElementById('evalHeader').getBoundingClientRect().height+200);
            }''')
            page.wait_for_timeout(800)
            states=page.evaluate('window.__headerStates')
            assert len(states)<=1, {'width':width,'states':states}
            assert page.locator('#evalHeader').evaluate("node => node.classList.contains('collapsed')")
            page.evaluate('window.scrollTo(0,0)')
            page.wait_for_function("() => !document.getElementById('evalHeader').classList.contains('collapsed')")
        page.evaluate('window.__headerObserver.disconnect()')
        checks.append('review header remains stable across scroll anchoring at phone and desktop widths')

        assert not errors, errors
        assert not external_requests, external_requests
        assert not dialogs, dialogs
        browser.close()

    print(json.dumps({'checks_passed': len(checks), 'checks': checks,
                      'external_requests': len(external_requests), 'page_errors': len(errors),
                      'artifacts': artifacts}, indent=2))


if __name__ == '__main__':
    main()
