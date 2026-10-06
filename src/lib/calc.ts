// 画面内の電卓（ふつうの電卓と同じ、押した順に計算していく方式）
export type CalcOp = '+' | '−' | '×' | '÷';
export type CalcKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '.'
  | CalcOp | '=' | '%' | 'AC' | 'C' | 'BS' | 'M+' | 'M-' | 'MR' | 'MC';

export interface CalcState {
  /** いま表示している数（入力中の文字列） */
  cur: string;
  acc: number | null;
  op: CalcOp | null;
  /** 次に数字を押したら新しい数として入力を始める */
  fresh: boolean;
  mem: number;
  err: boolean;
}

export const initCalc: CalcState = { cur: '0', acc: null, op: null, fresh: true, mem: 0, err: false };

const MAX_DIGITS = 12;

/** 0.1 + 0.2 のような誤差を丸めて文字列にする */
export function numStr(x: number): string {
  if (!Number.isFinite(x)) return 'エラー';
  const r = Number(x.toPrecision(MAX_DIGITS));
  if (r !== 0 && (Math.abs(r) >= 1e12 || Math.abs(r) < 1e-9)) return r.toExponential(6);
  return String(r);
}

function apply(a: number, op: CalcOp, b: number): number {
  if (op === '+') return a + b;
  if (op === '−') return a - b;
  if (op === '×') return a * b;
  return b === 0 ? NaN : a / b;
}

const fail = (s: CalcState): CalcState => ({ ...s, cur: 'エラー', acc: null, op: null, fresh: true, err: true });

export function press(s: CalcState, k: CalcKey): CalcState {
  if (k === 'AC') return { ...initCalc, mem: s.mem };
  if (s.err) return k === 'C' ? { ...initCalc, mem: s.mem } : s;
  const x = parseFloat(s.cur);

  if (/^\d+$/.test(k)) {
    if (s.fresh || s.cur === '0') return { ...s, cur: k === '00' ? '0' : k, fresh: false };
    if (s.cur.replace(/[-.]/g, '').length + k.length > MAX_DIGITS) return s;
    return { ...s, cur: s.cur + k };
  }
  switch (k) {
    case '.':
      if (s.fresh) return { ...s, cur: '0.', fresh: false };
      return s.cur.includes('.') ? s : { ...s, cur: s.cur + '.' };
    case '+':
    case '−':
    case '×':
    case '÷': {
      // 演算キーを続けて押したときは、演算の種類だけ入れ替える
      if (s.op && s.acc !== null && s.fresh) return { ...s, op: k };
      const acc = s.op && s.acc !== null ? apply(s.acc, s.op, x) : x;
      if (!Number.isFinite(acc)) return fail(s);
      return { ...s, acc, op: k, cur: numStr(acc), fresh: true };
    }
    case '=': {
      if (!s.op || s.acc === null) return { ...s, cur: numStr(x), fresh: true };
      const r = apply(s.acc, s.op, x);
      if (!Number.isFinite(r)) return fail(s);
      return { ...s, cur: numStr(r), acc: null, op: null, fresh: true };
    }
    case '%': {
      // 200 + 10 % → 220、350 × 18 % → 63（ふつうの電卓と同じ）
      const v = s.op && s.acc !== null && (s.op === '+' || s.op === '−') ? (s.acc * x) / 100 : x / 100;
      return { ...s, cur: numStr(v), fresh: false };
    }
    case 'C':
      return { ...s, cur: '0', fresh: true };
    case 'BS': {
      if (s.fresh) return s;
      const t = s.cur.slice(0, -1);
      return { ...s, cur: t === '' || t === '-' ? '0' : t };
    }
    case 'M+':
      return { ...s, mem: s.mem + x, fresh: true };
    case 'M-':
      return { ...s, mem: s.mem - x, fresh: true };
    case 'MR':
      return { ...s, cur: numStr(s.mem), fresh: false };
    case 'MC':
      return { ...s, mem: 0 };
  }
  return s;
}

/** 表示用に、整数部分へ 3 桁ごとの区切りを入れる */
export function display(cur: string): string {
  if (!/^-?\d/.test(cur) || cur.includes('e')) return cur;
  const neg = cur.startsWith('-');
  const [i, f] = (neg ? cur.slice(1) : cur).split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '−' : '') + grouped + (f !== undefined ? '.' + f : '');
}
