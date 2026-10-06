import type { Frac } from './types';

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function F(n: number, d = 1): Frac {
  if (d === 0) throw new Error('zero denominator');
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

export const add = (a: Frac, b: Frac): Frac => F(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Frac, b: Frac): Frac => F(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Frac, b: Frac): Frac => F(a.n * b.n, a.d * b.d);
export const div = (a: Frac, b: Frac): Frac => F(a.n * b.d, a.d * b.n);
export const eq = (a: Frac, b: Frac): boolean => a.n * b.d === b.n * a.d;
export const toNum = (a: Frac): number => a.n / a.d;
export const isInt = (a: Frac): boolean => a.d === 1;

/** m × 10^-k を、浮動小数の誤差なしで文字列にする（例: decStr(4, 3) → "0.004"） */
export function decStr(m: number, k: number): string {
  const neg = m < 0;
  let digits = String(Math.abs(m));
  if (k <= 0) return (neg ? '-' : '') + digits + '0'.repeat(-k);
  if (digits.length <= k) digits = '0'.repeat(k - digits.length + 1) + digits;
  const head = digits.slice(0, digits.length - k);
  const tail = digits.slice(digits.length - k).replace(/0+$/, '');
  return (neg ? '-' : '') + head + (tail ? '.' + tail : '');
}

/** 分母が 2 と 5 だけでできていれば小数の文字列、そうでなければ null */
export function fracToDec(f: Frac): string | null {
  let d = f.d;
  let k = 0;
  let mult = 1;
  while (d % 10 === 0) {
    d /= 10;
    k++;
  }
  while (d % 2 === 0) {
    d /= 2;
    mult *= 5;
    k++;
  }
  while (d % 5 === 0) {
    d /= 5;
    mult *= 2;
    k++;
  }
  if (d !== 1 || k > 8) return null;
  return decStr(f.n * mult, k);
}

/** 整数・小数なら数値の文字列、それ以外は "n/d" */
export const fracStr = (f: Frac): string => fracToDec(f) ?? `${f.n}/${f.d}`;
