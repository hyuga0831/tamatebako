// 答え合わせのあとに出す解説。
// 「正解」「選んだ答えがなぜ違うか」「この問題の解き方」「考え方・公式・まちがえやすいところ」の順に見せる。
import type { Abc, CalcQ, Choice, Frac, PassageQ } from '../lib/types';
import { LESSONS, diagnose, type Lesson } from '../lib/lessons';
import { evalSide } from '../lib/expr';
import { F, fracToDec, toNum } from '../lib/frac';
import { ChoiceLabel } from './Expr';

/** 選択肢の表示から数値を取り出す（単位つきの選択肢は null） */
export function choiceFrac(c: Choice): Frac | null {
  if (c.frac) return c.frac;
  const t = c.text.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const i = t.indexOf('.');
  return i < 0 ? F(Number(t)) : F(Number(t.replace('.', '')), 10 ** (t.length - i - 1));
}

function show(f: Frac): string {
  const d = fracToDec(f);
  if (d !== null && (d.split('.')[1]?.length ?? 0) <= 6) return d;
  // 割り切れない値は、大きさに合わせて丸める（小さい値を 0.00 にしない）
  const x = toNum(f);
  const a = Math.abs(x);
  return `約 ${a >= 100 ? x.toFixed(1) : a >= 1 ? x.toFixed(2) : String(Number(x.toPrecision(2)))}`;
}

/** 四則逆算：選択肢の値を □ に入れたときの、左辺と右辺の値 */
export function substitute(q: CalcQ, c: Choice): { left: string; right: string } | null {
  const v = choiceFrac(c);
  if (!q.expr || !v) return null;
  const k = q.expr.findIndex((t) => t.k === 'op' && t.s === '=');
  try {
    return { left: show(evalSide(q.expr.slice(0, k), v)), right: show(evalSide(q.expr.slice(k + 1), v)) };
  } catch {
    return null;
  }
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function LessonBody({ lesson, formulaTitle }: { lesson: Lesson; formulaTitle: string }) {
  return (
    <>
      <Block title="考え方" items={lesson.idea} />
      <Block title={formulaTitle} items={lesson.formula} />
      <Block title="まちがえやすいところ" items={lesson.trap} />
    </>
  );
}

/** まちがえたときは開いて見せ、合っていたときは畳んでおく */
function LessonView({ lesson, open, formulaTitle, heading }: { lesson: Lesson; open: boolean; formulaTitle: string; heading?: string }) {
  if (open) {
    return (
      <div className="lesson">
        {heading && <div className="lesson-head">{heading}</div>}
        <LessonBody lesson={lesson} formulaTitle={formulaTitle} />
      </div>
    );
  }
  return (
    <details className="lesson">
      <summary>{heading ?? '考え方と公式を見る'}</summary>
      <LessonBody lesson={lesson} formulaTitle={formulaTitle} />
    </details>
  );
}

export function CalcExplain({ q, pick, showPick = false }: { q: CalcQ; pick: number | null; showPick?: boolean }) {
  const ok = pick === q.answer;
  const right = q.choices[q.answer];
  const picked = pick === null ? null : q.choices[pick];
  const lesson = LESSONS[q.format][q.pattern];
  const check = substitute(q, right);
  const wrongCheck = !ok && picked ? substitute(q, picked) : null;
  const note = !ok && pick !== null ? q.choiceNotes?.[pick] : undefined;
  return (
    <div className="exp">
      <p className="ans-line">
        <span>
          正解：
          <b>
            <ChoiceLabel c={right} />
          </b>
        </span>
        {showPick && (
          <span>
            あなたの答え：<b>{picked ? <ChoiceLabel c={picked} /> : '未回答'}</b>
          </span>
        )}
      </p>
      {picked && (wrongCheck || note) && (
        <div className="diag">
          <b>
            選んだ「
            <ChoiceLabel c={picked} />
            」が違う理由
          </b>
          {wrongCheck && (
            <p>
              □ に入れてみると、左辺は {wrongCheck.left}、右辺は {wrongCheck.right}。左右がつり合わない。
            </p>
          )}
          {note && <p>{note}。</p>}
        </div>
      )}
      <h3 className="exp-title">この問題の解き方</h3>
      <ol className="steps">
        {q.explain.map((e) => (
          <li key={e}>{e}</li>
        ))}
        {check && (
          <li>
            確かめ：□ に <ChoiceLabel c={right} /> を入れると、左辺 {check.left}・右辺 {check.right} でつり合う。
          </li>
        )}
      </ol>
      {lesson && <LessonView lesson={lesson} open={!ok} formulaTitle="使う公式・ルール" />}
    </div>
  );
}

const TYPE_NAME: Record<'ronri' | 'shushi', Record<Abc, string>> = {
  ronri: { A: 'A（正しい）の見分け方', B: 'B（間違っている）の見分け方', C: 'C（判断できない）の見分け方' },
  shushi: { A: 'A（趣旨）の見分け方', B: 'B（本文にあるが趣旨ではない）の見分け方', C: 'C（関係ない）の見分け方' },
};

/** 言語：設問 1 つぶんの解説（選んだ答えがなぜ違うかを含む） */
export function ItemWhy({
  format,
  pick,
  answer,
  why,
  legend,
  showPick = false,
}: {
  format: 'ronri' | 'shushi';
  pick: Abc | null;
  answer: Abc;
  why: string;
  legend?: string;
  showPick?: boolean;
}) {
  const ok = pick === answer;
  const d = diagnose(format, pick, answer);
  return (
    <div className="why">
      <b className={ok ? 'ok' : 'ng'}>
        {ok ? '○' : '×'} 正解は {answer}
        {legend ? `（${legend}）` : ''}
      </b>
      {showPick && !ok && <span>あなたの答え：{pick ?? '未回答'}。</span>}
      {why}
      {d && (
        <p className="why-diag">
          <b>{pick} を選んだ人へ：</b>
          {d}
        </p>
      )}
    </div>
  );
}

/** 言語：まちがえた設問の型について、見分け方を出す。全問正解なら畳んでおく */
export function PassageLessons({ q, picks }: { q: PassageQ; picks: (Abc | null)[] }) {
  const missed = [...new Set(q.items.filter((it, i) => picks[i] !== it.answer).map((it) => it.answer))].sort();
  const types: Abc[] = missed.length > 0 ? missed : ['A', 'B', 'C'];
  return (
    <div className="exp">
      {missed.length > 0 && <h3 className="exp-title">まちがえた型の見分け方</h3>}
      {types.map((t) => (
        <LessonView key={t} lesson={LESSONS[q.format][t]} open={missed.length > 0} formulaTitle="判定の手順" heading={TYPE_NAME[q.format][t]} />
      ))}
    </div>
  );
}
