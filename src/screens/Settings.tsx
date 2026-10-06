import { useState } from 'react';
import type { GengoTime, KeisuTime } from '../lib/types';
import { FORMATS } from '../lib/formats';
import { activeFormats, targetOf } from '../lib/stats';
import { exportJson, importJson, resetAll, updateSettings, useAppState } from '../lib/store';
import { BackButton } from './FormatPage';

const KEISU: { v: KeisuTime; label: string; note: string }[] = [
  { v: 0, label: 'まだ不明', note: '3 形式すべてを対象にする' },
  { v: 9, label: '9分', note: '四則逆算（50問）' },
  { v: 15, label: '15分', note: '図表の読み取り（29問）' },
  { v: 20, label: '20分', note: '表の空欄推測（20問）' },
  { v: 35, label: '35分', note: '図表の読み取り（40問）か、表の空欄推測（35問）。始まるまでわからない' },
];

const GENGO: { v: GengoTime; label: string; note: string }[] = [
  { v: 0, label: 'まだ不明', note: '2 形式とも対象にする' },
  { v: 10, label: '10分', note: '趣旨判定（32問）' },
  { v: 12, label: '12分', note: '趣旨把握（10問）。このアプリには問題がないが、「筆者の言いたいことを選ぶ」力は趣旨判定と同じなので、趣旨判定で練習する' },
  { v: 15, label: '15分', note: '論理的読解（32問）' },
  { v: 25, label: '25分', note: '論理的読解（52問）' },
];

export function SettingsPage() {
  const state = useAppState();
  const s = state.settings;
  const [io, setIo] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const active = activeFormats(s);

  return (
    <div className="page">
      <header className="topbar">
        <BackButton />
        <h1>設定</h1>
      </header>

      <section className="card">
        <div className="field">
          <div className="label">受検案内の制限時間</div>
          <p className="help">
            玉手箱は、計数・言語それぞれ 1 つの形式だけが出る。受検案内や開始前の画面に書いてある制限時間で、どの形式かがわかる。わかったら入れると、出る形式だけに絞り込む。
          </p>
          <div className="small" style={{ fontWeight: 700 }}>
            計数
          </div>
          <div className="seg" role="group" aria-label="計数の制限時間">
            {KEISU.map((o) => (
              <button key={o.v} type="button" className={s.keisuTime === o.v ? 'on' : ''} aria-pressed={s.keisuTime === o.v} onClick={() => updateSettings({ keisuTime: o.v })}>
                {o.label}
              </button>
            ))}
          </div>
          <p className="help">→ {KEISU.find((o) => o.v === s.keisuTime)?.note}</p>
          <div className="small" style={{ fontWeight: 700, marginTop: 6 }}>
            言語
          </div>
          <div className="seg" role="group" aria-label="言語の制限時間">
            {GENGO.map((o) => (
              <button key={o.v} type="button" className={s.gengoTime === o.v ? 'on' : ''} aria-pressed={s.gengoTime === o.v} onClick={() => updateSettings({ gengoTime: o.v })}>
                {o.label}
              </button>
            ))}
          </div>
          <p className="help">→ {GENGO.find((o) => o.v === s.gengoTime)?.note}</p>
          <p className="help">
            いまゲージに数えている形式：<b>{active.map((f) => FORMATS[f].name).join('、')}</b>
          </p>
          <p className="help">英語（10分）が案内にあった場合、このアプリには英語の問題がない。別に対策が要る。</p>
        </div>

        <div className="field">
          <div className="label">ボーダーの予想</div>
          <p className="help">
            足切りに使われる正答率の予想。ゲージの 100% は、これに 10 ポイントの余裕を足した <b>{targetOf(s)}%</b> を取れる見込みのこと。
          </p>
          <div className="stepper">
            <button type="button" aria-label="下げる" disabled={s.cutoff <= 30} onClick={() => updateSettings({ cutoff: s.cutoff - 5 })}>
              −
            </button>
            <b>{s.cutoff}%</b>
            <button type="button" aria-label="上げる" disabled={s.cutoff >= 80} onClick={() => updateSettings({ cutoff: s.cutoff + 5 })}>
              ＋
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="goal">目標のメモ</label>
          <input id="goal" type="text" maxLength={24} placeholder="例：◯◯社 早期選考" value={s.goal} onChange={(e) => updateSettings({ goal: e.target.value })} />
          <label htmlFor="date">受検日</label>
          <input id="date" type="date" value={s.testDate} onChange={(e) => updateSettings({ testDate: e.target.value })} />
          <p className="help">入れておくと、ホームに本番までの日数が出る。</p>
        </div>

        <div className="field">
          <div className="label">記録</div>
          <p className="help">
            記録はこの端末のブラウザの中だけに保存している（サーバーには送らない）。スマホと PC で記録は別々になる。移したいときは、書き出した文字列をもう一方の端末で読み込む。
          </p>
          <div className="row-btns">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setIo(exportJson());
                setMsg('下の文字列をすべてコピーして、もう一方の端末で読み込む。');
              }}
            >
              書き出す
            </button>
            <button
              type="button"
              className="btn"
              disabled={!io.trim()}
              onClick={() => setMsg(importJson(io.trim()) ? '読み込んだ。' : '読み込めなかった。書き出した文字列をそのまま貼り付ける。')}
            >
              読み込む
            </button>
            <button type="button" className="btn danger" onClick={() => setConfirmReset(true)}>
              記録を消す
            </button>
          </div>
          <textarea aria-label="記録のデータ" placeholder="読み込むときは、書き出した文字列をここに貼り付ける" value={io} onChange={(e) => setIo(e.target.value)} />
          {msg && (
            <p className="help" role="status">
              {msg}
            </p>
          )}
        </div>

        <div className="field">
          <div className="label">このアプリについて</div>
          <ul className="plain-list">
            <li>問題はすべて、公開されている例題の出題パターンをもとに作ったオリジナル。玉手箱に公式の過去問はなく、本番と同じ問題が出るわけではない。</li>
            <li>計数の問題は自動で作られるので、何度やっても同じ問題にはならない。</li>
            <li>予想得点は、直近の正答率と解く速さからの見込み。ボーダーは会社も公表していないので、目安として使う。</li>
            <li>本番は PC で受ける。実物の電卓とメモ用紙を用意し、前日に 1 度は PC でも解いておく。</li>
          </ul>
        </div>
      </section>

      {confirmReset && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="reset-title" onClick={() => setConfirmReset(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 id="reset-title">記録をすべて消しますか？</h2>
            <p>解答の記録とゲージが最初の状態に戻ります。設定は残ります。元には戻せません。</p>
            <div className="row-btns">
              <button type="button" className="btn ghost" onClick={() => setConfirmReset(false)}>
                やめる
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  resetAll();
                  setConfirmReset(false);
                  setMsg('記録を消した。');
                }}
              >
                消す
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
