"""Exercise real username administration UI and native credential dialogs locally.

Run: python tests/browser-admin-accounts.py
Requires Python Playwright and Chromium (or CHROMIUM_EXECUTABLE).
The checkout's actual index, CSS, permissions.js, and admin-ui.js are loaded.
All identity, account, and catalog operations use in-memory synthetic fixtures;
every external or non-GET network request is blocked and fails the test.
Screenshots and check results are written under /tmp/raps-admin-accounts.
"""

import json
import mimetypes
import os
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://127.0.0.1:8777'
ARTIFACTS = Path('/tmp/raps-admin-accounts')
VIEWPORTS = (
    ('small-phone', 320, 640, 1),
    ('phone', 390, 844, 1),
    ('tablet', 768, 1024, 1),
    ('landscape', 844, 390, 1),
    ('desktop', 1366, 900, 1),
    ('large-text', 390, 844, 1.5),
)

FAKE_SDK = r"""
(() => {
const caller='11111111-1111-4111-8111-111111111111';
const target='22222222-2222-4222-8222-222222222222';
const created='55555555-5555-4555-8555-555555555555';
const base='33333333-3333-4333-8333-333333333333';
const majcom='44444444-4444-4444-8444-444444444444';
window.__adminActions=[];window.__fixtureErrors=[];window.__clipboard=[];
window.__credentialTimer=null;
const originalSetTimeout=window.setTimeout.bind(window);
window.setTimeout=(fn,delay,...args)=>{
  if(delay===5*60*1000)window.__credentialTimer=()=>fn(...args);
  return originalSetTimeout(fn,delay,...args);
};
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async writeText(text){window.__clipboard.push(text);}}});
window.RAPS_CLOUD_CONFIG={projectUrl:location.origin,publishableKey:'synthetic-test-key'};
window.RAPS_CLOUD={mode:'connected',connected:true,role:'enterprise_admin',user:{id:caller},memberships:[{
  id:'synthetic-admin-membership',user_id:caller,role:'enterprise_admin',active:true,base_id:null,majcom_id:null,starts_at:null,ends_at:null
}]};
const users=[{id:target,username:'recover.person',password_change_required:false,temporary_expires_at:null}];
const tables={
  profiles:[{id:caller,email:'admin@example.test',display_name:'Synthetic Administrator'},
    {id:target,email:'recover.person@login.raps.invalid',display_name:'Synthetic Recovery Account'}],
  memberships:[{id:'synthetic-admin-membership',user_id:caller,role:'enterprise_admin',active:true,base_id:null,majcom_id:null},
    {id:'synthetic-target-membership',user_id:target,role:'evaluator',active:true,base_id:base,majcom_id:null,bases:{code:'TEST'}}],
  bases:[{id:base,code:'TEST',name:'Synthetic Installation With A Long Name',majcom_id:majcom,active:true}],
  majcoms:[{id:majcom,code:'SYNTHETIC',name:'Synthetic Major Command',active:true}],access_requests:[]
};
const fail=name=>{window.__fixtureErrors.push(name);throw new Error('Unexpected fixture operation: '+name);};
function query(table){
  if(!Object.hasOwn(tables,table))return fail('table '+table);
  let start=0,end=499;
  const chain={select(){return chain;},order(){return chain;},eq(){return chain;},
    range(first,last){start=first;end=last;return chain;},
    then(resolve,reject){return Promise.resolve({data:tables[table].slice(start,end+1),error:null}).then(resolve,reject);}};
  return new Proxy(chain,{get:(obj,key)=>key in obj?obj[key]:()=>fail('query.'+String(key))});
}
const auth={async getSession(){return {data:{session:{access_token:'synthetic-fixed-token',user:{id:caller}}},error:null};}};
window.RAPS_SUPABASE={auth};
window.supabase={createClient:(url,key,settings)=>{
  if(url!==location.origin||key!=='synthetic-test-key'||settings.global.headers.Authorization!=='Bearer synthetic-fixed-token'
    ||settings.auth.persistSession!==false||settings.auth.autoRefreshToken!==false)return fail('unbound administrative client');
  return {auth,from:query,functions:{async invoke(name,{body}){
    if(name!=='managed-login')return fail('function '+name);
    window.__adminActions.push({...body});
    if(body.action==='list_users')return {data:{ok:true,users:users.slice(body.offset,body.offset+body.limit),next_offset:null},error:null};
    let user;
    if(body.action==='create_user'){
      if(body.username!=='new.person'||body.display_name!=='Synthetic New Person'||body.role!=='evaluator'||body.base_id!==base||body.majcom_id!==null)return fail('unexpected create body');
      user={id:created,username:body.username};users.push({...user,password_change_required:true});
    }else if(body.action==='reset_password'){
      if(body.user_id!==target)return fail('unexpected reset target');
      user={id:target,username:'recover.person'};
    }else return fail('action '+body.action);
    return {data:{ok:true,user,temporary_password:'Aa1!SYNTHETIC-'+body.action+'-ONLY',temporary_expires_at:'2999-01-01T00:00:00Z'},error:null};
  }}};
}};
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('areaProgram').classList.remove('hidden');
  document.getElementById('areaEvaluate').classList.add('hidden');
});
})();
"""


def test_html():
    html = (ROOT / 'index.html').read_text()
    return re.sub(r'<script\s+src="([^"]+)"[^>]*></script>',
                  lambda match: match.group(0) if urlsplit(match.group(1)).path in {'permissions.js', 'admin-ui.js'} else '', html)


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    passed, failures, unexpected, page_errors, screenshots, keyboard_trace = [], [], [], [], [], []

    def check(condition, description):
        (passed if condition else failures).append(description)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), headless=True)
        context = browser.new_context(service_workers='block')
        context.add_init_script(FAKE_SDK)

        def serve(route):
            request, url = route.request, urlsplit(route.request.url)
            if url.hostname != '127.0.0.1' or url.port != 8777 or request.method != 'GET':
                unexpected.append({'method': request.method, 'url': request.url})
                return route.abort()
            relative = unquote(url.path).lstrip('/') or 'index.html'
            target = (ROOT / relative).resolve()
            if ROOT not in target.parents or not target.is_file():
                unexpected.append({'method': request.method, 'url': request.url})
                return route.fulfill(status=404, body='Not found')
            route.fulfill(status=200, body=test_html().encode() if relative == 'index.html' else target.read_bytes(),
                          content_type=mimetypes.guess_type(str(target))[0] or 'application/octet-stream')

        context.route('**/*', serve)
        for name, width, height, multiplier in VIEWPORTS:
            page = context.new_page()
            page.set_viewport_size({'width': width, 'height': height})
            page.set_default_timeout(7000)
            page.on('pageerror', lambda error: page_errors.append(str(error)))
            page.on('dialog', lambda dialog: dialog.accept())
            page.goto(ORIGIN, wait_until='networkidle')
            expect(page.locator('#adminManagedCreateBtn')).to_be_enabled()
            card = page.locator('#enterpriseAdminCard')
            card.locator('details').nth(1).locator('summary').click()
            if multiplier != 1:
                page.evaluate('''multiplier=>{
                  const nodes=[...document.querySelectorAll('#enterpriseAdminCard,#enterpriseAdminCard *,#adminTemporaryCredentials,#adminTemporaryCredentials *')];
                  const sizes=nodes.map(node=>parseFloat(getComputedStyle(node).fontSize));
                  nodes.forEach((node,index)=>node.style.fontSize=(sizes[index]*multiplier)+'px');
                }''', multiplier)

            for selector in ['#adminManagedUsername', '#adminManagedName', '#adminManagedRole', '#adminManagedScope', '#adminManagedUser']:
                control = page.locator(selector)
                control.scroll_into_view_if_needed()
                metrics = control.evaluate('''element=>{const rect=element.getBoundingClientRect();return {
                    left:rect.left,right:rect.right,height:rect.height,font:parseFloat(getComputedStyle(element).fontSize),
                    labels:[...element.labels].map(label=>label.textContent.trim()).filter(Boolean)};}''')
                check(metrics['left'] >= -1 and metrics['right'] <= width + 1, f'{name}: {selector} fits viewport')
                check(metrics['height'] >= 44 and metrics['font'] >= 16 and metrics['labels'], f'{name}: {selector} has readable labelled controls')
            for selector in ['#adminManagedCreateBtn', '#adminManagedResetBtn']:
                control = page.locator(selector)
                control.scroll_into_view_if_needed()
                box = control.bounding_box()
                check(box['x'] >= -1 and box['x'] + box['width'] <= width + 1 and box['height'] >= 44,
                      f'{name}: {selector} fits viewport with a 44px target')

            page.locator('#adminManagedUsername').fill('new.person')
            page.locator('#adminManagedName').fill('Synthetic New Person')
            page.locator('#adminManagedCreateBtn').click()
            dialog = page.locator('#adminTemporaryCredentials')
            expect(dialog).to_be_visible()
            expect(page.locator('#adminTemporaryUsername')).to_have_value('new.person')
            expect(page.locator('#adminTemporaryPassword')).to_have_value('Aa1!SYNTHETIC-create_user-ONLY')
            check(dialog.evaluate('element=>element.matches(":modal")'), f'{name}: credentials use a native modal')
            check(dialog.evaluate('element=>element.contains(document.activeElement)'), f'{name}: initial focus stays in the modal')
            check(page.evaluate('window.__clipboard.length===0'), f'{name}: creation never automatically copies credentials')
            check(page.evaluate('''()=>![...Object.values(localStorage),...Object.values(sessionStorage)].some(value=>value.includes('Aa1!SYNTHETIC'))'''),
                  f'{name}: one-time credentials never enter browser storage')
            geometry = dialog.evaluate('''element=>{const rect=element.getBoundingClientRect();return {
              left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,
              width:element.clientWidth,scrollWidth:element.scrollWidth,
              pageWidth:document.documentElement.scrollWidth,scrollHeight:element.scrollHeight,height:element.clientHeight,
              overflow:getComputedStyle(element).overflowY};}''')
            check(geometry['pageWidth'] <= width + 1 and geometry['left'] >= -1 and geometry['right'] <= width + 1 and geometry['scrollWidth'] <= geometry['width'] + 1,
                  f'{name}: modal has no horizontal overflow')
            check(geometry['top'] >= -1 and geometry['bottom'] <= height + 1,
                  f'{name}: modal bounds stay inside the viewport')
            if geometry['scrollHeight'] > geometry['height'] + 1:
                check(geometry['overflow'] in ('auto', 'scroll'), f'{name}: tall modal scrolls vertically')
            controls = dialog.locator('input,button')
            controls.last.focus()
            page.keyboard.press('Tab')
            keyboard_trace.append({'viewport':name,'step':'Tab','state':page.evaluate('''()=>({id:document.activeElement.id,tag:document.activeElement.tagName,hasFocus:document.hasFocus(),inside:document.getElementById('adminTemporaryCredentials').contains(document.activeElement)})''')})
            check(keyboard_trace[-1]['state']['inside'] or not keyboard_trace[-1]['state']['hasFocus'],
                  f'{name}: native Tab reaches only the modal or browser chrome')
            page.keyboard.press('Tab')
            keyboard_trace.append({'viewport':name,'step':'Tab again','state':page.evaluate('''()=>({id:document.activeElement.id,tag:document.activeElement.tagName,hasFocus:document.hasFocus(),inside:document.getElementById('adminTemporaryCredentials').contains(document.activeElement)})''')})
            check(keyboard_trace[-1]['state']['inside'], f'{name}: native Tab returns from browser chrome to the modal')
            controls.first.focus()
            page.keyboard.press('Shift+Tab')
            keyboard_trace.append({'viewport':name,'step':'Shift+Tab','state':page.evaluate('''()=>({id:document.activeElement.id,tag:document.activeElement.tagName,hasFocus:document.hasFocus(),inside:document.getElementById('adminTemporaryCredentials').contains(document.activeElement)})''')})
            check(keyboard_trace[-1]['state']['inside'] or not keyboard_trace[-1]['state']['hasFocus'],
                  f'{name}: native Shift+Tab never reaches background controls')
            page.locator('#adminManagedUsername').evaluate('element=>element.focus()')
            check(dialog.evaluate('element=>element.contains(document.activeElement)'), f'{name}: background controls cannot receive focus')
            page.locator('#adminTemporaryCopyBtn').click()
            check(page.evaluate('window.__clipboard.length===1&&window.__clipboard[0].includes("new.person")'),
                  f'{name}: explicit Copy Credentials action copies the intended username')
            screenshot = ARTIFACTS / f'{name}-credentials.png'
            page.screenshot(path=str(screenshot))
            screenshots.append(str(screenshot))
            page.keyboard.press('Escape')
            expect(dialog).not_to_be_visible()
            expect(page.locator('#adminTemporaryPassword')).to_have_value('')
            expect(page.locator('#adminTemporaryUsername')).to_have_value('')
            check(page.locator('#adminTemporaryCopyStatus').text_content() == '', f'{name}: Escape clears credential fields and copy status')
            page.locator('#adminManagedUsername').focus()
            expect(page.locator('#adminManagedUsername')).to_be_focused()
            passed.append(f'{name}: native modal releases background focus after closing')

            page.locator('#adminManagedUser').select_option('22222222-2222-4222-8222-222222222222')
            page.locator('#adminManagedResetBtn').click()
            expect(dialog).to_be_visible()
            expect(page.locator('#adminTemporaryUsername')).to_have_value('recover.person')
            expect(page.locator('#adminTemporaryPassword')).to_have_value('Aa1!SYNTHETIC-reset_password-ONLY')
            page.locator('#adminTemporaryCloseBtn').click()
            expect(dialog).not_to_be_visible()
            expect(page.locator('#adminTemporaryPassword')).to_have_value('')
            passed.append(f'{name}: reset targets selected account and Done clears its password')
            # Trigger the actual callback registered for the five-minute timer;
            # no production clock or timer delay is changed by this fixture.
            page.locator('#adminManagedUser').select_option('22222222-2222-4222-8222-222222222222')
            page.locator('#adminManagedResetBtn').click()
            expect(dialog).to_be_visible()
            page.evaluate('window.__credentialTimer()')
            expect(dialog).not_to_be_visible()
            expect(page.locator('#adminTemporaryPassword')).to_have_value('')
            passed.append(f'{name}: credential timeout clears and closes the native dialog')
            page.locator('#adminManagedUser').select_option('22222222-2222-4222-8222-222222222222')
            page.locator('#adminManagedResetBtn').click()
            expect(dialog).to_be_visible()
            page.evaluate('''()=>{window.RAPS_CLOUD={...window.RAPS_CLOUD,user:{id:'different-user'},memberships:[]};
              window.dispatchEvent(new Event('raps-cloud-identity'));}''')
            expect(dialog).not_to_be_visible()
            expect(page.locator('#adminTemporaryPassword')).to_have_value('')
            check(page.locator('#enterpriseAdminCard').evaluate('element=>element.classList.contains("hidden")'),
                  f'{name}: identity change clears credentials and hides Enterprise administration')
            check(not page.evaluate('window.__fixtureErrors'), f'{name}: fixture saw only authorized account operations')
            page.close()
        browser.close()

    check(not unexpected, 'all network requests stayed within intercepted local assets')
    check(not page_errors, 'no browser JavaScript errors occurred')
    output = {'checks_passed': len(passed), 'checks': passed, 'failures': failures,
              'unexpected_requests': unexpected, 'page_errors': page_errors, 'screenshots': screenshots,'keyboard_trace':keyboard_trace}
    (ARTIFACTS / 'results.json').write_text(json.dumps(output, indent=2))
    print(json.dumps(output, indent=2))
    assert not failures, f'{len(failures)} administration browser checks failed'


if __name__ == '__main__':
    main()
