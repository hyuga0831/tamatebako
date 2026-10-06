import { useEffect, useState } from 'react';
import { type CalcKey, display, initCalc, press } from '../lib/calc';

const KEYS: { k: CalcKey; label: string; cls?: string }[] = [
  { k: 'MC', label: 'MC', cls: 'fn' },
  { k: 'MR', label: 'MR', cls: 'fn' },
  { k: 'M-', label: 'M−', cls: 'fn' },
  { k: 'M+', label: 'M+', cls: 'fn' },
  { k: 'BS', label: '⌫', cls: 'fn' },
  { k: '7', label: '7' },
  { k: '8', label: '8' },
  { k: '9', label: '9' },
  { k: '÷', label: '÷', cls: 'opk' },
  { k: 'AC', label: 'AC', cls: 'fn' },
  { k: '4', label: '4' },
  { k: '5', label: '5' },
  { k: '6', label: '6' },
  { k: '×', label: '×', cls: 'opk' },
  { k: 'C', label: 'C', cls: 'fn' },
  { k: '1', label: '1' },
  { k: '2', label: '2' },
  { k: '3', label: '3' },
  { k: '−', label: '−', cls: 'opk' },
  { k: '%', label: '%', cls: 'fn' },
  { k: '0', label: '0' },
  { k: '00', label: '00' },
  { k: '.', label: '.' },
  { k: '+', label: '＋', cls: 'opk' },
  { k: '=', label: '＝', cls: 'eq' },
];

const KEYBOARD: Record<string, CalcKey> = {
  '+': '+',
  '-': '−',
  '*': '×',
  '/': '÷',
  '=': '=',
  Enter: '=',
  Backspace: 'BS',
  Escape: 'AC',
  Delete: 'C',
  '%': '%',
  '.': '.',
};

/** 画面内の電卓。PC ではキーボードからも打てる */
export function Calculator() {
  const [s, setS] = useState(initCalc);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k: CalcKey | undefined = /^\d$/.test(e.key) ? (e.key as CalcKey) : KEYBOARD[e.key];
      if (!k) return;
      e.preventDefault();
      e.stopPropagation();
      setS((prev) => press(prev, k));
    };
    // 出題画面のショートカット（数字で選択肢を選ぶ）より先に受け取る
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="calc" aria-label="電卓">
      <div className="calc-display" aria-live="polite">
        <span className="flags">
          {s.mem !== 0 ? 'M ' : ''}
          {s.op ?? ''}
        </span>
        <span>{display(s.cur)}</span>
      </div>
      <div className="calc-keys">
        {KEYS.map(({ k, label, cls }) => (
          <button
            key={k}
            type="button"
            className={`${cls ?? ''}${cls === 'opk' && s.op === k && s.fresh ? ' on' : ''}`}
            aria-label={k === 'BS' ? '1文字消す' : label}
            onClick={() => setS((prev) => press(prev, k))}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
