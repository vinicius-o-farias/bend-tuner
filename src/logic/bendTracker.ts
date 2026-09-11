import { centsBetween, freqToMidi, midiToFreq, midiToName } from './notes';

/** Alvos de bend em cents. */
export const BEND_TARGETS = [
  { cents: 100, label: '½ tom', short: '½' },
  { cents: 200, label: '1 tom', short: '1' },
  { cents: 300, label: '1½ tom', short: '1½' },
  { cents: 400, label: '2 tons', short: '2' },
] as const;

export type TargetMode = 'auto' | 100 | 200 | 300 | 400;

/** Alvo máximo considerado em modo automático (uma oitava). */
export const MAX_TARGET_CENTS = 1200;

/** Etiqueta em tons para um alvo em cents (múltiplo de 100). */
export function labelForCents(cents: number): string {
  const fixed = BEND_TARGETS.find((t) => t.cents === cents);
  if (fixed) return fixed.label;
  const semis = Math.round(cents / 100);
  const whole = Math.floor(semis / 2);
  const half = semis % 2 === 1;
  const num = half ? `${whole}½` : `${whole}`;
  const unit = whole === 1 && !half ? 'tom' : whole >= 1 ? 'tons' : 'tom';
  return semis === 12 ? '6 tons (oitava)' : `${num} ${unit}`;
}

/** Etiqueta curta (sem unidade) para marcas discretas. */
export function shortLabelForCents(cents: number): string {
  const semis = Math.round(cents / 100);
  const whole = Math.floor(semis / 2);
  return semis % 2 === 1 ? `${whole}½` : `${whole}`;
}

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
  /** Salto de pitch entre frames consecutivos (cents) a partir do qual se assume nova nota, não bend. */
  jumpResetCents?: number;
  /** Activa a detecção de saltos bruscos (mudança de casa) como nova nota de origem. */
  jumpDetection?: boolean;
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
  const jumpResetCents = options.jumpResetCents ?? 300;
  let jumpDetection = options.jumpDetection ?? true;

  let rootMidi: number | null = null;
  let prevRawFreq: number | null = null;
  let prevRawTime = 0;
  /** Última altura confirmada por dois frames concordantes: referência de "antes do salto". */
  let settledFreq: number | null = null;
  let prevFrameWasNull = true;
  let pendingJump: { freq: number; pre: number } | null = null;
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
    // semitom mais próximo, entre ½ tom e uma oitava
    const semis = Math.round(cents / 100);
    return Math.min(MAX_TARGET_CENTS, Math.max(100, semis * 100));
  }

  /**
   * Um bend é um glissando contínuo; uma mudança de casa é um salto instantâneo.
   * Confirma o salto no frame seguinte (rejeita erros de oitava de um só frame) e,
   * se a nova altura se mantiver longe da anterior, fixa-a como nova origem.
   */
  function handleJump(freq: number, now: number): boolean {
    if (!jumpDetection || lockedRoot || rootMidi === null || prevRawFreq === null) return false;
    // Frames consecutivos com som: limiar proporcional ao intervalo real (referência 16 ms, até 4×),
    // para que quedas de frames do browser não transformem um bend rápido em salto.
    // Após um hiato sem pitch (nota abafada entre casas) o salto conta por inteiro.
    const scale = prevFrameWasNull ? 1 : Math.min(4, Math.max(1, (now - prevRawTime) / 16));
    const limit = jumpResetCents * scale;
    const ref = settledFreq ?? prevRawFreq;
    const far = (a: number, b: number) => Math.abs(centsBetween(a, b)) > limit;
    const near = (a: number, b: number) => Math.abs(centsBetween(a, b)) < stableCents;
    if (pendingJump) {
      if (near(freq, pendingJump.freq)) {
        const confirmed = far(freq, pendingJump.pre);
        pendingJump = null;
        return confirmed;
      }
      if (near(freq, pendingJump.pre)) {
        pendingJump = null; // glitch: voltou à altura anterior
        return false;
      }
      pendingJump = { freq, pre: pendingJump.pre };
      return false;
    }
    if (far(freq, prevRawFreq)) pendingJump = { freq, pre: ref };
    return false;
  }

  function update(freq: number | null, clarity: number, rms: number, now: number): BendState {
    if (freq === null) {
      prevFrameWasNull = true;
      if (now - lastSignalTime > silenceResetMs) {
        if (!lockedRoot) rootMidi = null;
        smoothedFreq = null;
        stableCount = 0;
        lastCandidateMidi = null;
        peakCents = 0;
        prevRawFreq = null;
        settledFreq = null;
        pendingJump = null;
        return emptyState('silence', clarity, rms);
      }
      // curto hiato — manter estado mas sem leitura
      return emptyState(rootMidi === null ? 'waiting' : 'rest', clarity, rms);
    }

    lastSignalTime = now;

    if (handleJump(freq, now)) {
      // nova nota tocada (mudança de casa): fixar já como origem
      rootMidi = Math.round(freqToMidi(freq, a4));
      smoothedFreq = freq;
      peakCents = 0;
      stableCount = stableFrames;
    }
    if (prevRawFreq !== null && Math.abs(centsBetween(freq, prevRawFreq)) < stableCents) settledFreq = freq;
    prevRawFreq = freq;
    prevRawTime = now;
    prevFrameWasNull = false;

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
        state.targetLabel = labelForCents(targetCents);
        state.targetName = midiToName(rootMidi + targetCents / 100);
        state.deviation = centsAboveRoot - targetCents;
      }
      return state;
    }

    const deviation = centsAboveRoot - targetCents;
    state.deviation = deviation;
    state.targetLabel = labelForCents(targetCents);
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
    setJumpDetection(on: boolean) {
      jumpDetection = on;
      pendingJump = null;
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
      prevRawFreq = null;
      settledFreq = null;
      prevFrameWasNull = true;
      pendingJump = null;
      smoothedFreq = null;
      stableCount = 0;
      lastCandidateMidi = null;
      peakCents = 0;
    },
  };
}
