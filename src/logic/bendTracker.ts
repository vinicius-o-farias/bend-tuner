import { centsBetween, freqToMidi, midiToFreq, midiToName } from './notes';

/** Alvos de bend em cents. */
export const BEND_TARGETS = [
  { cents: 100, label: '½ tom', short: '½' },
  { cents: 200, label: '1 tom', short: '1' },
  { cents: 300, label: '1½ tom', short: '1½' },
  { cents: 400, label: '2 tons', short: '2' },
] as const;

export type TargetMode = 'auto' | 100 | 200 | 300 | 400;

export type Verdict = 'silence' | 'waiting' | 'rest' | 'flat' | 'in-tune' | 'sharp';

export interface BendState {
  /** Nota de origem (MIDI inteiro) ou null se ainda não foi capturada. */
  rootMidi: number | null;
  rootName: string | null;
  rootFreq: number | null;
  /** Frequência detectada agora. */
  currentFreq: number | null;
  currentName: string | null;
  /** Cents acima da nota de origem (0 = sem bend). */
  centsAboveRoot: number;
  /** Alvo em cents actualmente considerado (null se não há bend em curso). */
  targetCents: number | null;
  targetLabel: string | null;
  targetName: string | null;
  /** Desvio em relação ao alvo: negativo = falta, positivo = passou. */
  deviation: number;
  verdict: Verdict;
  /** Maior valor de cents atingido neste bend (pico). */
  peakCents: number;
  clarity: number;
  rms: number;
}

export interface BendTrackerOptions {
  a4?: number;
  /** Tolerância (± cents) para considerar o bend afinado. */
  toleranceCents?: number;
  /** Frames estáveis consecutivos necessários para fixar a nota de origem. */
  stableFrames?: number;
  /** Variação máxima (cents) entre frames para contar como "estável". */
  stableCents?: number;
  /** Cents acima da raiz a partir dos quais se considera que há um bend. */
  bendStartCents?: number;
  /** Tempo (ms) de silêncio para descartar a raiz. */
  silenceResetMs?: number;
  /** Se a frequência cair mais do que isto abaixo da raiz, recaptura a raiz. */
  belowRootResetCents?: number;
  /** Ganho de suavização exponencial do pitch (0..1, maior = mais reactivo). */
  smoothing?: number;
  targetMode?: TargetMode;
}

export function createBendTracker(options: BendTrackerOptions = {}) {
  let a4 = options.a4 ?? 440;
  let tolerance = options.toleranceCents ?? 10;
  const stableFrames = options.stableFrames ?? 3;
  const stableCents = options.stableCents ?? 20;
  const bendStartCents = options.bendStartCents ?? 35;
  const silenceResetMs = options.silenceResetMs ?? 350;
  const belowRootResetCents = options.belowRootResetCents ?? 60;
  const smoothing = options.smoothing ?? 0.5;
  let targetMode: TargetMode = options.targetMode ?? 'auto';

  let rootMidi: number | null = null;
  let smoothedFreq: number | null = null;
  let stableCount = 0;
  let lastCandidateMidi: number | null = null;
  let lastSignalTime = 0;
  let peakCents = 0;
  let lockedRoot = false;

  function emptyState(verdict: Verdict, clarity: number, rms: number): BendState {
    return {
      rootMidi,
      rootName: rootMidi === null ? null : midiToName(rootMidi),
      rootFreq: rootMidi === null ? null : midiToFreq(rootMidi, a4),
      currentFreq: null,
      currentName: null,
      centsAboveRoot: 0,
      targetCents: null,
      targetLabel: null,
      targetName: null,
      deviation: 0,
      verdict,
      peakCents,
      clarity,
      rms,
    };
  }

  function chooseTarget(cents: number): number | null {
    if (targetMode !== 'auto') return targetMode;
    if (cents < bendStartCents) return null;
    let best: number = BEND_TARGETS[0].cents;
    let bestDist = Infinity;
    for (const t of BEND_TARGETS) {
      const d = Math.abs(t.cents - cents);
      if (d < bestDist) {
        bestDist = d;
        best = t.cents;
      }
    }
    return best;
  }

  function update(freq: number | null, clarity: number, rms: number, now: number): BendState {
    if (freq === null) {
      if (now - lastSignalTime > silenceResetMs) {
        if (!lockedRoot) rootMidi = null;
        smoothedFreq = null;
        stableCount = 0;
        lastCandidateMidi = null;
        peakCents = 0;
        return emptyState('silence', clarity, rms);
      }
      // curto hiato — manter estado mas sem leitura
      return emptyState(rootMidi === null ? 'waiting' : 'rest', clarity, rms);
    }

    lastSignalTime = now;

    // Suavização exponencial; rejeita saltos de oitava do detector
    if (smoothedFreq === null) {
      smoothedFreq = freq;
    } else {
      const jump = Math.abs(centsBetween(freq, smoothedFreq));
      smoothedFreq = jump > 700 ? freq : smoothedFreq + (freq - smoothedFreq) * smoothing;
    }
    const f = smoothedFreq;
    const exactMidi = freqToMidi(f, a4);

    // Captura da nota de origem
    if (rootMidi === null) {
      const candidate = Math.round(exactMidi);
      if (lastCandidateMidi !== null && Math.abs((exactMidi - lastCandidateMidi) * 100) < stableCents) {
        stableCount++;
      } else {
        stableCount = 1;
      }
      lastCandidateMidi = exactMidi;
      if (stableCount >= stableFrames) {
        rootMidi = candidate;
        peakCents = 0;
      } else {
        const st = emptyState('waiting', clarity, rms);
        st.currentFreq = f;
        st.currentName = midiToName(exactMidi);
        return st;
      }
    }

    const rootFreq = midiToFreq(rootMidi, a4);
    const centsAboveRoot = centsBetween(f, rootFreq);

    // Caiu bem abaixo da raiz → nova nota tocada, recapturar
    if (!lockedRoot && centsAboveRoot < -belowRootResetCents) {
      rootMidi = null;
      stableCount = 1;
      lastCandidateMidi = exactMidi;
      peakCents = 0;
      const st = emptyState('waiting', clarity, rms);
      st.currentFreq = f;
      st.currentName = midiToName(exactMidi);
      return st;
    }

    if (centsAboveRoot > peakCents) peakCents = centsAboveRoot;
    // se voltou à raiz, o bend acabou: reiniciar o pico
    if (centsAboveRoot < bendStartCents * 0.5) peakCents = 0;

    const targetCents = chooseTarget(centsAboveRoot);
    const state: BendState = {
      rootMidi,
      rootName: midiToName(rootMidi),
      rootFreq,
      currentFreq: f,
      currentName: midiToName(exactMidi),
      centsAboveRoot,
      targetCents,
      targetLabel: null,
      targetName: null,
      deviation: 0,
      verdict: 'rest',
      peakCents,
      clarity,
      rms,
    };

    if (targetCents === null || centsAboveRoot < bendStartCents) {
      state.verdict = 'rest';
      if (targetCents !== null) {
        state.targetLabel = BEND_TARGETS.find((t) => t.cents === targetCents)?.label ?? null;
        state.targetName = midiToName(rootMidi + targetCents / 100);
        state.deviation = centsAboveRoot - targetCents;
      }
      return state;
    }

    const deviation = centsAboveRoot - targetCents;
    state.deviation = deviation;
    state.targetLabel = BEND_TARGETS.find((t) => t.cents === targetCents)?.label ?? null;
    state.targetName = midiToName(rootMidi + targetCents / 100);
    state.verdict = Math.abs(deviation) <= tolerance ? 'in-tune' : deviation < 0 ? 'flat' : 'sharp';
    return state;
  }

  return {
    update,
    setTolerance(c: number) {
      tolerance = c;
    },
    setTargetMode(m: TargetMode) {
      targetMode = m;
    },
    setA4(v: number) {
      a4 = v;
    },
    /** Fixa manualmente a nota de origem (MIDI). Passar null para voltar ao automático. */
    setRoot(midi: number | null) {
      if (midi === null) {
        lockedRoot = false;
        rootMidi = null;
      } else {
        lockedRoot = true;
        rootMidi = midi;
      }
      peakCents = 0;
      stableCount = 0;
    },
    isRootLocked: () => lockedRoot,
    reset() {
      if (!lockedRoot) rootMidi = null;
      smoothedFreq = null;
      stableCount = 0;
      lastCandidateMidi = null;
      peakCents = 0;
    },
  };
}
