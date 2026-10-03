import { PENDING, gb2312, buildIndex, firstSyllable, candidates, SURNAMES } from './pinyin.js';
import { DB, BY_SIMP, withTone, detectLink, firstChoices, suggest, romanize, SOUNDS, hokkien, taiBase, indo, romanizeHokkien } from './lineage.js';

const { pinyin } = window.pinyinPro;
const toSimp = OpenCC.Converter({ from: 'tw', to: 'cn' });
const toTrad = OpenCC.Converter({ from: 'cn', to: 'tw' });
const $ = s => document.querySelector(s);
const form = $('#form');
const PAGE = 24;
const state = { results: [], shown: PAGE, picked: new Set(), seed: 1 };

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'class' ? (el.className = v) : el.setAttribute(k, v);
  el.append(...kids.flat().filter(k => k != null && k !== false));
  return el;
}

const han = s => [...s].filter(c => /\p{Script=Han}/u.test(c)).slice(0, 2); // length capped here, not via maxlength: it truncates pinyin IME composition on Android

// Typed chars (either script) -> [{ simp, trad, py }]; keeps the user's own traditional form.
function parse(chars, surnameLen = 0) {
  const simp = chars.map(c => toSimp(c));
  const pys = pinyin(simp.join(''), { type: 'array', surname: surnameLen ? 'head' : 'off' });
  return chars.map((c, i) => ({
    simp: simp[i],
    trad: c !== simp[i] ? c : BY_SIMP.get(c)?.trad ?? toTrad(c),
    py: pys[i],
  }));
}

const dialect = () => new FormData(form).get('dialect');
const hkOf = c => c.hk ?? hokkien(c)[0] ?? '';

function nameCard(chars, surnameLen, { meaning = true, score, caption } = {}) {
  const row = (script, label, lang) =>
    h('div', { class: `row ${script}` }, h('span', { class: `tag ${script}`, lang }, label),
      h('span', { class: 'hz', lang }, chars.map(c => h('span', c.simp !== c.trad ? { class: 'd' } : {}, c[script])) ));
  const given = chars.slice(surnameLen).map(withTone).filter(c => c.meaning);
  return h('article', { class: 'card' },
    caption && h('p', { class: 'cap' }, caption),
    row('simp', '简', 'zh-Hans'),
    row('trad', '繁', 'zh-Hant'),
    h('p', { class: 'py' }, romanize(chars.map(c => c.py), surnameLen)),
    dialect() === 'hokkien' && hokkienLine(chars, surnameLen),
    meaning && given.length ? h('p', { class: 'mean' }, given.map(c => `${c.simp} ${c.meaning}`).join(' · ')) : null,
    score != null && h('p', { class: 'flow', title: 'Tone flow: how smoothly the name reads aloud' },
      '●'.repeat(score) + '○'.repeat(3 - score), h('span', {}, ' tone flow')));
}

function hokkienLine(chars, surnameLen) {
  const { tailo, indo } = romanizeHokkien(chars.map(hkOf), surnameLen);
  return h('p', { class: 'hk' }, h('span', { title: 'Hokkien (Tâi-lô)' }, tailo), ' · ',
    h('span', { class: 'indo', title: 'Approximate old Indonesian spelling' }, indo));
}

function read() {
  const f = new FormData(form);
  const surname = parse(han(f.get('surname')), 1);
  const father = parse(han(f.get('father')));
  const you = parse(han(f.get('you')));
  return { surname, father, you };
}

function update({ redetect = true } = {}) {
  const { surname, father, you } = read();
  const lineage = $('#lineage');
  lineage.replaceChildren();
  $('#controls').hidden = $('#more').hidden = true;
  $('#results').replaceChildren();
  if (!surname.length || !you.length) return lineage.append(h('p', { class: 'empty' }, 'Enter a surname and the parent\'s given name to see suggestions.'));

  // Reading picker for the linking char when it has several readings (e.g. 乐 lè / yuè).
  const hk = dialect() === 'hokkien';
  const link = you.at(-1);
  const readings = hk ? hokkien(link) : pinyin(link.simp, { multiple: true, type: 'array' });
  const sel = form.reading;
  if (redetect) {
    sel.replaceChildren(...readings.map(r => h('option', { value: r }, r)));
    sel.value = hk ? readings[0] ?? '' : link.py;
  }
  $('#readingWrap').hidden = readings.length < 2;
  $('#readingChar').textContent = `${link.trad}`;
  if (hk) link.hk = sel.value || readings[0] || '';
  else link.py = sel.value || link.py;
  const say = c => (hk ? hkOf(c) : c.py);

  const found = detectLink(father.at(-1), you[0], SOUNDS[dialect()]);
  if (redetect && found) document.querySelector(`input[name=mode][value=${found}]`).checked = true;
  const mode = $('input[name=mode]:checked').value;

  const gens = [];
  if (father.length) gens.push(nameCard([...surname, ...father], surname.length, { caption: 'Grandparent' }));
  gens.push(nameCard([...surname, ...you], surname.length, { caption: 'Parent' }));
  const note = !father.length ? 'Add the grandparent\'s name to detect the family\'s rule.'
    : found === 'sound' ? `Same ${hk ? 'Hokkien ' : ''}sound: ${father.at(-1).trad} ${say(father.at(-1))} → ${you[0].trad} ${say(you[0])}`
    : found === 'char' ? `Same character: ${father.at(-1).trad} → ${you[0].trad}`
    : 'No chain found between these two names. Pick a rule below to start one.';
  const next = mode === 'char' ? link.trad : say(link) || '?';
  lineage.append(h('div', { class: 'gens' }, gens, h('article', { class: 'card child' },
    h('p', { class: 'cap' }, 'Child'), h('p', { class: 'next' }, `${surname.map(c => c.trad).join('')} + `, h('strong', {}, mode === 'char' ? next : `"${next}"`), ' + ?'))),
    h('p', { class: found ? 'note ok' : 'note' }, note),
    hk && !readings.length ? h('p', { class: 'note' }, `No Hokkien reading on file for ${link.trad}. Try Mandarin, or the same-character rule.`) : null);

  // In Hokkien mode, each candidate carries the reading that matches the link's sound.
  const sound = hk ? taiBase(link.hk) : undefined;
  const firsts = firstChoices(link, mode, SOUNDS[dialect()], sound)
    .map(c => (hk ? { ...c, hk: hokkien(c).find(r => taiBase(r) === sound) ?? hkOf(c) } : c));
  for (const s of state.picked) if (!firsts.some(f => f.simp === s)) state.picked.delete(s);
  $('#firsts').replaceChildren(...firsts.map(c => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.picked.has(c.simp)) },
      h('span', { lang: 'zh-Hans', class: 'simp' }, c.simp), c.simp !== c.trad ? h('span', { lang: 'zh-Hant', class: 'trad' }, c.trad) : null,
      h('small', {}, ` ${hk ? `${c.hk} (${indo(c.hk)})` : c.py}${c.meaning ? ' · ' + c.meaning : ''}`));
    b.onclick = () => { state.picked.has(c.simp) ? state.picked.delete(c.simp) : state.picked.add(c.simp); update({ redetect: false }); };
    return b;
  }));
  $('#controls').hidden = false;

  // Avoid reusing ancestors' characters (避諱), except the linking char itself in character mode.
  const avoid = new Set([...father, ...you].map(c => c.simp));
  let s = state.seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  state.results = suggest({
    surname,
    firsts: state.picked.size ? firsts.filter(f => state.picked.has(f.simp)) : firsts,
    avoid, query: $('#q').value, rand,
  });
  render(surname.length);
}

function render(surnameLen) {
  const { results, shown } = state;
  $('#results').replaceChildren(
    h('p', { class: 'count' }, results.length ? `${results.length} suggestions` : 'No matches. Try a different search.'),
    h('div', { class: 'grid' }, results.slice(0, shown).map(r => nameCard(r.chars, surnameLen, { score: r.score }))));
  $('#more').hidden = shown >= results.length;
}

// Pinyin fallback: Latin letters in a name box show characters to tap, like a phone IME.
const NAME_CHARS = DB.map(c => c.simp);
let idx, active;
function picker() {
  const box = $('#picker');
  const m = active && PENDING.exec(active.value);
  box.hidden = !m;
  if (!m) return;
  idx ??= buildIndex([...SURNAMES, ...NAME_CHARS, ...gb2312()], ch => pinyin(ch, { multiple: true, type: 'array' }));
  const syl = firstSyllable(m[0], idx);
  if (!syl) return box.replaceChildren(h('p', { class: 'hint' }, `"${m[0]}" isn't pinyin yet. Keep typing.`));
  const list = candidates(idx, syl, active.name === 'surname' ? SURNAMES : NAME_CHARS);
  box.replaceChildren(
    h('p', { class: 'hint' }, `Tap a character for "${syl.syl}${syl.tone ?? ''}". Add a tone number to narrow the list, e.g. wei2.`),
    h('div', { class: 'chips' }, list.map(c => {
      const trad = BY_SIMP.get(c.ch)?.trad ?? toTrad(c.ch);
      const b = h('button', { type: 'button', class: 'chip' },
        h('span', { lang: 'zh-Hans', class: 'simp' }, c.ch), trad !== c.ch ? h('span', { lang: 'zh-Hant', class: 'trad' }, trad) : null,
        h('small', {}, ` ${c.py}`));
      b.onclick = () => {
        const v = active.value;
        active.value = v.slice(0, m.index) + c.ch + v.slice(m.index + syl.len).replace(/^[\s']+/, '');
        active.dispatchEvent(new Event('input', { bubbles: true }));
      };
      return b;
    })));
}
form.addEventListener('focusin', e => { if (e.target.matches('.f input')) { active = e.target; picker(); } });

form.addEventListener('input', e => {
  if (e.target.name === 'reading') return update({ redetect: false });
  if (e.target.matches('.f input')) { active = e.target; picker(); }
  state.shown = PAGE; state.picked.clear(); update();
});
form.addEventListener('submit', e => e.preventDefault());
$('#controls').addEventListener('change', e => { if (e.target.name === 'mode') { state.picked.clear(); update({ redetect: false }); } });
$('#q').addEventListener('input', () => { state.shown = PAGE; update({ redetect: false }); });
$('#shuffle').onclick = () => { state.seed = (Math.random() * 2147483646 + 1) | 0; update({ redetect: false }); };
$('#more').onclick = () => { state.shown += PAGE; render(read().surname.length); };
update();
