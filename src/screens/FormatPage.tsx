import { useEffect, useState } from 'react';
import type { FormatId, Mode } from '../lib/types';
import { COMMON_RULES, FORMATS, SUBJECT_NAME } from '../lib/formats';
import { activeFormats, advice, nextAction, patternStats, predict, targetOf, variantOf } from '../lib/stats';
import { MODE_NAME, questionCount, timeLimitOf } from '../lib/session';
import { markTipsRead, useAppState } from '../lib/store';
import { go, quizPath } from '../lib/nav';
import { Meter } from '../components/Gauge';

const mmss = (sec: number): string => `${Math.floor(sec / 60)}分${sec % 60 ? `${String(sec % 60).padStart(2, '0')}秒` : ''}`;

export function BackButton({ to = '/' }: { to?: string }) {
  return (
    <button type="button" className="icon-btn" aria-label="戻る" onClick={() => go(to)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}

const MODE_NOTE: Record<Mode, string> = {
  drill: '1問ごとに答えと解き方が出る。まずはここから',
  mini: '本番と同じペースで時間を計る。答え合わせは最後',
  full: '本番と同じ問題数。仕上げの確認に',
};

export function FormatPage({ f }: { f: FormatId }) {
  const state = useAppState();
  const spec = FORMATS[f];
  const v = variantOf(f, state.settings);
  const p = predict(state.logs, f, state.settings);
  const target = targetOf(state.settings);
  const active = activeFormats(state.settings).includes(f);
  const next = nextAction(state);
  const recommended: Mode = next?.format === f ? next.mode : p && p.count >= spec.window / 2 ? 'mini' : 'drill';
  // 初めて開いたときだけ、攻略メモを開いた状態で見せる
  const [firstVisit] = useState(() => !state.tipsRead[f]);
  useEffect(() => markTipsRead(f), [f]);
  const stats = patternStats(state.logs, f).filter((s) => s.count > 0);

  return (
    <div className="page">
      <header className="topbar">
        <BackButton />
        <h1>
          {spec.name}
          <span className="sub">{SUBJECT_NAME[spec.subject]}</span>
        </h1>
      </header>

      <p className="lead">{spec.lead}</p>

      {!active && (
        <p className="notice" style={{ marginBottom: 12 }}>
          設定した制限時間では、この形式は出ない見込み。全体のゲージには数えていない。
        </p>
      )}

      <section className="card">
        <div className="stat-grid">
          <div className="stat">
            <b>
              {Math.round(p?.gauge ?? 0)}
              <small>%</small>
            </b>
            <span>ゲージ</span>
          </div>
          <div className="stat">
            <b>
              {p ? Math.round(p.score * 100) : '—'}
              <small>{p ? '%' : ''}</small>
            </b>
            <span>予想得点（目標 {target}%）</span>
          </div>
          <div className="stat">
            <b>
              {p ? Math.round(p.acc * 100) : '—'}
              <small>{p ? '%' : ''}</small>
            </b>
            <span>直近の正答率</span>
          </div>
          <div className="stat">
            <b>
              {p ? p.pace.toFixed(1) : '—'}
              <small>{p ? '秒' : ''}</small>
            </b>
            <span>1問あたり（目安 {(v.appSec / v.total).toFixed(1)}秒）</span>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Meter value={p?.gauge ?? 0} />
        </div>
        <p className="advice">{advice(p, f, state.settings)}</p>
      </section>

      <h2 className="section-title">解く</h2>
      <div className="mode-list">
        {(['drill', 'mini', 'full'] as Mode[]).map((m) => {
          const n = questionCount(f, m, state);
          const limit = timeLimitOf(f, m, state);
          return (
            <button key={m} type="button" className={`mode-btn${m === recommended ? ' primary' : ''}`} onClick={() => go(quizPath(f, m))}>
              <b>
                {MODE_NAME[m]}（{n}問{limit ? `・${mmss(limit)}` : ''}）
              </b>
              <span>{MODE_NOTE[m]}</span>
              <i aria-hidden="true">›</i>
            </button>
          );
        })}
      </div>
      {spec.timeScale < 1 && (
        <p className="small muted" style={{ margin: '10px 4px 0', lineHeight: 1.7 }}>
          このアプリの長文は約280字で、本番（400〜600字）より短い。そのぶん制限時間を本番の約{Math.round(spec.timeScale * 10)}
          割に縮めて、同じ忙しさにしてある。
        </p>
      )}

      <h2 className="section-title">攻略メモ</h2>
      <div>
        {spec.tips.map((t, i) => (
          <details className="tip" key={t.title} open={firstVisit && i < 2}>
            <summary>{t.title}</summary>
            <ul>
              {t.body.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </details>
        ))}
        <details className="tip">
          <summary>本番の決まりごと（全形式共通）</summary>
          <ul>
            {COMMON_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      </div>

      {stats.length > 0 && (
        <>
          <h2 className="section-title">
            パターン別の成績<span>正答率が低いものほど、ドリルで多めに出る</span>
          </h2>
          <section className="card" style={{ paddingTop: 8, paddingBottom: 8 }}>
            {stats.map((s) => (
              <div className="pat-row" key={s.id}>
                <span>{s.name}</span>
                <span className="v">
                  {Math.round(s.acc * 100)}%・{s.pace.toFixed(1)}秒・{s.count}問
                </span>
                <Meter value={s.acc * 100} low={s.count >= 4 && s.acc * 100 < target} />
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
