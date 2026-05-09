/**
 * 🤖 SERVIÇO DE VENDAS AUTOMATIZADO DO ADMIN (RODRIGO) - NOVA VERSÃO
 * 
 * FLUXO PRINCIPAL:
 * 1. Configurar agente (nome, empresa, função, instruções)
 * 2. Modo de teste (#sair para voltar)
 * 3. Aprovação → PIX → Conectar WhatsApp → Criar conta
 * 
 * SEM QR CODE / PAREAMENTO durante onboarding!
 * Conta criada automaticamente com email fictício para teste.
 */

import { storage } from "./storage";
import { generatePixQRCode } from "./pixService";
import { getLLMClient } from "./llm";
import { v4 as uuidv4 } from "uuid";
import { 
  generateAdminMediaPromptBlock, 
  parseAdminMediaTags, 
  getAdminMediaByName,
  type AdminMedia 
} from "./adminMediaStore";
import {
  scheduleAutoFollowUp,
  cancelFollowUp,
  scheduleContact,
  parseScheduleFromText,
} from "./followUpService";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface ClientSession {
  id: string;
  phoneNumber: string;
  
  // Dados do cliente
  userId?: string;
  email?: string;
  
  // Configuração do agente em criação
  agentConfig?: {
    name?: string;       // Nome do agente (ex: "Laura")
    company?: string;    // Nome da empresa (ex: "Loja Fashion")
    role?: string;       // Função (ex: "Atendente", "Vendedor")
    prompt?: string;     // Instruções detalhadas
  };
  
  // Estado do fluxo
  flowState: 'onboarding' | 'test_mode' | 'post_test' | 'payment_pending' | 'active';
  
  // Controles
  subscriptionId?: string;
  awaitingPaymentProof?: boolean;
  lastInteraction: Date;
  
  // Histórico
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>;
}

// Cache de sessões de clientes em memória
const clientSessions = new Map<string, ClientSession>();

// Contador para emails fictícios
let emailCounter = 1000;

// ============================================================================
// FUNÇÕES DE GERENCIAMENTO DE SESSÃO
// ============================================================================

export function getClientSession(phoneNumber: string): ClientSession | undefined {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return clientSessions.get(cleanPhone);
}

export function createClientSession(phoneNumber: string): ClientSession {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  const session: ClientSession = {
    id: uuidv4(),
    phoneNumber: cleanPhone,
    flowState: 'onboarding',
    lastInteraction: new Date(),
    conversationHistory: [],
  };
  
  clientSessions.set(cleanPhone, session);
  console.log(`📱 [SALES] Nova sessão criada para ${cleanPhone}`);
  return session;
}

export function updateClientSession(phoneNumber: string, updates: Partial<ClientSession>): ClientSession {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  let session = clientSessions.get(cleanPhone);
  
  if (!session) {
    session = createClientSession(cleanPhone);
  }
  
  Object.assign(session, updates, { lastInteraction: new Date() });
  clientSessions.set(cleanPhone, session);
  return session;
}

/**
 * Limpa sessão do cliente (para testes)
 * Comandos: #limpar, #reset, #novo
 */
export function clearClientSession(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const existed = clientSessions.has(cleanPhone);
  clientSessions.delete(cleanPhone);
  cancelFollowUp(cleanPhone);
  
  if (existed) {
    console.log(`🗑️ [SALES] Sessão do cliente ${cleanPhone} removida da memória`);
  }
  return existed;
}

/**
 * Gera email fictício para conta temporária
 */
function generateTempEmail(phoneNumber: string): string {
  emailCounter++;
  const cleanPhone = phoneNumber.replace(/\D/g, "").slice(-8);
  return `cliente_${cleanPhone}_${emailCounter}@agentezap.temp`;
}

export function addToConversationHistory(phoneNumber: string, role: "user" | "assistant", content: string) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const session = clientSessions.get(cleanPhone);
  
  if (session) {
    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });
    
    // Manter apenas últimas 30 mensagens para contexto
    if (session.conversationHistory.length > 30) {
      session.conversationHistory = session.conversationHistory.slice(-30);
    }
  }
}

// ============================================================================
// PROMPT MESTRE DO RODRIGO (VENDEDOR)
// ============================================================================

async function getMasterPrompt(session: ClientSession): Promise<string> {
  // Buscar prompt configurado no admin (se existir)
  const configPrompt = await storage.getSystemConfig("admin_agent_prompt");
  const customInstructions = configPrompt?.valor || "";
  
  // Verificar se cliente já existe pelo telefone
  const existingUser = await findUserByPhone(session.phoneNumber);
  
  // Se encontrou usuário, atualizar sessão
  if (existingUser && !session.userId) {
    updateClientSession(session.phoneNumber, { 
      userId: existingUser.id,
      email: existingUser.email,
      flowState: 'active'
    });
    session.userId = existingUser.id;
    session.email = existingUser.email;
    session.flowState = 'active';
  }
  
  // Montar contexto baseado no estado
  let stateContext = "";
  
  if (session.flowState === 'test_mode') {
    // MODO DE TESTE: IA responde como o agente configurado
    return getTestModePrompt(session);
  }
  
  if (session.flowState === 'active' && session.userId) {
    // Cliente ativo - já tem conta
    stateContext = await getActiveClientContext(session);
  } else {
    // Novo cliente - fluxo de vendas
    stateContext = getOnboardingContext(session);
  }
  
  // Carregar bloco de mídias
  const mediaBlock = await generateAdminMediaPromptBlock();
  
  return `Você é o Rodrigo, vendedor HUMANO da AgenteZap. Você é uma pessoa real, não robô.

${customInstructions ? `INSTRUÇÕES PERSONALIZADAS:\n${customInstructions}\n\n` : ""}

🚀 SOBRE A AGENTEZAP:
- Plataforma de automação de WhatsApp com Inteligência Artificial
- Criamos agentes de IA personalizados que atendem clientes 24/7
- Preço: R$ 99/mês - Conversas ilimitadas, 1 agente IA
- Oferecemos TESTE GRÁTIS antes do pagamento

💬 COMO VOCÊ FALA:
1. Natural, como humano no WhatsApp
2. Informal mas respeitoso (você/vc, tá/está, pra/para)
3. Respostas CURTAS (2-4 linhas)
4. Emojis com moderação (1-2 por mensagem)
5. NUNCA use markdown (**, ##, etc.)
6. NUNCA diga que é IA/robô
7. UMA pergunta por vez
8. Paciente com quem não entende de tecnologia

${stateContext}

${mediaBlock}

AÇÕES DISPONÍVEIS (use no final da resposta):
[AÇÃO:SALVAR_CONFIG nome="Laura" empresa="Loja X" funcao="Atendente"]
[AÇÃO:SALVAR_PROMPT prompt="texto das instruções"]
[AÇÃO:INICIAR_TESTE] - Ativa modo de teste
[AÇÃO:ENVIAR_PIX]
[AÇÃO:NOTIFICAR_PAGAMENTO]
[AÇÃO:AGENDAR_CONTATO data="amanhã 14h" motivo="retornar contato"]

Essas ações são processadas automaticamente - não mencione para o cliente.

INFORMAÇÕES DO PIX:
- Valor: R$ 99,00
- Chave PIX (email): rodrigoconexao128@gmail.com
- Nome: Rodrigo`;
}

/**
 * Prompt para modo de teste - IA responde como o agente configurado
 */
function getTestModePrompt(session: ClientSession): string {
  const config = session.agentConfig || {};
  
  return `Você é ${config.name || "o atendente"}, ${config.role || "atendente"} da ${config.company || "empresa"}.

${config.prompt || "Atenda os clientes de forma educada e prestativa."}

REGRAS DE ATENDIMENTO:
- Seja educado e prestativo
- Respostas curtas e objetivas (2-4 linhas)
- Linguagem natural e amigável
- Use emojis com moderação
- NÃO use markdown
- NÃO invente informações não fornecidas
- Se não souber algo, diga que vai verificar

⚠️ IMPORTANTE: Você está em MODO DE TESTE.
O cliente está testando como você atenderia os clientes dele.
Responda como se fosse um cliente real entrando em contato.`;
}

/**
 * Contexto para clientes novos (onboarding/vendas)
 */
function getOnboardingContext(session: ClientSession): string {
  const config = session.agentConfig || {};
  
  let configStatus = "";
  if (config.name) configStatus += `✅ Nome do agente: ${config.name}\n`;
  if (config.company) configStatus += `✅ Empresa: ${config.company}\n`;
  if (config.role) configStatus += `✅ Função: ${config.role}\n`;
  if (config.prompt) configStatus += `✅ Instruções: configuradas\n`;
  
  const hasAllConfig = config.name && config.company && config.role && config.prompt;
  
  return `
📋 ESTADO ATUAL: ONBOARDING (novo cliente)
Telefone: ${session.phoneNumber}

${configStatus ? `DADOS JÁ COLETADOS:\n${configStatus}` : "NENHUM DADO COLETADO AINDA"}

🎯 SEU OBJETIVO: Configurar o agente e fazer o cliente TESTAR

FLUXO DE VENDA (siga esta ordem):
1. Se apresente brevemente e pergunte o NOME DA EMPRESA/LOJA
2. Depois pergunte o NOME DO AGENTE (como ele quer chamar a IA)
3. Depois pergunte a FUNÇÃO (atendente, vendedor, suporte, etc)
4. Depois peça as INSTRUÇÕES (informações que o agente precisa saber)
5. CONFIRME tudo com o cliente
6. Pergunte se quer TESTAR o agente
${hasAllConfig ? `\n✅ CONFIGURAÇÃO COMPLETA! Pergunte se quer testar o agente.\nDiga: "Tá tudo pronto! Quer testar agora? Eu viro seu agente e você pode ver como ele atende. Pra sair do teste, é só digitar #sair"` : ""}

TÉCNICAS DE PERSUASÃO:
- Mostre VALOR antes de pedir pagamento
- Deixe o cliente EXPERIMENTAR
- Seja PACIENTE e AMIGÁVEL
- Use PROVA SOCIAL ("já ajudei várias empresas...")
- Crie URGÊNCIA sutil ("essa configuração fica salva por 24h")

QUANDO CLIENTE APROVAR O TESTE:
- Use [AÇÃO:INICIAR_TESTE] para ativar modo de teste
- Diga que pra sair é só digitar #sair

APÓS O TESTE (quando cliente sair com #sair):
- Pergunte o que achou
- Mostre as funcionalidades do painel (use as mídias!)
- Se gostou, ofereça o pagamento via PIX
- Use [AÇÃO:ENVIAR_PIX] para enviar dados do PIX`;
}

/**
 * Contexto para clientes ativos (já tem conta)
 */
async function getActiveClientContext(session: ClientSession): Promise<string> {
  let connectionStatus = "⚠️ Não verificado";
  let subscriptionStatus = "⚠️ Não verificado";
  
  if (session.userId) {
    try {
      const connection = await storage.getConnectionByUserId(session.userId);
      connectionStatus = connection?.isConnected 
        ? `✅ Conectado (${connection.phoneNumber})`
        : "❌ Desconectado";
    } catch {}
    
    try {
      const sub = await storage.getUserSubscription(session.userId);
      if (sub) {
        const isActive = sub.status === 'active' || sub.status === 'trialing';
        subscriptionStatus = isActive ? `✅ ${sub.status}` : `❌ ${sub.status}`;
      }
    } catch {}
  }
  
  return `
📋 ESTADO ATUAL: CLIENTE ATIVO (já tem conta)

DADOS DA CONTA:
- ID: ${session.userId}
- Email: ${session.email}
- WhatsApp: ${connectionStatus}
- Assinatura: ${subscriptionStatus}

✅ O QUE VOCÊ PODE FAZER:
- Ajudar com problemas de conexão
- Alterar configurações do agente
- Processar pagamentos
- Resolver problemas técnicos
- Ativar/desativar agente

❌ NÃO FAÇA:
- NÃO pergunte email novamente
- NÃO inicie onboarding
- NÃO explique tudo do zero`;
}

// ============================================================================
// PROCESSADOR DE AÇÕES DA IA
// ============================================================================

interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

function parseActions(response: string): { cleanText: string; actions: ParsedAction[] } {
  const actionRegex = /\[(?:AÇÃO:)?([A-Z_]+)([^\]]*)\]/g;
  const actions: ParsedAction[] = [];
  
  const validActions = [
    "SALVAR_CONFIG",
    "SALVAR_PROMPT",
    "INICIAR_TESTE",
    "ENVIAR_PIX",
    "NOTIFICAR_PAGAMENTO",
    "AGENDAR_CONTATO",
    "CRIAR_CONTA",
  ];
  
  let match;
  while ((match = actionRegex.exec(response)) !== null) {
    const type = match[1];
    
    if (!validActions.includes(type)) continue;
    
    const paramsStr = match[2];
    const params: Record<string, string> = {};
    
    const paramRegex = /(\w+)="([^"]*)"/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      params[paramMatch[1]] = paramMatch[2];
    }
    
    actions.push({ type, params });
    console.log(`🔧 [SALES] Ação detectada: ${type}`, params);
  }
  
  const cleanText = response.replace(/\[(?:AÇÃO:)?[A-Z_]+[^\]]*\]/g, "").trim();
  
  return { cleanText, actions };
}

async function executeActions(session: ClientSession, actions: ParsedAction[]): Promise<{
  sendPix?: boolean;
  notifyOwner?: boolean;
  startTestMode?: boolean;
}> {
  const results: { 
    sendPix?: boolean; 
    notifyOwner?: boolean;
    startTestMode?: boolean;
  } = {};
  
  for (const action of actions) {
    console.log(`🔧 [SALES] Executando ação: ${action.type}`, action.params);
    
    switch (action.type) {
      case "SALVAR_CONFIG":
        const agentConfig = { ...session.agentConfig };
        if (action.params.nome) agentConfig.name = action.params.nome;
        if (action.params.empresa) agentConfig.company = action.params.empresa;
        if (action.params.funcao) agentConfig.role = action.params.funcao;
        updateClientSession(session.phoneNumber, { agentConfig });
        console.log(`✅ [SALES] Config salva:`, agentConfig);
        break;
        
      case "SALVAR_PROMPT":
        if (action.params.prompt) {
          const config = session.agentConfig || {};
          config.prompt = action.params.prompt;
          updateClientSession(session.phoneNumber, { agentConfig: config });
          console.log(`✅ [SALES] Prompt salvo (${action.params.prompt.length} chars)`);
        }
        break;
        
      case "INICIAR_TESTE":
        updateClientSession(session.phoneNumber, { flowState: 'test_mode' });
        results.startTestMode = true;
        console.log(`🧪 [SALES] Modo de teste ATIVADO para ${session.phoneNumber}`);
        break;
        
      case "ENVIAR_PIX":
        updateClientSession(session.phoneNumber, { 
          awaitingPaymentProof: true,
          flowState: 'payment_pending'
        });
        results.sendPix = true;
        break;
        
      case "NOTIFICAR_PAGAMENTO":
        results.notifyOwner = true;
        break;
        
      case "AGENDAR_CONTATO":
        if (action.params.data) {
          const scheduledDate = parseScheduleFromText(action.params.data);
          if (scheduledDate) {
            scheduleContact(session.phoneNumber, scheduledDate, action.params.motivo || 'Retorno agendado');
            console.log(`📅 [SALES] Contato agendado para ${scheduledDate.toLocaleString('pt-BR')}`);
          }
        }
        break;
        
      case "CRIAR_CONTA":
        // Criar conta real (após pagamento)
        if (action.params.email) {
          updateClientSession(session.phoneNumber, { email: action.params.email });
        }
        const result = await createClientAccount(session);
        if (result.success) {
          updateClientSession(session.phoneNumber, { 
            userId: result.userId,
            flowState: 'active'
          });
        }
        break;
    }
  }
  
  return results;
}

// ============================================================================
// GERADOR DE RESPOSTA COM IA
// ============================================================================

export async function generateAIResponse(session: ClientSession, userMessage: string): Promise<string> {
  try {
    const mistral = await getLLMClient();
    const systemPrompt = await getMasterPrompt(session);
    
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    
    // Adicionar histórico da conversa
    for (const msg of session.conversationHistory.slice(-15)) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
    
    messages.push({ role: "user", content: userMessage });
    
    console.log(`🤖 [SALES] Gerando resposta para: "${userMessage.substring(0, 50)}..." (state: ${session.flowState})`);
    
    // Usa modelo configurado no banco de dados (sem hardcode)
    const response = await mistral.chat.complete({
      messages: messages,
      maxTokens: 400,
      temperature: 0.8,
    });
    
    const responseText = response.choices?.[0]?.message?.content;
    
    if (!responseText) {
      return "Opa, deu um problema aqui. Pode mandar de novo?";
    }
    
    return typeof responseText === "string" ? responseText : String(responseText);
  } catch (error) {
    console.error("[SALES] Erro ao gerar resposta:", error);
    return "Desculpa, tive um problema técnico. Pode repetir?";
  }
}

// ============================================================================
// PROCESSADOR PRINCIPAL DE MENSAGENS
// ============================================================================

export interface AdminAgentResponse {
  text: string;
  mediaActions?: Array<{
    type: 'send_media';
    media_name: string;
    mediaData?: AdminMedia;
  }>;
  actions?: {
    sendPix?: boolean;
    notifyOwner?: boolean;
    startTestMode?: boolean;
  };
}

async function getAdminAgentConfig(): Promise<{
  triggerPhrases: string[];
  messageSplitChars: number;
  responseDelaySeconds: number;
  isActive: boolean;
}> {
  try {
    const triggerPhrasesConfig = await storage.getSystemConfig("admin_agent_trigger_phrases");
    const splitCharsConfig = await storage.getSystemConfig("admin_agent_message_split_chars");
    const delayConfig = await storage.getSystemConfig("admin_agent_response_delay_seconds");
    const isActiveConfig = await storage.getSystemConfig("admin_agent_is_active");
    
    let triggerPhrases: string[] = [];
    if (triggerPhrasesConfig?.valor) {
      try {
        triggerPhrases = JSON.parse(triggerPhrasesConfig.valor);
      } catch {
        triggerPhrases = [];
      }
    }
    
    return {
      triggerPhrases,
      messageSplitChars: parseInt(splitCharsConfig?.valor || "400", 10),
      responseDelaySeconds: parseInt(delayConfig?.valor || "30", 10),
      isActive: isActiveConfig?.valor === "true",
    };
  } catch {
    return {
      triggerPhrases: [],
      messageSplitChars: 400,
      responseDelaySeconds: 30,
      isActive: true,
    };
  }
}

function checkTriggerPhrases(
  message: string,
  conversationHistory: Array<{ content: string }>,
  triggerPhrases: string[]
): { hasTrigger: boolean; foundIn: string } {
  if (!triggerPhrases || triggerPhrases.length === 0) {
    return { hasTrigger: true, foundIn: "no-filter" };
  }
  
  const normalize = (s: string) => (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const allMessages = [
    ...conversationHistory.map(m => m.content || ""),
    message
  ].join(" ");

  let foundIn = "none";
  const hasTrigger = triggerPhrases.some(phrase => {
    const inLast = normalize(message).includes(normalize(phrase));
    const inAll = inLast ? false : normalize(allMessages).includes(normalize(phrase));
    if (inLast) foundIn = "last"; else if (inAll) foundIn = "history";
    return inLast || inAll;
  });

  return { hasTrigger, foundIn };
}

export async function processAdminMessage(
  phoneNumber: string,
  messageText: string,
  mediaType?: string,
  mediaUrl?: string,
  skipTriggerCheck: boolean = false
): Promise<AdminAgentResponse | null> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COMANDOS ESPECIAIS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // #limpar, #reset, #novo - Limpar sessão para testes
  if (messageText.match(/^#(limpar|reset|novo)$/i)) {
    clearClientSession(cleanPhone);
    return {
      text: "✅ Sessão limpa! Agora você pode testar novamente como se fosse um cliente novo.",
      actions: {},
    };
  }
  
  // Obter ou criar sessão
  let session = getClientSession(cleanPhone);
  if (!session) {
    session = createClientSession(cleanPhone);
  }
  
  // #sair - Sair do modo de teste
  if (messageText.match(/^#sair$/i) && session.flowState === 'test_mode') {
    updateClientSession(cleanPhone, { flowState: 'post_test' });
    cancelFollowUp(cleanPhone);
    
    return {
      text: "Saiu do modo de teste! 🎭\n\nE aí, o que achou? Gostou de como o agente atendeu? 😊",
      actions: {},
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CANCELAR FOLLOW-UP SE CLIENTE RESPONDEU
  // ═══════════════════════════════════════════════════════════════════════════
  cancelFollowUp(cleanPhone);
  
  // Buscar configurações
  const adminConfig = await getAdminAgentConfig();
  
  // Carregar histórico do banco se sessão vazia
  if (session.conversationHistory.length === 0) {
    try {
      const conversation = await storage.getAdminConversationByPhone(cleanPhone);
      if (conversation) {
        const messages = await storage.getAdminMessages(conversation.id);
        session.conversationHistory = messages.slice(-30).map((msg: any) => ({
          role: (msg.fromMe ? "assistant" : "user") as "user" | "assistant",
          content: msg.text || "",
          timestamp: msg.timestamp || new Date(),
        }));
        console.log(`📚 [SALES] ${session.conversationHistory.length} mensagens restauradas do banco`);
      }
    } catch {}
  }
  
  // Verificar trigger phrases (exceto em modo de teste)
  if (!skipTriggerCheck && session.flowState !== 'test_mode') {
    const triggerResult = checkTriggerPhrases(
      messageText,
      session.conversationHistory,
      adminConfig.triggerPhrases
    );
    
    if (!triggerResult.hasTrigger) {
      console.log(`⏸️ [SALES] Sem trigger para ${cleanPhone}`);
      addToConversationHistory(cleanPhone, "user", messageText);
      return null;
    }
  }
  
  // Adicionar mensagem ao histórico
  addToConversationHistory(cleanPhone, "user", messageText);
  
  // Verificar comprovante de pagamento
  if (mediaType === "image" && session.awaitingPaymentProof) {
    const text = "Recebi seu comprovante! 🎉 Vou verificar e liberar sua conta. Isso leva no máximo 1 hora em horário comercial!";
    addToConversationHistory(cleanPhone, "assistant", text);
    updateClientSession(cleanPhone, { awaitingPaymentProof: false });
    
    return {
      text,
      actions: { notifyOwner: true },
    };
  }
  
  // Gerar resposta com IA
  const aiResponse = await generateAIResponse(session, messageText);
  console.log(`🤖 [SALES] Resposta: ${aiResponse.substring(0, 200)}...`);
  
  // Parse ações
  const { cleanText: textWithoutActions, actions } = parseActions(aiResponse);
  
  // Parse tags de mídia
  const { cleanText, mediaActions } = parseAdminMediaTags(textWithoutActions);
  
  // Processar mídias
  const processedMediaActions: Array<{
    type: 'send_media';
    media_name: string;
    mediaData?: AdminMedia;
  }> = [];
  
  for (const action of mediaActions) {
    const mediaData = await getAdminMediaByName(undefined, action.media_name);
    if (mediaData) {
      processedMediaActions.push({
        type: 'send_media',
        media_name: action.media_name,
        mediaData,
      });
    }
  }
  
  // Executar ações
  const actionResults = await executeActions(session, actions);
  
  // Adicionar resposta ao histórico
  addToConversationHistory(cleanPhone, "assistant", cleanText);
  
  // Agendar follow-up automático (10 minutos)
  if (session.flowState !== 'test_mode' && session.flowState !== 'active') {
    scheduleAutoFollowUp(cleanPhone, 10, `Cliente estava em: ${session.flowState}`);
  }
  
  return {
    text: cleanText,
    mediaActions: processedMediaActions.length > 0 ? processedMediaActions : undefined,
    actions: actionResults,
  };
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

async function findUserByPhone(phone: string): Promise<any | undefined> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const users = await storage.getAllUsers();
    return users.find(u => u.phone?.replace(/\D/g, "") === cleanPhone);
  } catch {
    return undefined;
  }
}

export async function createClientAccount(session: ClientSession): Promise<{ userId: string; success: boolean; error?: string }> {
  try {
    // Se não tem email, gerar um fictício
    const email = session.email || generateTempEmail(session.phoneNumber);
    
    // Verificar se já existe
    const users = await storage.getAllUsers();
    const existing = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
      updateClientSession(session.phoneNumber, { userId: existing.id });
      return { userId: existing.id, success: true };
    }
    
    // Criar usuário
    const user = await storage.upsertUser({
      email: email,
      name: session.agentConfig?.company || "Cliente",
      phone: session.phoneNumber,
      role: "user",
    });
    
    // Criar config do agente
    if (session.agentConfig?.prompt) {
      const fullPrompt = `Você é ${session.agentConfig.name || "o atendente"}, ${session.agentConfig.role || "atendente"} da ${session.agentConfig.company || "empresa"}.

${session.agentConfig.prompt}

REGRAS:
- Seja educado e prestativo
- Respostas curtas e objetivas
- Linguagem natural
- Não invente informações`;

      await storage.upsertAgentConfig(user.id, {
        prompt: fullPrompt,
        isActive: true,
        model: undefined, // Usa modelo do banco de dados via getLLMClient()
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });
    }
    
    // Criar trial de 24h
    const plans = await storage.getActivePlans();
    const basicPlan = plans[0];
    
    if (basicPlan) {
      const trialEnd = new Date();
      trialEnd.setHours(trialEnd.getHours() + 24);
      
      await storage.createSubscription({
        userId: user.id,
        planId: basicPlan.id,
        status: "trialing",
        dataInicio: new Date(),
        dataFim: trialEnd,
      });
    }
    
    updateClientSession(session.phoneNumber, { userId: user.id, email: email });
    console.log(`✅ [SALES] Conta criada: ${email} (ID: ${user.id})`);
    
    return { userId: user.id, success: true };
  } catch (error) {
    console.error("[SALES] Erro ao criar conta:", error);
    return { userId: "", success: false, error: String(error) };
  }
}

export async function getOwnerNotificationNumber(): Promise<string> {
  const config = await storage.getSystemConfig("owner_notification_number");
  return config?.valor || "5517991956944";
}

export async function setOwnerNotificationNumber(number: string): Promise<void> {
  await storage.updateSystemConfig("owner_notification_number", number);
}

/**
 * Gera resposta de follow-up contextualizada
 */
export async function generateFollowUpResponse(phoneNumber: string, context: string): Promise<string> {
  const session = getClientSession(phoneNumber);
  if (!session) return "";
  
  try {
    const mistral = await getLLMClient();
    
    const prompt = `Você é o Rodrigo, vendedor humano da AgenteZap.
O cliente parou de responder há alguns minutos.
Contexto: ${context}
Estado do cliente: ${session.flowState}
Config coletada: ${JSON.stringify(session.agentConfig || {})}

Gere uma mensagem de follow-up CURTA e NATURAL para retomar a conversa.
Não seja insistente. Seja amigável e mostre que está disponível.
NÃO use ações [AÇÃO:...]. Apenas texto natural.`;

    // Usa modelo configurado no banco de dados (sem hardcode)
    const response = await mistral.chat.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 150,
      temperature: 0.9,
    });
    
    return response.choices?.[0]?.message?.content?.toString() || "";
  } catch {
    return "Oi! Ainda tá por aí? 😊";
  }
}

/**
 * Gera resposta para contato agendado
 */
export async function generateScheduledContactResponse(phoneNumber: string, reason: string): Promise<string> {
  const session = getClientSession(phoneNumber);
  
  try {
    const mistral = await getLLMClient();
    
    const prompt = `Você é o Rodrigo, vendedor humano da AgenteZap.
Você agendou de entrar em contato com o cliente hoje.
Motivo do agendamento: ${reason}
Estado do cliente: ${session?.flowState || 'desconhecido'}

Gere uma mensagem de retorno NATURAL e AMIGÁVEL.
Mencione que você prometeu retornar.
NÃO use ações [AÇÃO:...]. Apenas texto natural.`;

    // Usa modelo configurado no banco de dados (sem hardcode)
    const response = await mistral.chat.complete({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 150,
      temperature: 0.9,
    });
    
    return response.choices?.[0]?.message?.content?.toString() || "Oi! Voltando como combinado 😊";
  } catch {
    return "Oi! Voltando como combinado. Tudo bem? 😊";
  }
}
