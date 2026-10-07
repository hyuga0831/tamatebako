import { describe, expect, it } from 'vitest';
import type { AnswerLog, AppState, FormatId } from '../src/lib/types';
import { mulberry32 } from '../src/lib/rng';
import { FORMATS, FORMAT_ORDER } from '../src/lib/formats';
import { activeFormats, advice, daysUntil, nextAction, overall, patternBias, predict, streak, todayCount, variantOf } from '../src/lib/stats';
import { DEFAULT_SETTINGS, emptyState, parseState } from '../src/lib/store';
import { buildSession, questionCount, timeLimitOf } from '../src/lib/session';
import { RONRI } from '../src/data/ronri';
import { SHUSHI } from '../src/data/shushi';

const NOW = new Date(2026, 9, 6, 12).getTime();

function logs(f: FormatId, n: number, accuracy: number, sec: number, at = NOW): AnswerLog[] {
  return Array.from({ length: n }, (_, i) => ({ f, p: 'x', ok: i < Math.round(n * accuracy) ? 1 : 0, t: sec, at, m: 'drill' as const }));
}

const stateWith = (ls: AnswerLog[], settings = DEFAULT_SETTINGS): AppState => ({ ...emptyState(), logs: ls, settings });

describe('得点の予測', () => {
  it('記録がなければ null', () => {
    expect(predict([], 'shisoku', DEFAULT_SETTINGS)).toBeNull();
  });

  it('四則逆算：1問15秒・正答率8割なら目標（60%）に届く', () => {
    const p = predict(logs('shisoku', 40, 0.8, 15), 'shisoku', DEFAULT_SETTINGS)!;
    expect(p.reach).toBeCloseTo(36, 5);
    // 36問 × 0.8 ＋ 残り14問 × 0.2 ＝ 31.6問
    expect(p.score).toBeCloseTo(31.6 / 50, 5);
    expect(p.gauge).toBe(100);
  });

  it('解いた数が少ないうちは、ゲージを割り引く', () => {
    const p = predict(logs('shisoku', 10, 0.8, 15), 'shisoku', DEFAULT_SETTINGS)!;
    expect(p.confidence).toBeCloseTo(0.25, 5);
    expect(p.gauge).toBeCloseTo(25, 5);
  });

  it('遅すぎると、正答率が高くても届かない', () => {
    const p = predict(logs('shisoku', 40, 1, 40), 'shisoku', DEFAULT_SETTINGS)!;
    // 13.5問しか届かない → 13.5 ＋ 36.5 × 0.2 ＝ 20.8問（41.6%）
    expect(p.score).toBeCloseTo(20.8 / 50, 5);
    expect(p.gauge).toBeLessThan(75);
    expect(advice(p, 'shisoku', DEFAULT_SETTINGS)).toContain('速さ');
  });

  it('でたらめに速く答えても、ゲージは伸びない', () => {
    const p = predict(logs('shisoku', 40, 0.2, 2), 'shisoku', DEFAULT_SETTINGS)!;
    expect(p.score).toBeCloseTo(0.2, 5);
    expect(p.gauge).toBeLessThan(40);
    expect(advice(p, 'shisoku', DEFAULT_SETTINGS)).toContain('正答率');
  });

  it('席を外したときの長い時間は頭打ちにする', () => {
    const base = logs('shisoku', 39, 0.8, 12);
    const p = predict([...base, { f: 'shisoku', p: 'x', ok: 1, t: 3600, at: NOW, m: 'drill' }], 'shisoku', DEFAULT_SETTINGS)!;
    expect(p.pace).toBeLessThan(13);
  });

  it('直近の window 問だけを見る', () => {
    const old = logs('shisoku', 100, 0, 30);
    const recent = logs('shisoku', 40, 1, 10);
    expect(predict([...old, ...recent], 'shisoku', DEFAULT_SETTINGS)!.acc).toBe(1);
  });
});

describe('出題形式の絞り込み', () => {
  it('制限時間が不明なら 5 形式すべて', () => {
    expect(activeFormats(DEFAULT_SETTINGS)).toEqual(FORMAT_ORDER);
  });

  it('制限時間から形式を決める', () => {
    expect(activeFormats({ ...DEFAULT_SETTINGS, keisuTime: 9, gengoTime: 15 })).toEqual(['shisoku', 'ronri']);
    expect(activeFormats({ ...DEFAULT_SETTINGS, keisuTime: 15, gengoTime: 10 })).toEqual(['zuhyo', 'shushi']);
    expect(activeFormats({ ...DEFAULT_SETTINGS, keisuTime: 20, gengoTime: 25 })).toEqual(['kuuran', 'ronri']);
    expect(activeFormats({ ...DEFAULT_SETTINGS, keisuTime: 35, gengoTime: 12 })).toEqual(['zuhyo', 'kuuran', 'shushi']);
  });

  it('35分・25分のときは問題数の多いパターンになる', () => {
    expect(variantOf('zuhyo', DEFAULT_SETTINGS)).toEqual({ total: 29, timeSec: 900, appSec: 900 });
    expect(variantOf('zuhyo', { ...DEFAULT_SETTINGS, keisuTime: 35 })).toEqual({ total: 40, timeSec: 2100, appSec: 2100 });
    expect(variantOf('kuuran', { ...DEFAULT_SETTINGS, keisuTime: 35 })).toEqual({ total: 35, timeSec: 2100, appSec: 2100 });
    // 言語は長文が短い分、アプリ内の制限時間を縮めてある
    expect(variantOf('ronri', { ...DEFAULT_SETTINGS, gengoTime: 25 })).toEqual({ total: 52, timeSec: 1500, appSec: 1080 });
  });

  it('絞り込むと、全体のゲージは出る形式だけで計算する', () => {
    const ls = [...logs('shisoku', 40, 0.8, 15), ...logs('ronri', 24, 0.9, 20)];
    expect(overall(stateWith(ls)).gauge).toBeLessThan(60);
    expect(overall(stateWith(ls, { ...DEFAULT_SETTINGS, keisuTime: 9, gengoTime: 15 })).gauge).toBe(100);
  });
});

describe('次にやること', () => {
  it('手をつけていない形式を、計数から順に勧める', () => {
    expect(nextAction(stateWith([]))).toMatchObject({ format: 'shisoku', mode: 'drill' });
    expect(nextAction(stateWith(logs('shisoku', 10, 0.5, 20)))).toMatchObject({ format: 'zuhyo', mode: 'drill' });
  });

  it('全形式に手をつけたら、ゲージがいちばん低い形式', () => {
    const ls = [
      ...logs('shisoku', 40, 0.8, 15),
      ...logs('zuhyo', 20, 0.8, 25),
      ...logs('kuuran', 16, 0.9, 40),
      ...logs('ronri', 24, 0.5, 25),
      ...logs('shushi', 24, 0.9, 15),
    ];
    expect(nextAction(stateWith(ls))).toMatchObject({ format: 'ronri', mode: 'drill' });
  });

  it('正答率が足りていて遅いだけなら、時間を計るミニ模試', () => {
    const ls = [
      ...logs('shisoku', 40, 0.9, 30),
      ...logs('zuhyo', 20, 0.8, 25),
      ...logs('kuuran', 16, 0.9, 40),
      ...logs('ronri', 24, 0.9, 20),
      ...logs('shushi', 24, 0.9, 15),
    ];
    expect(nextAction(stateWith(ls))).toMatchObject({ format: 'shisoku', mode: 'mini' });
  });

  it('すべて満タンなら、やることはない', () => {
    const ls = [
      ...logs('shisoku', 40, 0.9, 12),
      ...logs('zuhyo', 20, 0.8, 25),
      ...logs('kuuran', 16, 0.9, 40),
      ...logs('ronri', 24, 0.9, 20),
      ...logs('shushi', 24, 0.9, 15),
    ];
    expect(overall(stateWith(ls)).gauge).toBe(100);
    expect(nextAction(stateWith(ls))).toBeNull();
  });
});

describe('日々の記録', () => {
  const DAY = 86400000;
  it('今日解いた数と連続日数', () => {
    const ls = [...logs('shisoku', 3, 1, 10, NOW - 2 * DAY), ...logs('shisoku', 4, 1, 10, NOW - DAY), ...logs('shisoku', 5, 1, 10, NOW)];
    expect(todayCount(ls, NOW)).toBe(5);
    expect(streak(ls, NOW)).toBe(3);
    // 今日まだ解いていなくても、昨日まで続いていれば途切れていない
    expect(streak(ls.slice(0, 7), NOW)).toBe(2);
    expect(streak(logs('shisoku', 3, 1, 10, NOW - 3 * DAY), NOW)).toBe(0);
  });

  it('本番までの日数', () => {
    expect(daysUntil('2026-10-06', NOW)).toBe(0);
    expect(daysUntil('2026-11-05', NOW)).toBe(30);
    expect(daysUntil('2026-10-01', NOW)).toBeNull();
    expect(daysUntil('', NOW)).toBeNull();
  });

  it('苦手なパターンほど重みが大きい', () => {
    const mk = (p: string, ok: 0 | 1): AnswerLog => ({ f: 'shisoku', p, ok, t: 10, at: NOW, m: 'drill' });
    const ls = [...Array(5).fill(mk('frac', 0)), ...Array(5).fill(mk('int1', 1))];
    const bias = patternBias(ls, 'shisoku');
    expect(bias.frac).toBeGreaterThan(bias.int1);
    expect(bias.dec).toBe(1);
  });
});

describe('保存データ', () => {
  it('壊れたデータは初期状態にする', () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState('{{{')).toEqual(emptyState());
    expect(parseState('{"v":2}')).toEqual(emptyState());
  });

  it('足りない設定は初期値で補う', () => {
    const s = parseState(JSON.stringify({ v: 1, logs: [{ f: 'shisoku', p: 'x', ok: 1, t: 9, at: 1, m: 'drill' }, null], settings: { cutoff: 40 } }));
    expect(s.logs.length).toBe(1);
    expect(s.settings).toEqual({ ...DEFAULT_SETTINGS, cutoff: 40 });
  });
});

describe('出題の組み立て', () => {
  it('ミニ模試は本番と同じペースの制限時間', () => {
    const st = emptyState();
    expect(timeLimitOf('shisoku', 'mini', st)).toBe(108);
    expect(timeLimitOf('zuhyo', 'mini', st)).toBe(186);
    expect(timeLimitOf('kuuran', 'mini', st)).toBe(240);
    expect(timeLimitOf('ronri', 'mini', st)).toBe(162);
    expect(timeLimitOf('shushi', 'mini', st)).toBe(105);
    expect(timeLimitOf('shisoku', 'drill', st)).toBe(0);
  });

  it('どの形式・モードでも、設問数と時間が合っている', () => {
    const st = emptyState();
    for (const f of FORMAT_ORDER) {
      for (const mode of ['drill', 'mini', 'full'] as const) {
        const plan = buildSession(f, mode, st, mulberry32(5));
        expect(plan.count, `${f} ${mode}`).toBe(questionCount(f, mode, st));
        expect(plan.timeLimit).toBe(timeLimitOf(f, mode, st));
        expect(plan.screens.length).toBe(plan.count / FORMATS[f].perScreen);
      }
    }
  });

  it('本番模試の長さ（問題数の多いパターンも作れる）', () => {
    const st = { ...emptyState(), settings: { ...DEFAULT_SETTINGS, keisuTime: 35 as const, gengoTime: 25 as const } };
    expect(buildSession('zuhyo', 'full', st, mulberry32(1)).count).toBe(40);
    expect(buildSession('kuuran', 'full', st, mulberry32(1)).count).toBe(35);
    const r = buildSession('ronri', 'full', st, mulberry32(1));
    expect(r.count).toBe(52);
    expect(r.timeLimit).toBe(1080);
  });

  it('言語は、しばらく解いていない長文から出す', () => {
    const st = emptyState();
    const seen = Object.fromEntries(RONRI.slice(0, 14).map((p) => [p.id, NOW]));
    const plan = buildSession('ronri', 'drill', { ...st, seen }, mulberry32(3));
    expect(plan.screens.map((q) => (q.kind === 'passage' ? q.id : '')).sort()).toEqual(['r15', 'r16']);
  });
});

describe('言語の長文', () => {
  it('論理的読解：4 設問ずつで、A・B・C がかたよっていない', () => {
    expect(RONRI.length).toBe(16);
    expect(new Set(RONRI.map((p) => p.id)).size).toBe(RONRI.length);
    const n = { A: 0, B: 0, C: 0 };
    for (const p of RONRI) {
      expect(p.items.length).toBe(4);
      const len = p.passage.join('').length;
      expect(len, p.id).toBeGreaterThan(230);
      expect(len, p.id).toBeLessThan(400);
      for (const it of p.items) {
        n[it.answer]++;
        expect(it.why.length).toBeGreaterThan(10);
      }
    }
    for (const k of ['A', 'B', 'C'] as const) expect(n[k]).toBeGreaterThanOrEqual(19);
  });

  it('趣旨判定：A はちょうど 1 つ、C は 1 つ以上', () => {
    expect(SHUSHI.length).toBe(16);
    expect(new Set(SHUSHI.map((p) => p.id)).size).toBe(SHUSHI.length);
    for (const p of SHUSHI) {
      expect(p.items.length).toBe(4);
      expect(p.items.filter((i) => i.answer === 'A').length, p.id).toBe(1);
      expect(p.items.filter((i) => i.answer === 'C').length, p.id).toBeGreaterThanOrEqual(1);
      const len = p.passage.join('').length;
      expect(len, p.id).toBeGreaterThan(230);
      expect(len, p.id).toBeLessThan(400);
    }
  });
});

describe('解説', () => {
  it('どの形式・どのパターンにも、考え方・公式・まちがえやすい点がある', async () => {
    const { LESSONS, diagnose } = await import('../src/lib/lessons');
    for (const f of FORMAT_ORDER) {
      for (const p of Object.keys(FORMATS[f].patterns)) {
        const l = LESSONS[f][p];
        expect(l, `${f}/${p}`).toBeDefined();
        expect(l.idea.length).toBeGreaterThan(0);
        expect(l.formula.length).toBeGreaterThan(0);
        expect(l.trap.length).toBeGreaterThan(0);
      }
      expect(Object.keys(LESSONS[f]).sort()).toEqual(Object.keys(FORMATS[f].patterns).sort());
    }
    for (const f of ['ronri', 'shushi'] as const) {
      for (const a of ['A', 'B', 'C'] as const) {
        for (const b of ['A', 'B', 'C'] as const) {
          if (a === b) expect(diagnose(f, a, b)).toBeNull();
          else expect(diagnose(f, a, b)).toBeTruthy();
        }
        expect(diagnose(f, null, a)).toBeNull();
      }
    }
  });

  it('まちがいの説明は、正解の選択肢には付かない', async () => {
    const { genZuhyoSet } = await import('../src/gen/zuhyo');
    const { genKuuran } = await import('../src/gen/kuuran');
    let noted = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const q of [...genZuhyoSet(mulberry32(seed), 3), genKuuran(mulberry32(seed))]) {
        if (!q.choiceNotes) continue;
        expect(q.choiceNotes.length).toBe(q.choices.length);
        expect(q.choiceNotes[q.answer]).toBeUndefined();
        noted += q.choiceNotes.filter(Boolean).length;
      }
    }
    expect(noted).toBeGreaterThan(400);
  });
});
