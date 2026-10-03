// Pinyin fallback for typing names without a Chinese keyboard.
import { splitTone } from './lineage.js';

// Lowercase, ü -> v. Length-preserving so match offsets stay valid in the original text.
export const normalize = s => s.toLowerCase().replace(/ü/g, 'v');
export const PENDING = /[a-zü]+[1-5]?/i;

// The 6,763 GB2312 characters (level 1 then level 2), decoded with the platform's GBK decoder.
export function gb2312() {
  const dec = new TextDecoder('gbk'), out = [];
  for (let hi = 0xb0; hi <= 0xf7; hi++)
    for (let lo = 0xa1; lo <= 0xfe; lo++) {
      const c = dec.decode(new Uint8Array([hi, lo]));
      if (/\p{Script=Han}/u.test(c)) out.push(c);
    }
  return out;
}

// toneless syllable -> [{ ch, py, tone }], in the priority order of `chars`.
export function buildIndex(chars, readings) {
  const idx = new Map();
  for (const ch of new Set(chars))
    for (const py of readings(ch)) {
      const { base, tone } = splitTone(py), k = normalize(base);
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push({ ch, py, tone });
    }
  return idx;
}

// 'weishuo' -> ['wei', 'shuo'] (longest syllable first, backtracking); null if not pinyin.
export function syllables(run, idx, memo = new Map()) {
  if (!run) return [];
  if (memo.has(run)) return memo.get(run);
  let res = null;
  for (let n = Math.min(6, run.length); n > 0 && !res; n--) {
    const rest = idx.has(run.slice(0, n)) && syllables(run.slice(n), idx, memo);
    if (rest) res = [run.slice(0, n), ...rest];
  }
  memo.set(run, res);
  return res;
}

// First syllable of a pending run like 'weishuo2' or 'weish' (still typing).
// -> { syl, tone, len } where len = characters to replace; null if nothing usable yet.
export function firstSyllable(text, idx) {
  const [, run, digit] = /^([a-zv]+)([1-5])?$/.exec(normalize(text)) ?? [];
  if (!run) return null;
  const parts = syllables(run, idx);
  if (parts) {
    const tone = parts.length === 1 && digit ? +digit : undefined;
    return { syl: parts[0], tone, len: parts[0].length + (tone ? 1 : 0) };
  }
  for (let n = Math.min(6, run.length); n > 0; n--)
    if (idx.has(run.slice(0, n))) return { syl: run.slice(0, n), len: n };
  return null;
}

// Candidates for a syllable: tone-filtered, deduped, `first` chars promoted.
export function candidates(idx, { syl, tone }, first = []) {
  const seen = new Set();
  const list = (idx.get(syl) ?? []).filter(c => (!tone || c.tone === tone) && !seen.has(c.ch) && seen.add(c.ch));
  const rank = c => (first.includes(c.ch) ? first.indexOf(c.ch) : first.length);
  return list.sort((a, b) => rank(a) - rank(b));
}

// Common surnames, roughly by frequency, so they lead the surname box's candidates.
export const SURNAMES = [...'李王张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾萧田董潘袁蔡蒋余于杜叶程魏苏吕丁任卢姚沈钟姜崔谭陆范汪廖石金韦贾夏付方邹熊白孟秦邱侯江尹薛闫段雷龙黎史陶贺毛郝顾龚邵万覃武钱戴严欧莫孔向常汤康易乔赖文施洪温翁卓柯甘连古涂'];
