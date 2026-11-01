"""Durable device storage in a real browser (IndexedDB plus the localStorage cache).

Run: python tests/browser-device-storage.py
Requires Python Playwright and Chromium (or set CHROMIUM_EXECUTABLE).
Reuses the isolated fixture from browser-workflow.py. No request leaves the page.

Checks:
1. When the localStorage cache is full, saving still succeeds. Closed and fully
   synced classes move to IndexedDB only. A class with unsynced field work stays
   complete in the cache.
2. After a reload, every class is restored, including the IndexedDB-only ones.
3. If the cache is wiped (as a browser may do), the whole database and the
   device identity are restored from IndexedDB.
4. A deleted class stays deleted after a reload.
"""

import importlib.util
import json
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('browser_workflow', ROOT / 'tests' / 'browser-workflow.py')
workflow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workflow)

EXTRA_ADAPTER = r"""
window.__storageTest = {
  seed() {
    const t=deep(TIERS['1']),uid=currentCloudUserId(),pad='Evaluator narrative. '.repeat(400);
    const mk=(id,closed)=>({id,name:id,tierId:'1',tierSnapshot:t,status:closed?'closed':'active',closedAt:closed?now()-86400000:null,
      homeInstallationId:'TEST',localCreatedByUserId:uid,cloudSync:{enabled:true,status:'synced',createdBy:uid},cloudRosterSync:{status:'synced'},
      scenarioNT:[],students:[{id:id+'-s',name:'Learner',attempts:{'1':{id:id+'-a',attemptNo:1,startedAt:now()-7200000,finalizedAt:now()-3600000,
        finalResult:'PASS',ratings:{},notes:{x:pad},timers:{},events:[],cloudGrading:{status:'synced'}}}}]});
    const active=mk('active-field-class',false);
    Object.assign(active.students[0].attempts['1'],{finalizedAt:now()-60000,pendingServerClaim:true,pendingServerFinalization:true,cloudGrading:{status:'offline'}});
    db={schemaVersion:5,deviceId:'device-storage-test',classes:[active,...[1,2,3,4,5,6].map(n=>mk('closed-class-'+n,true))]};
  },
  limitCache(chars) {
    window.__realSetItem=window.__realSetItem||Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key===DB_KEY&&String(value).length>chars)throw new DOMException('Synthetic quota','QuotaExceededError');
      return window.__realSetItem.call(this,key,value);
    };
  },
  unlimit(){ if(window.__realSetItem)Storage.prototype.setItem=window.__realSetItem; },
  save(){ writeDbSnapshot(db); return idbWriteChain.then(()=>true); },
  cache(){ const raw=JSON.parse(localStorage.getItem(DB_KEY)); return raw.classes.map(c=>({id:c.id,stub:!!c.archivedToDevice,size:JSON.stringify(c).length})); },
  async durable(){
    const d=await idbOpen(); const tx=d.transaction(['classes','meta'],'readonly');
    const all=await new Promise(r=>{const q=tx.objectStore('classes').getAllKeys();q.onsuccess=()=>r(q.result);});
    return all.sort();
  },
  ready(){ return window.rapsDeviceStorageReady.then(()=>idbWriteChain).then(()=>true); },
  ids(){ return db.classes.map(c=>c.id).sort(); },
  device(){ return db.deviceId; },
  active(){ return deep(db.classes.find(c=>c.id==='active-field-class')?.students[0].attempts['1']||null); },
  remove(id){ db.classes=db.classes.filter(c=>c.id!==id); return this.save(); },
};
"""


def main():
    checks, errors, external = [], [], []
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
        page.set_default_timeout(8000)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('dialog', lambda dialog: dialog.dismiss())

        def load():
            page.goto(workflow.ORIGIN + '/', wait_until='networkidle')
            page.wait_for_function('!!window.__storageTest')
            page.evaluate('window.__storageTest.ready()')

        load()
        page.evaluate('window.__storageTest.seed()')
        page.evaluate('window.__storageTest.limitCache(60000)')
        assert page.evaluate('window.__storageTest.save()')
        cache = {c['id']: c for c in page.evaluate('window.__storageTest.cache()')}
        assert cache['active-field-class']['stub'] is False, 'Unsynced field work must stay in the cache'
        assert cache['active-field-class']['size'] > 8000, 'The active class is complete in the cache'
        assert all(cache[f'closed-class-{n}']['stub'] for n in range(1, 7)), cache
        durable = page.evaluate('window.__storageTest.durable()')
        assert len(durable) == 7, durable
        checks.append('a full cache no longer fails saving; closed classes move to durable storage, unsynced work stays')

        page.evaluate('window.__storageTest.unlimit()')
        load()
        assert len(page.evaluate('window.__storageTest.ids()')) == 7
        active = page.evaluate('window.__storageTest.active()')
        assert active['pendingServerFinalization'] is True and active['finalResult'] == 'PASS'
        checks.append('after a reload, all classes are restored, including durable-only ones')

        device = page.evaluate('window.__storageTest.device()')
        page.evaluate("localStorage.removeItem('TCCC_SUITE_DB')")
        load()
        assert len(page.evaluate('window.__storageTest.ids()')) == 7, 'Whole database restored from IndexedDB'
        assert page.evaluate('window.__storageTest.device()') == device, 'Device identity restored'
        assert page.evaluate('window.__storageTest.active()')['pendingServerFinalization'] is True
        checks.append('a wiped cache is recovered from durable storage with the same device identity')

        assert page.evaluate("window.__storageTest.remove('closed-class-3')")
        load()
        ids = page.evaluate('window.__storageTest.ids()')
        assert 'closed-class-3' not in ids and len(ids) == 6, ids
        assert 'closed-class-3' not in page.evaluate('window.__storageTest.durable()')
        checks.append('a deleted class stays deleted after a reload')
        browser.close()

    assert not errors, errors
    assert not external, external
    print(json.dumps({'checks': checks, 'external_requests': len(external), 'page_errors': len(errors)}, indent=2))


if __name__ == '__main__':
    main()
