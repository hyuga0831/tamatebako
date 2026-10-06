import { useEffect, useState } from 'react';

const clamp = (v: number): number => Math.max(0, Math.min(100, v));

/** 突破ゲージ（円形）。from を渡すと、その値から伸びるように動く */
export function Gauge({ value, from, caption }: { value: number; from?: number; caption: string }) {
  const [shown, setShown] = useState(clamp(from ?? value));
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(clamp(value)));
    return () => cancelAnimationFrame(id);
  }, [value]);

  const r = 86;
  const c = 2 * Math.PI * r;
  const full = clamp(value) >= 99.5;
  return (
    <div className={`gauge${full ? ' full' : ''}`} role="img" aria-label={`${caption} ${Math.round(clamp(value))}パーセント`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle className="track" cx="100" cy="100" r={r} strokeWidth="14" />
        <circle className="fill" cx="100" cy="100" r={r} strokeWidth="14" strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} opacity={shown > 0 ? 1 : 0} />
      </svg>
      <div className="center">
        <div>
          <div className="value">
            {Math.round(clamp(value))}
            <small>%</small>
          </div>
          <div className="caption">{caption}</div>
        </div>
      </div>
    </div>
  );
}

export function Meter({ value, low }: { value: number; low?: boolean }) {
  const v = clamp(value);
  return (
    <div className={`meter${v >= 99.5 ? ' full' : ''}${low ? ' low' : ''}`}>
      <i style={{ width: `${v}%` }} />
    </div>
  );
}
