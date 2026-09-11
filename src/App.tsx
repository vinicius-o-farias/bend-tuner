import { useCallback, useEffect, useState } from 'react';
import { useAudioEngine, type EngineSettings } from './audio/useAudioEngine';
import { BendMeter } from './components/BendMeter';
import { DeviationGauge } from './components/DeviationGauge';
import { HistoryGraph } from './components/HistoryGraph';
import { Controls } from './components/Controls';
import { Feedback } from './components/Feedback';
import { DEFAULT_SENSITIVITY } from './logic/sensitivity';
import { LevelMeter } from './components/LevelMeter';

const SETTINGS_KEY = 'bend-tuner.settings.v1';


const DEFAULT_SETTINGS: EngineSettings = {
  toleranceCents: 10,
  targetMode: 'auto',
  a4: 440,
  lockedRootMidi: null,
  deviceId: null,
  sensitivity: DEFAULT_SENSITIVITY,
};

function loadSettings(): EngineSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<EngineSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function App() {
  const [settings, setSettings] = useState<EngineSettings>(loadSettings);
  const { status, error, devices, state, history, start, stop, rmsThreshold } = useAudioEngine(settings);
  const running = status === 'running';

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignorar */
    }
  }, [settings]);

  const patch = useCallback((p: Partial<EngineSettings>) => setSettings((s) => ({ ...s, ...p })), []);

  // Atalhos: espaço = iniciar/parar, 1–4 = alvo, 0 = auto
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        running ? stop() : void start();
      } else if (e.key === '0') patch({ targetMode: 'auto' });
      else if (e.key === '1') patch({ targetMode: 100 });
      else if (e.key === '2') patch({ targetMode: 200 });
      else if (e.key === '3') patch({ targetMode: 300 });
      else if (e.key === '4') patch({ targetMode: 400 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, start, stop, patch]);

  const hz = state.currentFreq;

  return (
    <div className={`app ${state.verdict}`}>
      <header>
        <div className="brand">
          <span className="logo" aria-hidden>
            ⌒
          </span>
          <h1>Bend Tuner</h1>
        </div>
        <div className="header-actions">
          <LevelMeter
            rms={state.rms}
            rmsThreshold={rmsThreshold}
            sensitivity={settings.sensitivity}
            onSensitivityChange={(s) => patch({ sensitivity: s })}
          />
          <button className={`primary ${running ? 'stop' : ''}`} onClick={() => (running ? stop() : void start())}>
            {status === 'starting' ? 'A ligar…' : running ? 'Parar' : 'Iniciar'}
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <main>
        <section className="readout">
          <div className="note-block">
            <div className="label">Origem</div>
            <div className="big">{state.rootName ?? '—'}</div>
            <div className="sub mono">{state.rootFreq ? `${state.rootFreq.toFixed(1)} Hz` : ''}</div>
          </div>

          <div className="center">
            <Feedback state={state} />
            <DeviationGauge state={state} toleranceCents={settings.toleranceCents} />
          </div>

          <div className="note-block right">
            <div className="label">Agora</div>
            <div className="big">{state.currentName ?? '—'}</div>
            <div className="sub mono">
              {hz ? `${hz.toFixed(1)} Hz` : ''}
              {hz && state.rootFreq ? ` · +${Math.round(Math.max(0, state.centsAboveRoot))}¢` : ''}
            </div>
          </div>
        </section>

        <BendMeter state={state} toleranceCents={settings.toleranceCents} />

        <HistoryGraph history={history} toleranceCents={settings.toleranceCents} running={running} />

        <Controls settings={settings} onChange={patch} devices={devices} running={running} />
      </main>

      <footer>
        <span>
          <kbd>Espaço</kbd> iniciar/parar · <kbd>0</kbd> auto · <kbd>1</kbd>–<kbd>4</kbd> alvo ½ / 1 / 1½ / 2
        </span>
        <span className="mono dim">
          {running ? `clareza ${(state.clarity * 100).toFixed(0)}%` : 'liga a guitarra à interface e carrega em Iniciar'}
        </span>
      </footer>
    </div>
  );
}
