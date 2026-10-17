"""Exercise the actual authentication UI against an isolated synthetic SDK.

Run: python tests/browser-auth-flows.py
Requires Python Playwright and Chromium (or CHROMIUM_EXECUTABLE). Every request
is intercepted; no email, account, production SDK, or production service is used.
Passwords and tokens in this file are invented, disposable test values.
"""

import json
import mimetypes
import os
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://127.0.0.1:8767'
USER = {'id': 'synthetic-user', 'email': 'current-user@example.test'}
PASSWORD = 'Synthetic new password 42!'
CURRENT_PASSWORD = 'Synthetic current password 41!'
SESSION = {'user': USER, 'access_token': 'synthetic-access-token',
           'refresh_token': 'synthetic-refresh-token'}
OTHER_SESSION = {'user': {'id': 'different-user', 'email': 'other@example.test'},
                 'access_token': 'synthetic-other-access-token',
                 'refresh_token': 'synthetic-other-refresh-token'}
MEMBERSHIP = {'id': 'synthetic-membership', 'active': True, 'role': 'evaluator',
              'base_id': 'test-base', 'bases': {'id': 'test-base', 'code': 'TEST',
                  'active': True, 'majcom_id': 'test-command',
                  'majcoms': {'id': 'test-command', 'active': True}}}
CACHED_IDENTITY = {'user': USER, 'profile': {'display_name': 'Synthetic Evaluator'},
                   'memberships': [MEMBERSHIP], 'primaryMembership': MEMBERSHIP}

FAKE_SDK = r"""
(() => {
const config=window.__authFixture;
const copy=value=>JSON.parse(JSON.stringify(value));
const state=window.__authTest={calls:[],callbacks:[],session:config.session||null,
  errors:config.errors||{},verifiedUser:config.verifiedUser||null,
  paused:{},pending:{},membershipsOverride:null};
state.wait=async method=>{
  if(!state.paused[method])return;
  await new Promise(resolve=>(state.pending[method]||=[]).push(resolve));
};
state.release=method=>{
  const callbacks=state.pending[method]||[];
  delete state.pending[method];callbacks.forEach(resolve=>resolve());
};
state.evaluationSnapshot=JSON.stringify({deviceId:'synthetic-device',classes:[{
  id:'synthetic-class',students:[{id:'synthetic-student',attempts:{'1':{
    id:'synthetic-in-progress-attempt',startedAt:1700000000000,
    items:{'synthetic-criterion':{rating:'pass'}},timers:{synthetic:{elapsedMs:42000,running:true}}
  }}}]
}]});
localStorage.setItem('TCCC_SUITE_DB',state.evaluationSnapshot);
const record=(method,args)=>state.calls.push({method,args:copy(args||{})});
const resultError=name=>!state.errors[name]?null:
  typeof state.errors[name]==='string'?{message:state.errors[name]}:copy(state.errors[name]);
const sessionUser=()=>state.session?.user||config.user||null;
const queueEvent=(event,session=state.session)=>setTimeout(()=>{
  state.callbacks.forEach(callback=>callback(event,copy(session)));
},0);
state.emit=(event,session)=>{
  if(session!==undefined)state.session=session;
  queueEvent(event,state.session);
};
const fakeAuth={
  async getSession(){
    record('getSession');
    // An initial recovery event may arrive while startup is reading storage.
    // Only subscribers already installed can observe this event.
    if(config.earlyRecovery){
      state.callbacks.forEach(callback=>callback('PASSWORD_RECOVERY',copy(state.session)));
    }
    return {data:{session:copy(state.session)},error:resultError('getSession')};
  },
  onAuthStateChange(callback){
    record('onAuthStateChange');state.callbacks.push(callback);
    if(config.initialEvent)queueEvent(config.initialEvent);
    return {data:{subscription:{unsubscribe(){
      state.callbacks=state.callbacks.filter(value=>value!==callback);
    }}}};
  },
  async getUser(jwt){
    record('getUser',jwt?{jwt}:{});
    const snapshot=state.verifiedUser||[config.session,config.verifiedSession]
      .find(session=>jwt&&session?.access_token===jwt)?.user||sessionUser();
    await state.wait('getUser');
    return {data:{user:copy(snapshot)},error:resultError('getUser')};
  },
  async setSession(args){
    record('setSession',args);
    const error=resultError('setSession');
    if(!error){state.session=copy(config.verifiedSession||config.session);
      queueEvent(new URLSearchParams(location.hash.slice(1)).get('type')==='recovery'
        ?'PASSWORD_RECOVERY':'SIGNED_IN');}
    return {data:{session:error?null:copy(state.session),user:error?null:sessionUser()},error};
  },
  async resetPasswordForEmail(email,options){
    record('resetPasswordForEmail',{email,options});
    return {data:{},error:resultError('resetPasswordForEmail')};
  },
  async verifyOtp(args){
    record('verifyOtp',args);
    const error=resultError('verifyOtp');
    if(!error){state.session=copy(config.verifiedSession||config.session);
      queueEvent(args.type==='recovery'?'PASSWORD_RECOVERY':'SIGNED_IN');}
    return {data:{session:error?null:copy(state.session),user:error?null:sessionUser()},error};
  },
  async exchangeCodeForSession(code){
    record('exchangeCodeForSession',{code});
    const error=resultError('exchangeCodeForSession');
    if(!error){state.session=copy(config.verifiedSession||config.session);
      queueEvent(config.codeType==='recovery'?'PASSWORD_RECOVERY':'SIGNED_IN');}
    return {data:{session:error?null:copy(state.session),user:error?null:sessionUser()},error};
  },
  async signInWithPassword(args){
    record('signInWithPassword',args);
    const error=resultError('signInWithPassword');
    if(!error){state.session=copy(config.verifiedSession||config.session);
      queueEvent('SIGNED_IN');}
    return {data:{session:error?null:copy(state.session),user:error?null:sessionUser()},error};
  },
  async reauthenticate(){
    record('reauthenticate');return {data:{},error:resultError('reauthenticate')};
  },
  async updateUser(args){
    record('updateUser',args);
    const error=resultError('updateUser');
    if(!error)queueEvent('USER_UPDATED');
    return {data:{user:error?null:copy(sessionUser())},error};
  },
  async signOut(){
    record('signOut');state.session=null;queueEvent('SIGNED_OUT');return {error:null};
  }
};
const rows=table=>{
  if(table==='profiles')return [{id:'synthetic-user',display_name:'Synthetic Evaluator',
    email:'current-user@example.test'}];
  if(table==='memberships')return state.membershipsOverride!==null?copy(state.membershipsOverride):config.noRole?[]:[{id:'synthetic-membership',
    user_id:'synthetic-user',active:true,role:'evaluator',base_id:'test-base',
    bases:{id:'test-base',code:'TEST',name:'Synthetic Installation',active:true,
      majcom_id:'test-command',majcoms:{id:'test-command',active:true}}}];
  throw new Error('Unexpected table read in auth fixture: '+table);
};
const query=table=>({
  select(){return this;},eq(){return this;},
  async maybeSingle(){
    const result={data:rows(table)[0]||null,error:null};
    await state.wait('query.'+table);return result;
  },
  then(resolve,reject){
    const result={data:rows(table),error:null};
    record('query.'+table);
    return state.wait('query.'+table).then(()=>result).then(resolve,reject);
  }
});
window.RAPS_CLOUD_CONFIG={projectUrl:location.origin,publishableKey:'synthetic-test-key'};
window.supabase={createClient:()=>({auth:new Proxy(fakeAuth,{
  get:(target,key)=>key in target?target[key]:(...args)=>{
    record('unexpected.'+String(key),args);throw new Error('Unexpected auth method: '+String(key));
  }
}),from:query})};
if(config.withoutSdk)delete window.supabase;
if(config.cachedIdentity)localStorage.setItem('RAPS_CLOUD_IDENTITY_V1',JSON.stringify(config.cachedIdentity));
if(config.pendingActivation)sessionStorage.setItem('RAPS_PENDING_PASSWORD_SETUP_V1',
  JSON.stringify(config.pendingActivation));
})();
"""


def test_html():
    html = (ROOT / 'index.html').read_text()
    return re.sub(r'<script\s+src="([^"]+)"[^>]*></script>',
                  lambda match: match.group(0) if urlsplit(match.group(1)).path in {'permissions.js', 'cloud-auth.js'} else '',
                  html)


class Harness:
    def __init__(self, browser):
        self.browser = browser
        self.groups = []
        self.unexpected_requests = []
        self.page_errors = []

    def open(self, path='/', **fixture):
        context = self.browser.new_context(service_workers='block')
        context.add_init_script('window.__authFixture=' + json.dumps(fixture) + ';' + FAKE_SDK)

        def fulfill(route):
            request, url = route.request, urlsplit(route.request.url)
            if url.hostname != '127.0.0.1' or url.port != 8767:
                self.unexpected_requests.append({'method': request.method, 'url': request.url})
                return route.abort()
            if url.path == '/auth/v1/user' and request.method == 'PUT':
                recorded = {'method': 'updatePasswordRequest', 'args': request.post_data_json,
                            'headers': request.all_headers()}
                page.evaluate('call=>window.__authTest.calls.push(call)', recorded)
                if fixture.get('switchDuringPasswordRequest'):
                    page.evaluate('next=>window.__authTest.emit("SIGNED_IN",next)',
                                  fixture['switchDuringPasswordRequest'])
                    page.evaluate('()=>new Promise(resolve=>setTimeout(resolve,30))')
                error = page.evaluate('window.__authTest.errors.updateUser||null')
                if error:
                    details = {'message': error} if isinstance(error, str) else error
                    return route.fulfill(status=422, content_type='application/json', body=json.dumps({
                        'msg': details.get('message'), 'message': details.get('message'),
                        'code': details.get('code'), 'error_code': details.get('code'),
                    }))
                authorization = recorded['headers'].get('authorization', '')
                expected_session = next((session for session in (fixture.get('session'), fixture.get('verifiedSession'))
                                         if session and authorization == 'Bearer ' + session['access_token']), None)
                if not expected_session:
                    self.unexpected_requests.append({'method': request.method, 'url': request.url,
                                                     'error': 'Password request did not use fixture session token'})
                    return route.fulfill(status=401, content_type='application/json',
                                         body='{"message":"Invalid synthetic authentication token"}')
                route.fulfill(status=200, content_type='application/json',
                              body=json.dumps(expected_session['user']))
                if fixture.get('switchDuringPasswordRequest'):
                    page.evaluate('window.__authTest.passwordRequestFinished=true')
                return
            if url.path == '/functions/v1/request-access':
                if request.method == 'GET':
                    return route.fulfill(status=200, content_type='application/json', body=json.dumps({
                        'bases': [{'id': 'test-base', 'code': 'TEST', 'name': 'Synthetic Installation'}],
                        'majcoms': [{'id': 'test-command', 'code': 'TEST', 'name': 'Synthetic Command'}],
                    }))
                if request.method == 'POST':
                    return route.fulfill(status=200, content_type='application/json', body=json.dumps({
                        'message': 'Your access request was submitted for administrator review.'}))
            relative = unquote(url.path).lstrip('/') or 'index.html'
            target = (ROOT / relative).resolve()
            if request.method != 'GET' or ROOT not in target.parents or not target.is_file():
                self.unexpected_requests.append({'method': request.method, 'url': request.url})
                return route.abort()
            body = test_html().encode() if relative == 'index.html' else target.read_bytes()
            route.fulfill(status=200, body=body,
                          content_type=mimetypes.guess_type(str(target))[0] or 'application/octet-stream')

        context.route('**/*', fulfill)
        page = context.new_page()
        page.set_default_timeout(5000)
        page.on('pageerror', lambda error: self.page_errors.append(str(error)))
        page.goto(ORIGIN + path, wait_until='networkidle')
        return page

    def done(self, page, description):
        unexpected = page.evaluate('window.__authTest.calls.filter(call=>call.method.startsWith("unexpected."))')
        assert not unexpected, f'{description}: unexpected SDK calls: {unexpected}'
        assert not calls(page, 'updateUser'), \
            f'{description}: password changes must use a captured token rather than mutable SDK session'
        for update in password_updates(page):
            assert update['headers'].get('apikey') == 'synthetic-test-key', \
                f'{description}: password mutation needs the configured public API key'
            assert update['headers'].get('authorization', '').startswith('Bearer synthetic-'), \
                f'{description}: password mutation must use its captured authenticated token'
        assert page.evaluate('localStorage.getItem("TCCC_SUITE_DB")===window.__authTest.evaluationSnapshot'), \
            f'{description}: authentication must preserve local class and assessment records'
        self.groups.append(description)
        page.context.close()


def calls(page, method):
    return page.evaluate('method=>window.__authTest.calls.filter(call=>call.method===method)', method)


def password_updates(page):
    return calls(page, 'updatePasswordRequest')


def submit_password(page, password=PASSWORD, confirmation=PASSWORD):
    page.locator('#cloudActivationPassword').fill(password)
    page.locator('#cloudActivationConfirm').fill(confirmation)
    page.locator('#cloudActivationSubmit').click()


def recovery(harness, **fixture):
    return harness.open('/?raps_activation=1#access_token=synthetic-access-token&'
                        'refresh_token=synthetic-refresh-token&type=recovery',
                        session=SESSION, initialEvent='PASSWORD_RECOVERY', **fixture)


def change_inputs(page, current=CURRENT_PASSWORD, password=PASSWORD, confirmation=PASSWORD):
    page.locator('#cloudChangePasswordCurrent').fill(current)
    page.locator('#cloudChangePasswordPassword').fill(password)
    page.locator('#cloudChangePasswordConfirm').fill(confirmation)


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), headless=True)
        h = Harness(browser)

        page = h.open()
        page.locator('#cloudForgotPasswordBtn').click()
        expect(page.locator('#cloudAuthMessage')).to_contain_text(re.compile(r'email', re.I))
        assert not calls(page, 'resetPasswordForEmail')
        page.locator('#cloudAuthEmail').fill('not-an-email')
        page.locator('#cloudForgotPasswordBtn').click()
        assert not calls(page, 'resetPasswordForEmail'), 'Malformed email must not reach SDK'
        h.done(page, 'Forgot password validates missing and malformed email before SDK call')

        page = h.open()
        page.clock.install()
        page.locator('#cloudAuthEmail').fill('evaluator@example.test')
        page.locator('#cloudForgotPasswordBtn').click()
        expect(page.locator('#cloudAuthMessage')).to_contain_text(re.compile(r'if.*email', re.I))
        requests = calls(page, 'resetPasswordForEmail')
        assert len(requests) == 1
        assert requests[0]['args']['email'] == 'evaluator@example.test'
        redirect = requests[0]['args']['options']['redirectTo']
        assert redirect.startswith(ORIGIN + '/') and 'raps_activation=1' in redirect
        # Dispatch also proves the handler has its own guard, beyond a disabled button.
        page.locator('#cloudForgotPasswordBtn').dispatch_event('click')
        assert len(calls(page, 'resetPasswordForEmail')) == 1
        expect(page.locator('#cloudForgotPasswordBtn')).to_be_disabled()
        page.clock.fast_forward(61_000)
        expect(page.locator('#cloudForgotPasswordBtn')).to_be_enabled()
        h.done(page, 'Recovery email is generic, uses app redirect, and prevents immediate duplicate sends')

        page = h.open(errors={'resetPasswordForEmail': 'Synthetic recovery service unavailable'})
        page.locator('#cloudAuthEmail').fill('evaluator@example.test')
        page.locator('#cloudForgotPasswordBtn').click()
        expect(page.locator('#cloudAuthMessage')).to_have_class(re.compile(r'error'))
        assert len(calls(page, 'resetPasswordForEmail')) == 1
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        h.done(page, 'Recovery request failure stays actionable on Sign In')

        page = h.open('/?raps_activation=1', session=SESSION)
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        assert not password_updates(page)
        h.done(page, 'A URL marker and unrelated existing session do not verify a secure link')

        page = h.open('/?raps_activation=1#error=access_denied&error_code=otp_expired&'
                      'error_description=Email+link+is+invalid+or+has+expired', session=SESSION)
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        expect(page.locator('#cloudAuthMessage')).to_contain_text(re.compile(r'expir|invalid|new.*link', re.I))
        assert not password_updates(page)
        h.done(page, 'Expired secure links cannot reuse an old session to change its password')

        page = h.open('/?raps_activation=1&type=invite&token_hash=synthetic-invite-token',
                      verifiedSession=SESSION)
        expect(page.locator('#cloudActivationGate')).to_be_visible()
        verified = calls(page, 'verifyOtp')
        assert verified and verified[0]['args'] == {'token_hash': 'synthetic-invite-token', 'type': 'invite'}
        submit_password(page, confirmation='Different synthetic password 43!')
        expect(page.locator('#cloudActivationMessage')).to_contain_text(re.compile(r'match', re.I))
        assert not password_updates(page)
        submit_password(page)
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        expect(page.locator('#cloudAuthGate')).not_to_be_visible()
        assert len(password_updates(page)) == 1
        expect(page.locator('#cloudActivationPassword')).to_have_value('')
        expect(page.locator('#cloudActivationConfirm')).to_have_value('')
        assert 'token_hash' not in page.url and 'access_token' not in page.url
        h.done(page, 'Verified invitation requires matching passwords, sets own password, and consumes link')

        page = h.open('/?raps_activation=1&type=invite&token_hash=synthetic-expired-token',
                      session=SESSION, errors={'verifyOtp': 'Token has expired or is invalid'})
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        assert len(calls(page, 'verifyOtp')) == 1
        assert not password_updates(page)
        h.done(page, 'Invalid or already-used invitation is rejected even with an existing session')

        page = h.open('/?raps_activation=1&type=invite&code=synthetic-pkce-code',
                      verifiedSession=SESSION)
        expect(page.locator('#cloudActivationGate')).to_be_visible()
        exchanged = calls(page, 'exchangeCodeForSession')
        assert len(exchanged) == 1 and exchanged[0]['args']['code'] == 'synthetic-pkce-code'
        assert calls(page, 'getUser'), 'Code exchange must validate its user before password setup'
        h.done(page, 'PKCE invitation exchanges its one-time code and verifies the resulting user')

        page = recovery(h, errors={'getUser': 'Synthetic expired authentication token'})
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        assert not password_updates(page)
        h.done(page, 'An implicit link without a server-verified user cannot authorize password setup')

        page = recovery(h, verifiedUser={'id': 'different-user', 'email': 'other@example.test'})
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        assert not password_updates(page)
        h.done(page, 'A verified user that differs from secure-link session is rejected')

        page = recovery(h, earlyRecovery=True)
        expect(page.locator('#cloudActivationGate')).to_be_visible()
        methods = [call['method'] for call in page.evaluate('window.__authTest.calls')]
        assert methods.index('onAuthStateChange') < methods.index('getSession')
        bound = calls(page, 'setSession')
        assert bound and bound[0]['args'] == {
            'access_token': 'synthetic-access-token', 'refresh_token': 'synthetic-refresh-token'}
        assert calls(page, 'getUser'), 'Implicit secure link must be validated before setup'
        submit_password(page, password='short', confirmation='short')
        assert not password_updates(page), 'Short passwords must be rejected before SDK update'
        submit_password(page)
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        expect(page.locator('#cloudAuthGate')).not_to_be_visible()
        # A subsequent SDK USER_UPDATED event must not reopen consumed activation.
        page.evaluate('window.__authTest.emit("USER_UPDATED")')
        page.evaluate('()=>new Promise(resolve=>setTimeout(resolve,30))')
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        assert page.evaluate('window.RAPS_CLOUD?.connected')
        h.done(page, 'Recovery event survives startup ordering and USER_UPDATED does not reopen password setup')

        page = recovery(h)
        expect(page.locator('#cloudActivationGate')).to_be_visible()
        assert 'access_token' not in page.url
        page.reload(wait_until='networkidle')
        expect(page.locator('#cloudActivationGate')).to_be_visible()
        assert not page.evaluate('window.RAPS_CLOUD?.connected')
        submit_password(page)
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        assert page.evaluate('sessionStorage.getItem("RAPS_PENDING_PASSWORD_SETUP_V1")') is None
        page.reload(wait_until='networkidle')
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        expect(page.locator('#cloudAuthGate')).not_to_be_visible()
        h.done(page, 'Verified password setup survives safe URL cleanup and reload until successful completion')

        page = recovery(h)
        expect(page.locator('#cloudActivationGate')).to_be_visible()
        page.locator('#cloudActivationPassword').fill(PASSWORD)
        page.locator('#cloudActivationConfirm').fill(PASSWORD)
        page.locator('#cloudActivationBack').click()
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        expect(page.locator('#cloudActivationPassword')).to_have_value('')
        expect(page.locator('#cloudActivationConfirm')).to_have_value('')
        assert page.evaluate('sessionStorage.getItem("RAPS_PENDING_PASSWORD_SETUP_V1")') is None
        assert not password_updates(page)
        h.done(page, 'Back to Sign In clears unfinished password fields and its resume marker')

        page = recovery(h, noRole=True, cachedIdentity=CACHED_IDENTITY)
        expect(page.locator('#cloudActivationGate')).to_be_visible()
        submit_password(page)
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        expect(page.locator('#cloudAuthMessage')).to_contain_text(re.compile(r'role|scope|access', re.I))
        expect(page.locator('#cloudIdentityText')).not_to_contain_text('Cloud connected')
        assert not page.evaluate('window.RAPS_CLOUD?.connected')
        assert page.evaluate('localStorage.getItem("RAPS_CLOUD_IDENTITY_V1")') is None
        h.done(page, 'Password success does not grant application access to an account with no active role')

        page = recovery(h, errors={'updateUser': 'Synthetic password policy rejected this password'})
        expect(page.locator('#cloudActivationGate')).to_be_visible()
        submit_password(page)
        expect(page.locator('#cloudActivationMessage')).to_have_class(re.compile(r'error'))
        expect(page.locator('#cloudActivationGate')).to_be_visible()
        assert len(password_updates(page)) == 1
        expect(page.locator('#cloudActivationSubmit')).to_be_enabled()
        h.done(page, 'Password update failure keeps setup available without granting access')

        page = h.open(session=SESSION)
        expect(page.locator('#cloudAuthGate')).not_to_be_visible()
        page.evaluate('document.getElementById("cloudAuthEmail").value="another-account@example.test"')
        page.locator('#cloudChangePasswordBtn').click()
        expect(page.locator('#cloudChangePasswordGate')).to_be_visible()
        change_inputs(page)
        page.locator('#cloudChangePasswordSubmit').click()
        expect(page.locator('#cloudChangePasswordMessage')).to_have_class(re.compile(r'success'))
        signins = calls(page, 'signInWithPassword')
        assert len(signins) == 1 and signins[0]['args']['email'] == USER['email']
        assert signins[0]['args']['password'] == CURRENT_PASSWORD
        updates = password_updates(page)
        assert len(updates) == 1 and updates[0]['args'] == {'password': PASSWORD}
        for selector in ('Current', 'Password', 'Confirm'):
            expect(page.locator('#cloudChangePassword' + selector)).to_have_value('')
        assert page.evaluate('window.RAPS_CLOUD?.user?.id') == USER['id']
        h.done(page, 'Signed-in password change reauthenticates current user and clears all secret fields')

        page = h.open(session=SESSION)
        page.locator('#cloudChangePasswordBtn').click()
        change_inputs(page, confirmation='A different synthetic password 43!')
        page.locator('#cloudChangePasswordSubmit').click()
        expect(page.locator('#cloudChangePasswordMessage')).to_contain_text(re.compile(r'match', re.I))
        assert not calls(page, 'signInWithPassword') and not password_updates(page)
        h.done(page, 'Signed-in password confirmation validates before reauthentication or update')

        page = h.open(session=SESSION, errors={'signInWithPassword': 'Invalid login credentials'})
        page.locator('#cloudChangePasswordBtn').click()
        change_inputs(page)
        page.locator('#cloudChangePasswordSubmit').click()
        expect(page.locator('#cloudChangePasswordMessage')).to_have_class(re.compile(r'error'))
        assert len(calls(page, 'signInWithPassword')) == 1
        assert not password_updates(page)
        expect(page.locator('#cloudChangePasswordCurrent')).to_have_value('')
        assert page.evaluate('window.RAPS_CLOUD?.connected')
        h.done(page, 'Incorrect current password cannot update password or sign user out of current work')

        page = h.open(session=SESSION, errors={'updateUser': 'Synthetic password change unavailable'})
        page.locator('#cloudChangePasswordBtn').click()
        change_inputs(page)
        page.locator('#cloudChangePasswordSubmit').click()
        expect(page.locator('#cloudChangePasswordMessage')).to_have_class(re.compile(r'error'))
        assert len(password_updates(page)) == 1
        assert page.evaluate('window.RAPS_CLOUD?.connected')
        expect(page.locator('#cloudChangePasswordSubmit')).to_be_enabled()
        h.done(page, 'Signed-in update errors leave existing evaluator access available for retry')

        page = h.open(session=SESSION, errors={'updateUser': {
            'code': 'reauthentication_needed',
            'message': 'Password update requires recent authentication',
        }})
        page.locator('#cloudChangePasswordBtn').click()
        change_inputs(page)
        page.locator('#cloudChangePasswordSubmit').click()
        expect(page.locator('#cloudChangePasswordVerification')).to_be_visible()
        page.locator('#cloudChangePasswordCodeBtn').click()
        assert len(calls(page, 'reauthenticate')) == 1
        page.evaluate('window.__authTest.errors.updateUser=null')
        change_inputs(page)
        page.locator('#cloudChangePasswordNonce').fill('123456')
        page.locator('#cloudChangePasswordSubmit').click()
        expect(page.locator('#cloudChangePasswordMessage')).to_have_class(re.compile(r'success'))
        updates = password_updates(page)
        assert len(updates) == 2
        assert updates[-1]['args'] == {'password': PASSWORD, 'nonce': '123456'}
        expect(page.locator('#cloudChangePasswordNonce')).to_have_value('')
        h.done(page, 'Provider-required email reauthentication uses a verification nonce before password update')

        page = h.open(session=SESSION)
        page.locator('#cloudChangePasswordBtn').click()
        change_inputs(page)
        page.locator('#cloudChangePasswordCancel').click()
        expect(page.locator('#cloudChangePasswordGate')).not_to_be_visible()
        for selector in ('Current', 'Password', 'Confirm'):
            expect(page.locator('#cloudChangePassword' + selector)).to_have_value('')
        assert not calls(page, 'signInWithPassword') and not password_updates(page)
        expect(page.locator('#cloudAuthGate')).not_to_be_visible()
        h.done(page, 'Cancelling password change clears secrets and returns to evaluator workflow')

        page = h.open(session=SESSION)
        page.locator('#cloudChangePasswordBtn').click()
        change_inputs(page)
        page.evaluate('window.__authTest.paused.getUser=true')
        page.locator('#cloudChangePasswordSubmit').click()
        page.wait_for_function('()=>window.__authTest.pending.getUser?.length>0')
        page.evaluate('next=>window.__authTest.emit("SIGNED_IN",next)', OTHER_SESSION)
        page.wait_for_function('()=>!window.RAPS_CLOUD?.user')
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        expect(page.locator('#cloudChangePasswordGate')).not_to_be_visible()
        page.evaluate('window.__authTest.release("getUser")')
        page.evaluate('()=>new Promise(resolve=>setTimeout(resolve,30))')
        assert not password_updates(page)
        for selector in ('Current', 'Password', 'Confirm'):
            expect(page.locator('#cloudChangePassword' + selector)).to_have_value('')
        h.done(page, 'Different-account event during password verification clears identity and blocks update')

        page = h.open(session=SESSION, switchDuringPasswordRequest=OTHER_SESSION)
        page.locator('#cloudChangePasswordBtn').click()
        change_inputs(page)
        page.locator('#cloudChangePasswordSubmit').click()
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        expect(page.locator('#cloudChangePasswordGate')).not_to_be_visible()
        updates = password_updates(page)
        assert len(updates) == 1
        assert updates[0]['headers']['authorization'] == 'Bearer ' + SESSION['access_token']
        assert page.evaluate('window.__authTest.session.user.id') == OTHER_SESSION['user']['id']
        assert not page.evaluate('window.RAPS_CLOUD?.user')
        page.wait_for_function('()=>window.__authTest.passwordRequestFinished===true')
        h.done(page, 'An account switch after password request starts cannot retarget its captured bearer token')

        for path, errors in (
            ('/?raps_activation=1', {}),
            ('/?raps_activation=1&type=invite&token_hash=synthetic-invalid',
             {'verifyOtp': 'Synthetic invalid invite token'}),
        ):
            page = h.open(path, session=SESSION, errors=errors)
            expect(page.locator('#cloudAuthGate')).to_be_visible()
            page.evaluate('window.__authTest.emit("TOKEN_REFRESHED")')
            page.evaluate('()=>new Promise(resolve=>setTimeout(resolve,30))')
            expect(page.locator('#cloudAuthGate')).to_be_visible()
            expect(page.locator('#cloudActivationGate')).not_to_be_visible()
            assert not page.evaluate('window.RAPS_CLOUD?.user')
            page.locator('#cloudAuthEmail').fill(USER['email'])
            page.locator('#cloudAuthPassword').fill(CURRENT_PASSWORD)
            page.locator('#cloudAuthSubmit').click()
            expect(page.locator('#cloudAuthGate')).not_to_be_visible()
            assert page.evaluate('window.RAPS_CLOUD?.connected')
            h.done(page, 'Invalid secure link blocks old-session token refresh until explicit sign-in: ' +
                   ('failed verification' if errors else 'marker only'))

        page = h.open('/?raps_activation=1', withoutSdk=True, cachedIdentity=CACHED_IDENTITY)
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        assert not page.evaluate('window.RAPS_CLOUD?.offlineCached')
        h.done(page, 'Incoming secure-link intent cannot fall back to a cached identity without the auth SDK')

        page = h.open(session=SESSION, cachedIdentity=CACHED_IDENTITY,
                      pendingActivation={'userId': USER['id'], 'expiresAt': 4102444800000},
                      errors={'getUser': 'Synthetic failed pending-session verification'})
        expect(page.locator('#cloudActivationGate')).not_to_be_visible()
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        assert not page.evaluate('window.RAPS_CLOUD?.offlineCached')
        page.evaluate('window.__authTest.emit("TOKEN_REFRESHED")')
        page.evaluate('()=>new Promise(resolve=>setTimeout(resolve,30))')
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        assert not page.evaluate('window.RAPS_CLOUD?.user')
        h.done(page, 'Failed resumed-setup verification cannot fall back to cache or accept old-session refresh')

        page = h.open(session=SESSION)
        expect(page.locator('#cloudAuthGate')).not_to_be_visible()
        admin_membership = dict(MEMBERSHIP, role='enterprise_admin', base_id=None, bases=None)
        page.evaluate('membership=>{window.__authTest.membershipsOverride=[membership];'
                      'window.__authTest.paused["query.memberships"]=true;'
                      'window.__authTest.emit("TOKEN_REFRESHED")}', admin_membership)
        page.wait_for_function('()=>window.__authTest.pending["query.memberships"]?.length>0')
        initial_queries = len(calls(page, 'query.memberships'))
        page.evaluate('membership=>{window.__authTest.membershipsOverride=[membership];'
                      'window.__authTest.paused["query.memberships"]=false;'
                      'window.__authTest.emit("TOKEN_REFRESHED")}', MEMBERSHIP)
        page.wait_for_function('count=>window.__authTest.calls.filter(call=>call.method==="query.memberships").length>count',
                               arg=initial_queries)
        expect(page.locator('#cloudIdentityText')).to_contain_text('Evaluator')
        page.evaluate('window.__authTest.release("query.memberships")')
        page.evaluate('()=>new Promise(resolve=>setTimeout(resolve,30))')
        assert page.evaluate('window.RAPS_CLOUD?.role') == 'evaluator'
        h.done(page, 'A delayed older privileged role lookup cannot overwrite a newer same-user role response')

        expired_membership = dict(MEMBERSHIP, ends_at='2000-01-01T00:00:00Z')
        expired_cache = dict(CACHED_IDENTITY, memberships=[expired_membership],
                             primaryMembership=expired_membership)
        page = h.open(errors={'getSession': 'Synthetic offline session lookup'},
                      cachedIdentity=expired_cache)
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        assert not page.evaluate('window.RAPS_CLOUD?.offlineCached')
        h.done(page, 'An expired cached primary membership cannot provide offline evaluator access')

        legacy_membership = dict(MEMBERSHIP, bases={'id': 'test-base', 'code': 'TEST'})
        legacy_cache = dict(CACHED_IDENTITY, memberships=[legacy_membership],
                            primaryMembership=legacy_membership)
        page = h.open(withoutSdk=True, cachedIdentity=legacy_cache)
        expect(page.locator('#cloudAuthGate')).not_to_be_visible()
        assert page.evaluate('window.RAPS_CLOUD?.offlineCached')
        h.done(page, 'Legacy cached memberships retain authorized offline evaluator access')

        for invalid_membership, label in [
            (dict(MEMBERSHIP, role='enterprise_admin'), 'Enterprise access with an installation scope'),
            (dict(MEMBERSHIP, user_id='different-user'), 'A membership belonging to another account'),
            (dict(MEMBERSHIP, active='true'), 'A non-boolean active flag'),
            (dict(MEMBERSHIP, bases=None), 'A hidden installation in a connected scope lookup'),
            (dict(MEMBERSHIP, bases={'id': 'test-base', 'active': True,
                                    'majcoms': None}), 'A hidden parent MAJCOM in a connected scope lookup'),
            (dict(MEMBERSHIP, role='majcom_manager', base_id=None, bases=None,
                  majcom_id='test-command', majcoms=None), 'A hidden assigned MAJCOM in a connected scope lookup'),
            (dict(MEMBERSHIP, bases={'id': 'test-base', 'active': True,
                                    'majcoms': {'active': False}}), 'An inactive parent MAJCOM')
        ]:
            page = h.open(session=SESSION)
            expect(page.locator('#cloudAuthGate')).not_to_be_visible()
            page.evaluate('membership=>{window.__authTest.membershipsOverride=[membership];'
                          'window.__authTest.emit("TOKEN_REFRESHED")}', invalid_membership)
            expect(page.locator('#cloudAuthGate')).to_be_visible()
            assert not page.evaluate('window.RAPS_CLOUD?.user')
            h.done(page, label + ' cannot authorize the application')

        page = h.open(session=SESSION)
        expect(page.locator('#cloudAuthGate')).not_to_be_visible()
        page.evaluate('membership=>{membership.ends_at=new Date(Date.now()+1000).toISOString();'
                      'window.__authTest.membershipsOverride=[membership];'
                      'window.__authTest.emit("TOKEN_REFRESHED")}', MEMBERSHIP)
        page.wait_for_function('()=>!!window.RAPS_CLOUD?.primaryMembership?.ends_at')
        expect(page.locator('#cloudAuthGate')).to_be_visible(timeout=5000)
        assert not page.evaluate('window.RAPS_CLOUD?.user')
        h.done(page, 'Membership expiration closes access while the application remains open')

        page = h.open(session=SESSION)
        expect(page.locator('#cloudAuthGate')).not_to_be_visible()
        page.once('dialog', lambda dialog: dialog.accept())
        page.locator('#cloudLogoutBtn').click()
        expect(page.locator('#cloudAuthGate')).to_be_visible()
        assert not page.evaluate('window.RAPS_CLOUD?.user')
        assert page.evaluate('localStorage.getItem("RAPS_CLOUD_IDENTITY_V1")') is None
        h.done(page, 'Sign Out clears cloud authorization while retaining local assessment records')

        page = h.open()
        page.locator('#cloudRequestAccessBtn').click()
        expect(page.locator('#cloudRequestAccessScope option')).to_have_count(1)
        expect(page.locator('#cloudRequestAccessGate')).to_contain_text(
            re.compile(r'does not create an account|does not.*grant access', re.I))
        page.locator('#cloudRequestAccessName').fill('Synthetic Evaluator')
        page.locator('#cloudRequestAccessEmail').fill('evaluator@example.test')
        page.locator('#cloudRequestAccessSubmit').click()
        expect(page.locator('#cloudRequestAccessMessage')).to_contain_text('administrator review')
        assert not calls(page, 'signInWithPassword') and not password_updates(page)
        assert not page.evaluate('window.RAPS_CLOUD?.connected')
        h.done(page, 'Access request correctly requires administrator review without creating or authorizing account')

        browser.close()
        result = {'groups_passed': len(h.groups), 'groups': h.groups,
                  'unexpected_requests': h.unexpected_requests, 'page_errors': h.page_errors}
        print(json.dumps(result, indent=2))
        assert not h.unexpected_requests, 'Unexpected network request attempted'
        assert not h.page_errors, 'Browser JavaScript errors occurred'


if __name__ == '__main__':
    main()
