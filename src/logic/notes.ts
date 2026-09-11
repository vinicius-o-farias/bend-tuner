export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Número MIDI (pode ser fracionário) a partir de uma frequência em Hz. */
export function freqToMidi(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function midiToName(midi: number): string {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

/** Diferença em cents entre duas frequências (positivo se `freq` está acima de `ref`). */
export function centsBetween(freq: number, ref: number): number {
  return 1200 * Math.log2(freq / ref);
}

/** Desvio em cents da frequência em relação ao semitom mais próximo. */
export function centsOffFromNearest(freq: number, a4 = 440): { midi: number; cents: number } {
  const exact = freqToMidi(freq, a4);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}
