import { useEffect } from 'react';
import { FORMATS } from '../lib/formats';
import { advice, nextAction } from '../lib/stats';
import { MODE_NAME } from '../lib/session';
import { useAppState } from '../lib/store';
import { getResult, go, quizPath, type ReviewItem } from '../lib/nav';
import { exprText } from '../gen/shisoku';
import { Meter } from '../components/Gauge';
import { Figure } from '../components/Figure';
import { Expr } from '../components/Expr';
import { CalcExplain, ItemWhy, PassageLessons } from '../components/Explain';
import { ABC_TEXT } from './Quiz';

const mmss = (sec: number): string => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Verdict = 'ok' | 'ng' | 'skip';

function verdictOf(r: ReviewItem): Verdict {
  if (r.q.kind === 'calc') return r.pick === null ? 'skip' : r.pick === r.q.answer ? 'ok' : 'ng';
  if (r.picks.every((p) => !p)) return 'skip';
  return r.q.items.every((it, i) => r.picks[i] === it.answer) ? 'ok' : 'ng';
}

function Delta({ label, from, to }: { label: string; from: number; to: number }) {
  const d = Math.round(to) - Math.round(from);
  return (
    <div className="delta">
      <span>{label}</span>
      <span className="vals">
        {Math.round(from)}% → {Math.round(to)}%
        {d !== 0 && <span className={d > 0 ? 'up' : 'down'}>{d > 0 ? `＋${d}` : `−${-d}`}</span>}
      </span>
      <Meter value={to} />
    </div>
  );
}

export function Result() {
  const data = getResult();
  const state = useAppState();
  useEffect(() => {
    if (!data) go('/', true);
  }, [data]);
  if (!data) return null;

  const spec = FORMATS[data.format];
  const timed = data.timeLimit > 0;
  const missed = data.total - data.answered;
  const next = nextAction(state);
  const same = next && next.format === data.format && next.mode === data.mode;
  const numbered = data.items.map((r, i) => ({ r, no: i + 1, v: verdictOf(r) }));
  // まちがえた問題を先に見せる
  const ordered = [...numbered.filter((x) => x.v !== 'ok'), ...numbered.filter((x) => x.v === 'ok')];

  return (
    <div className="page">
      <header className="topbar">
        <h1>
          結果
          <span className="sub">
            {spec.name}・{MODE_NAME[data.mode]}
          </span>
        </h1>
      </header>

      <section className="card result-head">
        <div className="score">
          {data.correct}
          <small> / {data.total} 問正解</small>
        </div>
        <div className="sub">
          正答率 {Math.round((data.correct / data.total) * 100)}%
          {timed ? `・時間 ${mmss(data.used)} / ${mmss(data.timeLimit)}` : `・1問あたり ${(data.used / Math.max(1, data.answered)).toFixed(1)}秒`}
        </div>
        {missed > 0 && (
          <p className="notice" style={{ marginTop: 12, textAlign: 'left' }}>
            {data.timeUp ? '時間切れ。' : ''}
            {missed}問が未回答。本番は減点がないので、残り30秒になったら残りを同じ選択肢で埋める（それだけで約
            {Math.round(missed * spec.guess)}問ぶん増える）。
          </p>
        )}
      </section>

      <div style={{ height: 12 }} />

      <section className="card">
        <Delta label="足切り突破ゲージ（全体）" from={data.before.gauge} to={data.after.gauge} />
        <Delta label={`${spec.name}のゲージ`} from={data.before.per[data.format]?.gauge ?? 0} to={data.after.per[data.format]?.gauge ?? 0} />
        <p className="advice">{advice(data.after.per[data.format], data.format, state.settings)}</p>
      </section>

      <div className="stack" style={{ marginTop: 12 }}>
        {next && !same && (
          <button type="button" className="btn primary block" onClick={() => go(quizPath(next.format, next.mode))}>
            次：{FORMATS[next.format].name}の{MODE_NAME[next.mode]}
          </button>
        )}
        <button type="button" className={`btn block${same || !next ? ' primary' : ' ghost'}`} onClick={() => go(quizPath(data.format, data.mode))}>
          {spec.name}をもう 1 セット
        </button>
        <button type="button" className="btn ghost block" onClick={() => go('/')}>
          ホームへ
        </button>
      </div>

      <h2 className="section-title">
        ふり返り<span>まちがえた問題は解説を開いてある</span>
      </h2>
      <div className="review">
        {ordered.map(({ r, no, v }) => (
          <details className="rev" key={no} open={v !== 'ok'}>
            <summary>
              <span className={`mk ${v}`}>{v === 'ok' ? '○' : v === 'ng' ? '×' : '–'}</span>
              <span className="q">
                <b className="num">{no}. </b>
                {r.q.kind === 'calc' ? (r.q.expr ? exprText(r.q.expr) : r.q.prompt) : r.q.passage[0]}
              </span>
              <span className="t">{r.time === null ? '未着手' : `${r.time.toFixed(0)}秒`}</span>
            </summary>
            <div className="body">
              <ReviewBody r={r} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function ReviewBody({ r }: { r: ReviewItem }) {
  const q = r.q;
  if (q.kind === 'calc') {
    return (
      <>
        {q.figure && <Figure fig={q.figure} />}
        {q.expr ? <Expr toks={q.expr} /> : <p className="q-prompt">{q.prompt}</p>}
        <CalcExplain q={q} pick={r.pick} showPick />
      </>
    );
  }
  const legend = ABC_TEXT[q.format];
  return (
    <>
      <div className="passage">
        {q.passage.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="items">
        {q.items.map((it, i) => (
          <div className="item" key={i}>
            <div className="text">
              <span className="no">{i + 1}</span>
              {it.text}
            </div>
            <ItemWhy format={q.format} pick={r.picks[i] ?? null} answer={it.answer} why={it.why} legend={legend['ABC'.indexOf(it.answer)]} showPick />
          </div>
        ))}
      </div>
      <PassageLessons q={q} picks={q.items.map((_, i) => r.picks[i] ?? null)} />
    </>
  );
}
