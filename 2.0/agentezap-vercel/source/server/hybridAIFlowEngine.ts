/**
 * Sistema Híbrido IA + Fluxo
 * 
 * Este módulo adiciona inteligência ao chatbot de fluxo:
 * 1. Parsing de datas naturais ("hoje", "amanhã", "segunda", "dia 15")
 * 2. Interpretação de intenções do usuário via IA
 * 3. Acionamento correto de nós do fluxo baseado na intenção
 * 
 * A IA NÃO gera respostas - apenas interpreta a intenção e aciona o fluxo correto.
 * As respostas sempre vêm do fluxo predefinido.
 */

import { db, withRetry } from "./db";
import { sql } from "drizzle-orm";

// =============================================================
// 📅 PARSING DE DATAS NATURAIS
// =============================================================

interface ParsedDate {
  date: string;          // Formato YYYY-MM-DD
  formatted: string;     // Formato brasileiro DD/MM/YYYY
  dayOfWeek: string;     // Nome do dia da semana
  confidence: number;    // 0 a 1
  original: string;      // Texto original
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DIAS_SEMANA_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const DIAS_SEMANA_ALT = ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Parseia datas em linguagem natural para formato estruturado
 */
export function parseNaturalDate(text: string): ParsedDate | null {
  const normalized = text.toLowerCase().trim()
    .replace(/[áàâã]/g, 'a')
    .replace(/[éèê]/g, 'e')
    .replace(/[íìî]/g, 'i')
    .replace(/[óòôõ]/g, 'o')
    .replace(/[úùû]/g, 'u')
    .replace(/[ç]/g, 'c');
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let targetDate: Date | null = null;
  let confidence = 0.8;

  // ========== HOJE ==========
  if (/^hoje$/i.test(normalized) || /\bhoje\b/i.test(normalized)) {
    targetDate = today;
    confidence = 1.0;
  }
  
  // ========== AMANHÃ ==========
  else if (/^amanha$/i.test(normalized) || /\bamanha\b/i.test(normalized)) {
    targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 1);
    confidence = 1.0;
  }
  
  // ========== DEPOIS DE AMANHÃ ==========
  else if (/depois de amanha/i.test(normalized) || /depois d'amanha/i.test(normalized)) {
    targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 2);
    confidence = 1.0;
  }
  
  // ========== PRÓXIMA SEMANA ==========
  else if (/proxima semana/i.test(normalized) || /semana que vem/i.test(normalized)) {
    targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 7);
    confidence = 0.7;
  }
  
  // ========== DAQUI X DIAS ==========
  else if (/daqui (\d+) dias?/i.test(normalized) || /em (\d+) dias?/i.test(normalized)) {
    const match = normalized.match(/(?:daqui|em) (\d+) dias?/i);
    if (match) {
      const days = parseInt(match[1]);
      targetDate = new Date(today);
      targetDate.setDate(today.getDate() + days);
      confidence = 0.9;
    }
  }
  
  // ========== DIA DA SEMANA (segunda, terça, etc.) ==========
  else {
    // Procurar por dia da semana
    const diasCompletos = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const diasComFeira = ['segunda-feira', 'terca-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira'];
    
    let foundDayIndex = -1;
    
    // Verificar dias completos
    for (let i = 0; i < diasCompletos.length; i++) {
      if (normalized.includes(diasCompletos[i])) {
        foundDayIndex = i;
        break;
      }
    }
    
    // Se encontrou dia da semana
    if (foundDayIndex >= 0) {
      const currentDay = today.getDay();
      let daysToAdd = foundDayIndex - currentDay;
      
      // Se o dia já passou ou é hoje, vai para a próxima semana
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }
      
      // "próxima segunda" sempre pula para próxima semana
      if (normalized.includes('proxim')) {
        if (daysToAdd <= 0) {
          daysToAdd += 7;
        }
      }
      
      targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysToAdd);
      confidence = 0.9;
    }
    
    // ========== DIA NUMÉRICO (dia 15, 20/03, 15 de março) ==========
    else {
      // Formato: dia 15, dia 20
      const diaMatch = normalized.match(/dia (\d{1,2})/i);
      if (diaMatch) {
        const day = parseInt(diaMatch[1]);
        if (day >= 1 && day <= 31) {
          targetDate = new Date(today);
          targetDate.setDate(day);
          
          // Se o dia já passou neste mês, vai para o próximo mês
          if (targetDate <= today) {
            targetDate.setMonth(targetDate.getMonth() + 1);
          }
          confidence = 0.85;
        }
      }
      
      // Formato: DD/MM ou DD/MM/YYYY
      const slashMatch = normalized.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
      if (slashMatch && !targetDate) {
        const day = parseInt(slashMatch[1]);
        const month = parseInt(slashMatch[2]) - 1; // JS months are 0-indexed
        let year = slashMatch[3] ? parseInt(slashMatch[3]) : today.getFullYear();
        
        // Converter ano de 2 dígitos
        if (year < 100) {
          year += 2000;
        }
        
        if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
          targetDate = new Date(year, month, day);
          
          // Se passou e não especificou ano, vai para o próximo ano
          if (targetDate <= today && !slashMatch[3]) {
            targetDate.setFullYear(targetDate.getFullYear() + 1);
          }
          confidence = 0.95;
        }
      }
      
      // Formato: 15 de março, 20 de janeiro
      const mesMatch = normalized.match(/(\d{1,2}) de (\w+)/i);
      if (mesMatch && !targetDate) {
        const day = parseInt(mesMatch[1]);
        const mesText = mesMatch[2].toLowerCase()
          .replace(/[áàâã]/g, 'a')
          .replace(/[éèê]/g, 'e')
          .replace(/[íìî]/g, 'i')
          .replace(/[óòôõ]/g, 'o')
          .replace(/[úùû]/g, 'u')
          .replace(/[ç]/g, 'c');
        
        const mesesNorm = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
                          'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        
        let monthIndex = mesesNorm.findIndex(m => mesText.startsWith(m.substring(0, 3)));
        
        if (monthIndex >= 0 && day >= 1 && day <= 31) {
          targetDate = new Date(today.getFullYear(), monthIndex, day);
          
          // Se passou, vai para o próximo ano
          if (targetDate <= today) {
            targetDate.setFullYear(targetDate.getFullYear() + 1);
          }
          confidence = 0.9;
        }
      }
    }
  }
  
  if (!targetDate) {
    return null;
  }
  
  // Formatar resultado
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  
  return {
    date: `${year}-${month}-${day}`,
    formatted: `${day}/${month}/${year}`,
    dayOfWeek: DIAS_SEMANA[targetDate.getDay()],
    confidence,
    original: text
  };
}

/**
 * Extrai data de um texto mais longo
 */
export function extractDateFromText(text: string): ParsedDate | null {
  // Primeiro tenta o texto todo
  const direct = parseNaturalDate(text);
  if (direct) return direct;
  
  // Procura padrões específicos no texto
  const patterns = [
    /(?:para|no|na|em|dia|data|agendar para|marcar para)\s+([^\d]*?\d{1,2}[^\d]*)/i,
    /(?:para|no|na|em)\s+(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)/i,
    /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
    /dia (\d{1,2})/i,
    /(proxim[ao]\s+\w+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const result = parseNaturalDate(match[1] || match[0]);
      if (result) return result;
    }
  }
  
  return null;
}

// =============================================================
// ⏰ PARSING DE HORÁRIOS NATURAIS
// =============================================================

interface ParsedTime {
  time: string;        // Formato HH:MM (24h)
  formatted: string;   // Formato para exibição
  period: 'manha' | 'tarde' | 'noite';
  confidence: number;
  original: string;
}

/**
 * Parseia horários em linguagem natural
 */
export function parseNaturalTime(text: string): ParsedTime | null {
  const normalized = text.toLowerCase().trim()
    .replace(/[áàâã]/g, 'a')
    .replace(/[éèê]/g, 'e')
    .replace(/[íìî]/g, 'i')
    .replace(/[óòôõ]/g, 'o')
    .replace(/[úùû]/g, 'u');
  
  let hours: number | null = null;
  let minutes: number = 0;
  let confidence = 0.8;
  
  // ========== FORMATO HH:MM ou HHhMM ==========
  const timeMatch = normalized.match(/(\d{1,2})[:h](\d{2})?/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    confidence = 0.95;
  }
  
  // ========== FORMATO "X horas" ou "Xh" ==========
  else if (/(\d{1,2})\s*(?:h(?:oras?)?|hrs?)/.test(normalized)) {
    const match = normalized.match(/(\d{1,2})\s*(?:h(?:oras?)?|hrs?)/);
    if (match) {
      hours = parseInt(match[1]);
      confidence = 0.9;
    }
  }
  
  // ========== PERÍODOS GENÉRICOS ==========
  else if (/\b(manha|manhã)\b/i.test(text)) {
    hours = 9;
    confidence = 0.5;
  }
  else if (/\b(tarde)\b/i.test(text)) {
    hours = 14;
    confidence = 0.5;
  }
  else if (/\b(noite)\b/i.test(text)) {
    hours = 19;
    confidence = 0.5;
  }
  
  // ========== MEIO-DIA / MEIA-NOITE ==========
  else if (/meio[- ]?dia/i.test(normalized)) {
    hours = 12;
    confidence = 0.95;
  }
  else if (/meia[- ]?noite/i.test(normalized)) {
    hours = 0;
    confidence = 0.95;
  }
  
  if (hours === null || hours < 0 || hours > 23) {
    return null;
  }
  
  // Ajustar para PM se "da tarde" ou "da noite"
  if (hours <= 12) {
    if (/da tarde|pm/i.test(normalized) && hours < 12) {
      hours += 12;
    }
    else if (/da noite/i.test(normalized) && hours < 12 && hours !== 0) {
      hours += 12;
    }
    else if (/da manha|am/i.test(normalized) && hours === 12) {
      hours = 0;
    }
  }
  
  // Determinar período
  let period: 'manha' | 'tarde' | 'noite';
  if (hours >= 5 && hours < 12) {
    period = 'manha';
  } else if (hours >= 12 && hours < 18) {
    period = 'tarde';
  } else {
    period = 'noite';
  }
  
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  
  return {
    time: timeStr,
    formatted: `${hours}:${String(minutes).padStart(2, '0')}`,
    period,
    confidence,
    original: text
  };
}

/**
 * Extrai horário de um texto mais longo
 */
export function extractTimeFromText(text: string): ParsedTime | null {
  // Primeiro tenta o texto todo
  const direct = parseNaturalTime(text);
  if (direct) return direct;
  
  // Procura padrões específicos
  const patterns = [
    /(?:as|às|para as|horario|hora)\s*(\d{1,2}[:h]\d{2}|\d{1,2}\s*(?:h(?:oras?)?)?)/i,
    /(\d{1,2}[:h]\d{2})/,
    /(\d{1,2}\s*(?:da manha|da tarde|da noite))/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const result = parseNaturalTime(match[1] || match[0]);
      if (result) return result;
    }
  }
  
  return null;
}

// =============================================================
// 🤖 SISTEMA DE INTENÇÕES PARA FLUXO HÍBRIDO
// =============================================================

export type IntentCategory = 
  | 'greeting'           // Saudação (oi, olá, bom dia)
  | 'menu'               // Ver cardápio/menu/opções
  | 'order'              // Fazer pedido/pedir
  | 'schedule'           // Agendar/marcar horário
  | 'price'              // Consultar preço/valor
  | 'service'            // Consultar serviço específico
  | 'status'             // Status do pedido/agendamento
  | 'cancel'             // Cancelar pedido/agendamento
  | 'edit'               // Editar/alterar pedido
  | 'address'            // Informar endereço
  | 'payment'            // Forma de pagamento
  | 'hours'              // Horário de funcionamento
  | 'location'           // Localização/endereço do estabelecimento
  | 'human'              // Falar com atendente
  | 'help'               // Ajuda
  | 'thanks'             // Agradecimento
  | 'bye'                // Despedida
  | 'confirm'            // Confirmação (sim, ok, pode ser)
  | 'deny'               // Negação (não, cancela)
  | 'select_option'      // Seleção numérica (1, 2, 3)
  | 'provide_info'       // Fornecendo informação (nome, telefone, etc.)
  | 'unknown';           // Não identificado

interface DetectedIntent {
  category: IntentCategory;
  confidence: number;
  keywords: string[];
  extractedData?: {
    date?: ParsedDate;
    time?: ParsedTime;
    number?: number;
    service?: string;
    name?: string;
    address?: string;
    phone?: string;
  };
  suggestedNodeTypes?: string[];
}

// Dicionário de palavras-chave para cada intenção
const INTENT_KEYWORDS: Record<IntentCategory, string[]> = {
  greeting: ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'eae', 'eai', 'fala', 'salve', 'opa'],
  menu: ['cardapio', 'cardápio', 'menu', 'opcoes', 'opções', 'catalogo', 'catálogo', 'ver', 'mostrar', 'lista', 'servicos', 'serviços'],
  order: ['pedir', 'pedido', 'quero', 'gostaria', 'fazer pedido', 'encomendar', 'delivery', 'entrega', 'comprar'],
  schedule: ['agendar', 'marcar', 'horario', 'horário', 'agenda', 'reservar', 'reserva', 'consulta', 'atendimento', 'disponibilidade', 'data', 'dia'],
  price: ['preco', 'preço', 'valor', 'quanto', 'custo', 'custa', 'valores', 'tabela'],
  service: ['corte', 'escova', 'manicure', 'pedicure', 'massagem', 'limpeza', 'instalacao', 'instalação', 'reparo', 'conserto', 'manutenção', 'manutencao'],
  status: ['status', 'situacao', 'situação', 'andamento', 'onde', 'chegou', 'previsao', 'previsão'],
  cancel: ['cancelar', 'cancela', 'desistir', 'desisto', 'nao quero mais', 'não quero mais'],
  edit: ['alterar', 'mudar', 'trocar', 'editar', 'modificar', 'adicionar', 'remover', 'tirar'],
  address: ['endereco', 'endereço', 'rua', 'avenida', 'numero', 'número', 'bairro', 'cep', 'complemento'],
  payment: ['pagamento', 'pagar', 'pix', 'cartao', 'cartão', 'dinheiro', 'credito', 'crédito', 'debito', 'débito', 'troco'],
  hours: ['horario funcionamento', 'horário funcionamento', 'abre', 'fecha', 'aberto', 'fechado', 'funciona'],
  location: ['onde fica', 'localizacao', 'localização', 'como chego', 'como chegar', 'mapa'],
  human: ['atendente', 'humano', 'pessoa', 'falar com alguem', 'falar com alguém', 'suporte', 'ajuda humana'],
  help: ['ajuda', 'help', 'duvida', 'dúvida', 'como funciona', 'nao entendi', 'não entendi', 'explica'],
  thanks: ['obrigado', 'obrigada', 'valeu', 'vlw', 'brigado', 'agradeco', 'agradeço', 'thanks'],
  bye: ['tchau', 'ate mais', 'até mais', 'adeus', 'bye', 'flw', 'falou', 'fui'],
  confirm: ['sim', 'ok', 'pode', 'certo', 'correto', 'isso', 'confirmo', 'confirma', 'pode ser', 'fechado', 'combinado', 'bora', 's'],
  deny: ['nao', 'não', 'n', 'nope', 'negativo', 'errado', 'incorreto', 'cancela'],
  select_option: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto'],
  provide_info: [], // Detectado por padrões específicos
  unknown: []
};

// Mapeamento de intenções para tipos de nós sugeridos
const INTENT_TO_NODE_TYPES: Record<IntentCategory, string[]> = {
  greeting: ['start', 'message'],
  menu: ['list', 'buttons', 'message'],
  order: ['list', 'buttons', 'delivery_order', 'input'],
  schedule: ['create_appointment', 'input', 'buttons'],
  price: ['message', 'list'],
  service: ['list', 'buttons', 'message'],
  status: ['message', 'condition'],
  cancel: ['message', 'condition'],
  edit: ['input', 'buttons', 'list'],
  address: ['input'],
  payment: ['buttons', 'list'],
  hours: ['check_business_hours', 'message'],
  location: ['message', 'media'],
  human: ['transfer_human'],
  help: ['message', 'buttons'],
  thanks: ['message', 'end'],
  bye: ['end', 'message'],
  confirm: ['condition', 'message'],
  deny: ['condition', 'message'],
  select_option: ['condition', 'goto'],
  provide_info: ['input'],
  unknown: ['message']
};

/**
 * Detecta a intenção do usuário a partir da mensagem
 */
export function detectIntent(message: string): DetectedIntent {
  const normalized = message.toLowerCase().trim()
    .replace(/[áàâã]/g, 'a')
    .replace(/[éèê]/g, 'e')
    .replace(/[íìî]/g, 'i')
    .replace(/[óòôõ]/g, 'o')
    .replace(/[úùû]/g, 'u')
    .replace(/[ç]/g, 'c');
  
  let bestMatch: IntentCategory = 'unknown';
  let bestConfidence = 0;
  let matchedKeywords: string[] = [];
  
  // Verificar cada categoria de intenção
  for (const [category, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const cat = category as IntentCategory;
    if (keywords.length === 0) continue;
    
    let matches = 0;
    const found: string[] = [];
    
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(normalized) || normalized.includes(keyword)) {
        matches++;
        found.push(keyword);
      }
    }
    
    if (matches > 0) {
      // Calcular confiança baseada em quantas palavras-chave foram encontradas
      // Para saudações simples (1 palavra), dar confiança alta
      let confidence = Math.min(matches / 2, 1) * 0.9;
      
      // Se for uma palavra exata (mensagem == keyword), aumentar confiança
      if (keywords.some(kw => normalized === kw || normalized === kw.replace(/[áàâã]/g, 'a').replace(/[éèê]/g, 'e').replace(/[óòôõ]/g, 'o'))) {
        confidence = 0.95; // Match exato = 95% confiança
      }
      
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = cat;
        matchedKeywords = found;
      }
    }
  }
  
  // Detectar seleção numérica
  if (/^[1-9]$/.test(normalized) || /^opcao\s*\d$/i.test(normalized)) {
    if (bestConfidence < 0.8) {
      bestMatch = 'select_option';
      bestConfidence = 0.9;
      matchedKeywords = [normalized.match(/\d/)?.[0] || ''];
    }
  }
  
  // Detectar fornecimento de informação (padrões específicos)
  const infoPatterns = [
    { pattern: /\b[a-zA-Z]+@[a-zA-Z]+\.[a-zA-Z]+\b/, type: 'email' },
    { pattern: /\b\d{10,11}\b/, type: 'phone' },
    { pattern: /\b\d{5}-?\d{3}\b/, type: 'cep' },
    { pattern: /\brua\s+.+\d+/i, type: 'address' },
  ];
  
  for (const { pattern, type } of infoPatterns) {
    if (pattern.test(message)) {
      if (bestConfidence < 0.7) {
        bestMatch = 'provide_info';
        bestConfidence = 0.75;
        matchedKeywords = [type];
      }
    }
  }
  
  // Extrair dados adicionais
  const extractedData: DetectedIntent['extractedData'] = {};
  
  // Extrair data se relevante
  if (['schedule', 'order'].includes(bestMatch)) {
    const date = extractDateFromText(message);
    if (date) extractedData.date = date;
    
    const time = extractTimeFromText(message);
    if (time) extractedData.time = time;
  }
  
  // Extrair número se é seleção
  if (bestMatch === 'select_option') {
    const numMatch = normalized.match(/\d+/);
    if (numMatch) {
      extractedData.number = parseInt(numMatch[0]);
    }
  }
  
  return {
    category: bestMatch,
    confidence: bestConfidence,
    keywords: matchedKeywords,
    extractedData: Object.keys(extractedData).length > 0 ? extractedData : undefined,
    suggestedNodeTypes: INTENT_TO_NODE_TYPES[bestMatch]
  };
}

// =============================================================
// 🔄 MOTOR DE FLUXO HÍBRIDO
// =============================================================

interface HybridFlowConfig {
  id: string;
  user_id: string;
  enable_hybrid_ai: boolean;        // Ativar/desativar sistema híbrido
  ai_confidence_threshold: number;  // Mínimo de confiança para IA agir
  fallback_to_flow: boolean;        // Se IA não entender, seguir fluxo normal
  interpret_dates: boolean;         // Interpretar datas naturais
  interpret_times: boolean;         // Interpretar horários naturais
  intent_keywords: Record<string, string[]>; // Keywords customizadas por intenção
}

/**
 * Obtém configuração híbrida do chatbot
 */
export async function getHybridConfig(userId: string): Promise<HybridFlowConfig | null> {
  try {
    const result = await withRetry(async () => {
      return db.execute(sql`
        SELECT 
          cc.id,
          cc.user_id,
          COALESCE((cc.advanced_settings->>'enable_hybrid_ai')::boolean, false) as enable_hybrid_ai,
          COALESCE((cc.advanced_settings->>'ai_confidence_threshold')::numeric, 0.7) as ai_confidence_threshold,
          COALESCE((cc.advanced_settings->>'fallback_to_flow')::boolean, true) as fallback_to_flow,
          COALESCE((cc.advanced_settings->>'interpret_dates')::boolean, true) as interpret_dates,
          COALESCE((cc.advanced_settings->>'interpret_times')::boolean, true) as interpret_times,
          COALESCE(cc.advanced_settings->'intent_keywords', '{}') as intent_keywords
        FROM chatbot_configs cc
        WHERE cc.user_id = ${userId} AND cc.is_active = true
      `);
    });
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0] as any;
    return {
      id: row.id,
      user_id: row.user_id,
      enable_hybrid_ai: row.enable_hybrid_ai === true,
      ai_confidence_threshold: parseFloat(row.ai_confidence_threshold) || 0.7,
      fallback_to_flow: row.fallback_to_flow !== false,
      interpret_dates: row.interpret_dates !== false,
      interpret_times: row.interpret_times !== false,
      intent_keywords: row.intent_keywords || {}
    };
  } catch (error) {
    console.error('[HYBRID_AI] Erro ao obter configuração:', error);
    return null;
  }
}

/**
 * Processa entrada do usuário com interpretação de data/hora
 * Retorna a mensagem processada com dados extraídos
 */
export function processUserInputWithNaturalLanguage(
  message: string,
  config: HybridFlowConfig
): {
  originalMessage: string;
  processedMessage: string;
  extractedDate?: ParsedDate;
  extractedTime?: ParsedTime;
  intent: DetectedIntent;
} {
  const intent = detectIntent(message);
  let processedMessage = message;
  
  // Extrair data se habilitado
  let extractedDate: ParsedDate | undefined;
  if (config.interpret_dates) {
    const date = extractDateFromText(message);
    if (date) {
      extractedDate = date;
      // Não substituímos o texto original, apenas extraímos
    }
  }
  
  // Extrair horário se habilitado
  let extractedTime: ParsedTime | undefined;
  if (config.interpret_times) {
    const time = extractTimeFromText(message);
    if (time) {
      extractedTime = time;
    }
  }
  
  return {
    originalMessage: message,
    processedMessage,
    extractedDate,
    extractedTime,
    intent
  };
}

/**
 * Encontra o nó mais adequado baseado na intenção detectada
 */
export function findNodeByIntent(
  intent: DetectedIntent,
  nodes: Array<{ node_id: string; node_type: string; name: string; content: any }>,
  currentContext?: { variables: Record<string, string>; currentNodeId?: string }
): string | null {
  if (intent.confidence < 0.5) return null;
  
  const suggestedTypes = intent.suggestedNodeTypes || [];
  
  // Priorizar nós pelo tipo sugerido
  for (const nodeType of suggestedTypes) {
    const matchingNode = nodes.find(n => n.node_type === nodeType);
    if (matchingNode) {
      console.log(`[HYBRID_AI] Encontrado nó ${matchingNode.name} (${matchingNode.node_type}) para intenção ${intent.category}`);
      return matchingNode.node_id;
    }
  }
  
  // Buscar por palavras-chave no nome/conteúdo dos nós
  for (const keyword of intent.keywords) {
    const matchingNode = nodes.find(n => 
      n.name.toLowerCase().includes(keyword) ||
      JSON.stringify(n.content).toLowerCase().includes(keyword)
    );
    if (matchingNode) {
      console.log(`[HYBRID_AI] Encontrado nó por keyword: ${matchingNode.name}`);
      return matchingNode.node_id;
    }
  }
  
  return null;
}

/**
 * Aplica dados extraídos às variáveis do fluxo
 */
export function applyExtractedDataToVariables(
  variables: Record<string, string>,
  extractedDate?: ParsedDate,
  extractedTime?: ParsedTime,
  intent?: DetectedIntent
): Record<string, string> {
  const updated = { ...variables };
  
  if (extractedDate) {
    updated['data'] = extractedDate.formatted;
    updated['data_iso'] = extractedDate.date;
    updated['dia_semana'] = extractedDate.dayOfWeek;
    updated['data_agendamento'] = extractedDate.formatted;
    console.log(`[HYBRID_AI] Data extraída: ${extractedDate.formatted} (${extractedDate.dayOfWeek})`);
  }
  
  if (extractedTime) {
    updated['horario'] = extractedTime.time;
    updated['hora'] = extractedTime.time;
    updated['periodo'] = extractedTime.period;
    updated['horario_agendamento'] = extractedTime.time;
    console.log(`[HYBRID_AI] Horário extraído: ${extractedTime.time} (${extractedTime.period})`);
  }
  
  if (intent?.extractedData?.number !== undefined) {
    updated['opcao_selecionada'] = String(intent.extractedData.number);
  }
  
  return updated;
}

// =============================================================
// 📱 INTEGRAÇÃO COM TRANSCRIÇÃO DE ÁUDIO
// =============================================================

/**
 * Processa texto transcrito de áudio
 * Aplica mesma lógica de interpretação que texto normal
 */
export function processTranscribedAudio(
  transcribedText: string,
  config: HybridFlowConfig
): {
  text: string;
  intent: DetectedIntent;
  extractedDate?: ParsedDate;
  extractedTime?: ParsedTime;
} {
  // Normalizar texto transcrito (pode ter erros de transcrição)
  const normalized = transcribedText
    .replace(/\s+/g, ' ')
    .trim();
  
  // Aplicar mesma lógica de processamento
  const result = processUserInputWithNaturalLanguage(normalized, config);
  
  return {
    text: normalized,
    intent: result.intent,
    extractedDate: result.extractedDate,
    extractedTime: result.extractedTime
  };
}

// =============================================================
// 🔧 UTILITÁRIOS EXPORTADOS
// =============================================================

export {
  DIAS_SEMANA,
  MESES,
  INTENT_KEYWORDS,
  INTENT_TO_NODE_TYPES
};

/**
 * Log helper para debug do sistema híbrido
 */
export function logHybridDecision(
  message: string,
  intent: DetectedIntent,
  decision: 'flow' | 'hybrid' | 'fallback',
  nodeId?: string
): void {
  console.log(`🤖 [HYBRID_AI] ----------------------------------------`);
  console.log(`🤖 [HYBRID_AI] Mensagem: "${message}"`);
  console.log(`🤖 [HYBRID_AI] Intenção: ${intent.category} (${(intent.confidence * 100).toFixed(0)}%)`);
  console.log(`🤖 [HYBRID_AI] Keywords: ${intent.keywords.join(', ')}`);
  console.log(`🤖 [HYBRID_AI] Decisão: ${decision}${nodeId ? ` -> nó ${nodeId}` : ''}`);
  if (intent.extractedData) {
    console.log(`🤖 [HYBRID_AI] Dados extraídos:`, JSON.stringify(intent.extractedData));
  }
  console.log(`🤖 [HYBRID_AI] ----------------------------------------`);
}
