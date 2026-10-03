import assert from 'node:assert/strict';
import { pinyin } from 'pinyin-pro';
import * as OpenCC from 'opencc-js';
import { DB, splitTone, detectLink, firstChoices, flow, suggest, romanize } from './public/lineage.js';

// Data integrity: unique, traditional form and reading agree with the libraries.
const toTrad = OpenCC.Converter({ from: 'cn', to: 'tw' });
assert.equal(new Set(DB.map(c => c.simp)).size, DB.length, 'duplicate characters');
const bad = [];
for (const c of DB) {
  if (toTrad(c.simp) !== c.trad) bad.push(`${c.simp}: trad ${c.trad} vs opencc ${toTrad(c.simp)}`);
  if (!pinyin(c.simp, { multiple: true, type: 'array' }).includes(c.py)) bad.push(`${c.simp}: ${c.py} not a known reading`);
}
assert.deepEqual(bad, []);

// Tone parsing
assert.deepEqual(splitTone('shuò'), { base: 'shuo', tone: 4 });
assert.deepEqual(splitTone('lǜ'), { base: 'lü', tone: 4 });

// The motivating family: 李家緯 -> 李惟硕 -> ?
const wei3 = { simp: '纬', trad: '緯', py: 'wěi' }, wei2 = { simp: '惟', trad: '惟', py: 'wéi' };
const shuo = { simp: '硕', trad: '碩', py: 'shuò' };
assert.equal(detectLink(wei3, wei2), 'sound');
assert.equal(detectLink(shuo, shuo), 'char');
assert.equal(detectLink(wei3, shuo), null);
assert.deepEqual(firstChoices(shuo, 'sound').map(c => c.simp).sort(), ['烁', '朔', '硕', '铄'].sort());
assert.deepEqual(firstChoices(shuo, 'char').map(c => c.simp), ['硕']);

// Flow: monotone and 3-3 endings are penalised
const t = (...tones) => tones.map((tone, i) => ({ tone, base: 'x' + i }));
assert.ok(flow(t(1, 1, 1)) < flow(t(3, 4, 1)));
assert.ok(flow(t(3, 3, 3)) === 0);

const res = suggest({ surname: [{ simp: '李', trad: '李', py: 'lǐ' }], firsts: firstChoices(shuo, 'sound'), avoid: new Set(['纬', '惟', '硕']) });
assert.ok(res.length > 0 && res.every(r => r.chars[2].base !== 'shuo' && !['纬', '惟', '硕'].includes(r.chars[2].simp)));
assert.ok(res.every((r, i) => !i || res[i - 1].score >= r.score));

assert.equal(romanize(['lǐ', 'shuò', 'ān'], 1), "Lǐ Shuò'ān");
console.log(`ok — ${DB.length} characters`);
