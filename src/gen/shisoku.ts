// 四則逆算：等式の □ に入る数を 5 択から選ぶ。本番は 50問／9分（1問 約10.8秒）。
import type { CalcQ, Choice, Frac, Op, Tok } from '../lib/types';
import { F, add, sub, mul, div, eq, toNum, decStr, fracToDec, fracStr, gcd } from '../lib/frac';
import { type Rng, int, pick, shuffle, weighted, chance } from '../lib/rng';
import { holds } from '../lib/expr';

export const SHISOKU_PATTERNS = {
  int1: '整数（1ステップ）',
  int2: '整数（両辺に式）',
  paren: 'かっこ',
  dec: '小数',
  pct: '％（割合）',
  frac: '分数',
  sq: '□が2つ',
} as const;
export type ShisokuPattern = keyof typeof SHISOKU_PATTERNS;

const BASE_WEIGHT: Record<ShisokuPattern, number> = {
  int1: 14,
  int2: 22,
  paren: 14,
  dec: 16,
  pct: 12,
  frac: 14,
  sq: 8,
};

const N = (x: number): Tok => ({ k: 'num', s: String(x), v: F(x) });
/** 小数で書ける値をそのまま表示する */
const V = (v: Frac): Tok => ({ k: 'num', s: fracStr(v), v });
const D = (m: number, k: number): Tok => ({ k: 'num', s: decStr(m, k), v: F(m, 10 ** k) });
const P = (p: number): Tok => ({ k: 'num', s: `${p}%`, v: F(p, 100) });
const R = (n: number, d: number): Tok => ({ k: 'frac', n, d });
/** 約分してから分数トークンにする（整数になるときは整数） */
const red = (n: number, d: number): Tok => {
  const f = F(n, d);
  return f.d === 1 ? N(f.n) : R(f.n, f.d);
};
const o = (s: Op): Tok => ({ k: 'op', s });
const BOX: Tok = { k: 'box' };
const BOXPCT: Tok = { k: 'box', pct: true };
const PL = o('+');
const MI = o('−');
const MU = o('×');
const DI = o('÷');
const EQ = o('=');
const LP = o('(');
const RP = o(')');
const NO = o('の');

const s = fracStr;
/** 分数のまま表示する（分数の問題の解説用） */
const fr = (f: Frac): string => (f.d === 1 ? String(f.n) : `${f.n}/${f.d}`);

interface Built {
  pattern: ShisokuPattern;
  toks: Tok[];
  ans: Frac;
  style: 'int' | 'dec' | 'frac';
  explain: string[];
  /** よくある計算ミスで出る値 */
  traps?: Frac[];
  /** 分数の選択肢をそろえる分母 */
  base?: number;
  /** 小数点の位置だけが違う選択肢にする */
  shift?: boolean;
}

function coprimePair(r: Rng, maxD: number): [number, number] {
  for (;;) {
    const d = int(r, 2, maxD);
    const n = int(r, 1, d - 1);
    if (gcd(n, d) === 1) return [n, d];
  }
}

function int1(r: Rng): Built {
  const base = { pattern: 'int1' as const, style: 'int' as const };
  switch (int(r, 0, 5)) {
    case 0: {
      const a = int(r, 3, 19);
      const x = int(r, 6, 48);
      const c = a * x;
      return {
        ...base,
        toks: [BOX, MU, N(a), EQ, N(c)],
        ans: F(x),
        traps: [F(c - a)],
        explain: ['× は ÷ にして右辺へ移す', `□ ＝ ${c} ÷ ${a} ＝ ${x}`],
      };
    }
    case 1: {
      const a = int(r, 3, 18);
      const b = int(r, 5, 45);
      const x = a * b;
      return {
        ...base,
        toks: [BOX, DI, N(a), EQ, N(b)],
        ans: F(x),
        traps: [F(a + b)],
        explain: ['÷ は × にして右辺へ移す', `□ ＝ ${b} × ${a} ＝ ${x}`],
      };
    }
    case 2: {
      const x = int(r, 3, 24);
      const b = int(r, 4, 30);
      const c = x * b;
      return {
        ...base,
        toks: [N(c), DI, BOX, EQ, N(b)],
        ans: F(x),
        traps: [F(b)],
        explain: ['「割る数」を求めるときは、割られる数 ÷ 答え', `□ ＝ ${c} ÷ ${b} ＝ ${x}`],
      };
    }
    case 3: {
      const a = int(r, 120, 980);
      const x = int(r, 150, 2400);
      const c = a + x;
      return {
        ...base,
        toks: [BOX, PL, N(a), EQ, N(c)],
        ans: F(x),
        traps: [F(c + a)],
        explain: ['＋ は − にして右辺へ移す', `□ ＝ ${c} − ${a} ＝ ${x}`],
      };
    }
    case 4: {
      const a = int(r, 120, 980);
      const c = int(r, 150, 2400);
      const x = a + c;
      return {
        ...base,
        toks: [BOX, MI, N(a), EQ, N(c)],
        ans: F(x),
        traps: [F(Math.abs(c - a))],
        explain: ['− は ＋ にして右辺へ移す', `□ ＝ ${c} ＋ ${a} ＝ ${x}`],
      };
    }
    default: {
      const a = int(r, 300, 2000);
      const x = int(r, 50, a - 50);
      const c = a - x;
      return {
        ...base,
        toks: [N(a), MI, BOX, EQ, N(c)],
        ans: F(x),
        traps: [F(a + c)],
        explain: ['「引く数」を求めるときは、引かれる数 − 答え', `□ ＝ ${a} − ${c} ＝ ${x}`],
      };
    }
  }
}

function int2(r: Rng): Built {
  const base = { pattern: 'int2' as const, style: 'int' as const };
  switch (int(r, 0, 7)) {
    case 0: {
      const a = int(r, 3, 12);
      const b = int(r, 5, 40);
      const c = int(r, 5, 40);
      const x = a * (b + c);
      return {
        ...base,
        toks: [BOX, DI, N(a), EQ, N(b), PL, N(c)],
        ans: F(x),
        traps: [F(a * b + c), F(b + c)],
        explain: [`□ がない右辺を先に計算： ${b} ＋ ${c} ＝ ${b + c}`, `□ ＝ ${b + c} × ${a} ＝ ${x}`],
      };
    }
    case 1: {
      const a = int(r, 12, 45);
      const b = int(r, 3, 9);
      const L = a * b;
      const c = int(r, 3, Math.min(19, Math.floor(L / 4)));
      let x = Math.floor(L / c) - int(r, 0, 2);
      let d = L - x * c;
      if (d === 0) {
        x -= 1;
        d = c;
      }
      return {
        ...base,
        toks: [N(a), MU, N(b), EQ, BOX, MU, N(c), PL, N(d)],
        ans: F(x),
        traps: (L + d) % c === 0 ? [F((L + d) / c)] : [],
        explain: [
          `□ がない左辺を先に計算： ${a} × ${b} ＝ ${L}`,
          `□ × ${c} ＝ ${L} − ${d} ＝ ${L - d}`,
          `□ ＝ ${L - d} ÷ ${c} ＝ ${x}`,
        ],
      };
    }
    case 2: {
      const a = int(r, 100, 400);
      const x = int(r, 20, 300);
      const c = int(r, 50, 300);
      const b = a + x + c;
      return {
        ...base,
        toks: [N(a), PL, BOX, EQ, N(b), MI, N(c)],
        ans: F(x),
        traps: [F(b - c + a)],
        explain: [`右辺を先に計算： ${b} − ${c} ＝ ${b - c}`, `□ ＝ ${b - c} − ${a} ＝ ${x}`],
      };
    }
    case 3: {
      const a = int(r, 3, 12);
      const b = int(r, 2, 20);
      const c = int(r, 3, 25);
      const x = (c + b) * a;
      return {
        ...base,
        toks: [BOX, DI, N(a), MI, N(b), EQ, N(c)],
        ans: F(x),
        traps: [F(c * a - b), F(c * a)],
        explain: [`□ ÷ ${a} ＝ ${c} ＋ ${b} ＝ ${c + b}`, `□ ＝ ${c + b} × ${a} ＝ ${x}`],
      };
    }
    case 4: {
      const x = int(r, 2, 15);
      const q = int(r, 2, 12);
      const b = q * x;
      const c = int(r, 1, 20);
      const a = c + q;
      return {
        ...base,
        toks: [N(a), MI, N(b), DI, BOX, EQ, N(c)],
        ans: F(x),
        traps: [F(q)],
        explain: [`${b} ÷ □ ＝ ${a} − ${c} ＝ ${q}`, `□ ＝ ${b} ÷ ${q} ＝ ${x}`],
      };
    }
    case 5: {
      const a = int(r, 15, 60);
      const b = int(r, 3, a - 3);
      const L = a - b;
      const x = int(r, 4, 40);
      const d = int(r, 5, 30);
      const c = L + x + d;
      return {
        ...base,
        toks: [N(a), MI, N(b), EQ, N(c), MI, BOX, MI, N(d)],
        ans: F(x),
        traps: [F(c - d + L)],
        explain: [
          `左辺 ＝ ${a} − ${b} ＝ ${L}`,
          `右辺の数だけまとめる： ${c} − ${d} ＝ ${c - d}`,
          `□ ＝ ${c - d} − ${L} ＝ ${x}`,
        ],
      };
    }
    case 6: {
      const [p, q, t, u] = [int(r, 2, 9), int(r, 2, 9), int(r, 2, 9), int(r, 2, 9)];
      const a = p * q;
      const x = t * u;
      const b = p * t;
      const c = q * u;
      return {
        ...base,
        toks: [N(a), MU, BOX, EQ, N(b), MU, N(c)],
        ans: F(x),
        explain: [`右辺を先に計算： ${b} × ${c} ＝ ${b * c}`, `□ ＝ ${b * c} ÷ ${a} ＝ ${x}`],
      };
    }
    default: {
      const x = int(r, 3, 25);
      const a = int(r, 3, 15);
      const b = int(r, 5, 90);
      const c = x * a + b;
      return {
        ...base,
        toks: [BOX, MU, N(a), PL, N(b), EQ, N(c)],
        ans: F(x),
        traps: (c + b) % a === 0 ? [F((c + b) / a)] : [],
        explain: [`□ × ${a} ＝ ${c} − ${b} ＝ ${c - b}`, `□ ＝ ${c - b} ÷ ${a} ＝ ${x}`],
      };
    }
  }
}

function paren(r: Rng): Built {
  const base = { pattern: 'paren' as const, style: 'int' as const };
  switch (int(r, 0, 5)) {
    case 0: {
      const a = int(r, 2, 30);
      const b = int(r, 2, 12);
      const c = int(r, 3, 25);
      const x = b * c + a;
      return {
        ...base,
        toks: [LP, BOX, MI, N(a), RP, DI, N(b), EQ, N(c)],
        ans: F(x),
        traps: [F(b * c), F(Math.abs(b * c - a))],
        explain: [`かっこを 1 つの数とみる： (□ − ${a}) ＝ ${c} × ${b} ＝ ${b * c}`, `□ ＝ ${b * c} ＋ ${a} ＝ ${x}`],
      };
    }
    case 1: {
      const a = int(r, 3, 25);
      const b = int(r, 2, 20);
      const x = int(r, 2, 15);
      const c = (a + b) * x;
      return {
        ...base,
        toks: [LP, N(a), PL, N(b), RP, MU, BOX, EQ, N(c)],
        ans: F(x),
        explain: [`かっこの中を先に計算： ${a} ＋ ${b} ＝ ${a + b}`, `□ ＝ ${c} ÷ ${a + b} ＝ ${x}`],
      };
    }
    case 2: {
      const k = int(r, 4, 30);
      const b = int(r, 2, 12);
      const c = k * b;
      const a = int(r, 1, k - 1);
      const x = k - a;
      return {
        ...base,
        toks: [N(c), DI, LP, BOX, PL, N(a), RP, EQ, N(b)],
        ans: F(x),
        traps: [F(k), F(k + a)],
        explain: [`(□ ＋ ${a}) ＝ ${c} ÷ ${b} ＝ ${k}`, `□ ＝ ${k} − ${a} ＝ ${x}`],
      };
    }
    case 3: {
      const x = int(r, 2, 15);
      const a = int(r, 3, 12);
      const b = int(r, 3, Math.min(40, a * x - 1));
      const c = a * x - b;
      return {
        ...base,
        toks: [LP, N(a), MU, BOX, RP, MI, N(b), EQ, N(c)],
        ans: F(x),
        explain: [`(${a} × □) ＝ ${c} ＋ ${b} ＝ ${c + b}`, `□ ＝ ${c + b} ÷ ${a} ＝ ${x}`],
      };
    }
    case 4: {
      const x = int(r, 2, 30);
      const a = int(r, 2, 20);
      const b = int(r, 2, 9);
      const c = (x + a) * b;
      return {
        ...base,
        toks: [LP, BOX, PL, N(a), RP, MU, N(b), EQ, N(c)],
        ans: F(x),
        traps: [F(x + a), F(x + 2 * a)],
        explain: [`(□ ＋ ${a}) ＝ ${c} ÷ ${b} ＝ ${x + a}`, `□ ＝ ${x + a} − ${a} ＝ ${x}`],
      };
    }
    default: {
      const m = int(r, 2, 15);
      const a = int(r, 2, 12);
      const x = int(r, 2, 30);
      const b = m + x;
      const c = a * m;
      return {
        ...base,
        toks: [N(a), MU, LP, N(b), MI, BOX, RP, EQ, N(c)],
        ans: F(x),
        traps: [F(m), F(b + m)],
        explain: [`(${b} − □) ＝ ${c} ÷ ${a} ＝ ${m}`, `□ ＝ ${b} − ${m} ＝ ${x}`],
      };
    }
  }
}

function dec(r: Rng): Built {
  const base = { pattern: 'dec' as const, style: 'dec' as const };
  switch (int(r, 0, 5)) {
    case 0: {
      const p = int(r, 2, 9);
      const q = int(r, 2, 9);
      const i = int(r, 1, 2);
      const j = int(r, 1, 2);
      const pq = p * q;
      const divisors: number[] = [];
      for (let g = 1; g <= Math.min(pq, 25); g++) if (pq % g === 0) divisors.push(g);
      const g = pick(r, divisors);
      const e = int(r, -1, 2);
      const ans = F(g * 10 ** (e + 1), 10);
      const X = F(pq / g, 10 ** (i + j + e));
      const y = F(p, 10 ** i);
      const z = F(q, 10 ** j);
      const yz = mul(y, z);
      return {
        ...base,
        toks: [BOX, MU, V(X), EQ, V(y), MU, V(z)],
        ans,
        shift: true,
        explain: [
          `□ がない右辺を先に計算： ${s(y)} × ${s(z)} ＝ ${s(yz)}`,
          `□ ＝ ${s(yz)} ÷ ${s(X)} ＝ ${s(ans)}`,
          '選択肢は小数点の位置が違うだけ。桁の見当だけつければ選べる',
        ],
      };
    }
    case 1: {
      let m = int(r, 101, 999);
      if (m % 10 === 0) m += 3;
      const c = int(r, 1000, 9000);
      const a = F(m, 10);
      const x = sub(F(c), a);
      return {
        ...base,
        toks: [BOX, PL, D(m, 1), EQ, N(c)],
        ans: x,
        traps: [add(x, F(10)), sub(x, F(1, 10)), add(x, F(100)), add(F(c), a)],
        explain: [`□ ＝ ${c} − ${s(a)} ＝ ${s(x)}`, '一の位と小数第1位だけ確かめれば、選択肢をしぼれる'],
      };
    }
    case 2: {
      const m = pick(r, [2, 3, 4, 5, 6, 7, 8, 9, 12, 15, 16, 25, 35, 45]);
      const a = F(m, 10);
      let t = int(r, 12, 95);
      if (t % 10 === 0) t += 1;
      const x = chance(r, 0.6) ? F(int(r, 2, 40)) : F(t, 10);
      const c = mul(a, x);
      return {
        ...base,
        toks: [V(a), MU, BOX, EQ, V(c)],
        ans: x,
        traps: [mul(c, a)],
        explain: [`□ ＝ ${s(c)} ÷ ${s(a)} ＝ ${s(x)}`],
      };
    }
    case 3: {
      const a = pick(r, [F(1, 5), F(1, 4), F(2, 5), F(1, 2), F(4, 5), F(6, 5), F(3, 2), F(5, 2)]);
      const b = int(r, 4, 60);
      const x = mul(a, F(b));
      const tip = eq(a, F(1, 4))
        ? ['× 0.25 は ÷ 4 と同じ']
        : eq(a, F(1, 2))
          ? ['× 0.5 は ÷ 2 と同じ']
          : eq(a, F(1, 5))
            ? ['× 0.2 は ÷ 5 と同じ']
            : [];
      return {
        ...base,
        toks: [BOX, DI, V(a), EQ, N(b)],
        ans: x,
        traps: [div(F(b), a)],
        explain: ['÷ は × にして右辺へ移す', `□ ＝ ${b} × ${s(a)} ＝ ${s(x)}`, ...tip],
      };
    }
    case 4: {
      const x = pick(r, [F(1, 5), F(2, 5), F(1, 2), F(4, 5), F(3, 2), F(5, 2), F(4), F(5), F(8), F(12), F(15), F(25)]);
      const b = F(int(r, 3, 48), 10);
      const c = mul(x, b);
      return {
        ...base,
        toks: [V(c), DI, BOX, EQ, V(b)],
        ans: x,
        traps: [mul(c, b)],
        explain: ['「割る数」を求めるときは、割られる数 ÷ 答え', `□ ＝ ${s(c)} ÷ ${s(b)} ＝ ${s(x)}`],
      };
    }
    default: {
      let m = int(r, 105, 995);
      if (m % 10 === 0) m += 7;
      const a = F(m, 100);
      const c = F(int(r, 12, 480), 10);
      const x = add(a, c);
      return {
        ...base,
        toks: [BOX, MI, D(m, 2), EQ, V(c)],
        ans: x,
        traps: [add(x, F(1, 10)), sub(x, F(1, 100)), add(x, F(1))],
        explain: [`□ ＝ ${s(c)} ＋ ${s(a)} ＝ ${s(x)}`],
      };
    }
  }
}

const PCT_BASES = [40, 50, 60, 80, 120, 150, 200, 250, 300, 350, 400, 450, 500, 600, 750, 800, 1200];

/** a の p% が小数第1位までに収まる組み合わせ */
function nicePct(r: Rng, step = 1): { a: number; p: number; c: Frac } {
  for (;;) {
    const a = pick(r, PCT_BASES);
    const p = int(r, Math.ceil(4 / step), Math.floor(96 / step)) * step;
    const c = F(a * p, 100);
    if ([1, 2, 5, 10].includes(c.d)) return { a, p, c };
  }
}

function pct(r: Rng): Built {
  const base = { pattern: 'pct' as const };
  switch (int(r, 0, 4)) {
    case 0:
    case 3: {
      const { a, p, c } = nicePct(r);
      const rate = F(p, 100);
      return {
        ...base,
        style: 'int',
        toks: [BOX, chance(r, 0.6) ? NO : MU, P(p), EQ, V(c)],
        ans: F(a),
        explain: [`${p}% ＝ ${s(rate)}`, `□ ＝ ${s(c)} ÷ ${s(rate)} ＝ ${a}`],
      };
    }
    case 1: {
      const { a, p, c } = nicePct(r);
      return {
        ...base,
        style: 'int',
        toks: [N(a), NO, BOXPCT, EQ, V(c)],
        ans: F(p),
        explain: [`割合 ＝ ${s(c)} ÷ ${a} ＝ ${s(F(p, 100))}`, `${s(F(p, 100))} ＝ ${p}%  →  □ ＝ ${p}`],
      };
    }
    case 2: {
      const { a, p, c } = nicePct(r);
      const rate = F(p, 100);
      return {
        ...base,
        style: 'dec',
        toks: [N(a), NO, P(p), EQ, BOX],
        ans: c,
        traps: [div(F(a), rate), mul(c, F(10)), div(c, F(10))],
        explain: [`${p}% ＝ ${s(rate)}`, `□ ＝ ${a} × ${s(rate)} ＝ ${s(c)}`],
      };
    }
    default: {
      const { a: x, p, c: a } = nicePct(r, 5);
      const rate = F(p, 100);
      return {
        ...base,
        style: 'int',
        toks: [V(a), DI, BOX, EQ, P(p)],
        ans: F(x),
        explain: [`${p}% ＝ ${s(rate)}`, `□ ＝ ${s(a)} ÷ ${s(rate)} ＝ ${x}`],
      };
    }
  }
}

function frac(r: Rng): Built {
  const base = { pattern: 'frac' as const };
  switch (int(r, 0, 5)) {
    case 0:
    case 1: {
      const Dn = pick(r, [6, 8, 10, 12, 15, 18, 20, 24]);
      const nx = int(r, 1, Dn - 2);
      const ny = int(r, nx + 1, Dn - 1);
      const ans = F(ny - nx, Dn);
      const plus = chance(r, 0.5);
      const same = ans.d === Dn ? '' : ` ＝ ${fr(ans)}`;
      return {
        ...base,
        style: 'frac',
        base: Dn,
        toks: plus ? [red(nx, Dn), PL, BOX, EQ, red(ny, Dn)] : [red(ny, Dn), MI, BOX, EQ, red(nx, Dn)],
        ans,
        explain: [`分母を ${Dn} にそろえる（通分）`, `□ ＝ ${ny}/${Dn} − ${nx}/${Dn} ＝ ${ny - nx}/${Dn}${same}`],
      };
    }
    case 2: {
      const [a, b] = coprimePair(r, 9);
      const k = int(r, 2, 12);
      const c = b * k;
      return {
        ...base,
        style: 'int',
        toks: [BOX, DI, R(a, b), EQ, N(c)],
        ans: F(a * k),
        traps: (c * b) % a === 0 ? [F((c * b) / a)] : [],
        explain: ['÷ は × にして右辺へ移す', `□ ＝ ${c} × ${a}/${b} ＝ ${a * k}`],
      };
    }
    case 3: {
      const [a, b] = coprimePair(r, 9);
      const k = int(r, 2, 12);
      const c = a * k;
      return {
        ...base,
        style: 'int',
        toks: [R(a, b), MU, BOX, EQ, N(c)],
        ans: F(b * k),
        traps: (c * a) % b === 0 ? [F((c * a) / b)] : [],
        explain: ['分数で割るときは、逆数をかける', `□ ＝ ${c} ÷ ${a}/${b} ＝ ${c} × ${a === 1 ? b : `${b}/${a}`} ＝ ${b * k}`],
      };
    }
    case 4: {
      const [a, b] = coprimePair(r, 6);
      const t = int(r, 2, 4);
      const d = b * t;
      const L = a * t;
      const f = int(r, 2, 5);
      const ans = F(L, f);
      return {
        ...base,
        style: ans.d === 1 ? 'int' : 'frac',
        base: ans.d === 1 ? undefined : f,
        toks: [R(a, b), DI, R(1, d), EQ, BOX, DI, R(1, f)],
        ans,
        explain: [`左辺 ＝ ${a}/${b} × ${d} ＝ ${L}`, `□ ÷ 1/${f} ＝ ${L}  →  □ ＝ ${L} × 1/${f} ＝ ${fr(ans)}`],
      };
    }
    default: {
      const v = int(r, 2, 6);
      let u = int(r, 1, 2 * v - 1);
      while (gcd(u, v) !== 1 || u === v) u = int(r, 1, 2 * v - 1);
      const ans = F(u, v);
      const [a, b] = coprimePair(r, 5);
      const rhs = mul(ans, F(a, b));
      return {
        ...base,
        style: 'frac',
        base: v <= 3 ? v * 2 : v,
        toks: [BOX, MU, R(a, b), EQ, red(rhs.n, rhs.d)],
        ans,
        explain: ['分数で割るときは、逆数をかける', `□ ＝ ${fr(rhs)} ÷ ${a}/${b} ＝ ${fr(rhs)} × ${a === 1 ? b : `${b}/${a}`} ＝ ${fr(ans)}`],
      };
    }
  }
}

function sq(r: Rng): Built {
  const base = { pattern: 'sq' as const, style: 'int' as const };
  const SQUARES = '11×11＝121、12×12＝144、13×13＝169、14×14＝196、15×15＝225 は覚えておくと速い';
  switch (int(r, 0, 3)) {
    case 0: {
      const x = pick(r, [4, 5, 6, 7, 8, 9, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 17, 18, 19, 25]);
      const a = int(r, 5, 99);
      const plus = chance(r, 0.6) || x * x - a < 2;
      const c = plus ? x * x + a : x * x - a;
      return {
        ...base,
        toks: [BOX, MU, BOX, plus ? PL : MI, N(a), EQ, N(c)],
        ans: F(x),
        explain: [`□ × □ ＝ ${c} ${plus ? '−' : '＋'} ${a} ＝ ${x * x}`, `${x} × ${x} ＝ ${x * x} なので □ ＝ ${x}`, SQUARES],
      };
    }
    case 1: {
      const x = int(r, 2, 12);
      const a = int(r, 3, 15);
      let b = int(r, 2, 12);
      if (b === a) b += 1;
      const S = a + b;
      const T = x * S;
      const pairs: [number, number][] = [];
      for (let c = 2; c <= 9; c++) if (T % c === 0 && T / c >= 2 && T / c !== S && c !== S) pairs.push([c, T / c]);
      const pr = pairs.length > 0 && chance(r, 0.7) ? pick(r, pairs) : null;
      return {
        ...base,
        toks: [BOX, MU, N(a), PL, BOX, MU, N(b), EQ, ...(pr ? [N(pr[0]), MU, N(pr[1])] : [N(T)])],
        ans: F(x),
        explain: [
          `□ でくくる： □ × (${a} ＋ ${b}) ＝ □ × ${S}`,
          pr ? `右辺 ＝ ${pr[0]} × ${pr[1]} ＝ ${T}` : `右辺 ＝ ${T}`,
          `□ ＝ ${T} ÷ ${S} ＝ ${x}`,
        ],
      };
    }
    case 2: {
      const x = int(r, 2, 13);
      const a = int(r, 2, 9);
      const c = a * x * x;
      return {
        ...base,
        toks: [N(a), MU, BOX, MU, BOX, EQ, N(c)],
        ans: F(x),
        traps: [F(x * x)],
        explain: [`□ × □ ＝ ${c} ÷ ${a} ＝ ${x * x}`, `${x} × ${x} ＝ ${x * x} なので □ ＝ ${x}`],
      };
    }
    default: {
      const x = int(r, 3, 15);
      const W = x * x - 1;
      const cs: number[] = [];
      for (let c = 2; c <= 9; c++) if (W % c === 0 && W / c >= 2) cs.push(c);
      const right: Tok[] = [LP, BOX, PL, N(1), RP, MU, LP, BOX, MI, N(1), RP];
      const tail = [`(□＋1) × (□−1) ＝ □ × □ − 1 なので、□ × □ ＝ ${W} ＋ 1 ＝ ${x * x}`, `□ ＝ ${x}`];
      if (cs.length === 0) {
        return { ...base, toks: [N(W), EQ, ...right], ans: F(x), explain: tail };
      }
      const c = pick(r, cs);
      const m = W / c;
      const b = int(r, 2, 15);
      const a = m + b;
      return {
        ...base,
        toks: [LP, N(a), MI, N(b), RP, MU, N(c), EQ, ...right],
        ans: F(x),
        explain: [`左辺 ＝ (${a} − ${b}) × ${c} ＝ ${m} × ${c} ＝ ${W}`, ...tail],
      };
    }
  }
}

const TEMPLATES: Record<ShisokuPattern, (r: Rng) => Built> = { int1, int2, paren, dec, pct, frac, sq };

function places(v: Frac): number {
  const t = fracToDec(v);
  if (!t) return 0;
  const i = t.indexOf('.');
  return i < 0 ? 0 : t.length - i - 1;
}

const pow10 = (e: number): Frac => (e >= 0 ? F(10 ** e) : F(1, 10 ** -e));

/** 正解を含む 5 つの選択肢の値。作れなければ null */
function choiceValues(r: Rng, b: Built): Frac[] | null {
  let vals: Frac[];
  if (b.style === 'frac') {
    let base = b.base && b.base % b.ans.d === 0 ? b.base : b.ans.d;
    if (base < 4) base *= 2;
    const m = (b.ans.n * base) / b.ans.d;
    const k = Math.min(int(r, 0, 4), m - 1);
    vals = [0, 1, 2, 3, 4].map((i) => F(m - k + i, base));
  } else if (b.shift) {
    const k = int(r, 0, 4);
    vals = [0, 1, 2, 3, 4].map((i) => mul(b.ans, pow10(i - k)));
  } else {
    const dp = places(b.ans);
    const unit = F(1, 10 ** dp);
    const mag = Math.round(toNum(b.ans) * 10 ** dp);
    const step =
      mag <= 12
        ? 1
        : mag <= 60
          ? pick(r, [1, 1, 2])
          : mag <= 200
            ? pick(r, [1, 2, 5])
            : mag <= 1000
              ? pick(r, [2, 5, 10])
              : pick(r, [10, 20, 50]);
    const k = Math.min(int(r, 0, 4), Math.floor((mag - 1) / step));
    vals = [0, 1, 2, 3, 4].map((i) => add(b.ans, mul(unit, F((i - k) * step))));
    const maxPlaces = b.style === 'int' ? dp : Math.max(dp, 2);
    const traps = shuffle(
      r,
      (b.traps ?? []).filter(
        (t) => t.n > 0 && fracToDec(t) !== null && places(t) <= maxPlaces && !vals.some((v) => eq(v, t)),
      ),
    ).slice(0, 2);
    const slots = shuffle(
      r,
      [0, 1, 2, 3, 4].filter((i) => i !== k),
    );
    traps.forEach((t, j) => {
      if (!traps.slice(0, j).some((u) => eq(u, t))) vals[slots[j]] = t;
    });
  }
  if (vals.some((v) => v.n <= 0)) return null;
  for (let i = 0; i < vals.length; i++)
    for (let j = i + 1; j < vals.length; j++) if (eq(vals[i], vals[j])) return null;
  if (vals.filter((v) => holds(b.toks, v)).length !== 1) return null;
  return vals.sort((x, y) => toNum(x) - toNum(y));
}

function toChoice(v: Frac, style: Built['style']): Choice | null {
  if (style === 'frac') return v.d === 1 ? { text: String(v.n) } : { text: `${v.n}/${v.d}`, frac: v };
  const t = fracToDec(v);
  return t === null ? null : { text: t };
}

export function genShisoku(r: Rng, bias: Partial<Record<string, number>> = {}): CalcQ {
  const keys = Object.keys(BASE_WEIGHT) as ShisokuPattern[];
  for (let tries = 0; tries < 200; tries++) {
    const p = weighted(
      r,
      keys.map((k) => [k, BASE_WEIGHT[k] * (bias[k] ?? 1)] as const),
    );
    const b = TEMPLATES[p](r);
    if (b.ans.n <= 0 || !holds(b.toks, b.ans)) continue;
    const vals = choiceValues(r, b);
    if (!vals) continue;
    const choices = vals.map((v) => toChoice(v, b.style));
    if (choices.some((c) => c === null)) continue;
    return {
      kind: 'calc',
      format: 'shisoku',
      pattern: b.pattern,
      expr: b.toks,
      prompt: '□ に入る数値として正しいものを選びなさい。',
      choices: choices as Choice[],
      answer: vals.findIndex((v) => eq(v, b.ans)),
      explain: b.explain,
    };
  }
  throw new Error('四則逆算の問題を生成できませんでした');
}

/** 式を 1 行のテキストにする（復習一覧用） */
export function exprText(toks: Tok[]): string {
  return toks
    .map((t) => {
      if (t.k === 'num') return t.s;
      if (t.k === 'frac') return `${t.n}/${t.d}`;
      if (t.k === 'box') return t.pct ? '□%' : '□';
      return t.s === '=' ? '＝' : t.s === '+' ? '＋' : t.s;
    })
    .join(' ');
}
