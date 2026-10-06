import type { CSSProperties } from 'react';
import type { Choice, Tok } from '../lib/types';
import { exprText } from '../gen/shisoku';

export function Fraction({ n, d }: { n: number; d: number }) {
  return (
    <span className="frac" aria-label={`${d}分の${n}`}>
      <span>{n}</span>
      <span>{d}</span>
    </span>
  );
}

/** トークンのおおよその幅（em）。式が画面に収まる文字サイズを決めるのに使う */
function emOf(t: Tok): number {
  if (t.k === 'num') return t.s.length * 0.62 + (t.s.endsWith('%') ? 0.3 : 0);
  if (t.k === 'frac') return Math.max(String(t.n).length, String(t.d).length) * 0.5 + 0.45;
  if (t.k === 'box') return t.pct ? 2.25 : 1.3;
  if (t.s === '(' || t.s === ')') return 0.2;
  if (t.s === 'の') return 0.65;
  return 0.95;
}

const widthOf = (toks: Tok[]): number => toks.reduce((s, t) => s + emOf(t), 0) + 0.3 * Math.max(0, toks.length - 1);

function Token({ t }: { t: Tok }) {
  if (t.k === 'num') return <span>{t.s}</span>;
  if (t.k === 'frac') return <Fraction n={t.n} d={t.d} />;
  if (t.k === 'box')
    return t.pct ? (
      <span className="boxpct">
        <span className="box" />%
      </span>
    ) : (
      <span className="box" />
    );
  if (t.s === 'の') return <span className="no">の</span>;
  if (t.s === '(' || t.s === ')') return <span className="op paren">{t.s}</span>;
  return <span className="op">{t.s === '=' ? '＝' : t.s === '+' ? '＋' : t.s}</span>;
}

/** 四則逆算の式。長い式は文字を小さくし、それでも収まらなければ「＝」の前で折り返す */
export function Expr({ toks }: { toks: Tok[] }) {
  const k = toks.findIndex((t) => t.k === 'op' && t.s === '=');
  const sides = k < 0 ? [toks] : [toks.slice(0, k), toks.slice(k)];
  const em = Math.max(...sides.map(widthOf)) + 0.6;
  return (
    <div className="expr" role="math" aria-label={exprText(toks)} style={{ '--em': em.toFixed(2) } as CSSProperties}>
      {sides.map((side, i) => (
        <span className="side" key={i}>
          {side.map((t, j) => (
            <Token key={j} t={t} />
          ))}
        </span>
      ))}
    </div>
  );
}

export function ChoiceLabel({ c }: { c: Choice }) {
  return c.frac ? <Fraction n={c.frac.n} d={c.frac.d} /> : <>{c.text}</>;
}
