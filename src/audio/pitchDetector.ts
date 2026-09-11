/**
 * Detector de pitch baseado no McLeod Pitch Method (MPM).
 * Calcula a NSDF (normalized square difference function), escolhe o primeiro
 * pico relevante acima de `clarityThreshold` e refina com interpolação parabólica.
 */

export interface PitchResult {
  /** Frequência fundamental em Hz, ou null se não houver pitch claro. */
  frequency: number | null;
  /** 0..1 — quão periódico é o sinal (confiança). */
  clarity: number;
  /** RMS do buffer (nível de sinal). */
  rms: number;
}

export interface PitchDetectorOptions {
  sampleRate: number;
  /** Frequência mínima detectável (Hz). */
  minFreq?: number;
  /** Frequência máxima detectável (Hz). */
  maxFreq?: number;
  /** Nível mínimo de RMS para considerar que há sinal. */
  rmsThreshold?: number;
  /** Clareza mínima da NSDF para aceitar o pitch (0..1). */
  clarityThreshold?: number;
}

export function createPitchDetector(opts: PitchDetectorOptions) {
  const sampleRate = opts.sampleRate;
  const minFreq = opts.minFreq ?? 60;
  const maxFreq = opts.maxFreq ?? 1500;
  let rmsThreshold = opts.rmsThreshold ?? 0.008;
  let clarityThreshold = opts.clarityThreshold ?? 0.85;

  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  let nsdf: Float32Array = new Float32Array(0);

  function detect(buffer: Float32Array): PitchResult {
    const n = buffer.length;
    const maxLag = Math.min(n - 2, Math.ceil(sampleRate / minFreq));

    // RMS + remoção de DC
    let sum = 0;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += buffer[i];
    mean /= n;
    for (let i = 0; i < n; i++) {
      const v = buffer[i] - mean;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / n);
    if (rms < rmsThreshold) return { frequency: null, clarity: 0, rms };

    if (nsdf.length !== maxLag + 1) nsdf = new Float32Array(maxLag + 1);

    // NSDF: n'(tau) = 2 * acf(tau) / (m(tau))
    // Calculado de forma incremental para O(n * maxLag) — suficiente para buffers de 2048–4096.
    for (let tau = 0; tau <= maxLag; tau++) {
      let acf = 0;
      let m = 0;
      for (let i = 0; i < n - tau; i++) {
        const a = buffer[i] - mean;
        const b = buffer[i + tau] - mean;
        acf += a * b;
        m += a * a + b * b;
      }
      nsdf[tau] = m > 0 ? (2 * acf) / m : 0;
    }

    // Peak picking: procurar máximos locais entre cruzamentos por zero (negativo → positivo).
    const peaks: number[] = [];
    let tau = minLag;
    // avançar até a primeira descida abaixo de zero
    while (tau <= maxLag && nsdf[tau] > 0) tau++;
    while (tau <= maxLag) {
      // encontrar próximo cruzamento positivo
      while (tau <= maxLag && nsdf[tau] <= 0) tau++;
      if (tau > maxLag) break;
      // dentro da região positiva, localizar o máximo
      let bestTau = tau;
      let bestVal = nsdf[tau];
      while (tau <= maxLag && nsdf[tau] > 0) {
        if (nsdf[tau] > bestVal) {
          bestVal = nsdf[tau];
          bestTau = tau;
        }
        tau++;
      }
      peaks.push(bestTau);
    }

    if (peaks.length === 0) return { frequency: null, clarity: 0, rms };

    // Escolher o primeiro pico que está acima de k * maior pico (k ≈ 0.9).
    let highest = -Infinity;
    for (const p of peaks) if (nsdf[p] > highest) highest = nsdf[p];
    const cutoff = 0.9 * highest;
    let chosen = peaks[0];
    for (const p of peaks) {
      if (nsdf[p] >= cutoff) {
        chosen = p;
        break;
      }
    }

    const clarity = nsdf[chosen];
    if (clarity < clarityThreshold) return { frequency: null, clarity, rms };

    // Interpolação parabólica em torno do pico
    let refined = chosen;
    if (chosen > 0 && chosen < maxLag) {
      const y0 = nsdf[chosen - 1];
      const y1 = nsdf[chosen];
      const y2 = nsdf[chosen + 1];
      const denom = 2 * (2 * y1 - y0 - y2);
      if (Math.abs(denom) > 1e-12) refined = chosen + (y2 - y0) / denom;
    }

    const frequency = sampleRate / refined;
    if (frequency < minFreq || frequency > maxFreq) return { frequency: null, clarity, rms };
    return { frequency, clarity, rms };
  }

  /** Ajusta os limiares de sinal/clareza sem recriar o detector. */
  function setThresholds(t: { rmsThreshold?: number; clarityThreshold?: number }) {
    if (t.rmsThreshold !== undefined) rmsThreshold = t.rmsThreshold;
    if (t.clarityThreshold !== undefined) clarityThreshold = t.clarityThreshold;
  }

  return { detect, setThresholds };
}
