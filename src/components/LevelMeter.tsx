import { useCallback, useRef, useState } from 'react';
import { levelPctToRms, rmsThresholdToSensitivity, rmsToLevelPct } from '../logic/sensitivity';

interface Props {
  rms: number;
  rmsThreshold: number;
  sensitivity: number;
  onSensitivityChange: (s: number) => void;
}

/**
 * Barra de nível do sinal com a marca do limiar arrastável.
 * Arrastar/clicar na barra ou usar as setas ajusta a sensibilidade.
 */
export function LevelMeter({ rms, rmsThreshold, sensitivity, onSensitivityChange }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [dragging, setDragging] = useState(false);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((clientX - rect.left) / rect.width) * 100;
      onSensitivityChange(rmsThresholdToSensitivity(levelPctToRms(pct)));
    },
    [onSensitivityChange],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (dragging) setFromClientX(e.clientX);
  };
  const endDrag = () => setDragging(false);

  const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onSensitivityChange(Math.max(0, sensitivity - step));
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onSensitivityChange(Math.min(100, sensitivity + step));
    }
  };

  const gatePct = rmsToLevelPct(rmsThreshold);
  const levelPct = rmsToLevelPct(rms);
  const above = rms >= rmsThreshold;

  return (
    <span
      ref={ref}
      className={`level${dragging ? ' dragging' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label="Limiar de sensibilidade"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={sensitivity}
      aria-valuetext={`Sensibilidade ${sensitivity}`}
      title="Arrasta a marca para ajustar a sensibilidade"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <span className={`level-bar${above ? ' above' : ''}`} style={{ width: `${levelPct}%` }} />
      <span className="level-gate" style={{ left: `${gatePct}%` }}>
        <span className="level-gate-handle" />
        <span className="level-gate-value">{sensitivity}</span>
      </span>
    </span>
  );
}
