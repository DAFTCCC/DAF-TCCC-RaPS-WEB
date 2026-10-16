"""Check actual cloud-auth forms across viewport sizes without production traffic.

Run: python tests/browser-auth-layout.py
Requires Python Playwright and Chromium (or set CHROMIUM_EXECUTABLE).
The real index, stylesheet, assets, and cloud-auth.js are loaded from this checkout.
Only the Supabase SDK/config and read-only access catalog are synthetic. Any auth
or data mutation, external request, or unexpected request fails the test.
Screenshots are written under /tmp/raps-auth-layout.
"""

import json
import mimetypes
import os
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://127.0.0.1:8766'
ARTIFACTS = Path('/tmp/raps-auth-layout')
VIEWPORTS = (
    ('small-phone', 320, 640, 1),
    ('phone', 390, 844, 1),
    ('tablet', 768, 1024, 1),
    ('landscape', 844, 390, 1),
    ('desktop', 1366, 900, 1),
    ('large-text', 390, 844, 1.5),
)
GATES = {
    'sign-in': '#cloudAuthGate',
    'request-access': '#cloudRequestAccessGate',
    'activation': '#cloudActivationGate',
}
FAKE_SDK = r"""
window.__authMutations=[];
window.__authReads=[];
window.RAPS_CLOUD_CONFIG={projectUrl:location.origin,publishableKey:'synthetic-test-key'};
const rejectOperation=name=>(...args)=>{
  window.__authMutations.push(name);
  throw new Error('Cloud operation prohibited in isolated layout test: '+name);
};
const fakeAuth=new Proxy({
  async getSession(){
    window.__authReads.push('getSession');
    const activation=new URL(location.href).searchParams.get('raps_activation')==='1';
    return {data:{session:activation?{user:{id:'synthetic-activation-user'}}:null},error:null};
  },
  onAuthStateChange(){
    window.__authReads.push('onAuthStateChange');
    return {data:{subscription:{unsubscribe(){}}}};
  }
},{get:(target,key)=>key in target?target[key]:rejectOperation('auth.'+String(key))});
window.supabase={createClient:()=>({auth:fakeAuth,
  from:rejectOperation('from'),rpc:rejectOperation('rpc'),
  functions:{invoke:rejectOperation('functions.invoke')}})};
"""


def test_html():
    html = (ROOT / 'index.html').read_text()

    def keep_auth_script(match):
        return match.group(0) if urlsplit(match.group(1)).path == 'cloud-auth.js' else ''

    return re.sub(r'<script\s+src="([^"]+)"[^>]*></script>', keep_auth_script, html)


def scale_text(page, multiplier):
    # This deliberately enlarges rendered text, not the card or viewport. Read all
    # sizes first so inherited sizes are not multiplied once for each ancestor.
    page.evaluate('''multiplier => {
      const elements=[...document.querySelectorAll('.cloudAuthGate,.cloudAuthGate *')];
      const sizes=elements.map(element=>parseFloat(getComputedStyle(element).fontSize));
      elements.forEach((element,index)=>element.style.fontSize=(sizes[index]*multiplier)+'px');
    }''', multiplier)


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    checks = []
    failures = []
    unexpected_requests = []
    catalog_reads = []
    page_errors = []
    mutations = []
    screenshots = []

    def check(condition, description):
        (checks if condition else failures).append(description)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'),
            headless=True,
        )
        context = browser.new_context(service_workers='block')
        context.add_init_script(FAKE_SDK)

        def fulfill(route):
            request = route.request
            url = urlsplit(request.url)
            if url.hostname != '127.0.0.1' or url.port != 8766 or request.method != 'GET':
                unexpected_requests.append({'method': request.method, 'url': request.url})
                return route.abort()
            if url.path == '/functions/v1/request-access':
                catalog_reads.append(request.url)
                return route.fulfill(status=200, content_type='application/json', body=json.dumps({
                    'bases': [{'id': 'test-base', 'code': 'TEST',
                               'name': 'Synthetic Installation with a Long Display Name'}],
                    'majcoms': [{'id': 'test-command', 'code': 'TEST COMMAND',
                                 'name': 'Synthetic Major Command'}],
                }))
            relative = unquote(url.path).lstrip('/') or 'index.html'
            target = (ROOT / relative).resolve()
            if ROOT not in target.parents or not target.is_file():
                unexpected_requests.append({'method': request.method, 'url': request.url})
                return route.fulfill(status=404, body='Not found')
            body = test_html().encode() if relative == 'index.html' else target.read_bytes()
            route.fulfill(status=200, body=body,
                          content_type=mimetypes.guess_type(str(target))[0] or 'application/octet-stream')

        context.route('**/*', fulfill)

        for name, width, height, text_multiplier in VIEWPORTS:
            page = context.new_page()
            page.set_viewport_size({'width': width, 'height': height})
            page.set_default_timeout(7000)
            page.on('pageerror', lambda error: page_errors.append(str(error)))
            for gate_name, selector in GATES.items():
                suffix = '/?raps_activation=1' if gate_name == 'activation' else '/'
                page.goto(ORIGIN + suffix, wait_until='networkidle')
                if gate_name == 'request-access':
                    page.locator('#cloudRequestAccessBtn').click()
                    expect(page.locator('#cloudRequestAccessScope option')).to_have_count(1)
                    expect(page.locator('#cloudRequestAccessMessage')).to_have_text('')
                gate = page.locator(selector)
                expect(gate).to_be_visible()
                page.wait_for_function('selector=>document.querySelector(selector).contains(document.activeElement)', arg=selector)
                if text_multiplier != 1:
                    scale_text(page, text_multiplier)
                prefix = f'{name} {gate_name}'
                check(gate.evaluate('element=>element.contains(document.activeElement)'),
                      prefix + ': initial focus is inside the active dialog')
                if gate_name != 'request-access':
                    check(gate.locator('h1').evaluate('element=>element===document.activeElement'),
                          prefix + ': opening focuses the heading without forcing a mobile keyboard')
                focusable = gate.locator('input:enabled,select:enabled,textarea:enabled,button:enabled,a[href]')
                first_control, last_control = focusable.first, focusable.last
                last_control.focus()
                page.keyboard.press('Tab')
                check(first_control.evaluate('element=>element===document.activeElement'),
                      prefix + ': Tab on the final control returns to the first control')
                first_control.focus()
                page.keyboard.press('Shift+Tab')
                check(last_control.evaluate('element=>element===document.activeElement'),
                      prefix + ': Shift+Tab on the first control returns to the final control')
                page.evaluate('document.getElementById("newClassBtn").focus()')
                check(gate.evaluate('element=>element.contains(document.activeElement)') and
                      page.locator('#homeView').evaluate('element=>element.inert'),
                      prefix + ': background Home controls cannot receive focus')
                gate.evaluate('element=>{element.scrollTop=0;element.querySelector(".cloudAuthCard").scrollTop=0}')
                geometry = gate.evaluate('''element=>{
                  const card=element.querySelector('.cloudAuthCard'), rect=card.getBoundingClientRect();
                  return {pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,
                    gateWidth:element.clientWidth,gateScrollWidth:element.scrollWidth,
                    cardLeft:rect.left,cardRight:rect.right,cardTop:rect.top,
                    scrollable:[element,card].some(node=>node.scrollHeight>node.clientHeight+1&&
                      /auto|scroll/.test(getComputedStyle(node).overflowY)),
                    contentHeight:card.scrollHeight,viewportHeight:innerHeight};
                }''')
                check(geometry['pageWidth'] <= width + 1 and
                      geometry['gateScrollWidth'] <= geometry['gateWidth'] + 1 and
                      geometry['cardLeft'] >= -1 and geometry['cardRight'] <= width + 1,
                      prefix + ': horizontal content stays inside viewport')
                check(geometry['cardTop'] >= -1,
                      prefix + ': first content is reachable without negative overflow')
                if geometry['contentHeight'] > height:
                    check(geometry['scrollable'], prefix + ': tall form has a scroll container')

                fields = gate.locator('input:not([type="checkbox"]):not([type="radio"]),select,textarea')
                metrics = fields.evaluate_all('''elements=>elements.map(element=>{
                  const style=getComputedStyle(element);
                  return {id:element.id,fontSize:parseFloat(style.fontSize),
                    height:element.getBoundingClientRect().height,background:style.backgroundColor,
                    border:style.borderColor,radius:style.borderRadius,
                    labels:[...element.labels||[]].filter(label=>label.getClientRects().length)
                      .map(label=>label.textContent.trim()).filter(Boolean)};
                })''')
                check(all(field['fontSize'] >= 16 for field in metrics),
                      prefix + ': editable fonts are at least 16px')
                check(all(field['height'] >= 48 for field in metrics),
                      prefix + ': editable controls have at least 48px height')
                check(all(field['labels'] for field in metrics),
                      prefix + ': every editable control has an associated visible label')
                first = metrics[0]
                check(all((field['background'], field['border'], field['radius']) ==
                          (first['background'], first['border'], first['radius']) for field in metrics),
                      prefix + ': inputs, selects and textareas share field styling')

                for index in range(fields.count()):
                    field = fields.nth(index)
                    # Center the complete border box. Chromium's "if needed"
                    # heuristic can leave a textarea border 1–2px offscreen.
                    field.evaluate('element=>element.scrollIntoView({block:"center",inline:"nearest",behavior:"instant"})')
                    rect = field.bounding_box()
                    reachable = (rect is not None and rect['y'] >= -1 and
                                 rect['y'] + rect['height'] <= height + 1)
                    check(reachable,
                          prefix + f': {metrics[index]["id"]} can be scrolled fully into view' +
                          ('' if reachable else f' ({rect})'))
                for button in gate.locator('button').all():
                    button.scroll_into_view_if_needed()
                    rect = button.bounding_box()
                    check(rect is not None and rect['height'] >= 44 and rect['y'] >= -1 and
                          rect['y'] + rect['height'] <= height + 1,
                          prefix + ': ' + button.inner_text() + ' is reachable with a 44px target')

                # Exercise the real dynamic organizational-scope label without submitting.
                if gate_name == 'request-access':
                    gate.locator('#cloudRequestAccessRole').select_option('majcom_manager')
                    expect(gate.get_by_role('combobox', name='MAJCOM', exact=True)).to_have_value('test-command')
                    gate.locator('#cloudRequestAccessRole').select_option('evaluator')
                    expect(gate.get_by_role('combobox', name='Installation', exact=True)).to_have_value('test-base')
                    checks.append(prefix + ': role change keeps scope correctly labelled')

                gate.evaluate('element=>{element.scrollTop=0;element.querySelector(".cloudAuthCard").scrollTop=0}')
                if name in ('phone', 'landscape', 'large-text'):
                    screenshot = ARTIFACTS / f'{name}-{gate_name}.png'
                    page.screenshot(path=str(screenshot))
                    screenshots.append(str(screenshot))
                page.keyboard.press('Escape')
                if gate_name == 'request-access':
                    expect(gate).not_to_be_visible()
                    expect(page.locator('#cloudAuthGate')).to_be_visible()
                    page.wait_for_function('document.getElementById("cloudAuthGate").contains(document.activeElement)')
                    checks.append(prefix + ': Escape returns to Sign In with focus inside')
                else:
                    check(gate.is_visible() and
                          gate.evaluate('element=>element.contains(document.activeElement)'),
                          prefix + ': Escape keeps the required authentication dialog open')
                mutations.extend(page.evaluate('window.__authMutations'))
            page.close()
        browser.close()

    check(not mutations, 'no Supabase authentication or data mutation occurred')
    check(not unexpected_requests, 'all requests were local assets or synthetic read-only catalog')
    check(not page_errors, 'no browser JavaScript errors occurred')
    result = {'checks_passed': len(checks), 'checks': checks, 'failures': failures,
              'unexpected_requests': unexpected_requests, 'catalog_reads': len(catalog_reads),
              'page_errors': page_errors, 'mutations': mutations, 'artifacts': screenshots}
    print(json.dumps(result, indent=2))
    assert not failures, f'{len(failures)} auth layout checks failed; see output above'


if __name__ == '__main__':
    main()
