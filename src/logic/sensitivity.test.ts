import { describe, expect, it } from 'vitest';
import { sensitivityToThresholds } from './sensitivity';

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
});
