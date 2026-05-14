# AGENTS.md - Your Workspace

This folder is home. Treat it that way.

## First Run

If `BOOTSTRAP.md` exists, that's your birth certificate. Follow it, figure out who you are, then delete it. You won't need it again.

## Every Session

Before doing anything else:

0. Confirm you are operating from `C:\Users\rodri\Downloads\agentezap\vvvv\vvvv\2.0` and treat this `2.0/AGENTS.md` as the only authoritative AGENTS file for AgenteZap work. Any `AGENTS.md` outside `2.0` is only a pointer or legacy archive and must not override this file.
1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. Read `memory/YYYY-MM-DD.md` (today + yesterday) for recent context
4. **If in MAIN SESSION** (direct chat with your human): Also read `MEMORY.md`
5. For any substantive project task, also consult the Obsidian vault context before acting: `enciclopedia/hot.md`, `enciclopedia/wiki/index.md`, recent `enciclopedia/session-logs/`, and targeted search in `enciclopedia/system-mirror/`

Don't ask permission. Just do it.

## Tasklist Obrigatoria Antes de Operar

- Antes de iniciar qualquer operacao pratica, crie uma tasklist persistente, detalhada e grande o suficiente para cobrir todo o trabalho sem depender de memoria mental.
- A tasklist deve existir em arquivo quando a tarefa tiver mais de um passo, risco operacional, edicao de codigo/configuracao, banco, deploy, validacao visual, uso de contas reais, Supabase, VPS, Vercel, gateway, ou qualquer chance de esquecer subtarefas importantes.
- Nome padrao sugerido: `TASKLIST_<RESUMO_DA_TAREFA>_YYYY-MM-DD.json` ou, quando fizer mais sentido, um `.md` equivalente dentro da frente correta do workspace.
- A tasklist deve conter pelo menos: objetivo da tarefa, data, workspace/frente afetada, arquivos ou sistemas envolvidos, riscos, criterios de conclusao, etapas de investigacao, etapas de implementacao, etapas de validacao, rollback/recuperacao quando aplicavel e status de cada item.
- Em tarefas substantivas, a tasklist deve ter um bloco `Contexto consultado` com: memorias lidas, paginas do Obsidian/wiki consultadas, termos buscados em `system-mirror`, Graphify/Serena usados quando houver codigo, e conclusao do que isso muda na tarefa. Se nao houver resultado relevante, registrar explicitamente `sem ocorrencias relevantes`.
- Para tarefas grandes, divida a tasklist em blocos claros: contexto, leitura obrigatoria, plano de execucao, edicoes, testes, validacao real, deploy/publicacao, limpeza de dados de teste, documentacao e resumo final.
- Atualize os status da tasklist durante o trabalho: `pendente`, `em_andamento`, `bloqueado`, `concluido` ou equivalente. Nao deixe tudo para marcar no fim.
- Se aparecer uma nova descoberta, risco, arquivo afetado ou decisao importante, adicione isso na tasklist imediatamente para nao depender de lembranca.
- Se a tarefa for muito pequena e nao justificar arquivo separado, ainda assim mantenha uma checklist explicita no raciocinio operacional antes de agir; porem, qualquer operacao com escrita em arquivo, banco, deploy ou validacao real deve ter tasklist persistente.
- Ao finalizar, confira a tasklist contra o resultado entregue e registre no resumo final o que ficou concluido, o que foi validado e qualquer pendencia real.

## Registro Obsidian Antes/Depois

- Para qualquer tarefa substantiva, especialmente quando houver codigo, banco, VPS, deploy, Supabase, IA, funil, follow-up, conversa real ou risco de outro chat continuar o trabalho, registrar no Obsidian antes de editar: objetivo, tasklist criada, arquivos/sistemas provaveis, riscos de colisao entre chats, plano de validacao e criterio de conclusao.
- O registro padrao deve ir em `enciclopedia/session-logs/YYYY-MM-DD.md`; quando a decisao for duradoura, tambem atualizar a pagina wiki correspondente ou `enciclopedia/hot.md`.
- Durante o trabalho, manter a tasklist como fonte operacional de status. O Obsidian deve receber os marcos que outro chat precisa para continuar sem adivinhar: diagnostico, causa real, patch aplicado, deploy/tag/artefato, testes e pendencias.
- Quando o usuario pedir continuidade entre chats, acompanhamento por Obsidian ou cuidado para nao desatualizar a VPS, registre no Obsidian antes de editar qual e o codigo canonico, qual deploy/frente deve ser preservado, o que ja foi verificado e o ponto exato para outro chat continuar sem repetir trabalho.
- Depois de finalizar, registrar no Obsidian o resultado: o que mudou, onde mudou, como foi validado, se houve deploy, estado das sessoes/conexoes, e o que nao fazer de novo.
- Se a tarefa for interrompida, deixe no Obsidian e na tasklist o ponto exato de parada antes de encerrar.
- Antes de implementar algo que possa ja ter sido feito por outro chat, buscar no Obsidian/session-logs/system-mirror e na memoria por termos do problema; se encontrar trabalho relacionado, continuar sobre o mesmo codigo canonico em vez de criar frente paralela ou repetir a solucao.
- Quando houver mais de um chat trabalhando em paralelo ou risco de deploy/app-only sobrepor outro ajuste, registre antes e depois no Obsidian e na tasklist: qual codigo canonico foi editado, qual frente ficou intocada, qual artefato/tag foi publicado, o que outro chat deve preservar e o que ainda falta validar. O objetivo e permitir que um trabalho continue em cima do outro sem desatualizar a VPS nem desfazer correcao recente.
- Regra explicita anti-duplicidade/anti-desatualizar VPS: antes de qualquer tarefa substantiva, busque em Obsidian, memorias e tasklists recentes se aquilo ja foi feito, tentado, validado ou revertido. Registre no Obsidian antes de editar de onde esta continuando, qual e o codigo canonico, quais chats/patches precisam ser preservados e qual deploy incremental sera usado. Depois de terminar, registre o que mudou, o que foi validado, o que ficou pendente e o ponto exato para outro chat continuar por cima do mesmo codigo sem criar frente paralela nem fazer deploy que volte a VPS para um estado antigo.
- Quando o usuario reforcar continuidade entre chats, "mesmo codigo" ou "nao desatualizar a VPS", trate como requisito explicito: antes de editar, consulte Obsidian/memorias/tasklists, registre o plano no Obsidian, edite somente a fonte canonica, publique apenas incremento gerado dela e deixe no Obsidian/tasklist o ponto exato para o proximo chat continuar por cima.
- Quando o usuario pedir que outros chats acompanhem pelo Obsidian ou diga que um ajuste deve ser feito "um em cima do outro", registre no Obsidian antes e depois de agir, cite a tasklist ativa, diga exatamente qual codigo canonico foi alterado, qual imagem/tag ativa precisa ser preservada, quais validacoes passaram e qual e o proximo ponto de continuidade. Nao deixe continuidade apenas no chat atual.
- Quando uma tarefa voltar pelo mesmo cliente, mesma conversa ou mesma reclamacao apos um fechamento anterior, trate como reabertura: leia a tasklist e o Obsidian anteriores, identifique exatamente o ponto novo que ainda falha, continue sobre o mesmo codigo canonico e registre por que a nova mudanca preserva o deploy/patch ja validado. Nao refaca a solucao do zero nem publique imagem antiga para "isolar" o problema.
- Quando a tarefa envolver o motor de IA/AI SDK, nao transforme falha de orquestracao em prompt global engessado. Primeiro confirme contexto entregue, estado da conversa, ferramentas disponiveis, chamadas executadas, side effects no banco e resposta real; ajuste por contrato estruturado, prompt/config do tenant ou ferramenta do modulo ativo, preservando outros clientes.

## Mudancas de Tema e Frontend

- Antes de trocar tema/layout visual, faca backup enxuto fora do workspace somente do codigo deployavel atual e da infra minima necessaria para a VPS, nao do workspace inteiro com `node_modules`, `dist`, `tmp-*`, releases antigas, artefatos de deploy, Graphify, validacoes antigas, secrets ou envs reais.
- Mudanca de tema e frontend deve ser feita em cima dos componentes, hooks, rotas e contratos existentes no codigo canonico `2.0/agentezap-vercel/source`; nao substituir telas funcionais por mockup estatico nem remover mutacoes, permissoes, realtime, upload, envio WhatsApp, billing, IA, funil, agendamento ou estados ja validados.
- Ao integrar layout vindo de outra pasta, primeiro inventariar o tema de referencia e mapear quais partes sao apenas estilo/tokens/assets. Migrar visual em camadas pequenas, preservando a logica atual e validando telas principais antes de deploy app-only incremental.
- Se houver outro chat ou patch recente, o novo tema deve nascer sobre a fonte canonica atual e a imagem ativa mais recente; nunca publicar bundle antigo para "isolar" visual, porque isso pode desatualizar a VPS e apagar correcoes recentes.

## Pesquisa Externa Antes de Implementar

- Antes de tarefa tecnica substantiva, pesquise contexto externo atual quando houver biblioteca, framework, deploy, infra, API, protocolo, erro de runtime, comportamento de ferramenta ou padrao operacional envolvido.
- Priorize fontes primarias: documentacao oficial, repositorios GitHub oficiais, issues relevantes e changelogs. Use foruns/comunidade quando o problema for operacional, erro pratico ou comportamento pouco documentado, mas nao substitua fonte oficial por palpite de forum.
- Registre na tasklist/Obsidian quais fontes foram consultadas e o que elas mudam na decisao. Se a pesquisa nao trouxer nada aplicavel, registre isso para outro chat nao repetir a mesma busca.
- Nao use pesquisa externa para vazar dados privados do projeto. Pesquise termos genericos, nomes de bibliotecas, mensagens de erro sem segredo, e conceitos tecnicos.

## Arquitetura Atual - Monolito Baileys Tudo Junto

- Decisao posterior e ativa do usuario em 2026-05-08: o AgenteZap deve ser remodelado para uma VPS unica monolitica, com Baileys dentro do proprio sistema. Nao e mais alvo separar por W-API, gateway dedicado, `web/api/worker` ou worker isolado.
- Esta secao tem precedencia sobre regras antigas deste arquivo que falem em `Vercel + gateway`, `gateway W-API`, deploy somente `web/api/worker`, ou manter WhatsApp separado. Essas regras antigas ficam como historico/referencia ate serem removidas ou reescritas.
- Fonte canonica atual: `2.0/agentezap-vercel/source`. Novas correcoes de UI, API, IA, simulador, prompt, funil, follow-up, CRM, Kanban, billing, catalogo, agendamento, jobs e Baileys devem nascer ali.
- `2.0/gateway-wapi` passa a ser legado/referencia. Nao edite nem evolua essa frente salvo pedido explicito do usuario ou necessidade temporaria documentada para migrar dados/comportamento ao monolito.
- Infra alvo: `app` como unico runtime do sistema. Pode existir `ssl`/Caddy apenas como borda HTTPS/TLS para certificado, renovacao e redirecionamento HTTP->HTTPS; nao colocar nele regra de produto, API AgenteZap, IA, jobs, worker, gateway ou Baileys. O app unico deve rodar `SERVICE_MODE=monolith`, `APP_RUNTIME_PROFILE=full`, Baileys local habilitado, `WA_AUTH_STATE_BACKEND=supabase-postgres`, `WA_AUTH_STATE_FILE_MIRROR=true` e `WA_AUTH_STATE_AUTO_MIGRATE=true`.
- Variaveis de arquitetura split nao pertencem ao ambiente monolitico final: `WA_GATEWAY_URL`, `WA_GATEWAY_ROUTE_ALL_BAILEYS=true`, `WA_PUBLIC_INSTANCE_API_ENABLE_ALL_BAILEYS=true`, `DISABLE_LOCAL_WHATSAPP_RUNTIME=true`, `DISABLE_LEGACY_WHATSAPP_RUNTIME=true`, `DISABLE_WHATSAPP_PROCESSING=true` e `APP_RUNTIME_PROFILE=worker`.
- O usuario aceita que deploy reinicie sessoes WhatsApp. Isso nao autoriza apagar sessoes: nunca limpar, recriar, sincronizar com delete ou trocar `/data/agentezap/sessions`, `auth_*`, `creds.json` ou auth state no Supabase/Postgres.
- Antes de cutover/deploy monolitico real, validar build, compose/config, `/healthz`, `/api/health`, login, menus principais, `/conexao`, uma restauracao Baileys, crons/follow-up sem duplicidade e logs sem ownership de gateway.
- Documento vivo no Obsidian: `enciclopedia/wiki/Monolito Baileys tudo junto.md`.

## Texto, Encoding e Mojibake

- Regra forte de data/hora para IA e agendamentos: toda resposta automatica que envolva `hoje`, `amanha`, `depois de amanha`, dia da semana, horario, evento, disponibilidade, lembrete ou agendamento deve usar a data/hora runtime do Brasil em `America/Sao_Paulo`, nao a memoria interna do modelo. O contexto entregue ao motor de IA deve incluir mapa explicito de datas relativas e o sistema nao pode chamar uma data absoluta de "amanha" se ela nao for igual ao mapa runtime.
- Para o motor IA/AI SDK, erro de data/hora deve ser tratado como contrato estruturado/ferramenta temporal deterministica do runtime, nao apenas como regra de prompt. Em `ai@4.x`, use tool/contrato com `maxSteps` limitado e validador final; nao force `toolChoice` globalmente para todos os turnos, porque isso pode gerar loop/custo indevido. Se o turno envolver data, hora, agenda ou evento, o motor precisa receber o resultado runtime de `America/Sao_Paulo` antes de responder.
- Antes de mexer em IA/agendamento por erro de data ou horario, validar pelo menos tres cenarios com data relativa, incluindo o caso do dia atual, o dia seguinte e um dia absoluto que nao seja amanha. Registrar na tasklist/Obsidian o horario de referencia usado e preservar a fonte canonica `agentezap-vercel/source` no deploy incremental.
- Regra de produto para envio manual em conversas: mensagens digitadas pelo dono/atendente/membro e midias manuais (audio gravado, imagem, video e arquivo) devem ter prioridade de realtime e nao podem esperar delay artificial de IA, follow-up, broadcast, anti-ban de automacao ou fila de baixa prioridade. O sistema pode serializar o minimo necessario para nao corromper socket/sessao, mas a experiencia manual deve responder na hora. Delays humanizados ficam para IA, follow-up, disparos em massa e automacoes.
- Regra forte: nunca deixe prompt, codigo, configuracao, seed, catalogo, legenda, payload, mensagem de WhatsApp, texto de UI, central de ajuda, material comercial ou qualquer texto visivel ao cliente com mojibake/caracter quebrado.
- Isso tambem vale para textos internos que a IA usa para responder clientes: prompt base, prompt de follow-up, prompt de simulador, fluxo, automacao, template, system/user message, fallback, erro amigavel, tooltip, placeholder e copy de produto.
- Regra forte de produto: nunca exponha em UI, texto para cliente, central de ajuda, tooltip, placeholder, mensagem, badge, card, toast ou material comercial nomes de implementacao interna como `CLI`, `agentico`, `motor`, `parser`, `parse`, `tool`, `API`, `endpoint`, `freebusy`, nomes de funcoes, nomes de tabelas ou qualquer detalhe tecnico do runtime. Para cliente, traduza isso para beneficio/produto: `Agenda Inteligente`, `Chat inteligente`, `verificacao de disponibilidade`, `sincronizacao com Google`, `fluxo de lembrete`, `resposta do agente`.
- Regra forte de linguagem publica/testes: nunca usar a palavra `Codex` nem nomes de ferramenta interna em testes, mensagens, avisos, prints, simuladores, respostas ao cliente, central de ajuda, grupo oficial ou qualquer conteudo que possa ficar visivel para cliente. O cliente nao deve saber como o ajuste foi desenvolvido nem quais ferramentas, APIs, bibliotecas, modelos, rotas ou deploys foram usados. Se precisar registrar bastidor, registre somente em tasklist, memoria, Obsidian ou resumo tecnico direto ao usuario.
- Se o usuario pedir uma capacidade interna tipo CLI/motor, implemente a capacidade, mas a interface visivel deve continuar com linguagem de produto. Nao crie badges ou textos explicando a tecnica usada por dentro.
- Regra forte para integracoes Google: cada modulo deve ter login, callback OAuth, state, tokens, status e desconexao isolados. Nao reutilize callback ou tabela/token de outro modulo para "fazer funcionar", porque o mesmo cliente pode usar contas Google diferentes em Agenda, Imobiliaria, Formulario Meta, Contatos e outros modulos. O app pode reutilizar client id/secret do projeto Google quando necessario, mas o `redirect_uri`, a persistencia e o fluxo visivel precisam continuar separados por modulo.
- Em qualquer edicao que toque texto, procure sinais como `voc?`, `n?o`, `cat?logo`, `produ??o`, `Ã`, `Â`, `â`, `ð`, `�`, caracteres CJK inesperados ou emoji quebrado. Se aparecerem, corrija antes de concluir.
- Se encontrar mojibake em dado de cliente, prompt, legenda ou conteudo vindo do banco, corrija na origem quando a tarefa permitir. Se a correcao estrutural ainda nao for segura, aplique reparo de exibicao/envio no runtime para nao mandar texto quebrado ao cliente final.
- Nao copie texto quebrado de logs, banco, release antiga, terminal, navegador ou resposta de IA para prompts/codigo sem normalizar. Se precisar manter uma copia historica com mojibake para auditoria, marque como referencia bruta e nunca use como texto enviado ao usuario.
- Antes de deploy ou finalizacao de qualquer mudanca que mexa em texto/prompt, valide pelo menos uma resposta real/simulada ou renderizacao que contenha acentos comuns em portugues e confirme que nao ha mojibake.

## Calibracao de Agentes, Prompts e Midias

- Toda calibracao de prompt, fluxo, funil, media, catalogo, audio, simulador ou agente de cliente deve ler primeiro a conversa real do pedido e buscar no Obsidian/memorias/tasklists se ja houve calibracao anterior para o mesmo cliente, conversa, telefone, email, modulo ou reclamacao. Continue sobre o mesmo codigo canonico e sobre a mesma linha de decisao; nao refaca do zero nem publique imagem antiga para isolar.
- Em calibracao de cliente, testar obrigatoriamente IA agente vs IA cliente com pelo menos 3 perfis de cliente diferentes e cenarios distintos do problema real. Quando a reclamacao envolver midia, audio, PDF, catalogo, fluxo ou JSON, a validacao precisa conferir tambem as acoes/midias persistidas/enviadas, nao apenas o texto da resposta.
- Quando houver simulador publico e simulador autenticado, testar os dois caminhos relevantes: `/api/test-agent/message` e `/api/agent/test` ou o fluxo equivalente da tela. Se so um caminho for testado, registrar a pendencia e nao declarar que esta perfeito.
- Depois de concluir uma calibracao, enviar uma mensagem curta, humana e sem bastidor tecnico na propria conversa do cliente informando que foi ajustado e pedindo para testar novamente. O envio deve ser feito por uma conta autorizada, preferencialmente `agentezapsuporte@agentezap.online` ou `rodrigo4@gmail.com`, conforme acesso disponivel e contexto da conversa.
- Antes de enviar aviso ao cliente ou grupo, reler o texto exatamente como sera enviado e garantir que nao contem mojibake, palavra interna proibida, nome de ferramenta, API, modelo, deploy, rota, endpoint, banco, prompt, parser, runtime ou qualquer detalhe de implementacao. Para cliente, falar apenas em atendimento, agente, ajustes, midias, catalogo, agenda ou beneficio pratico.
## Memory

You wake up fresh each session. These files are your continuity:

- **Daily notes:** `memory/YYYY-MM-DD.md` (create `memory/` if needed) — raw logs of what happened
- **Long-term:** `MEMORY.md` — your curated memories, like a human's long-term memory

Capture what matters. Decisions, context, things to remember. Skip the secrets unless asked to keep them.

### Leitura de Memoria Antes de Agir

- **REGRA DE OURO ANTI-LOOP ENTRE CHATS:** antes de qualquer alteracao em codigo, prompt, configuracao, banco, Supabase, Vercel, VPS, gateway, fila, IA, follow-up, billing, checkout, conexao, sessao WhatsApp ou texto visivel, verifique as memorias de todos os chats recentes antes de mexer. O objetivo e impedir que um chat desprograme, reverta ou enfraqueca uma correcao que outro chat acabou de fazer.
- Janela obrigatoria para alteracoes: ler `memory/YYYY-MM-DD.md` de hoje, ontem e anteontem quando existirem, alem de `MEMORY.md` em main session. Se a tarefa tocar area sensivel ou estiver ligada a bug recorrente, tambem buscar tasklists e docs modificados nos ultimos 2 dias.
- "Todos os chats" significa considerar o que foi registrado nas memorias e tasklists recentes, mesmo que tenha sido feito por outra conversa. Nao confie apenas no historico desta janela de chat.
- Antes de editar, faca busca por termos do assunto nas memorias recentes: nome do cliente, email, telefone, conversation id, rota, arquivo, tabela, modulo, midia, prompt, plano, gateway, conexao, follow-up, checkout, agenda, catalogo ou qualquer palavra do problema.
- Se encontrar correcao recente relacionada, preserve a intencao dela. So mude se houver motivo melhor e explicito; registre na tasklist o que mudou, por que nao quebra a decisao anterior, e como validar que nao voltou o bug antigo.
- Se houver conflito entre memorias de chats diferentes, nao escolha no escuro. Reconstituir a linha do tempo pelos registros, banco/logs/testes quando necessario, e manter a solucao que melhora o sistema sem desfazer comportamento ja validado.
- Quando houver muitas mudancas na semana, crie ou atualize um resumo semanal em `memory/weekly-YYYY-WW.md` com: decisoes que nao podem voltar, areas alteradas, riscos, validacoes reais e pendencias. Esse resumo serve como "blackboard" do sistema para novos chats se orientarem rapidamente.
- Esta regra nao e sobre commit, release, SHA ou historico Git. E sobre continuidade operacional: fazer um chat saber o que os outros chats corrigiram para o sistema evoluir para frente, sem loop de regressao.
- Antes de qualquer tarefa com risco operacional, edicao de codigo/configuracao, banco, Supabase, Vercel, VPS, gateway, conexoes WhatsApp, sessoes, deploy, billing, planos, follow-up, IA, prompts, fluxo, checkout ou validacao visual, leia a memoria recente e procure historico relevante antes de mexer.
- Leitura minima: `memory/YYYY-MM-DD.md` de hoje, ontem e anteontem quando existirem, `MEMORY.md` se existir, tasklists recentes relacionadas ao assunto e, quando houver, docs especificos em `docs/`.
- Nao basta ler o topo do arquivo. Use busca por palavras do problema antes de editar, por exemplo: `conexao`, `connection`, `gateway`, `sessao`, `auth_`, `follow-up`, `prompt`, `plans`, `checkout`, `Supabase`, `Vercel`, `deploy`, nome da rota, email do cliente, conversation id, instance id ou nome do arquivo.
- Se a memoria indicar que uma abordagem ja foi tentada, revertida ou corrigida, entenda o motivo antes de propor ou repetir a mesma solucao. Nao entre em loop desfazendo uma correcao porque parece "mais limpa" sem considerar o contexto que levou a decisao anterior.
- Quando encontrar uma decisao anterior relevante, carregue para a tasklist: qual era o problema, qual foi a decisao, por que aquela decisao foi tomada, quais riscos ela evita e como foi validada. Isso evita que outro chat volte para a logica antiga por falta de contexto.
- Se a memoria estiver ausente ou insuficiente para uma area sensivel, pare o minimo necessario para reconstruir contexto por codigo, banco, logs e docs antes de editar. Depois registre a descoberta para o proximo chat.
- Skill operacional: use `continuity-guard` antes de qualquer tarefa sensivel de codigo, configuracao, banco, deploy, gateway, Supabase, Vercel, billing, checkout, follow-up, IA/prompt, conexao/sessao WhatsApp ou validacao visual. Ela existe para forcar busca de memoria, captura do `porque`, anti-regressao e evidencia de validacao.

### 🧠 MEMORY.md - Your Long-Term Memory

- **ONLY load in main session** (direct chats with your human)
- **DO NOT load in shared contexts** (Discord, group chats, sessions with other people)
- This is for **security** — contains personal context that shouldn't leak to strangers
- You can **read, edit, and update** MEMORY.md freely in main sessions
- Write significant events, thoughts, decisions, opinions, lessons learned
- This is your curated memory — the distilled essence, not raw logs
- Over time, review your daily files and update MEMORY.md with what's worth keeping
- Se `MEMORY.md` nao existir em uma main session, crie um arquivo curto com secoes de decisoes duradouras. Nao espere outra sessao criar.
- Use `MEMORY.md` para fatos que devem mudar comportamento futuro: arquitetura alvo, regras de conexao/gateway/sessoes, escolhas de MCP, credenciais nao devem ser registradas, decisoes de deploy, padroes que causaram regressao, logicas que nao podem voltar, e regras multi-cliente.
- Cada item duradouro deve ter formato pratico: `decisao`, `porque`, `onde se aplica`, `como validar`, `o que nao repetir`. Sem o "porque", outro chat pode desfazer a decisao achando que era erro.
- Nao coloque em `MEMORY.md` detalhes efemeros, logs longos, outputs grandes, tokens, senhas, service role, PAT, URLs secretas, ou historico bruto. Para isso use daily memory, tasklist ou docs privados apropriados.
- Se uma mesma correcao aparece em mais de um dia ou um erro se repete, promova o aprendizado de `memory/YYYY-MM-DD.md` para `MEMORY.md` de forma resumida.

### O Que Vai Em Cada Lugar

- `AGENTS.md`: regras permanentes de operacao. Atualize somente quando a regra deve guiar todo chat futuro; nao registre cada tarefa aqui.
- `memory/YYYY-MM-DD.md`: diario bruto do dia, com diagnosticos, testes, deploys, IDs, conversas, resultados, bloqueios e decisoes tomadas.
- `MEMORY.md`: resumo curado de longo prazo, principalmente o "por que" das decisoes que protegem o sistema contra regressao e loops.
- `TASKLIST_*.md`: plano operacional da tarefa atual, com etapas, riscos, criterios de conclusao, validacao e rollback.
- `docs/`: explicacoes maiores, procedimentos reutilizaveis, auditorias e referencias tecnicas que ficariam grandes demais para `AGENTS.md` ou `MEMORY.md`.

### Registro Obrigatorio de Decisoes

- Quando corrigir algo que outro chat pode querer "arrumar de novo", registre a decisao e o motivo no daily memory; se for duradouro, tambem em `MEMORY.md`.
- Para conexao, gateway, sessoes WhatsApp, Supabase, Vercel, deploy, checkout, billing, follow-up, IA/prompt e regras multi-cliente, sempre registre: sintoma, causa real, arquivo/tabela/servico afetado, solucao escolhida, alternativa rejeitada, motivo da rejeicao e validacao feita.
- Ao finalizar tarefa sensivel, a resposta final deve mencionar qual memoria/tasklist foi atualizada quando isso for relevante para continuidade entre chats.

### 📝 Write It Down - No "Mental Notes"!

- **Memory is limited** — if you want to remember something, WRITE IT TO A FILE
- "Mental notes" don't survive session restarts. Files do.
- When someone says "remember this" → update `memory/YYYY-MM-DD.md` or relevant file
- When you learn a lesson → update AGENTS.md, TOOLS.md, or the relevant skill
- When you make a mistake → document it so future-you doesn't repeat it
- **Text > Brain** 📝

## Safety

- Don't exfiltrate private data. Ever.
- Don't run destructive commands without asking.
- `trash` > `rm` (recoverable beats gone forever)
- When in doubt, ask.

## Contas Reais para Validacao

- Quando precisar acessar o sistema para validar algo, pode usar a conta de usuario `rodrigo4@gmail.com` com a senha `Ibira2019!`.
- Quando precisar acessar o painel admin para validar algo, pode usar a conta admin `rodrigoconexao128@gmail.com` com a senha `Ibira2019!`.
- Essas duas contas sao reais. Tenha cuidado com qualquer edicao, criacao ou exclusao de dados.
- Se criar algo durante um teste, exclua depois. Se alterar algo durante um teste, volte para o estado anterior antes de encerrar.
- Use essas contas somente para validacao necessaria da tarefa em andamento; nao compartilhe, publique ou copie essas credenciais para outros arquivos sem pedido explicito.

## Banco e Supabase MCP

- Para qualquer tarefa que precise consultar, diagnosticar ou alterar banco/Supabase neste projeto, use diretamente o MCP Supabase configurado no Codex antes de recorrer a scripts soltos, SQL manual por credenciais locais ou atalhos antigos.
- Configuracao operacional validada em 2026-04-26 por pedido explicito do usuario: o MCP Supabase deve ficar escopado ao projeto `bnfpcuzjvycudccycqqt`, write-capable, sem `read_only=true`, com `features` restritas a banco/debug/desenvolvimento/docs: `https://mcp.supabase.com/mcp?project_ref=bnfpcuzjvycudccycqqt&features=database,debugging,development,docs`.
- Existem dois lugares importantes de configuracao neste ambiente: `2.0/.codex-home/config.toml` e o `CODEX_HOME` real da sessao (`C:\Users\rodri\Desktop\CodexProjetos\project-homes\2-0-nova-conversa-novo-45\config.toml`). Se o MCP parecer configurado no workspace mas nao aparecer como ferramenta na conversa, confira o `CODEX_HOME` real com `Get-ChildItem Env:CODEX_HOME` e alinhe tambem esse config.
- O `CODEX_HOME` ativo precisa ter `[features].rmcp_client = true`. Depois de alterar MCP/config/login, pode ser necessario iniciar nova sessao Codex, porque ferramentas MCP sao carregadas no inicio da sessao.
- Se o MCP Supabase cair, aparecer como `Auth Unsupported`, nao expor ferramentas ou der erro de refresh de token, rode no `CODEX_HOME` ativo: `codex mcp logout Supabase`, depois `codex mcp login Supabase`, e valide com `codex mcp list` / `codex mcp get Supabase`.
- Validacao real feita em 2026-04-26: `Supabase/list_tables` retornou tabelas como `sessions`, `users`, `admins`, `plans`, `subscriptions`; `Supabase/execute_sql` retornou `198` tabelas no schema `public`; apos remover `read_only=true`, as ferramentas `apply_migration` e `execute_sql` apareceram disponiveis.
- Para diagnosticar lentidao, pool, conexoes, locks e horarios de pico, use as consultas documentadas em `docs/SUPABASE_MCP_E_POOL.md`. Snapshot de 2026-04-26: `max_connections=60`, sem queries ativas acima de 5s, sem `idle in transaction` e sem bloqueios no momento da consulta; portanto investigar picos/intermitencia com novas leituras quando o usuario reportar lentidao.
- Se o OAuth remoto da Supabase continuar instavel, usar um dos fallbacks documentados em `docs/SUPABASE_MCP_E_POOL.md`: MCP remoto com PAT via `--bearer-token-env-var`, servidor local `@supabase/mcp-server-supabase` com PAT, ou MCP Postgres direto write-capable com connection string segura. Nunca grave PAT, senha Postgres ou service role em `AGENTS.md`, tasklists, docs versionados ou comandos finais.
- Como o MCP esta write-capable, antes de qualquer `insert`, `update`, `delete`, `alter`, `drop`, `apply_migration` ou mudanca de configuracao no banco real, confirme que a tarefa pediu alteracao, registre backup/versao/plano de rollback quando aplicavel e respeite as regras multi-cliente. Para diagnostico simples, continue preferindo `select`, logs e advisors.

## MCP e Grafo de Contexto Semantico Local

- Estado atual desde 2026-04-28: Augment/codebase-retrieval fica desativado por padrao para nao gastar saldo nem CPU. Nao reative nem use `codebase-retrieval` sem pedido explicito do usuario.
- Estado atual desde 2026-05-04: o fluxo padrao e `Graphify` MCP para grafo consultavel + `Serena` para navegacao simbolica. `codebase-memory` fica instalado, mas sob demanda.
- `Graphify` esta instalado em `2.0/tools/graphify/.venv`, com wrapper `2.0/tools/graphify/graphify.ps1`. Por pedido do usuario, ficam configurados dois MCPs permanentes: `graphify-app` e `graphify-gateway`.
- Estado atual desde 2026-05-04: por preferencia explicita do usuario, `graphify watch` fica ativo para app e gateway. Controle: iniciar com `tools/graphify/start-watch.ps1`, parar com `tools/graphify/stop-watch.ps1`, verificar com `tools/graphify/status-watch.ps1`. Se o PC ficar lento, pare o watch antes de desativar MCPs.
- MCPs Graphify: `graphify-app` serve `2.0/agentezap-vercel/source/graphify-out/graph.json` via `tools/graphify/serve-app.ps1`; `graphify-gateway` serve `2.0/gateway-wapi/source/graphify-out/graph.json` via `tools/graphify/serve-gateway.ps1`. Depois de alterar config MCP, reinicie o Codex para as ferramentas aparecerem.
- Saidas Graphify atuais: `2.0/agentezap-vercel/source/graphify-out/GRAPH_REPORT.md` e `graph.json`; `2.0/gateway-wapi/source/graphify-out/GRAPH_REPORT.md` e `graph.json`. Antes de abrir muitos arquivos em tarefa ampla, leia o `GRAPH_REPORT.md` relevante.
- Sempre que houver mudanca relevante de codigo, arquitetura, rota, fluxo, gateway ou modulo em `agentezap-vercel/source`, atualize o mapa com `tools/graphify/graphify.ps1 update agentezap-vercel/source`.
- Sempre que houver mudanca relevante de codigo, arquitetura, primitive W-API, sessao, restore, reconnect ou gateway em `gateway-wapi/source`, atualize com `tools/graphify/graphify.ps1 update gateway-wapi/source`.
- Se o watch falhar ou for parado, atualize manualmente com os comandos acima antes de finalizar mudancas relevantes. Nao instale hook automatico sem pedido explicito.
- `Serena` aponta para `2.0/tools/mcp/semantic-context-eval/.venv-serena/Scripts/serena.exe`, com `SERENA_HOME` em `2.0/tools/mcp/semantic-context-eval/serena-home`. Use para simbolos, referencias, outline, refactor e edicao simbolica depois que o arquivo/simbolo provavel foi encontrado.
- `Claude Context` esta instalado localmente em `2.0/tools/mcp/claude-context` como alternativa vetorial tipo Augment, mas fica inativo ate existir uma chave de embedding (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY` ou `VOYAGEAI_API_KEY`). A chave Zilliz/Milvus fica no ambiente do usuario como `MILVUS_TOKEN`; nao registrar segredo em memoria. Para ativar depois de configurar embedding, rode `tools/mcp/claude-context/add-to-codex.ps1` no `CODEX_HOME` desejado e reinicie o Codex. O wrapper `serve.ps1` deixa `CLAUDE_CONTEXT_BACKGROUND_SYNC=false` para nao reindexar/gastar em idle.
- Para reativar `codebase-memory` somente quando uma tarefa realmente precisar do grafo semantico MCP, adicione no `CODEX_HOME` ativo e reinicie a sessao: `codex mcp add codebase-memory --env CBM_CACHE_DIR="C:\Users\rodri\Downloads\agentezap\vvvv\vvvv\2.0\.codex-home\codebase-memory-mcp" -- "C:\Users\rodri\Downloads\agentezap\vvvv\vvvv\2.0\tools\mcp\semantic-context-eval\bin\codebase-memory-mcp\codebase-memory-mcp.exe"`. Depois da tarefa pesada, remova com `codex mcp remove codebase-memory` e reinicie para nao ficar consumindo.
- Regra operacional para codigo: antes de editar tarefa multi-arquivo, arquitetura, rota desconhecida, fluxo de IA, gateway, Supabase/Vercel integration, billing, checkout, follow-up ou comportamento que o agente possa nao entender pelo arquivo atual, use contexto semantico primeiro. Nao comece abrindo arquivos aleatorios.
- Fluxo minimo de contexto antes de editar:
  1. Use `Graphify` (`graphify-app` ou `graphify-gateway`) para localizar comunidade, arquivos centrais, caminhos e dependencias amplas. Se as ferramentas MCP nao aparecerem, leia o `GRAPH_REPORT.md` relevante e/ou use `tools/graphify/graphify.ps1 query`.
  2. Use `Serena` para simbolos, referencias, outline e edicao precisa nos arquivos encontrados.
  3. Use `rg` apenas para strings exatas, identificadores conhecidos, logs, config keys e confirmacao de impacto.
  4. Habilite `codebase-memory` ou `Claude Context` somente sob demanda quando Graphify + Serena nao bastarem para busca semantica ampla.
- Se a tarefa envolver conhecimento acumulado, decisoes, pesquisa externa, padrao de produto, comparativo ou explicacao que pode voltar em outro chat, consulte/alimente tambem a enciclopedia LLM Wiki em `enciclopedia/wiki/`.
- Skill local complementar: `semantic-code-context`, em `2.0/.codex-home/skills/semantic-code-context`, `C:\Users\rodri\.codex\skills\semantic-code-context` e no `CODEX_HOME` ativo. Reiniciar o Codex pode ser necessario para ela aparecer automaticamente.
- Graphify/Serena/codebase-memory nao substituem regras de arquitetura do workspace. Se a tarefa for IA, prompt, simulador, media, CRM, billing ou Vercel/app, investigue em `agentezap-vercel/source`; nao edite gateway por conveniencia de contexto.

## Enciclopedia LLM Wiki + Obsidian

- Estado atual desde 2026-05-06: existe uma enciclopedia local em `2.0/enciclopedia`, registrada diretamente como vault Obsidian `enciclopedia`.
- Estrutura: `enciclopedia/wiki/` para paginas compiladas, `enciclopedia/raw/` para fontes brutas, `enciclopedia/outputs/` para relatorios/planos e `.obsidian/` para configuracao do vault.
- O marketplace `nvk/llm-wiki` foi adicionado ao Codex nos homes conhecidos, e a skill `llm-wiki` tambem foi instalada diretamente em `skills/llm-wiki` para aparecer como skill apos reiniciar.
- Skills Obsidian instaladas: `obsidian-markdown`, `obsidian-cli`, `obsidian-bases`, `json-canvas`, `defuddle`.
- Obsidian Desktop/CLI esta instalado em `C:\Users\rodri\AppData\Local\Programs\Obsidian`; wrapper local: `tools/obsidian/obsidian.ps1`. Em sessoes de chat, nao assuma que `Obsidian.com` esta no PATH do processo; prefira o wrapper.
- CLI validada em 2026-05-06 apos ativacao pelo usuario. O vault conhecido pela CLI e `enciclopedia` em `C:\Users\rodri\Downloads\agentezap\vvvv\vvvv\2.0\enciclopedia`. Para ler a enciclopedia via CLI, use caminhos relativos ao vault, como `wiki/index.md`.
- Em 2026-05-07, a falha das skills nos chats foi corrigida sincronizando `llm-wiki`, `obsidian-cli`, `obsidian-markdown`, `obsidian-bases`, `json-canvas` e `defuddle` para o `CODEX_HOME` ativo e para os project-homes existentes. Controle: `tools/codex/sync-chat-skills.ps1`, `tools/codex/watch-chat-skills.ps1`, `tools/codex/start-chat-skills-watch.ps1`, `tools/codex/status-chat-skills-watch.ps1`, `tools/codex/stop-chat-skills-watch.ps1`.
- Autostart do Windows para manter skills em novos project-homes de chat: `AgenteZapCodexChatSkillsWatch`, configurado por `tools/codex/enable-chat-skills-autostart.ps1` e removivel por `tools/codex/disable-chat-skills-autostart.ps1`. Se uma sessao nova nao mostrar `llm-wiki`/Obsidian nas skills, rode `tools/codex/sync-chat-skills.ps1 -AllProjectHomes`, reinicie o chat e confira `tools/codex/status-chat-skills-watch.ps1`.
- Consulta obrigatoria anti-perda de contexto:
  - Para qualquer tarefa substantiva de projeto, codigo, prompt, banco, deploy, gateway, Vercel, Supabase, billing, follow-up, IA, conexao, validacao visual, pesquisa ou decisao que pode afetar outro chat, consultar Obsidian/wiki ANTES de editar ou concluir.
  - Comece por `enciclopedia/hot.md`, `enciclopedia/wiki/index.md`, `enciclopedia/wiki/Decisoes.md`, `enciclopedia/wiki/Licoes.md` e `enciclopedia/session-logs/YYYY-MM-DD.md` de hoje/ontem quando existirem.
  - Depois faca busca direcionada com termos do pedido em `wiki`, `session-logs` e `system-mirror`. Exemplos: `tools/obsidian/obsidian.ps1 vault="enciclopedia" search query="follow-up" path="wiki"`, `tools/obsidian/obsidian.ps1 vault="enciclopedia" search query="gateway"`, ou `rg -n "follow-up|gateway" enciclopedia MEMORY.md memory TASKLIST_*` se a CLI nao responder.
  - Se a CLI do Obsidian falhar, nao pule a consulta: leia os arquivos Markdown diretamente com shell/`rg`. A obrigacao e consultar o conteudo, nao depender da interface do Obsidian.
  - O resultado da consulta deve aparecer na tasklist ou no resumo operacional: quais paginas/termos foram consultados, o que foi encontrado, e qual regra/decisao antiga precisa ser preservada.
  - Nao finalizar tarefa substantiva dizendo apenas que "usou contexto"; cite a evidencia consultada. Se nada relevante apareceu, registre `Obsidian/wiki consultado: sem ocorrencias relevantes`.
  - Tarefas triviais de conversa podem pular a consulta, mas qualquer escrita em arquivo, banco, config, deploy ou validacao real nao pode pular.
- Como usar:
  1. Consulte primeiro `tools/obsidian/obsidian.ps1 vault="enciclopedia" search query="<termo>" path="wiki"` ou `tools/obsidian/obsidian.ps1 vault="enciclopedia" read path="wiki/<pagina>.md"` quando a tarefa depender de conhecimento acumulado, pesquisa, comparativo de ferramentas, arquitetura explicada, padroes do projeto ou decisoes duradouras.
  2. Escreva conhecimento compilado em `enciclopedia/wiki/` com wikilinks, headings claros e links para fontes. Use `enciclopedia/raw/` para material bruto e `enciclopedia/outputs/` para relatorios/planos.
  3. Use `llm-wiki` para compilar/organizar conhecimento que sera reutilizado por agentes; use `obsidian-markdown` para notas, `obsidian-cli` para consultar/abrir/alterar via CLI, `obsidian-bases` para tabelas/bases, `json-canvas` para mapas visuais e `defuddle` para transformar paginas web em Markdown limpo.
  4. Depois de pesquisa relevante ou decisao que deve sobreviver, alimente a wiki. Depois de decisao operacional que muda como futuros chats devem agir, registre tambem em `MEMORY.md` com `decisao`, `porque`, `onde se aplica`, `como validar`, `o que nao repetir`.
  5. Nao coloque toda nota bruta em `AGENTS.md`. `AGENTS.md` e para regras permanentes de comportamento; LLM Wiki/Obsidian e para conhecimento duravel consultavel.
- A enciclopedia complementa, mas nao substitui, o contexto semantico do codigo. Para programar, use Graphify/Serena primeiro; para lembrar/explicar/compilar conhecimento, use LLM Wiki/Obsidian.
- Registro de chat:
  - Por preferencia explicita do usuario, registrar mais do chat do que apenas decisoes finais. Em toda tarefa substancial, atualizar `enciclopedia/session-logs/YYYY-MM-DD.md` com uma linha cronologica do que o usuario pediu, o que foi feito, arquivos/ferramentas tocados, validacoes e pendencias.
  - Quando o usuario avisar que existe outro chat editando/deployando, registrar no Obsidian antes de mexer: objetivo, arquivos provaveis, riscos de colisao e criterios de conclusao. Ao terminar, registrar tambem o que foi alterado, validado, publicado e qualquer pendencia. Esse registro deve acontecer alem da tasklist, para o outro chat conseguir acompanhar de onde parou.
  - O session log pode ser detalhado, mas nao deve conter segredos, tokens, senhas, cookies, dumps privados ou payloads sensiveis. Quando houver segredo no chat, registrar apenas que foi configurado/recebido, sem o valor.
  - Nao transformar session log em regra. Depois de registrar o historico completo, destilar o que for reutilizavel para `wiki/`, o que for regra operacional para `MEMORY.md`, e o que for instrucao permanente para `AGENTS.md`.
  - Antes de iniciar tarefa nova longa, consulte `enciclopedia/hot.md`, `wiki/index.md`, `wiki/Decisoes.md`, `wiki/Licoes.md` e o session log recente quando o assunto parecer relacionado.
  - Ao encerrar tarefa relevante, rodar mentalmente o "session closer": registrar pedidos do usuario, acoes executadas, decisoes, porques, validacoes, arquivos alterados e proximos riscos.
- Espelho automatico de memoria:
  - `tools/obsidian/sync-memory-to-vault.ps1` copia `AGENTS.md`, `MEMORY.md`, `memory/*.md` e `TASKLIST_*` para `enciclopedia/system-mirror/`, mantendo os originais como fonte da verdade.
  - `tools/obsidian/watch-memory-sync.ps1` observa mudancas nessas memorias e atualiza o espelho automaticamente. Controle: iniciar com `tools/obsidian/start-memory-sync-watch.ps1`, parar com `tools/obsidian/stop-memory-sync-watch.ps1`, verificar com `tools/obsidian/status-memory-sync-watch.ps1`.
  - Autostart do Windows: usar `tools/obsidian/enable-memory-sync-autostart.ps1` para iniciar o watcher automaticamente no login do usuario via `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; remover com `tools/obsidian/disable-memory-sync-autostart.ps1`.
  - Em 2026-05-06 o autostart ativo e `AgenteZapObsidianMemorySyncWatch`. Se o watcher nao aparecer apos reiniciar o PC, rode `tools/obsidian/start-memory-sync-watch.ps1` e revalide o autostart.
  - No Obsidian, consultar `system-mirror/index.md` para navegar pela memoria operacional espelhada. Nao editar `system-mirror/*` como fonte primaria; editar os arquivos originais no workspace.
  - O espelho automatico ajuda o Obsidian a enxergar a memoria do Codex, mas nao substitui a leitura obrigatoria direta de `AGENTS.md`, `MEMORY.md` e `memory/` no inicio das tarefas.
- Padrao de uso da wiki:
  - Nao despejar tudo no vault. Registrar somente conhecimento destilado que deve ser reutilizado; logs brutos e fontes longas ficam em `raw/`, nao em paginas principais.
  - Criar notas pequenas e focadas quando o assunto voltar com frequencia. Se a nota ficar grande demais, dividir em subnotas e linkar.
  - Usar wikilinks intencionais (`[[AgenteZap]]`, `[[Contexto Semantico]]`, `[[Gateway W-API]]`) para criar backlinks uteis. Nao auto-linkar palavra comum so para encher o grafo.
  - Manter paginas indice/MOC em `wiki/index.md` e, quando necessario, paginas por area: `Arquitetura`, `Contexto Semantico`, `Deploy`, `Gateway W-API`, `Billing`, `IA e Prompt`, `Supabase`, `Vercel`.
  - Preferir backlinks, busca e local graph para contexto pratico. O graph global serve para detectar clusters/orfaos e revisar organizacao, nao para decidir codigo.
  - O graph global pode ficar poluido porque `system-mirror/` espelha muitas tasklists/memorias. Isso e esperado. Para leitura limpa, use filtros de busca no Graph/Busca como `-path:system-mirror -path:session-logs` ou foque em `path:wiki`. Para auditar memoria operacional, use `path:system-mirror`.
  - Obsidian/LLM Wiki nao carregam contexto automaticamente dentro do Codex. Eles guardam e organizam a memoria. O agente ainda precisa buscar/ler paginas especificas; isso economiza tokens quando evita redescoberta, mas desperdicara tokens se ler mirrors grandes sem filtro.
  - Quando uma tarefa revelar uma decisao ou padrao, registrar o `porque`, nao apenas o resultado. O motivo evita que outro chat reverta achando que a logica antiga era melhor.
  - Revisar periodicamente notas orfas, duplicadas ou antigas. Se a wiki comecar a confundir, consolidar em uma pagina melhor em vez de criar mais notas soltas.
  - Nunca salvar segredos, tokens, chaves, senhas, cookies, dumps privados ou dados sensiveis de clientes na wiki. Guardar apenas referencias seguras e contexto operacional sem segredo.
- Exemplo de rotina apos uma tarefa:
  - Mudanca pequena e obvia: registrar so no resumo final; nao alimentar wiki.
  - Bug sensivel corrigido: registrar em `memory/YYYY-MM-DD.md`; se virar regra para proximos chats, tambem em `MEMORY.md`.
  - Pesquisa/comparativo/arquitetura que sera reutilizado: criar ou atualizar pagina em `enciclopedia/wiki/`.
  - Fonte bruta ou artigo grande: salvar ou referenciar em `enciclopedia/raw/` e compilar uma pagina curta em `wiki/`.

## Calibracao de Agentes e Multi-Cliente

- Pedido para "calibrar", "ajustar", "melhorar atendimento", "corrigir resposta" ou "treinar" o agente de um cliente e, por padrao, trabalho de prompt/configuracao/dados daquele cliente. Comece por `ai_agent_config.prompt`, `prompt_versions`, `business_agent_configs`, catalogo, midias, flows, setores, gatilhos e regras salvas da propria conta.
- Nao edite codigo compartilhado para resolver uma preferencia, roteiro, produto, tom de voz, excecao comercial, follow-up, fluxo de midia ou regra operacional que pertence a um cliente especifico.
- Nunca coloque no runtime compartilhado `if/else`, nomes, emails, telefones, produtos, empresas, IDs, palavras-chave ou atalhos hardcoded de um cliente. Isso vaza comportamento e cria conflito com outros clientes.
- Nao transforme calibracao de um cliente em heuristica ampla no runtime compartilhado. Bloqueios por palavras ou contexto como "medico", "vou perguntar", "quero pagar", "como faz", "kit", "pote", "caixa" etc so podem entrar no codigo se houver prova clara de que sao regra universal da plataforma; caso contrario, ficam no prompt/config/metadata daquele cliente.
- Nao engesse o motor AI SDK/Vercel com bloqueios globais para resolver comportamento de um cliente. O motor deve seguir prompt, `when_to_use`, catalogo, midias, fluxos e configuracoes do tenant. Se a IA de um cliente enviou uma midia na hora errada, corrija primeiro o prompt/config/dados daquele cliente e valide; nao crie filtro global por palavra como `pix`, `pagamento`, `endereco`, `catalogo`, `tema`, `produto` etc, salvo se for seguranca/plataforma comprovadamente universal.
- Para erros de momento/ordem de midia em cliente especifico, como QR Pix enviado junto com catalogo, endereco enviado cedo demais, foto de produto fora de hora, texto de fechamento ou fluxo comercial do cliente, a solucao padrao e calibrar o prompt do cliente, `agent_media_library.when_to_use`, descricoes/captions, catalogo ou flow daquele tenant. Nao transformar isso em bloqueio global no runtime compartilhado.
- Para funis obrigatorios de um cliente, nao criar `if/else` por frase, keyword, email, telefone, nome de midia ou exemplo de conversa no runtime compartilhado. O comportamento correto e um contrato de estado configuravel do tenant: enquanto uma etapa obrigatoria ainda nao terminou, a IA responde a pergunta real do cliente dentro da proxima etapa do funil; depois da etapa final, volta a conversar livremente. Se prompt/config nao bastar, a melhoria de codigo deve ser uma capacidade generica de `funnel_state`/`required_media_steps`, validada por schema/tool action do AI SDK, parametrizada por tenant e desativada por padrao para outros agentes.
- So edite codigo quando o problema for uma melhoria ou bug da plataforma como um todo: comportamento reproduzivel em mais de um cliente, falha generica de isolamento/configuracao, recurso configuravel que todos podem usar, ou lacuna estrutural que nao da para expressar com prompt/dados.
- Se precisar criar codigo por causa de uma calibracao, transforme em capacidade multi-cliente: parametrizada por config, isolada por `userId`/tenant, sem padrao que altere clientes existentes, com compatibilidade retroativa e testes/cenarios que cubram o cliente alvo e pelo menos um cliente diferente.
- Antes de mexer em codigo motivado por pedido de um cliente, escreva no raciocinio/summary: qual e a necessidade do cliente, por que prompt/config nao basta, qual ganho universal para a plataforma, qual risco para outros clientes, e como sera validado que nao houve contaminacao entre contas.
- Se houver qualquer duvida razoavel sobre contaminacao entre clientes, a regra padrao e: NAO mexer no codigo compartilhado naquele turno. Ajuste primeiro prompt/configuracao/metadados do cliente, valide, e so depois proponha uma melhoria global separada.
- Se a solucao correta for prompt-only, atualize o prompt/config do cliente, registre backup/versao quando aplicavel e teste a conversa. Nao faca deploy de app/gateway para mudanca que ficou apenas no banco/configuracao.

### Motor Agentico/CLI Interno do AgenteZap

- Estado atual desde 2026-04-29: o AgenteZap tem um motor agentico interno, estilo CLI, implementado no app/Vercel em `2.0/agentezap-vercel/source/api/http.ts`.
- Esse motor nao e um CLI externo separado. Ele e uma camada interna do runtime para:
  - editar prompt com seguranca no chat do editor;
  - testar IA agente vs IA cliente sempre que houver mudanca em prompt, resposta, motor, ferramenta interna, AI SDK, simulador, follow-up ou qualquer logica que altere o que o agente entende/responde;
  - revisar resposta textual final de IA sem quebrar modulos;
  - manter continuidade de conversa usando historico, saudacao/Info, midias enviadas, transcricoes, legendas e regras `quando usar` da biblioteca de midias.
- Regra forte para qualquer CLI/motor de agente novo ou existente no AgenteZap: nao construir como parser rigido, engessado por palavras-chave, `if/else` de frase pronta ou extrator cego de campos. O motor deve agir como um agente interno estilo Codex: entender o pedido, pensar no contexto, consultar dados/ferramentas, executar a acao, verificar resultado, corrigir quando falhar e explicar de forma clara.
- As APIs/ferramentas internas devem ser tratadas como capacidades do agente, nao como fluxo travado. O motor pode chamar endpoints, ler configuracoes, buscar historico, consultar midias, testar respostas, validar saida e aplicar mudancas, mas a decisao deve vir de raciocinio contextual e nao apenas de parse literal.
- O ciclo esperado de um motor agentico e: `entender -> planejar -> buscar contexto -> agir -> verificar -> ajustar -> responder`. Se a implementacao pula a verificacao, nao testa efeito real, ou apenas transforma texto em comandos fixos, ela ainda nao esta no padrao de CLI agentico do AgenteZap.
- Parse, regex, schema e regras deterministicas sao permitidos apenas como guardrails e infraestrutura: seguranca, permissao, tenant, formato de entrada/saida, deduplicacao, limites, opt-out, privacidade, protecao contra perda de contexto e validacao final. Eles nao devem substituir o raciocinio do agente nem virar a experiencia principal.
- Nunca resolver uma necessidade de agente com hardcode de cliente, palavra-chave solta, produto especifico, telefone, email, nome de empresa ou excecao comercial no runtime compartilhado. Quando a regra for de um cliente, fica em prompt/config/dados do cliente; quando for universal, deve ser parametrizada e validada em mais de um contexto.
- O AI SDK/Vercel deve ser tratado como motor flexivel orientado a contexto do cliente, nao como lista fixa de proibicoes globais. Guardrails deterministas no runtime compartilhado devem proteger isolamento, seguranca, permissao, deduplicacao e integridade tecnica; preferencia comercial, ordem de atendimento, momento de enviar Pix/endereco/midia, tom e fluxo de compra pertencem ao prompt/configuracao do cliente, exceto quando houver requisito universal explicitamente validado.
- Antes de alterar qualquer logica de IA que envolva Vercel AI SDK, AI Gateway, `generateText`, `generateObject`, tool calling, structured output, streaming, simulador, follow-up ou resposta automatica, consulte a documentacao oficial atual da Vercel/AI SDK. Nao implemente somente por regra de prompt quando o SDK oferecer mecanismo estruturado mais seguro, como schema Zod, `generateObject`, tools ou `maxSteps`.
- Para funis em etapas, preferir saida estruturada no AI SDK em vez de parser textual: o modelo deve devolver algo validavel como `{ stage, messages, mediaActions, continueFreelyAfterFinalStage }`, e o runtime deve validar por Zod/schema, historico de midias enviadas e configuracao do tenant. Keywords podem ajudar a montar contexto, mas nao podem ser a autoridade principal para decidir a etapa.
- Quando o usuario pedir para "arrumar o agente do cliente X" e citar AI SDK/Vercel, entenda como calibracao do agente daquele cliente usando o motor existente. Primeiro ajuste prompt/config/midias do tenant e teste no simulador real; so mexa no runtime se faltar uma capacidade configuravel para todos.
- Quando o usuario trouxer exemplos de anuncios, campanhas ou produtos diferentes para o mesmo atendimento, classifique primeiro se aquilo pertence ao funil do tenant ou se e outro produto/assunto. Nao reaproveite automaticamente o funil de um produto para outro; registre no Obsidian/memoria, calibre o tenant e teste os exemplos antes de pensar em codigo compartilhado.
- Para calculos, precos, prazos, duracoes, totais, regras de arredondamento ou formulas de um cliente especifico, nao crie regex/hardcode global com nomes, produtos, grupos, taxas, valores ou palavras daquele cliente. A regra de negocio deve ficar no prompt/config/dados do tenant.
- Se o runtime precisar melhorar calculo de forma reutilizavel, implemente capacidade generica e configuravel no app/Vercel com Vercel AI SDK: tool calling, `maxSteps`, `generateObject`/schema ou ferramenta matematica/duracao universal. A ferramenta pode calcular aritmetica e datas, mas os parametros, formulas, valores e decisao de usar devem vir do prompt/config/contexto do cliente.
- Antes de aceitar uma correcao de calculo global, pergunte: isso e uma ferramenta universal ou uma regra de negocio de um tenant? Se for regra de tenant, pare no prompt/config e valide no simulador real.
- No editor de prompt, ele trabalha por proposta, confirmacao, patch localizado, validacao contra perda de contexto, simulacao e historico de versoes em `prompt_versions`/`prompt_edit_chat`.
- Nas respostas reais/simulador, ele deve respeitar os modulos existentes: Flow 2.0, saudacao/Info, opening flow, catalogo, delivery, midias, notificacao e atencao humana. Se algum modulo gerar `mediaActions`, o revisor textual deve pular e nao reescrever a resposta.
- Para midias da aba `Mídias`, o runtime usa `description`, `when_to_use`, `caption`, `transcription` e `flow_items` como contexto. Quando uma midia ativa bate forte com a mensagem do cliente, o seletor contextual pode acionar a midia; quando a midia ja foi enviada, deve responder em texto util e nao repetir.
- Para mensagens curtas como `sim`, `quero`, `ok`, `pode` ou `nao`, o motor deve interpretar pelo historico anterior e nao reiniciar saudacao, audio, imagem, video ou fluxo ja enviado.
- Esse motor pertence ao app/Vercel. Nao implemente nem corrija essa logica no gateway. O gateway deve continuar apenas enviando/recebendo primitives WhatsApp.
- Ao evoluir follow-up, notificadores ou outros envios automaticos, preferir reaproveitar esse motor como planejador de contexto, mas mantendo travas: opt-out, pausa por humano, janela/etapa do follow-up, deduplicacao por conversa/telefone/LID, limites de envio, nao repetir midias e nao criar campanha/disparo sem base no historico.
- Validacao obrigatoria para mudancas nesse motor: teste real de IA agente vs IA cliente antes de concluir. Use `POST https://agentezap.online/api/test-agent/message` com token de `admin_test_tokens` quando a validacao for de conversa/prompt publico, ou `POST https://agentezap.online/api/agent/test` quando o teste exigir sessao autenticada. O teste deve enviar `message` e `history` reais/sinteticos suficientes para reproduzir o caso, e conferir tanto o que deve aparecer quanto o que nao pode aparecer.
- Se criar ou alterar ferramenta/capacidade interna do agente, nao basta build passar: rode um teste que force o agente a usar essa capacidade e registre endpoint, pergunta enviada, trecho da resposta e se houve limpeza de token/dados temporarios. Se nao for possivel testar pelo endpoint real, registre o bloqueio e nao trate como validado.

### Como testar calibracao de agente sem mexer em codigo

- Para calibracao de prompt/config de cliente, prefira validar pelo sistema real antes de encerrar.
- Fluxo padrao:
  - atualizar `ai_agent_config.prompt` e, quando existir, alinhar `business_agent_configs`
  - salvar nova versao em `prompt_versions` e marcar a anterior como nao atual
  - usar `admin_test_tokens` para buscar um token valido do usuario; se nao existir, criar um novo com 16 caracteres e validade curta
  - validar o token em `https://agentezap.online/api/test-agent/info/<token>`
  - testar a conversa real em `https://agentezap.online/api/test-agent/message` enviando `token`, `message` e `history`, exatamente como os scripts do projeto fazem
- Esse e o caminho preferido para `ia agente vs ia cliente` quando a mudanca e de prompt/config e tambem deve ser usado para mudancas de resposta, motor, ferramenta interna, AI SDK, simulador e follow-up sempre que o comportamento puder ser exercitado por conversa.
- Se o runtime local estiver sem `SUPABASE_URL`, chave de servico ou chaves de LLM, NAO parar por isso. Para calibracao de agente, seguir pelo endpoint online do sistema.
- Ao testar, focar no comportamento pedido pelo usuario e verificar tanto o que deve aparecer quanto o que NAO pode aparecer.
- Se o teste falhar, recalibrar no banco e repetir no mesmo endpoint ate a resposta ficar certa.
- Registrar no resumo final:
  - qual versao do prompt foi criada
  - qual endpoint foi usado no teste
  - qual pergunta foi enviada
  - qual trecho da resposta provou que a calibracao funcionou ou falhou

## Deploy Alvo Ativo

- O alvo ativo de producao e a VPS unica Hostinger com `agentezap-app` monolitico. Nao usar Vercel CLI, deploy Vercel, preview Vercel ou gateway separado para publicar correcao de producao, salvo pedido explicito do usuario reabrindo esse alvo.
- O nome `2.0/agentezap-vercel/source` e historico: ele e a fonte canonica do app, mas nao define o destino de deploy.
- Skills Vercel podem ser usadas apenas como referencia de React/UI/performance quando a tarefa pedir esse tipo de conhecimento. Elas nao autorizam deploy Vercel neste projeto.
- Apos o cutover de 2026-05-07, `agentezap.online` roda na VPS unica, mas a fonte canonica do app continua sendo `2.0/agentezap-vercel/source`, que deve preservar a superficie que existia na Vercel. Quando a tarefa pedir "versao da Vercel" ou "igual a Vercel", compare contra essa base e contra os artefatos/deploys Vercel conhecidos sem reativar crons por impulso.
- Nao publique hotfix de app apenas em `/opt/agentezap-single/build/*`, imagem temporaria ou arquivo gerado como fonte da verdade. Hotfix emergencial em build remoto so e aceitavel para recuperar producao e deve ser imediatamente espelhado em `2.0/agentezap-vercel/source`, tasklist e memoria.
- Na arquitetura atual, o alvo e app unico monolitico. Enquanto a producao ainda estiver em transicao split, qualquer `web/api/worker` remanescente deve vir da mesma linha canonica; depois do cutover, publicar um unico artefato/container de app.
- Nao use imagem stale de GitHub/main, release antiga ou workspace paralelo para "corrigir" a VPS unica. Se `vps:preflight` bloquear por workspace sujo, nao publique SHA antigo para contornar: publique somente o artefato validado da fonte canonica atual ou pare e registre o bloqueio.
- Quando houver hotfix emergencial por imagem Docker, a tag nova e apenas artefato operacional. A fonte da verdade continua sendo `2.0/agentezap-vercel/source`, e a mudanca deve ficar registrada em memoria/Obsidian para os outros chats nao regredirem.
- Regra entre chats: toda edicao de app deve ser feita no mesmo codigo canonico compartilhado por todos os chats, principalmente `2.0/agentezap-vercel/source`. Nao crie workspace/copia/release paralela como fonte de alteracao, porque o proximo deploy pode perder o que outro chat corrigiu.
- Regra entre chats com deploy paralelo: antes de editar/publicar, consulte memoria/tasklist/Obsidian do dia e registre no Obsidian a frente iniciada; durante o trabalho, atualize a tasklist quando tocar arquivo, banco ou deploy; antes do resumo final, confirme que a mudanca ficou no codigo canonico e que o registro pos-trabalho permite outro chat continuar sem adivinhar.
- Se o usuario reforcar "mesmo codigo", "nao desatualizar a VPS" ou continuidade para outro chat, trate isso como requisito operacional da tarefa: registrar antes/depois no Obsidian, editar somente a fonte canonica atual, publicar apenas artefato incremental gerado dela e deixar tasklist/memoria suficientes para o proximo chat continuar sem repetir nem desfazer trabalho.
- Se o pedido repetir conta, telefone, conversa, bug ou modulo ja tratado no dia, valide primeiro se o patch/deploy ativo ainda preserva a correcao anterior; so implemente algo novo depois de registrar na tasklist/Obsidian qual lacuna real ainda existe.
- Antes de publicar app na VPS unica, confirme que o artefato foi gerado da fonte canonica atual ja contendo as mudancas recentes dos outros chats. Se a correcao precisou de hotfix direto em imagem/container para emergencia, espelhe a mesma mudanca no codigo canonico antes de finalizar.
- Paridade minima esperada do app canonico com a Vercel atual: painel e rotas publicas, APIs, auth/login, billing/planos/checkout, IA, simulador, follow-up, midias, catalogo, Kanban, tickets, admin, agendamento inteligente, Google Calendar, Google Contacts/contatos sincronizados, PWA/app/download, favicon/assets e crons/jobs equivalentes.
- Antes de publicar na VPS, valide build/rotas conforme a tarefa pedir e confirme que o deploy alvo e a stack correta `/opt/agentezap-single/compose`.
- Ao terminar qualquer correcao, melhoria ou ajuste de codigo/configuracao no app AgenteZap/Vercel, publique no alvo de producao ativo antes do resumo final quando for seguro. Em 2026-05-07, o alvo ativo de `agentezap.online` e a VPS unica; Vercel esta pausada e nao deve ser reativada para comparar ou publicar sem controle dos crons.
- Erros preexistentes e nao relacionados em `npm run check`, lints amplos ou arquivos fora do escopo nao devem impedir o deploy se o build alvo da Vercel passou e a mudanca foi validada. Registre esses erros no resumo final como divida existente, mas publique a correcao.
- So nao faca deploy automatico quando houver bloqueio real: build da Vercel falhando por causa da mudanca, teste essencial da propria correcao falhando, risco de dados/sessoes/gateway, credencial/autenticacao ausente, projeto Vercel incerto, ou pedido explicito do usuario para nao publicar. Nesses casos, registre claramente o motivo e o proximo comando necessario.
- Deploy do app AgenteZap deve ir para o alvo ativo atual. A partir da decisao de 2026-05-08, esse alvo e a VPS unica monolitica com `agentezap-app`; Vercel fica historica/pausada salvo pedido explicito do usuario.
- A borda `agentezap-ssl`/Caddy e permitida apenas para HTTPS/certificado e nao substitui as regras de deploy seguro da VPS. Scripts/rotinas de gateway separado sao historicos e so devem ser usados com justificativa explicita.

## Deploy Seguro Obrigatorio

- Para qualquer deploy neste projeto, siga [DEPLOY_SEGURO.md](/C:/Users/Windows/Downloads/agentezap%20correto/vvvv/DEPLOY_SEGURO.md)
- Comandos oficiais para VPS: `npm run vps:preflight`, `npm run vps:deploy`, `npm run vps:status`, `npm run vps:health`, `npm run vps:releases`, `npm run vps:rollback`. `npm run vps:deploy-gateway` fica historico e so deve ser usado com justificativa explicita de estado split temporario.
- Inventario historico confirmado em 2026-05-07 para a fase split da VPS unica, sem registrar segredos:
  - VPS nova/unica: `187.127.18.177`, usuario SSH operacional `root`, stack em `/opt/agentezap-single/compose`, containers `agentezap-web`, `agentezap-api`, `agentezap-worker`, `agentezap-gateway` e `agentezap-proxy`.
  - VPS antiga gateway: `187.77.33.14`, usuario SSH operacional `root`, container legado `agentezap-wa-gateway` em `/opt/agentezap/containers`, sessoes antigas em `/data/whatsapp-sessions`.
  - Na fase split de 2026-05-07, `gateway.agentezap.online` apontava para o gateway publico. Na fase monolitica atual, esse dominio/rota e historico; o dominio operacional do produto deve apontar para a borda `agentezap-ssl`/Caddy e todo trafego deve chegar ao `agentezap-app`.
- Alvo atual apos correcao de 2026-05-08: `agentezap-app` como unico runtime do sistema e, se necessario, `agentezap-ssl`/Caddy apenas para HTTPS/certificado. Nao tratar `agentezap-ssl` como app, worker, gateway ou API.
  - Se o usuario fornecer senha SSH/root da VPS, nao gravar o valor neste arquivo. A referencia local privada fica no vault Obsidian em `enciclopedia/private/credenciais-vps.md`, pasta ignorada pelo Git.
  - Hostinger DNS/API foi usado no cutover, mas token/senhas/API keys nao devem ser gravados em `AGENTS.md`, wiki publica do Obsidian, memoria, tasklists, logs ou resumo final. Excecao local autorizada pelo usuario em 2026-05-08: senha SSH/root da VPS pode ficar somente em `enciclopedia/private/credenciais-vps.md`, pasta ignorada pelo Git.
  - Em 2026-05-07 o container antigo `agentezap-wa-gateway` foi parado com `docker update --restart=no` + `docker stop`, preservando `/data/whatsapp-sessions`; nao religar sem motivo explicito, pois ele causava conflitos Baileys `connectionReplaced(440)` contra a VPS nova.
- Regra entre chats: deploy seguro e sempre "para frente". Antes de publicar, compare o SHA online da VPS com o SHA alvo; nunca desatualize a VPS para um commit anterior so para isolar o trabalho de um chat.
- Se outro chat ja publicou um commit mais novo e o seu SHA alvo for descendente dele, pode atualizar normalmente, mesmo incluindo commits do outro chat; registre isso no resumo final.
- Se o SHA alvo for mais antigo, divergente, ou nao for possivel provar que ele contem o SHA online, pare o deploy e resolva a base primeiro. Nao reconstrua release antiga por cima da VPS.
- Nunca apague, recrie vazia, sobrescreva ou limpe `/data/whatsapp-sessions` ou qualquer pasta `auth_*`
- Na VPS unica atual, a pasta de sessoes operacional e `/data/agentezap/sessions`. Nunca apagar, recriar, compactar, sincronizar com delete, limpar ou trocar qualquer `auth_*`/`creds.json` dessa pasta para deploy de app. Antes/depois de deploy sensivel, conferir a contagem de `creds.json` e registrar se mudou.
- Antes do cutover monolitico, a producao pode ainda estar em split `web/api/worker/gateway`; trate isso como estado transitorio. O alvo novo e publicar um unico `app` monolitico com Baileys local. Nao reintroduza worker/gateway por habito.
- Para deploy monolitico rapido: buildar uma vez, validar `dist`, publicar um unico artefato/container de app, checar `/api/health`, `/healthz`, rota alterada, logs do app, crons/follow-up e screenshot quando visual. Aceita-se restart de sessoes, mas nao perda de auth state.
- Deploy otimizado atual para `agentezap-app`: gerar o artefato a partir de `2.0/agentezap-vercel/source`, criar uma nova imagem/tag de app contendo esse artefato, atualizar apenas a variavel `AGENTEZAP_APP_IMAGE`/compose do app e subir com `docker compose up -d --no-deps app`. Nao rodar `down`, nao trocar `ssl`, nao recriar volumes, nao usar worker/gateway separado e nao sincronizar sessoes com delete.
- Antes do deploy otimizado, registrar a imagem/tag ativa, health atual e contagem de `creds.json` em `/data/agentezap/sessions`. Depois do deploy, repetir health, imagem/tag ativa, logs do app e contagem de sessoes, registrando na tasklist/Obsidian.
- Em deploy paralelo entre chats, publique sempre "para frente": baseie o artefato na fonte canonica atual e/ou na imagem ativa confirmada; nunca use release antiga, build de outro workspace ou tag stale para sobrescrever correcao recente.
- Se o script seguro falhar por workspace git sujo, isso nao autoriza usar commit/SHA antigo ou imagem antiga. Primeiro tente resolver a base canonica. Em emergencia, publique somente artefato validado da fonte canonica atual e registre o motivo; nunca use release antiga para "ganhar tempo".
- Se precisar criar uma imagem Docker a partir de imagem atual em emergencia, crie o container sem sobrescrever CMD/ENTRYPOINT, copie apenas o artefato necessario, faca `docker commit`, inspecione se o comando continua `node dist/index.js`, atualize somente as variaveis de imagem de web/api/worker e limpe temporarios. Nao repetir o erro de criar imagem com comando `sh` como CMD.
- Nao deixe hotfix so em container/imagem. O mesmo patch deve estar no codigo canonico e registrado em memoria/Obsidian antes do resumo final; caso contrario o proximo deploy pode perder a correcao.
- Nunca use `pm2 restart`, `pm2 delete`, `scp`, `rsync --delete` ou troca manual de pasta como fluxo de deploy
- Nao faca deploy na VPS app antiga legada. Na arquitetura atual, deploy do app vai para `agentezap-app` monolitico na VPS unica; VPS app antiga e somente fonte historica/backup ate sua desativacao segura.
- `npm run vps:deploy-gateway` e regras de gateway separado ficam historicas na arquitetura nova. Use apenas se estiver mantendo estado split temporario e a tasklist explicar por que o monolito ainda nao cobre a operacao.
- Mudancas no app/orquestrador/painel/IA/catalogo/billing/banco devem ir para o app canonico monolitico. Nao usar VPS app antiga nem gateway separado como destino final.
- Na fase monolitica, as sessoes Baileys devem sobreviver por auth state no Supabase/Postgres e espelho em `/data/agentezap/sessions`; deploy pode reiniciar runtime, mas nao pode destruir auth.
- O script `scripts/deploy_safe_release.py` deve pular backup tar/snapshot manual de sessoes por padrao em deploy, restart e rollback. Use backup manual somente em emergencia explicita com `AGENTEZAP_FORCE_SESSION_BACKUP=1`.
- Antes de deploy, restart ou rollback sensivel a sessoes: validar `/data` montado e preservar as sessoes; nunca limpar, recriar, esvaziar ou sincronizar com delete qualquer `auth_*`.
- Se houver falha, use rollback pelo script seguro; nao improvise procedimentos manuais

## Arquitetura Historica Vercel + Gateway

- Secao historica substituida pela decisao de 2026-05-08. Nao use como alvo atual quando houver conflito com `Arquitetura Atual - Monolito Baileys Tudo Junto`.
- Objetivo antigo de arquitetura deste projeto era `todo o sistema AgenteZap na Vercel` e `somente 1 VPS gateway`.
- A `VPS gateway` deve concentrar o runtime `WhatsApp/Baileys`, ownership das sessoes, reconnect/restore, WebSocket/eventos do WhatsApp e expor uma API propria estilo `W-API`.
- A `VPS app` antiga NAO deve ser usada de forma alguma como runtime do produto: nem topologia final, nem padrao intermediario, nem fallback, nem proxy, nem origem de `/uploads`, nem backend para rotas administrativas, nem ambiente que o sistema dependa para "funcionar".
- Variaveis como `VERCEL_BACKEND_ORIGIN`, `APP_BACKEND_ORIGIN`, `VERCEL_UPLOADS_ORIGIN` e `APP_UPLOADS_ORIGIN` nao podem apontar para a VPS app antiga. Se alguma funcionalidade depender disso, primeiro porte a rota/arquivo para Vercel, Supabase Storage ou gateway W-API conforme o escopo correto.
- O compose da frente `2.0/gateway-wapi/source/` deve subir somente o gateway W-API e infraestrutura estritamente necessaria a ele. Nao inclua nem mantenha servico `agentezap-app` nessa frente.
- Referencia funcional desta migracao para a Vercel: estado correto do sistema em `2026-04-23 antes de 10:00 (-03:00, horario de Brasilia)`, observado na VPS/snapshot/commits daquele periodo. Quando uma tela, rota ou fluxo estiver faltando/desatualizado na Vercel, comparar contra essa referencia e portar a funcionalidade equivalente.
- Referencia exata confirmada para divergencias de UI/funcao na Vercel: release da VPS app antiga `release-20260423_203047-8f906ba1b` (`8f906ba1bf29789ede10eb0ecb1f32d8bae94dfd`, `2026-04-23 20:30:18 -03:00`) e, como primeira release retida com o mesmo comportamento correto, `release-20260423_184631-ca05b8bf3` (`ca05b8bf355213cbca5ca2766296656185106113`, `2026-04-23 18:34:55 -03:00`). Essas releases confirmam a pagina `/especialista` correta com apenas o plano `Especialista dedicado` visivel e valor `R$ 2.000,00`. A origem dessa mudanca aparece no commit `20cc491180477ae3779c06ff01365249c319a5e2` (`2026-04-22 12:51:02 -03:00`, `feat: refresh public plan pricing and specialist offer`).
- Copias locais baixadas da VPS app em 2026-04-25 antes de qualquer limpeza: `2.0/agentezap-vercel/reference/vps-app-releases/release-20260423_203047-8f906ba1b.tar.gz` e `2.0/agentezap-vercel/reference/vps-app-releases/release-20260423_184631-ca05b8bf3.tar.gz`. Use essas copias apenas como referencia historica/comparacao; nunca como runtime e nunca para reativar a VPS app antiga.
- Para divergencias na pagina `/plans`, usar a mesma referencia `release-20260423_203047-8f906ba1b` como base correta. Essa linha contem o fix `e79a50a69656afd4f01b4a29d1d5acbf5c427617` (`2026-04-22 23:20:25 -03:00`, `fix: block legacy plan reuse for subscribers`): conta com assinatura ativa NAO deve autoexibir plano legado/personalizado atribuido por link (`assigned_plan_id`) como card de topo/oferta exclusiva. Exemplo de regressao a evitar: conta com `Plano atual da sua conta: IA Ilimitada Pro` vendo automaticamente `Plano Audio Ilimitado`/`Oferta exclusiva`. Para assinante ativo, a tela deve mostrar os planos normais de upgrade; oferta atribuida por link so deve autoaparecer quando a conta ainda nao tem assinatura ativa ou quando o usuario digitar um codigo valido manualmente.
- Se o usuario se referir a "a VPS correta de ontem antes das 10" ou "a VPS/backup correto", nao usar a release atual de 2026-04-24 como referencia, porque ela ja mostrou regressao na pagina `/especialista` (`R$ 497,99`). Usar as releases/commit acima como referencia funcional confirmada e, quando necessario, procurar backups/snapshots anteriores que batam com o mesmo comportamento.
- Essa referencia pre-10h nao muda a arquitetura alvo: nao reintroduzir dependencia da VPS app antiga como destino final; replicar a capacidade em `Vercel + VPS gateway`.
- Antes de corrigir divergencia funcional na Vercel, conferir comportamento, rota, payload e efeito no banco/gateway contra a referencia pre-10h e aplicar a versao stateless/multi-cliente adequada.
- Regra forte: se o combinado do chat for `Vercel + gateway`, nao implementar nem manter arquitetura `Vercel + VPS app + VPS gateway`. Se a VPS app antiga ainda estiver online, trate-a como alvo de desativacao, nao como dependencia aceitavel.
- O alvo correto e:
  - `Vercel`: frontend, UI, painel, APIs/stateless functions, camada web do AgenteZap
  - `VPS gateway`: API WhatsApp, Baileys, conexoes, sessoes, WebSocket/eventos do WhatsApp
- Regra de produto: o gateway deve ser pensado como `produto/API publica independente`, consumivel pelo `AgenteZap` e por `qualquer outro sistema`.
- Regra de desenho: o `AgenteZap` deve ser `cliente` da API do gateway, nao pode depender de chamadas internas acopladas ao runtime Baileys.
- Referencia obrigatoria do contrato publico do gateway: docs `https://docs.w-api.app/api-integration/__intro__`, colecao local original `C:\Users\rodri\Downloads\W-API.postman_collection.json` e copia de trabalho `2.0/gateway-wapi/reference/W-API.postman_collection.json`. Antes de adicionar endpoint/capacidade ao gateway, conferir se ela pertence a uma categoria W-API/WhatsApp. Se for IA, prompt, simulador, follow-up, CRM, Kanban, billing, catalogo, regra de negocio ou painel AgenteZap, implementar no lado Vercel/app e consumir apenas primitives/eventos WhatsApp do gateway.
- O gateway nao deve virar backend do AgenteZap. Dependencias legadas de `storage`, IA, follow-up ou regras multi-cliente dentro do runtime Baileys devem ser tratadas como divida tecnica temporaria para estabilizar a migracao, nao como destino correto.
- Regra forte apos correcao do usuario em 2026-04-24: e erro de arquitetura corrigir ou evoluir `IA`, `flowScriptEngine`, `aiAgent`, simulador, prompt, roteiros de cliente, follow-up, CRM, Kanban, billing, catalogo ou qualquer regra de negocio dentro do gateway para "fazer funcionar". Mesmo que o caminho legado ainda passe pelo gateway, a correcao correta e mover/acionar a decisao no lado Vercel/app e deixar o gateway apenas executar primitives WhatsApp estilo W-API.
- Regra reforcada apos incidente em 2026-04-26: se o problema envolver `/meu-agente-ia`, aba `media`, aba `info`, saudacao, `SAUDACAO_INFO_EXTRA`, `flowItems`, simulador, teste de agente, selecao de midias, ordem de etapas, texto antes/depois de midia, delays, variacao com IA, prompt, catalogo, follow-up, notificador ou qualquer decisao sobre quando/o que responder, NAO edite gateway. Investigue e corrija em `2.0/agentezap-vercel/source/` e use o gateway apenas como API de envio.
- Antes de mexer em `2.0/gateway-wapi/source/` ou arquivos `server/*` usados pela VPS gateway, escreva explicitamente na tasklist: qual primitive W-API esta quebrada, qual endpoint do contrato W-API cobre isso, por que nao e logica do AgenteZap/Vercel, e qual teste prova que a primitive falha mesmo com payload correto. Sem essa justificativa, nao altere gateway.
- Comparar com a VPS antiga significa portar a capacidade para a Vercel/app, nao copiar codigo de IA/fluxo para o gateway. A VPS antiga e as releases de referencia servem para entender comportamento, payload e banco; o destino da correcao continua sendo Vercel quando a funcionalidade for do AgenteZap.
- Se uma conversa real do WhatsApp depender hoje de codigo legado de IA/fluxo no gateway, nao publique patch de IA/fluxo no gateway sem explicar o bloqueio e obter autorizacao explicita. O passo padrao e construir a ponte `gateway evento/webhook -> Vercel decide -> Vercel chama gateway para enviar`.
- Mudancas permitidas no gateway ficam restritas a capacidades WhatsApp/W-API: instancias, sessoes, QR, pairing, conectar/desconectar/resetar, status, contatos, chats/conversas, grupos, mensagens, midias, downloads, presenca, webhooks, fila, retries, health, restore e persistencia de sessao. Todo o resto pertence a Vercel/app.
- A `fila/outbox` do gateway para a Vercel existe por um motivo operacional critico: impedir perda de mensagens inbound quando a Vercel estiver em deploy, cold start, timeout transitorio, indisponibilidade de banco ou qualquer falha momentanea de rede entre gateway e app. Ela nao e detalhe cosmético e nao deve ser removida por impulso.
- Objetivo correto dessa fila: guardar de forma duravel os eventos inbound relevantes do WhatsApp ate que a Vercel os persista/consuma, mantendo o app sincronizado com o que realmente chegou no WhatsApp.
- Cuidado operacional: essa fila nao pode virar gargalo global. Se uma conversa/fluxo demorar para a Vercel responder por causa de IA, midias ou delays legitimos, isso nao deve segurar eventos inbound de outros clientes. A logica correta e manter durabilidade/retry, filtrar ruido/outbound e processar conversas diferentes com concorrencia limitada, preservando ordem por conversa.
- Regras dessa fila:
  - priorizar inbound relevante e nao misturar ruido de realtime desnecessario;
  - nao enfileirar outbound `fromMe=true` nem eco do proprio agente; isso so polui backlog e pode mascarar problema real de sincronizacao;
  - subir antes de restores pesados/blocking jobs do gateway;
  - usar retry/backoff e reconcile como segunda rede de seguranca;
  - nunca reabrir conversa ja respondida por causa de backlog velho.
- Se alguem quiser alterar essa fila, o padrao e melhorar a logica sem perder a garantia de sincronizacao gateway -> Vercel. Nao simplificar removendo durabilidade/retry sem prova forte de mecanismo substituto melhor.
- Registro de causa e desenho em 2026-05-06: a lentidao/perda aparente em conversas foi comprovada principalmente no lado Vercel/app, nao como falha primaria da VPS gateway. Logs de producao mostraram `/api/internal/wa-gateway/events`, `/api/cron/wa-gateway-reconcile` e `/api/cron/stateful-jobs/fast-core` estourando 180s enquanto executavam IA/tarefas agenticas/follow-up de forma sincrona; a VPS continuava recebendo eventos, mas a Vercel demorava para persistir/responder ou travava o webhook. A solucao correta foi transformar recebimento em `persistir evento -> enfileirar resposta -> responder 202 rapido -> processar por waitUntil/reconcile`, sem mover IA para o gateway.
- Fila duravel IA inbound Vercel + gateway: os jobs de resposta automatica que nascem de eventos WhatsApp devem usar `pending_ai_responses` com marcador `failure_reason` iniciando por `queued:vercel_gateway_agent`, `status` `pending/processing/completed/failed`, `retry_count`, `last_attempt_at`, `execute_at`, visibility timeout logico, retry/backoff e claim atomico com `FOR UPDATE SKIP LOCKED`. Ao completar, registrar motivo final (`completed:sent`, `skipped:*`, etc.). Ao falhar por erro recuperavel, reagendar; ao falhar por regra de negocio comprovada, marcar skipped/completed sem reabrir backlog antigo.
- Nao volte a chamar `runVercelAgentForGatewayEvent` de forma bloqueante dentro do webhook do gateway ou do reconcile como fluxo principal. O webhook `/api/internal/wa-gateway/events` precisa persistir inbound relevante e devolver resposta rapida; a IA roda em job duravel. `waitUntil` e apenas acelerador oportunista depois da resposta HTTP, nao substitui fila duravel. Se `waitUntil` cair, deployar ou expirar, o cron `/api/cron/wa-gateway-reconcile` deve retomar.
- `/api/cron/stateful-jobs/fast-core` deve continuar pequeno e barato. Nao coloque de volta nesse grupo tarefas pesadas como `user-followup`, `auto-reactivate`, Google Sheets/meta lead, auditorias agenticas longas, envio em massa ou qualquer job que possa fazer a Function bater timeout. Jobs pesados precisam de endpoint/cron proprio, limite de lote, deadline interno e retry.
- Documentacao que justifica esse desenho: Vercel `waitUntil` permite trabalho apos resposta, mas continua dentro do ciclo de vida da Function; Vercel Queues existe para deferir trabalho caro, absorver picos, garantir entrega, retry e idempotencia; Supabase Queues/PGMQ documenta fila duravel em Postgres com visibility timeout, retry por reprocessamento e mensagem que permanece ate delete/archive. Referencias: `https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package`, `https://vercel.com/docs/queues`, `https://vercel.com/docs/functions/configuring-functions/duration`, `https://supabase.com/docs/guides/queues`, `https://supabase.com/docs/guides/queues/pgmq`.
- Ao investigar lentidao futura, medir separado: (1) WhatsApp/gateway -> `messages.created_at` usando `messages.timestamp`; (2) `messages.created_at` inbound -> primeira resposta `from_me/is_from_agent`; (3) filas `pending_ai_responses` por `created_at/updated_at/status/retry_count/failure_reason`; (4) Vercel logs de 504 em `wa-gateway/events`, `wa-gateway-reconcile`, `fast-core`; (5) erros de modelo/agentic como `reply_text_optimizer`, `followup_plan`, `invalid_output`, `timeout` ou credito/provider. Nao concluir "VPS caiu" sem separar essas camadas.
- Regra critica apos falso negativo de conexao em 2026-04-30: a logica de status/reconnect/reconcile de conexoes WhatsApp no app/Vercel e parte vital do sistema. Se for mexer em `syncConnectionStateFromGatewayStatus`, `ensureConversationGatewayReadyForSend`, `getGatewayStatusMap`, `runVercelAgentForGatewayEvent`, `findUnansweredGatewayInboundMessagesForReconcile`, `/api/whatsapp/connections`, `/api/whatsapp/connection` ou `/api/cron/wa-gateway-reconcile`, o padrao e somente melhorar e endurecer a confiabilidade, nunca remover a cura de falso negativo, nunca voltar a depender apenas de `whatsapp_connections.is_connected/provider_status` como fonte unica da verdade, e nunca fazer reset/QR/destruir sessao para resolver status duvidoso.
- Quando uma mensagem inbound recente prova que a instancia ainda pode estar viva, a Vercel deve consultar o status vivo do gateway e tentar reconnect nao destrutivo antes de desistir da resposta automatica. Estados duros como `logged_out`, `invalid_session`, `auth_failed`, `qr_required` e `pairing_required` podem bloquear reconexao automatica; estados ambiguos/timeout/cache stale devem ser tratados como recuperaveis.
- Regra critica apos incidente de 2026-05-04: estados transitorios do gateway como `recovering`, `reconnecting`, `connecting`, `open_timeout`, timeout de status, cache stale ou socket reabrindo nao podem virar falso `Desconectado` ou alerta assustador na tela `/conexao` quando o banco ainda tem `is_connected=true` e `provider_status=connected`, sem QR fresco e sem logout real. A UI deve manter `Conectado` e deixar o gateway reidratar o socket em background; so mostre desconexao/QR quando houver sinal forte (`logged_out`, `invalid_session`, `auth_failed`, `qr_required`, `pairing_required`, snapshot invalido ou ausencia real de auth).
- Nunca resolva estado `recovering/reconnecting` curto com reset destrutivo, limpeza de snapshot, limpeza de `auth_*`, novo QR automatico ou sobrescrita de sessao. Reconnect automatico deve ser nao destrutivo; `Novo QR`/reset so por acao explicita do usuario ou quando a sessao estiver comprovadamente invalida.
- O refresh automatico de QR na Vercel nao pode chamar reset por ciclo/intervalo. Quando QR expirar com a pagina aberta, gere/peça QR novo por connect/reconnect nao destrutivo e bloqueie empilhamento de mutacoes pendentes; reset continua restrito ao botao manual `Novo QR`.
- Slot de conexao vazio/inativo sem telefone e sem historico pode ser reaproveitado para gerar QR em vez de criar outra `Conexao N`; isso nao autoriza apagar ou resetar sessoes reais. Se a conexao tiver telefone, conversa, mensagem, `is_connected=true`, `provider_status=connected/recovering/reconnecting` ou auth persistido, preserve e use reconexao/status nao destrutivo. Remocao pela UI deve invalidar cache da Vercel e, quando houver historico, bloquear exclusao e orientar desconectar em vez de sumir com a linha.
- Toda mudanca em conexao, gateway, W-API, fila/reconcile, locks de resposta ou sincronizacao de mensagens precisa registrar o motivo tecnico, o risco que evita, a alternativa rejeitada, como preserva sessoes/mensagens e a validacao feita. Se mexer na VPS W-API, explicar no resumo por que a primitive pertence ao gateway, qual parte fica na Vercel e quais contagens/health/logs provam que nao houve perda. Sempre comparar o desenho com APIs tipo W-API: gateway deve expor status/QR/webhook/fila de WhatsApp, enquanto IA/follow-up/regra de negocio ficam na Vercel.
- Ao pesquisar comportamento tipo W-API/Baileys, trate `connected/ready` como estado operacional do cliente e `connecting/recovering` como detalhe interno de transporte quando houver sessao persistida. APIs maduras escondem reconexoes curtas e so exigem nova leitura de QR em `need_scan`/logout/sessao invalida; siga esse padrao para nao gerar falso alarme operacional.
- Antes de mudar essa area, registre na tasklist qual falso negativo/falso positivo esta sendo evitado, como a mudanca preserva `gateway -> Vercel -> IA -> gateway`, e valide com build, `/healthz`, status real de uma instancia e, quando aplicavel, uma mensagem real ou reconciliacao controlada. Nao feche a tarefa so com leitura de banco.
- O gateway deve espelhar a superficie funcional da W-API por categorias. Referencia observada em `24/04/2026` nas docs `docs.w-api.app`:
  - `API Integration` (`2`)
  - `Pagamento` (`4`)
  - `Instancia` (`14`)
  - `Mensagens` (`25`)
  - `Conversas` (`3`)
  - `Contatos` (`5`)
  - `Grupos` (`15`)
  - `Webhooks` (`8`)
  - `Fila de mensagens` (`3`)
- Tratar essas categorias como `contrato minimo`. Ao implementar ou revisar o gateway, conferir se a API cobre a categoria inteira, nao apenas o endpoint isolado pedido no chat.
- Traducao obrigatoria dessa arquitetura:
  - `Gateway/W-API nossa`:
    - criar/listar/remover instancias
    - QR code, pairing code, conectar, desconectar, resetar, status, perfil, dispositivo
    - contatos, conversas/chats, grupos, membros, presencia, foto, bloqueio, metadata
    - envio de mensagens de texto, imagem, audio, video, documento, contato, localizacao, listas, botoes, status e downloads de midia
    - webhooks por evento, fila de mensagens, retries, eventos recebidos, entregas e estados
    - persistencia das sessoes, health-check, reconnect, restore e emissao de eventos para webhook/banco
  - `Sistema AgenteZap na Vercel`:
    - CRM, IA, automacoes, follow-up, painel, billing, catalogo, regras de negocio, dashboards, auth e UX
    - consumir a API/webhooks/eventos do gateway
    - gravar no banco por tenant/instancia e reagir aos eventos
- Regra de integracao:
  - sempre que o usuario pedir separacao `sistema + gateway`, assumir que novas capacidades WhatsApp devem nascer primeiro na API do gateway e depois ser consumidas pelo AgenteZap
  - evitar colocar regra de negocio do AgenteZap dentro do gateway; o gateway expone primitives/eventos de WhatsApp, o sistema executa a logica de negocio
- Se o usuario citar `W-API`, `Baileys`, `API publica`, `gateway` ou `desmembrar sistema`, tratar isso como requisito estrutural e nao como detalhe opcional.
- Se houver dependencia tecnica que ainda impede remover a `VPS app`, parar e explicar explicitamente antes de agir:
  - o que ainda prende o sistema ao backend Express fora da Vercel
  - por que isso nao cabe hoje em `Vercel + gateway`
  - qual seria o menor passo para eliminar essa dependencia
- Se nao existir forma viavel de fazer algo na Vercel, perguntar ao usuario antes de manter qualquer parte do sistema numa `VPS app`; manter a VPS app por inercia e considerado erro operacional.
- Regra operacional: priorizar sempre reduzir deploys na VPS. O objetivo e evitar deploy lento recorrente fora da Vercel.

## Workspace 2.0

- A organizacao de trabalho da nova arquitetura deve acontecer sob a pasta-raiz `2.0/`.
- Estrutura-alvo do workspace para a nova fase:
- `2.0/agentezap-vercel/source/`: base de trabalho do sistema AgenteZap monolitico. Aqui ficam frontend, painel, APIs, auth, IA, fluxos, simulador, CRM, Kanban, billing, catalogo, follow-up, jobs e runtime Baileys.
- `2.0/gateway-wapi/source/`: legado/referencia da fase W-API/gateway. Nao e destino padrao de novas correcoes apos a decisao monolitica de 2026-05-08.
- `2.0/gateway-wapi/reference/legacy-runtime-dabf09a9c/`: exportacao completa da release boa somente para consulta historica; se houver `aiAgent`, `flowScriptEngine` ou outros arquivos de negocio ali, eles sao legado acoplado e nao autorizam editar/reintroduzir IA no gateway final.
- `2.0/gateway-wapi/reference/W-API.postman_collection.json`: copia local da colecao W-API usada como contrato minimo do gateway.
- Regra forte: quando a tarefa for da arquitetura nova, editar primeiro dentro de `2.0/`. O root fora de `2.0/` deixa de ser destino padrao e passa a ser referencia/backup/fonte de migracao.
- Nao mover o sistema legado inteiro por impulso. A migracao fisica do codigo deve ser gradual e intencional, mas novas frentes e correcoes da arquitetura alvo devem nascer em `2.0/`.
- Se for necessario tocar codigo fora de `2.0/` para compatibilidade/deploy do sistema atual, registrar claramente no resumo e espelhar a decisao ou patch correspondente dentro de `2.0/` para manter a separacao viva.
- Sempre que abrir uma frente nova da arquitetura alvo, registrar onde ela mora:
  - `2.0/agentezap-vercel/` para o sistema monolitico completo
  - `2.0/gateway-wapi/` somente para referencia/migracao explicita de legado

## Agentes Paralelos

- Quando houver subtarefas independentes e o usuario permitir ou pedir aceleracao, usar agentes em paralelo por padrao para ganhar velocidade.
- Separar os agentes por fronteira clara de trabalho. Exemplo:
  - um agente para `gateway-wapi`
  - um agente para `agentezap-vercel`
  - um agente para `docs/auditoria/validacao`
- Antes de paralelizar, dividir responsabilidades para evitar colisao no mesmo arquivo.
- Se duas subtarefas tocarem os mesmos arquivos, nao paralelizar cegamente; priorizar consistencia.
- Ao concluir trabalho paralelo, consolidar o resultado no workspace principal e registrar o que cada frente fez.

## Validacao Visual Obrigatoria

- Em alteracao visual, nunca editar ou concluir no escuro: abrir a tela real, verificar o estado atual e comparar o resultado antes do deploy
- Para alteracao visual neste projeto, tirar screenshot real da tela alterada antes de concluir ou publicar
- Regra reforcada apos incidente de 2026-05-07: nunca afirmar que `conexao`, `dashboard`, `plans`, painel ou qualquer rota autenticada esta pronta usando apenas `healthz`, HTML bruto ou `curl` anonimo. Antes do resumo final, navegar na tela real autenticada ou validar com Playwright/browser usando sessao real quando a tarefa envolver UI/painel; checar console/network e corrigir 404/500/504 das APIs principais antes de dizer que esta feito.
- Na VPS unica, `api` deve montar rotas completas do app (`APP_RUNTIME_PROFILE=full`) mesmo com jobs/WhatsApp local desabilitados; `web` pode ser `APP_RUNTIME_PROFILE=web`. Se `api` subir como `web-only`, rotas como `/api/access-status`, `/api/agent/config`, `/api/dashboard/bootstrap` e `/api/internal/wa-gateway/events` viram 404 e o painel fica preso em carregamento.
- Regra historica do split antigo: na VPS com `web/api`, `/ws` precisava cair no `api:5000`. No monolito atual, se houver Caddy/SSL, todo trafego do dominio, incluindo `/ws`, deve ir para `app:5000`.
- Na VPS unica com `WA_GATEWAY_URL` configurado e runtime local desabilitado (`DISABLE_WHATSAPP_PROCESSING`, `DISABLE_LOCAL_WHATSAPP_RUNTIME` ou equivalentes), `api` e `worker` nunca devem abrir socket Baileys local para conexoes de clientes. Caminhos de envio como `sendMessage`/midia devem resolver owner `gateway`; se aparecer `session_ensure:sendMessage`, `open_timeout` ou QR emitido pela API, tratar como regressao critica de ownership.
- Service worker nao deve fabricar `504 Gateway Timeout` como fallback offline. Isso mascara diagnostico real do app; fallback sintetico deve usar status diferente e texto claro, e 504 deve significar resposta real do servidor/proxy.
- Sempre que precisar navegar em um site, validar layout, conferir estado real de tela, testar checkout, login, painel, landing page, responsividade ou qualquer fluxo visual, use navegacao real com a melhor ferramenta disponivel: extensao Codex no navegador, MCP Playwright, Playwright local ou Puppeteer. A forma pode variar, mas a validacao precisa acontecer de verdade.
- Nao desistir de validacao visual por falha da primeira ferramenta. Se a extensao Codex falhar, tente Playwright MCP; se nao houver MCP, tente Playwright/Puppeteer local; se o ambiente exigir login, use as contas reais de validacao quando apropriado; se houver bloqueio tecnico real, registre exatamente o bloqueio, mas nao conclua como validado.
- Screenshot e evidencia visual sao obrigatorios quando a tarefa envolver layout ou navegacao real. Salve pelo menos um print desktop e um mobile quando a tela for responsiva ou importante; para checkout, planos, cadastro, paginas comerciais e painel principal, desktop e mobile sao obrigatorios.
- Depois de tirar print, abra/inspecione a imagem ou descreva objetivamente o que ela prova. Nao basta o script dizer que passou; verifique se textos, botoes, QR code, cards, menus, modais e hierarquia visual aparecem sem corte, sobreposicao ou quebra.
- Se o usuario pedir revisao critica de UI/UX, usar subagente para criticar a interface e iterar ate corrigir os pontos relevantes antes do deploy
- Se houver ajuste visual novo, primeiro ver a tela atual, depois editar, depois ver de novo; nao assumir que o resultado ficou certo sem screenshot real
- Em tela importante de venda ou checkout, validar tambem a hierarquia visual do CTA e registrar a critica antes do deploy
- Nunca considerar ajuste visual finalizado sem ver screenshot real de desktop e mobile da tela alterada
- Em pagina comercial, checkout, planos ou assinatura, usar subagente critico de UI/UX para revisar a interface antes do deploy e corrigir os pontos relevantes encontrados
- Nao fazer ajuste visual sem ver a tela real e sem subagente critico; so concluir quando a interface estiver revisada e perfeita

## Validacao Antes de Dizer que Corrigiu

- Antes de dizer ao usuario que algo foi corrigido em producao, validar no sistema real depois do deploy.
- Para realtime/conversas, validar pelo menos: `/conversas` retorna 200, WebSocket do portal abre ou o log confirma broadcast local, e uma rota/sonda controlada nao deixa 504.
- Para cobranca, Pix ou lembretes, validar no banco que nao existem itens `pending`, `processing` ou `failed` para modulos desligados e confirmar nos logs que a rotina esta pulando envio quando o toggle estiver desativado.
- Para qualquer rotina que envie WhatsApp automaticamente, testar tambem a regra negativa: se o cliente ja tem assinatura `active`, a rotina deve pular antes de montar/enviar a mensagem.
- O resumo final deve dizer exatamente quais checks foram executados; se algum teste real nao foi possivel, declarar isso.

## Otimizacao de Espaco das VPS

- Quando a VPS estiver com disco alto ou houver muitos backups/releases antigos, use primeiro `python scripts/deploy_safe_release.py optimize_space`
- Para aplicar a limpeza segura, use `python scripts/deploy_safe_release.py optimize_space --apply`
- A rotina deve limpar somente artefatos descartaveis: releases antigas fora da retencao, backups repetidos de sessao mantendo os 2 mais recentes, logs antigos, cache npm e cache/imagens Docker sem uso
- Nunca otimize espaco apagando, recriando ou esvaziando `/data/whatsapp-sessions`, `/data/admin-whatsapp-sessions` ou qualquer `auth_*`
- Em topologia alvo `Vercel + gateway`, a otimizacao da VPS deve preservar apenas a VPS gateway e artefatos historicos necessarios; nao use otimizacao como desculpa para manter `agentezap-app` ativo.
- Depois de otimizar a VPS de sessoes, confira `npm run vps:status` e confirme que a contagem de `auth_*` e `creds.json` nao caiu
- Se a limpeza planejada mostrar caminho fora de `/opt/agentezap/releases`, `/opt/agentezap/backups`, logs runtime, cache npm ou Docker, pare e investigue antes de aplicar

## External vs Internal

**Safe to do freely:**

- Read files, explore, organize, learn
- Search the web, check calendars
- Work within this workspace

**Ask first:**

- Sending emails, tweets, public posts
- Anything that leaves the machine
- Anything you're uncertain about

## Notificação de Atualização no Grupo AgenteZap

- Sempre que terminar uma nova atualização, melhoria, correção, deploy, ajuste visual, calibração relevante ou entrega prática do AgenteZap, enviar uma mensagem curta no grupo oficial de novidades: `https://agentezap.online/conversas/1c66b481-29b7-4480-aa19-3f45df24e03b`.
- Essa é uma etapa obrigatória de encerramento, não opcional. Antes de responder o resumo final ao usuário, fazer a checagem: `mensagem do grupo enviada?`.
- Não basta "preparar" a mensagem e esquecer. A ordem correta é: concluir/validar a atualização, escrever a mensagem pública, enviar no grupo, depois responder o resumo final.
- O usuário autorizou esta regra como padrão do workspace. Se a sessão não tiver ferramenta, login, token, navegador autenticado ou capacidade real para enviar no AgenteZap, dizer isso explicitamente no resumo final e deixar a mensagem pronta para envio manual. Nunca omitir esse bloqueio.
- Para o grupo oficial do AgenteZap, o caminho preferido é autenticar uma conta autorizada do próprio AgenteZap e enviar por `POST /api/messages/send` com `conversationId=1c66b481-29b7-4480-aa19-3f45df24e03b`. Esse caminho passa pelo app/gateway e prova envio real no WhatsApp. Não grave senhas neste arquivo; use apenas credenciais fornecidas na conversa atual, sessão já autenticada ou cofre/configuração segura.
- Não considerar `INSERT` direto em tabela de mensagens como envio ao grupo. Banco direto/MCP Supabase só pode ser usado para mensagem pública se houver mecanismo comprovado de outbox/dispatcher que realmente envie pelo WhatsApp; caso contrário, inserir no banco apenas cria registro e pode virar falso positivo.
- No resumo final de qualquer atualização relevante, incluir uma linha curta de status: `Grupo: enviado` ou `Grupo: pendente - motivo`.
- Escrever sempre em português do Brasil natural, humano, curto e entusiasmado. Usar acentos corretamente e revisar para não enviar mojibake nem caracteres quebrados.
- Regra bloqueante de texto: antes de enviar a mensagem no grupo, reler o texto final exatamente como será enviado. Se aparecer `ï¿½`, `�`, `Ã`, `Â`, `?` no lugar de acento, palavra quebrada, encoding errado ou trechos como `[ï¿½udio enviado]`, não enviar. Corrigir primeiro para português do Brasil normal, com acentos reais: `á`, `é`, `í`, `ó`, `ú`, `ã`, `õ`, `ç`.
- Regra operacional obrigatória: depois de enviar mensagem ao grupo oficial, conferir o texto realmente salvo/exibido no AgenteZap antes do resumo final. Se o texto salvo tiver `??`, `?` no lugar de acento, `Ã`, `Â`, `�`, palavra quebrada ou qualquer mojibake, considerar o envio inválido, registrar o erro, corrigir a origem do texto e reenviar uma versão limpa. Não use terminal/PowerShell com acentos literais se ele puder trocar caracteres; use UTF-8 explícito, arquivo temporário UTF-8 ou escapes Unicode e valide o resultado salvo.
- Não copiar para o grupo labels quebrados vindos da tela, banco, logs, terminal, payload, histórico ou resultado de comando. Reescrever manualmente em português correto quando necessário.
- A mensagem deve explicar em linguagem simples:
  - o que foi criado, corrigido ou melhorado;
  - para que serve na prática;
  - como a pessoa pode usar;
  - o link `www.agentezap.online/`.
- A mensagem deve ser escrita como novidade de produto para cliente, tocando na dor e no resultado percebido: mais respostas certas, menos cliente perdido, atendimento mais natural, menos trabalho manual, mais controle e mais vendas.
- Nunca transformar a mensagem do grupo em log técnico. Não falar que "deployou", "corrigiu endpoint", "ajustou runtime", "validou logs", "alterou banco", "mudou motor", "implementou biblioteca", "trocou modelo" ou qualquer detalhe de bastidor. Se a melhoria veio de algo técnico, traduza para o benefício: `o atendimento ficou mais inteligente`, `o follow-up entende melhor o momento da conversa`, `o agente continua o papo sem repetir`, `a configuração fica mais fácil de testar`.
- A mensagem deve ser curta, humana e entusiasmada, mas sem exagero. Falar como AgenteZap, não como equipe técnica. Exemplo de tom: `Novidade no AgenteZap: o atendimento ficou mais esperto para continuar a conversa sem repetir pergunta. Isso ajuda você a responder melhor, recuperar clientes parados e vender com mais naturalidade. Acesse: www.agentezap.online/`.
- Nunca mencionar nomes de APIs, bibliotecas, fornecedores, modelos, frameworks, infraestrutura, banco, deploy, gateway, rotas internas, tecnicismos ou detalhes de implementação na mensagem ao grupo.
- Proibido enviar no grupo ou para cliente qualquer ID de deploy, SHA, branch, nome de arquivo, caminho, rota, endpoint, payload, status técnico (`success=true`, `504`, `404`, etc.), log, nome de tabela, nome de função, provider/modelo de IA ou descrição de fallback/retry interno. Esses detalhes ficam somente na tasklist, memória e resumo técnico do chat direto com o usuário.
- Se uma mensagem pública já foi escrita em formato técnico, não envie outra antes de reescrever do zero em linguagem de produto e conferir item por item que não sobrou bastidor. A pergunta de revisão é: `um cliente leigo entenderia isso como benefício do AgenteZap, sem descobrir como foi implementado?`
- Essa regra de linguagem também vale para qualquer texto público, aviso para clientes, descrição de novidade, material de venda, central de ajuda ou mensagem de produto: sempre falar como capacidade própria do AgenteZap, não como dependência técnica externa.
- Descrever tudo como recurso original do AgenteZap, usando nomes do próprio sistema e termos de produto. Exemplos de linguagem permitida: `Fluxo Inteligente`, `Atendimento Inteligente`, `Central de Conversas`, `Envio em Massa`, `Agenda Inteligente`, `Follow-up Inteligente`, `Painel AgenteZap`, `Conexões`, `Planos`, `Catálogo`, `Kanban`, `Curso AgenteZap`.
- O tom deve parecer uma pessoa da equipe falando com clientes, não um changelog técnico. Preferir frases diretas com acentos corretos como: `Novidade no AgenteZap: agora você consegue...`, `Acabamos de melhorar...`, `Ficou mais simples...`.
- Não prometer algo que não foi validado. Se a entrega foi parcial, avisar de forma simples e positiva apenas o que já está pronto para uso.
- Antes de enviar, conferir que a mensagem não revela informação privada de cliente, conversa, telefone, email, IDs internos, valores sensíveis, logs ou bastidores do trabalho.
- Modelo base:

```text
Novidade no AgenteZap: agora [o que mudou em linguagem simples].

Isso ajuda você a [benefício prático]. Para usar, acesse [onde clicar/qual área do sistema] em www.agentezap.online/.
```

## Group Chats

You have access to your human's stuff. That doesn't mean you _share_ their stuff. In groups, you're a participant — not their voice, not their proxy. Think before you speak.

### 💬 Know When to Speak!

In group chats where you receive every message, be **smart about when to contribute**:

**Respond when:**

- Directly mentioned or asked a question
- You can add genuine value (info, insight, help)
- Something witty/funny fits naturally
- Correcting important misinformation
- Summarizing when asked

**Stay silent (HEARTBEAT_OK) when:**

- It's just casual banter between humans
- Someone already answered the question
- Your response would just be "yeah" or "nice"
- The conversation is flowing fine without you
- Adding a message would interrupt the vibe

**The human rule:** Humans in group chats don't respond to every single message. Neither should you. Quality > quantity. If you wouldn't send it in a real group chat with friends, don't send it.

**Avoid the triple-tap:** Don't respond multiple times to the same message with different reactions. One thoughtful response beats three fragments.

Participate, don't dominate.

### 😊 React Like a Human!

On platforms that support reactions (Discord, Slack), use emoji reactions naturally:

**React when:**

- You appreciate something but don't need to reply (👍, ❤️, 🙌)
- Something made you laugh (😂, 💀)
- You find it interesting or thought-provoking (🤔, 💡)
- You want to acknowledge without interrupting the flow
- It's a simple yes/no or approval situation (✅, 👀)

**Why it matters:**
Reactions are lightweight social signals. Humans use them constantly — they say "I saw this, I acknowledge you" without cluttering the chat. You should too.

**Don't overdo it:** One reaction per message max. Pick the one that fits best.

## Tools

Skills provide your tools. When you need one, check its `SKILL.md`. Keep local notes (camera names, SSH details, voice preferences) in `TOOLS.md`.

### Codex Skills

- Skills sao instrucoes locais que ampliam o Codex para tarefas especificas. Elas complementam este `AGENTS.md`; nao substituem as regras do workspace, de seguranca, Supabase, Vercel, VPS ou gateway.
- Use uma skill quando o usuario citar o nome dela ou quando a tarefa combinar claramente com a descricao da skill. Antes de usar, abra o `SKILL.md` dela e siga o fluxo dali.
- Se a skill tiver `scripts/`, `references/` ou `assets/`, carregue apenas o necessario para a tarefa. Nao leia tudo por habito.
- Para uma skill aparecer para o agente, ela precisa estar dentro do `$CODEX_HOME/skills` ativo daquela conversa e o Codex precisa ser reiniciado depois da instalacao. Se ela foi instalada em outro `CODEX_HOME`, copie/instale no `CODEX_HOME` atual antes de esperar que apareca.
- As skills Vercel abaixo vieram de `https://github.com/vercel-labs/agent-skills`, instaladas via CLI `https://github.com/vercel-labs/skills`. Em 2026-04-28, foram copiadas para `C:\Users\rodri\.agents\skills`, `C:\Users\rodri\.codex\skills`, `2.0/.codex-home/skills` e o `CODEX_HOME` ativo. Elas so entram como skills carregadas automaticamente em novas sessoes apos reiniciar o Codex.

Skills Vercel instaladas e quando usar:

- `deploy-to-vercel`: deploy de apps/sites na Vercel, criar preview deployment, publicar quando o usuario pedir deploy/link. Neste projeto, respeite as regras de `Deploy Alvo Ativo` e nao use Vercel para substituir o alvo monolitico da VPS sem pedido explicito.
- `vercel-cli-with-tokens`: operar Vercel CLI com token, incluindo deploy, setup de projeto e variaveis de ambiente quando a autenticacao for por token e nao por login interativo.
- `vercel-react-best-practices` (`react-best-practices`): escrever, revisar ou refatorar React/Next.js com foco em performance, data fetching, bundle, renderizacao e padroes recomendados pela Vercel.
- `web-design-guidelines`: revisar UI/UX/acessibilidade/performance visual de telas web, especialmente quando o pedido for revisar interface, design, acessibilidade ou boas praticas de experiencia.
- `vercel-composition-patterns` (`composition-patterns`): desenhar ou refatorar componentes React reutilizaveis, evitar excesso de props booleanas, aplicar compound components, render props, providers e composicao interna.
- `vercel-react-view-transitions` (`react-view-transitions`): implementar animacoes nativas com React View Transition API, transicoes de rota, shared elements, entrada/saida de componentes e animacoes entre estados de UI.
- `vercel-react-native-skills` (`react-native-skills`): tarefas de React Native/Expo, performance mobile, listas, animacoes, gestures, safe areas, imagens e APIs nativas.

Skills de sistema normalmente disponiveis:

- `continuity-guard`: continuidade entre chats e anti-regressao. Use antes de tarefas sensiveis de codigo/config/banco/deploy/gateway/Supabase/Vercel/billing/checkout/follow-up/IA/prompt/conexao/sessao/validacao visual para pesquisar memoria, registrar o `porque`, evitar loops e validar com evidencia.
- `semantic-code-context`: usar contexto semantico local para tarefas de codigo multi-arquivo quando precisar substituir/complementar Augment; orienta uso de Graphify para mapa/reducao de tokens, `Serena` para simbolos/referencias/edicao e `codebase-memory` sob demanda para grafo MCP amplo.
- `imagegen`: gerar ou editar imagens bitmap/raster, como fotos, ilustracoes, mockups, banners, assets de site, sprites e cutouts. Nao usar quando o melhor caminho for SVG, HTML/CSS, canvas ou asset vetorial nativo.
- `openai-docs`: consultar documentacao oficial e atualizada da OpenAI, escolher modelos, orientar upgrades de modelo/prompt e responder duvidas sobre APIs/produtos OpenAI com fontes oficiais.
- `plugin-creator`: criar/scaffoldar plugins locais do Codex, incluindo `.codex-plugin/plugin.json`, estrutura opcional e marketplace.
- `skill-creator`: criar ou atualizar skills do Codex, incluindo `SKILL.md`, scripts, referencias, assets e validacao.
- `skill-installer`: listar ou instalar skills em `$CODEX_HOME/skills`, de lista curada/experimental ou repositorios GitHub. Depois de instalar, lembrar de reiniciar o Codex.

**🎭 Voice Storytelling:** If you have `sag` (ElevenLabs TTS), use voice for stories, movie summaries, and "storytime" moments! Way more engaging than walls of text. Surprise people with funny voices.

**📝 Platform Formatting:**

- **Discord/WhatsApp:** No markdown tables! Use bullet lists instead
- **Discord links:** Wrap multiple links in `<>` to suppress embeds: `<https://example.com>`
- **WhatsApp:** No headers — use **bold** or CAPS for emphasis

## 💓 Heartbeats - Be Proactive!

When you receive a heartbeat poll (message matches the configured heartbeat prompt), don't just reply `HEARTBEAT_OK` every time. Use heartbeats productively!

Default heartbeat prompt:
`Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.`

You are free to edit `HEARTBEAT.md` with a short checklist or reminders. Keep it small to limit token burn.

### Heartbeat vs Cron: When to Use Each

**Use heartbeat when:**

- Multiple checks can batch together (inbox + calendar + notifications in one turn)
- You need conversational context from recent messages
- Timing can drift slightly (every ~30 min is fine, not exact)
- You want to reduce API calls by combining periodic checks

**Use cron when:**

- Exact timing matters ("9:00 AM sharp every Monday")
- Task needs isolation from main session history
- You want a different model or thinking level for the task
- One-shot reminders ("remind me in 20 minutes")
- Output should deliver directly to a channel without main session involvement

**Tip:** Batch similar periodic checks into `HEARTBEAT.md` instead of creating multiple cron jobs. Use cron for precise schedules and standalone tasks.

**Things to check (rotate through these, 2-4 times per day):**

- **Emails** - Any urgent unread messages?
- **Calendar** - Upcoming events in next 24-48h?
- **Mentions** - Twitter/social notifications?
- **Weather** - Relevant if your human might go out?

**Track your checks** in `memory/heartbeat-state.json`:

```json
{
  "lastChecks": {
    "email": 1703275200,
    "calendar": 1703260800,
    "weather": null
  }
}
```

**When to reach out:**

- Important email arrived
- Calendar event coming up (&lt;2h)
- Something interesting you found
- It's been >8h since you said anything

**When to stay quiet (HEARTBEAT_OK):**

- Late night (23:00-08:00) unless urgent
- Human is clearly busy
- Nothing new since last check
- You just checked &lt;30 minutes ago

**Proactive work you can do without asking:**

- Read and organize memory files
- Check on projects (git status, etc.)
- Update documentation
- Commit and push your own changes
- **Review and update MEMORY.md** (see below)

### 🔄 Memory Maintenance (During Heartbeats)

Periodically (every few days), use a heartbeat to:

1. Read through recent `memory/YYYY-MM-DD.md` files
2. Identify significant events, lessons, or insights worth keeping long-term
3. Update `MEMORY.md` with distilled learnings
4. Remove outdated info from MEMORY.md that's no longer relevant

Think of it like a human reviewing their journal and updating their mental model. Daily files are raw notes; MEMORY.md is curated wisdom.

The goal: Be helpful without being annoying. Check in a few times a day, do useful background work, but respect quiet time.

## Make It Yours

This is a starting point. Add your own conventions, style, and rules as you figure out what works.

## Cobranca, Pix e Planos Ativos

- Quando corrigir lembrete de pagamento, cobranca em atraso, Pix pendente ou recuperacao de pedido, validar tres camadas antes de encerrar: toggle/config do painel, codigo do job/send path e backlog ja existente no banco.
- Se o toggle estiver desligado, nao basta impedir novos schedules; marque filas antigas abertas como `skipped_disabled` ou equivalente para que nenhum worker antigo consiga enviar depois.
- Se o cliente ja tiver assinatura `active`, qualquer fila antiga de `payment_reminder`, `overdue_reminder` ou recuperacao de Pix deve ser marcada como `skipped_active_plan`; o runtime tambem deve revalidar assinatura ativa imediatamente antes de enviar.
- Validacao minima no Supabase MCP: contadores abertos para Pix/agendas de cobranca do dono afetado devem ficar zero, e contadores globais de cobranca aberta para usuarios com assinatura `active` tambem devem ficar zero.
