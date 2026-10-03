import assert from 'node:assert/strict';
import { pinyin } from 'pinyin-pro';
import * as OpenCC from 'opencc-js';
import { gb2312, buildIndex, syllables, firstSyllable, candidates, SURNAMES } from './public/pinyin.js';
import { DB, splitTone, detectLink, firstChoices, flow, suggest, romanize, SOUNDS, hokkien, indo, romanizeHokkien, poemNext } from './public/lineage.js';

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
// Pinyin fallback
const all = gb2312();
assert.equal(all.length, 6763);
const idx = buildIndex([...DB.map(c => c.simp), ...all], ch => pinyin(ch, { multiple: true, type: 'array' }));
assert.deepEqual(syllables('weishuo', idx), ['wei', 'shuo']);
assert.deepEqual(syllables('xian', idx), ['xian']);
assert.equal(syllables('xq', idx), null);
assert.deepEqual(firstSyllable('weishuo', idx), { syl: 'wei', tone: undefined, len: 3 });
assert.deepEqual(firstSyllable('Wei2', idx), { syl: 'wei', tone: 2, len: 4 });
assert.deepEqual(firstSyllable('weish', idx), { syl: 'wei', len: 3 }); // still typing
assert.equal(firstSyllable('x', idx), null);
const wei = candidates(idx, { syl: 'wei' }).map(c => c.ch);
assert.ok(['纬', '惟', '伟'].every(c => wei.includes(c)) && new Set(wei).size === wei.length);
assert.ok(candidates(idx, { syl: 'wei', tone: 2 }).every(c => c.tone === 2));
assert.equal(candidates(idx, { syl: 'li' }, SURNAMES)[0].ch, '李');
assert.ok(candidates(idx, { syl: 'lv' }, SURNAMES).some(c => c.ch === '吕'));
assert.ok(candidates(idx, { syl: 'shuo' }).map(c => c.ch).includes('硕'));

// Hokkien mode: 緯 uī → 惟 uî is a sound chain; 碩 si̍k leads to other "sik" characters.
const hk = SOUNDS.hokkien;
assert.equal(detectLink(wei3, wei2, hk), 'sound');
assert.equal(detectLink({ simp: '家', trad: '家', py: 'jiā' }, shuo, hk), null);
assert.deepEqual(hokkien(shuo), ['sik', 'si̍k']);
const sik = firstChoices(shuo, 'sound', hk, 'sik').map(c => c.trad);
assert.ok(['碩', '識', '錫', '惜', '息'].every(c => sik.includes(c)) && !sik.includes('朔'));
assert.deepEqual(['tsiā', 'lí', 'si̍k', 'uî', 'ka', 'sih', 'un', 'tshing', 'jī'].map(indo), ['Tjia', 'Lie', 'Sik', 'Oei', 'Ka', 'Sie', 'Oen', 'Tjing', 'Djie']);
assert.deepEqual(romanizeHokkien(['lí', 'uî', 'si̍k'], 1), { tailo: 'Lí Uî-si̍k', indo: 'Lie Oei Sik' });

// Generation poem: 家 → 惟 → 善
const poem = [...'文章華國詩禮傳家惟善為寶以德則和箕裘衍紹孫子福遐'];
assert.equal(poem.length, 24);
assert.deepEqual(poemNext(poem, [...'惟碩'], [...'家緯']), { pos: 0, index: 8, next: '善', confirmed: true });
assert.equal(poemNext(poem, [...'惟碩']).next, '善'); // works without the grandparent
assert.deepEqual(poemNext(poem, [...'明善'], [...'光惟']), { pos: 1, index: 9, next: '為', confirmed: true });
assert.equal(poemNext(poem, [...'遐明']), null); // last generation
assert.equal(poemNext(poem, [...'明亮']), null);
const gp = suggest({ surname: [{ simp: '李', trad: '李', py: 'lǐ' }], firsts: [{ simp: '善', trad: '善', py: 'shàn' }], genPos: 1, rand: () => 0 });
assert.ok(gp.every(r => r.chars[2].simp === '善'));

console.log(`ok — ${DB.length} characters`);
