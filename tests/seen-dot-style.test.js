import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The self ring around the viewer's own unit is the scene's only gold circle
// (spec D3). The message-seen dot keeps its affordance — marking objects whose
// message was read — but may no longer wear gold, where it once read as a
// player marker. These assertions pin the stylesheet to that invariant.
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('the message-seen dot keeps its affordance but is no longer gold', () => {
  const [rule] = css.match(/\.message-seen-dot\{[^}]*\}/) ?? [];
  assert.ok(rule, 'the base seen-dot rule exists');
  assert.match(rule, /background:/);
  assert.doesNotMatch(rule, /e7bd35/i);
});

test('no gold #e7bd35 remains anywhere in the stylesheet', () => {
  assert.doesNotMatch(css, /e7bd35/i);
});
