// 表の空欄推測：表の中の規則を見つけて、空欄（？）の値を 5 択から選ぶ。
// 本番は 20問／20分 または 35問／35分（どちらも 1問 約60秒）。
import type { CalcQ, Choice, Figure } from '../lib/types';
import { type Rng, int, pick, shuffle, chance, weighted } from '../lib/rng';
import { numChoices, fmt, trap, WHY } from './choices';

export const KUURAN_PATTERNS = {
  prop: '比例（1あたりが一定）',
  linear: '一定の増え方（基本＋従量）',
  sumfix: '合計・内訳',
  unitprice: '単価を逆算',
  product: 'かけ算でできる行',
  hidden: 'かくれた要素',
  order: '大小関係ではさむ',
  growth: '一定の倍率で変化',
} as const;
export type KuuranPattern = keyof typeof KUURAN_PATTERNS;

const BASE_WEIGHT: Record<KuuranPattern, number> = {
  prop: 26,
  linear: 16,
  sumfix: 10,
  unitprice: 12,
  product: 12,
  hidden: 8,
  order: 8,
  growth: 8,
};

const PROMPT = '表の空欄（？）に入る数値として、最も近いものを選びなさい。';

interface Built {
  pattern: KuuranPattern;
  figure: Figure;
  choices: Choice[];
  answer: number;
  choiceNotes?: (string | undefined)[];
  explain: string[];
}

const sumOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const show = (x: number): string => (Number.isInteger(x) ? fmt(x) : fmt(x, 1));
const rowDp = (xs: number[]): number => (xs.every((x) => Number.isInteger(x)) ? 0 : 1);

function distinct(r: Rng, n: number, lo: number, hi: number, mul = 1): number[] {
  const set = new Set<number>();
  while (set.size < n) set.add(int(r, Math.ceil(lo / mul), Math.floor(hi / mul)) * mul);
  return [...set];
}

const COLS = {
  store: ['A店', 'B店', 'C店', 'D店', 'E店', 'F店'],
  branch: ['A支店', 'B支店', 'C支店', 'D支店', 'E支店', 'F支店'],
  area: ['北エリア', '東エリア', '南エリア', '西エリア', '中央エリア', '湾岸エリア'],
  group: ['団体A', '団体B', '団体C', '団体D', '団体E', '団体F'],
  item: ['商品A', '商品B', '商品C', '商品D', '商品E', '商品F'],
  day: ['月', '火', '水', '木', '金', '土'],
  times: ['第1回', '第2回', '第3回', '第4回', '第5回', '第6回'],
};
const years = (r: Rng, n: number): string[] => {
  const y0 = int(r, 2018, 2021);
  return Array.from({ length: n }, (_, i) => `${y0 + i}年度`);
};
const months = (r: Rng, n: number): string[] => {
  const m0 = int(r, 1, 7);
  return Array.from({ length: n }, (_, i) => `${m0 + i}月`);
};

/** 行のセルを文字列にする（blank の列は「？」） */
const cells = (xs: number[], blank = -1): string[] => {
  const dp = rowDp(xs);
  return xs.map((x, i) => (i === blank ? '？' : fmt(x, dp)));
};

interface PropTheme {
  title: string;
  cols: (r: Rng, n: number) => string[];
  a: string;
  b: string;
  /** b ÷ a の候補（小数第1位まで） */
  ks: number[];
  aRange: [number, number, number];
  per: string;
  noise?: { label: string; range: [number, number] };
}

const PROP_THEMES: PropTheme[] = [
  {
    title: '支店別の従業員数と交通費支給額',
    cols: (_r, n) => COLS.branch.slice(0, n),
    a: '従業員数（人）',
    b: '交通費支給額（万円）',
    ks: [0.6, 0.7, 0.8, 1.2, 1.5],
    aRange: [20, 95, 1],
    per: '1人あたり',
    noise: { label: '平均勤続年数（年）', range: [6, 19] },
  },
  {
    title: '年度別の生産数と製造コスト',
    cols: years,
    a: '生産数（千個）',
    b: '製造コスト（百万円）',
    ks: [2, 2.5, 3, 3.5, 4],
    aRange: [110, 240, 2],
    per: '千個あたり',
    noise: { label: '稼働日数（日）', range: [236, 252] },
  },
  {
    title: '月別の来店者数とドリンク販売数',
    cols: months,
    a: '来店者数（千人）',
    b: 'ドリンク販売数（千杯）',
    ks: [1.5, 2, 2.5, 3],
    aRange: [40, 92, 2],
    per: '1人あたり',
    noise: { label: '平均気温（℃）', range: [9, 29] },
  },
  {
    title: 'エリア別の店舗数と売上高',
    cols: (_r, n) => COLS.area.slice(0, n),
    a: '店舗数（店）',
    b: '売上高（億円）',
    ks: [1.2, 1.5, 1.8, 2.5],
    aRange: [40, 150, 5],
    per: '1店舗あたり',
    noise: { label: '平均築年数（年）', range: [4, 22] },
  },
  {
    title: '学習塾の教室別の在籍者数と合格者数',
    cols: (_r, n) => COLS.store.slice(0, n).map((s) => s.replace('店', '教室')),
    a: '在籍者数（人）',
    b: '合格者数（人）',
    ks: [0.6, 0.7, 0.8],
    aRange: [120, 380, 10],
    per: '在籍者に対する割合',
    noise: { label: '講師数（人）', range: [8, 26] },
  },
  {
    title: 'ECサイトの月別の注文件数と問い合わせ件数',
    cols: months,
    a: '注文件数（千件）',
    b: '問い合わせ件数（件）',
    ks: [25, 30, 40, 50],
    aRange: [150, 420, 10],
    per: '注文 千件あたり',
  },
  {
    title: '営業所別の営業担当者数と月間訪問件数',
    cols: (_r, n) => COLS.branch.slice(0, n).map((s) => s.replace('支店', '営業所')),
    a: '営業担当者数（人）',
    b: '月間訪問件数（件）',
    ks: [35, 42, 48, 56],
    aRange: [8, 30, 1],
    per: '1人あたり',
    noise: { label: '営業車の台数（台）', range: [3, 14] },
  },
];

function prop(r: Rng): Built {
  const t = pick(r, PROP_THEMES);
  const n = int(r, 5, 6);
  const A = distinct(r, n, t.aRange[0], t.aRange[1], t.aRange[2]);
  if (chance(r, 0.5)) A.sort((x, y) => x - y);
  const k = pick(r, t.ks);
  const k10 = Math.round(k * 10);
  const B = A.map((a) => (a * k10) / 10);
  const blank = int(r, 0, n - 1);
  const askA = chance(r, 0.2);
  const ref = (blank + 1) % n;
  const rows = [
    [t.a, ...cells(A, askA ? blank : -1)],
    [t.b, ...cells(B, askA ? -1 : blank)],
  ];
  const withNoise = t.noise && chance(r, 0.6);
  if (t.noise && withNoise) {
    const noise = Array.from({ length: n }, () => int(r, t.noise!.range[0], t.noise!.range[1]));
    rows.splice(int(r, 0, 2), 0, [t.noise.label, ...cells(noise)]);
  }
  const ans = askA ? A[blank] : B[blank];
  const dp = Number.isInteger(ans) ? 0 : 1;
  const others = (askA ? A : B).filter((_, i) => i !== blank);
  const c = numChoices(r, ans, {
    dp,
    exact: true,
    rel: pick(r, [0.02, 0.03, 0.04]),
    // 「差」で考えてしまったときの値、ほかの列の平均
    traps: askA ? [trap(sumOf(others) / others.length, WHY.noRule)] : [trap(B[ref] + (A[blank] - A[ref]), WHY.byDiff), trap(sumOf(others) / others.length, WHY.noRule)],
  });
  return {
    pattern: 'prop',
    figure: { type: 'table', title: t.title, head: ['', ...t.cols(r, n)], rows },
    ...c,
    explain: [
      `どの列でも「${t.b} ÷ ${t.a}」が ${k} で一定（例： ${show(B[ref])} ÷ ${show(A[ref])} ＝ ${k}）。${t.per} ${k}`,
      askA ? `？ ＝ ${show(B[blank])} ÷ ${k} ＝ ${show(ans)}` : `？ ＝ ${show(A[blank])} × ${k} ＝ ${show(ans)}`,
      ...(withNoise && t.noise ? [`「${t.noise.label}」の行は関係がない。規則が見つからない行は無視する`] : []),
    ],
  };
}

interface LinearTheme {
  title: string;
  cols: (r: Rng, n: number) => string[];
  a: string;
  b: string;
  aRange: [number, number, number];
  slopes: number[];
  bases: number[];
  what: string;
}

const LINEAR_THEMES: LinearTheme[] = [
  {
    title: '懇親会の出席人数と費用',
    cols: (_r, n) => COLS.times.slice(0, n),
    a: '出席人数（人）',
    b: '費用の合計（円）',
    aRange: [20, 60, 5],
    slopes: [750, 800, 1200, 1500],
    bases: [6000, 9000, 12000, 15000],
    what: '1人増えるごとに',
  },
  {
    title: '水道の使用量と料金',
    cols: months,
    a: '使用量（㎥）',
    b: '料金（円）',
    aRange: [10, 42, 1],
    slopes: [140, 160, 180, 220, 260],
    bases: [1200, 1500, 1800, 2000],
    what: '1㎥ 増えるごとに',
  },
  {
    title: '配送距離と配送料',
    cols: (_r, n) => COLS.item.slice(0, n).map((s) => s.replace('商品', '便')),
    a: '配送距離（km）',
    b: '配送料（円）',
    aRange: [10, 85, 5],
    slopes: [20, 30, 40],
    bases: [500, 650, 800, 900],
    what: '1km 増えるごとに',
  },
  {
    title: '日別の最高気温とアイスコーヒーの販売数',
    cols: (_r, n) => COLS.day.slice(0, n),
    a: '最高気温（℃）',
    b: '販売数（杯）',
    aRange: [22, 35, 1],
    slopes: [12, 15, 20, 25],
    bases: [-180, -140, -90, -40],
    what: '1℃ 上がるごとに',
  },
  {
    title: '日別の最高気温とカレーパンの販売個数',
    cols: (_r, n) => COLS.day.slice(0, n),
    a: '最高気温（℃）',
    b: '販売個数（個）',
    aRange: [18, 33, 1],
    slopes: [-20, -15, -12, -10],
    bases: [820, 900, 760, 980],
    what: '1℃ 上がるごとに',
  },
];

function linear(r: Rng): Built {
  const t = pick(r, LINEAR_THEMES);
  const n = int(r, 5, 6);
  const A = distinct(r, n, t.aRange[0], t.aRange[1], t.aRange[2]);
  if (chance(r, 0.4)) A.sort((x, y) => x - y);
  const k = pick(r, t.slopes);
  const base = pick(r, t.bases);
  const B = A.map((a) => base + k * a);
  const blank = int(r, 0, n - 1);
  // 説明に使う 2 列（空欄以外）
  const [i, j] = shuffle(
    r,
    A.map((_, idx) => idx).filter((idx) => idx !== blank),
  )
    .slice(0, 2)
    .sort((x, y) => A[x] - A[y]);
  const ans = B[blank];
  const dA = A[j] - A[i];
  const dB = B[j] - B[i];
  const c = numChoices(r, ans, {
    exact: true,
    rel: pick(r, [0.03, 0.04, 0.06]),
    // 比例だと思い込んだときの値
    traps: [trap((B[i] / A[i]) * A[blank], WHY.byRatio), trap((B[j] / A[j]) * A[blank], WHY.byRatio)],
  });
  return {
    pattern: 'linear',
    figure: {
      type: 'table',
      title: t.title,
      head: ['', ...t.cols(r, n)],
      rows: [
        [t.a, ...cells(A)],
        [t.b, ...cells(B, blank)],
      ],
    },
    ...c,
    explain: [
      `${t.a} が ${show(A[i])} → ${show(A[j])}（${dA} 増）のとき、${t.b} は ${show(B[i])} → ${show(B[j])}（${dB > 0 ? `${fmt(dB)} 増` : `${fmt(-dB)} 減`}）`,
      `${t.what} ${k > 0 ? `${fmt(k)} 増える` : `${fmt(-k)} 減る`}`,
      `？ ＝ ${show(B[i])} ${k > 0 ? '＋' : '−'} ${fmt(Math.abs(k))} × (${show(A[blank])} − ${show(A[i])}) ＝ ${show(ans)}`,
      '割り算（÷）が一定にならないときは、差（増え方）に注目する',
    ],
  };
}

function sumfix(r: Rng): Built {
  const n = int(r, 5, 6);
  if (chance(r, 0.5)) {
    const t = pick(r, [
      { title: 'エリア別のアンケート結果（各エリアの回答者数は同じ）', a: 'SNS広告で知った（人）', b: 'チラシで知った（人）', cols: COLS.area },
      { title: '製品別のアンケート結果（各製品の回答者数は同じ）', a: 'Webサイトで購入（人）', b: '店頭で購入（人）', cols: COLS.item },
    ]);
    const T = int(r, 120, 300);
    const A = distinct(r, n, Math.round(T * 0.25), Math.round(T * 0.75));
    const B = A.map((a) => T - a);
    const blank = int(r, 0, n - 1);
    const top = chance(r, 0.5);
    const ans = top ? A[blank] : B[blank];
    const other = top ? B[blank] : A[blank];
    const ref = (blank + 1) % n;
    const rowVals = (top ? A : B).filter((_, i) => i !== blank);
    return {
      pattern: 'sumfix',
      figure: {
        type: 'table',
        title: t.title,
        head: ['', ...t.cols.slice(0, n)],
        rows: [
          [t.a, ...cells(A, top ? blank : -1)],
          [t.b, ...cells(B, top ? -1 : blank)],
        ],
      },
      ...numChoices(r, ans, { exact: true, rel: pick(r, [0.04, 0.06]), traps: [trap(sumOf(rowVals) / rowVals.length, WHY.noRule), other] }),
      explain: [
        `どの列も、2 つの行を足すと ${T} で一定（例： ${A[ref]} ＋ ${B[ref]} ＝ ${T}）`,
        `？ ＝ ${T} − ${other} ＝ ${ans}`,
        '比例も差も見つからないときは、縦に足してみる',
      ],
    };
  }
  const t = pick(r, [
    { title: '日別の来場者数', parts: ['大人（人）', '子供（人）', 'シニア（人）'], total: '合計（人）', cols: COLS.day },
    { title: '店舗別の売上内訳', parts: ['食品（万円）', '日用品（万円）', '衣料品（万円）'], total: '売上合計（万円）', cols: COLS.store },
  ]);
  const parts = t.parts.map(() => Array.from({ length: n }, () => int(r, 60, 480)));
  const totals = parts[0].map((_, i) => sumOf(parts.map((p) => p[i])));
  const blank = int(r, 0, n - 1);
  const row = int(r, 0, 2);
  const ans = parts[row][blank];
  const known = [0, 1, 2].filter((x) => x !== row).map((x) => parts[x][blank]);
  return {
    pattern: 'sumfix',
    figure: {
      type: 'table',
      title: t.title,
      head: ['', ...t.cols.slice(0, n)],
      rows: [...t.parts.map((label, i) => [label, ...cells(parts[i], i === row ? blank : -1)]), [t.total, ...cells(totals)]],
    },
    ...numChoices(r, ans, { exact: true, rel: pick(r, [0.04, 0.06]), traps: [trap(totals[blank] - known[0], WHY.forgot), trap(totals[blank] - known[1], WHY.forgot)] }),
    explain: [
      `「${t.total}」は上の 3 行の合計になっている`,
      `？ ＝ ${fmt(totals[blank])} − ${fmt(known[0])} − ${fmt(known[1])} ＝ ${fmt(ans)}`,
    ],
  };
}

function unitprice(r: Rng): Built | null {
  if (chance(r, 0.5)) {
    // 2 品目：片方の数だけが違う列どうしを比べる
    const t = pick(r, [
      { title: '団体別の入館料', a: '大人（人）', b: '子供（人）', total: '入館料の合計（円）', cols: COLS.group, na: '大人', nb: '子供', pa: [800, 1800, 100], pb: [200, 700, 100] },
      { title: '注文別の代金', a: '弁当（個）', b: 'お茶（本）', total: '代金の合計（円）', cols: COLS.times, na: '弁当', nb: 'お茶', pa: [450, 950, 50], pb: [100, 180, 10] },
    ]);
    const pa = int(r, t.pa[0] / t.pa[2], t.pa[1] / t.pa[2]) * t.pa[2];
    const pb = int(r, t.pb[0] / t.pb[2], t.pb[1] / t.pb[2]) * t.pb[2];
    const a0 = int(r, 3, 12);
    const b0 = int(r, 2, 10);
    const da = int(r, 1, 5);
    const db = int(r, 1, 5);
    const known: [number, number][] = shuffle(r, [
      [a0, b0],
      [a0, b0 + db],
      [a0 + da, b0 + db],
      [a0 + da + int(r, 1, 4), b0 + int(r, 0, 3)],
    ] as [number, number][]);
    const q: [number, number] = [a0 + int(r, 2, 9), b0 + db + int(r, 1, 6)];
    if (known.some((x) => x[0] === q[0] && x[1] === q[1])) return null;
    const all = [...known, q];
    const total = (x: [number, number]) => x[0] * pa + x[1] * pb;
    const ans = total(q);
    const ia = known.findIndex((x) => x[0] === a0 && x[1] === b0);
    const ib = known.findIndex((x) => x[0] === a0 && x[1] === b0 + db);
    const ic = known.findIndex((x) => x[0] === a0 + da && x[1] === b0 + db);
    const cols = t.cols.slice(0, 5);
    return {
      pattern: 'unitprice',
      figure: {
        type: 'table',
        title: t.title,
        head: ['', ...cols],
        rows: [
          [t.a, ...all.map((x) => fmt(x[0]))],
          [t.b, ...all.map((x) => fmt(x[1]))],
          [t.total, ...all.map((x, i) => (i === 4 ? '？' : fmt(total(x))))],
        ],
      },
      ...numChoices(r, ans, { exact: true, rel: pick(r, [0.03, 0.05]), traps: [trap(q[0] * pb + q[1] * pa, WHY.swapPrice), total(q) - pb, total(q) + pa] }),
      explain: [
        `${cols[ia]}と${cols[ib]}は${t.nb}だけが ${db} 違い、合計の差は ${fmt(db * pb)}円 → ${t.nb} 1つ ${fmt(pb)}円`,
        `${cols[ib]}と${cols[ic]}は${t.na}だけが ${da} 違い、合計の差は ${fmt(da * pa)}円 → ${t.na} 1つ ${fmt(pa)}円`,
        `？ ＝ ${q[0]} × ${fmt(pa)} ＋ ${q[1]} × ${fmt(pb)} ＝ ${fmt(ans)}円`,
      ],
    };
  }
  // 3 品目：1 品目だけ数が違う日どうしを比べる
  const names = ['カレー', '牛丼', 'オムライス'];
  const prices = shuffle(r, [350, 400, 450, 500, 550, 600, 650]).slice(0, 3);
  const base = [int(r, 40, 110), int(r, 40, 110), int(r, 30, 90)];
  const d = [int(r, 5, 25), int(r, 5, 25), int(r, 5, 25)];
  const variants = [base, ...[0, 1, 2].map((i) => base.map((v, j) => (j === i ? v + d[i] : v)))];
  const perm = shuffle(r, [0, 1, 2, 3]);
  const q = [int(r, 40, 120), int(r, 40, 120), int(r, 30, 100)];
  const cols = COLS.day.slice(0, 5);
  const all = [...perm.map((o) => variants[o]), q];
  const total = (x: number[]) => sumOf(x.map((v, i) => v * prices[i]));
  const ans = total(q);
  const colOf = (variant: number) => cols[perm.indexOf(variant)];
  return {
    pattern: 'unitprice',
    figure: {
      type: 'table',
      title: '学生食堂の曜日別の販売数と売上',
      head: ['', ...cols],
      rows: [
        ...names.map((nm, i) => [`${nm}（食）`, ...all.map((x) => fmt(x[i]))]),
        ['売上合計（円）', ...all.map((x, i) => (i === 4 ? '？' : fmt(total(x))))],
      ],
    },
    ...numChoices(r, ans, {
      exact: true,
      rel: pick(r, [0.03, 0.04]),
      traps: [trap(q[0] * prices[1] + q[1] * prices[0] + q[2] * prices[2], WHY.swapPrice), sumOf(q) * Math.round(sumOf(prices) / 3)],
    }),
    explain: [
      ...names.map(
        (nm, i) => `${colOf(0)}曜と${colOf(i + 1)}曜は${nm}だけが ${d[i]} 食違い、売上の差は ${fmt(d[i] * prices[i])}円 → ${nm} 1食 ${prices[i]}円`,
      ),
      `？ ＝ ${q[0]} × ${prices[0]} ＋ ${q[1]} × ${prices[1]} ＋ ${q[2]} × ${prices[2]} ＝ ${fmt(ans)}円`,
    ],
  };
}

function product(r: Rng): Built {
  const n = 5;
  const blank = int(r, 0, n - 1);
  const ref = (blank + 1) % n;
  if (chance(r, 0.55)) {
    const price = distinct(r, n, 200, 1500, 50);
    const qty = distinct(r, n, 100, 900, 20);
    const sales = price.map((p, i) => (p * qty[i]) / 1000);
    const askQty = chance(r, 0.3);
    const ans = askQty ? qty[blank] : sales[blank];
    return {
      pattern: 'product',
      figure: {
        type: 'table',
        title: '商品別の単価・販売数・売上高',
        head: ['', ...COLS.item.slice(0, n)],
        rows: [
          ['単価（円）', ...cells(price)],
          ['販売数（個）', ...cells(qty, askQty ? blank : -1)],
          ['売上高（千円）', ...cells(sales, askQty ? -1 : blank)],
        ],
      },
      ...numChoices(r, ans, {
        exact: true,
        rel: pick(r, [0.03, 0.05]),
        traps: askQty ? [trap(sales[blank] / price[blank], WHY.unit), qty[ref]] : [trap((price[blank] * qty[blank]) / 10000, WHY.unit), (price[blank] + qty[blank]) / 10],
      }),
      explain: [
        `売上高（千円）＝ 単価 × 販売数 ÷ 1,000（例： ${fmt(price[ref])} × ${fmt(qty[ref])} ＝ ${fmt(price[ref] * qty[ref])}円 ＝ ${fmt(sales[ref])}千円）`,
        askQty
          ? `？ ＝ ${fmt(sales[blank])} × 1,000 ÷ ${fmt(price[blank])} ＝ ${fmt(ans)}個`
          : `？ ＝ ${fmt(price[blank])} × ${fmt(qty[blank])} ÷ 1,000 ＝ ${fmt(ans)}千円`,
        '単位（千円）に気をつける',
      ],
    };
  }
  const lines = Array.from({ length: n }, () => int(r, 2, 9));
  const days = distinct(r, n, 16, 26);
  const k = pick(r, [80, 120, 150, 240]);
  const out = lines.map((l, i) => l * days[i] * k);
  const ans = out[blank];
  return {
    pattern: 'product',
    figure: {
      type: 'table',
      title: '工場の月別の稼働状況と生産量',
      head: ['', ...months(r, n)],
      rows: [
        ['稼働ライン数（本）', ...cells(lines)],
        ['稼働日数（日）', ...cells(days)],
        ['生産量（個）', ...cells(out, blank)],
      ],
    },
    ...numChoices(r, ans, {
      exact: true,
      rel: pick(r, [0.03, 0.05]),
      traps: [trap(lines[blank] * out[ref] / lines[ref], WHY.oneFactor), trap(days[blank] * out[ref] / days[ref], WHY.oneFactor)],
    }),
    explain: [
      `生産量 ÷ (ライン数 × 日数) がどの月も ${k} で一定（例： ${fmt(out[ref])} ÷ (${lines[ref]} × ${days[ref]}) ＝ ${k}）`,
      `？ ＝ ${lines[blank]} × ${days[blank]} × ${k} ＝ ${fmt(ans)}個`,
      '1 つの行だけで割り切れないときは、2 つの行をかけ合わせてみる',
    ],
  };
}

function hidden(r: Rng): Built {
  const n = 5;
  const t = pick(r, [
    { title: '水族館の日別の入場者数と収入', a: '入場者数（人）', b: '売店収入（万円）', total: '総収入（万円）', cols: COLS.day, what: '入場料', per: '1人', fees: [0.08, 0.12, 0.15, 0.2, 0.25], aRange: [400, 2400, 100] as const },
    { title: '芝張り工事の面積と見積額', a: '面積（坪）', b: '資材費（万円）', total: '見積額（万円）', cols: COLS.item.map((s) => s.replace('商品', '工事')), what: '人件費', per: '1坪', fees: [0.3, 0.4, 0.5, 0.6], aRange: [150, 900, 50] as const },
  ]);
  const A = distinct(r, n, t.aRange[0], t.aRange[1], t.aRange[2]);
  const fee = pick(r, t.fees);
  const B = A.map(() => int(r, 30, 160));
  const T = A.map((a, i) => Math.round(a * fee * 100) / 100 + B[i]);
  const blank = int(r, 0, n - 1);
  const ref = (blank + 1) % n;
  const ans = T[blank];
  return {
    pattern: 'hidden',
    figure: {
      type: 'table',
      title: t.title,
      head: ['', ...t.cols.slice(0, n)],
      rows: [
        [t.a, ...cells(A)],
        [t.b, ...cells(B)],
        [t.total, ...cells(T, blank)],
      ],
    },
    ...numChoices(r, ans, {
      exact: true,
      rel: pick(r, [0.04, 0.06]),
      traps: [trap((T[ref] / A[ref]) * A[blank], WHY.hiddenRatio), B[blank] + T[ref] - B[ref], trap(A[blank] * fee, WHY.forgot)],
    }),
    explain: [
      `「${t.total} − ${t.b}」を出すと、${t.a} に比例している（例： (${show(T[ref])} − ${show(B[ref])}) ÷ ${fmt(A[ref])} ＝ ${fee}）`,
      `表にない「${t.what}（${t.per} ${fee}万円）」がかくれている`,
      `？ ＝ ${fmt(A[blank])} × ${fee} ＋ ${show(B[blank])} ＝ ${show(ans)}`,
    ],
  };
}

function order(r: Rng): Built | null {
  const wRate = pick(r, [40, 50, 60, 80]);
  const dRate = pick(r, [2, 3, 4, 5]);
  const base = pick(r, [400, 500, 600]);
  const price = (w: number, d: number) => Math.round((base + wRate * w + dRate * d) / 10) * 10;
  const w0 = int(r, 6, 14);
  const d0 = int(r, 14, 32) * 10;
  type Row = { w: number; d: number };
  const rows: Row[] = [
    { w: w0 - int(r, 1, 3), d: d0 - int(r, 2, 8) * 10 },
    { w: w0 + int(r, 1, 3), d: d0 + int(r, 2, 8) * 10 },
    { w: w0 + int(r, 2, 5), d: d0 - int(r, 6, 10) * 10 },
    { w: w0 - int(r, 2, 4), d: d0 + int(r, 6, 12) * 10 },
    chance(r, 0.5) ? { w: w0 + int(r, 4, 7), d: d0 + int(r, 9, 15) * 10 } : { w: Math.max(1, w0 - int(r, 4, 5)), d: Math.max(20, d0 - int(r, 9, 12) * 10) },
  ];
  const lows = rows.filter((x) => x.w <= w0 && x.d <= d0);
  const highs = rows.filter((x) => x.w >= w0 && x.d >= d0);
  const lower = Math.max(...lows.map((x) => price(x.w, x.d)));
  const upper = Math.min(...highs.map((x) => price(x.w, x.d)));
  const ans = price(w0, d0);
  if (!(lower < ans && ans < upper) || upper - lower < 60) return null;
  const vals = [ans, lower - int(r, 3, 9) * 10, lower - int(r, 12, 24) * 10, upper + int(r, 3, 9) * 10, upper + int(r, 12, 24) * 10];
  if (vals.some((v) => v <= 0) || new Set(vals).size !== 5) return null;
  vals.sort((a, b) => a - b);
  const table = shuffle(r, [...rows.map((x) => ({ ...x, blank: false })), { w: w0, d: d0, blank: true }]);
  const label = (i: number) => `荷物${'ABCDEF'[i]}`;
  const lowIdx = table.findIndex((x) => !x.blank && price(x.w, x.d) === lower && x.w <= w0 && x.d <= d0);
  const highIdx = table.findIndex((x) => !x.blank && price(x.w, x.d) === upper && x.w >= w0 && x.d >= d0);
  return {
    pattern: 'order',
    figure: {
      type: 'table',
      title: '荷物の重さ・配送距離と運送料金',
      head: ['', '重さ（kg）', '距離（km）', '料金（円）'],
      rows: table.map((x, i) => [label(i), fmt(x.w), fmt(x.d), x.blank ? '？' : fmt(price(x.w, x.d))]),
    },
    choices: vals.map((v) => ({ text: `${fmt(v)}円` })),
    answer: vals.indexOf(ans),
    explain: [
      '重いほど、遠いほど料金が高い。きっちり計算できないので、大小関係ではさむ',
      `重さも距離も ？ 以下なのは${label(lowIdx)}（${fmt(lower)}円）、どちらも ？ 以上なのは${label(highIdx)}（${fmt(upper)}円）`,
      `${fmt(lower)}円 より高く ${fmt(upper)}円 より安い選択肢は ${fmt(ans)}円 だけ`,
    ],
  };
}

function growth(r: Rng): Built {
  const t = pick(r, [
    { title: '年度別の会員数', label: '会員数（人）' },
    { title: '年度別の売上高', label: '売上高（百万円）' },
    { title: 'アプリの年度別ダウンロード数', label: 'ダウンロード数（千件）' },
  ]);
  const ratio = pick(r, [1.1, 1.2, 1.25, 1.5, 0.8, 0.9]);
  const n = 5;
  let v = int(r, 20, 90) * 10;
  const vals: number[] = [];
  for (let i = 0; i < n; i++) {
    vals.push(Math.round(v));
    v *= ratio;
  }
  const blank = chance(r, 0.6) ? n - 1 : int(r, 2, 3);
  const ans = vals[blank];
  const prev = vals[blank - 1];
  // 説明に使う、空欄を含まないとなり合う 2 組
  const pairs = [0, 1, 2, 3].filter((i) => i !== blank && i + 1 !== blank).slice(0, 2);
  return {
    pattern: 'growth',
    figure: { type: 'table', title: t.title, head: ['', ...years(r, n)], rows: [[t.label, ...cells(vals, blank)]] },
    ...numChoices(r, ans, {
      rel: pick(r, [0.04, 0.06]),
      // 「毎年同じ数だけ増える」と考えたときの値
      traps: [trap(prev + (prev - vals[blank - 2]), WHY.linearGrowth)],
    }),
    explain: [
      `前の年度に対する倍率が一定： ${pairs.map((i) => `${fmt(vals[i + 1])} ÷ ${fmt(vals[i])} ＝ 約 ${ratio}`).join('、')}`,
      `？ ＝ ${fmt(prev)} × ${ratio} ＝ 約 ${fmt(ans)}`,
      '差が一定でないときは、割り算（何倍か）が一定かを確かめる',
    ],
  };
}

const TEMPLATES: Record<KuuranPattern, (r: Rng) => Built | null> = {
  prop,
  linear,
  sumfix,
  unitprice,
  product,
  hidden,
  order,
  growth,
};

export function genKuuran(r: Rng, bias: Partial<Record<string, number>> = {}): CalcQ {
  const keys = Object.keys(BASE_WEIGHT) as KuuranPattern[];
  for (let tries = 0; tries < 200; tries++) {
    const p = weighted(
      r,
      keys.map((k) => [k, BASE_WEIGHT[k] * (bias[k] ?? 1)] as const),
    );
    const b = TEMPLATES[p](r);
    if (!b || b.choices.length !== 5 || b.answer < 0) continue;
    if (new Set(b.choices.map((c) => c.text)).size !== 5) continue;
    return { kind: 'calc', format: 'kuuran', prompt: PROMPT, ...b };
  }
  throw new Error('表の空欄推測の問題を生成できませんでした');
}
