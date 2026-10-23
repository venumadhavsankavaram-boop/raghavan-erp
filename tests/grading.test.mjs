// Grade lookup from percentage, per-class schemes and year-end scale.   Run:  node tests/grading.test.mjs
import assert from 'node:assert/strict';
import { loadMany, test, done } from './helpers.mjs';

const bands = [
  { grade: 'A+', minPct: 90, gp: 10, remark: 'Outstanding', fail: false },
  { grade: 'A', minPct: 75, gp: 9, remark: 'Excellent', fail: false },
  { grade: 'B', minPct: 60, gp: 7, remark: 'Good', fail: false },
  { grade: 'C', minPct: 35, gp: 5, remark: 'Average', fail: false },
  { grade: 'D', minPct: 0, gp: 0, remark: 'Needs improvement', fail: true },
];
function sandbox(schemes, consol) {
  return loadMany([['10c-grading-wizard-ui.js', ['gswAllSchemes', 'gswDefaultScheme', 'gradingSchemeForClass', 'gradeInfoForPct', 'gradeForPct', 'isFailGrade', 'gradeForConsolPct']]],
    { gradingSchemes: schemes, consolidationScale: consol || [], gradingScale: [] });
}
const dflt = { id: 'g1', name: 'Default', bands, passPct: 35, isDefault: true, classes: [] };

console.log('Grade from percentage');
test('each band boundary lands in the right grade', () => {
  const E = sandbox([dflt]);
  const at = p => E.gradeForPct(p);
  assert.equal(at(100), 'A+'); assert.equal(at(90), 'A+'); assert.equal(at(89.99), 'A');
  assert.equal(at(75), 'A'); assert.equal(at(60), 'B'); assert.equal(at(59), 'C');
  assert.equal(at(35), 'C'); assert.equal(at(34), 'D'); assert.equal(at(0), 'D');
});
test('fail flag follows the band', () => {
  const E = sandbox([dflt]);
  assert.equal(E.gradeInfoForPct(20).fail, true); assert.equal(E.gradeInfoForPct(40).fail, false);
  assert.equal(E.isFailGrade('D'), true); assert.equal(E.isFailGrade('B'), false);
});
test('a non-number gives a dash, not a wrong grade', () => {
  assert.equal(sandbox([dflt]).gradeForPct('abc'), '—');
});
test('a class with its own scheme uses it; others use the default', () => {
  const strict = { id: 'g2', name: 'Senior', bands: [{ grade: 'P', minPct: 50, gp: 5, remark: '', fail: false }, { grade: 'F', minPct: 0, gp: 0, remark: '', fail: true }], passPct: 50, isDefault: false, classes: ['Class 10'] };
  const E = sandbox([dflt, strict]);
  assert.equal(E.gradeForPct(45, 'Class 10'), 'F'); assert.equal(E.gradeForPct(45, 'Class 5'), 'C');
});
test('year-end scale picks the highest band the percentage reaches', () => {
  const E = sandbox([dflt], [{ grade: 'Distinction', minPct: 75 }, { grade: 'First', minPct: 60 }, { grade: 'Pass', minPct: 35 }]);
  assert.equal(E.gradeForConsolPct(80), 'Distinction'); assert.equal(E.gradeForConsolPct(60), 'First'); assert.equal(E.gradeForConsolPct(10), 'Pass');
});
done('grading');
