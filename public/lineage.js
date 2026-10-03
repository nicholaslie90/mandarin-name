import { CHARS } from './chars.js';
import { HOKKIEN } from './hokkien.js';

const MARKS = { '̄': 1, '́': 2, '̌': 3, '̀': 4 };

// 'shuò' -> { base: 'shuo', tone: 4 }; keeps ü so lü ≠ lu.
export function splitTone(py) {
  let tone = 5;
  const base = [...py.normalize('NFD')]
    .filter(c => (MARKS[c] ? ((tone = MARKS[c]), false) : true))
    .join('').normalize('NFC');
  return { base, tone };
}

export const DB = CHARS.map(line => {
  const [simp, trad, py, meaning] = line.split('|');
  return { simp, trad, py, meaning, ...splitTone(py) };
});
export const BY_SIMP = new Map(DB.map(c => [c.simp, c]));

// c = { simp, trad, py }
export const withTone = c => ({ meaning: BY_SIMP.get(c.simp)?.meaning ?? '', ...c, ...splitTone(c.py) });

// Hokkien (Tâi-lô) readings of a char, most common first.
export const hokkien = c => HOKKIEN[c.trad]?.split(' ') ?? [];
// 'si̍k' -> 'sik'
export const taiBase = r => r.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Toneless syllables a char can be read as, per dialect.
export const SOUNDS = {
  mandarin: c => [splitTone(c.py).base],
  hokkien: c => hokkien(c).map(taiBase),
};

// How the parent's last given char links to the child's first given char.
export function detectLink(parentLast, childFirst, soundsOf = SOUNDS.mandarin) {
  if (!parentLast || !childFirst) return null;
  if (parentLast.simp === childFirst.simp) return 'char';
  const a = soundsOf(parentLast);
  return soundsOf(childFirst).some(s => a.includes(s)) ? 'sound' : null;
}

// Candidate first given chars for the next generation, linked to `link` by `sound`.
export function firstChoices(link, mode, soundsOf = SOUNDS.mandarin, sound = soundsOf(link)[0]) {
  const l = withTone(link);
  if (mode === 'char') return [l];
  const same = DB.filter(c => c.simp !== l.simp && soundsOf(c).includes(sound));
  return [l, ...same].sort((a, b) => (a.tone !== l.tone) - (b.tone !== l.tone));
}

// 0–3: how smoothly the full name reads aloud.
export function flow(chars) {
  const t = chars.map(c => c.tone), last = t.length - 1;
  let s = 2;
  if (t.every(x => x === t[0])) s--;
  if (t[last] === 3 && t[last - 1] === 3) s--;
  if (t[last] === 1 || t[last] === 2) s++;
  if (new Set(chars.map(c => c.base)).size < chars.length) s--;
  return Math.max(0, Math.min(3, s));
}

const matches = (c, q) =>
  !q || c.meaning.toLowerCase().includes(q) || c.base.startsWith(q) || c.simp === q || c.trad === q;

// surname: char[]; firsts: char[]; avoid: Set of simplified chars used by ancestors (避諱).
export function suggest({ surname, firsts, avoid = new Set(), query = '', rand = Math.random }) {
  const q = query.trim().toLowerCase();
  const sur = surname.map(withTone);
  const seconds = DB.filter(c => !avoid.has(c.simp) && !firsts.some(f => f.base === c.base) && matches(c, q));
  const out = [];
  for (const f of firsts) for (const s of seconds) {
    const chars = [...sur, f, s];
    out.push({ chars, score: flow(chars), r: rand() });
  }
  return out.sort((a, b) => b.score - a.score || a.r - b.r);
}

// ['Lǐ','shuò','ān'] with surname length 1 -> "Lǐ Shuò'ān"
export function romanize(pys, surnameLen) {
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const join = a => a.map((p, i) => (i && /^[aoeāáǎàōóǒòēéěè]/.test(p) ? "'" : '') + p).join('');
  return [cap(join(pys.slice(0, surnameLen))), cap(join(pys.slice(surnameLen)))].filter(Boolean).join(' ');
}

// Approximate old Indonesian (Dutch-era) spelling of a Tâi-lô syllable: 'tsiā' -> 'Tjia', 'lí' -> 'Lie'.
// ponytail: rule-of-thumb only; real family spellings vary (緯 uī may be Oei, Ui, Wie or Uwi).
export function indo(r) {
  const s = taiBase(r).replace(/^j/, 'dj').replace(/^tsh?/, 'tj').replace(/nn/g, '').replace(/oo/g, 'o')
    .replace(/ua/g, 'oa').replace(/ue/g, 'oe').replace(/ui/g, 'oei').replace(/u/g, 'oe')
    .replace(/([aeio])h$/, '$1').replace(/^([^aeiou]*)i$/, '$1ie');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Hokkien name lines: ['lí','uî','si̍k'], surname length 1 -> { tailo: 'Lí Uî-si̍k', indo: 'Lie Oei Sik' }
export function romanizeHokkien(rs, surnameLen) {
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const tailo = [rs.slice(0, surnameLen).join('-'), rs.slice(surnameLen).join('-')].filter(Boolean).map(cap).join(' ');
  return { tailo, indo: rs.map(r => (r ? indo(r) : '?')).join(' ') };
}
