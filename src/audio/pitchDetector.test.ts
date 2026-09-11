import { describe, expect, it } from 'vitest';
import { createPitchDetector } from './pitchDetector';
import { centsBetween } from '../logic/notes';

const SR = 48000;

function tone(freq: number, n = 4096, harmonics = [1, 0.5, 0.3, 0.2], amp = 0.3): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    harmonics.forEach((h, k) => {
      v += h * Math.sin((2 * Math.PI * freq * (k + 1) * i) / SR);
    });
    out[i] = amp * v;
  }
  return out;
}

describe('pitchDetector (MPM)', () => {
  const det = createPitchDetector({ sampleRate: SR, minFreq: 70, maxFreq: 1400 });

  it.each([82.41, 110, 146.83, 196, 246.94, 329.63, 392, 440, 659.26, 880])(
    'detecta %f Hz com erro < 3 cents',
    (f) => {
      const r = det.detect(tone(f));
      expect(r.frequency).not.toBeNull();
      expect(Math.abs(centsBetween(r.frequency!, f))).toBeLessThan(3);
      expect(r.clarity).toBeGreaterThan(0.9);
    },
  );

  it('devolve null para silêncio', () => {
    const r = det.detect(new Float32Array(4096));
    expect(r.frequency).toBeNull();
  });

  it('devolve null para ruído', () => {
    const buf = new Float32Array(4096);
    let seed = 1;
    for (let i = 0; i < buf.length; i++) {
      seed = (seed * 16807) % 2147483647;
      buf[i] = (seed / 2147483647 - 0.5) * 0.4;
    }
    const r = det.detect(buf);
    expect(r.frequency).toBeNull();
  });
});
