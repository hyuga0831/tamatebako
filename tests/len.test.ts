// 長文の文字数を一覧する（LEN=出力先 を付けたときだけ動く）
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { RONRI } from '../src/data/ronri';
import { SHUSHI } from '../src/data/shushi';

it.runIf(!!process.env.LEN)('passage lengths', () => {
  const lines = [...RONRI, ...SHUSHI].map((p) => `${p.id} ${p.passage.join('').length} (${p.passage.map((x) => x.length).join('+')})`);
  writeFileSync(process.env.LEN!, lines.join('\n'), 'utf8');
});
