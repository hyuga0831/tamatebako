import type { Frac, Tok } from './types';
import { F, add, sub, mul, div, eq } from './frac';

/** = を含まないトークン列を、□ に box を代入して評価する */
export function evalSide(toks: Tok[], box: Frac): Frac {
  let i = 0;
  const peekOp = () => {
    const t = toks[i];
    return t && t.k === 'op' ? t.s : null;
  };
  function atom(): Frac {
    const t = toks[i++];
    if (!t) throw new Error('unexpected end');
    if (t.k === 'num') return t.v;
    if (t.k === 'frac') return F(t.n, t.d);
    if (t.k === 'box') return t.pct ? div(box, F(100)) : box;
    if (t.s === '(') {
      const v = expr();
      const c = toks[i++];
      if (!c || c.k !== 'op' || c.s !== ')') throw new Error('missing )');
      return v;
    }
    throw new Error(`unexpected operator ${t.s}`);
  }
  function term(): Frac {
    let v = atom();
    for (;;) {
      const o = peekOp();
      if (o === '×' || o === 'の') {
        i++;
        v = mul(v, atom());
      } else if (o === '÷') {
        i++;
        v = div(v, atom());
      } else return v;
    }
  }
  function expr(): Frac {
    let v = term();
    for (;;) {
      const o = peekOp();
      if (o === '+') {
        i++;
        v = add(v, term());
      } else if (o === '−') {
        i++;
        v = sub(v, term());
      } else return v;
    }
  }
  const v = expr();
  if (i !== toks.length) throw new Error('trailing tokens');
  return v;
}

/** □ に box を入れたとき等式が成り立つか */
export function holds(toks: Tok[], box: Frac): boolean {
  const k = toks.findIndex((t) => t.k === 'op' && t.s === '=');
  if (k < 0) return false;
  try {
    return eq(evalSide(toks.slice(0, k), box), evalSide(toks.slice(k + 1), box));
  } catch {
    return false;
  }
}
