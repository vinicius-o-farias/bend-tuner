import { BEND_TARGETS, MAX_TARGET_CENTS, shortLabelForCents, type BendState } from '../logic/bendTracker';

interface Props {
  state: BendState;
  toleranceCents: number;
  /** Limite direito da régua em cents (cresce quando o bend passa de 2 tons). */
  maxCents: number;
}

/** Régua horizontal 0–maxCents com marcadores nos alvos e indicador da posição actual. */
export function BendMeter({ state, toleranceCents, maxCents }: Props) {
  const MAX_CENTS = maxCents;
  const has = state.currentFreq !== null && state.rootFreq !== null;
  // alvos discretos acima de 2 tons, até ao limite visível
  const minor: number[] = [];
  for (let c = 500; c <= Math.min(MAX_TARGET_CENTS, MAX_CENTS - 50); c += 100) minor.push(c);
  const cents = Math.max(0, Math.min(MAX_CENTS, has ? state.centsAboveRoot : 0));
  const pct = (cents / MAX_CENTS) * 100;
  const peak = Math.max(0, Math.min(MAX_CENTS, state.peakCents));

  return (
    <div className="meter" aria-label="Medidor de bend">
      <div className="meter-track">
        {BEND_TARGETS.map((t) => {
          const left = (t.cents / MAX_CENTS) * 100;
          const width = ((toleranceCents * 2) / MAX_CENTS) * 100;
          const active = state.targetCents === t.cents;
          return (
            <div key={t.cents} className={`meter-target${active ? ' active' : ''}`} style={{ left: `${left}%` }}>
              <div className="meter-zone" style={{ width: `${width}%` }} />
              <div className="meter-tick" />
              <div className="meter-label">
                <strong>{t.label}</strong>
                {state.rootMidi !== null && (
                  <span>{targetNoteName(state.rootMidi, t.cents)}</span>
                )}
              </div>
            </div>
          );
        })}
        {minor.map((c) => {
          const left = (c / MAX_CENTS) * 100;
          const width = ((toleranceCents * 2) / MAX_CENTS) * 100;
          const active = state.targetCents === c;
          return (
            <div key={c} className={`meter-target minor${active ? ' active' : ''}`} style={{ left: `${left}%` }}>
              <div className="meter-zone" style={{ width: `${width}%` }} />
              <div className="meter-tick" />
              <div className="meter-label">
                <strong>{shortLabelForCents(c)}</strong>
                {active && state.rootMidi !== null && <span>{targetNoteName(state.rootMidi, c)}</span>}
              </div>
            </div>
          );
        })}
        <div className="meter-origin">
          <div className="meter-tick origin" />
          <div className="meter-label">
            <strong>0</strong>
            <span>{state.rootName ?? '—'}</span>
          </div>
        </div>
        {peak > 0 && <div className="meter-peak" style={{ left: `${(peak / MAX_CENTS) * 100}%` }} />}
        <div className={`meter-fill ${state.verdict}`} style={{ width: `${pct}%` }} />
        <div className={`meter-indicator ${state.verdict}${has ? '' : ' hidden'}`} style={{ left: `${pct}%` }}>
          <span>{Math.round(cents)}¢</span>
        </div>
      </div>
    </div>
  );
}

function targetNoteName(rootMidi: number, cents: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midi = rootMidi + cents / 100;
  const r = Math.round(midi);
  return `${names[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}
