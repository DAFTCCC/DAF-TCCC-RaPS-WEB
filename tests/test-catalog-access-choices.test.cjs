'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function functionSource(file, name) {
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const start=source.search(new RegExp(`^function ${name}\\(`,'m'));
  assert.ok(start>=0,name);
  for(let end=source.indexOf('}',start);end>=0;end=source.indexOf('}',end+1)) {
    const candidate=source.slice(start,end+1);
    try {new vm.Script(`(${candidate})`);return candidate;}
    catch(error) {if(!(error instanceof SyntaxError))throw error;}
  }
  throw new Error('Cannot parse '+name);
}

const catalog={bases:[
  {id:'physical-1',code:'BEALE',name:'Beale AFB'},
  {id:'physical-2',code:'JBPHH',name:'Joint Base Pearl Harbor-Hickam'},
  {id:'legacy-1',code:'TEST-BEALE',name:'Beale AFB (TEST)'}
],majcoms:[{id:'acc',code:'ACC',name:'ACC'},{id:'test',code:'TEST',name:'TEST'}]};

for (const kind of ['admin','request']) {
  function render(role) {
    const nodes=new Map();
    const lookup=id=>{
      if(!nodes.has(id))nodes.set(id,{value:role,innerHTML:'',textContent:'',classList:{toggle(){}}});
      return nodes.get(id);
    };
    const context=vm.createContext({catalog,accessCatalog:catalog,$:lookup,byId:lookup,esc:String,
      roleScope:role=>role==='majcom_manager'?'majcom':'base'});
    const file=kind==='admin'?'admin-ui.js':'cloud-auth.js';
    const fn=kind==='admin'?'renderScope':'renderRequestAccessScope';
    vm.runInContext(functionSource(file,fn),context);
    if(kind==='admin')context[fn]('Managed');else context[fn]();
    return lookup(kind==='admin'?'adminManagedScope':'cloudRequestAccessScope').innerHTML;
  }
  test(kind+' new installation choices use physical IDs and omit legacy duplicates',()=>{
    const html=render('evaluator');
    assert.match(html,/value="physical-1"/);
    assert.match(html,/value="physical-2"/);
    assert.doesNotMatch(html,/legacy-1|TEST-BEALE/);
    assert.equal(catalog.bases.length,3,'Filtering choices does not mutate retained catalog data');
  });
  test(kind+' retains TEST alongside ordinary MAJCOM choices',()=>{
    const html=render('majcom_manager');
    assert.match(html,/value="acc"/);
    assert.match(html,/value="test"/);
  });
}
