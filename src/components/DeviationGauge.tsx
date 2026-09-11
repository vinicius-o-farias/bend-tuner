import type { BendState } from '../logic/bendTracker';

const RANGE = 50; // ± cents visíveis

interface Props {
  state: BendState;
  toleranceCents: number;
}

/** Agulha fina: desvio em relação ao alvo escolhido (−50…+50 cents). */
export function DeviationGauge({ state, toleranceCents }: Props) {
  const active = state.verdict === 'flat' || state.verdict === 'in-tune' || state.verdict === 'sharp';
  const dev = active ? Math.max(-RANGE, Math.min(RANGE, state.deviation)) : 0;
  const angle = (dev / RANGE) * 60; // ±60°
  const tolAngle = (toleranceCents / RANGE) * 60;

  return (
    <div className={`gauge ${active ? state.verdict : 'inactive'}`} aria-label="Desvio em relação ao alvo">
      <svg viewBox="0 0 200 120" width="100%" height="100%">
        <defs>
          <clipPath id="gauge-clip">
            <rect x="0" y="0" width="200" height="105" />
          </clipPath>
        </defs>
        <g clipPath="url(#gauge-clip)">
          <path d="M 20 100 A 80 80 0 0 1 180 100" className="gauge-arc" />
          <path d={arcPath(-tolAngle, tolAngle)} className="gauge-tolerance" />
          {[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((c) => {
            const a = (c / RANGE) * 60;
            const [x1, y1] = polar(a, 80);
            const [x2, y2] = polar(a, c % 20 === 0 || c === 0 ? 68 : 74);
            return <line key={c} x1={x1} y1={y1} x2={x2} y2={y2} className="gauge-tick" />;
          })}
          <line x1="100" y1="100" x2={polar(angle, 78)[0]} y2={polar(angle, 78)[1]} className="gauge-needle" />
          <circle cx="100" cy="100" r="4" className="gauge-hub" />
        </g>
        <text x="20" y="116" className="gauge-text">−50¢</text>
        <text x="100" y="116" className="gauge-text" textAnchor="middle">alvo</text>
        <text x="180" y="116" className="gauge-text" textAnchor="end">+50¢</text>
      </svg>
    </div>
  );
}

function polar(angleDeg: number, r: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
}

function arcPath(a1: number, a2: number): string {
  const [x1, y1] = polar(a1, 80);
  const [x2, y2] = polar(a2, 80);
  return `M ${x1} ${y1} A 80 80 0 0 1 ${x2} ${y2}`;
}
