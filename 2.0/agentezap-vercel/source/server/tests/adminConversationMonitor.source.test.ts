import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const routesSource = fs.readFileSync(path.resolve(process.cwd(), "server", "routes.ts"), "utf8");
const adminPageSource = fs.readFileSync(path.resolve(process.cwd(), "client", "src", "pages", "admin.tsx"), "utf8");
const monitorSource = fs.readFileSync(path.resolve(process.cwd(), "client", "src", "components", "admin-conversation-monitor.tsx"), "utf8");

assert.match(
  routesSource,
  /app\.get\("\/api\/admin\/conversation-monitor",\s*isAdmin/,
  "monitor global precisa ter endpoint GET autenticado por admin",
);

assert.match(
  routesSource,
  /app\.get\("\/api\/admin\/conversation-monitor\/:id\/messages",\s*isAdmin/,
  "mensagens do monitor precisam ter endpoint GET autenticado por admin",
);

assert.doesNotMatch(
  routesSource,
  /app\.(post|patch|put|delete)\("\/api\/admin\/conversation-monitor/,
  "monitor SaaS deve permanecer somente leitura no backend",
);

assert.match(
  routesSource,
  /FROM conversations c[\s\S]*INNER JOIN whatsapp_connections wc ON wc\.id = c\.connection_id[\s\S]*LEFT JOIN users u ON u\.id = wc\.user_id[\s\S]*ORDER BY COALESCE\(c\.last_message_time, c\.updated_at, c\.created_at\) DESC/,
  "lista global deve ordenar conversas de todos os tenants pela ultima atividade",
);

assert.match(
  routesSource,
  /const rawScope = String\(req\.query\?\.scope \|\| "direct"\)[\s\S]*rawScope === "groups" \? "groups" : "direct"/,
  "monitor deve aceitar filtro explicito entre conversas normais e grupos",
);

assert.match(
  routesSource,
  /COALESCE\(c\.jid_suffix, 's\.whatsapp\.net'\) = 'g\.us'[\s\S]*COALESCE\(c\.remote_jid, ''\) ILIKE '%@g\.us'/,
  "monitor deve identificar grupos por jid_suffix ou remote_jid",
);

assert.match(
  routesSource,
  /LEFT JOIN agent_disabled_conversations adc ON adc\.conversation_id = c\.id[\s\S]*conversationAiActive/,
  "monitor deve calcular IA ativa por conversa usando pausa manual da conversa",
);

assert.match(
  routesSource,
  /aiFilter === "active" \? `AND \$\{aiActiveSql\}` : ""/,
  "monitor deve permitir filtro de conversas com IA ativa",
);

assert.doesNotMatch(
  routesSource,
  /aic\.agent_name/,
  "monitor nao pode consultar ai_agent_config.agent_name porque essa coluna nao existe no schema real",
);

assert.match(
  routesSource,
  /COALESCE\(bac\.agent_name,\s*CASE WHEN COALESCE\(aic\.is_active,\s*false\) THEN 'Agente IA' ELSE NULL END\) AS "agentName"/,
  "monitor deve obter nome do agente por business_agent_configs ou fallback seguro",
);

assert.match(
  routesSource,
  /Math\.min\(50[\s\S]*LIMIT \$\{limitParam\}/,
  "monitor deve limitar cada pagina a 50 conversas",
);

assert.match(
  adminPageSource,
  /import AdminConversationMonitor from "@\/components\/admin-conversation-monitor"/,
  "pagina admin deve importar o monitor SaaS",
);

assert.match(
  adminPageSource,
  /case "conversation-monitor":[\s\S]*<AdminConversationMonitor \/>/,
  "pagina admin deve renderizar aba do monitor SaaS",
);

assert.match(
  adminPageSource,
  /handleTabChange\("conversation-monitor"\)[\s\S]*<span>Monitor SaaS<\/span>/,
  "menu admin deve expor Monitor SaaS",
);

assert.match(
  monitorSource,
  /read-only|Somente leitura/,
  "UI do monitor deve deixar claro que e somente leitura",
);

assert.doesNotMatch(
  monitorSource,
  /apiRequest\("POST"|fetch\([^)]*method:\s*"POST"|sendMutation|AudioRecorder|MediaUploader|AIMessageGenerator|Textarea/,
  "UI do monitor nao pode conter composer, envio, audio, midia ou resposta com IA",
);

assert.match(
  monitorSource,
  /Carregar mais 50/,
  "UI do monitor deve carregar conversas em blocos de 50",
);

assert.match(
  monitorSource,
  /const MONITOR_PAGE_SIZE = 50/,
  "UI do monitor deve usar tamanho fixo de pagina para evitar pagina crescente sem offset real",
);

assert.match(
  monitorSource,
  /offset:\s*String\(offset\)[\s\S]*if \(aiFilter === "active"\) params\.set\("ai", "active"\)/,
  "UI do monitor deve preservar offset e filtro IA ativa ao montar a chamada da lista",
);

assert.match(
  monitorSource,
  /const loadMoreConversations = async \(\) =>[\s\S]*fetchConversationPage\(pagination\.nextOffset\)[\s\S]*setExtraPagination\(data\.pagination\)/,
  "botao Ver mais precisa buscar a proxima pagina real pelo nextOffset retornado pela API",
);

assert.match(
  monitorSource,
  /onClick=\{loadMoreConversations\}/,
  "botao Carregar mais 50 deve chamar a paginacao incremental preservando os filtros ativos",
);

assert.doesNotMatch(
  monitorSource,
  /setLimit\(\(value\) => value \+ 50\)|offset:\s*"0"[\s\S]*Carregar mais 50/,
  "botao Carregar mais 50 nao pode aumentar limit e refazer offset zero, pois isso quebra o filtro IA ativa na paginacao",
);

assert.match(
  monitorSource,
  /data-testid="monitor-scope-direct"[\s\S]*Conversas[\s\S]*data-testid="monitor-scope-groups"[\s\S]*Grupos/,
  "UI do monitor deve separar conversas normais e grupos",
);

assert.match(
  monitorSource,
  /data-testid="monitor-filter-ai-active"[\s\S]*IA ativa/,
  "UI do monitor deve expor filtro de IA ativa nesta conversa",
);

assert.match(
  monitorSource,
  /const kind = isGroupConversation\(conversation\) \? "grupo" : "conversa"[\s\S]*`\/admin#conversation-monitor\/\$\{kind\}\/\$\{conversation\.id\}`/,
  "UI do monitor deve gravar na URL se a selecao e conversa normal ou grupo",
);

assert.match(
  monitorSource,
  /selectedConversationId[\s\S]*fetch\(`\/api\/admin\/conversation-monitor\/\$\{selectedConversationId\}\/messages\?limit=160`/,
  "UI do monitor deve carregar detalhe por ID da URL mesmo fora da pagina atual da lista",
);

assert.match(
  monitorSource,
  /Nao foi possivel carregar as conversas/,
  "UI do monitor deve mostrar erro real em vez de mascarar falha da API como lista vazia",
);

console.log("adminConversationMonitor.source.test.ts: ok");
