// 学習の記録。端末の localStorage に保存する（サーバーには送らない）。
import { useSyncExternalStore } from 'react';
import type { AnswerLog, AppState, FormatId, SessionLog, Settings } from './types';

const KEY = 'tamatebako:v1';
const MAX_LOGS = 5000;
const MAX_SESSIONS = 400;

export const DEFAULT_SETTINGS: Settings = { cutoff: 50, keisuTime: 0, gengoTime: 0, testDate: '', goal: '' };

export const emptyState = (): AppState => ({
  v: 1,
  logs: [],
  sessions: [],
  seen: {},
  tipsRead: {},
  settings: { ...DEFAULT_SETTINGS },
});

/** 保存データを読み込む。壊れている項目は初期値に置き換える */
export function parseState(raw: string | null): AppState {
  const base = emptyState();
  if (!raw) return base;
  try {
    const d = JSON.parse(raw) as Partial<AppState>;
    if (!d || typeof d !== 'object' || d.v !== 1) return base;
    return {
      v: 1,
      logs: Array.isArray(d.logs) ? d.logs.filter((l) => l && typeof l.f === 'string' && typeof l.t === 'number') : [],
      sessions: Array.isArray(d.sessions) ? d.sessions : [],
      seen: d.seen && typeof d.seen === 'object' ? d.seen : {},
      tipsRead: d.tipsRead && typeof d.tipsRead === 'object' ? d.tipsRead : {},
      settings: { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) },
    };
  } catch {
    return base;
  }
}

function load(): AppState {
  try {
    return parseState(localStorage.getItem(KEY));
  } catch {
    return emptyState();
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();

export const getState = (): AppState => state;

function setState(next: AppState): void {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 保存できなくても（プライベートブラウズなど）、その場の練習は続けられるようにする
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useAppState = (): AppState => useSyncExternalStore(subscribe, getState);

export function addLogs(logs: AnswerLog[]): void {
  if (logs.length === 0) return;
  setState({ ...state, logs: [...state.logs, ...logs].slice(-MAX_LOGS) });
}

export function addSession(s: SessionLog): void {
  setState({ ...state, sessions: [...state.sessions, s].slice(-MAX_SESSIONS) });
}

export function markSeen(ids: string[], at = Date.now()): void {
  if (ids.length === 0) return;
  setState({ ...state, seen: { ...state.seen, ...Object.fromEntries(ids.map((id) => [id, at])) } });
}

export function markTipsRead(f: FormatId): void {
  if (state.tipsRead[f]) return;
  setState({ ...state, tipsRead: { ...state.tipsRead, [f]: true } });
}

export function updateSettings(p: Partial<Settings>): void {
  setState({ ...state, settings: { ...state.settings, ...p } });
}

export function resetAll(): void {
  setState({ ...emptyState(), settings: state.settings });
}

export const exportJson = (): string => JSON.stringify(state);

/** 書き出したデータを読み込む。形式が違えば false */
export function importJson(raw: string): boolean {
  try {
    const d = JSON.parse(raw) as { v?: unknown };
    if (!d || d.v !== 1) return false;
  } catch {
    return false;
  }
  setState(parseState(raw));
  return true;
}
