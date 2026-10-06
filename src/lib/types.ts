export type FormatId = 'shisoku' | 'zuhyo' | 'kuuran' | 'ronri' | 'shushi';
export type Subject = 'keisu' | 'gengo';
export type Mode = 'drill' | 'mini' | 'full';
export type Abc = 'A' | 'B' | 'C';

/** 既約分数（d > 0） */
export interface Frac {
  n: number;
  d: number;
}

export type Op = '+' | '−' | '×' | '÷' | '=' | '(' | ')' | 'の';

/** 四則逆算の式を構成するトークン */
export type Tok =
  | { k: 'num'; s: string; v: Frac }
  | { k: 'frac'; n: number; d: number }
  | { k: 'op'; s: Op }
  /** pct: 「□%」と表示し、値は □/100 として扱う */
  | { k: 'box'; pct?: boolean };

export interface Choice {
  text: string;
  /** 分数で表示する選択肢 */
  frac?: Frac;
}

export interface TableFig {
  type: 'table';
  title: string;
  unit?: string;
  /** 1列目は行見出し */
  head: string[];
  rows: string[][];
  note?: string;
}

export interface Series {
  name: string;
  values: number[];
}

export interface BarFig {
  type: 'bar';
  title: string;
  unit: string;
  cats: string[];
  series: Series[];
  decimals?: number;
  note?: string;
}

export interface LineFig {
  type: 'line';
  title: string;
  unit: string;
  cats: string[];
  series: Series[];
  decimals?: number;
  note?: string;
}

export interface PieFig {
  type: 'pie';
  title: string;
  slices: { name: string; pct: number }[];
  note?: string;
}

export interface BandFig {
  type: 'band';
  title: string;
  parts: string[];
  bars: { name: string; pcts: number[] }[];
  note?: string;
}

export type Figure = TableFig | BarFig | LineFig | PieFig | BandFig;

export interface CalcQ {
  kind: 'calc';
  format: 'shisoku' | 'zuhyo' | 'kuuran';
  /** 成績集計用のパターン ID */
  pattern: string;
  figure?: Figure;
  expr?: Tok[];
  prompt: string;
  choices: Choice[];
  answer: number;
  explain: string[];
}

export interface PassageItem {
  text: string;
  answer: Abc;
  why: string;
}

export interface PassageQ {
  kind: 'passage';
  format: 'ronri' | 'shushi';
  id: string;
  passage: string[];
  items: PassageItem[];
}

export type Question = CalcQ | PassageQ;

/** 1問ごとの解答記録 */
export interface AnswerLog {
  f: FormatId;
  p: string;
  ok: 0 | 1;
  /** かかった秒数 */
  t: number;
  at: number;
  m: Mode;
}

export interface SessionLog {
  f: FormatId;
  m: Mode;
  at: number;
  total: number;
  answered: number;
  correct: number;
  /** 制限時間（秒）。ドリルは 0 */
  limit: number;
  used: number;
}

export type KeisuTime = 0 | 9 | 15 | 20 | 35;
export type GengoTime = 0 | 10 | 12 | 15 | 25;

export interface Settings {
  /** 予想ボーダー（%） */
  cutoff: number;
  /** 受検案内に書かれた計数の制限時間（分）。0 は不明 */
  keisuTime: KeisuTime;
  gengoTime: GengoTime;
  /** 受検日（YYYY-MM-DD）。未定は空文字 */
  testDate: string;
  goal: string;
}

export interface AppState {
  v: 1;
  logs: AnswerLog[];
  sessions: SessionLog[];
  /** 言語の長文を最後に解いた時刻 */
  seen: Record<string, number>;
  tipsRead: Partial<Record<FormatId, boolean>>;
  settings: Settings;
}
