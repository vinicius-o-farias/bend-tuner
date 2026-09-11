import { describe, expect, it } from 'vitest';
import { createBendTracker } from './bendTracker';
import { midiToFreq } from './notes';

const G4 = 67; // G4 = 392 Hz

function run(tracker: ReturnType<typeof createBendTracker>, freqs: (number | null)[], startT = 0, dt = 16) {
  let st = tracker.update(null, 0, 0, startT);
  freqs.forEach((f, i) => {
    st = tracker.update(f, 0.95, 0.1, startT + (i + 1) * dt);
  });
  return st;
}

describe('bendTracker', () => {
  it('fixa a nota de origem após frames estáveis', () => {
    const t = createBendTracker({ stableFrames: 3 });
    const root = midiToFreq(G4);
    const st = run(t, [root, root, root]);
    expect(st.rootName).toBe('G4');
    expect(st.verdict).toBe('rest');
  });

  it('detecta bend de 1 tom afinado (auto)', () => {
    const t = createBendTracker({ stableFrames: 3, smoothing: 1 });
    const root = midiToFreq(G4);
    const target = midiToFreq(G4 + 2); // A4
    const st = run(t, [root, root, root, target, target]);
    expect(st.targetCents).toBe(200);
    expect(st.targetName).toBe('A4');
    expect(st.verdict).toBe('in-tune');
    expect(Math.abs(st.deviation)).toBeLessThan(1);
  });

  it('indica quanto falta quando o bend está baixo', () => {
    const t = createBendTracker({ stableFrames: 3, smoothing: 1, toleranceCents: 10 });
    const root = midiToFreq(G4);
    const low = root * Math.pow(2, 175 / 1200); // 175 cents → 25 cents abaixo de 1 tom
    const st = run(t, [root, root, root, low, low]);
    expect(st.targetCents).toBe(200);
    expect(st.verdict).toBe('flat');
    expect(Math.round(st.deviation)).toBe(-25);
  });

  it('indica quanto passou quando o bend está alto', () => {
    const t = createBendTracker({ stableFrames: 3, smoothing: 1, toleranceCents: 10 });
    const root = midiToFreq(G4);
    const high = root * Math.pow(2, 318 / 1200); // 18 cents acima de 1½ tom
    const st = run(t, [root, root, root, high, high]);
    expect(st.targetCents).toBe(300);
    expect(st.verdict).toBe('sharp');
    expect(Math.round(st.deviation)).toBe(18);
  });

  it('respeita alvo fixo', () => {
    const t = createBendTracker({ stableFrames: 3, smoothing: 1, targetMode: 200 });
    const root = midiToFreq(G4);
    const half = root * Math.pow(2, 100 / 1200);
    const st = run(t, [root, root, root, half, half]);
    expect(st.targetCents).toBe(200);
    expect(st.verdict).toBe('flat');
    expect(Math.round(st.deviation)).toBe(-100);
  });

  it('descarta a raiz após silêncio prolongado', () => {
    const t = createBendTracker({ stableFrames: 3, silenceResetMs: 300 });
    const root = midiToFreq(G4);
    run(t, [root, root, root]);
    let st = t.update(null, 0, 0, 5000);
    expect(st.verdict).toBe('silence');
    expect(st.rootName).toBeNull();
    st = t.update(root, 0.9, 0.1, 5016);
    expect(st.verdict).toBe('waiting');
  });

  it('recaptura a raiz se a nota descer bem abaixo', () => {
    const t = createBendTracker({ stableFrames: 3, smoothing: 1 });
    const root = midiToFreq(G4);
    const lower = midiToFreq(G4 - 5); // D4
    let st = run(t, [root, root, root]);
    expect(st.rootName).toBe('G4');
    st = run(t, [lower, lower, lower], 1000);
    expect(st.rootName).toBe('D4');
  });
});
