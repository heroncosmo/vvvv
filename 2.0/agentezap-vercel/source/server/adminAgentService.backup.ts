/**
 * 🤖 SERVIÇO DE ATENDIMENTO AUTOMATIZADO DO ADMIN (RODRIGO) - 100% IA
 * 
 * Este serviço usa IA REAL para atender de forma natural e inteligente.
 * A IA analisa cada mensagem e decide:
 * - O que responder
 * - Quais ações executar (criar conta, configurar agente, etc.)
 * - Quais mídias enviar (imagens, áudios, vídeos, documentos)
 * 
 * NÃO é um chatbot com fluxos fixos - é IA conversacional.
 */

import { storage } from "./storage";
import { generatePixQRCode } from "./pixService";
import { getMistralClient } from "./mistralClient";
import { v4 as uuidv4 } from "uuid";
import { 
  generateAdminMediaPromptBlock, 
  parseAdminMediaTags, 
  getAdminMediaByName,
  type AdminMedia 
} from "./adminMediaStore";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface ClientSession {
  id: string;
  phoneNumber: string;
  userId?: string;
  email?: string;
  agentConfig?: {
    name?: string;
    company?: string;
    role?: string;
    prompt?: string;
  };
  subscriptionId?: string;
  pairingCodeRequested?: boolean;
  awaitingPaymentProof?: boolean;
  lastInteraction: Date;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>;
}

// Cache de sessões de clientes em memória
const clientSessions = new Map<string, ClientSession>();

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
    lastInteraction: new Date(),
    conversationHistory: [],
  };
  
  clientSessions.set(cleanPhone, session);
  console.log(`📱 [ADMIN AGENT] Nova sessão criada para ${cleanPhone}`);
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

// Limpar sessão de um cliente (para testes)
export function clearClientSession(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const existed = clientSessions.has(cleanPhone);
  clientSessions.delete(cleanPhone);
  if (existed) {
    console.log(`🗑️ [ADMIN AGENT] Sessão do cliente ${cleanPhone} removida da memória`);
  }
  return existed;
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
// PROMPT MESTRE DO AGENTE RODRIGO
// ============================================================================

async function getMasterPrompt(session: ClientSession): Promise<string> {
  // Buscar prompt configurado no admin (se existir)
  const configPrompt = await storage.getSystemConfig("admin_agent_prompt");
  const customInstructions = configPrompt?.valor || "";
  
  console.log(`📱 [ADMIN AGENT] getMasterPrompt para telefone: ${session.phoneNumber}`);
  console.log(`📱 [ADMIN AGENT] Session userId atual: ${session.userId}`);
  
  // Verificar se cliente já existe pelo telefone
  const existingUser = await findUserByPhone(session.phoneNumber);
  console.log(`📱 [ADMIN AGENT] findUserByPhone resultado:`, existingUser ? `${existingUser.email} (${existingUser.id})` : "não encontrado");
  
  if (existingUser) {
    console.log(`✅ [ADMIN AGENT] CLIENTE IDENTIFICADO:`);
    console.log(`   - Nome: ${existingUser.name || 'não informado'}`);
    console.log(`   - Email: ${existingUser.email}`);
    console.log(`   - ID: ${existingUser.id}`);
    console.log(`   - Telefone verificado: ${existingUser.phone === session.phoneNumber ? '✅ SIM (autenticado)' : '⚠️ diferente'}`);
  } else {
    console.log(`🆕 [ADMIN AGENT] Cliente novo - sem conta no sistema`);
  }
  
  // Se encontrou usuário e não está na sessão, atualizar sessão
  if (existingUser && !session.userId) {
    console.log(`📱 [ADMIN AGENT] Atualizando sessão com userId: ${existingUser.id}`);
    updateClientSession(session.phoneNumber, { 
      userId: existingUser.id,
      email: existingUser.email 
    });
    session.userId = existingUser.id;
    session.email = existingUser.email;
  }
  
  // ============================================================================
  // BUSCAR CONTEXTO COMPLETO DO CLIENTE NO BANCO DE DADOS
  // ============================================================================
  let clientInfo = "";
  let connectionStatus = "";
  let subscriptionStatus = "";
  let agentConfigStatus = "";
  
  // Buscar histórico de conversas para contexto adicional
  let conversationHistory = "";
  try {
    const conversation = await storage.getAdminConversationByPhone(session.phoneNumber);
    if (conversation) {
      const messages = await storage.getAdminMessages(conversation.id);
      const totalMessages = messages.length;
      const firstMessage = messages[0];
      const firstDate = firstMessage?.timestamp ? new Date(firstMessage.timestamp).toLocaleDateString('pt-BR') : 'desconhecida';
      
      console.log(`📊 [ADMIN AGENT] Histórico carregado do banco:`);
      console.log(`   - Conversation ID: ${conversation.id}`);
      console.log(`   - Total de mensagens: ${totalMessages}`);
      console.log(`   - Primeira conversa: ${firstDate}`);
      
      conversationHistory = `
📊 HISTÓRICO DE CONVERSAS:
- Total de mensagens trocadas: ${totalMessages}
- Primeira conversa: ${firstDate}
- Cliente já conhece a AgenteZap: SIM (não precisa explicar tudo novamente)
- Contexto: Cliente retornando, seja direto e objetivo`;
    } else {
      console.log(`📊 [ADMIN AGENT] Nenhum histórico encontrado - primeira conversa`);
    }
  } catch (e) {
    console.log(`⚠️ [ADMIN AGENT] Erro ao buscar histórico:`, e);
  }
  
  if (session.userId) {
    // Buscar conexão WhatsApp
    try {
      const connection = await storage.getConnectionByUserId(session.userId);
      if (connection) {
        connectionStatus = connection.isConnected 
          ? `✅ WhatsApp CONECTADO (número: ${connection.phoneNumber})`
          : `❌ WhatsApp DESCONECTADO (precisa reconectar)`;
      } else {
        connectionStatus = `⚠️ WhatsApp nunca foi conectado`;
      }
    } catch (e) {
      connectionStatus = `⚠️ Status da conexão não verificado`;
    }
    
    // Buscar assinatura
    try {
      const subscription = await storage.getUserSubscription(session.userId);
      if (subscription) {
        const now = new Date();
        const endDate = subscription.dataFim ? new Date(subscription.dataFim) : null;
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';
        const isExpired = endDate && endDate < now;
        
        if (subscription.status === 'trialing') {
          subscriptionStatus = `🆓 Em período de TRIAL (termina em: ${endDate?.toLocaleDateString('pt-BR') || 'não definido'})`;
        } else if (subscription.status === 'active' && !isExpired) {
          subscriptionStatus = `✅ Assinatura ATIVA (plano: ${subscription.plan?.nome || 'padrão'}, válida até: ${endDate?.toLocaleDateString('pt-BR') || 'indefinido'})`;
        } else if (subscription.status === 'pending') {
          subscriptionStatus = `⏳ Pagamento PENDENTE - cliente precisa pagar R$ 99 via PIX`;
        } else {
          subscriptionStatus = `❌ Assinatura EXPIRADA/INATIVA - precisa renovar pagamento`;
        }
      } else {
        subscriptionStatus = `⚠️ Sem assinatura - oferecer trial de 24h ou pagamento`;
      }
    } catch (e) {
      subscriptionStatus = `⚠️ Status da assinatura não verificado`;
    }
    
    // Buscar configuração do agente
    try {
      const agentConfig = await storage.getAgentConfig(session.userId);
      if (agentConfig) {
        const hasPrompt = agentConfig.prompt && agentConfig.prompt.length > 10;
        const isAgentActive = agentConfig.isActive;
        
        agentConfigStatus = `
  - Agente configurado: ${hasPrompt ? 'SIM' : 'NÃO (precisa definir instruções)'}
  - Agente ativo: ${isAgentActive ? 'SIM' : 'NÃO (desativado)'}
  - Modelo IA: ${agentConfig.model || 'padrão'}`;
      } else {
        agentConfigStatus = `⚠️ Agente IA ainda não configurado`;
      }
    } catch (e) {
      agentConfigStatus = `⚠️ Configuração do agente não verificada`;
    }
    
    // Montar informação completa do cliente EXISTENTE
    clientInfo = `
═══════════════════════════════════════════════════════════════
🔴 ATENÇÃO: ESTE CLIENTE JÁ POSSUI CONTA NO SISTEMA! 🔴
═══════════════════════════════════════════════════════════════

DADOS DA CONTA:
- ID do usuário: ${session.userId}
- Email: ${session.email || existingUser?.email || "não informado"}
- Nome: ${existingUser?.name || "não informado"}
- Telefone: ${session.phoneNumber}
- 🔐 NÚMERO VERIFICADO: ✅ SIM (este é o número que criou a conta)
${conversationHistory}

STATUS ATUAL:
- ${connectionStatus}
- ${subscriptionStatus}
${agentConfigStatus}

🚫 IMPORTANTE - NÃO FAÇA ISSO:
- NÃO pergunte o email novamente (já tem)
- NÃO ofereça criar conta nova (já tem)
- NÃO inicie o fluxo de onboarding (já concluiu)
- NÃO explique tudo do zero (cliente já conhece o sistema)

✅ O QUE VOCÊ PODE FAZER (CLIENTE AUTENTICADO POR NÚMERO):
- Ajudar a RECONECTAR o WhatsApp (oferecer QR Code ou código de 8 dígitos)
- Ajudar a ALTERAR configurações do agente (nome, instruções, personalidade)
- ATIVAR ou DESATIVAR o agente
- VER e ALTERAR dados da conta (nome, email)
- Processar PAGAMENTOS ou renovações
- Fazer UPGRADE ou DOWNGRADE de plano
- Ver histórico de conversas e estatísticas
- Resolver problemas técnicos
- Reativar o agente se estiver desativado

💡 COMO AGIR:
- Seja DIRETO e OBJETIVO (cliente já conhece a AgenteZap)
- Foque em RESOLVER o problema atual
- Use o contexto do histórico para continuar conversas anteriores
- Como está AUTENTICADO por número, pode fazer TUDO pelo WhatsApp

SE O CLIENTE PEDIR PARA CONECTAR:
- Pergunte se prefere QR Code (computador) ou código de 8 dígitos (celular)
- Use [AÇÃO:ENVIAR_QRCODE] para QR Code
- Use [AÇÃO:SOLICITAR_CODIGO_PAREAMENTO] para código de 8 dígitos
- NUNCA pergunte "quer que eu tente de novo" ou diga "se não aparecer" — o sistema tenta automaticamente e envia assim que gerar
═══════════════════════════════════════════════════════════════`;
  } else if (session.email) {
    // Tem email mas ainda não tem userId (em processo de criar conta)
    clientInfo = `
DADOS COLETADOS ATÉ AGORA (CONTA EM CRIAÇÃO):
- Email: ${session.email}
- Nome do agente: ${session.agentConfig?.name || "não definido"}
- Empresa: ${session.agentConfig?.company || "não definida"}
- Função: ${session.agentConfig?.role || "não definida"}
- Instruções: ${session.agentConfig?.prompt ? "já configuradas" : "não configuradas"}

Continue o fluxo de configuração normalmente.`;
  } else {
    // Cliente novo - sem email e sem userId
    clientInfo = `
CLIENTE NOVO - PRIMEIRO CONTATO
Este cliente ainda não tem conta no sistema.
Inicie o fluxo de onboarding pedindo o email primeiro.`;
  }

  return `Você é o Rodrigo, atendente HUMANO da AgenteZap. Você NÃO é um robô ou IA - você é uma pessoa real atendendo pelo WhatsApp.

${customInstructions ? `INSTRUÇÕES PERSONALIZADAS:\n${customInstructions}\n\n` : ""}

SOBRE A AGENTEZAP:
- Plataforma de automação de WhatsApp com Inteligência Artificial
- Criamos agentes de IA personalizados que atendem clientes 24/7
- Plano: R$ 99/mês - Conversas ilimitadas, 1 agente IA
- Trial: 24 horas GRÁTIS para testar
- Pagamento: PIX para rodrigoconexao128@gmail.com

COMO VOCÊ ATENDE:
1. Fale de forma natural, como um humano no WhatsApp
2. Use linguagem informal mas respeitosa (você/vc, tá/está, pra/para)
3. Respostas CURTAS (2-4 linhas), como mensagem de WhatsApp
4. Use emojis com moderação (1-2 por mensagem)
5. NUNCA use markdown (**, ##, etc.) - isso não funciona no WhatsApp
6. NUNCA diga que é IA/robô/assistente virtual
7. Faça UMA pergunta por vez, não várias
8. Seja paciente e ajude clientes que não entendem de tecnologia
${clientInfo}

FLUXO NATURAL DE ATENDIMENTO (APENAS PARA CLIENTES NOVOS SEM CONTA):
- Se novo cliente quer criar conta: peça email primeiro
- Depois do email confirmado: pergunte nome do agente IA
- Depois: pergunte nome da empresa
- Depois: pergunte a função do agente (atendente, vendedor, etc)
- Depois: peça as instruções/informações que o agente precisa saber
- Por fim: ofereça conectar o WhatsApp (QR Code ou código de 8 dígitos)
- Mencione o trial de 24h grátis e o pagamento de R$ 99/mês

SE CLIENTE JÁ TEM CONTA (verifique a seção "CLIENTE JÁ POSSUI CONTA" acima):
- NUNCA pergunte o email novamente
- NUNCA ofereça criar conta nova  
- NUNCA inicie o fluxo de onboarding
- Ajude a RECONECTAR WhatsApp quando solicitado
- Ajude a alterar configurações do agente
- Ajude com problemas de conexão
- Processe pagamentos (peça comprovante)

PARA CONECTAR/RECONECTAR WHATSAPP DE CLIENTE EXISTENTE:
- Sempre pergunte se prefere QR Code (computador) ou código de 8 dígitos (celular)
- OBRIGATÓRIO: Se cliente pedir QR Code/computador: INCLUA [AÇÃO:ENVIAR_QRCODE] no final
- OBRIGATÓRIO: Se cliente pedir código/celular: INCLUA [AÇÃO:SOLICITAR_CODIGO_PAREAMENTO] no final
- O cliente pode mudar de ideia e pedir outro método - isso é normal, atenda!
- Quando usar uma dessas ações, apenas diga que vai gerar/enviar e peça para aguardar; NÃO peça para o cliente tentar novamente (o sistema continua tentando sozinho)

AÇÕES DISPONÍVEIS (SEMPRE INCLUA A AÇÃO CORRESPONDENTE):
Quando quiser executar uma ação, SEMPRE inclua no final da sua resposta em uma linha separada:
[AÇÃO:CRIAR_CONTA email="email@exemplo.com"]
[AÇÃO:SALVAR_CONFIG nome="Laura" empresa="Loja X" funcao="Atendente"]
[AÇÃO:SALVAR_PROMPT prompt="texto das instruções"]
[AÇÃO:SOLICITAR_CODIGO_PAREAMENTO] - SEMPRE use quando cliente pedir código de 8 dígitos ou celular
[AÇÃO:ENVIAR_QRCODE] - SEMPRE use quando cliente pedir QR Code ou computador
[AÇÃO:ENVIAR_PIX]
[AÇÃO:NOTIFICAR_PAGAMENTO]
[AÇÃO:DESCONECTAR_WHATSAPP] - Use quando cliente pedir para desconectar o WhatsApp

Essas ações são processadas automaticamente - não mencione elas para o cliente.

INFORMAÇÕES DO PIX:
- Valor: R$ 99,00
- Chave PIX (email): rodrigoconexao128@gmail.com
- Nome: Rodrigo

${await (async () => {
  // Sistema single-admin: não precisa especificar adminId
  const mediaBlock = await generateAdminMediaPromptBlock();
  console.log(`📁 [ADMIN AGENT] Bloco de mídias gerado (${mediaBlock.length} chars)`);
  if (mediaBlock.length > 0) {
    console.log(`📁 [ADMIN AGENT] Primeiros 200 chars: ${mediaBlock.substring(0, 200)}...`);
  }
  return mediaBlock;
})()}

SE O CLIENTE JÁ TEM CONTA E PEDIR PARA ACESSAR:
- Informe o email da conta: ${session.email || "[não definido ainda]"}
- Diga que a senha foi gerada automaticamente ou pode redefinir
- Oriente a acessar o painel: https://agentezap.com/login

IMPORTANTE: Responda como se estivesse digitando no WhatsApp, de forma natural e humana.`;
}

// ============================================================================
// PROCESSADOR DE AÇÕES DA IA
// ============================================================================

interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

function parseActions(response: string): { cleanText: string; actions: ParsedAction[] } {
  // Aceita AMBOS os formatos: [AÇÃO:ENVIAR_QRCODE] e [ENVIAR_QRCODE]
  const actionRegex = /\[(?:AÇÃO:)?([A-Z_]+)([^\]]*)\]/g;
  const actions: ParsedAction[] = [];
  
  // Lista de ações válidas para evitar confusão com mídias
  const validActions = [
    "CRIAR_CONTA",
    "SALVAR_CONFIG", 
    "SALVAR_PROMPT",
    "SOLICITAR_CODIGO_PAREAMENTO",
    "ENVIAR_QRCODE",
    "ENVIAR_PIX",
    "NOTIFICAR_PAGAMENTO",
    "DESCONECTAR_WHATSAPP"
  ];
  
  let match;
  while ((match = actionRegex.exec(response)) !== null) {
    const type = match[1];
    
    // Só processa se for uma ação válida (ignora mídias)
    if (!validActions.includes(type)) {
      continue;
    }
    
    const paramsStr = match[2];
    const params: Record<string, string> = {};
    
    // Parse params like email="value" nome="value"
    const paramRegex = /(\w+)="([^"]*)"/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      params[paramMatch[1]] = paramMatch[2];
    }
    
    actions.push({ type, params });
    console.log(`🔧 [ADMIN AGENT] Ação detectada: ${type}`, params);
  }
  
  // Remove action tags from text (ambos formatos)
  const cleanText = response.replace(/\[(?:AÇÃO:)?[A-Z_]+[^\]]*\]/g, "").trim();
  
  return { cleanText, actions };
  
  return { cleanText, actions };
}

async function executeActions(session: ClientSession, actions: ParsedAction[]): Promise<{
  notifyOwner?: boolean;
  connectWhatsApp?: boolean;
  sendPix?: boolean;
  sendQrCode?: boolean;
  pairingCode?: string;
  disconnectWhatsApp?: boolean;
}> {
  const results: { 
    notifyOwner?: boolean; 
    connectWhatsApp?: boolean; 
    sendPix?: boolean;
    sendQrCode?: boolean;
    pairingCode?: string;
    disconnectWhatsApp?: boolean;
  } = {};
  
  for (const action of actions) {
    console.log(`🔧 [ADMIN AGENT] Executando ação: ${action.type}`, action.params);
    
    switch (action.type) {
      case "CRIAR_CONTA":
        if (action.params.email) {
          updateClientSession(session.phoneNumber, { email: action.params.email });
          // Criar conta imediatamente com o email para ter userId disponível
          const updatedSession = getClientSession(session.phoneNumber);
          if (updatedSession) {
            const result = await createClientAccount(updatedSession);
            if (result.success) {
              console.log(`✅ [ADMIN AGENT] Conta criada com email: ${action.params.email} (ID: ${result.userId})`);
            }
          }
        }
        break;
        
      case "SALVAR_CONFIG":
        const agentConfig = { ...session.agentConfig };
        if (action.params.nome) agentConfig.name = action.params.nome;
        if (action.params.empresa) agentConfig.company = action.params.empresa;
        if (action.params.funcao) agentConfig.role = action.params.funcao;
        updateClientSession(session.phoneNumber, { agentConfig });
        break;
        
      case "SALVAR_PROMPT":
        if (action.params.prompt) {
          const config = session.agentConfig || {};
          config.prompt = action.params.prompt;
          updateClientSession(session.phoneNumber, { agentConfig: config });
          
          // Se tem todos os dados e tem userId, atualizar agente
          const currentSession = getClientSession(session.phoneNumber);
          if (currentSession?.userId && config.name && config.company) {
            // Atualizar configuração do agente com o prompt
            await updateAgentWithPrompt(currentSession);
          }
        }
        break;
        
      case "SOLICITAR_CODIGO_PAREAMENTO":
        updateClientSession(session.phoneNumber, { pairingCodeRequested: true });
        results.connectWhatsApp = true;
        // O código será gerado e enviado pelo whatsapp.ts
        break;
        
      case "ENVIAR_QRCODE":
        results.sendQrCode = true;
        // O QR Code será gerado e enviado como imagem pelo whatsapp.ts
        break;
        
      case "ENVIAR_PIX":
        updateClientSession(session.phoneNumber, { awaitingPaymentProof: true });
        results.sendPix = true;
        break;
        
      case "NOTIFICAR_PAGAMENTO":
        results.notifyOwner = true;
        break;
        
      case "DESCONECTAR_WHATSAPP":
        results.disconnectWhatsApp = true;
        console.log(`🔌 [ADMIN AGENT] Solicitação de desconexão de WhatsApp para ${session.phoneNumber}`);
        break;
    }
  }
  
  return results;
}

// ============================================================================
// GERADOR DE RESPOSTA COM IA REAL
// ============================================================================

export async function generateAIResponse(session: ClientSession, userMessage: string): Promise<string> {
  try {
    const mistral = await getMistralClient();
    const systemPrompt = await getMasterPrompt(session);
    
    // Construir mensagens para a IA
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    
    // Adicionar histórico da conversa (últimas 15 mensagens)
    for (const msg of session.conversationHistory.slice(-15)) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
    
    // Adicionar mensagem atual
    messages.push({ role: "user", content: userMessage });
    
    console.log(`🤖 [ADMIN AGENT] Gerando resposta IA para: "${userMessage.substring(0, 50)}..."`);
    
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: messages,
      maxTokens: 400,
      temperature: 0.8, // Mais criatividade para parecer humano
    });
    
    const responseText = response.choices?.[0]?.message?.content;
    
    if (!responseText) {
      return "Opa, deu um problema aqui. Pode mandar de novo?";
    }
    
    return typeof responseText === "string" ? responseText : String(responseText);
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao gerar resposta IA:", error);
    return "Desculpa, tive um problema técnico aqui. Pode repetir?";
  }
}

// ============================================================================
// PROCESSADOR PRINCIPAL DE MENSAGENS
// ============================================================================

export interface AdminAgentResponse {
  text: string;
  media?: {
    type: "image" | "audio" | "video" | "document";
    url: string;
    caption?: string;
  };
  // Nova propriedade para múltiplas mídias
  mediaActions?: Array<{
    type: 'send_media';
    media_name: string;
    mediaData?: AdminMedia;
  }>;
  actions?: {
    createUser?: boolean;
    sendPix?: boolean;
    connectWhatsApp?: boolean;
    notifyOwner?: boolean;
    sendQrCode?: boolean;
    pairingCode?: string;
    disconnectWhatsApp?: boolean;
  };
}

// Função auxiliar para buscar configurações do admin agent
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
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao buscar config:", error);
    return {
      triggerPhrases: [],
      messageSplitChars: 400,
      responseDelaySeconds: 30,
      isActive: true,
    };
  }
}

// Função para verificar se mensagem contém frase gatilho (mesma lógica do aiAgent.ts)
function checkTriggerPhrases(
  message: string,
  conversationHistory: Array<{ content: string }>,
  triggerPhrases: string[]
): { hasTrigger: boolean; foundIn: string } {
  if (!triggerPhrases || triggerPhrases.length === 0) {
    // Se não há frases gatilho configuradas, responde a tudo
    return { hasTrigger: true, foundIn: "no-filter" };
  }
  
  // Normalizador: lower, remove acentos, colapsa espaços
  const normalize = (s: string) => (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const includesNormalized = (haystack: string, needle: string) => {
    const h = normalize(haystack);
    const n = normalize(needle);
    if (!n) return false;
    // também tolera ausência/presença de espaços
    const hNoSpace = h.replace(/\s+/g, "");
    const nNoSpace = n.replace(/\s+/g, "");
    return h.includes(n) || hNoSpace.includes(nNoSpace);
  };

  console.log(`🔍 [ADMIN AGENT] Verificando trigger phrases (${triggerPhrases.length} configuradas)`);
  console.log(`   Trigger phrases: ${triggerPhrases.join(', ')}`);

  const allMessages = [
    ...conversationHistory.map(m => m.content || ""),
    message
  ].join(" ");

  // Checa primeiro só a última mensagem, depois o histórico completo
  let foundIn = "none";
  const hasTrigger = triggerPhrases.some(phrase => {
    const inLast = includesNormalized(message, phrase);
    const inAll = inLast ? false : includesNormalized(allMessages, phrase);
    if (inLast) foundIn = "last"; else if (inAll) foundIn = "history";
    console.log(`   Procurando "${phrase}" → last:${inLast ? '✅' : '❌'} | history:${inAll ? '✅' : '❌'}`);
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
  
  // Obter ou criar sessão
  let session = getClientSession(cleanPhone);
  if (!session) {
    session = createClientSession(cleanPhone);
  }
  
  // Buscar configurações do admin agent
  const adminConfig = await getAdminAgentConfig();
  
  console.log(`🔧 [ADMIN AGENT] Configurações carregadas:`);
  console.log(`   - Trigger phrases: ${JSON.stringify(adminConfig.triggerPhrases)}`);
  console.log(`   - Split chars: ${adminConfig.messageSplitChars}`);
  console.log(`   - Response delay: ${adminConfig.responseDelaySeconds}s`);
  console.log(`   - Is active: ${adminConfig.isActive}`);
  console.log(`📱 [ADMIN AGENT] Número: ${cleanPhone}`);
  console.log(`📝 [ADMIN AGENT] Mensagem: "${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}"`);
  console.log(`💾 [ADMIN AGENT] Sessão atual: ${session.conversationHistory.length} mensagens em memória`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 🧠 PERSISTÊNCIA DE MEMÓRIA - SEMPRE CARREGAR HISTÓRICO DO BANCO
  // Garante que o agente NUNCA esqueça do cliente, mesmo após deploy/restart
  // ═══════════════════════════════════════════════════════════════════════════
  if (session.conversationHistory.length === 0) {
    try {
      console.log(`📚 [ADMIN AGENT] 🧠 Sessão vazia em memória, restaurando do banco...`);
      const conversation = await storage.getAdminConversationByPhone(cleanPhone);
      
      if (conversation) {
        console.log(`📚 [ADMIN AGENT] Conversa encontrada: ${conversation.id}`);
        const messages = await storage.getAdminMessages(conversation.id);
        
        console.log(`📚 [ADMIN AGENT] Total de ${messages.length} mensagens no histórico do banco`);
        
        // Carregar histórico completo
        const fullHistory = messages.map((msg: any) => ({
          role: (msg.fromMe ? "assistant" : "user") as "user" | "assistant",
          content: msg.text || "",
          timestamp: msg.timestamp || new Date(),
        }));
        
        // Para contexto da IA: últimas 30 mensagens (evitar prompt muito grande)
        session.conversationHistory = fullHistory.slice(-30);
        console.log(`📚 [ADMIN AGENT] 🧠 ${session.conversationHistory.length} mensagens restauradas do banco!`);
        console.log(`   Primeira msg: ${messages[0]?.timestamp ? new Date(messages[0].timestamp).toLocaleDateString('pt-BR') : 'N/A'}`);
        console.log(`   Última msg: ${messages[messages.length-1]?.timestamp ? new Date(messages[messages.length-1].timestamp).toLocaleDateString('pt-BR') : 'N/A'}`);
      } else {
        console.log(`📚 [ADMIN AGENT] Nenhuma conversa anterior encontrada - cliente novo`);
      }
    } catch (dbError) {
      console.error(`❌ [ADMIN AGENT] Erro ao carregar histórico do banco:`, dbError);
    }
  }
  
  // Verificar frases gatilho (a menos que seja skipTriggerCheck para mídias/comprovantes)
  if (!skipTriggerCheck) {
    const historyForTriggerCheck = session.conversationHistory;
    
    // Debug: verificar se trigger existe no histórico
    const triggerWords = adminConfig.triggerPhrases || [];
    const foundTriggerInHistory = historyForTriggerCheck.some(msg => 
      triggerWords.some(trigger => 
        msg.content.toLowerCase().includes(trigger.toLowerCase())
      )
    );
    
    if (foundTriggerInHistory) {
      console.log(`✅ [ADMIN AGENT] Trigger encontrada no histórico - cliente já interagiu antes`);
    }
    
    const triggerResult = checkTriggerPhrases(
      messageText,
      historyForTriggerCheck,
      adminConfig.triggerPhrases
    );
    
    if (!triggerResult.hasTrigger) {
      console.log(`⏸️ [ADMIN AGENT] Skipping response - no trigger phrase found for ${cleanPhone}`);
      console.log(`   Mensagem recebida: "${messageText.substring(0, 100)}..."`);
      console.log(`   💡 Cliente precisa mencionar uma das palavras: ${adminConfig.triggerPhrases?.join(', ')}`);
      // Ainda adiciona ao histórico mas não responde
      addToConversationHistory(cleanPhone, "user", messageText);
      return null;
    }
    
    console.log(`✅ [ADMIN AGENT] Trigger phrase detected (${triggerResult.foundIn}) for ${cleanPhone}`);
  }
  
  // Adicionar mensagem ao histórico
  addToConversationHistory(cleanPhone, "user", messageText);
  
  // Se é imagem e está aguardando comprovante
  if (mediaType === "image" && session.awaitingPaymentProof) {
    const text = "Recebi seu comprovante! 🎉 Vou verificar o pagamento e liberar sua conta. Isso leva no máximo 1 hora em horário comercial!";
    addToConversationHistory(cleanPhone, "assistant", text);
    updateClientSession(cleanPhone, { awaitingPaymentProof: false });
    
    return {
      text,
      actions: { notifyOwner: true },
    };
  }
  
  // Gerar resposta com IA
  const aiResponse = await generateAIResponse(session, messageText);
  console.log(`🤖 [ADMIN AGENT] Resposta da IA (primeiros 500 chars): ${aiResponse.substring(0, 500)}`);
  
  // Parse ações da resposta
  const { cleanText: textWithoutActions, actions } = parseActions(aiResponse);
  console.log(`🔧 [ADMIN AGENT] Ações encontradas: ${actions.length}`);
  
  // Parse tags de mídia da resposta
  const { cleanText, mediaActions } = parseAdminMediaTags(textWithoutActions);
  console.log(`📁 [ADMIN AGENT] Tags de mídia encontradas: ${mediaActions.length}`);
  
  if (mediaActions.length > 0) {
    console.log(`📁 [ADMIN AGENT] Nomes das mídias: ${mediaActions.map(a => a.media_name).join(', ')}`);
  }
  
  // Processar mídias encontradas
  const processedMediaActions: Array<{
    type: 'send_media';
    media_name: string;
    mediaData?: AdminMedia;
  }> = [];
  
  // Sistema single-admin: não precisa especificar adminId
  for (const action of mediaActions) {
    const mediaData = await getAdminMediaByName(undefined, action.media_name);
    if (mediaData) {
      processedMediaActions.push({
        type: 'send_media',
        media_name: action.media_name,
        mediaData,
      });
      console.log(`✅ [ADMIN AGENT] Mídia encontrada e preparada: ${action.media_name} (${mediaData.mediaType})`);
    } else {
      console.log(`⚠️ [ADMIN AGENT] Mídia não encontrada no store: ${action.media_name}`);
    }
  }
  
  // Executar ações
  const actionResults = await executeActions(session, actions);
  
  // Adicionar resposta ao histórico
  addToConversationHistory(cleanPhone, "assistant", cleanText);
  
  // Atualizar sessão
  session = getClientSession(cleanPhone)!;
  
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
    
    // Primeiro, buscar na tabela users pelo campo phone
    const users = await storage.getAllUsers();
    let user = users.find(u => u.phone?.replace(/\D/g, "") === cleanPhone);
    
    if (user) {
      return user;
    }
    
    // Se não encontrou, buscar na tabela whatsapp_connections pelo phone_number
    // e retornar o usuário correspondente
    const connections = await storage.getAllConnections();
    const connection = connections.find(c => c.phoneNumber?.replace(/\D/g, "") === cleanPhone);
    
    if (connection) {
      // Buscar o usuário pelo userId da conexão
      const connectedUser = users.find(u => u.id === connection.userId);
      if (connectedUser) {
        console.log(`📱 [ADMIN AGENT] Usuário encontrado via whatsapp_connections: ${connectedUser.email}`);
        return connectedUser;
      }
    }
    
    return undefined;
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao buscar usuário por telefone:", error);
    return undefined;
  }
}

async function findUserByEmail(email: string): Promise<any | undefined> {
  try {
    const users = await storage.getAllUsers();
    return users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao buscar usuário por email:", error);
    return undefined;
  }
}

// Atualiza configuração do agente com o prompt coletado
async function updateAgentWithPrompt(session: ClientSession): Promise<void> {
  try {
    if (!session.userId || !session.agentConfig?.prompt) return;
    
    const fullPrompt = `Você é ${session.agentConfig.name || "o atendente"}, ${session.agentConfig.role || "atendente"} da ${session.agentConfig.company || "empresa"}.

${session.agentConfig.prompt}

REGRAS DE ATENDIMENTO:
- Seja sempre educado e prestativo
- Responda de forma curta e objetiva
- Use linguagem natural e amigável
- Não invente informações que não foram fornecidas
- Se não souber algo, diga que vai verificar`;

    await storage.upsertAgentConfig(session.userId, {
      prompt: fullPrompt,
      isActive: true,
      model: "mistral-small-latest",
      triggerPhrases: [],
      messageSplitChars: 400,
      responseDelaySeconds: 30,
    });
    
    console.log(`✅ [ADMIN AGENT] Prompt do agente atualizado para usuário ${session.userId}`);
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao atualizar prompt do agente:", error);
  }
}

export async function getOwnerNotificationNumber(): Promise<string> {
  const config = await storage.getSystemConfig("owner_notification_number");
  return config?.valor || "5517991956944";
}

export async function setOwnerNotificationNumber(number: string): Promise<void> {
  await storage.updateSystemConfig("owner_notification_number", number);
}

// ============================================================================
// CRIAR CONTA DO CLIENTE
// ============================================================================

export async function createClientAccount(session: ClientSession): Promise<{ userId: string; success: boolean; error?: string }> {
  try {
    if (!session.email) {
      return { userId: "", success: false, error: "Email não informado" };
    }
    
    // Verificar se já existe
    const existing = await findUserByEmail(session.email);
    if (existing) {
      updateClientSession(session.phoneNumber, { userId: existing.id });
      return { userId: existing.id, success: true };
    }
    
    // Criar usuário
    const user = await storage.upsertUser({
      email: session.email,
      name: session.agentConfig?.company || "Cliente",
      phone: session.phoneNumber,
      role: "user",
    });
    
    // Criar configuração do agente se tiver prompt
    if (session.agentConfig?.prompt) {
      const fullPrompt = `Você é ${session.agentConfig.name || "o atendente"}, ${session.agentConfig.role || "atendente"} da ${session.agentConfig.company || "empresa"}.

${session.agentConfig.prompt}

REGRAS DE ATENDIMENTO:
- Seja sempre educado e prestativo
- Responda de forma curta e objetiva
- Use linguagem natural e amigável
- Não invente informações que não foram fornecidas
- Se não souber algo, diga que vai verificar`;

      await storage.upsertAgentConfig(user.id, {
        prompt: fullPrompt,
        isActive: true,
        model: "mistral-small-latest",
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });
    }
    
    // Criar assinatura de teste (24h)
    const plans = await storage.getActivePlans();
    const basicPlan = plans[0];
    
    if (basicPlan) {
      const trialEnd = new Date();
      trialEnd.setHours(trialEnd.getHours() + 24);
      
      const subscription = await storage.createSubscription({
        userId: user.id,
        planId: basicPlan.id,
        status: "active",
        dataInicio: new Date(),
        dataFim: trialEnd,
      });
      
      updateClientSession(session.phoneNumber, { subscriptionId: subscription.id });
    }
    
    updateClientSession(session.phoneNumber, { userId: user.id });
    
    console.log(`✅ [ADMIN AGENT] Conta criada para ${session.email} (ID: ${user.id})`);
    
    return { userId: user.id, success: true };
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao criar conta:", error);
    return { userId: "", success: false, error: String(error) };
  }
}

// ============================================================================
// NOTIFICAR DONO SOBRE PAGAMENTO
// ============================================================================

export async function notifyOwnerAboutPayment(
  session: ClientSession,
  comprovante?: string
): Promise<void> {
  try {
    const ownerNumber = await getOwnerNotificationNumber();
    
    const message = `💰 NOVO PAGAMENTO RECEBIDO

📱 Cliente: ${session.phoneNumber}
📧 Email: ${session.email || "N/A"}
🤖 Agente: ${session.agentConfig?.name || "N/A"}
🏢 Empresa: ${session.agentConfig?.company || "N/A"}

⏰ ${new Date().toLocaleString("pt-BR")}

${comprovante ? "📸 Comprovante anexado" : "⚠️ Verificar pagamento manualmente"}`;
    
    console.log(`📢 [ADMIN AGENT] Notificação de pagamento para ${ownerNumber}:\n${message}`);
    
    // A notificação é enviada pelo whatsapp.ts
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao notificar dono:", error);
  }
}
