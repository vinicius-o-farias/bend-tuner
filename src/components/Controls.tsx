import { BEND_TARGETS, type TargetMode } from '../logic/bendTracker';
import { NOTE_NAMES } from '../logic/notes';
import type { EngineSettings } from '../audio/useAudioEngine';

interface Props {
  settings: EngineSettings;
  onChange: (patch: Partial<EngineSettings>) => void;
  devices: MediaDeviceInfo[];
  running: boolean;
}

// Notas típicas onde se fazem bends: E2 (40) até E6 (88)
const ROOT_OPTIONS: number[] = [];
for (let m = 40; m <= 88; m++) ROOT_OPTIONS.push(m);

export function Controls({ settings, onChange, devices, running }: Props) {
  return (
    <section className="controls">
      <div className="control">
        <label>Alvo do bend</label>
        <div className="segmented">
          <button
            className={settings.targetMode === 'auto' ? 'on' : ''}
            onClick={() => onChange({ targetMode: 'auto' })}
          >
            Auto
          </button>
          {BEND_TARGETS.map((t) => (
            <button
              key={t.cents}
              className={settings.targetMode === t.cents ? 'on' : ''}
              onClick={() => onChange({ targetMode: t.cents as TargetMode })}
              title={`${t.cents} cents`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control">
        <label>
          Tolerância <span className="mono">±{settings.toleranceCents}¢</span>
        </label>
        <input
          type="range"
          min={3}
          max={30}
          step={1}
          value={settings.toleranceCents}
          onChange={(e) => onChange({ toleranceCents: Number(e.target.value) })}
        />
      </div>

      <div className="control">
        <label>
          Sensibilidade <span className="mono">{settings.sensitivity}</span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={settings.sensitivity}
          onChange={(e) => onChange({ sensitivity: Number(e.target.value) })}
          title="Baixa: ignora ruído e sinal fraco. Alta: reage a notas mais fracas."
        />
        <div className="hint">
          {settings.sensitivity < 30
            ? 'Só notas fortes e bem definidas'
            : settings.sensitivity > 70
              ? 'Reage a sinal fraco (pode apanhar ruído)'
              : 'Equilibrado'}
        </div>
      </div>

      <div className="control">
        <label>Nota de origem</label>
        <select
          value={settings.lockedRootMidi ?? 'auto'}
          onChange={(e) =>
            onChange({ lockedRootMidi: e.target.value === 'auto' ? null : Number(e.target.value) })
          }
        >
          <option value="auto">Automática (detecta a nota tocada)</option>
          {ROOT_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {NOTE_NAMES[m % 12]}
              {Math.floor(m / 12) - 1}
            </option>
          ))}
        </select>
      </div>

      <div className="control">
        <label>Entrada de áudio {running && <em>(parar para trocar)</em>}</label>
        <select
          value={settings.deviceId ?? ''}
          disabled={running}
          onChange={(e) => onChange({ deviceId: e.target.value || null })}
        >
          <option value="">Predefinida do sistema</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Dispositivo ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      </div>

      <div className="control">
        <label>
          Referência A4 <span className="mono">{settings.a4} Hz</span>
        </label>
        <input
          type="range"
          min={430}
          max={450}
          step={1}
          value={settings.a4}
          onChange={(e) => onChange({ a4: Number(e.target.value) })}
        />
      </div>
    </section>
  );
}
