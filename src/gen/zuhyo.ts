// 図表の読み取り：図表から必要な数値を拾って計算し、5 択から選ぶ。
// 本番は 29問／15分（1問 約31秒）または 40問／35分。1 つの図表に設問が 2〜4 問続く。
import type { CalcQ, Choice, Figure } from '../lib/types';
import { type Rng, int, pick, shuffle } from '../lib/rng';
import { numChoices, labelChoices, clearBest, fmt } from './choices';

export const ZUHYO_PATTERNS = {
  rate: '増減率（前年比）',
  share: '割合・構成比',
  amount: '実数（全体×割合）',
  ratio: '倍率（AはBの何倍）',
  perunit: '1人あたり・単位換算',
  sum: '差・合計・平均',
  chain: '連続する増減',
  pick: '最大・最小を選ぶ',
} as const;
export type ZuhyoPattern = keyof typeof ZUHYO_PATTERNS;

interface Q {
  pattern: ZuhyoPattern;
  prompt: string;
  choices: Choice[];
  answer: number;
  explain: string[];
}
type QMaker = () => Q | null;
interface Scene {
  figure: Figure;
  makers: QMaker[];
}

const mkQ = (
  pattern: ZuhyoPattern,
  prompt: string,
  c: { choices: Choice[]; answer: number },
  explain: string[],
): Q => ({ pattern, prompt, ...c, explain });

const growth = (from: number, to: number): number => (to / from - 1) * 100;
const f1 = (x: number): string => fmt(x, 1);
const f2 = (x: number): string => fmt(x, 2);
const sumOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const ratioDp = (x: number): number => (x >= 3 ? 1 : 2);
const signed = (x: number): string => (x > 0 ? `＋${x}` : `−${Math.abs(x)}`);

/** 合計が total になる n 個の整数（各 min 以上、すべて異なる） */
function split(r: Rng, n: number, min: number, total = 100): number[] {
  for (;;) {
    const w = Array.from({ length: n }, () => 0.3 + r());
    const s = sumOf(w);
    const out = w.map((x) => min + Math.floor((x / s) * (total - n * min)));
    let rest = total - sumOf(out);
    for (let i = 0; rest > 0; i = (i + 1) % n, rest--) out[i]++;
    if (new Set(out).size === n) return out;
  }
}

/** 異なる 2 つの添字 */
function two(r: Rng, n: number): [number, number] {
  const a = int(r, 0, n - 1);
  let b = int(r, 0, n - 2);
  if (b >= a) b++;
  return [a, b];
}

function companySales(r: Rng): Scene {
  const y0 = int(r, 2019, 2022);
  const years = [0, 1, 2, 3].map((i) => `${y0 + i}年度`);
  const names = ['A社', 'B社', 'C社', 'D社', 'E社'];
  const data = names.map(() => {
    let v = int(r, 80, 600) * 10;
    return years.map(() => {
      const cur = v;
      v = Math.round((v * (100 + int(r, -12, 18))) / 100);
      return cur;
    });
  });
  const figure: Figure = {
    type: 'table',
    title: '主要5社の売上高の推移',
    unit: '百万円',
    head: ['', ...years],
    rows: names.map((n, i) => [n, ...data[i].map((v) => fmt(v))]),
  };
  const makers: QMaker[] = [
    () => {
      const c = int(r, 0, 4);
      const t = int(r, 1, 3);
      const [a, b] = [data[c][t - 1], data[c][t]];
      const g = growth(a, b);
      if (Math.abs(g) < 2) return null;
      const up = g > 0;
      return mkQ(
        'rate',
        `${names[c]}の${years[t]}の売上高は、前年度と比べておよそ何％${up ? '増加' : '減少'}したか。`,
        numChoices(r, Math.abs(g), { dp: 1, unit: '%', traps: [(Math.abs(b - a) / b) * 100] }),
        [
          '増減率 ＝ (今年 − 前年) ÷ 前年。分母は必ず「前年」',
          `(${fmt(b)} − ${fmt(a)}) ÷ ${fmt(a)} ＝ ${f1(g)}%  →  約 ${f1(Math.abs(g))}% の${up ? '増加' : '減少'}`,
        ],
      );
    },
    () => {
      const c = int(r, 0, 4);
      const t = int(r, 0, 3);
      const col = data.map((row) => row[t]);
      const total = sumOf(col);
      const v = col[c];
      return mkQ(
        'share',
        `${years[t]}の5社の売上高合計に占める${names[c]}の割合は、およそ何％か。`,
        numChoices(r, (v / total) * 100, { dp: 1, unit: '%', traps: [(v / (total - v)) * 100] }),
        [`5社の合計 ＝ ${col.map((x) => fmt(x)).join(' ＋ ')} ＝ ${fmt(total)}`, `${fmt(v)} ÷ ${fmt(total)} ＝ 約 ${f1((v / total) * 100)}%`],
      );
    },
    () => {
      const t = int(r, 0, 3);
      let [c, e] = two(r, 5);
      if (data[c][t] < data[e][t]) [c, e] = [e, c];
      const x = data[c][t] / data[e][t];
      if (x < 1.1) return null;
      const dp = ratioDp(x);
      return mkQ(
        'ratio',
        `${years[t]}において、${names[c]}の売上高は${names[e]}のおよそ何倍か。`,
        numChoices(r, x, { dp, unit: '倍', traps: [1 / x] }),
        ['「A は B の何倍か」＝ A ÷ B（「の」のほうで割る）', `${fmt(data[c][t])} ÷ ${fmt(data[e][t])} ＝ 約 ${fmt(x, dp)}倍`],
      );
    },
    () => {
      const c = int(r, 0, 4);
      const total = sumOf(data[c]);
      return mkQ(
        'sum',
        `${names[c]}の4年間の売上高の平均は、およそいくらか。`,
        numChoices(r, total / 4, { unit: '百万円', traps: [total / 5, total / 3] }),
        [`4年間の合計 ＝ ${data[c].map((x) => fmt(x)).join(' ＋ ')} ＝ ${fmt(total)}`, `${fmt(total)} ÷ 4 ＝ 約 ${fmt(total / 4)}百万円`],
      );
    },
    () => {
      const a = int(r, 0, 2);
      const b = int(r, a + 1, 3);
      const gs = data.map((row) => growth(row[a], row[b]));
      const best = clearBest(gs);
      if (best < 0 || gs[best] <= 0) return null;
      return mkQ(
        'pick',
        `${years[a]}から${years[b]}にかけて、売上高の増加率が最も大きい会社はどれか。`,
        labelChoices(names, best),
        [
          names.map((n, i) => `${n} ${f1(gs[i])}%`).join('、'),
          '全部をきっちり計算しない。「増えた額が大きく、もとの額が小さい」会社にあたりをつけて 2 社ほど比べる',
        ],
      );
    },
  ];
  return { figure, makers };
}

function branchPerCapita(r: Rng): Scene {
  const names = ['札幌支店', '東京支店', '名古屋支店', '大阪支店', '福岡支店'];
  const staff = names.map(() => int(r, 12, 95));
  const sales = staff.map((s) => Math.round((s * int(r, 180, 420)) / 10));
  const per = sales.map((s, i) => s / staff[i]);
  const figure: Figure = {
    type: 'table',
    title: '支店別の売上高と従業員数',
    head: ['', '売上高（百万円）', '従業員数（人）'],
    rows: names.map((n, i) => [n, fmt(sales[i]), fmt(staff[i])]),
  };
  const makers: QMaker[] = [
    () => {
      const c = int(r, 0, 4);
      const v = per[c] * 100;
      return mkQ(
        'perunit',
        `${names[c]}の従業員1人あたりの売上高は、およそ何万円か。`,
        numChoices(r, v, { unit: '万円', traps: [per[(c + 1) % 5] * 100, per[(c + 2) % 5] * 100] }),
        [
          `売上高 ÷ 従業員数 ＝ ${fmt(sales[c])} ÷ ${staff[c]} ＝ 約 ${f2(per[c])}（百万円）`,
          `単位をそろえる： 1百万円 ＝ 100万円 なので 約 ${fmt(v)}万円`,
        ],
      );
    },
    () => {
      const best = clearBest(per);
      if (best < 0) return null;
      return mkQ('pick', '従業員1人あたりの売上高が最も大きい支店はどれか。', labelChoices(names, best), [
        names.map((n, i) => `${n} ${f1(per[i])}`).join('、') + '（百万円／人）',
        '売上高 ÷ 従業員数 を上位候補だけ計算する。売上高が大きいだけの支店にひっかからない',
      ]);
    },
    () => {
      const c = int(r, 0, 4);
      const total = sumOf(staff);
      return mkQ(
        'share',
        `5支店の従業員数の合計に占める${names[c]}の割合は、およそ何％か。`,
        numChoices(r, (staff[c] / total) * 100, { dp: 1, unit: '%', traps: [(staff[c] / (total - staff[c])) * 100] }),
        [`従業員数の合計 ＝ ${staff.join(' ＋ ')} ＝ ${total}`, `${staff[c]} ÷ ${total} ＝ 約 ${f1((staff[c] / total) * 100)}%`],
      );
    },
    () => {
      let [c, e] = two(r, 5);
      if (sales[c] < sales[e]) [c, e] = [e, c];
      const x = sales[c] / sales[e];
      if (x < 1.1) return null;
      const dp = ratioDp(x);
      return mkQ(
        'ratio',
        `${names[c]}の売上高は、${names[e]}のおよそ何倍か。`,
        numChoices(r, x, { dp, unit: '倍', traps: [1 / x] }),
        ['「A は B の何倍か」＝ A ÷ B', `${fmt(sales[c])} ÷ ${fmt(sales[e])} ＝ 約 ${fmt(x, dp)}倍`],
      );
    },
  ];
  return { figure, makers };
}

function pieSales(r: Rng): Scene {
  const theme = pick(r, [
    { title: 'カフェチェーンの商品別売上構成比', parts: ['コーヒー', 'その他の飲料', 'フード', 'デザート', '物販'], unit: '百万円', noun: '売上高' },
    { title: 'ECサイトのカテゴリ別売上構成比', parts: ['家電', 'ファッション', '食品', '書籍', 'その他'], unit: '億円', noun: '売上高' },
    { title: 'E社の事業別売上構成比', parts: ['住宅', '都市開発', '海外', '管理', 'その他'], unit: '億円', noun: '売上高' },
    { title: 'ある地域の技術輸出額の産業別構成比', parts: ['輸送機械', '電気機械', '化学', '情報通信', 'その他'], unit: '億円', noun: '輸出額' },
  ]);
  const pcts = split(r, 5, 6);
  const total = int(r, 6, 45) * 100;
  const { parts, unit, noun } = theme;
  const amount = (i: number) => (total * pcts[i]) / 100;
  const figure: Figure = {
    type: 'pie',
    title: theme.title,
    slices: parts.map((name, i) => ({ name, pct: pcts[i] })),
    note: `総額：${fmt(total)}${unit}`,
  };
  const makers: QMaker[] = [
    () => {
      const [c, e] = two(r, 5);
      return mkQ(
        'amount',
        `「${parts[c]}」の${noun}はいくらか。`,
        numChoices(r, amount(c), { unit, exact: true, traps: [amount(e), amount((c + 2) % 5)] }),
        ['実数 ＝ 全体 × 構成比', `${fmt(total)} × ${pcts[c] / 100} ＝ ${fmt(amount(c))}${unit}`],
      );
    },
    () => {
      let [c, e] = two(r, 5);
      if (pcts[c] < pcts[e]) [c, e] = [e, c];
      const x = pcts[c] / pcts[e];
      const dp = ratioDp(x);
      return mkQ(
        'ratio',
        `「${parts[c]}」の${noun}は、「${parts[e]}」のおよそ何倍か。`,
        numChoices(r, x, { dp, unit: '倍', traps: [1 / x] }),
        ['同じ全体に対する割合どうしなので、総額を使わず構成比だけで比べられる', `${pcts[c]} ÷ ${pcts[e]} ＝ 約 ${fmt(x, dp)}倍`],
      );
    },
    () => {
      let [c, e] = two(r, 5);
      if (pcts[c] < pcts[e]) [c, e] = [e, c];
      const diff = r() < 0.5;
      const p = diff ? pcts[c] - pcts[e] : pcts[c] + pcts[e];
      const other = diff ? pcts[c] + pcts[e] : pcts[c] - pcts[e];
      return mkQ(
        'sum',
        `「${parts[c]}」と「${parts[e]}」の${noun}の${diff ? '差' : '合計'}はいくらか。`,
        numChoices(r, (total * p) / 100, { unit, exact: true, traps: [(total * other) / 100, amount(c)] }),
        [
          `先に構成比を${diff ? '引く' : '足す'}： ${pcts[c]} ${diff ? '−' : '＋'} ${pcts[e]} ＝ ${p}%`,
          `${fmt(total)} × ${p / 100} ＝ ${fmt((total * p) / 100)}${unit}`,
        ],
      );
    },
    () => {
      const c = int(r, 0, 4);
      const x = pick(r, [10, 20, 25, 30, 40, 50]);
      const inc = (amount(c) * x) / 100;
      return mkQ(
        'chain',
        `来期、「${parts[c]}」の${noun}だけが${x}%増え、ほかは変わらないとすると、総額はおよそいくらになるか。`,
        numChoices(r, total + inc, { unit, traps: [total * (1 + x / 100), total + amount(c)] }),
        [
          `「${parts[c]}」の${noun} ＝ ${fmt(total)} × ${pcts[c] / 100} ＝ ${fmt(amount(c))}`,
          `増える分 ＝ ${fmt(amount(c))} × ${x / 100} ＝ ${f1(inc)}`,
          `総額 ＝ ${fmt(total)} ＋ ${f1(inc)} ＝ 約 ${fmt(total + inc)}${unit}`,
        ],
      );
    },
  ];
  return { figure, makers };
}

function bandYears(r: Rng): Scene {
  const y0 = int(r, 2018, 2021);
  const years = [y0, y0 + 2, y0 + 4].map((y) => `${y}年度`);
  const parts = pick(r, [
    ['国内販売', '海外販売', 'サービス', 'その他'],
    ['食品', '衣料品', '住関連', 'その他'],
    ['個人向け', '法人向け', '官公庁向け', 'その他'],
  ]);
  const pcts = years.map(() => split(r, 4, 8));
  let t = int(r, 8, 30) * 100;
  const totals = years.map(() => {
    const cur = t;
    t += int(r, -2, 6) * 100;
    return Math.max(cur, 500);
  });
  const amount = (y: number, p: number) => (totals[y] * pcts[y][p]) / 100;
  const figure: Figure = {
    type: 'band',
    title: 'G社の部門別売上構成比の推移',
    parts,
    bars: years.map((y, i) => ({ name: `${y}（総額 ${fmt(totals[i])}億円）`, pcts: pcts[i] })),
  };
  const makers: QMaker[] = [
    () => {
      const y = int(r, 0, 2);
      const p = int(r, 0, 3);
      return mkQ(
        'amount',
        `${years[y]}の「${parts[p]}」の売上高はいくらか。`,
        numChoices(r, amount(y, p), { unit: '億円', exact: true, traps: [amount((y + 1) % 3, p), amount(y, (p + 1) % 4)] }),
        ['実数 ＝ その年度の総額 × 構成比', `${fmt(totals[y])} × ${pcts[y][p] / 100} ＝ ${fmt(amount(y, p))}億円`],
      );
    },
    () => {
      const a = int(r, 0, 1);
      const b = int(r, a + 1, 2);
      const p = int(r, 0, 3);
      const [va, vb] = [amount(a, p), amount(b, p)];
      const g = growth(va, vb);
      if (Math.abs(g) < 3) return null;
      const up = g > 0;
      return mkQ(
        'rate',
        `「${parts[p]}」の売上高は、${years[a]}から${years[b]}にかけておよそ何％${up ? '増加' : '減少'}したか。`,
        numChoices(r, Math.abs(g), {
          dp: 1,
          unit: '%',
          traps: [Math.abs(growth(pcts[a][p], pcts[b][p])), Math.abs(growth(totals[a], totals[b])), Math.abs(pcts[b][p] - pcts[a][p])],
        }),
        [
          '構成比どうしを比べない。総額が違うので、まず実額に直す',
          `${years[a]}： ${fmt(totals[a])} × ${pcts[a][p] / 100} ＝ ${fmt(va)}　／　${years[b]}： ${fmt(totals[b])} × ${pcts[b][p] / 100} ＝ ${fmt(vb)}`,
          `(${fmt(vb)} − ${fmt(va)}) ÷ ${fmt(va)} ＝ 約 ${f1(g)}%`,
        ],
      );
    },
    () => {
      const y = int(r, 0, 2);
      let [p, q] = two(r, 4);
      if (pcts[y][p] < pcts[y][q]) [p, q] = [q, p];
      const x = pcts[y][p] / pcts[y][q];
      const dp = ratioDp(x);
      return mkQ(
        'ratio',
        `${years[y]}において、「${parts[p]}」の売上高は「${parts[q]}」のおよそ何倍か。`,
        numChoices(r, x, { dp, unit: '倍', traps: [1 / x] }),
        ['同じ年度の中なら、構成比だけで比べられる', `${pcts[y][p]} ÷ ${pcts[y][q]} ＝ 約 ${fmt(x, dp)}倍`],
      );
    },
    () => {
      const a = int(r, 0, 1);
      const b = int(r, a + 1, 2);
      const p = int(r, 0, 3);
      const d = amount(b, p) - amount(a, p);
      if (d < 20) return null;
      return mkQ(
        'sum',
        `${years[b]}の「${parts[p]}」の売上高は、${years[a]}より何億円多いか。`,
        numChoices(r, d, { unit: '億円', exact: true, traps: [totals[b] - totals[a], amount(b, p)] }),
        [
          `${years[b]}： ${fmt(totals[b])} × ${pcts[b][p] / 100} ＝ ${fmt(amount(b, p))}`,
          `${years[a]}： ${fmt(totals[a])} × ${pcts[a][p] / 100} ＝ ${fmt(amount(a, p))}`,
          `差 ＝ ${fmt(amount(b, p))} − ${fmt(amount(a, p))} ＝ ${fmt(d)}億円`,
        ],
      );
    },
  ];
  return { figure, makers };
}

function barTrend(r: Rng): Scene {
  const theme = pick(r, [
    { title: 'F製品の年間販売台数の推移', unit: '万台', noun: '販売台数' },
    { title: 'あるテーマパークの年間来場者数の推移', unit: '万人', noun: '来場者数' },
    { title: 'H社の年間契約件数の推移', unit: '千件', noun: '契約件数' },
  ]);
  const y0 = int(r, 2018, 2020);
  const years = [0, 1, 2, 3, 4, 5].map((i) => `${y0 + i}年`);
  let v = int(r, 90, 320);
  const vals = years.map(() => {
    const cur = v;
    v = Math.max(40, Math.round((v * (100 + int(r, -14, 24))) / 100));
    return cur;
  });
  const { unit, noun } = theme;
  const figure: Figure = { type: 'bar', title: theme.title, unit, cats: years, series: [{ name: noun, values: vals }] };
  const makers: QMaker[] = [
    () => {
      const t = int(r, 1, 5);
      const g = growth(vals[t - 1], vals[t]);
      if (Math.abs(g) < 2) return null;
      const up = g > 0;
      return mkQ(
        'rate',
        `${years[t]}の${noun}の対前年${up ? '増加' : '減少'}率は、およそ何％か。`,
        numChoices(r, Math.abs(g), { dp: 1, unit: '%', traps: [(Math.abs(vals[t] - vals[t - 1]) / vals[t]) * 100] }),
        ['対前年増減率 ＝ (今年 − 前年) ÷ 前年', `(${vals[t]} − ${vals[t - 1]}) ÷ ${vals[t - 1]} ＝ 約 ${f1(g)}%`],
      );
    },
    () => {
      const total = sumOf(vals);
      return mkQ(
        'sum',
        `6年間の${noun}の平均は、およそいくらか。`,
        numChoices(r, total / 6, { dp: 1, unit, traps: [total / 5, (Math.max(...vals) + Math.min(...vals)) / 2] }),
        [`合計 ＝ ${vals.join(' ＋ ')} ＝ ${fmt(total)}`, `${fmt(total)} ÷ 6 ＝ 約 ${f1(total / 6)}${unit}`],
      );
    },
    () => {
      const [a, b] = [vals[4], vals[5]];
      if (b / a < 1.03) return null;
      const next = (b * b) / a;
      return mkQ(
        'chain',
        `${years[5]}の対前年増加率と同じ率で翌年も増加すると、翌年の${noun}はおよそいくらになるか。`,
        numChoices(r, next, { unit, traps: [b + (b - a), b * (1 + (b - a) / b)] }),
        [
          `${years[5]}は前年の ${b} ÷ ${a} ＝ 約 ${fmt(b / a, 3)} 倍`,
          `翌年 ＝ ${b} × ${fmt(b / a, 3)} ＝ 約 ${fmt(next)}${unit}`,
          '「同じ率」は、同じ数を足すのではなく、同じ倍率をもう一度かける',
        ],
      );
    },
    () => {
      const gs = [1, 2, 3, 4, 5].map((t) => growth(vals[t - 1], vals[t]));
      const best = clearBest(gs);
      if (best < 0 || gs[best] <= 0) return null;
      return mkQ('pick', `${noun}の対前年増加率が最も大きい年はどれか。`, labelChoices(years.slice(1), best), [
        years
          .slice(1)
          .map((y, i) => `${y} ${f1(gs[i])}%`)
          .join('、'),
        '増えた数が大きい年を 2 つほど選び、前年の値で割って比べる',
      ]);
    },
    () => {
      const hi = Math.max(...vals);
      const lo = Math.min(...vals);
      const x = hi / lo;
      if (x < 1.15) return null;
      const dp = ratioDp(x);
      return mkQ(
        'ratio',
        `${noun}が最も多い年は、最も少ない年のおよそ何倍か。`,
        numChoices(r, x, { dp, unit: '倍', traps: [lo / hi, vals[5] / vals[0]] }),
        [`最多は ${hi}${unit}、最少は ${lo}${unit}`, `${hi} ÷ ${lo} ＝ 約 ${fmt(x, dp)}倍`],
      );
    },
  ];
  return { figure, makers };
}

function lineTwo(r: Rng): Scene {
  const m0 = int(r, 1, 7);
  const months = [0, 1, 2, 3, 4].map((i) => `${m0 + i}月`);
  const [na, nb] = pick(r, [
    ['G市', 'H市'],
    ['K市', 'M市'],
  ]);
  const a = months.map(() => int(r, 40, 260));
  const b = a.map((v) => Math.max(15, v + int(r, 8, 110) * (r() < 0.5 ? 1 : -1)));
  const diffs = a.map((v, i) => Math.abs(v - b[i]));
  const figure: Figure = {
    type: 'line',
    title: `${na}と${nb}の月別降水量`,
    unit: 'mm',
    cats: months,
    series: [
      { name: na, values: a },
      { name: nb, values: b },
    ],
  };
  const list = months.map((m, i) => `${m} ${diffs[i]}`).join('、');
  const makers: QMaker[] = [
    () => {
      const best = clearBest(diffs);
      if (best < 0) return null;
      return mkQ('pick', `${na}と${nb}の降水量の差が最も大きい月はどれか。`, labelChoices(months, best), [
        `差（mm）： ${list}`,
        'グラフの 2 本の線が最も離れている月を目で探してから、数値で確かめる',
      ]);
    },
    () => {
      const hi = clearBest(diffs);
      const lo = clearBest(diffs, 'min');
      if (hi < 0 || lo < 0 || diffs[lo] < 8) return null;
      const x = diffs[hi] / diffs[lo];
      return mkQ(
        'ratio',
        `2市の降水量の差が最も大きい月の差は、最も小さい月の差のおよそ何倍か。`,
        numChoices(r, x, { dp: 1, unit: '倍', traps: [diffs[lo] / diffs[hi], Math.max(...a) / Math.min(...a)] }),
        [`差（mm）： ${list}`, `最大 ${diffs[hi]} ÷ 最小 ${diffs[lo]} ＝ 約 ${f1(x)}倍`],
      );
    },
    () => {
      const first = r() < 0.5;
      const vs = first ? a : b;
      const total = sumOf(vs);
      return mkQ(
        'sum',
        `${first ? na : nb}の5か月間の平均降水量は、およそ何mmか。`,
        numChoices(r, total / 5, { dp: 1, unit: 'mm', traps: [sumOf(first ? b : a) / 5, total / 4] }),
        [`合計 ＝ ${vs.join(' ＋ ')} ＝ ${fmt(total)}`, `${fmt(total)} ÷ 5 ＝ 約 ${f1(total / 5)}mm`],
      );
    },
    () => {
      const first = r() < 0.5;
      const vs = first ? a : b;
      const i = int(r, 0, 3);
      const j = int(r, i + 1, 4);
      const g = growth(vs[i], vs[j]);
      if (Math.abs(g) < 3) return null;
      const up = g > 0;
      return mkQ(
        'rate',
        `${first ? na : nb}の降水量は、${months[i]}から${months[j]}にかけておよそ何％${up ? '増加' : '減少'}したか。`,
        numChoices(r, Math.abs(g), { dp: 1, unit: '%', traps: [(Math.abs(vs[j] - vs[i]) / vs[j]) * 100] }),
        [`(${vs[j]} − ${vs[i]}) ÷ ${vs[i]} ＝ 約 ${f1(g)}%`, '分母は「変化する前」の値'],
      );
    },
    () => {
      const [ta, tb] = [sumOf(a), sumOf(b)];
      const d = Math.abs(ta - tb);
      if (d < 10) return null;
      const [big, small] = ta > tb ? [na, nb] : [nb, na];
      return mkQ(
        'sum',
        `5か月間の降水量の合計は、${big}が${small}より何mm多いか。`,
        numChoices(r, d, { unit: 'mm', exact: true, traps: [Math.max(...diffs), d / 5] }),
        [`${na}の合計 ＝ ${fmt(ta)}、${nb}の合計 ＝ ${fmt(tb)}`, `差 ＝ ${fmt(d)}mm`],
      );
    },
  ];
  return { figure, makers };
}

function growthTable(r: Rng): Scene {
  const yb = int(r, 2019, 2021);
  const years = [1, 2, 3].map((i) => `${yb + i}年`);
  const names = ['北米', '欧州', 'アジア', '中南米', 'その他'];
  const rate = () => {
    const v = int(r, 1, 12) * 5;
    return r() < 0.35 ? -Math.min(v, 45) : v;
  };
  const data = names.map(() => years.map(rate));
  const figure: Figure = {
    type: 'table',
    title: 'J産業の地域別売上高の対前年増減率',
    unit: '%',
    head: ['', ...years],
    rows: names.map((n, i) => [n, ...data[i].map(signed)]),
    note: `各年の値は前年に対する増減率。${yb}年が基準`,
  };
  const mult = (x: number) => 1 + x / 100;
  const makers: QMaker[] = [
    () => {
      const c = int(r, 0, 4);
      const s = int(r, 0, 1);
      const [r1, r2] = [data[c][s], data[c][s + 1]];
      const k = mult(r1) * mult(r2);
      const from = s === 0 ? `${yb}年` : years[0];
      return mkQ(
        'chain',
        `${names[c]}の${from}の売上高を X とすると、${years[s + 1]}の売上高はどのように表されるか。最も近いものを選びなさい。`,
        numChoices(r, k, { dp: 2, unit: 'X', traps: [1 + (r1 + r2) / 100, mult(r1), mult(r2)] }),
        [
          `${years[s]}： X × ${fmt(mult(r1), 2)}　→　${years[s + 1]}： さらに × ${fmt(mult(r2), 2)}`,
          `${fmt(mult(r1), 2)} × ${fmt(mult(r2), 2)} ＝ ${fmt(k, 4)}  →  約 ${f2(k)}X`,
          '増減率は足し算しない（＋30% と −20% で ＋10% にはならない）。倍率にしてかける',
        ],
      );
    },
    () => {
      const c = int(r, 0, 4);
      const base = int(r, 4, 18) * 50;
      const k = mult(data[c][0]) * mult(data[c][1]);
      return mkQ(
        'chain',
        `${names[c]}の${yb}年の売上高が${fmt(base)}億円だったとき、${years[1]}の売上高はおよそ何億円か。`,
        numChoices(r, base * k, { unit: '億円', traps: [base * (1 + (data[c][0] + data[c][1]) / 100), base * mult(data[c][0])] }),
        [
          `${fmt(base)} × ${fmt(mult(data[c][0]), 2)} × ${fmt(mult(data[c][1]), 2)} ＝ 約 ${fmt(base * k)}億円`,
          '2年分の増減率を、倍率にして続けてかける',
        ],
      );
    },
    () => {
      const ks = data.map((row) => mult(row[0]) * mult(row[1]) * mult(row[2]));
      const best = clearBest(ks);
      if (best < 0) return null;
      return mkQ(
        'pick',
        `${yb}年から${years[2]}にかけて、売上高の伸びが最も大きい地域はどれか。`,
        labelChoices(names, best),
        [`${yb}年を 1 としたときの${years[2]}： ${names.map((n, i) => `${n} ${f2(ks[i])}`).join('、')}`, 'マイナスの年がある地域は、かけ算で大きく目減りする'],
      );
    },
  ];
  return { figure, makers };
}

function storePerCustomer(r: Rng): Scene {
  const names = ['P店', 'Q店', 'R店', 'S店', 'T店'];
  const customers = names.map(() => int(r, 30, 95) * 10);
  const sales = customers.map((c) => Math.round((c * int(r, 70, 160) * 10) / 1000));
  const per = sales.map((s, i) => (s * 1000) / customers[i]);
  const figure: Figure = {
    type: 'table',
    title: '店舗別の休日の来客数と売上高',
    head: ['', '来客数（人）', '売上高（千円）'],
    rows: names.map((n, i) => [n, fmt(customers[i]), fmt(sales[i])]),
  };
  const makers: QMaker[] = [
    () => {
      const c = int(r, 0, 4);
      return mkQ(
        'perunit',
        `${names[c]}の来客1人あたりの売上高は、およそ何円か。`,
        numChoices(r, per[c], { unit: '円', traps: [per[(c + 1) % 5], per[(c + 3) % 5]] }),
        [
          `売上高は「千円」単位： ${fmt(sales[c])}千円 ＝ ${fmt(sales[c] * 1000)}円`,
          `${fmt(sales[c] * 1000)} ÷ ${fmt(customers[c])} ＝ 約 ${fmt(per[c])}円`,
        ],
      );
    },
    () => {
      const best = clearBest(per);
      if (best < 0) return null;
      return mkQ('pick', '来客1人あたりの売上高が最も高い店舗はどれか。', labelChoices(names, best), [
        names.map((n, i) => `${n} ${fmt(per[i])}円`).join('、'),
        '売上高 ÷ 来客数。来客数が少ないのに売上高が大きい店舗から確かめる',
      ]);
    },
    () => {
      const c = int(r, 0, 4);
      const total = sumOf(sales);
      return mkQ(
        'share',
        `5店舗の売上高の合計に占める${names[c]}の割合は、およそ何％か。`,
        numChoices(r, (sales[c] / total) * 100, { dp: 1, unit: '%', traps: [(customers[c] / sumOf(customers)) * 100] }),
        [`売上高の合計 ＝ ${fmt(total)}千円`, `${fmt(sales[c])} ÷ ${fmt(total)} ＝ 約 ${f1((sales[c] / total) * 100)}%`],
      );
    },
    () => {
      const total = sumOf(sales);
      return mkQ(
        'sum',
        '5店舗の売上高の合計は、およそ何万円か。',
        numChoices(r, total / 10, { dp: 1, unit: '万円', traps: [total / 100, total / 5] }),
        [`合計 ＝ ${sales.map((x) => fmt(x)).join(' ＋ ')} ＝ ${fmt(total)}千円`, `1万円 ＝ 10千円 なので ${fmt(total)} ÷ 10 ＝ ${f1(total / 10)}万円`],
      );
    },
  ];
  return { figure, makers };
}

function ageShare(r: Rng): Scene {
  const theme = pick(r, [
    { title: 'ある地域の入院患者数と年齢別構成比', noun: '患者数' },
    { title: 'あるスポーツクラブの会員数と年齢別構成比', noun: '会員数' },
  ]);
  const y0 = int(r, 2010, 2014);
  const years = [y0, y0 + 5, y0 + 10].map((y) => `${y}年`);
  const ages = ['0〜19歳', '20〜39歳', '40〜64歳', '65歳以上'];
  const pcts = years.map(() => split(r, 4, 60, 1000).map((x) => x / 10));
  let t = int(r, 80, 150) * 10;
  const totals = years.map(() => {
    const cur = t;
    t += int(r, -4, 16) * 10;
    return cur;
  });
  const amount = (y: number, a: number) => (totals[y] * pcts[y][a]) / 100;
  const { noun } = theme;
  const figure: Figure = {
    type: 'table',
    title: theme.title,
    head: ['', '総数（千人）', ...ages.map((a) => `${a}（%）`)],
    rows: years.map((y, i) => [y, fmt(totals[i]), ...pcts[i].map((p) => f1(p))]),
  };
  const makers: QMaker[] = [
    () => {
      const y = int(r, 0, 2);
      const a = int(r, 0, 3);
      return mkQ(
        'amount',
        `${years[y]}の「${ages[a]}」の${noun}は、およそ何千人か。`,
        numChoices(r, amount(y, a), { unit: '千人', traps: [amount(y, (a + 1) % 4), amount((y + 1) % 3, a)] }),
        ['実数 ＝ 総数 × 構成比', `${fmt(totals[y])} × ${fmt(pcts[y][a] / 100, 3)} ＝ 約 ${fmt(amount(y, a))}千人`],
      );
    },
    () => {
      const [y1, y2] = [0, int(r, 1, 2)];
      const over40 = pcts[y2][2] + pcts[y2][3];
      const x = (totals[y2] * over40) / (totals[y1] * pcts[y1][0]);
      const dp = ratioDp(x);
      return mkQ(
        'ratio',
        `${years[y2]}の40歳以上の${noun}は、${years[y1]}の「0〜19歳」の${noun}のおよそ何倍か。`,
        numChoices(r, x, { dp, unit: '倍', traps: [over40 / pcts[y1][0], over40 / pcts[y2][0]] }),
        [
          `${years[y2]}の40歳以上： ${fmt(totals[y2])} × (${f1(pcts[y2][2])} ＋ ${f1(pcts[y2][3])})% ＝ 約 ${fmt((totals[y2] * over40) / 100)}千人`,
          `${years[y1]}の0〜19歳： ${fmt(totals[y1])} × ${f1(pcts[y1][0])}% ＝ 約 ${fmt(amount(y1, 0))}千人`,
          `${fmt((totals[y2] * over40) / 100)} ÷ ${fmt(amount(y1, 0))} ＝ 約 ${fmt(x, dp)}倍`,
        ],
      );
    },
    () => {
      const a = pick(r, [0, 3]);
      const g = growth(amount(0, a), amount(2, a));
      if (Math.abs(g) < 3) return null;
      const up = g > 0;
      return mkQ(
        'rate',
        `「${ages[a]}」の${noun}は、${years[0]}から${years[2]}にかけておよそ何％${up ? '増加' : '減少'}したか。`,
        numChoices(r, Math.abs(g), {
          dp: 1,
          unit: '%',
          traps: [Math.abs(growth(pcts[0][a], pcts[2][a])), Math.abs(growth(totals[0], totals[2])), Math.abs(pcts[2][a] - pcts[0][a])],
        }),
        [
          '構成比（%）の変化ではなく、人数に直してから比べる',
          `${years[0]}： 約 ${f1(amount(0, a))}千人　／　${years[2]}： 約 ${f1(amount(2, a))}千人`,
          `${f1(amount(2, a))} ÷ ${f1(amount(0, a))} − 1 ＝ 約 ${f1(g)}%`,
        ],
      );
    },
    () => {
      const y = int(r, 0, 2);
      const p = pcts[y][1] + pcts[y][2];
      return mkQ(
        'sum',
        `${years[y]}の「20〜39歳」と「40〜64歳」を合わせた${noun}は、およそ何千人か。`,
        numChoices(r, (totals[y] * p) / 100, { unit: '千人', traps: [amount(y, 1), amount(y, 2)] }),
        [`先に構成比を足す： ${f1(pcts[y][1])} ＋ ${f1(pcts[y][2])} ＝ ${f1(p)}%`, `${fmt(totals[y])} × ${fmt(p / 100, 3)} ＝ 約 ${fmt((totals[y] * p) / 100)}千人`],
      );
    },
  ];
  return { figure, makers };
}

function unitTrap(r: Rng): Scene {
  const y0 = int(r, 2018, 2021);
  const years = [0, 1, 2, 3].map((i) => `${y0 + i}年度`);
  let v = int(r, 85, 260);
  const tens = years.map(() => {
    const cur = v;
    v = Math.round((v * (100 + int(r, 2, 16))) / 100);
    return cur;
  });
  const oku = tens.map((x) => x);
  const show = (x: number) => f1(x / 10);
  const figure: Figure = {
    type: 'table',
    title: 'K社の研究開発費の推移',
    unit: '10億円',
    head: ['', ...years],
    rows: [['研究開発費', ...tens.map(show)]],
  };
  const makers: QMaker[] = [
    () => {
      const last = oku[3];
      const next = Math.round(last * (1 + int(r, 8, 45) / 100));
      const g = growth(last, next);
      return mkQ(
        'rate',
        `翌${y0 + 4}年度の研究開発費が${fmt(next)}億円だったとすると、対前年度の増加率はおよそ何％か。`,
        numChoices(r, g, { dp: 1, unit: '%', traps: [((next - last) / next) * 100] }),
        [
          `単位に注意： 表は「10億円」単位。${show(tens[3])} ＝ ${fmt(last)}億円`,
          `(${fmt(next)} − ${fmt(last)}) ÷ ${fmt(last)} ＝ 約 ${f1(g)}%`,
        ],
      );
    },
    () => {
      const a = int(r, 0, 2);
      const b = int(r, a + 1, 3);
      const d = oku[b] - oku[a];
      return mkQ(
        'perunit',
        `${years[b]}の研究開発費は、${years[a]}より何億円多いか。`,
        numChoices(r, d, { unit: '億円', exact: true, step: Math.max(1, Math.round(d * 0.15)), traps: [d * 10, oku[b]] }),
        [`表の単位は「10億円」： ${show(tens[b])} − ${show(tens[a])} ＝ ${show(d)}（10億円）`, `${show(d)} × 10 ＝ ${fmt(d)}億円`],
      );
    },
    () => {
      const t = int(r, 1, 3);
      const g = growth(tens[t - 1], tens[t]);
      if (g < 2) return null;
      return mkQ(
        'rate',
        `${years[t]}の研究開発費の対前年度増加率は、およそ何％か。`,
        numChoices(r, g, { dp: 1, unit: '%', traps: [((tens[t] - tens[t - 1]) / tens[t]) * 100] }),
        ['同じ単位どうしの割り算なので、単位はそのままでよい', `(${show(tens[t])} − ${show(tens[t - 1])}) ÷ ${show(tens[t - 1])} ＝ 約 ${f1(g)}%`],
      );
    },
    () => {
      const total = sumOf(oku);
      return mkQ(
        'perunit',
        '4年間の研究開発費の合計は何億円か。',
        numChoices(r, total, { unit: '億円', exact: true, traps: [total / 4, total - oku[0]] }),
        [`合計 ＝ ${tens.map(show).join(' ＋ ')} ＝ ${show(total)}（10億円）`, `${show(total)} × 10 ＝ ${fmt(total)}億円`],
      );
    },
  ];
  return { figure, makers };
}

function weightedAge(r: Rng): Scene {
  const names = ['A支店', 'B支店', 'C支店', 'D支店'];
  let staff: number[];
  let ages: number[];
  let weighted: number;
  let simple: number;
  // 単純平均と加重平均がはっきり分かれるデータにする
  do {
    staff = shuffle(r, [int(r, 90, 160), int(r, 12, 30), int(r, 15, 40), int(r, 20, 60)]);
    ages = names.map(() => int(r, 285, 465) / 10);
    weighted = sumOf(staff.map((s, i) => s * ages[i])) / sumOf(staff);
    simple = sumOf(ages) / 4;
  } while (Math.abs(weighted - simple) < 1.2);
  const figure: Figure = {
    type: 'table',
    title: '支店別の従業員数と平均年齢',
    head: ['', '従業員数（人）', '平均年齢（歳）'],
    rows: names.map((n, i) => [n, fmt(staff[i]), f1(ages[i])]),
  };
  const total = sumOf(staff);
  const makers: QMaker[] = [
    () =>
      mkQ('sum', '4支店全体の平均年齢は、およそ何歳か。', numChoices(r, weighted, { dp: 1, unit: '歳', step: 9, traps: [simple] }), [
        '人数が違うので、平均年齢をそのまま平均してはいけない（人数で重みをつける）',
        `(人数 × 平均年齢) の合計 ＝ ${f1(sumOf(staff.map((s, i) => s * ages[i])))}、人数の合計 ＝ ${total}`,
        `${f1(sumOf(staff.map((s, i) => s * ages[i])))} ÷ ${total} ＝ 約 ${f1(weighted)}歳`,
      ]),
    () => {
      const [c, e] = two(r, 4);
      const w = (staff[c] * ages[c] + staff[e] * ages[e]) / (staff[c] + staff[e]);
      const sm = (ages[c] + ages[e]) / 2;
      if (Math.abs(w - sm) < 1) return null;
      return mkQ(
        'sum',
        `${names[c]}と${names[e]}を合わせた平均年齢は、およそ何歳か。`,
        numChoices(r, w, { dp: 1, unit: '歳', step: 9, traps: [sm] }),
        [
          `(${staff[c]} × ${f1(ages[c])} ＋ ${staff[e]} × ${f1(ages[e])}) ÷ (${staff[c]} ＋ ${staff[e]})`,
          `＝ ${f1(staff[c] * ages[c] + staff[e] * ages[e])} ÷ ${staff[c] + staff[e]} ＝ 約 ${f1(w)}歳`,
          '人数の多い支店の年齢に近い値になる',
        ],
      );
    },
    () => {
      const c = int(r, 0, 3);
      return mkQ(
        'share',
        `4支店の従業員数の合計に占める${names[c]}の割合は、およそ何％か。`,
        numChoices(r, (staff[c] / total) * 100, { dp: 1, unit: '%', traps: [(staff[c] / (total - staff[c])) * 100] }),
        [`従業員数の合計 ＝ ${staff.join(' ＋ ')} ＝ ${total}`, `${staff[c]} ÷ ${total} ＝ 約 ${f1((staff[c] / total) * 100)}%`],
      );
    },
  ];
  return { figure, makers };
}

function trade(r: Rng): Scene {
  const names = ['A国', 'B国', 'C国', 'D国', 'E国'];
  const exp = names.map(() => int(r, 120, 980));
  const imp = exp.map((v) => Math.max(60, v + int(r, 15, 240) * (r() < 0.5 ? 1 : -1)));
  const bal = exp.map((v, i) => v - imp[i]);
  const figure: Figure = {
    type: 'table',
    title: '5か国の輸出額と輸入額',
    unit: '億ドル',
    head: ['', '輸出額', '輸入額'],
    rows: names.map((n, i) => [n, fmt(exp[i]), fmt(imp[i])]),
  };
  const makers: QMaker[] = [
    () => {
      const c = int(r, 0, 4);
      const plus = bal[c] > 0;
      return mkQ(
        'sum',
        `${names[c]}の貿易${plus ? '黒字' : '赤字'}額（${plus ? '輸出額 − 輸入額' : '輸入額 − 輸出額'}）はいくらか。`,
        numChoices(r, Math.abs(bal[c]), { unit: '億ドル', exact: true, traps: [Math.abs(bal[(c + 1) % 5]), Math.abs(bal[(c + 2) % 5])] }),
        [`${plus ? `${fmt(exp[c])} − ${fmt(imp[c])}` : `${fmt(imp[c])} − ${fmt(exp[c])}`} ＝ ${fmt(Math.abs(bal[c]))}億ドル`],
      );
    },
    () => {
      const best = clearBest(bal, 'max', 0.08);
      if (best < 0 || bal[best] <= 0) return null;
      return mkQ('pick', '貿易黒字（輸出額 − 輸入額）が最も大きい国はどれか。', labelChoices(names, best), [
        `輸出額 − 輸入額： ${names.map((n, i) => `${n} ${signed(bal[i])}`).join('、')}`,
        '輸出額が輸入額を上回っている国だけを比べればよい',
      ]);
    },
    () => {
      const c = int(r, 0, 4);
      const total = sumOf(exp);
      return mkQ(
        'share',
        `5か国の輸出額の合計に占める${names[c]}の割合は、およそ何％か。`,
        numChoices(r, (exp[c] / total) * 100, { dp: 1, unit: '%', traps: [(exp[c] / sumOf(imp)) * 100, (imp[c] / sumOf(imp)) * 100] }),
        [`輸出額の合計 ＝ ${exp.map((x) => fmt(x)).join(' ＋ ')} ＝ ${fmt(total)}`, `${fmt(exp[c])} ÷ ${fmt(total)} ＝ 約 ${f1((exp[c] / total) * 100)}%`],
      );
    },
    () => {
      const c = int(r, 0, 4);
      const x = exp[c] / imp[c];
      return mkQ(
        'ratio',
        `${names[c]}の輸出額は、輸入額のおよそ何倍か。`,
        numChoices(r, x, { dp: 2, unit: '倍', traps: [1 / x] }),
        ['「A は B の何倍か」＝ A ÷ B', `${fmt(exp[c])} ÷ ${fmt(imp[c])} ＝ 約 ${f2(x)}倍`],
      );
    },
  ];
  return { figure, makers };
}

const SCENARIOS: ((r: Rng) => Scene)[] = [
  companySales,
  branchPerCapita,
  pieSales,
  bandYears,
  barTrend,
  lineTwo,
  growthTable,
  storePerCustomer,
  ageShare,
  unitTrap,
  weightedAge,
  trade,
];

function valid(q: Q): boolean {
  if (q.choices.length < 4 || q.choices.length > 5) return false;
  if (q.answer < 0 || q.answer >= q.choices.length) return false;
  return new Set(q.choices.map((c) => c.text)).size === q.choices.length;
}

/** 1 つの図表に対する設問を最大 n 問つくる（同じ図表で連続して出題するため） */
export function genZuhyoSet(r: Rng, n: number, bias: Partial<Record<string, number>> = {}): CalcQ[] {
  for (let tries = 0; tries < 50; tries++) {
    const scene = pick(r, SCENARIOS)(r);
    const out: CalcQ[] = [];
    const used = new Set<string>();
    // 苦手なパターンが先に出やすいよう、重みで並べ替える
    const scored: { q: Q; key: number }[] = [];
    for (const make of shuffle(r, scene.makers)) {
      const q = make();
      if (q && valid(q)) scored.push({ q, key: r() / (bias[q.pattern] ?? 1) });
    }
    scored.sort((a, b) => a.key - b.key);
    for (const { q } of scored) {
      if (out.length >= n || used.has(q.prompt)) continue;
      used.add(q.prompt);
      out.push({ kind: 'calc', format: 'zuhyo', figure: scene.figure, ...q });
    }
    if (out.length >= Math.min(n, 2) || (n === 1 && out.length === 1)) return out;
  }
  throw new Error('図表の読み取りの問題を生成できませんでした');
}

/** count 問ぶん。同じ図表の設問が 2〜3 問ずつ続く */
export function genZuhyo(r: Rng, count: number, bias: Partial<Record<string, number>> = {}): CalcQ[] {
  const out: CalcQ[] = [];
  while (out.length < count) {
    const want = Math.min(count - out.length, int(r, 2, 3));
    out.push(...genZuhyoSet(r, want, bias));
  }
  return out.slice(0, count);
}
