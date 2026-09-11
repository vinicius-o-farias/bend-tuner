import { describe, expect, it } from 'vitest';
import { createBendTracker, labelForCents } from './bendTracker';
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
    const mid = root * Math.pow(2, 160 / 1200);
    const high = root * Math.pow(2, 318 / 1200); // 18 cents acima de 1½ tom
    const st = run(t, [root, root, root, mid, high, high]);
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

  it('alvos automáticos acima de 2 tons (semitom mais próximo até à oitava)', () => {
    const t = createBendTracker({ stableFrames: 3, smoothing: 1, toleranceCents: 10 });
    const root = midiToFreq(G4);
    const glide = [200, 400, 600].map((c) => root * Math.pow(2, c / 1200));
    const f = root * Math.pow(2, 712 / 1200); // 12 cents acima de 3½ tons
    const st = run(t, [root, root, root, ...glide, f, f]);
    expect(st.targetCents).toBe(700);
    expect(st.targetLabel).toBe('3½ tons');
    expect(st.targetName).toBe('D5');
    expect(st.verdict).toBe('sharp');
    expect(Math.round(st.deviation)).toBe(12);
  });

  it('labelForCents', () => {
    expect(labelForCents(100)).toBe('½ tom');
    expect(labelForCents(200)).toBe('1 tom');
    expect(labelForCents(500)).toBe('2½ tons');
    expect(labelForCents(600)).toBe('3 tons');
    expect(labelForCents(1200)).toBe('6 tons (oitava)');
  });

  it('salto brusco confirmado (mudança de casa) fixa nova origem', () => {
    const t = createBendTracker({ stableFrames: 3, smoothing: 1 });
    const root = midiToFreq(G4);
    const c5 = midiToFreq(G4 + 5); // salto de 500 cents
    let st = run(t, [root, root, root]);
    expect(st.rootName).toBe('G4');
    st = run(t, [c5], 100); // 1.º frame: pendente, ainda G4
    expect(st.rootName).toBe('G4');
    st = run(t, [c5, c5], 200); // confirmado
    expect(st.rootName).toBe('C5');
    expect(st.verdict).toBe('rest');
  });

  it('glitch de oitava de um frame não altera a origem durante um bend', () => {
    const t = createBendTracker({ stableFrames: 3, smoothing: 1, toleranceCents: 10 });
    const root = midiToFreq(G4);
    const bent = root * Math.pow(2, 150 / 1200);
    let st = run(t, [root, root, root, bent, bent]);
    expect(st.rootName).toBe('G4');
    st = run(t, [bent * 2, bent, bent], 200);
    expect(st.rootName).toBe('G4');
    expect(st.targetCents).toBe(200);
  });

  it('bend rápido mas contínuo não é tratado como salto', () => {
    const t = createBendTracker({ stableFrames: 3, smoothing: 1 });
    const root = midiToFreq(G4);
    const glide = [50, 120, 200, 280, 350, 400].map((c) => root * Math.pow(2, c / 1200));
    const st = run(t, [root, root, root, ...glide]);
    expect(st.rootName).toBe('G4');
    expect(st.targetCents).toBe(400);
    expect(st.verdict).toBe('in-tune');
  });

  it('detecção de saltos pode ser desligada', () => {
    const t = createBendTracker({ stableFrames: 3, smoothing: 1, jumpDetection: false });
    const root = midiToFreq(G4);
    const c5 = midiToFreq(G4 + 5);
    run(t, [root, root, root]);
    const st = run(t, [c5, c5, c5], 100);
    expect(st.rootName).toBe('G4');
    expect(st.targetCents).toBe(500);
  });
});
