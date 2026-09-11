import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { BEND_TARGETS } from '../logic/bendTracker';
import type { HistoryPoint } from '../audio/useAudioEngine';

const MAX_CENTS = 450;
const WINDOW_MS = 4000;

interface Props {
  history: MutableRefObject<HistoryPoint[]>;
  toleranceCents: number;
  running: boolean;
}

/** Gráfico dos últimos segundos: cents acima da raiz ao longo do tempo. */
export function HistoryGraph({ history, toleranceCents, running }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const y = (c: number) => h - (Math.max(0, Math.min(MAX_CENTS, c)) / MAX_CENTS) * (h - 8) - 4;
      const now = performance.now();
      const x = (t: number) => w - ((now - t) / WINDOW_MS) * w;

      // Linhas dos alvos + zonas de tolerância
      for (const t of BEND_TARGETS) {
        ctx.fillStyle = 'rgba(124, 242, 176, 0.10)';
        ctx.fillRect(0, y(t.cents + toleranceCents), w, y(t.cents - toleranceCents) - y(t.cents + toleranceCents));
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.moveTo(0, y(t.cents));
        ctx.lineTo(w, y(t.cents));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(t.label, 6, y(t.cents) - 4);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(0, y(0));
      ctx.lineTo(w, y(0));
      ctx.stroke();

      // Curva
      const pts = history.current;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      let started = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        if (p.cents === null) {
          started = false;
          continue;
        }
        const color = colorFor(p.cents, p.targetCents, toleranceCents);
        const px = x(p.t);
        const py = y(p.cents);
        if (!started) {
          ctx.beginPath();
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.strokeStyle = color;
          ctx.lineTo(px, py);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(px, py);
        }
      }

      if (running) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [history, toleranceCents, running]);

  return <canvas ref={canvasRef} className="history" aria-label="Histórico do bend" />;
}

function colorFor(cents: number, target: number | null, tol: number): string {
  if (target === null || cents < 35) return 'rgba(180, 190, 210, 0.9)';
  const d = cents - target;
  if (Math.abs(d) <= tol) return '#7cf2b0';
  return d < 0 ? '#ffd166' : '#ff6b6b';
}
