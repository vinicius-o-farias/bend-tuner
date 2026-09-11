# Bend Tuner

Monitor em tempo real da afinação de **bends** de guitarra. Liga a guitarra à interface de áudio,
escreve `bend` no terminal e a app abre no browser.

**Online:** https://vinicius-o-farias.github.io/bend-tuner/ (deploy automático a cada push para `main`).

## O que faz

- Detecta a nota que tocas (nota de origem) e, à medida que fazes o bend, mede quantos **cents** subiste.
- Escolhe automaticamente o alvo mais próximo — **½ tom (100¢), 1 tom (200¢), 1½ tom (300¢), 2 tons (400¢)** —
  ou fixa um alvo manualmente (teclas `1`–`4`, `0` volta ao automático).
- Mostra se estás **afinado**, quanto **falta** para chegar à nota ou quanto **passaste**.
- Régua 0–450¢ com marcadores nos alvos, agulha fina de ±50¢ em relação ao alvo e gráfico dos últimos 4 s.

## Instalação / uso

```bash
bend            # inicia o servidor (se necessário) e abre http://localhost:4321
bend stop       # pára o servidor em segundo plano
bend status
bend build      # build de produção em dist/
```

O comando `bend` é um symlink em `~/.local/bin/bend` → `bin/bend` deste projecto.
Na primeira execução instala as dependências automaticamente.

Para desenvolvimento directo:

```bash
npm install
npm run dev
npm test
```

## Como funciona

- **Captura**: `getUserMedia` com `echoCancellation`, `noiseSuppression` e `autoGainControl` desligados
  (importante para instrumentos). `AnalyserNode` com buffer de 4096 amostras.
- **Pitch**: McLeod Pitch Method (`src/audio/pitchDetector.ts`) — NSDF + escolha de pico + interpolação parabólica.
  Precisão testada < 3 cents entre 82 Hz e 880 Hz.
- **Bend**: `src/logic/bendTracker.ts` — fixa a nota de origem quando o pitch está estável durante alguns frames,
  depois calcula os cents acima dessa nota, escolhe o alvo e devolve o veredicto (`flat` / `in-tune` / `sharp`).
  Quando há silêncio ou a nota desce bastante, recaptura a origem.

## Dicas

- Se a nota de origem for capturada mal (ex.: apanhou o ataque), usa o selector **Nota de origem** para fixá-la.
- A **sensibilidade** (0–100) controla o quão fraco e impreciso pode ser o sinal para ser aceite. Se a app não reage
  à guitarra, sobe; se apanha ruído ou fixa notas a partir de barulho, baixa. A marca branca na barra de nível do
  cabeçalho mostra o limiar actual: a barra fica azul quando o sinal o ultrapassa. Podes **arrastar essa marca**
  (ou focá-la e usar as setas) para ajustar a sensibilidade sem sair do topo da página.
- A **tolerância** (± cents) define a zona verde. 10¢ é um bom ponto de partida; aperta para 5¢ quando estiver fácil.
- Sinal fraco? Sobe o ganho na interface; a barra azul no cabeçalho mostra o nível.
