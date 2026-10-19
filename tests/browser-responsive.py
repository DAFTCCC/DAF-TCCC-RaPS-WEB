"""Audit real local UI geometry across devices, without authentication/network.

Run: python3 tests/browser-responsive.py [--audit] [--quick]
The audit report and representative screenshots are written to /tmp/raps-responsive.
"""

import importlib.util
import json
import mimetypes
import os
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright


SPEC = importlib.util.spec_from_file_location('raps_browser_workflow', Path(__file__).with_name('browser-workflow.py'))
WORKFLOW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WORKFLOW)
ROOT = WORKFLOW.ROOT
ARTIFACTS = Path('/tmp/raps-responsive')
ARTIFACTS.mkdir(exist_ok=True)
ADAPTER = WORKFLOW.ADAPTER + r"""
window.__responsive = {
  setup(scene) {
    window.__rapsTest.setup('3');
    const c=cls(),s=student();
    c.name='Expeditionary Tactical Trauma Sustainment Assessment — Joint Training Squadron Alpha';
    c.scenario='Extended field assessment with multiple casualties and limited equipment';
    c.leadEvaluator='Senior Evaluator Alexandria Montgomery';
    s.name='Alexandria Montgomery-Washington';s.rank='TSgt';
    s.trainingId='SYNTHETIC-LEARNER-IDENTIFIER-000001';
    c.students.push({...deep(s),id:'test-student-2',name:'Christopher-Jonathan Santiago Rodriguez',attempts:{}});
    renderEval();
    if(scene==='home'){showHome();setHomeArea('evaluate');}
    if(scene==='manage'){window.__setRapsFixtureRole('enterprise_admin');showHome();setHomeArea('manage');}
    if(scene==='readiness'||scene==='program'){
      window.__rapsTest.allPassAndMet();
      const st=evalState();st.finalizedAt=now();st.finalResult='FAIL';st.ratings['CMC-001']='fail';
      st.failureDetails['CMC-001']={mode:'incorrect',contributor:'skill-execution',comment:'Synthetic observable task endpoint.',confidence:'possible'};
      c.students[1].attempts['1']={...deep(st),id:'test-attempt-2',finalResult:'PASS',ratings:{...st.ratings,'CMC-001':'pass'}};
      showHome();setHomeArea(scene);
    }
    if(scene==='class'){openClass(c.id);}
    if(scene==='review'||scene==='modal'){
      evalState().ratings['CMC-001']='fail';evalState().stamps['CMC-001']=now();
      evalState().evaluatorMode='review';renderEval();
      document.getElementById('reviewModeBtn').click();
      if(scene==='modal')requestFailureClassification('CMC-001');
    }
    if(scene==='observe-running'){
      timerAction('cmc_overall','start');
      renderEval();
    }
    window.scrollTo(0,0);
  },
  enlargeText() {
    // Emulate a user text-size setting rather than shrinking the visual
    // viewport. Snapshot first so inherited sizes are multiplied only once.
    const nodes=[...document.querySelectorAll('body *')];
    const sizes=nodes.map(e=>[e,parseFloat(getComputedStyle(e).fontSize),getComputedStyle(e).lineHeight]);
    sizes.forEach(([e,size,line])=>{e.style.setProperty('font-size',(size*2)+'px','important');if(line!=='normal')e.style.setProperty('line-height',(parseFloat(line)*2)+'px','important');e.dataset.responsiveTextScale='2';});
  },
  clearTextSize() {
    document.querySelectorAll('[data-responsive-text-scale]').forEach(e=>{e.style.removeProperty('font-size');e.style.removeProperty('line-height');delete e.dataset.responsiveTextScale;});
  }
};
"""

MEASURE = r"""() => {
  const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
  const path=e=>e.id?'#'+e.id:e.tagName.toLowerCase()+[...e.classList].map(x=>'.'+x).join('');
  const modal=document.querySelector('.modal.open');
  const content=modal?[modal]:[...document.querySelectorAll('.view:not(.hidden)')];
  const controls=content.flatMap(root=>[...root.querySelectorAll('button,input:not([type=checkbox]):not([type=radio]),select,textarea,label:has(input[type=checkbox]),label:has(input[type=radio])')]).filter(visible);
  const smallTargets=controls.filter(e=>!e.disabled).map(e=>({selector:path(e),text:e.innerText||e.getAttribute('aria-label')||e.type,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).filter(x=>x.width<43.5||x.height<43.5);
  const clippedControls=controls.filter(e=>e.tagName==='BUTTON'&&(e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2)).map(e=>({selector:path(e),text:e.innerText,scroll:[e.scrollWidth,e.scrollHeight],client:[e.clientWidth,e.clientHeight]}));
  const clippedContainers=content.flatMap(root=>[...root.querySelectorAll('.sheet,.card,.classRow,.rosterRow,.metaCell')]).filter(visible).filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>({selector:path(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}));
  const clippedOperationalText=content.flatMap(root=>[...root.querySelectorAll('.timerDisplay,.activeTimerElapsed,.kpis strong,#attemptBadge')]).filter(visible).filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>({selector:path(e),text:e.innerText,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}));
  const overflow=[...document.querySelectorAll('body *')].filter(e=>visible(e)&&!e.closest('.hidden')&&e.getBoundingClientRect().right>innerWidth+1).map(e=>({selector:path(e),right:Math.round(e.getBoundingClientRect().right),text:e.innerText?.slice(0,70)})).slice(0,15);
  const fonts=Object.fromEntries(['.itemText','.rowTitle','#studentLabel','.formGrid label','.choice','.modeSegment','.helper'].map(selector=>{const e=[...document.querySelectorAll(selector)].find(visible);return[selector,e?parseFloat(getComputedStyle(e).fontSize):null];}));
  const bodyFont=getComputedStyle(document.body).fontFamily;
  const inconsistentFonts=controls.filter(e=>getComputedStyle(e).fontFamily!==bodyFont).map(path);
  const editableFonts=controls.filter(e=>e.matches('input,select,textarea')).map(e=>({selector:path(e),size:parseFloat(getComputedStyle(e).fontSize)}));
  const rgbColors=value=>[...value.matchAll(/rgba?\(([^)]+)\)/g)].map(match=>match[1].split(/[,\s/]+/).filter(Boolean).slice(0,3).map(Number));
  const luminance=rgb=>rgb.map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const contrastElements=[...controls.filter(e=>!e.disabled&&e.matches('.action.primary,.tab.active,.timerBtn.start,.timerBtn.stop')),...content.flatMap(root=>[...root.querySelectorAll('.crit')]).filter(visible)];
  const primaryContrast=contrastElements.map(e=>{
    const css=getComputedStyle(e),foreground=rgbColors(css.color)[0],backgrounds=rgbColors(css.backgroundImage==='none'?css.backgroundColor:css.backgroundImage);
    const ratios=backgrounds.map(background=>{const a=luminance(foreground),b=luminance(background);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
    return {selector:path(e),minimumRatio:ratios.length?Math.min(...ratios):0};
  });
  const misalignedFormRows=[];
  document.querySelectorAll('.formGrid').forEach(grid=>{
    const labels=[...grid.children].filter(e=>e.matches('label')&&!e.classList.contains('full')&&visible(e));
    for(let i=1;i<labels.length;i++){
      const a=labels[i-1],b=labels[i],ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();
      const ac=a.querySelector('input:not([type=checkbox]),select,textarea'),bc=b.querySelector('input:not([type=checkbox]),select,textarea');
      if(ac&&bc&&Math.abs(ar.top-br.top)<1&&Math.abs(ac.getBoundingClientRect().top-bc.getBoundingClientRect().top)>1)
        misalignedFormRows.push({labels:[a.innerText,b.innerText],controls:[ac.id,bc.id],top:[ac.getBoundingClientRect().top,bc.getBoundingClientRect().top],height:[ac.getBoundingClientRect().height,bc.getBoundingClientRect().height],lineHeight:[getComputedStyle(ac).lineHeight,getComputedStyle(bc).lineHeight]});
    }
  });
  const unevenChoiceRows=[...document.querySelectorAll('.choices')].filter(visible).map(row=>[...row.querySelectorAll('button')].filter(visible).map(e=>e.getBoundingClientRect().height)).filter(heights=>Math.max(...heights)-Math.min(...heights)>1);
  const score=document.querySelector('.scoreKpi');
  return {viewport:[innerWidth,innerHeight],pageWidth:document.documentElement.scrollWidth,overflow,smallTargets,clippedControls,clippedContainers,clippedOperationalText,fonts,editableFonts,primaryContrast,inconsistentFonts,misalignedFormRows,unevenChoiceRows,scoreVisible:visible(score),headerHeight:document.querySelector('#evalView:not(.hidden) #evalHeader')?.getBoundingClientRect().height||0,activeTimerHeight:document.querySelector('#activeTimersCard:not(.hidden)')?.getBoundingClientRect().height||0};
}"""

STICKY_SPACE = r"""() => {
  const header=document.querySelector('#evalHeader'),timer=document.querySelector('#activeTimersCard'),nav=document.querySelector('#evalPhaseNav');
  const hb=header.getBoundingClientRect(),tb=timer.getBoundingClientRect();
  const pinnedBottom=e=>{const r=e.getBoundingClientRect(),p=getComputedStyle(e).position;return ['sticky','fixed'].includes(p)&&r.bottom>0&&r.top<innerHeight?r.bottom:0;};
  return {headerPosition:getComputedStyle(header).position,headerBottom:hb.bottom,timerPosition:getComputedStyle(timer).position,timerTop:tb.top,timerBottom:tb.bottom,navTop:nav.getBoundingClientRect().top,assessmentSpace:Math.min(innerHeight,nav.getBoundingClientRect().top)-Math.max(pinnedBottom(header),pinnedBottom(timer),0)};
}"""


def main():
    records = []
    errors = []
    external = []
    viewports=[(320,740),(375,812),(390,844),(430,932),(768,1024),(1024,768),(1366,900),(844,390)]
    enlarged_viewports=[(390,844),(768,1024),(1366,900)]
    if '--quick' in sys.argv:
        viewports=[(390,844),(844,390)]
        enlarged_viewports=[(768,1024)]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), headless=True)
        context = browser.new_context(service_workers='block')
        context.add_init_script(WORKFLOW.IDENTITY_FIXTURE)

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
                body = WORKFLOW.test_html().encode()
            elif relative == 'app.js':
                source = target.read_text()
                marker = '\nrenderHome();\n})();'
                assert source.count(marker) == 1
                body = source.replace(marker, '\n' + ADAPTER + marker, 1).encode()
            else:
                body = target.read_bytes()
            route.fulfill(status=200, body=body, content_type=mimetypes.guess_type(str(target))[0] or 'application/octet-stream')

        context.route('**/*', fulfill)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.dismiss())
        page.goto(WORKFLOW.ORIGIN + '/', wait_until='networkidle')
        page.wait_for_function('!!window.__responsive')
        page.locator('#safetyAck').check()
        page.locator('#safetyEnterBtn').click()
        for width, height in viewports:
            page.set_viewport_size({'width': width, 'height': height})
            for scene in ['home','manage','readiness','program','class','observe','review','observe-running','modal']:
                page.evaluate('window.__responsive.clearTextSize()')
                page.evaluate("() => document.querySelectorAll('.modal.open [data-close]').forEach(e=>e.click())")
                page.evaluate('(scene)=>window.__responsive.setup(scene)', scene)
                page.wait_for_timeout(70)
                result = page.evaluate(MEASURE)
                result.update({'scene':scene,'textScale':1})
                records.append(result)
                if width in (320,390,844,1366) and scene in ('home','program','class','observe','modal'):
                    filename = f'{scene}-{width}x{height}.png'
                    page.screenshot(path=str(ARTIFACTS / filename))
                if scene=='class':
                    page.locator('#jumpRosterBtn').click()
                    result['rosterShortcut']=page.evaluate("""() => {
                      const search=document.querySelector('#rosterSearch'),header=document.querySelector('#classView .compactHeader');
                      return {focused:document.activeElement===search,searchTop:search.getBoundingClientRect().top,headerBottom:header.getBoundingClientRect().bottom};
                    }""")
                    if width in (320,390,844,1366):
                        page.screenshot(path=str(ARTIFACTS/f'roster-{width}x{height}.png'))
                if scene=='observe-running':
                    page.evaluate("document.querySelector('.item').scrollIntoView({block:'start'})")
                    page.wait_for_timeout(250)
                    result['stickySpace']=page.evaluate(STICKY_SPACE)
                    result['scoreVisibleAfterScroll']=page.locator('.scoreKpi').is_visible()
                    page.locator('#nextUnresolvedBtn').evaluate('e=>e.click()')
                    page.wait_for_timeout(750)
                    result['navigationTarget']=page.evaluate("""() => {
                      // The highlight is transient; keyboard focus remains on the actual target.
                      const target=document.querySelector('.unresolvedFocus')||document.activeElement?.closest('#items .item'),first=target?.querySelector('.choice:not(:disabled)');
                      const header=document.querySelector('#evalHeader').getBoundingClientRect(),timer=document.querySelector('#activeTimersCard').getBoundingClientRect();
                      return {targetTop:target?.getBoundingClientRect().top,gradeTop:first?.getBoundingClientRect().top,obstructionBottom:Math.max(header.bottom,timer.bottom),gradeFocused:document.activeElement===first};
                    }""")
                    if width in (390,844):
                        page.screenshot(path=str(ARTIFACTS/f'running-scrolled-{width}x{height}.png'))
            # Keyboard behavior is separate from geometry and uses the actual modal.
            before = page.locator('#formModal').evaluate("e=>e.classList.contains('open')")
            page.keyboard.press('Escape')
            result['escapeCloses'] = before and not page.locator('#formModal').evaluate("e=>e.classList.contains('open')")
        for width,height in enlarged_viewports:
            page.set_viewport_size({'width':width,'height':height})
            for scene in ['home','program','class','observe','modal']:
                page.evaluate("() => document.querySelectorAll('.modal.open [data-close]').forEach(e=>e.click())")
                page.evaluate('window.__responsive.clearTextSize()')
                page.evaluate('(scene)=>window.__responsive.setup(scene)',scene)
                page.evaluate('window.__responsive.enlargeText()')
                result=page.evaluate(MEASURE)
                result.update({'scene':scene,'textScale':2})
                records.append(result)
                page.screenshot(path=str(ARTIFACTS/f'{scene}-{width}x{height}-text200.png'))
        report = {'records':records,'errors':errors,'externalRequests':external}
        (ARTIFACTS / 'report.json').write_text(json.dumps(report, indent=2))
        browser.close()
    summary = [{'scene':r['scene'],'viewport':r['viewport'],'textScale':r['textScale'],'pageWidth':r['pageWidth'],'smallTargets':len(r['smallTargets']),'clippedControls':len(r['clippedControls']),'headerHeight':r['headerHeight'],'stickySpace':r.get('stickySpace')} for r in records if r['pageWidth']>r['viewport'][0] or r['clippedControls'] or r['smallTargets'] or r.get('stickySpace',{}).get('assessmentSpace',200)<160]
    print(json.dumps({'layouts':len(records),'artifacts':str(ARTIFACTS),'findings':summary,'errors':errors,'externalRequests':external}, indent=2))
    if '--audit' not in sys.argv:
        assert not errors, errors
        assert not external, external
        assert all(r['pageWidth']<=r['viewport'][0] for r in records), 'Horizontal page overflow; see report.json'
        assert all(not r['clippedControls'] for r in records), 'Clipped control labels; see report.json'
        assert all(not r['clippedContainers'] for r in records), 'Content overflows its card or modal sheet; see report.json'
        assert all(not r['clippedOperationalText'] for r in records), 'Timer, elapsed, or attempt text is clipped; see report.json'
        assert all(not r['smallTargets'] for r in records), 'Interactive controls below 44 CSS pixels; see report.json'
        assert all(not r['unevenChoiceRows'] for r in records), 'Grade controls in a row have unequal heights'
        assert all(not r['scoreVisible'] and not r.get('scoreVisibleAfterScroll') for r in records if r['scene'].startswith('observe')), 'Observe mode reveals the score KPI'
        assert all(not r['inconsistentFonts'] for r in records), 'Form/control font stack differs from surrounding text'
        assert all(field['size']>=16*r['textScale'] for r in records for field in r['editableFonts']), 'Editable field text is smaller than 16 CSS pixels; see report.json'
        assert all(control['minimumRatio']>=4.5 for r in records for control in r['primaryContrast']), 'Primary action, timer control, or critical badge has less than 4.5:1 text contrast'
        assert all(not r['misalignedFormRows'] for r in records), 'Inputs in the same form row have misaligned top edges'
        minimum_fonts={'.itemText':16,'.rowTitle':14,'#studentLabel':12,'.formGrid label':12,'.choice':14,'.modeSegment':12,'.helper':12}
        assert all(size is None or size>=minimum_fonts[selector]*r['textScale'] for r in records for selector,size in r['fonts'].items()), 'Operational text falls below its readable minimum size'
        assert all(r.get('stickySpace',{}).get('assessmentSpace',160)>=min(160,r['viewport'][1]*.4) for r in records), 'Sticky controls leave too little room for assessment; see report.json'
        assert all(r['navigationTarget']['targetTop'] is not None and r['navigationTarget']['targetTop']>=r['navigationTarget']['obstructionBottom']-1 and r['navigationTarget']['gradeFocused'] for r in records if 'navigationTarget' in r), 'Next Unresolved hides the target behind pinned controls or fails to focus its grade'
        assert all(r['rosterShortcut']['focused'] and r['rosterShortcut']['searchTop']>=r['rosterShortcut']['headerBottom'] for r in records if 'rosterShortcut' in r), 'Roster shortcut fails to focus search below the sticky class header'
        assert all(r.get('escapeCloses',True) for r in records), 'Escape did not close modal'


if __name__ == '__main__':
    main()
