import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/lib/rng';
import { F } from '../src/lib/frac';
import { holds } from '../src/lib/expr';
import type { CalcQ, Choice, Frac } from '../src/lib/types';
import { genShisoku, SHISOKU_PATTERNS, exprText } from '../src/gen/shisoku';
import { genZuhyo, genZuhyoSet, ZUHYO_PATTERNS } from '../src/gen/zuhyo';
import { genKuuran, KUURAN_PATTERNS } from '../src/gen/kuuran';

function choiceValue(c: Choice): Frac {
  if (c.frac) return c.frac;
  const t = c.text.replace(/,/g, '');
  const i = t.indexOf('.');
  if (i < 0) return F(Number(t));
  const dp = t.length - i - 1;
  return F(Number(t.replace('.', '')), 10 ** dp);
}

function checkShape(q: CalcQ, n = 5) {
  expect(q.choices.length).toBe(n);
  expect(q.answer).toBeGreaterThanOrEqual(0);
  expect(q.answer).toBeLessThan(q.choices.length);
  expect(new Set(q.choices.map((c) => c.text)).size).toBe(q.choices.length);
  expect(q.explain.length).toBeGreaterThan(0);
  for (const line of q.explain) {
    expect(line).not.toMatch(/NaN|undefined|Infinity/);
  }
  expect(q.prompt).not.toMatch(/NaN|undefined|Infinity/);
}

describe('四則逆算', () => {
  it('正解の選択肢だけが等式を満たす', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 4000; seed++) {
      const q = genShisoku(mulberry32(seed));
      checkShape(q);
      seen.add(q.pattern);
      const ok = q.choices.map((c) => holds(q.expr!, choiceValue(c)));
      const label = `seed ${seed}: ${exprText(q.expr!)} / ${q.choices.map((c) => c.text).join(', ')}`;
      expect(ok.filter(Boolean).length, label).toBe(1);
      expect(ok[q.answer], label).toBe(true);
    }
    expect([...seen].sort()).toEqual(Object.keys(SHISOKU_PATTERNS).sort());
  });

  it('苦手パターンの重みづけが効く', () => {
    const r = mulberry32(7);
    let n = 0;
    for (let i = 0; i < 300; i++) if (genShisoku(r, { frac: 20 }).pattern === 'frac') n++;
    expect(n).toBeGreaterThan(150);
  });
});

describe('図表の読み取り', () => {
  it('選択肢と図表が壊れていない', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 3000; seed++) {
      const qs = genZuhyoSet(mulberry32(seed), 3);
      expect(qs.length).toBeGreaterThanOrEqual(2);
      for (const q of qs) {
        checkShape(q, q.choices.length === 4 ? 4 : 5);
        expect(q.figure).toBeDefined();
        expect(q.figure).toBe(qs[0].figure);
        seen.add(q.pattern);
        for (const c of q.choices) expect(c.text).not.toMatch(/NaN|Infinity|^[-−]/);
      }
      expect(new Set(qs.map((q) => q.prompt)).size).toBe(qs.length);
    }
    expect([...seen].sort()).toEqual(Object.keys(ZUHYO_PATTERNS).sort());
  });

  it('指定した問題数ちょうどを返す', () => {
    for (const n of [1, 5, 6, 29]) expect(genZuhyo(mulberry32(n), n).length).toBe(n);
  });
});

describe('表の空欄推測', () => {
  it('空欄がちょうど 1 つあり、選択肢が壊れていない', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 3000; seed++) {
      const q = genKuuran(mulberry32(seed));
      checkShape(q);
      seen.add(q.pattern);
      const fig = q.figure!;
      expect(fig.type).toBe('table');
      if (fig.type !== 'table') continue;
      const blanks = fig.rows.flat().filter((c) => c === '？').length;
      expect(blanks, `seed ${seed} ${q.pattern}`).toBe(1);
      for (const row of fig.rows) expect(row.length).toBe(fig.head.length);
      for (const c of q.choices) expect(c.text, `seed ${seed} ${q.pattern}`).not.toMatch(/NaN|Infinity|^[-−]/);
    }
    expect([...seen].sort()).toEqual(Object.keys(KUURAN_PATTERNS).sort());
  });
});
