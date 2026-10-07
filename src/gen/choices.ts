import type { Choice } from '../lib/types';
import { type Rng, pick, shuffle } from '../lib/rng';

export const fmt = (x: number, dp = 0): string =>
  x.toLocaleString('ja-JP', { minimumFractionDigits: dp, maximumFractionDigits: dp }).replace('-', '−');

/** よくある計算ミスで出る値と、そのミスの説明 */
export interface Trap {
  v: number;
  why: string;
}
export const trap = (v: number, why: string): Trap => ({ v, why });

/** まちがいの説明。答え合わせのとき、選んだ答えがなぜ違うのかを伝えるのに使う */
export const WHY = {
  denom: '割る数（分母）を「あと」の値にしたときの値。増減率は、必ず「まえ」の値で割る',
  inverse: '割る順番が逆のときの値。「A は B の何倍か」は A ÷ B',
  exclude: 'その項目を除いた残りで割ったときの値。割合は、全体の合計で割る',
  otherRow: '別の行や列の数値を使ったときの値。設問の項目と年を、もう一度確かめる',
  count: '割る数（個数）がちがうときの値。足した数と同じ個数で割る',
  midpoint: '最大と最小の真ん中の値。平均は、全部を足して個数で割る',
  unit: '単位の換算がちがうときの値。図表の単位と設問の単位を見比べる',
  pctOnly: '構成比（%）だけで比べたときの値。総数がちがうので、実数に直してから比べる',
  totalOnly: '総数（総額）どうしを比べたときの値。聞かれているのは、その項目だけの実数',
  point: '構成比の差（ポイント）。増減率ではない',
  additive: '増減率を足し算したときの値。倍率（＋30% なら ×1.3）にしてかける',
  oneYear: '1年分しか計算していないときの値。2年分の倍率をかける',
  simpleMean: '平均どうしをそのまま平均したときの値。人数がちがうので、人数で重みをつける',
  sumDiff: '差と合計を取りちがえたときの値',
  wholeUp: '全体が同じ率で増えるとしたときの値。増えるのは 1 つの項目だけ',
  linearNext: '同じ「数」だけ増えるとしたときの値。同じ「率」なので、倍率をもう一度かける',
  part: '途中の値。そこで止めずに、最後まで計算する',
  byDiff: '差（足し算・引き算）で考えたときの値。この表は「1 あたり」（割り算）が一定',
  byRatio: '比例（割り算が一定）だと考えたときの値。この表は基本の分があるので、増え方（差）を見る',
  noRule: 'ほかの列の平均。規則を見つけずに、だいたいで選んだときの値',
  swapPrice: '単価を別の品目に当てはめたときの値',
  forgot: '足す（引く）ものを 1 つ忘れたときの値',
  oneFactor: '片方の行だけで比例させたときの値。2 つの行の両方が効いている',
  hiddenRatio: '「合計 ÷ 数量」が一定だと考えたときの値。先に、表にある分を引いてから割る',
  linearGrowth: '毎年同じ「数」だけ変わるとしたときの値。この表は、毎年同じ「倍率」で変わっている',
} as const;

export interface NumChoiceOpts {
  /** 小数の桁数 */
  dp?: number;
  unit?: string;
  /** よくある計算ミスで出る値 */
  traps?: (number | Trap)[];
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
export function numChoices(
  r: Rng,
  correct: number,
  o: NumChoiceOpts = {},
): { choices: Choice[]; answer: number; choiceNotes: (string | undefined)[] } {
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

  const notes = new Map<number, string>();
  for (const t of shuffle(r, o.traps ?? [])) {
    if (vals.length >= 3) break;
    const v = Math.round((typeof t === 'number' ? t : t.v) * scale);
    if (!ok(v)) continue;
    vals.push(v);
    if (typeof t !== 'number') notes.set(v, t.why);
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
    choiceNotes: vals.map((v) => notes.get(v)),
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
