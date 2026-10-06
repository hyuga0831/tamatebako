// 1 回の練習（ドリル／ミニ模試／本番模試）で出す問題を組み立てる。
import type { AppState, FormatId, Mode, PassageQ, Question } from './types';
import { type Rng, shuffle } from './rng';
import { FORMATS } from './formats';
import { patternBias, variantOf } from './stats';
import { genShisoku } from '../gen/shisoku';
import { genZuhyo } from '../gen/zuhyo';
import { genKuuran } from '../gen/kuuran';
import { RONRI } from '../data/ronri';
import { SHUSHI } from '../data/shushi';

export interface SessionPlan {
  format: FormatId;
  mode: Mode;
  /** 1 画面ぶんの問題の並び（言語は 1 長文が 1 画面） */
  screens: Question[];
  /** 設問の総数 */
  count: number;
  /** 制限時間（秒）。ドリルは 0 */
  timeLimit: number;
  /** 1 画面あたりの目安の秒数 */
  paceSec: number;
}

export const MODE_NAME: Record<Mode, string> = { drill: 'ドリル', mini: 'ミニ模試', full: '本番模試' };

/** その形式・モードで出す設問の数 */
export function questionCount(f: FormatId, mode: Mode, state: Pick<AppState, 'settings'>): number {
  const spec = FORMATS[f];
  return mode === 'drill' ? spec.drill : mode === 'mini' ? spec.mini : variantOf(f, state.settings).total;
}

/** 本番と同じペースにしたときの制限時間（秒） */
export function timeLimitOf(f: FormatId, mode: Mode, state: Pick<AppState, 'settings'>): number {
  if (mode === 'drill') return 0;
  const v = variantOf(f, state.settings);
  return Math.round((questionCount(f, mode, state) * v.appSec) / v.total);
}

/** しばらく解いていない長文から順に n 本選び、設問の順番を入れ替える */
function pickPassages(r: Rng, pool: PassageQ[], n: number, seen: Record<string, number>): PassageQ[] {
  const ordered = shuffle(r, pool).sort((a, b) => (seen[a.id] ?? 0) - (seen[b.id] ?? 0));
  return shuffle(r, ordered.slice(0, Math.min(n, pool.length))).map((p) => ({ ...p, items: shuffle(r, p.items) }));
}

export function buildSession(f: FormatId, mode: Mode, state: AppState, r: Rng): SessionPlan {
  const spec = FORMATS[f];
  const v = variantOf(f, state.settings);
  const count = questionCount(f, mode, state);
  // 苦手を多めに出すのはドリルだけ。模試は本番と同じ配分にする
  const bias = mode === 'drill' ? patternBias(state.logs, f) : {};
  let screens: Question[];
  if (f === 'shisoku') screens = Array.from({ length: count }, () => genShisoku(r, bias));
  else if (f === 'zuhyo') screens = genZuhyo(r, count, bias);
  else if (f === 'kuuran') screens = Array.from({ length: count }, () => genKuuran(r, bias));
  else screens = pickPassages(r, f === 'ronri' ? RONRI : SHUSHI, Math.ceil(count / spec.perScreen), state.seen);
  const actual = screens.reduce((n, q) => n + (q.kind === 'passage' ? q.items.length : 1), 0);
  return {
    format: f,
    mode,
    screens,
    count: actual,
    timeLimit: mode === 'drill' ? 0 : Math.round((actual * v.appSec) / v.total),
    paceSec: (v.appSec / v.total) * spec.perScreen,
  };
}
