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
