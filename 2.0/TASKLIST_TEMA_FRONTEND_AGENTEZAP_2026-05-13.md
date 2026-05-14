# Tasklist - Novo tema frontend AgenteZap - 2026-05-13

## Objetivo

Implementar o novo tema frontend do AgenteZap usando como referencia a pasta `C:\Users\rodri\Downloads\agentzap---plataforma-de-agentes-ia (6)`, preservando todas as funcionalidades existentes, o codigo canonico atual e o deploy incremental da VPS monolitica.

## Data e workspace

- Data: 2026-05-13
- Workspace autoritativo: `C:\Users\rodri\Downloads\agentezap\vvvv\vvvv\2.0`
- Fonte canonica de codigo: `2.0/agentezap-vercel/source`
- Tema de referencia: `C:\Users\rodri\Downloads\agentzap---plataforma-de-agentes-ia (6)`
- Backup solicitado: backup completo do sistema atual em `C:\Users\rodri\Downloads`, fora da pasta `2.0`, antes de editar o tema atual.

## Sistemas e arquivos provaveis

- `AGENTS.md`
- `memory/2026-05-13.md`
- `enciclopedia/session-logs/2026-05-13.md`
- `agentezap-vercel/source/client/src/**`
- `agentezap-vercel/source/package.json`
- `agentezap-vercel/source/tailwind.config.*`
- `agentezap-vercel/source/client/src/index.css` ou CSS equivalente
- Scripts de build/deploy app-only da VPS monolitica, se a validacao local ficar segura.

## Riscos

- Perder funcionalidades existentes ao substituir componentes inteiros por um tema estatico.
- Desatualizar a VPS publicando imagem anterior a `agentezap-app:date-brasil-temporal-v106-20260513192541`.
- Quebrar rotas, hooks, estados, mutacoes ou permissao de telas reais.
- Introduzir textos visiveis com termos internos ou mojibake.
- Fazer deploy que toque sessoes WhatsApp, volumes, gateway legado ou `ssl`.
- Duplicar trabalho ja feito por outro chat ou sobrescrever patch recente.

## Criterios de conclusao

- Backup completo criado em `Downloads` com a data de hoje antes das edicoes.
- Contexto de memoria, Obsidian/wiki, system-mirror, Graphify/Serena e pesquisa externa registrado.
- Tema visual aplicado sobre os componentes existentes, sem remover logica funcional.
- Build local passa; testes/checagens relevantes executados.
- Validacao visual das telas principais com conta real quando necessario.
- Deploy app-only incremental feito somente sobre a imagem ativa correta, se for seguro.
- VPS final `healthy`, `/healthz` e `/api/health` OK, sessoes preservadas.
- Mensagem final enviada para `17991956944` via AgenteZap, e grupo oficial tratado conforme regra do workspace.
- Obsidian, memoria e esta tasklist atualizados com resultado, validacoes e pendencias.

## Contexto consultado

- [concluido] Workspace confirmado em `C:\Users\rodri\Downloads\agentezap\vvvv\vvvv\2.0`.
- [concluido] `AGENTS.md` lido: fonte canonica atual e `agentezap-vercel/source`; deploy alvo e VPS monolitica app-only; `gateway-wapi` e legado; nao limpar sessoes/auth state.
- [concluido] `SOUL.md` e `USER.md`: ausentes na raiz `2.0`.
- [concluido] `MEMORY.md` lido: preservar monolito, Obsidian obrigatorio, Graphify/Serena e anti-loop entre chats.
- [concluido] Memorias lidas: `memory/2026-05-13.md`, `memory/2026-05-12.md`, `memory/2026-05-11.md`.
- [concluido] Obsidian direto: `enciclopedia/hot.md`, `enciclopedia/wiki/index.md`, `enciclopedia/session-logs/2026-05-13.md`.
- [concluido] Obsidian CLI: indisponivel porque o app Obsidian nao estava aberto; fallback oficial usado por leitura/escrita direta de Markdown.
- [concluido] Buscas direcionadas em memoria, tasklists e `enciclopedia/system-mirror` por tema/frontend/design/deploy incremental.
- [concluido] Achado: nao apareceu tentativa anterior relevante de novo tema nesta pasta de referencia; apareceu, sim, regra forte ja existente de mesmo codigo/deploy incremental e estado quente mais recente v108 (`agentezap-app:toldos-rental-payment-v108-20260513212048`), preservando v95/v97/v101/v103/v104/v106/v107/v108.
- [concluido] Graphify app consultado para `dashboard`, `sidebar`, `chat-area`, `conversations-list` e componentes de UI. Conclusao: as telas sensiveis estao ligadas a hooks/realtime/mutacoes; a troca de tema deve ficar em tokens/classes e nao substituir componentes inteiros.
- [concluido] Serena ativado em `agentezap-vercel/source`; overview de `client/src/components/ui/sidebar.tsx` e `client/src/components/brand-mark.tsx` consultado.
- [concluido] Pesquisa externa atual em fontes oficiais/GitHub/forums sobre stack real do frontend.
  - shadcn/ui theming: recomenda CSS variables/tokens sem reescrever classes de componente.
  - shadcn/ui sidebar: confirma `isActive`, variaveis de sidebar e controle por `useSidebar`.
  - React docs: preservar estado mantendo componentes na mesma posicao; evitar troca de arvore/keys desnecessaria.
  - Vite docs: assets importados entram no grafo de build; nao adicionar assets externos desnecessarios do tema.
  - GitHub/forum: reforcou cautela com sidebar + CSS variables e uso de variaveis para tema global.
- [concluido] Conclusao do contexto: tema de referencia e uma demo estatica com React 19/Tailwind 4 e mojibake; portaremos apenas linguagem visual (neutros, bordas, sidebar, marca, bolhas de chat) sobre o app real React 18/Tailwind 3.

## Plano de execucao

- [concluido] Registrar inicio no Obsidian/session-log antes de edicoes praticas.
- [concluido] Tentativa incorreta de backup amplo interrompida/removida: `C:\Users\rodri\Downloads\agentezap-2.0-backup-2026-05-13.zip` pegava artefatos antigos e nao era o backup certo para esta tarefa.
- [concluido] Atualizar `AGENTS.md` com regra duradoura para mudancas de tema/frontend: backup enxuto, fonte canonica, preservar logica funcional e deploy incremental sobre imagem atual.
- [concluido] Fazer backup enxuto do codigo atual que realmente alimenta a VPS em `Downloads`, excluindo artefatos antigos, temporarios, releases, `node_modules`, `dist`, Graphify e envs locais.
  - Backup final: `C:\Users\rodri\Downloads\agentezap-vps-current-code-backup-2026-05-13.zip`
  - Tamanho: `225727148` bytes
  - Validacao: zip aberto com sucesso, `1454` entradas; varredura sem `tmp*`, `validation-*` ou `.temp`.
- [concluido] Inventariar o tema de referencia e o frontend atual.
- [concluido] Pesquisar stack/bibliotecas reais do frontend em fontes atuais.
- [concluido] Mapear telas/componentes principais e escolher estrategia de migracao visual sem trocar contratos funcionais.
- [concluido] Aplicar tema em camadas: tokens/CSS/layout/componentes, preservando hooks, rotas e mutacoes.
  - Arquivos tocados: `client/src/index.css`, `client/src/components/ui/sidebar.tsx`, `client/src/components/brand-mark.tsx`, `client/src/pages/dashboard.tsx`, `client/src/components/conversations-list.tsx`, `client/src/components/chat-area.tsx`.
  - Escopo: tokens neutros, sidebar estilo referencia, marca preta com bot, lista/conversa com superfícies brancas e bolhas WhatsApp; sem substituir hooks, rotas, chamadas API, mutacoes ou handlers de envio.
- [concluido] Rodar format/build/testes relevantes.
  - `npm run build` passou.
  - Avisos vistos: npm config antigo, PostCSS `from`, `/grid.svg` e chunk grande; ja existiam como padrao do projeto e nao bloquearam build.
  - `npm run start` local nao subiu por resolucao local do pacote Baileys com Node 24 (`@whiskeysockets/baileys/index.js`), sem relacao com o tema. Nao mexido.
- [em_andamento] Validar visualmente rotas principais em desktop/mobile.
  - Preview estatico local em `http://127.0.0.1:5014/`; screenshot de espera renderizada em `agentezap-vercel/source/validation-screenshots/theme-local-desktop-wait-2026-05-13.png`.
  - Dashboard autenticado sera validado em producao apos deploy, porque depende do backend real.
- [pendente] Atualizar Graphify apos mudanca relevante.
- [em_andamento] Fazer deploy app-only incremental somente se build/validacao local estiverem seguros.
  - SSH local via `npm run vps:status` falhou por autenticacao do script antigo; nao insistir por esse caminho.
  - Workflow artifact mais recente consultado via GitHub API: run `25836694111`, branch `codex/mauricio-concrete-opening-v109-clean`, concluido com sucesso em `2026-05-14T01:43:58Z`.
  - Artefato novo criado como delta publico pequeno: `2.0/tmp-deploy-frontend-theme-v111-20260513225623.tgz` (`~2 MB`), contendo `deploy_remote.sh`, `public/index.html`, `sw.js`, manifest/PWA version e assets JS/CSS/fontes necessarios.
  - Primeira tentativa de workflow `25837214012` abortou corretamente antes de trocar o app: a VPS ja estava em `agentezap-app:agendamento3-sync-token-v110-20260513225124`, healthy, restart `0`, sessoes `305/305`.
  - Artefato rebaseado para usar como base esperada `agentezap-app:agendamento3-sync-token-v110-20260513225124` e conferir marcadores de v104/v106/v107/v108/v109/v110 antes/depois do delta visual. Se a VPS estiver em outra imagem, o script aborta sem trocar o app.
  - Segunda tentativa de workflow `25837408783` tambem abortou corretamente antes de trocar o app: outro deploy publicou `agentezap-app:agendamento3-agent-test-v111-20260513230011`, healthy, restart `0`, sessoes `304/304`.
  - Novo artefato sequencial criado como `2.0/tmp-deploy-frontend-theme-v112-20260513231000.tgz`, tag `agentezap-app:frontend-theme-v112-20260513231000`, derivada da imagem ativa `agentezap-app:agendamento3-agent-test-v111-20260513230011` e preservando o marcador `Agendamento 3.0 direct simulator fallback`.
  - Workflow `25837498498` abortou durante a checagem pre-deploy por marcador literal especifico ausente na imagem ativa. Ajuste seguro: manter a exigencia da tag ativa `agentezap-app:agendamento3-agent-test-v111-20260513230011` e dos marcadores funcionais gerais, mas remover esse grep literal; o delta continua copiando apenas `/app/dist/public` sobre a imagem ativa.
  - Retry `25837652824` abortou antes do build no marcador literal `freebusy.query`, tambem ausente na imagem ativa atual. Ajuste: remover esse grep literal sem alterar o modelo de seguranca principal (`FROM imagem ativa exata` + `COPY public /app/dist/public` + health/sessoes).
- [pendente] Validar producao e enviar aviso para Rodrigo em `17991956944`.
- [pendente] Atualizar memoria, Obsidian e resumo final.

## Rollback/recuperacao

- Backup completo em `Downloads` sera a referencia de restauracao local.
- Usar `git diff` e tasklist para reverter somente edicoes desta tarefa, sem tocar mudancas de outros chats.
- Se deploy falhar, restaurar imagem ativa anterior validada v108 e registrar o ocorrido; nunca limpar sessoes/auth state.
- Se validacao visual mostrar perda funcional, interromper deploy e manter alteracao local ate corrigir.

## Status geral

em_andamento
