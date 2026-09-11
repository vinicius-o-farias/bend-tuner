import { describe, expect, it } from 'vitest';
import { levelPctToRms, rmsThresholdToSensitivity, rmsToLevelPct, sensitivityToThresholds } from './sensitivity';

describe('sensitivityToThresholds', () => {
  it('50 mantém os valores por omissão', () => {
    const t = sensitivityToThresholds(50);
    expect(t.rmsThreshold).toBeGreaterThan(0.005);
    expect(t.rmsThreshold).toBeLessThan(0.008);
    expect(t.clarityThreshold).toBeCloseTo(0.86, 2);
  });

  it('é monótona: mais sensibilidade → limiares mais baixos', () => {
    let prev = sensitivityToThresholds(0);
    for (let s = 10; s <= 100; s += 10) {
      const cur = sensitivityToThresholds(s);
      expect(cur.rmsThreshold).toBeLessThan(prev.rmsThreshold);
      expect(cur.clarityThreshold).toBeLessThan(prev.clarityThreshold);
      prev = cur;
    }
  });

  it('limita valores fora de 0–100', () => {
    expect(sensitivityToThresholds(-20)).toEqual(sensitivityToThresholds(0));
    expect(sensitivityToThresholds(500)).toEqual(sensitivityToThresholds(100));
  });

  it('rmsThresholdToSensitivity inverte sensitivityToThresholds', () => {
    for (const s of [0, 13, 50, 77, 100]) {
      expect(rmsThresholdToSensitivity(sensitivityToThresholds(s).rmsThreshold)).toBe(s);
    }
  });

  it('level pct ↔ rms são inversas', () => {
    for (const pct of [0, 25, 53, 100]) {
      expect(rmsToLevelPct(levelPctToRms(pct))).toBeCloseTo(pct, 6);
    }
  });
});
