// 生成した問題を目で確かめるためのダンプ。DUMP=出力先 を付けたときだけ動く。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { mulberry32 } from '../src/lib/rng';
import type { CalcQ, Figure } from '../src/lib/types';
import { genShisoku, exprText } from '../src/gen/shisoku';
import { genZuhyoSet } from '../src/gen/zuhyo';
import { genKuuran } from '../src/gen/kuuran';

function figText(f: Figure): string {
  const out = [`【${f.title}】${'unit' in f && f.unit ? `（単位：${f.unit}）` : ''}`];
  if (f.type === 'table') {
    out.push(f.head.join(' | '));
    for (const row of f.rows) out.push(row.join(' | '));
  } else if (f.type === 'pie') {
    out.push(f.slices.map((s) => `${s.name} ${s.pct}%`).join(' / '));
  } else if (f.type === 'band') {
    for (const b of f.bars) out.push(`${b.name}: ${f.parts.map((p, i) => `${p} ${b.pcts[i]}%`).join(' / ')}`);
  } else {
    out.push(`    ${f.cats.join(' | ')}`);
    for (const s of f.series) out.push(`${s.name}: ${s.values.join(' | ')}`);
  }
  if (f.note) out.push(`※ ${f.note}`);
  return out.join('\n');
}

function qText(q: CalcQ, showFig = true): string {
  const out: string[] = [];
  if (q.figure && showFig) out.push(figText(q.figure));
  if (q.expr) out.push(exprText(q.expr));
  out.push(`Q[${q.pattern}] ${q.prompt}`);
  out.push(q.choices.map((c, i) => `${i === q.answer ? '◎' : '・'}${c.text}`).join('  '));
  out.push(...q.explain.map((e) => `   → ${e}`));
  return out.join('\n');
}

it.runIf(!!process.env.DUMP)('dump samples', () => {
  const out: string[] = ['===== 四則逆算 ====='];
  const r1 = mulberry32(101);
  for (let i = 0; i < 60; i++) out.push(qText(genShisoku(r1)), '');
  out.push('===== 図表の読み取り =====');
  for (let seed = 1; seed <= 26; seed++) {
    const qs = genZuhyoSet(mulberry32(seed * 13), 4);
    qs.forEach((q, i) => out.push(qText(q, i === 0), ''));
    out.push('----');
  }
  out.push('===== 表の空欄推測 =====');
  const r3 = mulberry32(303);
  for (let i = 0; i < 40; i++) out.push(qText(genKuuran(r3)), '');
  writeFileSync(process.env.DUMP!, out.join('\n'), 'utf8');
});
