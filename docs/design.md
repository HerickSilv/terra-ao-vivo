# Decisões de design e de engenharia

Este documento registra o que foi escolhido, por quê, o que foi descartado e o que ainda é limitação.
É a referência para quem quiser avaliar as escolhas.

## 1. Produto e direção visual

- **Prancha de atlas, não painel.** O globo é a prancha: moldura fina com marcas de grau, oceano em tinta azul,
  terra em ardósia e legenda como chave de mapa. Foi recusado o visual "HUD neon com cards em grade", que é o
  padrão de quase todo painel de dados em 3D.
- **O globo lidera.** Os painéis são margem: ocupam as bordas no desktop e empilham abaixo do globo no celular.
- **Tipografia auto-hospedada.** Sofia Sans Extra Condensed (títulos e cifras) e Alegreya Sans (texto), via
  `@fontsource`. Sem CDN de fonte. Uma fonte de sistema para o título seria o caminho fácil e foi descartada.
- **Cor pelo fenômeno, não pela fonte.** Ouro = terra sólida (sismos), ciano = água e ar (tempestades), brasa =
  fogo (focos INPE, incêndios EONET). Validado com `validate_palette.js` (modo escuro, superfície #061324):
  todos os critérios passam para os três matizes (lightness, croma, ΔE de daltonismo ≥ 19, contraste ≥ 3:1).
  - Vulcões e gelo **não** entraram na paleta categórica. O rosa para vulcão foi reprovado (ΔE 11,8 com a brasa,
    abaixo do piso de 15 na visão normal) e o violeta foi reprovado (ΔE 3,6 com o ciano em deuteranopia).
    Ambos viraram forma neutra: triângulo para vulcão, losango para gelo.
- **Dados sempre com fonte e horário.** Cada cifra, camada e painel mostra a fonte e "atualizado há …".
  Não há número decorativo nem dado de exemplo na interface.

## 2. Arquitetura

- **Front-end estático** (React, Vite, TypeScript estrito). Sem backend e sem chave de API.
- **Focos de queimada pelo ETL Python** (`etl/`). O CSV diário do INPE tem 4 a 5 MB. O ETL agrega numa grade de
  0,1° e publica um JSON de ~30 KB. O navegador não baixa o CSV inteiro, e o agregado é validado antes de
  publicar: soma das células igual ao total e última detecção com no máximo 24 h.
- **Escrita atômica** do `focos.json`: um dado quebrado nunca substitui o anterior.
- **Validação na fronteira.** Toda resposta externa passa por Zod (TS) ou pela checagem do ETL. Item inválido
  é descartado; formato geral inesperado degrada só aquela camada, com mensagem.
- **Camadas independentes.** Cada fonte carrega sozinha, mantém o último dado bom em caso de falha e oferece
  "Tentar de novo". A falha de uma não derruba as outras.
- **Carregamento preguiçoso do globo.** `globe.gl` (com Three.js) é a parte pesada e carrega depois da prancha.

## 3. Escolhas técnicas

| Escolha | Motivo | Alternativa descartada |
|---|---|---|
| `globe.gl` | Pontos, hexbin, polígonos e trajetórias prontos, sobre Three.js | Three.js puro (muito código de cena) e Cesium (pesado) |
| Hexbin nativo do `globe.gl` para os focos | ~14 mil focos viram hexágonos legíveis; a cor sobe com a contagem | Um ponto por foco (ilegível e pesado) |
| Terminador dia/noite com shader próprio | É o momento de assinatura: mostra o tempo real sobre a prancha | Textura noturna fixa (não mostra a hora atual) |
| `subsolarPoint` (Meeus simplificado) | Erro abaixo de 0,1°, suficiente para um globo | Biblioteca de astronomia (dependência à toa) |
| Zod para validar | Schema e tipo saem da mesma fonte | Checagens manuais (frágeis) |
| `i18n-iso-countries` + `world-atlas` 110 m | Nome de país em português e clique em país | Geocodificação reversa por API (serviço e cota) |
| Ray casting próprio para ponto em polígono | Pouco código e sem dependência | `d3-geo` (dependência só para isso) |
| Lockfiles `package-lock.json` e `uv.lock` | Builds reprodutíveis | Sem lockfile |

## 4. Segurança

- **CSP por `<meta>`**, injetada só no build: `script-src 'self'`, `connect-src` com os quatro hosts exatos,
  `img-src 'self' data: blob:`, `object-src 'none'`, `form-action 'none'`.
- **Exceção consciente: `style-src 'self' 'unsafe-inline'`.** O `globe.gl` injeta blocos `<style>` em tempo
  de execução. Sem a exceção, a CSP bloqueia e o console mostra erro, e não há como listar os hashes no build.
  Os scripts continuam sem `unsafe-inline`. O risco residual é injeção de CSS, que não executa código.
- **Sem `dangerouslySetInnerHTML`** (regra no ESLint). Textos vindos das APIs passam por `esc()` antes de
  entrar no HTML das etiquetas do globo.
- **Links só `https:`** (`safeHttpsUrl`), com `rel="noopener noreferrer"`.
- **Nenhum segredo.** As APIs usadas não exigem chave. O ETL envia um `User-Agent` descritivo e faz retry com
  backoff.
- **Workflows com `permissions` mínimas.** O deploy usa `pages` e `id-token` só no job de publicação.
- **Dependabot** para npm, uv e GitHub Actions.

## 5. Acessibilidade

- O canvas do globo tem `role="img"` e um resumo textual. A **lista** de sismos e eventos é o caminho equivalente
  e completo, com botões em ordem de teclado.
- Atalhos `1`, `2` e `3` alternam as camadas; `Esc` fecha o detalhe.
- Ao selecionar um ponto, o foco vai para o painel de detalhes, que é anunciado por leitor de tela.
- O gráfico de temperatura tem legenda textual (mínima e máxima) e uma tabela recolhível com todas as horas.
- `prefers-reduced-motion`: sem giro automático, sem transição de câmera e sem entrada animada.
- Sem WebGL, a mesma leitura aparece em lista, com as mesmas fontes e horários.

## 6. Descartados

- **Rosa ou violeta para vulcões**: reprovados na validação (seção 1).
- **Modal para o detalhe**: o painel lateral mantém o globo visível, que é o ponto da prancha.
- **Autorrotação permanente**: distrai da leitura e incomoda quem usa leitor de tela. Gira só enquanto o
  visitante não interage, e nunca com movimento reduzido.
- **Geocodificação reversa**: o nome do país vem da geometria local, sem serviço externo.

## 7. Limitações conhecidas

- **Peso do bundle.** O chunk do globo tem ~1,9 MB sem compressão (~546 KB gzip), quase todo `three` e `globe.gl`.
  Ele carrega depois da prancha, e o aviso de tamanho do Vite continua ativo de propósito.
- **Imagens de fundo.** `earth-day.jpg` e `night-sky.png` vêm de `three-globe/example/img`. Antes de publicar,
  confirme a licença de cada imagem na origem. O `night-sky.png` tem ~900 KB e não foi convertido, porque não há
  conversor de imagem disponível neste ambiente.
- **Países sem nome oficial em português** aparecem sem rótulo.
- **Clique no oceano** mostra clima sem nome de país. Em trechos sem estação, a API pode não ter leitura.
- **Focos INPE** são detecções de satélite, com erro de posição e de classificação (há fogo industrial).
  Não medem área queimada.
- **Sismos do USGS**: a magnitude é preliminar nas primeiras horas.
- **Eventos EONET**: a posição é a última observação. Incêndios e tempestades podem ter trajetória.
- **Atualização**: o ETL roda de hora em hora no GitHub Actions. O GitHub não garante o horário exato do cron.
- **Testado só em Chrome headless** com WebGL por software. Navegadores reais com GPU e Safari não foram testados.

## 8. Verificação executada

- `npm run lint`, `npm run typecheck`, `npm test` (37 testes) e `npm run build`: passando.
- `ruff check`, `ruff format --check` e `pytest` (9 testes) no `etl/`: passando.
- `npm audit`: 0 vulnerabilidades.
- Capturas desktop 1440×900 e celular 390×844 em `vite preview` (porta 4172), com clique real num país e
  consulta ao Open-Meteo: sem erros de console, inclusive de CSP.
- Caminho sem WebGL verificado com Chrome sem APIs 3D.
