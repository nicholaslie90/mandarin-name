import { CHARS } from './chars.js';

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

// How the parent's last given char links to the child's first given char.
export function detectLink(parentLast, childFirst) {
  if (!parentLast || !childFirst) return null;
  if (parentLast.simp === childFirst.simp) return 'char';
  return withTone(parentLast).base === withTone(childFirst).base ? 'sound' : null;
}

// Candidate first given chars for the next generation, linked to `link`.
export function firstChoices(link, mode) {
  const l = withTone(link);
  if (mode === 'char') return [l];
  const same = DB.filter(c => c.base === l.base && c.simp !== l.simp);
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
