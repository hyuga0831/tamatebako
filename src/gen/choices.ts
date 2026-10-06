import type { Choice } from '../lib/types';
import { type Rng, pick, shuffle } from '../lib/rng';

export const fmt = (x: number, dp = 0): string =>
  x.toLocaleString('ja-JP', { minimumFractionDigits: dp, maximumFractionDigits: dp }).replace('-', '−');

export interface NumChoiceOpts {
  /** 小数の桁数 */
  dp?: number;
  unit?: string;
  /** よくある計算ミスで出る値 */
  traps?: number[];
  /** 選択肢の間隔（正解に対する割合） */
  rel?: number;
  /** 選択肢の間隔（dp 桁目を 1 とした整数）。rel より優先 */
  step?: number;
  /** ぴったり求まる値か（false なら「最も近いもの」を選ばせるので、近すぎる選択肢を置かない） */
  exact?: boolean;
  min?: number;
}

/**
 * 数値の 5 択を作る。計算ミスの値（traps）を最大 2 つ混ぜ、残りは一定間隔の値で埋める。
 * 返り値の choices は昇順。
 */
export function numChoices(r: Rng, correct: number, o: NumChoiceOpts = {}): { choices: Choice[]; answer: number } {
  const dp = o.dp ?? 0;
  const scale = 10 ** dp;
  const c = Math.round(correct * scale);
  const minI = Math.round((o.min ?? 0) * scale);
  // 概算で選ぶ問題では、正解の 2% 以内に別の選択肢を置かない
  const gap = o.exact ? 1 : Math.max(2, Math.ceil(Math.abs(c) * 0.02));
  const step = Math.max(gap, o.step ?? Math.round(Math.abs(c) * (o.rel ?? pick(r, [0.05, 0.08, 0.12]))));
  // 不正解どうしも、ほぼ同じ値が並ばないようにする
  const sep = Math.max(gap, Math.ceil(step / 2));

  const vals: number[] = [c];
  const ok = (v: number) =>
    Number.isFinite(v) && v > minI && vals.every((u) => Math.abs(u - v) >= (u === c ? gap : sep));

  for (const t of shuffle(r, (o.traps ?? []).map((t) => Math.round(t * scale)))) {
    if (vals.length >= 3) break;
    if (ok(t)) vals.push(t);
  }
  // 正解が端に寄りすぎないよう、上下に散らして埋める
  const offsets = shuffle(r, [-3, -2, -1, 1, 2, 3]);
  for (const j of offsets) {
    if (vals.length >= 5) break;
    const v = c + j * step;
    if (ok(v)) vals.push(v);
  }
  for (let j = 4; vals.length < 5 && j < 40; j++) {
    const v = c + j * step;
    if (ok(v)) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  return {
    choices: vals.map((v) => ({ text: fmt(v / scale, dp) + (o.unit ?? '') })),
    answer: vals.indexOf(c),
  };
}

/** 項目名から選ばせる 5 択（図表に出てくる順のまま） */
export function labelChoices(labels: string[], correct: number): { choices: Choice[]; answer: number } {
  return { choices: labels.map((text) => ({ text })), answer: correct };
}

/** 値が最大（最小）の添字。2 位との差が小さすぎて紛らわしいときは -1 */
export function clearBest(values: number[], mode: 'max' | 'min' = 'max', margin = 0.03): number {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => (mode === 'max' ? b.v - a.v : a.v - b.v));
  const [first, second] = sorted;
  const scale = Math.max(Math.abs(first.v), Math.abs(second.v), 1e-9);
  return Math.abs(first.v - second.v) / scale >= margin ? first.i : -1;
}
