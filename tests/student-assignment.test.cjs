'use strict';

// Student assignment: sync rules (cloud-sync.js) and device rules (app.js).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function extractor(file) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  return name => {
    const start = source.search(new RegExp(`^function ${name}\\(`, 'm'));
    assert.ok(start >= 0, `${file}: ${name}`);
    for (let end = source.indexOf('}', start); end >= 0; end = source.indexOf('}', end + 1)) {
      const candidate = source.slice(start, end + 1);
      try { new vm.Script(`(${candidate})`); return candidate; } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    throw new Error(name);
  };
}
const sync = extractor('cloud-sync.js'), app = extractor('app.js');
const syncApi = {};
vm.runInNewContext(['normalizeStudentGroups', 'classMetadataSnapshot', 'classMetadataSignature'].map(sync).join('\n')
  + '\nthis.api={normalizeStudentGroups,classMetadataSnapshot,classMetadataSignature};', syncApi);
const { normalizeStudentGroups, classMetadataSignature } = syncApi.api;

test('assignments are normalized: key order and blank entries never look like a change', () => {
  assert.deepEqual(JSON.stringify(normalizeStudentGroups({ b: 'Bravo ', a: 'Alpha', c: '' })), JSON.stringify({ a: 'Alpha', b: 'Bravo' }));
  assert.equal(JSON.stringify(normalizeStudentGroups(null)), '{}');
  assert.equal(JSON.stringify(normalizeStudentGroups(['x'])), '{}');
  assert.equal(normalizeStudentGroups({ a: 'x'.repeat(200) }).a.length, 60);
});

test('an existing class without assignments keeps the same metadata signature as its old baseline', () => {
  const c = { name: 'Field class', tierId: '3', scenarioNT: ['M2'] };
  const legacyBaseline = JSON.stringify((({ studentGroups, ...rest }) => rest)(syncApi.api.classMetadataSnapshot(c)));
  assert.equal(classMetadataSignature(JSON.parse(legacyBaseline)), classMetadataSignature(c), 'No false conflict after upgrade');
});

test('changing an assignment changes the class metadata signature, so it synchronizes', () => {
  const before = { name: 'Field class', studentGroups: { s1: 'Alpha' } };
  const after = { name: 'Field class', studentGroups: { s1: 'Bravo' } };
  assert.notEqual(classMetadataSignature(before), classMetadataSignature(after));
  assert.equal(classMetadataSignature({ studentGroups: { s2: 'B', s1: 'A' } }), classMetadataSignature({ studentGroups: { s1: 'A', s2: 'B' } }));
});

function device({ stored = '', displayName = '' } = {}) {
  const storage = new Map(stored ? [['RAPS_MY_STUDENT_GROUP:c1', stored]] : []);
  const sandbox = {
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    window: { RAPS_CLOUD: { profile: { display_name: displayName } } }, MY_GROUP_PREFIX: 'RAPS_MY_STUDENT_GROUP:'
  };
  vm.runInNewContext(['studentGroupOf', 'studentGroupLabels', 'myStudentGroup', 'setMyStudentGroup', 'assignmentWarning', 'splitEvenly'].map(app).join('\n')
    + '\nthis.api={studentGroupOf,studentGroupLabels,myStudentGroup,setMyStudentGroup,assignmentWarning,splitEvenly};', sandbox);
  return sandbox.api;
}
const course = { id: 'c1', studentGroups: { s1: 'SSgt Alpha', s2: 'TSgt Bravo', s3: 'SSgt Alpha' } };

test('split evenly deals students round-robin across instructors', () => {
  const api = device();
  const students = Array.from({ length: 18 }, (_, i) => ({ id: 's' + i }));
  const map = api.splitEvenly(students, ['A', 'B', 'C']);
  const counts = Object.values(map).reduce((n, l) => (n[l] = (n[l] || 0) + 1, n), {});
  assert.equal(JSON.stringify(counts), JSON.stringify({ A: 6, B: 6, C: 6 }));
});

test('a device defaults to the group named like its signed-in instructor, and remembers a choice', () => {
  assert.equal(device({ displayName: 'TSgt Bravo' }).myStudentGroup(course), 'TSgt Bravo');
  assert.equal(device({ displayName: 'Someone Else' }).myStudentGroup(course), '');
  const api = device({ displayName: 'TSgt Bravo' });
  api.setMyStudentGroup(course, 'SSgt Alpha');
  assert.equal(api.myStudentGroup(course), 'SSgt Alpha');
  assert.equal(device({ stored: 'Removed Group', displayName: '' }).myStudentGroup(course), '', 'A label no longer assigned is ignored');
});

test('starting a student assigned elsewhere asks first; own or unassigned students do not', () => {
  const api = device({ stored: 'SSgt Alpha' });
  assert.match(api.assignmentWarning(course, { id: 's2', name: 'Learner Two' }), /assigned to TSgt Bravo, not SSgt Alpha/);
  assert.equal(api.assignmentWarning(course, { id: 's1', name: 'Learner One' }), '');
  assert.equal(api.assignmentWarning(course, { id: 's9', name: 'Unassigned' }), '');
  assert.equal(device().assignmentWarning(course, { id: 's2', name: 'x' }), '', 'No warning when this device has not chosen a group');
});
