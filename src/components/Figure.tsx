// 図表の読み取り・表の空欄推測で使う図表。
// 本番と同じく、計算に使う数値はすべて図の上に書いてある（タップ操作のないスマホでも読めるように）。
import { useEffect, useRef, useState } from 'react';
import type { BandFig, BarFig, Figure as Fig, LineFig, PieFig, TableFig } from '../lib/types';
import { fmt } from '../gen/choices';

const color = (i: number): string => `var(--s${(i % 5) + 1})`;
const onColor = (i: number): string => `var(--s${(i % 5) + 1}-on)`;

function Head({ title, unit }: { title: string; unit?: string }) {
  return (
    <div className="fig-title">
      {title}
      {unit && <span className="fig-unit">（単位：{unit}）</span>}
    </div>
  );
}

function Legend({ names }: { names: string[] }) {
  return (
    <div className="legend">
      {names.map((n, i) => (
        <span key={n}>
          <i style={{ background: color(i) }} />
          {n}
        </span>
      ))}
    </div>
  );
}

/** 見出しを「項目名」と「（単位）」に分け、その間でだけ折り返せるようにする */
function Label({ text }: { text: string }) {
  const m = /^(.+?)(（[^（）]*）)$/.exec(text);
  if (!m) return <span className="nb main">{text}</span>;
  return (
    <>
      <span className="nb main">{m[1]}</span>
      <span className="nb">{m[2]}</span>
    </>
  );
}

function Table({ f }: { f: TableFig }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setScrolls(el.scrollWidth > el.clientWidth + 2);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [f]);
  return (
    <>
      <Head title={f.title} unit={f.unit} />
      <div className="fig-scroll" ref={ref}>
        <table>
          <thead>
            <tr>
              {f.head.map((h, i) => (
                <th key={i} scope="col">
                  <Label text={h} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.rows.map((row, i) => (
              <tr key={i}>
                {row.map((c, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      <Label text={c} />
                    </th>
                  ) : (
                    <td key={j} className={c === '？' ? 'blank' : undefined}>
                      {c}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scrolls && <div className="fig-hint">表は横にスクロールできる →</div>}
    </>
  );
}

const W = 340;

/** 上の角だけ丸い棒（下は基準線にそろえる） */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function Bars({ f }: { f: BarFig }) {
  const H = 190;
  const m = { l: 8, r: 8, t: 24, b: 24 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const max = Math.max(...f.series.flatMap((s) => s.values)) * 1.05;
  const band = pw / f.cats.length;
  const k = f.series.length;
  const bw = Math.min(24, (band * 0.72 - (k - 1) * 2) / k);
  const group = k * bw + (k - 1) * 2;
  const y = (v: number) => m.t + ph * (1 - v / max);
  return (
    <>
      <Head title={f.title} unit={f.unit} />
      {k > 1 && <Legend names={f.series.map((s) => s.name)} />}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={f.title}>
        {[1 / 3, 2 / 3, 1].map((t) => (
          <line key={t} className="grid" x1={m.l} x2={W - m.r} y1={m.t + ph * (1 - t)} y2={m.t + ph * (1 - t)} />
        ))}
        {f.cats.map((c, i) => {
          const x0 = m.l + band * i + (band - group) / 2;
          return (
            <g key={c}>
              {f.series.map((s, j) => {
                const v = s.values[i];
                const x = x0 + j * (bw + 2);
                return (
                  <g key={s.name}>
                    <path d={barPath(x, y(v), bw, m.t + ph - y(v))} fill={color(j)} />
                    <text className="val" x={x + bw / 2} y={y(v) - 5} textAnchor="middle">
                      {fmt(v, f.decimals ?? 0)}
                    </text>
                  </g>
                );
              })}
              <text x={m.l + band * (i + 0.5)} y={H - 7} textAnchor="middle">
                {c}
              </text>
            </g>
          );
        })}
        <line className="axis" x1={m.l} x2={W - m.r} y1={m.t + ph} y2={m.t + ph} />
      </svg>
    </>
  );
}

function Lines({ f }: { f: LineFig }) {
  const H = 210;
  const m = { l: 18, r: 18, t: 26, b: 26 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const all = f.series.flatMap((s) => s.values);
  const span = Math.max(...all) - Math.min(...all) || 1;
  const lo = Math.min(...all) - span * 0.14;
  const hi = Math.max(...all) + span * 0.14;
  const n = f.cats.length;
  const x = (i: number) => m.l + (pw * i) / (n - 1);
  const y = (v: number) => m.t + ph * (1 - (v - lo) / (hi - lo));
  return (
    <>
      <Head title={f.title} unit={f.unit} />
      {f.series.length > 1 && <Legend names={f.series.map((s) => s.name)} />}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={f.title}>
        {[0, 1 / 3, 2 / 3, 1].map((t) => (
          <line key={t} className="grid" x1={m.l - 8} x2={W - m.r + 8} y1={m.t + ph * t} y2={m.t + ph * t} />
        ))}
        {f.series.map((s, j) => (
          <polyline
            key={s.name}
            points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={color(j)}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {f.series.map((s, j) =>
          s.values.map((v, i) => {
            // 同じ月の中で値が大きい系列は点の上、小さい系列は点の下にラベルを置く
            const top = f.series.every((o, oj) => oj === j || v > o.values[i] || (v === o.values[i] && j < oj));
            return (
              <g key={`${s.name}-${i}`}>
                <circle cx={x(i)} cy={y(v)} r="4.5" fill={color(j)} stroke="var(--surface)" strokeWidth="2" />
                <text className="val" x={x(i)} y={top ? y(v) - 9 : y(v) + 17} textAnchor="middle">
                  {fmt(v, f.decimals ?? 0)}
                </text>
              </g>
            );
          }),
        )}
        {f.cats.map((c, i) => (
          <text key={c} x={x(i)} y={H - 6} textAnchor="middle">
            {c}
          </text>
        ))}
      </svg>
    </>
  );
}

function Pie({ f }: { f: PieFig }) {
  const R = 72;
  const C = 75;
  let acc = 0;
  const arcs = f.slices.map((s, i) => {
    const a0 = (acc / 100) * 2 * Math.PI - Math.PI / 2;
    acc += s.pct;
    const a1 = (acc / 100) * 2 * Math.PI - Math.PI / 2;
    const mid = (a0 + a1) / 2;
    const p = (a: number, r: number) => `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
    return {
      ...s,
      i,
      d: `M${C},${C} L${p(a0, R)} A${R},${R} 0 ${s.pct > 50 ? 1 : 0} 1 ${p(a1, R)} Z`,
      lx: C + R * 0.64 * Math.cos(mid),
      ly: C + R * 0.64 * Math.sin(mid) + 4,
    };
  });
  return (
    <>
      <Head title={f.title} />
      <div className="pie-wrap">
        <svg viewBox="0 0 150 150" role="img" aria-label={f.title}>
          {arcs.map((a) => (
            <path key={a.name} d={a.d} fill={color(a.i)} stroke="var(--surface)" strokeWidth="2" strokeLinejoin="round" />
          ))}
          {arcs.map(
            (a) =>
              a.pct >= 9 && (
                <text key={a.name} x={a.lx} y={a.ly} textAnchor="middle" style={{ fill: onColor(a.i), fontWeight: 700, fontSize: 12 }}>
                  {a.pct}%
                </text>
              ),
          )}
        </svg>
        <div className="pie-legend">
          {f.slices.map((s, i) => (
            <div key={s.name}>
              <i style={{ background: color(i) }} />
              <span>{s.name}</span>
              <b>{s.pct}%</b>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Band({ f }: { f: BandFig }) {
  return (
    <>
      <Head title={f.title} />
      <Legend names={f.parts} />
      <div className="band">
        {f.bars.map((b) => (
          <div key={b.name}>
            <div className="band-name">{b.name}</div>
            <div className="band-bar" role="img" aria-label={`${b.name}：${f.parts.map((p, i) => `${p} ${b.pcts[i]}%`).join('、')}`}>
              {b.pcts.map((p, i) => (
                <span key={i} style={{ flex: `${p} 1 0`, background: color(i), color: onColor(i) }}>
                  {p}%
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function Figure({ fig }: { fig: Fig }) {
  return (
    <div className="fig">
      {fig.type === 'table' && <Table f={fig} />}
      {fig.type === 'bar' && <Bars f={fig} />}
      {fig.type === 'line' && <Lines f={fig} />}
      {fig.type === 'pie' && <Pie f={fig} />}
      {fig.type === 'band' && <Band f={fig} />}
      {/* 円グラフの注は計算に使う総額なので、目立たせる */}
      {fig.note && (fig.type === 'pie' ? <div className="fig-note strong">{fig.note}</div> : <div className="fig-note">※ {fig.note}</div>)}
    </div>
  );
}
