'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const build={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'version.js'),'utf8'),build);
const worker={self:{addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8')+';globalThis.release={version:VERSION,cache:CACHE_NAME,shell:SHELL};',worker);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('HTML loads the same versioned local scripts and styles that the worker precaches',()=>{
  const cached=new Set(worker.release.shell.map(value=>new URL(value,'https://test.invalid/').href));
  const references=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)\?[^"]+)"/g)].map(match=>match[1]);
  assert.ok(references.length>=15);
  for(const reference of references)assert.ok(cached.has(new URL(reference,'https://test.invalid/').href),reference);
});

test('service worker and update checker identify the current app release',()=>{
  const version=build.window.TCCC_BUILD.versionName;
  assert.equal(worker.release.version,version);
  assert.ok(worker.release.cache.endsWith(version.replace(/[.-]/g,'-')));
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.ok(app.includes(`const UPDATE_BUILD = '${version}';`));
});

test('every precached local asset exists and no API or external response is precached',()=>{
  for(const reference of worker.release.shell){
    const url=new URL(reference,'https://test.invalid/');
    assert.equal(url.origin,'https://test.invalid');
    assert.ok(!/^\/(auth|rest|functions|storage)\//.test(url.pathname));
    const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
    assert.ok(fs.statSync(path.join(root,file)).isFile(),reference);
  }
});
