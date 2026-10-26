# Product

<!-- impeccable:product-schema 1 -->

> Origem: inferido apenas do briefing do usuário (que optou por pular perguntas). Itens marcados **[suposição]** não foram confirmados.

## Platform

web

## Stack

Definida pelo usuário no briefing: React + Vite + TypeScript (strict) + Tailwind + globe.gl (Three.js). 100% estático/client-side, GitHub Pages, sem backend e sem chave de API.

## Users

- **Primário [suposição]:** recrutadores, gestores técnicos e pessoas de empresas avaliando o portfólio do autor (Herick Silva). Abrem o link por ~30–60 s e decidem se o autor sabe integrar dados reais e entregar UX/visual de qualidade.
- **Secundário [suposição]:** público curioso/educacional (estudantes, jornalistas, brasileiros atentos a queimadas e clima) que quer ver "o que está acontecendo no planeta agora".

## Product Purpose

Mostrar o planeta em tempo (quase) real num globo 3D interativo: terremotos (USGS), eventos naturais abertos (NASA EONET) e focos de queimadas no Brasil (INPE). Ao clicar em qualquer ponto, mostra clima atual e qualidade do ar (Open-Meteo). Sucesso: o visitante entende em segundos o que está vendo, explora, e conclui que os dados são reais e a engenharia é sólida.

## Positioning

Une feeds globais de eventos naturais com o dado brasileiro de focos de calor do INPE e com consulta pontual de clima/qualidade do ar, tudo direto no navegador, sem backend nem chave — algo que um painel genérico de terremotos não entrega.

## Operating Context

Visto em desktop e celular, em portfólio no GitHub Pages. Dados atualizados a cada 5 min enquanto a aba está visível. APIs públicas sem SLA: qualquer fonte pode falhar de forma independente.

## Capabilities and Constraints

- Camadas: terremotos (janela 24h/7d, magnitude mínima), eventos EONET abertos (por categoria), focos INPE (hexbin) com contagem por estado.
- Clique no globo → clima atual, previsão de 24h, US AQI, PM2.5/PM10.
- Insights automáticos, lista de eventos navegável por teclado, fallback sem WebGL.
- Sem dados fictícios: tudo com fonte e "atualizado há X". Idioma da UI: pt-BR.
- Sem chaves, sem backend, sem CDN em runtime; CSP restrita.

## Brand Commitments

Nenhuma identidade prévia. Autor: Herick Silva (apenas na licença/README). Nome do produto: **Terra ao Vivo**.

## Evidence on Hand

Respostas reais das APIs verificadas em 2026-10-26 (USGS, EONET, INPE CSV, Open-Meteo). Não há depoimentos, clientes, métricas de uso ou benchmarks — nada disso deve ser inventado.

## Product Principles

1. **Dado real, sempre rotulado** — fonte, horário e limitações visíveis; nada de números decorativos.
2. **O globo lidera** — a interface recua; o planeta é o conteúdo.
3. **Falha parcial não derruba o todo** — cada camada degrada sozinha com aviso discreto.
4. **Acessível por construção** — o canvas nunca é o único caminho para a informação.
5. **Leve e honesto** — primeiro paint rápido, peso do bundle controlado e medido.

## Accessibility & Inclusion

Contraste adequado, foco visível, navegação por teclado, `prefers-reduced-motion` respeitado, cores de categoria distinguíveis para daltonismo, alternativa textual ao canvas.
