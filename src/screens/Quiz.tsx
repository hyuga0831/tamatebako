import { useEffect, useRef, useState } from 'react';
import type { Abc, CalcQ, FormatId, Mode, PassageQ } from '../lib/types';
import { mulberry32, randomSeed } from '../lib/rng';
import { FORMATS } from '../lib/formats';
import { overall } from '../lib/stats';
import { buildSession, MODE_NAME } from '../lib/session';
import { addLogs, addSession, getState, markSeen } from '../lib/store';
import { go, setResult, type ReviewItem } from '../lib/nav';
import { Figure } from '../components/Figure';
import { ChoiceLabel, Expr } from '../components/Expr';
import { Calculator } from '../components/Calculator';
import { CalcExplain, ItemWhy, PassageLessons } from '../components/Explain';

export const ABC_TEXT: Record<'ronri' | 'shushi', [string, string, string]> = {
  ronri: ['本文から考えて、明らかに正しい', '本文から考えて、明らかに間違っている', '本文だけでは、どちらとも判断できない'],
  shushi: ['筆者が一番訴えたいこと（趣旨）', '本文に書かれているが、趣旨ではない', '本文とは関係ないこと'],
};
const ABC: Abc[] = ['A', 'B', 'C'];

const calcKey = (f: FormatId): string => `tamatebako:calc:${f}`;
/** 電卓を最初から開いておくか。前回の状態を形式ごとに覚えておく */
function readCalcPref(f: FormatId): boolean {
  try {
    const v = localStorage.getItem(calcKey(f));
    if (v !== null) return v === '1';
  } catch {
    // 読めないときは下の既定値を使う
  }
  // 四則逆算はほぼ毎問使うので、スマホでは開いておく。図表は選択肢が隠れるので閉じておく
  return f === 'shisoku' && window.innerWidth < 900;
}

const mmss = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Quiz({ format, mode }: { format: FormatId; mode: Mode }) {
  const spec = FORMATS[format];
  // URL に ?seed=数字 を付けると、同じ問題を再現できる（動作確認用）
  const [plan] = useState(() => {
    const seed = Number(/[?&]seed=(\d+)/.exec(location.hash)?.[1]) || randomSeed();
    return buildSession(format, mode, getState(), mulberry32(seed));
  });
  const [before] = useState(() => overall(getState()));
  const [idx, setIdx] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [picks, setPicks] = useState<(Abc | null)[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [calcOpen, setCalcOpen] = useState(() => spec.calc && readCalcPref(format));
  const [now, setNow] = useState(() => performance.now());
  const sessionT0 = useRef(performance.now());
  const screenT0 = useRef(performance.now());
  /** 解答を確定したときの秒数（ドリルで解説を読んでいる間は、ここで時計を止める） */
  const fixedTime = useRef<number | null>(null);
  const records = useRef<ReviewItem[]>([]);
  const done = useRef(false);

  const q = plan.screens[idx];
  const timed = plan.timeLimit > 0;
  const last = idx === plan.screens.length - 1;

  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(id);
  }, []);

  const remaining = timed ? plan.timeLimit - (now - sessionT0.current) / 1000 : Infinity;
  const onScreen = fixedTime.current ?? Math.max(0, (now - screenT0.current) / 1000);

  function commitCalc(cq: CalcQ, choice: number | null): void {
    const t = (performance.now() - screenT0.current) / 1000;
    fixedTime.current = t;
    if (choice !== null) addLogs([{ f: format, p: cq.pattern, ok: choice === cq.answer ? 1 : 0, t, at: Date.now(), m: mode }]);
    records.current.push({ q: cq, pick: choice, picks: [], time: t });
  }

  function commitPassage(pq: PassageQ, answers: (Abc | null)[]): void {
    const t = (performance.now() - screenT0.current) / 1000;
    fixedTime.current = t;
    const filled = pq.items.map((_, i) => answers[i] ?? null);
    const at = Date.now();
    const logs = pq.items.flatMap((it, i) =>
      filled[i] === null ? [] : [{ f: format, p: it.answer, ok: (filled[i] === it.answer ? 1 : 0) as 0 | 1, t: t / pq.items.length, at, m: mode }],
    );
    if (logs.length > 0) {
      addLogs(logs);
      markSeen([pq.id]);
    }
    records.current.push({ q: pq, pick: null, picks: filled, time: t });
  }

  function finish(timeUp: boolean): void {
    if (done.current) return;
    done.current = true;
    // 時間切れのときは、選んであった分だけ記録する
    if (records.current.length === idx) {
      if (q.kind === 'calc') commitCalc(q, pick);
      else commitPassage(q, picks);
    }
    for (const rest of plan.screens.slice(records.current.length)) records.current.push({ q: rest, pick: null, picks: [], time: null });

    let answered = 0;
    let correct = 0;
    for (const r of records.current) {
      if (r.q.kind === 'calc') {
        if (r.pick !== null) answered++;
        if (r.pick === r.q.answer) correct++;
      } else {
        r.q.items.forEach((it, i) => {
          if (r.picks[i]) answered++;
          if (r.picks[i] === it.answer) correct++;
        });
      }
    }
    const spent = records.current.reduce((s, r) => s + (r.time ?? 0), 0);
    const used = timed ? Math.min(plan.timeLimit, (performance.now() - sessionT0.current) / 1000) : spent;
    addSession({ f: format, m: mode, at: Date.now(), total: plan.count, answered, correct, limit: plan.timeLimit, used });
    setResult({
      format,
      mode,
      total: plan.count,
      answered,
      correct,
      timeLimit: plan.timeLimit,
      used,
      timeUp,
      items: records.current,
      before,
      after: overall(getState()),
    });
    go('/result', true);
  }

  function advance(): void {
    if (last) {
      finish(false);
      return;
    }
    setIdx(idx + 1);
    setPick(null);
    setPicks([]);
    setRevealed(false);
    screenT0.current = performance.now();
    fixedTime.current = null;
    window.scrollTo(0, 0);
  }

  function choose(i: number): void {
    if (revealed || q.kind !== 'calc') return;
    setPick(i);
    if (!timed) {
      commitCalc(q, i);
      setRevealed(true);
    }
  }

  const allPicked = q.kind === 'passage' && q.items.every((_, i) => picks[i]);
  const canPrimary = timed ? (q.kind === 'calc' ? pick !== null : allPicked) : revealed || allPicked;
  const primaryLabel = timed ? (last ? '終了する' : '次へ') : revealed ? (last ? '結果を見る' : '次へ') : q.kind === 'calc' ? '選択肢を選ぶ' : '答え合わせ';

  function primary(): void {
    if (!canPrimary || done.current) return;
    if (timed) {
      if (q.kind === 'calc') commitCalc(q, pick);
      else commitPassage(q, picks);
      advance();
    } else if (revealed) {
      advance();
    } else if (q.kind === 'passage') {
      commitPassage(q, picks);
      setRevealed(true);
    }
  }

  // 毎回の描画のあとで、時間切れを確かめる
  useEffect(() => {
    if (timed && remaining <= 0) finish(true);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (confirmExit) {
        if (e.key === 'Escape') setConfirmExit(false);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        primary();
      } else if (q.kind === 'calc' && /^[1-5]$/.test(e.key) && Number(e.key) <= q.choices.length) {
        choose(Number(e.key) - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function toggleCalc(): void {
    const next = !calcOpen;
    setCalcOpen(next);
    try {
      localStorage.setItem(calcKey(format), next ? '1' : '0');
    } catch {
      // 保存できなくても、その場の切り替えは効く
    }
  }

  const ratio = onScreen / plan.paceSec;
  const over = ratio > 1;
  const hurry = timed && remaining <= Math.max(10, plan.timeLimit * 0.1);
  const split = q.kind === 'passage' || !!q.figure;
  const showCalc = spec.calc && calcOpen && !revealed;

  return (
    <div className="quiz">
      <div className="quiz-top">
        <div className="row">
          <button type="button" className="icon-btn" aria-label="中断する" onClick={() => setConfirmExit(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <div className="title">
            {spec.name}・{MODE_NAME[mode]}
          </div>
          <div className="count num">
            {q.kind === 'passage' ? '長文 ' : ''}
            {idx + 1} / {plan.screens.length}
          </div>
          {timed && (
            <div className={`timer${hurry ? ' hurry' : ''}`} aria-label="残り時間">
              {mmss(remaining)}
            </div>
          )}
        </div>
        <div className={`pace${over ? ' over' : ''}`} aria-hidden="true">
          <i style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
        <div className="pace-note">{over && !revealed ? (timed ? '目安の時間を過ぎた。勘で選んで次へ' : '目安の時間を過ぎた') : ''}</div>
      </div>

      <div className={`quiz-body${split ? ' split' : ''}`}>
        {q.kind === 'calc' ? (
          <CalcView q={q} pick={pick} revealed={revealed} time={onScreen} pace={plan.paceSec} onChoose={choose} />
        ) : (
          <PassageView
            q={q}
            picks={picks}
            revealed={revealed}
            onPick={(i, v) => {
              if (revealed) return;
              const next = q.items.map((_, k) => picks[k] ?? null);
              next[i] = v;
              setPicks(next);
            }}
          />
        )}
      </div>

      <div style={{ position: 'sticky', bottom: 0, zIndex: 15 }}>
        <div className="quiz-foot">
          {spec.calc && (
            <button type="button" className={`btn calc-toggle${calcOpen ? ' on' : ''}`} aria-pressed={calcOpen} onClick={toggleCalc}>
              電卓
            </button>
          )}
          <button type="button" className="btn primary" disabled={!canPrimary} onClick={primary}>
            {primaryLabel}
          </button>
        </div>
        {showCalc && <Calculator key={idx} />}
      </div>

      {confirmExit && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="exit-title" onClick={() => setConfirmExit(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="exit-title">このセットを中断しますか？</h2>
            <p>ここまでに答えた問題は記録に残ります。{timed ? '中断している間も、時間は進みます。' : ''}</p>
            <div className="row-btns">
              <button type="button" className="btn ghost" onClick={() => setConfirmExit(false)}>
                続ける
              </button>
              <button type="button" className="btn danger" onClick={() => go(`/f/${format}`, true)}>
                中断する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalcView({
  q,
  pick,
  revealed,
  time,
  pace,
  onChoose,
}: {
  q: CalcQ;
  pick: number | null;
  revealed: boolean;
  time: number;
  pace: number;
  onChoose: (i: number) => void;
}) {
  const cols = q.choices.every((c) => c.text.length <= 6);
  const ok = pick === q.answer;
  return (
    <>
      {q.figure && (
        <div className="pane-a">
          <Figure fig={q.figure} />
        </div>
      )}
      <div className="pane-b">
        {q.expr ? (
          <>
            <p className="q-prompt minor">{q.prompt}</p>
            <Expr toks={q.expr} />
          </>
        ) : (
          <p className="q-prompt">{q.prompt}</p>
        )}
        <div className={`choices${cols ? ' cols' : ''}`}>
          {q.choices.map((c, i) => {
            const cls = revealed ? (i === q.answer ? ' right' : i === pick ? ' wrong' : ' dim') : i === pick ? ' sel' : '';
            return (
              <button key={i} type="button" className={`choice${cls}`} disabled={revealed} aria-pressed={i === pick} onClick={() => onChoose(i)}>
                <span className="key">{i + 1}</span>
                <span>
                  <ChoiceLabel c={c} />
                </span>
              </button>
            );
          })}
        </div>
        {revealed && (
          <>
            <div className={`verdict ${ok ? 'ok' : 'ng'}`} role="status">
              <span className="mark">{ok ? '○' : '×'}</span>
              {ok ? '正解' : '不正解'}
              <span className="t num">
                {time.toFixed(1)}秒（目安 {pace.toFixed(0)}秒）
              </span>
            </div>
            <CalcExplain q={q} pick={pick} />
          </>
        )}
      </div>
    </>
  );
}

function PassageView({
  q,
  picks,
  revealed,
  onPick,
}: {
  q: PassageQ;
  picks: (Abc | null)[];
  revealed: boolean;
  onPick: (i: number, v: Abc) => void;
}) {
  const legend = ABC_TEXT[q.format];
  return (
    <>
      <div className="pane-a">
        <div className="abc-legend">
          {ABC.map((v, i) => (
            <div key={v}>
              <b>{v}</b>
              {legend[i]}
            </div>
          ))}
        </div>
        <div className="passage">
          {q.passage.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
      <div className="pane-b">
        <div className="items">
          {q.items.map((it, i) => {
            return (
              <div className="item" key={i}>
                <div className="text">
                  <span className="no">{i + 1}</span>
                  {it.text}
                </div>
                <div className="abc" role="group" aria-label={`設問 ${i + 1} の解答`}>
                  {ABC.map((v) => {
                    const cls = revealed ? (v === it.answer ? 'right' : v === picks[i] ? 'wrong' : '') : v === picks[i] ? 'sel' : '';
                    return (
                      <button key={v} type="button" className={cls} disabled={revealed} aria-pressed={v === picks[i]} onClick={() => onPick(i, v)}>
                        {v}
                      </button>
                    );
                  })}
                </div>
                {revealed && <ItemWhy format={q.format} pick={picks[i] ?? null} answer={it.answer} why={it.why} />}
              </div>
            );
          })}
        </div>
        {revealed && <PassageLessons q={q} picks={picks} />}
      </div>
    </>
  );
}
