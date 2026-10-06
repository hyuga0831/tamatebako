import type { FormatId, Subject } from '../lib/types';
import { FORMATS, FORMAT_ORDER, SUBJECT_NAME } from '../lib/formats';
import { daysUntil, nextAction, overall, streak, targetOf, todayCount, variantOf, type Overall } from '../lib/stats';
import { MODE_NAME, questionCount, timeLimitOf } from '../lib/session';
import { useAppState } from '../lib/store';
import { go, quizPath } from '../lib/nav';
import { Gauge, Meter } from '../components/Gauge';

const minutes = (sec: number): string => `約${Math.max(1, Math.round(sec / 60))}分`;

export function Home() {
  const state = useAppState();
  const o = overall(state);
  const next = nextAction(state);
  const target = targetOf(state.settings);
  const days = daysUntil(state.settings.testDate);
  const narrowed = o.active.length < FORMAT_ORDER.length;

  return (
    <div className="page">
      <header className="topbar">
        <h1>
          玉手箱ドリル
          {state.settings.goal && <span className="sub">{state.settings.goal}</span>}
        </h1>
        <button type="button" className="icon-btn" aria-label="設定" onClick={() => go('/settings')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </header>

      <section className="card hero">
        <Gauge value={o.gauge} caption="足切り突破ゲージ" />
        <div className="hero-meta">
          <p className="hero-note">
            100% ＝ 本番で <b>{target}%</b> 取れる見込み
            <br />
            <span className="muted small">
              ボーダー予想 {state.settings.cutoff}% ＋ 余裕 {target - state.settings.cutoff} ポイント
            </span>
          </p>
          {(['keisu', 'gengo'] as Subject[]).map((s) => (
            <div className="meter-row" key={s}>
              <span>{SUBJECT_NAME[s]}</span>
              <Meter value={o.subject[s]} />
              <span className="pct">{Math.round(o.subject[s])}%</span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ height: 12 }} />

      {next ? (
        <section className="card next">
          <div className="label">次にやること</div>
          <div className="what">
            {FORMATS[next.format].name}の{MODE_NAME[next.mode]}
            <span className="muted small" style={{ fontWeight: 600, marginLeft: 8 }}>
              {questionCount(next.format, next.mode, state)}問・
              {next.mode === 'drill'
                ? minutes((questionCount(next.format, next.mode, state) * variantOf(next.format, state.settings).appSec * 2) / variantOf(next.format, state.settings).total)
                : minutes(timeLimitOf(next.format, next.mode, state))}
            </span>
          </div>
          <div className="why">{next.why}。ここを解くと、ゲージがいちばん伸びる。</div>
          <button type="button" className="btn primary block" onClick={() => go(quizPath(next.format, next.mode))}>
            はじめる
          </button>
        </section>
      ) : (
        <section className="card done-card">
          <strong>✓ 足切りラインは超えられる見込み</strong>
          <p className="small">
            出る可能性のある形式すべてで、目標の {target}% に届いている。これ以上やる必要はない。本番の前日に、ミニ模試を 1 セットずつ流して感覚を戻せば十分。
          </p>
        </section>
      )}

      {(['keisu', 'gengo'] as Subject[]).map((s) => (
        <section key={s}>
          <h2 className="section-title">
            {SUBJECT_NAME[s]}
            <span>{s === 'keisu' ? '本番ではこのうち 1 形式だけが出る' : '本番ではどちらか 1 形式が出る'}</span>
          </h2>
          <div className="fmt-list">
            {FORMAT_ORDER.filter((f) => FORMATS[f].subject === s).map((f) => (
              <FormatRow key={f} f={f} o={o} target={target} />
            ))}
          </div>
        </section>
      ))}

      <div className="strip">
        <div>
          <b>{todayCount(state.logs)}</b>
          <span>今日解いた問題</span>
        </div>
        <div>
          <b>{streak(state.logs)}</b>
          <span>連続日数</span>
        </div>
        <div>
          <b>{days === null ? '—' : days}</b>
          <span>{days === null ? '受検日は未設定' : '本番までの日数'}</span>
        </div>
      </div>

      {!narrowed && (
        <p className="small muted" style={{ margin: '16px 4px 0', lineHeight: 1.7 }}>
          受検案内に書いてある制限時間（例：計数 15分、言語 15分）がわかったら、
          <button type="button" style={{ color: 'var(--accent)', fontWeight: 700 }} onClick={() => go('/settings')}>
            設定
          </button>
          に入れる。出る形式が決まるので、やる量が半分以下になる。
        </p>
      )}
    </div>
  );
}

function FormatRow({ f, o, target }: { f: FormatId; o: Overall; target: number }) {
  const state = useAppState();
  const spec = FORMATS[f];
  const p = o.per[f];
  const active = o.active.includes(f);
  const v = variantOf(f, state.settings);
  const g = p?.gauge ?? 0;
  return (
    <button type="button" className={`fmt-row${active ? '' : ' off'}`} onClick={() => go(`/f/${f}`)}>
      <div>
        <div className="name">
          {spec.name}
          {!active && <span className="chip">出ない見込み</span>}
          {active && g >= 99.5 && <span className="chip good">到達</span>}
        </div>
        <div className="spec">
          本番 {v.total}問・{v.timeSec / 60}分
        </div>
      </div>
      <div className="pct">
        {Math.round(g)}
        <small>%</small>
      </div>
      <Meter value={g} />
      <div className="foot">
        {p ? (
          <>
            <span>
              予想得点 {Math.round(p.score * 100)}%（目標 {target}%）
            </span>
            <span className="num">{p.count}問</span>
          </>
        ) : (
          <span>まだ解いていない</span>
        )}
      </div>
    </button>
  );
}
