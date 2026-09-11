/**
 * Converte a sensibilidade (0–100) nos limiares do detector de pitch.
 * - Sensibilidade alta → aceita sinal mais fraco (RMS menor) e menos periódico (clareza menor).
 * - Sensibilidade baixa → ignora ruído/captação fraca, exige nota bem definida.
 * 50 corresponde aos valores por omissão anteriores (RMS ≈ 0.006, clareza 0.86).
 */
export interface DetectorThresholds {
  rmsThreshold: number;
  clarityThreshold: number;
}

export const DEFAULT_SENSITIVITY = 50;

const RMS_MIN_SENS = 0.04; // sensibilidade 0
const RMS_MAX_SENS = 0.001; // sensibilidade 100
const CLARITY_MIN_SENS = 0.94;
const CLARITY_MAX_SENS = 0.78;

export function sensitivityToThresholds(sensitivity: number): DetectorThresholds {
  const t = Math.min(100, Math.max(0, sensitivity)) / 100;
  const logRms = Math.log10(RMS_MIN_SENS) + (Math.log10(RMS_MAX_SENS) - Math.log10(RMS_MIN_SENS)) * t;
  return {
    rmsThreshold: Math.pow(10, logRms),
    clarityThreshold: CLARITY_MIN_SENS + (CLARITY_MAX_SENS - CLARITY_MIN_SENS) * t,
  };
}

/** Inversa de `sensitivityToThresholds` para o limiar de RMS (resultado 0–100, arredondado). */
export function rmsThresholdToSensitivity(rms: number): number {
  const lo = Math.log10(RMS_MIN_SENS);
  const hi = Math.log10(RMS_MAX_SENS);
  const t = (Math.log10(Math.max(rms, 1e-6)) - lo) / (hi - lo);
  return Math.round(Math.min(100, Math.max(0, t)) * 100);
}

/** Escala logarítmica do nível (−60 dBFS → 0, 0 dBFS → 100). */
export function rmsToLevelPct(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

export function levelPctToRms(pct: number): number {
  const db = (Math.max(0, Math.min(100, pct)) / 100) * 60 - 60;
  return Math.pow(10, db / 20);
}
