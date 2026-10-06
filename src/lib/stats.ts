// 突破ゲージの計算。
// 「直近の正答率」と「1問あたりの秒数」から本番の得点率を予測し、
// 目標（ボーダー予想 ＋ 余裕 10 ポイント）に対する到達度をゲージにする。
import type { AnswerLog, AppState, FormatId, Mode, Settings, Subject } from './types';
import { FORMATS, FORMAT_ORDER } from './formats';

/** ボーダー予想に上乗せする余裕（ポイント） */
export const MARGIN = 10;

export const targetOf = (s: Settings): number => Math.min(95, s.cutoff + MARGIN);

export interface Variant {
  total: number;
  /** 本番の制限時間（秒） */
  timeSec: number;
  /** このアプリで同じ問題数を解くときの制限時間（秒）。言語は長文が短い分だけ縮めてある */
  appSec: number;
}

/** 受検案内の制限時間に合わせた、本番の問題数と時間 */
export function variantOf(f: FormatId, s: Settings): Variant {
  const spec = FORMATS[f];
  const useAlt = ((f === 'zuhyo' || f === 'kuuran') && s.keisuTime === 35) || (f === 'ronri' && s.gengoTime === 25);
  const { total, timeSec } = useAlt && spec.alt ? spec.alt : spec;
  return { total, timeSec, appSec: timeSec * spec.timeScale };
}

/** 本番で出る可能性がある形式。制限時間がわかれば絞り込める */
export function activeFormats(s: Settings): FormatId[] {
  const keisu: FormatId[] =
    s.keisuTime === 9
      ? ['shisoku']
      : s.keisuTime === 15
        ? ['zuhyo']
        : s.keisuTime === 20
          ? ['kuuran']
          : s.keisuTime === 35
            ? ['zuhyo', 'kuuran']
            : ['shisoku', 'zuhyo', 'kuuran'];
  // 12分（趣旨把握）はこのアプリに問題がないため、同じ力を使う趣旨判定で代える
  const gengo: FormatId[] =
    s.gengoTime === 10 || s.gengoTime === 12 ? ['shushi'] : s.gengoTime === 15 || s.gengoTime === 25 ? ['ronri'] : ['ronri', 'shushi'];
  return [...keisu, ...gengo];
}

export interface Prediction {
  /** これまでに解いた数 */
  count: number;
  /** 直近の正答率（0〜1） */
  acc: number;
  /** 直近の 1問あたりの秒数 */
  pace: number;
  /** このペースで本番中に手が届く問題数 */
  reach: number;
  /** 本番の予想得点率（0〜1）。届かなかった分は勘で埋めたものとする */
  score: number;
  /** データの十分さ（0〜1） */
  confidence: number;
  /** ゲージ（0〜100） */
  gauge: number;
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function predict(logs: AnswerLog[], f: FormatId, s: Settings): Prediction | null {
  const spec = FORMATS[f];
  const mine = logs.filter((l) => l.f === f);
  if (mine.length === 0) return null;
  const recent = mine.slice(-spec.window);
  const v = variantOf(f, s);
  const perQ = v.appSec / v.total;
  const acc = mean(recent.map((l) => l.ok));
  // 席を外したときなどの極端な値は、目安の 4 倍で頭打ちにする
  const pace = Math.max(1, mean(recent.map((l) => Math.min(l.t, perQ * 4))));
  const reach = Math.min(v.total, v.appSec / pace);
  const score = (reach * acc + (v.total - reach) * spec.guess) / v.total;
  const confidence = Math.min(1, mine.length / spec.window);
  const gauge = Math.min(1, score / (targetOf(s) / 100)) * confidence * 100;
  return { count: mine.length, acc, pace, reach, score, confidence, gauge };
}

export interface Overall {
  gauge: number;
  subject: Record<Subject, number>;
  per: Record<FormatId, Prediction | null>;
  active: FormatId[];
}

export function overall(state: Pick<AppState, 'logs' | 'settings'>): Overall {
  const active = activeFormats(state.settings);
  const per = Object.fromEntries(FORMAT_ORDER.map((f) => [f, predict(state.logs, f, state.settings)])) as Record<
    FormatId,
    Prediction | null
  >;
  const of = (sub: Subject) => mean(active.filter((f) => FORMATS[f].subject === sub).map((f) => per[f]?.gauge ?? 0));
  const subject = { keisu: of('keisu'), gengo: of('gengo') };
  return { gauge: (subject.keisu + subject.gengo) / 2, subject, per, active };
}

export interface NextAction {
  format: FormatId;
  mode: Mode;
  why: string;
}

/** いちばんゲージが伸びる次の一手。すべて満タンなら null */
export function nextAction(state: Pick<AppState, 'logs' | 'settings'>): NextAction | null {
  const o = overall(state);
  const untouched = o.active.find((f) => !o.per[f]);
  if (untouched) return { format: untouched, mode: 'drill', why: 'まだ手をつけていない形式' };
  const f = [...o.active].sort((a, b) => o.per[a]!.gauge - o.per[b]!.gauge)[0];
  const p = o.per[f]!;
  if (p.gauge >= 99.5) return null;
  const target = targetOf(state.settings) / 100;
  // 正答率が足りないうちは解説つきのドリル、速さが足りないなら時間を計るミニ模試
  const mode: Mode = p.count < FORMATS[f].window / 2 || p.acc < target ? 'drill' : 'mini';
  return { format: f, mode, why: 'いまゲージがいちばん低い形式' };
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** 正答率と速さのどちらを伸ばせばよいか */
export function advice(p: Prediction | null, f: FormatId, s: Settings): string {
  if (!p) return 'まだ記録がない。まずドリルを 1 セット解いて、現在地を測る。';
  const spec = FORMATS[f];
  const v = variantOf(f, s);
  const target = targetOf(s) / 100;
  if (p.score >= target) {
    return p.confidence < 1
      ? `目標ペース。あと ${spec.window - p.count} 問解けば、予想が固まってゲージが満タンになる。`
      : '目標に届いている。これ以上はやらなくていい。本番の前日に 1 セット流せば十分。';
  }
  if (p.acc <= target) {
    return `正答率が ${pct(p.acc)}。全問に手が届いても目標の ${pct(target)} に足りないので、先に攻略メモの型を確かめて、ドリルで正答率を上げる。`;
  }
  const needReach = (v.total * (target - spec.guess)) / (p.acc - spec.guess);
  const needPace = v.appSec / needReach;
  return `正答率 ${pct(p.acc)} は足りている。足りないのは速さ。1問 ${p.pace.toFixed(1)}秒 → ${needPace.toFixed(1)}秒 まで縮めれば目標に届く。`;
}

const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

export function todayCount(logs: AnswerLog[], now = Date.now()): number {
  const k = dayKey(now);
  let n = 0;
  for (let i = logs.length - 1; i >= 0 && dayKey(logs[i].at) === k; i--) n++;
  return n;
}

/** 連続して解いた日数（今日まだ解いていなくても、昨日まで続いていれば数える） */
export function streak(logs: AnswerLog[], now = Date.now()): number {
  const days = new Set(logs.map((l) => dayKey(l.at)));
  const DAY = 86400000;
  let t = days.has(dayKey(now)) ? now : now - DAY;
  let n = 0;
  while (days.has(dayKey(t))) {
    n++;
    t -= DAY;
  }
  return n;
}

export interface PatternStat {
  id: string;
  name: string;
  count: number;
  acc: number;
  pace: number;
}

export function patternStats(logs: AnswerLog[], f: FormatId): PatternStat[] {
  const spec = FORMATS[f];
  const recent = logs.filter((l) => l.f === f).slice(-200);
  return Object.entries(spec.patterns).map(([id, name]) => {
    const xs = recent.filter((l) => l.p === id);
    return { id, name, count: xs.length, acc: mean(xs.map((l) => l.ok)), pace: mean(xs.map((l) => l.t)) };
  });
}

/** 苦手なパターンほど出やすくする重み */
export function patternBias(logs: AnswerLog[], f: FormatId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of patternStats(logs, f)) out[p.id] = p.count >= 4 ? 0.6 + 2.4 * (1 - p.acc) : 1;
  return out;
}

/** 本番までの日数。未設定・過ぎた日は null */
export function daysUntil(testDate: string, now = Date.now()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) return null;
  const [y, m, d] = testDate.split('-').map(Number);
  const today = new Date(now);
  const diff = Math.round((new Date(y, m - 1, d).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  return diff >= 0 ? diff : null;
}
