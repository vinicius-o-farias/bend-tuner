import { useCallback, useEffect, useRef, useState } from 'react';
import { createPitchDetector } from './pitchDetector';
import { sensitivityToThresholds } from '../logic/sensitivity';
import { createBendTracker, type BendState, type TargetMode } from '../logic/bendTracker';

export type EngineStatus = 'idle' | 'starting' | 'running' | 'error';

export interface HistoryPoint {
  t: number;
  cents: number | null;
  targetCents: number | null;
}

const HISTORY_MS = 4000;
const FFT_SIZE = 4096;

const INITIAL_STATE: BendState = {
  rootMidi: null,
  rootName: null,
  rootFreq: null,
  currentFreq: null,
  currentName: null,
  centsAboveRoot: 0,
  targetCents: null,
  targetLabel: null,
  targetName: null,
  deviation: 0,
  verdict: 'silence',
  peakCents: 0,
  clarity: 0,
  rms: 0,
};

export interface EngineSettings {
  toleranceCents: number;
  targetMode: TargetMode;
  a4: number;
  lockedRootMidi: number | null;
  deviceId: string | null;
  /** 0–100: quão fraco/impreciso pode ser o sinal para ser aceite. */
  sensitivity: number;
  /** Tratar saltos bruscos de pitch (mudança de casa) como nova nota de origem. */
  jumpDetection: boolean;
}

export function useAudioEngine(settings: EngineSettings) {
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [state, setState] = useState<BendState>(INITIAL_STATE);
  const historyRef = useRef<HistoryPoint[]>([]);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const trackerRef = useRef(createBendTracker());
  const detectorRef = useRef<ReturnType<typeof createPitchDetector> | null>(null);
  const [rmsThreshold, setRmsThreshold] = useState(() => sensitivityToThresholds(settings.sensitivity).rmsThreshold);

  // Propagar definições para o tracker sem reiniciar o áudio
  useEffect(() => {
    trackerRef.current.setTolerance(settings.toleranceCents);
  }, [settings.toleranceCents]);
  useEffect(() => {
    trackerRef.current.setTargetMode(settings.targetMode);
  }, [settings.targetMode]);
  useEffect(() => {
    trackerRef.current.setA4(settings.a4);
  }, [settings.a4]);
  useEffect(() => {
    trackerRef.current.setRoot(settings.lockedRootMidi);
  }, [settings.lockedRootMidi]);
  useEffect(() => {
    trackerRef.current.setJumpDetection(settings.jumpDetection);
  }, [settings.jumpDetection]);
  useEffect(() => {
    const t = sensitivityToThresholds(settings.sensitivity);
    detectorRef.current?.setThresholds(t);
    setRmsThreshold(t.rmsThreshold);
  }, [settings.sensitivity]);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'audioinput'));
    } catch {
      /* ignorar */
    }
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    detectorRef.current = null;
    trackerRef.current.reset();
    historyRef.current = [];
    setState(INITIAL_STATE);
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus('starting');
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: settings.deviceId ? { exact: settings.deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      await refreshDevices();

      const ctx = new AudioContext({ latencyHint: 'interactive' });
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      const detector = createPitchDetector({
        sampleRate: ctx.sampleRate,
        minFreq: 70,
        maxFreq: 1400,
        ...sensitivityToThresholds(settings.sensitivity),
      });
      detectorRef.current = detector;
      const buffer = new Float32Array(analyser.fftSize);
      const tracker = trackerRef.current;

      const loop = () => {
        analyser.getFloatTimeDomainData(buffer);
        const now = performance.now();
        const { frequency, clarity, rms } = detector.detect(buffer);
        const next = tracker.update(frequency, clarity, rms, now);

        const hist = historyRef.current;
        hist.push({
          t: now,
          cents: next.currentFreq !== null && next.rootFreq !== null ? next.centsAboveRoot : null,
          targetCents: next.targetCents,
        });
        while (hist.length && now - hist[0].t > HISTORY_MS) hist.shift();

        setState(next);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      setStatus('running');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes('Permission') || msg.includes('NotAllowed')
          ? 'Acesso ao microfone negado. Permite o acesso no browser e tenta novamente.'
          : `Não foi possível abrir a entrada de áudio: ${msg}`,
      );
      setStatus('error');
      stop();
    }
  }, [settings.deviceId, settings.sensitivity, refreshDevices, stop]);

  // Pedir lista de dispositivos ao montar (nomes só aparecem depois da permissão)
  useEffect(() => {
    void refreshDevices();
    const handler = () => void refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [refreshDevices]);

  // Parar tudo ao desmontar
  useEffect(() => () => stop(), [stop]);

  return { status, error, devices, state, history: historyRef, start, stop, rmsThreshold };
}
