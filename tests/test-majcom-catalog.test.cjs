'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const copy = value => JSON.parse(JSON.stringify(value));
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
function readCatalog(source) {
  const window = {};
  vm.runInNewContext(source, {window});
  return window.TCCC_INSTALLATION_DATA;
}
const catalog = readCatalog(fs.readFileSync(path.join(ROOT, 'installations.js'), 'utf8'));
const previous = readCatalog(execFileSync('git', ['show', '05f7ccd16e30f468ccb5f1b195eeb2927324ad02:installations.js'],
  {cwd:ROOT, encoding:'utf8'}));
const physical = catalog.installations;
const legacy = catalog.legacyInstallations;

function functionSource(name) {
  const start = app.search(new RegExp(`^function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `Missing ${name}`);
  for (let end = app.indexOf('}', start); end >= 0; end = app.indexOf('}', end + 1)) {
    const candidate = app.slice(start, end + 1);
    try { new vm.Script(`(${candidate})`); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error(`Cannot parse ${name}`);
}
const names = ['installationById', 'installationDisplay', 'isTestInstallation', 'classInstallationChoices',
  'classLocationIssue', 'inferInstallationId', 'ensureLocationFields', 'applyClassLocationFields', 'classLocationExportValues'];
const h = vm.runInNewContext(`(() => {
  const LOCATION_DATA=catalog;
  ${names.map(functionSource).join('\n')}
  return {${names.join(',')}};
})()`, {catalog});

test('TEST adds one supported command without duplicating the installation catalog', () => {
  assert.deepEqual(copy(catalog.commands.filter(row => row.id !== 'TEST')), copy(previous.commands));
  assert.deepEqual(copy(physical), copy(previous.installations));
  assert.equal(catalog.commands.filter(row => row.id === 'TEST').length, 1);
  assert.equal(physical.length, 73);
  assert.equal(catalog.installations.length, 73);
  assert.equal(catalog.commands.length, 12);
  assert.equal(new Set(catalog.installations.map(row => row.id)).size, catalog.installations.length);
});

test('previously deployed TEST copies remain resolvable only through the legacy catalog', () => {
  assert.equal(legacy.length, physical.length);
  for (const original of physical) {
    const copies = legacy.filter(row => row.sourceInstallationId === original.id);
    assert.equal(copies.length, 1, original.id);
    const row = copies[0];
    assert.equal(row.id, `TEST-${original.id}`);
    assert.equal(row.name, `${original.name} (TEST)`);
    assert.equal(row.shortName, `${original.shortName || original.name} (TEST)`);
    assert.deepEqual(copy(row.commands), ['TEST']);
    assert.equal(row.hostCommand, 'TEST');
    assert.equal(h.installationById(row.id), row);
    for (const key of ['state', 'country', 'component', 'active', 'joint']) assert.equal(row[key], original[key]);
    assert.ok(row.aliases.every(alias => alias.endsWith(' (TEST)')));
  }
});

test('TEST home and training pickers use all 73 ordinary installation IDs', () => {
  for (const options of [{}, {showAll:true}, {training:true}]) {
    const rows = h.classInstallationChoices('TEST', options);
    assert.equal(rows.length, physical.length);
    assert.deepEqual(copy(rows.map(row => row.id).sort()), copy(physical.map(row => row.id).sort()));
    assert.ok(rows.every(row => !row.sourceInstallationId));
  }
});

test('every command shares the same Show all and training location catalogs', () => {
  for (const command of ['', ...previous.commands.map(row => row.id)]) {
    for (const options of [{showAll:true}, {training:true}]) {
      const rows = h.classInstallationChoices(command, options);
      assert.equal(rows.length, physical.length);
      assert.ok(rows.every(row => !row.sourceInstallationId));
    }
  }
});

test('each real command keeps its original joint and tenant installation choices', () => {
  for (const command of previous.commands.filter(row => row.id !== 'OTHER')) {
    const expected = copy(physical.filter(row => row.commands.includes(command.id)).map(row => row.id).sort());
    assert.deepEqual(copy(h.classInstallationChoices(command.id).map(row => row.id).sort()), expected);
  }
});

test('inactive, unsupported-component, and legacy installation rows are never new choices', () => {
  const active = catalog.installations[0];
  const injected = {...catalog, installations:[...catalog.installations,
    {...active, id:'INACTIVE', active:false}, {...active, id:'RESERVE', component:'RESERVE'}, ...legacy]};
  const choices = vm.runInNewContext(`(() => {
    const LOCATION_DATA=catalog;
    ${['installationDisplay','isTestInstallation','classInstallationChoices'].map(functionSource).join('\n')}
    return classInstallationChoices('',{showAll:true});
  })()`, {catalog:injected});
  assert.equal(choices.length, physical.length);
});

test('TEST and ordinary commands accept the same physical, tenant, and custom relationships', () => {
  for (const value of [
    {majcom:'TEST', homeInstallationId:'BEALE', sameTrainingLocation:'on'},
    {majcom:'TEST', homeInstallationId:'BEALE', trainingInstallationId:'JB-ANDREWS'},
    {majcom:'TEST', homeInstallationId:'BEALE', trainingInstallationId:'__OTHER__'},
    {majcom:'TEST', homeInstallationId:'__OTHER__', customHomeLocation:'Expeditionary Site'},
    {majcom:'AMC', homeInstallationId:'BEALE', trainingInstallationId:'JB-ANDREWS'},
    {majcom:'OTHER', homeInstallationId:'__OTHER__', customHomeLocation:'Expeditionary Site'}
  ]) assert.equal(h.classLocationIssue(value), '');
});

for (const value of [
  {majcom:'TEST', homeInstallationId:'TEST-BEALE'},
  {majcom:'ACC', homeInstallationId:'TEST-BEALE'},
  {majcom:'', homeInstallationId:'TEST-BEALE'},
  {majcom:'TEST', homeInstallationId:'BEALE', trainingInstallationId:'TEST-BEALE'},
  {majcom:'ACC', homeInstallationId:'BEALE', trainingInstallationId:'TEST-BEALE'}
]) test(`new classes cannot select legacy synthetic IDs: ${JSON.stringify(value)}`, () => {
  const before = copy(value);
  assert.ok(h.classLocationIssue(value));
  assert.deepEqual(value, before, 'Validation does not mutate imported or restored metadata');
});

test('saving and exporting TEST uses the ordinary base ID while preserving its supported command', () => {
  const row = h.applyClassLocationFields({}, {majcom:'TEST', homeInstallationId:'BEALE', sameTrainingLocation:'on'});
  assert.equal(row.majcom, 'TEST');
  assert.equal(row.homeInstallationId, 'BEALE');
  assert.equal(row.homeInstallationName, 'Beale AFB');
  assert.equal(row.trainingInstallationId, 'BEALE');
  const exported = copy(h.classLocationExportValues(row));
  assert.deepEqual(exported.slice(0, 5), ['ACTIVE_DUTY','TEST','BEALE','Beale AFB','ACC']);
  assert.equal(exported[8], 'BEALE');
});

test('JSON-restored physical and legacy records retain their stable IDs and saved supported command', () => {
  for (const id of ['BEALE', 'TEST-BEALE']) {
    const original = h.installationById(id);
    const restored = JSON.parse(JSON.stringify({majcom:'TEST', homeInstallationId:id, trainingLocationType:'SAME_AS_HOME'}));
    h.ensureLocationFields(restored);
    assert.equal(restored.homeInstallationId, id);
    assert.equal(restored.homeInstallationName, original.name);
    assert.equal(restored.trainingInstallationId, id);
    assert.equal(restored.majcom, 'TEST');
    assert.equal(h.classLocationIssue({...restored,sameTrainingLocation:'on'},restored), '');
  }
});

test('legacy editing preserves original locations but does not adopt another synthetic base', () => {
  const existing={majcom:'TEST',homeInstallationId:'TEST-BEALE',trainingInstallationId:'TEST-JB-ANDREWS'};
  for (const majcom of ['TEST','ACC']) {
    const data={...existing,majcom};
    assert.equal(h.classLocationIssue(data,existing), '');
    const saved=h.applyClassLocationFields(copy(existing),data);
    assert.equal(saved.homeInstallationId,existing.homeInstallationId);
    assert.equal(saved.trainingInstallationId,existing.trainingInstallationId);
  }
  assert.ok(h.classLocationIssue({...existing,homeInstallationId:'TEST-EDWARDS'},existing));
  assert.ok(h.classLocationIssue({...existing,trainingInstallationId:'TEST-EDWARDS'},existing));
});

test('legacy installation name inference never converts real records into TEST records', () => {
  for (const original of physical) {
    for (const label of [original.name, original.shortName, ...original.aliases]) {
      const id = h.inferInstallationId(label);
      assert.ok(!id.startsWith('TEST-'), `${label} resolved to ${id}`);
    }
    assert.equal(h.inferInstallationId(`${original.name} (TEST)`), `TEST-${original.id}`);
  }
});
