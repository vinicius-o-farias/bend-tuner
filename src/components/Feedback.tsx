import type { BendState } from '../logic/bendTracker';

interface Props {
  state: BendState;
}

/** Mensagem principal: o que falta / quanto passou / afinado. */
export function Feedback({ state }: Props) {
  const { verdict } = state;
  const abs = Math.abs(Math.round(state.deviation));

  let headline = '';
  let detail = '';
  switch (verdict) {
    case 'silence':
      headline = 'Sem sinal';
      detail = 'Toca uma nota para começar.';
      break;
    case 'waiting':
      headline = 'A ouvir…';
      detail = state.currentName ? `A fixar nota de origem (${state.currentName})` : 'A fixar nota de origem';
      break;
    case 'rest':
      headline = state.rootName ?? '—';
      detail = state.targetLabel
        ? `Faz o bend de ${state.targetLabel} até ${state.targetName}`
        : 'Nota de origem fixada. Faz o bend.';
      break;
    case 'flat':
      headline = `Falta ${abs}¢`;
      detail = `para ${state.targetLabel} (${state.targetName}) — continua a subir`;
      break;
    case 'in-tune':
      headline = 'Afinado ✓';
      detail = `${state.targetLabel} → ${state.targetName} (${signed(state.deviation)}¢)`;
      break;
    case 'sharp':
      headline = `Passou ${abs}¢`;
      detail = `acima de ${state.targetLabel} (${state.targetName}) — alivia um pouco`;
      break;
  }

  return (
    <div className={`feedback ${verdict}`}>
      <div className="headline">{headline}</div>
      <div className="detail">{detail}</div>
    </div>
  );
}

function signed(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}` : `${r}`;
}
