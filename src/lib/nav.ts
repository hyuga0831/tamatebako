// 画面の切り替え（URL の # 以降で管理する。スマホの「戻る」操作がそのまま効く）
import type { Abc, FormatId, Mode, Question } from './types';
import type { Overall } from './stats';

export type Route =
  | { name: 'home' }
  | { name: 'format'; f: FormatId }
  | { name: 'quiz'; f: FormatId; mode: Mode; key: string }
  | { name: 'result' }
  | { name: 'settings' };

const FORMAT_IDS: readonly string[] = ['shisoku', 'zuhyo', 'kuuran', 'ronri', 'shushi'];
const MODES: readonly string[] = ['drill', 'mini', 'full'];

export function parseRoute(hash: string): Route {
  const [a, b, c] = hash.replace(/^#\/?/, '').split('?')[0].split('/');
  if (a === 'f' && FORMAT_IDS.includes(b)) return { name: 'format', f: b as FormatId };
  if (a === 'q' && FORMAT_IDS.includes(b) && MODES.includes(c)) return { name: 'quiz', f: b as FormatId, mode: c as Mode, key: hash };
  if (a === 'result') return { name: 'result' };
  if (a === 'settings') return { name: 'settings' };
  return { name: 'home' };
}

export function go(path: string, replace = false): void {
  if (replace) location.replace(`#${path}`);
  else location.hash = path;
}

/** 同じ形式・モードでも毎回ちがう URL にして、新しいセットとして始める */
export const quizPath = (f: FormatId, mode: Mode): string => `/q/${f}/${mode}?t=${Date.now().toString(36)}`;

export interface ReviewItem {
  q: Question;
  /** 計数で選んだ選択肢。未回答は null */
  pick: number | null;
  /** 言語の設問ごとの解答。未回答は null */
  picks: (Abc | null)[];
  /** その画面にかけた秒数。時間切れでたどり着かなかった問題は null */
  time: number | null;
}

export interface ResultData {
  format: FormatId;
  mode: Mode;
  total: number;
  answered: number;
  correct: number;
  timeLimit: number;
  used: number;
  timeUp: boolean;
  items: ReviewItem[];
  before: Overall;
  after: Overall;
}

let lastResult: ResultData | null = null;
export const setResult = (r: ResultData): void => {
  lastResult = r;
};
export const getResult = (): ResultData | null => lastResult;
