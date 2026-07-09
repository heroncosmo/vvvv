/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🗄️ SERVIÇO DE HISTÓRICO DE EDIÇÃO DE PROMPTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Gerencia:
 * 1. Histórico de versões do prompt (para restaurar)
 * 2. Histórico de chat (conversa natural sobre as edições)
 * 
 * Usa Supabase/PostgreSQL via pool direto (não Drizzle).
 */

import { pool } from './db';
import type { QueryResult } from 'pg';
import { repairMojibakeDeep, repairMojibakeText } from '@shared/mojibake';
import { runWithLLMUserContext } from './llmUserContext';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface PromptVersion {
  id: string;
  user_id: string;
  config_type: 'ai_agent_config' | 'business_agent_config';
  version_number: number;
  prompt_content: string;
  edit_summary: string | null;
  edit_type: 'manual' | 'ia' | 'restore' | 'template';
  edit_details: any[];
  created_at: Date;
  is_current: boolean;
}

export interface PromptEditChatMessage {
  id: string;
  user_id: string;
  config_type: 'ai_agent_config' | 'business_agent_config';
  role: 'user' | 'assistant';
  content: string;
  version_id: string | null;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface SaveVersionParams {
  userId: string;
  configType?: 'ai_agent_config' | 'business_agent_config';
  promptContent: string;
  editSummary?: string;
  editType?: 'manual' | 'ia' | 'restore' | 'template';
  editDetails?: any[];
}

export interface SaveChatMessageParams {
  userId: string;
  configType?: 'ai_agent_config' | 'business_agent_config';
  role: 'user' | 'assistant';
  content: string;
  versionId?: string;
  metadata?: Record<string, any>;
}

function normalizePromptVersion(version: PromptVersion | null | undefined): PromptVersion | null {
  if (!version) return null;
  return repairMojibakeDeep(version);
}

function normalizePromptChatMessage(message: PromptEditChatMessage | null | undefined): PromptEditChatMessage | null {
  if (!message) return null;
  return repairMojibakeDeep(message);
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE VERSÃO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Salva uma nova versão do prompt
 */
export async function salvarVersaoPrompt(params: SaveVersionParams): Promise<PromptVersion | null> {
  const {
    userId,
    configType = 'ai_agent_config',
    promptContent,
    editSummary = null,
    editType = 'manual',
    editDetails = []
  } = params;
  const normalizedPromptContent = repairMojibakeText(promptContent);
  const normalizedEditSummary = editSummary == null ? null : repairMojibakeText(editSummary);
  const normalizedEditDetails = repairMojibakeDeep(editDetails);
  
  try {
    console.log(`[HistoryService] 📝 Salvando nova versão para user ${userId}, tipo: ${editType}`);
    
    // 🔥 VERIFICAÇÃO ANTI-DUPLICATA: Buscar versão atual e comparar conteúdo
    const currentVersionResult = await pool.query(
      `SELECT id, version_number, prompt_content 
       FROM prompt_versions 
       WHERE user_id = $1 AND config_type = $2 AND is_current = true
       LIMIT 1`,
      [userId, configType]
    ) as QueryResult<{ id: string; version_number: number; prompt_content: string }>;
    
    if (currentVersionResult.rows.length > 0) {
      const currentVersion = currentVersionResult.rows[0];
      const currentPromptContent = repairMojibakeText(currentVersion.prompt_content);
      
      // Se o conteúdo é IDÊNTICO, NÃO criar nova versão (evitar duplicata)
      if (currentPromptContent === normalizedPromptContent) {
        console.log(`[HistoryService] ⚠️ DUPLICATA EVITADA! Conteúdo idêntico à versão atual v${currentVersion.version_number}`);
        console.log(`[HistoryService] ℹ️ Retornando versão existente (id: ${currentVersion.id})`);
        
        // Retornar a versão existente em vez de criar duplicata
        const existingVersionResult = await pool.query(
          `SELECT * FROM prompt_versions WHERE id = $1`,
          [currentVersion.id]
        ) as QueryResult<PromptVersion>;
        
        return normalizePromptVersion(existingVersionResult.rows[0]);
      }
      
      console.log(`[HistoryService] ✓ Conteúdo diferente da v${currentVersion.version_number}, criando nova versão`);
    } else {
      console.log(`[HistoryService] ℹ️ Nenhuma versão atual encontrada, criando primeira versão`);
    }
    
    // Busca o próximo número de versão
    const maxVersionResult = await pool.query(
      `SELECT COALESCE(MAX(version_number), 0) as max_version 
       FROM prompt_versions 
       WHERE user_id = $1 AND config_type = $2`,
      [userId, configType]
    ) as QueryResult<{ max_version: number }>;
    
    const nextVersion = (maxVersionResult.rows[0]?.max_version || 0) + 1;
    console.log(`[HistoryService] Próximo número de versão: ${nextVersion}`);
    
    // Remove flag is_current das versões anteriores
    const updateResult = await pool.query(
      `UPDATE prompt_versions SET is_current = false 
       WHERE user_id = $1 AND config_type = $2 AND is_current = true
       RETURNING version_number`,
      [userId, configType]
    ) as QueryResult<{ version_number: number }>;
    
    if (updateResult.rows.length > 0) {
      console.log(`[HistoryService] 🔄 Versões anteriores desmarcadas: ${updateResult.rows.map(r => `v${r.version_number}`).join(', ')}`);
    }
    
    // Insere nova versão
    const insertResult = await pool.query(
      `INSERT INTO prompt_versions (
        user_id, config_type, version_number, prompt_content, 
        edit_summary, edit_type, edit_details, is_current
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING *`,
      [userId, configType, nextVersion, normalizedPromptContent, normalizedEditSummary, editType, JSON.stringify(normalizedEditDetails)]
    ) as QueryResult<PromptVersion>;
    
    const newVersion = normalizePromptVersion(insertResult.rows[0]);
    if (!newVersion) {
      return null;
    }


    // Keep ai_agent_config in sync with current prompt versions
    if (configType === 'ai_agent_config') {
      try {
        await pool.query(
          `UPDATE ai_agent_config SET prompt = $1, updated_at = now() WHERE user_id = $2`,
          [normalizedPromptContent, userId]
        );
        console.log(`[HistoryService] Sync ai_agent_config.prompt for user ${userId}`);
      } catch (syncErr) {
        console.error('[HistoryService] Failed to sync ai_agent_config:', syncErr);
      }
    }
    console.log(`[HistoryService] ✅ Nova versão v${nextVersion} salva (id: ${newVersion.id}, is_current: true, prompt length: ${normalizedPromptContent.length})`);
    return newVersion;
    
  } catch (error) {
    console.error('[HistoryService] ❌ Erro ao salvar versão:', error);
    return null;
  }
}

/**
 * Lista todas as versões de um usuário
 */
export async function listarVersoes(
  userId: string, 
  configType: string = 'ai_agent_config',
  limite: number = 50
): Promise<PromptVersion[]> {
  try {
    const result = await pool.query(
      `SELECT * FROM prompt_versions 
       WHERE user_id = $1 AND config_type = $2 
       ORDER BY version_number DESC 
       LIMIT $3`,
      [userId, configType, limite]
    ) as QueryResult<PromptVersion>;
    
    return (result.rows || [])
      .map((row) => normalizePromptVersion(row))
      .filter((row): row is PromptVersion => Boolean(row));
  } catch (error) {
    console.error('[HistoryService] Erro ao listar versões:', error);
    return [];
  }
}

/**
 * Obtém uma versão específica
 */
export async function obterVersao(versionId: string): Promise<PromptVersion | null> {
  try {
    const result = await pool.query(
      `SELECT * FROM prompt_versions WHERE id = $1`,
      [versionId]
    ) as QueryResult<PromptVersion>;
    
    return normalizePromptVersion(result.rows[0]);
  } catch (error) {
    console.error('[HistoryService] Erro ao obter versão:', error);
    return null;
  }
}

/**
 * Obtém a versão atual (is_current = true)
 */
export async function obterVersaoAtual(
  userId: string, 
  configType: string = 'ai_agent_config'
): Promise<PromptVersion | null> {
  try {
    const result = await pool.query(
      `SELECT * FROM prompt_versions 
       WHERE user_id = $1 AND config_type = $2 AND is_current = true
       ORDER BY version_number DESC, created_at DESC
       LIMIT 1`,
      [userId, configType]
    ) as QueryResult<PromptVersion>;
    
    return normalizePromptVersion(result.rows[0]);
  } catch (error) {
    console.error('[HistoryService] Erro ao obter versão atual:', error);
    return null;
  }
}

/**
 * Restaura uma versão anterior
 * Cria uma nova versão com o conteúdo da versão selecionada
 */
export async function restaurarVersao(
  versionId: string, 
  userId: string
): Promise<PromptVersion | null> {
  try {
    const versaoOriginal = await obterVersao(versionId);
    
    if (!versaoOriginal) {
      console.error('[HistoryService] Versão não encontrada:', versionId);
      return null;
    }
    
    // Cria nova versão com o conteúdo restaurado
    const novaVersao = await salvarVersaoPrompt({
      userId,
      configType: versaoOriginal.config_type,
      promptContent: versaoOriginal.prompt_content,
      editSummary: `Restaurado da versão ${versaoOriginal.version_number}`,
      editType: 'restore',
      editDetails: [{ restored_from: versionId, original_version: versaoOriginal.version_number }]
    });
    
    return novaVersao;
  } catch (error) {
    console.error('[HistoryService] Erro ao restaurar versão:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE CHAT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Salva uma mensagem no histórico de chat
 */
export async function salvarMensagemChat(params: SaveChatMessageParams): Promise<PromptEditChatMessage | null> {
  const {
    userId,
    configType = 'ai_agent_config',
    role,
    content,
    versionId = null,
    metadata = {}
  } = params;
  const normalizedContent = repairMojibakeText(content);
  const normalizedMetadata = repairMojibakeDeep(metadata);
  
  try {
    const result = await pool.query(
      `INSERT INTO prompt_edit_chat (
        user_id, config_type, role, content, version_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [userId, configType, role, normalizedContent, versionId, JSON.stringify(normalizedMetadata)]
    ) as QueryResult<PromptEditChatMessage>;
    
    return normalizePromptChatMessage(result.rows[0]);
  } catch (error) {
    console.error('[HistoryService] Erro ao salvar mensagem de chat:', error);
    return null;
  }
}

/**
 * Lista o histórico de chat de um usuário
 */
export async function listarChatHistory(
  userId: string, 
  configType: string = 'ai_agent_config',
  limite: number = 100
): Promise<PromptEditChatMessage[]> {
  try {
    // 📝 FIX v2: Buscar os ÚLTIMOS 'limite' registros e reordenar ASC
    console.log(`[HistoryService] 📜 Buscando chat history para user ${userId}, limite ${limite}`);
    
    const result = await pool.query(
      `SELECT * FROM (
         SELECT * FROM prompt_edit_chat 
         WHERE user_id = $1 AND config_type = $2 
         ORDER BY created_at DESC 
         LIMIT $3
       ) sub
       ORDER BY created_at ASC`,
      [userId, configType, limite]
    ) as QueryResult<PromptEditChatMessage>;
    
    const normalizedRows = (result.rows || [])
      .map((row) => normalizePromptChatMessage(row))
      .filter((row): row is PromptEditChatMessage => Boolean(row));
    
    console.log(`[HistoryService] ✅ Retornando ${normalizedRows.length} mensagens`);
    if (normalizedRows.length > 0) {
      console.log(`[HistoryService] Primeira: "${normalizedRows[0].content?.substring(0, 50)}..."`);
      console.log(`[HistoryService] Última: "${normalizedRows[normalizedRows.length - 1].content?.substring(0, 50)}..."`);
    }
    
    return normalizedRows;
  } catch (error) {
    console.error('[HistoryService] ❌ Erro ao listar chat:', error);
    return [];
  }
}

/**
 * Limpa o histórico de chat (mantém versões)
 */
export async function limparChatHistory(
  userId: string, 
  configType: string = 'ai_agent_config'
): Promise<boolean> {
  try {
    await pool.query(
      `DELETE FROM prompt_edit_chat WHERE user_id = $1 AND config_type = $2`,
      [userId, configType]
    );
    return true;
  } catch (error) {
    console.error('[HistoryService] Erro ao limpar chat:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO COMBINADA: Editar e Salvar Histórico
// ═══════════════════════════════════════════════════════════════════════════

import { editarPromptViaIA, ResultadoEdicao } from './promptEditService';

/**
 * Edita o prompt via IA e salva no histórico
 * Esta é a função principal que combina tudo:
 * 1. Salva mensagem do usuário no chat
 * 2. Chama a IA para editar
 * 3. Salva a resposta da IA no chat
 * 4. Se houve edição, salva nova versão
 * 5. Retorna resultado completo
 */
export async function editarPromptComHistorico(
  userId: string,
  promptAtual: string,
  instrucaoUsuario: string,
  apiKey: string,
  configType: 'ai_agent_config' | 'business_agent_config' = 'ai_agent_config'
): Promise<{
  resultado: ResultadoEdicao;
  versao: PromptVersion | null;
  mensagensChat: { user: PromptEditChatMessage | null; assistant: PromptEditChatMessage | null };
}> {
  
  // 1. Salva mensagem do usuário no chat
  const mensagemUsuario = await salvarMensagemChat({
    userId,
    configType,
    role: 'user',
    content: instrucaoUsuario
  });
  
  // 2. Chama a IA para editar
  const resultado = await runWithLLMUserContext(userId, () =>
    editarPromptViaIA(
      promptAtual,
      instrucaoUsuario,
      apiKey,
      'mistral',
      {
        userId,
        conversationId: `prompt-edit:${userId}`,
      }
    )
  );
  
  // 3. Salva nova versão se houve edição bem-sucedida
  let novaVersao: PromptVersion | null = null;
  if (resultado.success && resultado.novoPrompt !== promptAtual) {
    novaVersao = await salvarVersaoPrompt({
      userId,
      configType,
      promptContent: resultado.novoPrompt,
      editSummary: resultado.mensagemChat,
      editType: 'ia',
      editDetails: resultado.detalhes
    });
  }
  
  // 4. Salva resposta da IA no chat (com referência à versão criada)
  const mensagemAssistente = await salvarMensagemChat({
    userId,
    configType,
    role: 'assistant',
    content: resultado.mensagemChat,
    versionId: novaVersao?.id,
    metadata: {
      edicoes_aplicadas: resultado.edicoesAplicadas,
      edicoes_falharam: resultado.edicoesFalharam,
      success: resultado.success
    }
  });
  
  return {
    resultado,
    versao: novaVersao,
    mensagensChat: {
      user: mensagemUsuario,
      assistant: mensagemAssistente
    }
  };
}
