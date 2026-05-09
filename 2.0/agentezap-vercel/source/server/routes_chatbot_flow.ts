/**
 * Rotas do Sistema de Chatbot com Fluxo Predefinido (Robô)
 * Alternativa ao agente IA - Fluxos visuais com nós
 */
import type { Express, Request, Response } from "express";
import { db, withRetry } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { isAuthenticated, supabase } from "./supabaseAuth";
import { sql } from "drizzle-orm";
import multer from "multer";

// Configurar multer para upload em memória
const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    // Aceitar imagens, áudios, vídeos e documentos
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/webm',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`));
    }
  }
});

// Flag para verificar se o bucket existe
let chatbotMediaBucketChecked = false;

// Interfaces para tipagem
interface ChatbotConfig {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  welcome_message: string;
  fallback_message: string;
  goodbye_message: string;
  is_active: boolean;
  is_published: boolean;
  typing_delay_ms: number;
  message_delay_ms: number;
  collect_user_data: boolean;
  send_welcome_on_first_contact: boolean;
  restart_on_keyword: boolean;
  restart_keywords: string[];
  total_conversations: number;
  total_completions: number;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface ChatbotNode {
  id: string;
  chatbot_id: string;
  node_id: string;
  name: string;
  node_type: string;
  content: any;
  next_node_id?: string;
  position_x: number;
  position_y: number;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

interface ChatbotConnection {
  id: string;
  chatbot_id: string;
  from_node_id: string;
  from_handle: string;
  to_node_id: string;
  label?: string;
  created_at: Date;
}

interface ChatbotTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  thumbnail_url?: string;
  flow_data: any;
  usage_count: number;
  rating: number;
  is_active: boolean;
  is_featured: boolean;
  created_at: Date;
  updated_at: Date;
}

export function registerChatbotFlowRoutes(app: Express) {
  console.log('📦 [CHATBOT_FLOW] Registrando rotas do construtor de fluxo de chatbot...');

  // ============================================================
  // CONFIGURAÇÃO DO CHATBOT
  // ============================================================

  // Obter configuração do chatbot do usuário
  app.get("/api/chatbot/config", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const result = await withRetry(async () => {
        return db.execute(sql`
          SELECT * FROM chatbot_configs WHERE user_id = ${userId}
        `);
      });

      if (result.rows.length === 0) {
        // Criar configuração padrão se não existir
        const newConfig = await withRetry(async () => {
          return db.execute(sql`
            INSERT INTO chatbot_configs (user_id, name)
            VALUES (${userId}, 'Meu Robô')
            ON CONFLICT (user_id) DO NOTHING
            RETURNING *
          `);
        });
        
        // Buscar novamente após criar
        const created = await withRetry(async () => {
          return db.execute(sql`
            SELECT * FROM chatbot_configs WHERE user_id = ${userId}
          `);
        });
        
        return res.json(created.rows[0] || null);
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao buscar config:', error);
      res.status(500).json({ error: "Erro ao buscar configuração do chatbot" });
    }
  });

  // Handler para criar/atualizar config (suporta PUT e POST)
  const handleConfigSave = async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const {
        name,
        description,
        welcome_message,
        fallback_message,
        goodbye_message,
        is_active,
        is_published,
        typing_delay_ms,
        message_delay_ms,
        collect_user_data,
        send_welcome_on_first_contact,
        restart_on_keyword,
        restart_keywords,
        advanced_settings
      } = req.body;

      // Default para advanced_settings
      const defaultAdvancedSettings = {
        enable_hybrid_ai: true,
        ai_confidence_threshold: 0.7,
        fallback_to_flow: true,
        interpret_dates: true,
        interpret_times: true,
        intent_keywords: {}
      };

      const finalAdvancedSettings = advanced_settings 
        ? { ...defaultAdvancedSettings, ...advanced_settings }
        : defaultAdvancedSettings;

      const result = await withRetry(async () => {
        return db.execute(sql`
          INSERT INTO chatbot_configs (
            user_id, name, description, welcome_message, fallback_message,
            goodbye_message, is_active, is_published, typing_delay_ms,
            message_delay_ms, collect_user_data, send_welcome_on_first_contact,
            restart_on_keyword, restart_keywords, advanced_settings
          ) VALUES (
            ${userId}, ${name || 'Meu Robô'}, ${description || null}, 
            ${welcome_message || 'Olá! 👋 Como posso ajudar você hoje?'},
            ${fallback_message || 'Desculpe, não entendi. Por favor, escolha uma das opções abaixo:'},
            ${goodbye_message || 'Foi um prazer atender você! Até mais! 👋'},
            ${is_active ?? false}, ${is_published ?? false},
            ${typing_delay_ms ?? 1500}, ${message_delay_ms ?? 500},
            ${collect_user_data ?? true}, ${send_welcome_on_first_contact ?? true},
            ${restart_on_keyword ?? true}, 
            ${restart_keywords ? `{${restart_keywords.join(',')}}` : '{menu,início,inicio,voltar,reiniciar}'},
            ${JSON.stringify(finalAdvancedSettings)}::jsonb
          )
          ON CONFLICT (user_id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            welcome_message = EXCLUDED.welcome_message,
            fallback_message = EXCLUDED.fallback_message,
            goodbye_message = EXCLUDED.goodbye_message,
            is_active = EXCLUDED.is_active,
            is_published = EXCLUDED.is_published,
            typing_delay_ms = EXCLUDED.typing_delay_ms,
            message_delay_ms = EXCLUDED.message_delay_ms,
            collect_user_data = EXCLUDED.collect_user_data,
            send_welcome_on_first_contact = EXCLUDED.send_welcome_on_first_contact,
            restart_on_keyword = EXCLUDED.restart_on_keyword,
            restart_keywords = EXCLUDED.restart_keywords,
            advanced_settings = EXCLUDED.advanced_settings,
            updated_at = now(),
            version = chatbot_configs.version + 1
          RETURNING *
        `);
      });

      // 🔄 EXCLUSIVIDADE: Se o Robô Fluxo está sendo ativado, desativar o Meu Agente IA
      if (is_active === true) {
        console.log(`🔄 [CHATBOT_CONFIG] Robô Fluxo ativado - desativando Meu Agente IA para user ${userId}`);
        
        try {
          // Desativar ai_agent_config
          await db.execute(sql`
            UPDATE ai_agent_config 
            SET is_active = false, updated_at = now()
            WHERE user_id = ${userId}
          `);
          console.log(`✅ [CHATBOT_CONFIG] ai_agent_config desativado`);
          
          // Desativar business_agent_configs
          await db.execute(sql`
            UPDATE business_agent_configs 
            SET is_active = false, updated_at = now()
            WHERE user_id = ${userId}
          `);
          console.log(`✅ [CHATBOT_CONFIG] business_agent_configs desativado`);
        } catch (exclusivityError) {
          console.error(`⚠️ [CHATBOT_CONFIG] Erro ao desativar Meu Agente IA:`, exclusivityError);
          // Continuar mesmo se houver erro - a config principal foi salva
        }
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao salvar config:', error);
      res.status(500).json({ error: "Erro ao salvar configuração do chatbot" });
    }
  };

  // Criar ou atualizar configuração do chatbot (PUT)
  app.put("/api/chatbot/config", isAuthenticated, handleConfigSave);
  
  // Suporte a POST também (para compatibilidade com flow-builder-studio)
  app.post("/api/chatbot/config", isAuthenticated, handleConfigSave);

  // ============================================================
  // GERENCIAMENTO DE NÓS DO FLUXO
  // ============================================================

  // Listar todos os nós do fluxo
  app.get("/api/chatbot/nodes", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const result = await withRetry(async () => {
        return db.execute(sql`
          SELECT n.* FROM chatbot_flow_nodes n
          JOIN chatbot_configs c ON n.chatbot_id = c.id
          WHERE c.user_id = ${userId}
          ORDER BY n.display_order ASC, n.created_at ASC
        `);
      });

      res.json(result.rows);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao listar nós:', error);
      res.status(500).json({ error: "Erro ao listar nós do fluxo" });
    }
  });

  // Criar novo nó
  app.post("/api/chatbot/nodes", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      // Verificar se é um array de nós (batch) ou um único nó
      const { nodes } = req.body;
      if (Array.isArray(nodes)) {
        // Modo batch - salvar múltiplos nós
        // Obter chatbot_id
        const configResult = await withRetry(async () => {
          return db.execute(sql`
            SELECT id FROM chatbot_configs WHERE user_id = ${userId}
          `);
        });

        let chatbotId: string;
        if (configResult.rows.length === 0) {
          const newConfig = await withRetry(async () => {
            return db.execute(sql`
              INSERT INTO chatbot_configs (user_id, name)
              VALUES (${userId}, 'Meu Robô')
              RETURNING id
            `);
          });
          chatbotId = (newConfig.rows[0] as any).id;
        } else {
          chatbotId = (configResult.rows[0] as any).id;
        }

        // Limpar nós antigos e salvar os novos
        await withRetry(async () => {
          return db.execute(sql`
            DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ${chatbotId}
          `);
        });

        // Salvar todos os nós
        const results = [];
        for (const node of nodes) {
          const result = await withRetry(async () => {
            return db.execute(sql`
              INSERT INTO chatbot_flow_nodes (
                chatbot_id, node_id, name, node_type, content,
                next_node_id, position_x, position_y, display_order
              ) VALUES (
                ${chatbotId}, ${node.node_id}, ${node.name}, ${node.node_type},
                ${JSON.stringify(node.content || {})}, ${node.next_node_id || null},
                ${node.position_x ?? 0}, ${node.position_y ?? 0}, ${node.display_order ?? 0}
              )
              RETURNING *
            `);
          });
          results.push(result.rows[0]);
        }

        return res.json(results);
      }

      // Modo single - um único nó
      const {
        node_id,
        name,
        node_type,
        content,
        next_node_id,
        position_x,
        position_y,
        display_order
      } = req.body;

      if (!node_id || !name || !node_type) {
        return res.status(400).json({ error: "node_id, name e node_type são obrigatórios" });
      }

      // Verificar se usuário tem configuração de chatbot
      const configResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT id FROM chatbot_configs WHERE user_id = ${userId}
        `);
      });

      let chatbotId: string;
      if (configResult.rows.length === 0) {
        // Criar configuração padrão
        const newConfig = await withRetry(async () => {
          return db.execute(sql`
            INSERT INTO chatbot_configs (user_id, name)
            VALUES (${userId}, 'Meu Robô')
            RETURNING id
          `);
        });
        chatbotId = (newConfig.rows[0] as any).id;
      } else {
        chatbotId = (configResult.rows[0] as any).id;
      }

      const result = await withRetry(async () => {
        return db.execute(sql`
          INSERT INTO chatbot_flow_nodes (
            chatbot_id, node_id, name, node_type, content,
            next_node_id, position_x, position_y, display_order
          ) VALUES (
            ${chatbotId}, ${node_id}, ${name}, ${node_type},
            ${JSON.stringify(content || {})}, ${next_node_id || null},
            ${position_x ?? 0}, ${position_y ?? 0}, ${display_order ?? 0}
          )
          ON CONFLICT (chatbot_id, node_id) DO UPDATE SET
            name = EXCLUDED.name,
            node_type = EXCLUDED.node_type,
            content = EXCLUDED.content,
            next_node_id = EXCLUDED.next_node_id,
            position_x = EXCLUDED.position_x,
            position_y = EXCLUDED.position_y,
            display_order = EXCLUDED.display_order,
            updated_at = now()
          RETURNING *
        `);
      });

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao criar nó:', error);
      res.status(500).json({ error: "Erro ao criar nó do fluxo" });
    }
  });

  // Atualizar nó
  app.put("/api/chatbot/nodes/:nodeId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { nodeId } = req.params;
      const { name, content, next_node_id, position_x, position_y, display_order } = req.body;

      const result = await withRetry(async () => {
        return db.execute(sql`
          UPDATE chatbot_flow_nodes n
          SET 
            name = COALESCE(${name}, n.name),
            content = COALESCE(${content ? JSON.stringify(content) : null}::jsonb, n.content),
            next_node_id = ${next_node_id === undefined ? sql`n.next_node_id` : next_node_id || null},
            position_x = COALESCE(${position_x}, n.position_x),
            position_y = COALESCE(${position_y}, n.position_y),
            display_order = COALESCE(${display_order}, n.display_order),
            updated_at = now()
          FROM chatbot_configs c
          WHERE n.chatbot_id = c.id
            AND c.user_id = ${userId}
            AND n.node_id = ${nodeId}
          RETURNING n.*
        `);
      });

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Nó não encontrado" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao atualizar nó:', error);
      res.status(500).json({ error: "Erro ao atualizar nó do fluxo" });
    }
  });

  // Deletar nó
  app.delete("/api/chatbot/nodes/:nodeId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { nodeId } = req.params;

      await withRetry(async () => {
        return db.execute(sql`
          DELETE FROM chatbot_flow_nodes n
          USING chatbot_configs c
          WHERE n.chatbot_id = c.id
            AND c.user_id = ${userId}
            AND n.node_id = ${nodeId}
        `);
      });

      // Também deletar conexões relacionadas
      await withRetry(async () => {
        return db.execute(sql`
          DELETE FROM chatbot_flow_connections conn
          USING chatbot_configs c
          WHERE conn.chatbot_id = c.id
            AND c.user_id = ${userId}
            AND (conn.from_node_id = ${nodeId} OR conn.to_node_id = ${nodeId})
        `);
      });

      res.json({ success: true });
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao deletar nó:', error);
      res.status(500).json({ error: "Erro ao deletar nó do fluxo" });
    }
  });

  // Salvar múltiplos nós de uma vez (batch save)
  app.post("/api/chatbot/nodes/batch", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { nodes } = req.body;
      if (!Array.isArray(nodes)) {
        return res.status(400).json({ error: "nodes deve ser um array" });
      }

      // Obter chatbot_id
      const configResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT id FROM chatbot_configs WHERE user_id = ${userId}
        `);
      });

      let chatbotId: string;
      if (configResult.rows.length === 0) {
        const newConfig = await withRetry(async () => {
          return db.execute(sql`
            INSERT INTO chatbot_configs (user_id, name)
            VALUES (${userId}, 'Meu Robô')
            RETURNING id
          `);
        });
        chatbotId = (newConfig.rows[0] as any).id;
      } else {
        chatbotId = (configResult.rows[0] as any).id;
      }

      // Salvar todos os nós
      const results = [];
      for (const node of nodes) {
        const result = await withRetry(async () => {
          return db.execute(sql`
            INSERT INTO chatbot_flow_nodes (
              chatbot_id, node_id, name, node_type, content,
              next_node_id, position_x, position_y, display_order
            ) VALUES (
              ${chatbotId}, ${node.node_id}, ${node.name}, ${node.node_type},
              ${JSON.stringify(node.content || {})}, ${node.next_node_id || null},
              ${node.position_x ?? 0}, ${node.position_y ?? 0}, ${node.display_order ?? 0}
            )
            ON CONFLICT (chatbot_id, node_id) DO UPDATE SET
              name = EXCLUDED.name,
              node_type = EXCLUDED.node_type,
              content = EXCLUDED.content,
              next_node_id = EXCLUDED.next_node_id,
              position_x = EXCLUDED.position_x,
              position_y = EXCLUDED.position_y,
              display_order = EXCLUDED.display_order,
              updated_at = now()
            RETURNING *
          `);
        });
        results.push(result.rows[0]);
      }

      res.json(results);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao salvar nós em batch:', error);
      res.status(500).json({ error: "Erro ao salvar nós do fluxo" });
    }
  });

  // ============================================================
  // GERENCIAMENTO DE CONEXÕES
  // ============================================================

  // Listar conexões
  app.get("/api/chatbot/connections", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const result = await withRetry(async () => {
        return db.execute(sql`
          SELECT conn.* FROM chatbot_flow_connections conn
          JOIN chatbot_configs c ON conn.chatbot_id = c.id
          WHERE c.user_id = ${userId}
        `);
      });

      res.json(result.rows);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao listar conexões:', error);
      res.status(500).json({ error: "Erro ao listar conexões do fluxo" });
    }
  });

  // Criar conexão
  app.post("/api/chatbot/connections", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { from_node_id, from_handle, to_node_id, label } = req.body;

      if (!from_node_id || !to_node_id) {
        return res.status(400).json({ error: "from_node_id e to_node_id são obrigatórios" });
      }

      // Obter chatbot_id
      const configResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT id FROM chatbot_configs WHERE user_id = ${userId}
        `);
      });

      if (configResult.rows.length === 0) {
        return res.status(400).json({ error: "Chatbot não configurado" });
      }

      const chatbotId = (configResult.rows[0] as any).id;

      const result = await withRetry(async () => {
        return db.execute(sql`
          INSERT INTO chatbot_flow_connections (
            chatbot_id, from_node_id, from_handle, to_node_id, label
          ) VALUES (
            ${chatbotId}, ${from_node_id}, ${from_handle || 'default'},
            ${to_node_id}, ${label || null}
          )
          ON CONFLICT (chatbot_id, from_node_id, from_handle) DO UPDATE SET
            to_node_id = EXCLUDED.to_node_id,
            label = EXCLUDED.label
          RETURNING *
        `);
      });

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao criar conexão:', error);
      res.status(500).json({ error: "Erro ao criar conexão do fluxo" });
    }
  });

  // Deletar conexão
  app.delete("/api/chatbot/connections", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { from_node_id, from_handle } = req.body;

      if (!from_node_id) {
        return res.status(400).json({ error: "from_node_id é obrigatório" });
      }

      await withRetry(async () => {
        return db.execute(sql`
          DELETE FROM chatbot_flow_connections conn
          USING chatbot_configs c
          WHERE conn.chatbot_id = c.id
            AND c.user_id = ${userId}
            AND conn.from_node_id = ${from_node_id}
            AND conn.from_handle = ${from_handle || 'default'}
        `);
      });

      res.json({ success: true });
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao deletar conexão:', error);
      res.status(500).json({ error: "Erro ao deletar conexão do fluxo" });
    }
  });

  // Salvar conexões em batch
  app.post("/api/chatbot/connections/batch", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { connections, replace } = req.body;
      if (!Array.isArray(connections)) {
        return res.status(400).json({ error: "connections deve ser um array" });
      }

      // Obter chatbot_id
      const configResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT id FROM chatbot_configs WHERE user_id = ${userId}
        `);
      });

      if (configResult.rows.length === 0) {
        return res.status(400).json({ error: "Chatbot não configurado" });
      }

      const chatbotId = (configResult.rows[0] as any).id;

      // Se replace=true, deletar conexões existentes
      if (replace) {
        await withRetry(async () => {
          return db.execute(sql`
            DELETE FROM chatbot_flow_connections WHERE chatbot_id = ${chatbotId}
          `);
        });
      }

      // Salvar todas as conexões
      const results = [];
      for (const conn of connections) {
        const result = await withRetry(async () => {
          return db.execute(sql`
            INSERT INTO chatbot_flow_connections (
              chatbot_id, from_node_id, from_handle, to_node_id, label
            ) VALUES (
              ${chatbotId}, ${conn.from_node_id}, ${conn.from_handle || 'default'},
              ${conn.to_node_id}, ${conn.label || null}
            )
            ON CONFLICT (chatbot_id, from_node_id, from_handle) DO UPDATE SET
              to_node_id = EXCLUDED.to_node_id,
              label = EXCLUDED.label
            RETURNING *
          `);
        });
        results.push(result.rows[0]);
      }

      res.json(results);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao salvar conexões em batch:', error);
      res.status(500).json({ error: "Erro ao salvar conexões do fluxo" });
    }
  });

  // ============================================================
  // SALVAR FLUXO COMPLETO (Nós + Conexões)
  // ============================================================

  app.post("/api/chatbot/flow/save", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { nodes, connections, config } = req.body;

      // Obter ou criar chatbot_id
      let configResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT id FROM chatbot_configs WHERE user_id = ${userId}
        `);
      });

      let chatbotId: string;
      if (configResult.rows.length === 0) {
        const newConfig = await withRetry(async () => {
          return db.execute(sql`
            INSERT INTO chatbot_configs (user_id, name)
            VALUES (${userId}, ${config?.name || 'Meu Robô'})
            RETURNING id
          `);
        });
        chatbotId = (newConfig.rows[0] as any).id;
      } else {
        chatbotId = (configResult.rows[0] as any).id;
      }

      // Atualizar config se fornecido
      if (config) {
        await withRetry(async () => {
          return db.execute(sql`
            UPDATE chatbot_configs SET
              name = COALESCE(${config.name}, name),
              description = ${config.description || null},
              welcome_message = COALESCE(${config.welcome_message}, welcome_message),
              fallback_message = COALESCE(${config.fallback_message}, fallback_message),
              goodbye_message = COALESCE(${config.goodbye_message}, goodbye_message),
              updated_at = now(),
              version = version + 1
            WHERE id = ${chatbotId}
          `);
        });
      }

      // Deletar nós e conexões antigas
      await withRetry(async () => {
        return db.execute(sql`
          DELETE FROM chatbot_flow_connections WHERE chatbot_id = ${chatbotId}
        `);
      });

      await withRetry(async () => {
        return db.execute(sql`
          DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ${chatbotId}
        `);
      });

      // Salvar novos nós
      if (Array.isArray(nodes)) {
        for (const node of nodes) {
          await withRetry(async () => {
            return db.execute(sql`
              INSERT INTO chatbot_flow_nodes (
                chatbot_id, node_id, name, node_type, content,
                next_node_id, position_x, position_y, display_order
              ) VALUES (
                ${chatbotId}, ${node.node_id || node.id}, ${node.name}, ${node.node_type || node.type},
                ${JSON.stringify(node.content || node.data || {})}, ${node.next_node_id || null},
                ${node.position_x ?? node.position?.x ?? 0}, 
                ${node.position_y ?? node.position?.y ?? 0}, 
                ${node.display_order ?? 0}
              )
            `);
          });
        }
      }

      // Salvar novas conexões
      if (Array.isArray(connections)) {
        for (const conn of connections) {
          await withRetry(async () => {
            return db.execute(sql`
              INSERT INTO chatbot_flow_connections (
                chatbot_id, from_node_id, from_handle, to_node_id, label
              ) VALUES (
                ${chatbotId}, ${conn.from_node_id || conn.source}, 
                ${conn.from_handle || conn.sourceHandle || 'default'},
                ${conn.to_node_id || conn.target}, ${conn.label || null}
              )
            `);
          });
        }
      }

      // 🔄 Limpar cache do fluxo para que as alterações tenham efeito imediato
      const { clearFlowCache } = await import("./chatbotFlowEngine");
      clearFlowCache(userId);
      console.log(`🔄 [CHATBOT_FLOW] Cache limpo para usuário ${userId} após salvar fluxo`);

      res.json({ success: true, chatbotId });
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao salvar fluxo:', error);
      res.status(500).json({ error: "Erro ao salvar fluxo completo" });
    }
  });

  // Carregar fluxo completo
  app.get("/api/chatbot/flow", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      // Buscar config
      const configResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT * FROM chatbot_configs WHERE user_id = ${userId}
        `);
      });

      if (configResult.rows.length === 0) {
        return res.json({ config: null, nodes: [], connections: [] });
      }

      const config = configResult.rows[0] as any;

      // Buscar nós
      const nodesResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT * FROM chatbot_flow_nodes 
          WHERE chatbot_id = ${config.id}
          ORDER BY display_order ASC, created_at ASC
        `);
      });

      // Buscar conexões
      const connectionsResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT * FROM chatbot_flow_connections 
          WHERE chatbot_id = ${config.id}
        `);
      });

      res.json({
        config,
        nodes: nodesResult.rows,
        connections: connectionsResult.rows
      });
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao carregar fluxo:', error);
      res.status(500).json({ error: "Erro ao carregar fluxo" });
    }
  });

  // ============================================================
  // TEMPLATES - Com fallback para templates hard-coded
  // ============================================================

  // Templates hard-coded para garantir funcionamento
  const HARDCODED_TEMPLATES = [
    {
      id: 'tpl_atendimento_basico',
      name: 'Atendimento Básico',
      description: 'Fluxo simples de boas-vindas com menu de opções',
      category: 'atendimento',
      is_featured: true,
      is_active: true,
      usage_count: 0,
      flow_data: {
        config: { name: 'Atendimento Básico', welcome_message: 'Olá! 👋 Seja bem-vindo!', fallback_message: 'Não entendi. Por favor, escolha uma opção:' },
        nodes: [
          { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
          { node_id: 'msg_boas_vindas', name: 'Boas-vindas', node_type: 'message', content: { message: 'Olá! 👋 Seja bem-vindo(a)!\n\nComo posso ajudar você hoje?' }, position_x: 250, position_y: 150 },
          { node_id: 'btn_menu', name: 'Menu Principal', node_type: 'buttons', content: { message: 'Escolha uma opção:', buttons: [{ id: 'btn_1', text: '1️⃣ Conhecer produtos', value: '1' }, { id: 'btn_2', text: '2️⃣ Falar com atendente', value: '2' }, { id: 'btn_3', text: '3️⃣ Horário de funcionamento', value: '3' }] }, position_x: 250, position_y: 280 },
          { node_id: 'msg_produtos', name: 'Produtos', node_type: 'message', content: { message: '📦 Temos diversos produtos!\n\nAcesse nosso catálogo ou me conte o que está procurando.' }, position_x: 50, position_y: 420 },
          { node_id: 'msg_atendente', name: 'Atendente', node_type: 'message', content: { message: '👤 Vou transferir você para um atendente humano.\n\nAguarde um momento, por favor!' }, position_x: 250, position_y: 420 },
          { node_id: 'msg_horario', name: 'Horário', node_type: 'message', content: { message: '🕐 Nosso horário de atendimento:\n\n📅 Segunda a Sexta: 8h às 18h\n📅 Sábado: 8h às 12h\n📅 Domingo: Fechado' }, position_x: 450, position_y: 420 },
          { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 550 }
        ],
        connections: [
          { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_boas_vindas' },
          { from_node_id: 'msg_boas_vindas', from_handle: 'default', to_node_id: 'btn_menu' },
          { from_node_id: 'btn_menu', from_handle: 'btn_1', to_node_id: 'msg_produtos', label: '1' },
          { from_node_id: 'btn_menu', from_handle: 'btn_2', to_node_id: 'msg_atendente', label: '2' },
          { from_node_id: 'btn_menu', from_handle: 'btn_3', to_node_id: 'msg_horario', label: '3' },
          { from_node_id: 'msg_produtos', from_handle: 'default', to_node_id: 'end_1' },
          { from_node_id: 'msg_atendente', from_handle: 'default', to_node_id: 'end_1' },
          { from_node_id: 'msg_horario', from_handle: 'default', to_node_id: 'end_1' }
        ]
      }
    },
    {
      id: 'tpl_coleta_leads',
      name: 'Coleta de Leads',
      description: 'Captura nome, email e telefone do cliente',
      category: 'vendas',
      is_featured: true,
      is_active: true,
      usage_count: 0,
      flow_data: {
        config: { name: 'Coleta de Leads', welcome_message: 'Olá! Vamos começar seu cadastro.', fallback_message: 'Por favor, responda a pergunta acima.' },
        nodes: [
          { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
          { node_id: 'msg_intro', name: 'Introdução', node_type: 'message', content: { message: '👋 Olá! Que bom ter você aqui!\n\nPara prosseguir, preciso de algumas informações.' }, position_x: 250, position_y: 150 },
          { node_id: 'collect_nome', name: 'Coletar Nome', node_type: 'collect', content: { variable: 'nome', message: '📝 Qual é o seu nome completo?', validation: 'text' }, position_x: 250, position_y: 280 },
          { node_id: 'collect_email', name: 'Coletar Email', node_type: 'collect', content: { variable: 'email', message: '📧 Qual é o seu melhor email?', validation: 'email' }, position_x: 250, position_y: 410 },
          { node_id: 'collect_telefone', name: 'Coletar Telefone', node_type: 'collect', content: { variable: 'telefone', message: '📱 Qual é o seu telefone com DDD?', validation: 'phone' }, position_x: 250, position_y: 540 },
          { node_id: 'msg_confirmacao', name: 'Confirmação', node_type: 'message', content: { message: '✅ Perfeito, {{nome}}!\n\nSeus dados foram registrados com sucesso.\n\nEntraremos em contato em breve!' }, position_x: 250, position_y: 670 },
          { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 800 }
        ],
        connections: [
          { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
          { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'collect_nome' },
          { from_node_id: 'collect_nome', from_handle: 'default', to_node_id: 'collect_email' },
          { from_node_id: 'collect_email', from_handle: 'default', to_node_id: 'collect_telefone' },
          { from_node_id: 'collect_telefone', from_handle: 'default', to_node_id: 'msg_confirmacao' },
          { from_node_id: 'msg_confirmacao', from_handle: 'default', to_node_id: 'end_1' }
        ]
      }
    },
    {
      id: 'tpl_agendamento',
      name: 'Agendamento Simples',
      description: 'Fluxo para agendar horários',
      category: 'agendamento',
      is_featured: true,
      is_active: true,
      usage_count: 0,
      flow_data: {
        config: { name: 'Agendamento', welcome_message: 'Olá! Vamos agendar seu horário.', fallback_message: 'Por favor, escolha uma opção válida.' },
        nodes: [
          { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
          { node_id: 'msg_intro', name: 'Introdução', node_type: 'message', content: { message: '📅 Olá! Vou ajudar você a agendar um horário.\n\nVamos lá?' }, position_x: 250, position_y: 150 },
          { node_id: 'collect_nome', name: 'Nome', node_type: 'collect', content: { variable: 'nome', message: 'Qual é o seu nome?', validation: 'text' }, position_x: 250, position_y: 280 },
          { node_id: 'btn_dia', name: 'Dia', node_type: 'buttons', content: { message: '{{nome}}, qual dia você prefere?', buttons: [{ id: 'seg', text: 'Segunda-feira', value: 'Segunda' }, { id: 'ter', text: 'Terça-feira', value: 'Terça' }, { id: 'qua', text: 'Quarta-feira', value: 'Quarta' }, { id: 'qui', text: 'Quinta-feira', value: 'Quinta' }, { id: 'sex', text: 'Sexta-feira', value: 'Sexta' }] }, position_x: 250, position_y: 410 },
          { node_id: 'btn_horario', name: 'Horário', node_type: 'buttons', content: { message: 'Qual horário?', buttons: [{ id: 'h1', text: '09:00', value: '09:00' }, { id: 'h2', text: '10:00', value: '10:00' }, { id: 'h3', text: '14:00', value: '14:00' }, { id: 'h4', text: '15:00', value: '15:00' }, { id: 'h5', text: '16:00', value: '16:00' }] }, position_x: 250, position_y: 540 },
          { node_id: 'msg_confirm', name: 'Confirmação', node_type: 'message', content: { message: '✅ Agendamento confirmado!\n\n📅 Dia: {{dia}}\n⏰ Horário: {{horario}}\n\nAguardamos você, {{nome}}!' }, position_x: 250, position_y: 670 },
          { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 800 }
        ],
        connections: [
          { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
          { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'collect_nome' },
          { from_node_id: 'collect_nome', from_handle: 'default', to_node_id: 'btn_dia' },
          { from_node_id: 'btn_dia', from_handle: 'seg', to_node_id: 'btn_horario' },
          { from_node_id: 'btn_dia', from_handle: 'ter', to_node_id: 'btn_horario' },
          { from_node_id: 'btn_dia', from_handle: 'qua', to_node_id: 'btn_horario' },
          { from_node_id: 'btn_dia', from_handle: 'qui', to_node_id: 'btn_horario' },
          { from_node_id: 'btn_dia', from_handle: 'sex', to_node_id: 'btn_horario' },
          { from_node_id: 'btn_horario', from_handle: 'h1', to_node_id: 'msg_confirm' },
          { from_node_id: 'btn_horario', from_handle: 'h2', to_node_id: 'msg_confirm' },
          { from_node_id: 'btn_horario', from_handle: 'h3', to_node_id: 'msg_confirm' },
          { from_node_id: 'btn_horario', from_handle: 'h4', to_node_id: 'msg_confirm' },
          { from_node_id: 'btn_horario', from_handle: 'h5', to_node_id: 'msg_confirm' },
          { from_node_id: 'msg_confirm', from_handle: 'default', to_node_id: 'end_1' }
        ]
      }
    },
    {
      id: 'tpl_delivery',
      name: 'Delivery/Pizzaria',
      description: 'Cardápio DINÂMICO - carrega itens reais do seu cadastro de delivery',
      category: 'delivery',
      is_featured: true,
      is_active: true,
      usage_count: 0,
      flow_data: {
        config: { 
          name: 'Delivery Dinâmico', 
          welcome_message: 'Olá! Bem-vindo ao nosso delivery!', 
          fallback_message: 'Por favor, escolha uma opção do menu.',
          // Flag especial para indicar que este template usa dados dinâmicos
          useDynamicMenu: true
        },
        nodes: [
          { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
          { node_id: 'msg_boas_vindas', name: 'Boas-vindas', node_type: 'message', content: { text: '🍕 Olá! Bem-vindo(a) ao nosso delivery!\n\nTemos os melhores produtos para você! 🎉' }, position_x: 250, position_y: 150 },
          { node_id: 'btn_menu', name: 'Menu Principal', node_type: 'buttons', content: { body: 'O que você deseja?', buttons: [{ id: 'fazer_pedido', title: '🛒 Fazer Pedido' }, { id: 'ver_carrinho', title: '📦 Ver Carrinho' }, { id: 'horario', title: '⏰ Horário' }] }, position_x: 250, position_y: 280 },
          // Este nó é especial - carrega dados dinâmicos do Supabase
          { node_id: 'list_cardapio', name: 'Cardápio', node_type: 'list', content: { 
            body: '📋 *NOSSO CARDÁPIO*\n\nEscolha um item para adicionar ao pedido:',
            button_text: 'Ver Cardápio',
            // Marcador especial: DYNAMIC_MENU será substituído pelos itens reais
            sections: [{ title: '⏳ Carregando cardápio...', rows: [{ id: 'loading', title: 'Aguarde...', description: 'Buscando itens do cardápio' }] }],
            dynamicSource: 'menu_items' // Indica que deve buscar do Supabase
          }, position_x: 100, position_y: 420 },
          { node_id: 'msg_item_adicionado', name: 'Item Adicionado', node_type: 'message', content: { text: '✅ *{{item_nome}}* adicionado ao carrinho!\n\n💰 Subtotal: R$ {{carrinho_total}}\n\nDeseja adicionar mais itens?' }, position_x: 100, position_y: 550 },
          { node_id: 'btn_mais_itens', name: 'Mais Itens?', node_type: 'buttons', content: { body: 'O que deseja fazer?', buttons: [{ id: 'mais', title: '➕ Adicionar Mais' }, { id: 'finalizar', title: '✅ Finalizar Pedido' }] }, position_x: 100, position_y: 680 },
          { node_id: 'msg_carrinho', name: 'Carrinho', node_type: 'message', content: { text: '🛒 *SEU CARRINHO*\n\n{{carrinho_itens}}\n\n💰 *Total: R$ {{carrinho_total}}*' }, position_x: 350, position_y: 420 },
          { node_id: 'btn_carrinho_acao', name: 'Ação Carrinho', node_type: 'buttons', content: { body: 'O que deseja fazer?', buttons: [{ id: 'continuar', title: '➕ Continuar Comprando' }, { id: 'finalizar', title: '✅ Finalizar Pedido' }, { id: 'limpar', title: '🗑️ Limpar Carrinho' }] }, position_x: 350, position_y: 550 },
          { node_id: 'msg_horario', name: 'Horário', node_type: 'message', content: { text: '⏰ *HORÁRIO DE FUNCIONAMENTO*\n\n📅 Segunda a Domingo\n🕐 18h às 23h\n📍 Entrega em até 45 minutos\n🚚 Taxa de entrega: R$ 5,00' }, position_x: 500, position_y: 420 },
          { node_id: 'input_endereco', name: 'Endereço', node_type: 'input', content: { variable_name: 'endereco', message: '📍 Qual é o endereço de entrega?\n\n(Rua, número, bairro)', validation: 'text' }, position_x: 250, position_y: 810 },
          { node_id: 'btn_pagamento', name: 'Pagamento', node_type: 'buttons', content: { body: '💳 Como deseja pagar?', buttons: [{ id: 'pix', title: '📱 PIX' }, { id: 'cartao', title: '💳 Cartão' }, { id: 'dinheiro', title: '💵 Dinheiro' }] }, position_x: 250, position_y: 940 },
          // Este nó é especial - cria o pedido no Supabase
          { node_id: 'msg_confirmacao', name: 'Confirmação', node_type: 'message', content: { 
            text: '✅ *PEDIDO CONFIRMADO!*\n\n🛒 {{carrinho_itens}}\n📍 {{endereco}}\n💳 {{pagamento}}\n💰 *Total: R$ {{carrinho_total}}*\n\n⏱️ Tempo estimado: 45 min\n\nObrigado pela preferência! 🙏',
            // Flag especial para criar pedido no Supabase
            createOrder: true
          }, position_x: 250, position_y: 1070 },
          { node_id: 'msg_carrinho_limpo', name: 'Carrinho Limpo', node_type: 'message', content: { text: '🗑️ Carrinho limpo!\n\nDeseja fazer um novo pedido?' }, position_x: 500, position_y: 680 },
          { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 1200 }
        ],
        connections: [
          { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_boas_vindas' },
          { from_node_id: 'msg_boas_vindas', from_handle: 'default', to_node_id: 'btn_menu' },
          { from_node_id: 'btn_menu', from_handle: 'fazer_pedido', to_node_id: 'list_cardapio' },
          { from_node_id: 'btn_menu', from_handle: 'button_fazer_pedido', to_node_id: 'list_cardapio' },
          { from_node_id: 'btn_menu', from_handle: 'ver_carrinho', to_node_id: 'msg_carrinho' },
          { from_node_id: 'btn_menu', from_handle: 'button_ver_carrinho', to_node_id: 'msg_carrinho' },
          { from_node_id: 'btn_menu', from_handle: 'horario', to_node_id: 'msg_horario' },
          { from_node_id: 'btn_menu', from_handle: 'button_horario', to_node_id: 'msg_horario' },
          // Qualquer item selecionado do cardápio vai para "item adicionado"
          { from_node_id: 'list_cardapio', from_handle: 'default', to_node_id: 'msg_item_adicionado' },
          { from_node_id: 'msg_item_adicionado', from_handle: 'default', to_node_id: 'btn_mais_itens' },
          { from_node_id: 'btn_mais_itens', from_handle: 'mais', to_node_id: 'list_cardapio' },
          { from_node_id: 'btn_mais_itens', from_handle: 'button_mais', to_node_id: 'list_cardapio' },
          { from_node_id: 'btn_mais_itens', from_handle: 'finalizar', to_node_id: 'input_endereco' },
          { from_node_id: 'btn_mais_itens', from_handle: 'button_finalizar', to_node_id: 'input_endereco' },
          { from_node_id: 'msg_carrinho', from_handle: 'default', to_node_id: 'btn_carrinho_acao' },
          { from_node_id: 'btn_carrinho_acao', from_handle: 'continuar', to_node_id: 'list_cardapio' },
          { from_node_id: 'btn_carrinho_acao', from_handle: 'button_continuar', to_node_id: 'list_cardapio' },
          { from_node_id: 'btn_carrinho_acao', from_handle: 'finalizar', to_node_id: 'input_endereco' },
          { from_node_id: 'btn_carrinho_acao', from_handle: 'button_finalizar', to_node_id: 'input_endereco' },
          { from_node_id: 'btn_carrinho_acao', from_handle: 'limpar', to_node_id: 'msg_carrinho_limpo' },
          { from_node_id: 'btn_carrinho_acao', from_handle: 'button_limpar', to_node_id: 'msg_carrinho_limpo' },
          { from_node_id: 'msg_horario', from_handle: 'default', to_node_id: 'btn_menu' },
          { from_node_id: 'msg_carrinho_limpo', from_handle: 'default', to_node_id: 'btn_menu' },
          { from_node_id: 'input_endereco', from_handle: 'default', to_node_id: 'btn_pagamento' },
          { from_node_id: 'btn_pagamento', from_handle: 'pix', to_node_id: 'msg_confirmacao' },
          { from_node_id: 'btn_pagamento', from_handle: 'button_pix', to_node_id: 'msg_confirmacao' },
          { from_node_id: 'btn_pagamento', from_handle: 'cartao', to_node_id: 'msg_confirmacao' },
          { from_node_id: 'btn_pagamento', from_handle: 'button_cartao', to_node_id: 'msg_confirmacao' },
          { from_node_id: 'btn_pagamento', from_handle: 'dinheiro', to_node_id: 'msg_confirmacao' },
          { from_node_id: 'btn_pagamento', from_handle: 'button_dinheiro', to_node_id: 'msg_confirmacao' },
          { from_node_id: 'msg_confirmacao', from_handle: 'default', to_node_id: 'end_1' }
        ]
      }
    },
    {
      id: 'tpl_delivery_simples',
      name: 'Delivery Simples',
      description: 'Fluxo básico para delivery: cardápio → endereço → pagamento',
      category: 'delivery',
      is_featured: true,
      is_active: true,
      usage_count: 0,
      flow_data: {
        config: { name: 'Delivery Simples', welcome_message: 'Olá! Faça seu pedido!', fallback_message: 'Escolha uma opção:' },
        nodes: [
          { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
          { node_id: 'msg_intro', name: 'Introdução', node_type: 'message', content: { message: '🍔 Olá! Seja bem-vindo!\n\nVeja nosso cardápio e faça seu pedido!' }, position_x: 250, position_y: 150 },
          { node_id: 'collect_pedido', name: 'Pedido', node_type: 'collect', content: { variable: 'pedido', message: '📝 O que você vai querer?', validation: 'text' }, position_x: 250, position_y: 280 },
          { node_id: 'collect_endereco', name: 'Endereço', node_type: 'collect', content: { variable: 'endereco', message: '📍 Qual o endereço de entrega?', validation: 'text' }, position_x: 250, position_y: 410 },
          { node_id: 'btn_pagamento', name: 'Pagamento', node_type: 'buttons', content: { message: '💳 Forma de pagamento?', buttons: [{ id: 'pix', text: 'PIX', value: 'PIX' }, { id: 'cartao', text: 'Cartão', value: 'Cartão' }, { id: 'dinheiro', text: 'Dinheiro', value: 'Dinheiro' }] }, position_x: 250, position_y: 540 },
          { node_id: 'msg_confirm', name: 'Confirmação', node_type: 'message', content: { message: '✅ Pedido recebido!\n\n🛒 {{pedido}}\n📍 {{endereco}}\n💳 {{pagamento}}\n\nObrigado!' }, position_x: 250, position_y: 670 },
          { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 800 }
        ],
        connections: [
          { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
          { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'collect_pedido' },
          { from_node_id: 'collect_pedido', from_handle: 'default', to_node_id: 'collect_endereco' },
          { from_node_id: 'collect_endereco', from_handle: 'default', to_node_id: 'btn_pagamento' },
          { from_node_id: 'btn_pagamento', from_handle: 'pix', to_node_id: 'msg_confirm' },
          { from_node_id: 'btn_pagamento', from_handle: 'cartao', to_node_id: 'msg_confirm' },
          { from_node_id: 'btn_pagamento', from_handle: 'dinheiro', to_node_id: 'msg_confirm' },
          { from_node_id: 'msg_confirm', from_handle: 'default', to_node_id: 'end_1' }
        ]
      }
    },
    {
      id: 'tpl_clinica',
      name: 'Clínica Médica',
      description: 'Agendamento de consultas médicas com seleção de especialidade e horários',
      category: 'saude',
      is_featured: true,
      is_active: true,
      usage_count: 0,
      flow_data: {
        config: { name: 'Clínica Médica', welcome_message: 'Olá! Bem-vindo à clínica.', fallback_message: 'Por favor, escolha uma opção.' },
        nodes: [
          { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
          { node_id: 'msg_intro', name: 'Boas-vindas', node_type: 'message', content: { message: '🏥 Olá! Bem-vindo(a) à nossa clínica.\n\nComo posso ajudar?' }, position_x: 250, position_y: 150 },
          { node_id: 'btn_opcoes', name: 'Opções', node_type: 'buttons', content: { message: 'O que você precisa?', buttons: [{ id: 'agendar', text: '📅 Agendar Consulta', value: 'agendar' }, { id: 'horarios', text: '⏰ Ver Horários', value: 'horarios' }, { id: 'contato', text: '📞 Falar com Atendente', value: 'contato' }] }, position_x: 250, position_y: 280 },
          { node_id: 'btn_especialidade', name: 'Especialidade', node_type: 'buttons', content: { message: '👨‍⚕️ Qual especialidade?', buttons: [{ id: 'clinico', text: 'Clínico Geral', value: 'Clínico Geral' }, { id: 'cardio', text: 'Cardiologista', value: 'Cardiologista' }, { id: 'dermato', text: 'Dermatologista', value: 'Dermatologista' }] }, position_x: 50, position_y: 420 },
          { node_id: 'msg_horarios', name: 'Horários', node_type: 'message', content: { message: '⏰ Nossos horários:\n\n📅 Segunda a Sexta: 8h às 18h\n📅 Sábado: 8h às 12h' }, position_x: 250, position_y: 420 },
          { node_id: 'msg_contato', name: 'Contato', node_type: 'message', content: { message: '📞 Um atendente entrará em contato em breve!\n\nOu ligue: (11) 1234-5678' }, position_x: 450, position_y: 420 },
          { node_id: 'collect_nome', name: 'Nome', node_type: 'collect', content: { variable: 'nome', message: '📝 Qual é o seu nome completo?', validation: 'text' }, position_x: 50, position_y: 550 },
          { node_id: 'collect_telefone', name: 'Telefone', node_type: 'collect', content: { variable: 'telefone', message: '📱 Qual é o seu telefone para contato?', validation: 'phone' }, position_x: 50, position_y: 680 },
          { node_id: 'msg_confirmacao', name: 'Confirmação', node_type: 'message', content: { message: '✅ Solicitação de agendamento recebida!\n\n👤 {{nome}}\n📱 {{telefone}}\n👨‍⚕️ {{especialidade}}\n\nEntraremos em contato para confirmar o horário.' }, position_x: 50, position_y: 810 },
          { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 940 }
        ],
        connections: [
          { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
          { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'btn_opcoes' },
          { from_node_id: 'btn_opcoes', from_handle: 'agendar', to_node_id: 'btn_especialidade' },
          { from_node_id: 'btn_opcoes', from_handle: 'horarios', to_node_id: 'msg_horarios' },
          { from_node_id: 'btn_opcoes', from_handle: 'contato', to_node_id: 'msg_contato' },
          { from_node_id: 'btn_especialidade', from_handle: 'clinico', to_node_id: 'collect_nome' },
          { from_node_id: 'btn_especialidade', from_handle: 'cardio', to_node_id: 'collect_nome' },
          { from_node_id: 'btn_especialidade', from_handle: 'dermato', to_node_id: 'collect_nome' },
          { from_node_id: 'msg_horarios', from_handle: 'default', to_node_id: 'btn_opcoes' },
          { from_node_id: 'msg_contato', from_handle: 'default', to_node_id: 'end_1' },
          { from_node_id: 'collect_nome', from_handle: 'default', to_node_id: 'collect_telefone' },
          { from_node_id: 'collect_telefone', from_handle: 'default', to_node_id: 'msg_confirmacao' },
          { from_node_id: 'msg_confirmacao', from_handle: 'default', to_node_id: 'end_1' }
        ]
      }
    },
    {
      id: 'tpl_servicos_tecnicos',
      name: 'Serviços Técnicos',
      description: 'Orçamento e agendamento de serviços elétricos, hidráulicos e manutenção',
      category: 'servicos',
      is_featured: true,
      is_active: true,
      usage_count: 0,
      flow_data: {
        config: { name: 'Serviços Técnicos', welcome_message: 'Olá! Precisa de um serviço?', fallback_message: 'Escolha o tipo de serviço:' },
        nodes: [
          { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
          { node_id: 'msg_intro', name: 'Boas-vindas', node_type: 'message', content: { message: '🔧 Olá! Somos especialistas em serviços técnicos.\n\nComo posso ajudar?' }, position_x: 250, position_y: 150 },
          { node_id: 'btn_servico', name: 'Tipo de Serviço', node_type: 'buttons', content: { message: 'Qual tipo de serviço você precisa?', buttons: [{ id: 'eletrica', text: '⚡ Elétrica', value: 'Elétrica' }, { id: 'hidraulica', text: '🔧 Hidráulica', value: 'Hidráulica' }, { id: 'manutencao', text: '🏠 Manutenção Geral', value: 'Manutenção' }, { id: 'orcamento', text: '💰 Solicitar Orçamento', value: 'Orçamento' }] }, position_x: 250, position_y: 280 },
          { node_id: 'collect_problema', name: 'Problema', node_type: 'collect', content: { variable: 'problema', message: '📝 Descreva o problema ou serviço que precisa:', validation: 'text' }, position_x: 250, position_y: 420 },
          { node_id: 'collect_endereco', name: 'Endereço', node_type: 'collect', content: { variable: 'endereco', message: '📍 Qual é o endereço do serviço?', validation: 'text' }, position_x: 250, position_y: 550 },
          { node_id: 'collect_telefone', name: 'Telefone', node_type: 'collect', content: { variable: 'telefone', message: '📱 Seu telefone para contato:', validation: 'phone' }, position_x: 250, position_y: 680 },
          { node_id: 'msg_confirmacao', name: 'Confirmação', node_type: 'message', content: { message: '✅ Solicitação registrada!\n\n🔧 Serviço: {{servico}}\n📝 {{problema}}\n📍 {{endereco}}\n📱 {{telefone}}\n\nEntraremos em contato em até 2 horas!' }, position_x: 250, position_y: 810 },
          { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 940 }
        ],
        connections: [
          { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
          { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'btn_servico' },
          { from_node_id: 'btn_servico', from_handle: 'eletrica', to_node_id: 'collect_problema' },
          { from_node_id: 'btn_servico', from_handle: 'hidraulica', to_node_id: 'collect_problema' },
          { from_node_id: 'btn_servico', from_handle: 'manutencao', to_node_id: 'collect_problema' },
          { from_node_id: 'btn_servico', from_handle: 'orcamento', to_node_id: 'collect_problema' },
          { from_node_id: 'collect_problema', from_handle: 'default', to_node_id: 'collect_endereco' },
          { from_node_id: 'collect_endereco', from_handle: 'default', to_node_id: 'collect_telefone' },
          { from_node_id: 'collect_telefone', from_handle: 'default', to_node_id: 'msg_confirmacao' },
          { from_node_id: 'msg_confirmacao', from_handle: 'default', to_node_id: 'end_1' }
        ]
      }
    },
    {
      id: 'tpl_faq',
      name: 'FAQ Interativo',
      description: 'Perguntas frequentes com menu',
      category: 'faq',
      is_featured: false,
      is_active: true,
      usage_count: 0,
      flow_data: {
        config: { name: 'FAQ', welcome_message: 'Olá! Veja nossas perguntas frequentes.', fallback_message: 'Escolha uma pergunta:' },
        nodes: [
          { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
          { node_id: 'msg_intro', name: 'Introdução', node_type: 'message', content: { message: '❓ Olá! Veja as perguntas mais frequentes:' }, position_x: 250, position_y: 150 },
          { node_id: 'btn_perguntas', name: 'Perguntas', node_type: 'buttons', content: { message: 'Sobre o que você quer saber?', buttons: [{ id: 'preco', text: '💰 Preços', value: 'precos' }, { id: 'entrega', text: '🚚 Entrega', value: 'entrega' }, { id: 'pagamento', text: '💳 Pagamento', value: 'pagamento' }, { id: 'outro', text: '❓ Outra dúvida', value: 'outro' }] }, position_x: 250, position_y: 280 },
          { node_id: 'msg_precos', name: 'Preços', node_type: 'message', content: { message: '💰 *PREÇOS*\n\nNossos preços variam conforme o produto.\nAcesse nosso catálogo ou pergunte sobre um item específico!' }, position_x: 50, position_y: 420 },
          { node_id: 'msg_entrega', name: 'Entrega', node_type: 'message', content: { message: '🚚 *ENTREGA*\n\nEntregamos em toda a cidade!\n⏱️ Prazo: 1-3 dias úteis\n💰 Frete grátis acima de R$100' }, position_x: 200, position_y: 420 },
          { node_id: 'msg_pagamento', name: 'Pagamento', node_type: 'message', content: { message: '💳 *FORMAS DE PAGAMENTO*\n\n✅ PIX (5% desconto)\n✅ Cartão de crédito\n✅ Boleto bancário\n✅ Dinheiro na entrega' }, position_x: 350, position_y: 420 },
          { node_id: 'msg_outro', name: 'Outro', node_type: 'message', content: { message: '📝 Digite sua dúvida que um atendente responderá em breve!' }, position_x: 500, position_y: 420 },
          { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 550 }
        ],
        connections: [
          { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
          { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'btn_perguntas' },
          { from_node_id: 'btn_perguntas', from_handle: 'preco', to_node_id: 'msg_precos' },
          { from_node_id: 'btn_perguntas', from_handle: 'entrega', to_node_id: 'msg_entrega' },
          { from_node_id: 'btn_perguntas', from_handle: 'pagamento', to_node_id: 'msg_pagamento' },
          { from_node_id: 'btn_perguntas', from_handle: 'outro', to_node_id: 'msg_outro' },
          { from_node_id: 'msg_precos', from_handle: 'default', to_node_id: 'btn_perguntas' },
          { from_node_id: 'msg_entrega', from_handle: 'default', to_node_id: 'btn_perguntas' },
          { from_node_id: 'msg_pagamento', from_handle: 'default', to_node_id: 'btn_perguntas' },
          { from_node_id: 'msg_outro', from_handle: 'default', to_node_id: 'end_1' }
        ]
      }
    },
    {
      id: 'tpl_enquete',
      name: 'Enquete de Satisfação',
      description: 'Coletar feedback: sim/não → nota → comentário',
      category: 'pesquisa',
      is_featured: false,
      is_active: true,
      usage_count: 0,
      flow_data: {
        config: { name: 'Enquete de Satisfação', welcome_message: 'Olá! Queremos saber sua opinião.', fallback_message: 'Por favor, responda a pergunta.' },
        nodes: [
          { node_id: 'start_1', name: 'Início', node_type: 'start', content: {}, position_x: 250, position_y: 50 },
          { node_id: 'msg_intro', name: 'Introdução', node_type: 'message', content: { message: '📊 Olá! Gostaríamos de saber sua opinião sobre nosso atendimento.\n\nLeva menos de 1 minuto!' }, position_x: 250, position_y: 150 },
          { node_id: 'btn_satisfeito', name: 'Satisfeito?', node_type: 'buttons', content: { message: 'Você está satisfeito com nosso serviço?', buttons: [{ id: 'sim', text: '✅ Sim', value: 'Sim' }, { id: 'nao', text: '❌ Não', value: 'Não' }] }, position_x: 250, position_y: 280 },
          { node_id: 'btn_nota', name: 'Nota', node_type: 'buttons', content: { message: 'De 1 a 5, qual nota você daria?', buttons: [{ id: 'n1', text: '1 ⭐', value: '1' }, { id: 'n2', text: '2 ⭐⭐', value: '2' }, { id: 'n3', text: '3 ⭐⭐⭐', value: '3' }, { id: 'n4', text: '4 ⭐⭐⭐⭐', value: '4' }, { id: 'n5', text: '5 ⭐⭐⭐⭐⭐', value: '5' }] }, position_x: 250, position_y: 420 },
          { node_id: 'collect_comentario', name: 'Comentário', node_type: 'collect', content: { variable: 'comentario', message: '💬 Deixe um comentário (opcional):\n\n(Digite "pular" para finalizar)', validation: 'text' }, position_x: 250, position_y: 560 },
          { node_id: 'msg_agradecimento', name: 'Agradecimento', node_type: 'message', content: { message: '🙏 Muito obrigado pelo seu feedback!\n\n✅ Satisfeito: {{satisfeito}}\n⭐ Nota: {{nota}}\n💬 Comentário: {{comentario}}\n\nSua opinião é muito importante para nós!' }, position_x: 250, position_y: 700 },
          { node_id: 'end_1', name: 'Fim', node_type: 'end', content: {}, position_x: 250, position_y: 830 }
        ],
        connections: [
          { from_node_id: 'start_1', from_handle: 'default', to_node_id: 'msg_intro' },
          { from_node_id: 'msg_intro', from_handle: 'default', to_node_id: 'btn_satisfeito' },
          { from_node_id: 'btn_satisfeito', from_handle: 'sim', to_node_id: 'btn_nota', label: 'Sim' },
          { from_node_id: 'btn_satisfeito', from_handle: 'nao', to_node_id: 'btn_nota', label: 'Não' },
          { from_node_id: 'btn_nota', from_handle: 'n1', to_node_id: 'collect_comentario' },
          { from_node_id: 'btn_nota', from_handle: 'n2', to_node_id: 'collect_comentario' },
          { from_node_id: 'btn_nota', from_handle: 'n3', to_node_id: 'collect_comentario' },
          { from_node_id: 'btn_nota', from_handle: 'n4', to_node_id: 'collect_comentario' },
          { from_node_id: 'btn_nota', from_handle: 'n5', to_node_id: 'collect_comentario' },
          { from_node_id: 'collect_comentario', from_handle: 'default', to_node_id: 'msg_agradecimento' },
          { from_node_id: 'msg_agradecimento', from_handle: 'default', to_node_id: 'end_1' }
        ]
      }
    }
  ];

  // Listar templates disponíveis (com fallback para hard-coded)
  app.get("/api/chatbot/templates", async (req: Request, res: Response) => {
    try {
      const { category, featured } = req.query;

      // Tentar buscar do banco primeiro
      let query = sql`
        SELECT * FROM chatbot_templates WHERE is_active = true
      `;

      if (category) {
        query = sql`
          SELECT * FROM chatbot_templates 
          WHERE is_active = true AND category = ${category}
        `;
      }

      if (featured === 'true') {
        query = sql`
          SELECT * FROM chatbot_templates 
          WHERE is_active = true AND is_featured = true
        `;
      }

      let templates: any[] = [];
      
      try {
        const result = await withRetry(async () => {
          return db.execute(sql`${query} ORDER BY is_featured DESC, usage_count DESC`);
        });
        templates = result.rows as any[];
      } catch (dbError) {
        console.log('[CHATBOT_FLOW] Tabela chatbot_templates não existe, usando hard-coded');
      }

      // Se não tem templates no banco, usar hard-coded
      if (templates.length === 0) {
        console.log('[CHATBOT_FLOW] Usando templates hard-coded');
        let filtered = HARDCODED_TEMPLATES;
        
        if (category) {
          filtered = filtered.filter(t => t.category === category);
        }
        if (featured === 'true') {
          filtered = filtered.filter(t => t.is_featured);
        }
        
        return res.json(filtered);
      }

      res.json(templates);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao listar templates:', error);
      // Em caso de erro, retornar templates hard-coded
      res.json(HARDCODED_TEMPLATES);
    }
  });

  // Aplicar template ao fluxo
  app.post("/api/chatbot/templates/:templateId/apply", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { templateId } = req.params;
      console.log(`[CHATBOT_FLOW] Aplicando template ${templateId} para usuário ${userId}`);

      // Primeiro tentar buscar no banco
      let template: any = null;
      
      try {
        const templateResult = await withRetry(async () => {
          return db.execute(sql`
            SELECT * FROM chatbot_templates WHERE id = ${templateId} AND is_active = true
          `);
        });
        
        if (templateResult.rows.length > 0) {
          template = templateResult.rows[0];
        }
      } catch (dbError) {
        console.log('[CHATBOT_FLOW] Erro ao buscar template no banco, tentando hard-coded');
      }

      // Se não encontrou no banco, buscar nos hard-coded
      if (!template) {
        template = HARDCODED_TEMPLATES.find(t => t.id === templateId);
        console.log(`[CHATBOT_FLOW] Usando template hard-coded: ${template?.name}`);
      }

      if (!template) {
        return res.status(404).json({ error: "Template não encontrado" });
      }

      const flowData = template.flow_data;

      // Incrementar contador de uso (apenas se existir no banco)
      try {
        await withRetry(async () => {
          return db.execute(sql`
            UPDATE chatbot_templates SET usage_count = usage_count + 1 WHERE id = ${templateId}
          `);
        });
      } catch (e) {
        // Ignorar erro se tabela não existir
      }

      // Aplicar template usando a rota de save existente
      // Simular chamada interna
      const fakeReq = {
        user: { id: userId },
        body: {
          nodes: flowData.nodes,
          connections: flowData.connections,
          config: flowData.config
        }
      } as any;

      const fakeRes = {
        json: (data: any) => res.json({ success: true, ...data, templateName: template.name }),
        status: (code: number) => ({ json: (data: any) => res.status(code).json(data) })
      } as any;

      // Chamar a lógica de save diretamente
      // Para simplicidade, vamos duplicar a lógica aqui
      let configResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT id FROM chatbot_configs WHERE user_id = ${userId}
        `);
      });

      let chatbotId: string;
      if (configResult.rows.length === 0) {
        const newConfig = await withRetry(async () => {
          return db.execute(sql`
            INSERT INTO chatbot_configs (user_id, name, welcome_message, fallback_message)
            VALUES (
              ${userId}, 
              ${flowData.config?.name || template.name},
              ${flowData.config?.welcome_message || 'Olá! 👋'},
              ${flowData.config?.fallback_message || 'Não entendi. Escolha uma opção:'}
            )
            RETURNING id
          `);
        });
        chatbotId = (newConfig.rows[0] as any).id;
      } else {
        chatbotId = (configResult.rows[0] as any).id;
        
        // Atualizar config
        await withRetry(async () => {
          return db.execute(sql`
            UPDATE chatbot_configs SET
              name = ${flowData.config?.name || template.name},
              welcome_message = ${flowData.config?.welcome_message || 'Olá! 👋'},
              fallback_message = ${flowData.config?.fallback_message || 'Não entendi. Escolha uma opção:'},
              updated_at = now()
            WHERE id = ${chatbotId}
          `);
        });
      }

      // Limpar nós e conexões existentes
      await withRetry(async () => {
        return db.execute(sql`DELETE FROM chatbot_flow_connections WHERE chatbot_id = ${chatbotId}`);
      });
      await withRetry(async () => {
        return db.execute(sql`DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ${chatbotId}`);
      });

      // Inserir nós do template
      if (Array.isArray(flowData.nodes)) {
        for (const node of flowData.nodes) {
          await withRetry(async () => {
            return db.execute(sql`
              INSERT INTO chatbot_flow_nodes (
                chatbot_id, node_id, name, node_type, content,
                position_x, position_y
              ) VALUES (
                ${chatbotId}, ${node.node_id}, ${node.name}, ${node.node_type},
                ${JSON.stringify(node.content || {})},
                ${node.position_x || 0}, ${node.position_y || 0}
              )
            `);
          });
        }
      }

      // Inserir conexões do template
      if (Array.isArray(flowData.connections)) {
        for (const conn of flowData.connections) {
          await withRetry(async () => {
            return db.execute(sql`
              INSERT INTO chatbot_flow_connections (
                chatbot_id, from_node_id, from_handle, to_node_id
              ) VALUES (
                ${chatbotId}, ${conn.from_node_id}, ${conn.from_handle || 'default'}, ${conn.to_node_id}
              )
            `);
          });
        }
      }

      res.json({ 
        success: true, 
        templateName: template.name,
        chatbotId,
        nodesCount: flowData.nodes?.length || 0,
        connectionsCount: flowData.connections?.length || 0
      });
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao aplicar template:', error);
      res.status(500).json({ error: "Erro ao aplicar template" });
    }
  });

  // ============================================================
  // ATIVAR/DESATIVAR CHATBOT
  // ============================================================

  app.post("/api/chatbot/toggle", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { is_active } = req.body;

      const result = await withRetry(async () => {
        return db.execute(sql`
          UPDATE chatbot_configs SET
            is_active = ${is_active ?? true},
            updated_at = now()
          WHERE user_id = ${userId}
          RETURNING *
        `);
      });

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Chatbot não configurado" });
      }

      // 🔄 TOGGLE EXCLUSIVO: Ativar chatbot = desativar Meu Agente IA (e vice-versa)
      // Precisa atualizar AMBAS as tabelas: ai_agent_config E business_agent_configs
      if (is_active) {
        console.log(`🔄 [CHATBOT_FLOW] Desativando Meu Agente IA para usuário ${userId} (ativou Fluxo)`);
        
        // Desativar ai_agent_config (tabela antiga, ainda usada em algumas partes)
        await withRetry(async () => {
          return db.execute(sql`
            UPDATE ai_agent_config SET
              is_active = false,
              updated_at = now()
            WHERE user_id = ${userId}
          `);
        });
        
        // Desativar business_agent_configs (tabela principal usada pelo backend)
        await withRetry(async () => {
          return db.execute(sql`
            UPDATE business_agent_configs SET
              is_active = false,
              updated_at = now()
            WHERE user_id = ${userId}
          `);
        });
        
        console.log(`✅ [CHATBOT_FLOW] Meu Agente IA desativado em AMBAS as tabelas`);
      }

      // 🔄 Limpar cache do fluxo para que a alteração tenha efeito imediato
      const { clearFlowCache } = await import("./chatbotFlowEngine");
      clearFlowCache(userId);
      console.log(`🔄 [CHATBOT_FLOW] Cache limpo para usuário ${userId} após toggle (is_active=${is_active})`);

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao toggle chatbot:', error);
      res.status(500).json({ error: "Erro ao alterar status do chatbot" });
    }
  });

  // ============================================================
  // ESTATÍSTICAS E DADOS DE CONVERSAS
  // ============================================================

  // Buscar dados de uma conversa específica do chatbot
  app.get("/api/chatbot/conversation/:conversationId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { conversationId } = req.params;

      const result = await withRetry(async () => {
        return db.execute(sql`
          SELECT cd.* FROM chatbot_conversation_data cd
          JOIN chatbot_configs c ON cd.chatbot_id = c.id
          WHERE c.user_id = ${userId} AND cd.conversation_id = ${conversationId}
        `);
      });

      if (result.rows.length === 0) {
        return res.json(null);
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao buscar dados da conversa:', error);
      res.status(500).json({ error: "Erro ao buscar dados da conversa" });
    }
  });

  // Listar todas as conversas do chatbot
  app.get("/api/chatbot/conversations", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { status, limit = 50, offset = 0 } = req.query;

      let statusFilter = sql``;
      if (status) {
        statusFilter = sql` AND cd.status = ${status}`;
      }

      const result = await withRetry(async () => {
        return db.execute(sql`
          SELECT cd.* FROM chatbot_conversation_data cd
          JOIN chatbot_configs c ON cd.chatbot_id = c.id
          WHERE c.user_id = ${userId}${statusFilter}
          ORDER BY cd.last_interaction_at DESC
          LIMIT ${parseInt(limit as string)}
          OFFSET ${parseInt(offset as string)}
        `);
      });

      res.json(result.rows);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao listar conversas:', error);
      res.status(500).json({ error: "Erro ao listar conversas do chatbot" });
    }
  });

  // Estatísticas do chatbot
  app.get("/api/chatbot/stats", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const result = await withRetry(async () => {
        return db.execute(sql`
          SELECT 
            c.*,
            (SELECT COUNT(*) FROM chatbot_flow_nodes n WHERE n.chatbot_id = c.id) as nodes_count,
            (SELECT COUNT(*) FROM chatbot_flow_connections conn WHERE conn.chatbot_id = c.id) as connections_count,
            (SELECT COUNT(*) FROM chatbot_conversation_data cd WHERE cd.chatbot_id = c.id AND cd.status = 'active') as active_conversations,
            (SELECT COUNT(*) FROM chatbot_conversation_data cd WHERE cd.chatbot_id = c.id AND cd.status = 'completed') as completed_conversations
          FROM chatbot_configs c
          WHERE c.user_id = ${userId}
        `);
      });

      if (result.rows.length === 0) {
        return res.json({
          config: null,
          nodes_count: 0,
          connections_count: 0,
          active_conversations: 0,
          completed_conversations: 0
        });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao buscar estatísticas:', error);
      res.status(500).json({ error: "Erro ao buscar estatísticas" });
    }
  });

  // ============================================================
  // UPLOAD DE MÍDIA PARA FLUXO DO CHATBOT
  // ============================================================

  // Upload de mídia (imagem, áudio, vídeo, documento/PDF)
  app.post("/api/chatbot/media/upload", isAuthenticated, uploadMedia.single('file'), async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }

      // Determinar tipo de mídia
      let mediaType: 'image' | 'audio' | 'video' | 'document' = 'document';
      if (file.mimetype.startsWith('image/')) mediaType = 'image';
      else if (file.mimetype.startsWith('audio/')) mediaType = 'audio';
      else if (file.mimetype.startsWith('video/')) mediaType = 'video';

      // Gerar nome único para o arquivo
      const timestamp = Date.now();
      const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `chatbot-flow/${userId}/${timestamp}_${safeFileName}`;

      console.log(`📤 [CHATBOT_FLOW] Upload de ${mediaType}: ${file.originalname} (${(file.size / 1024).toFixed(1)}KB)`);

      // Upload para Supabase Storage (bucket agent-media que já existe)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('agent-media')
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error('[CHATBOT_FLOW] Erro no upload:', uploadError);

        // Se o bucket não existir, tentar criar
        if (uploadError.message?.includes('Bucket not found') && !chatbotMediaBucketChecked) {
          const { error: createError } = await supabase.storage.createBucket('agent-media', {
            public: true,
            fileSizeLimit: 52428800 // 50MB
          });
          
          chatbotMediaBucketChecked = true;
          
          if (createError && !createError.message?.includes('already exists')) {
            return res.status(500).json({ error: "Falha ao criar bucket de armazenamento", details: createError.message });
          }

          // Tentar upload novamente
          const { error: retryError } = await supabase.storage
            .from('agent-media')
            .upload(storagePath, file.buffer, {
              contentType: file.mimetype,
              upsert: false
            });

          if (retryError) {
            return res.status(500).json({ error: "Falha no upload do arquivo", details: retryError.message });
          }
        } else {
          return res.status(500).json({ error: "Falha no upload do arquivo", details: uploadError.message });
        }
      }

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from('agent-media')
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      console.log(`✅ [CHATBOT_FLOW] Upload concluído: ${publicUrl}`);

      res.json({
        success: true,
        url: publicUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        mediaType: mediaType
      });

    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao fazer upload:', error);
      res.status(500).json({ error: "Erro ao fazer upload de mídia" });
    }
  });

  // ============================================================
  // GERAÇÃO DE FLUXO COM IA CONVERSACIONAL
  // ============================================================

  // ====== TEMPLATES DE FLUXO POR TIPO DE NEGÓCIO ======

  function extractNameFromMessage(message: string): string {
    // Tentar extrair nome entre aspas
    const quotedMatch = message.match(/["']([^"']+)["']/);
    if (quotedMatch) return quotedMatch[1];

    // Tentar extrair nome após "chamada" ou "chamado"
    const namedMatch = message.match(/chamad[ao]\s+([A-Za-zÀ-ú\s]+?)(?:\s+com|\s+que|\s+para|$)/i);
    if (namedMatch) return namedMatch[1].trim();

    return '';
  }

  function createPizzariaFlow(message: string): any {
    const businessName = extractNameFromMessage(message) || 'Pizzaria Delícia';
    return {
      message: `Pronto! Criei um fluxo completo para a ${businessName} com cardápio, pedidos e promoções. Você pode personalizar os textos e preços!`,
      flow: {
        nodes: [
          {
            node_id: "node_start_1",
            name: "Início",
            node_type: "start",
            content: {},
            next_node_id: "node_welcome",
            position_x: 100,
            position_y: 50,
            display_order: 0
          },
          {
            node_id: "node_welcome",
            name: "Boas-vindas",
            node_type: "message",
            content: { text: `🍕 Olá! Bem-vindo à ${businessName}!\n\nTemos as melhores pizzas da região!`, format_whatsapp: true },
            next_node_id: "node_menu",
            position_x: 100,
            position_y: 150,
            display_order: 1
          },
          {
            node_id: "node_menu",
            name: "Menu Principal",
            node_type: "buttons",
            content: {
              body: "O que você gostaria de fazer?",
              buttons: [
                { id: "btn_cardapio", title: "📋 Ver Cardápio", next_node: "node_cardapio" },
                { id: "btn_pedido", title: "🛒 Fazer Pedido", next_node: "node_pedido" },
                { id: "btn_promo", title: "🎉 Promoções", next_node: "node_promocoes" }
              ]
            },
            position_x: 100,
            position_y: 250,
            display_order: 2
          },
          {
            node_id: "node_cardapio",
            name: "Cardápio",
            node_type: "list",
            content: {
              body: "🍕 Nosso Cardápio de Pizzas:",
              button_text: "Ver Sabores",
              sections: [
                {
                  title: "Pizzas Tradicionais",
                  rows: [
                    { id: "pizza_marg", title: "Margherita", description: "R$ 45,00 - Molho, mussarela, tomate, manjericão", next_node: "node_add_cart" },
                    { id: "pizza_cala", title: "Calabresa", description: "R$ 48,00 - Molho, mussarela, calabresa, cebola", next_node: "node_add_cart" },
                    { id: "pizza_4q", title: "Quatro Queijos", description: "R$ 52,00 - Mussarela, provolone, gorgonzola, parmesão", next_node: "node_add_cart" }
                  ]
                },
                {
                  title: "Pizzas Especiais",
                  rows: [
                    { id: "pizza_port", title: "Portuguesa", description: "R$ 55,00 - Presunto, ovo, cebola, azeitona, ervilha", next_node: "node_add_cart" },
                    { id: "pizza_frang", title: "Frango Catupiry", description: "R$ 55,00 - Frango desfiado com catupiry", next_node: "node_add_cart" }
                  ]
                }
              ]
            },
            position_x: 0,
            position_y: 350,
            display_order: 3
          },
          {
            node_id: "node_pedido",
            name: "Iniciar Pedido",
            node_type: "input",
            content: {
              prompt: "Para iniciar seu pedido, me diz seu nome:",
              variable_name: "nome_cliente",
              input_type: "text",
              required: true
            },
            next_node_id: "node_endereco",
            position_x: 100,
            position_y: 350,
            display_order: 4
          },
          {
            node_id: "node_endereco",
            name: "Endereço",
            node_type: "input",
            content: {
              prompt: "Ótimo, {{nome_cliente}}! Qual o endereço de entrega?",
              variable_name: "endereco",
              input_type: "text",
              required: true
            },
            next_node_id: "node_cardapio",
            position_x: 100,
            position_y: 450,
            display_order: 5
          },
          {
            node_id: "node_promocoes",
            name: "Promoções",
            node_type: "message",
            content: {
              text: "🎉 *PROMOÇÕES DA SEMANA*\n\n🔥 *Terça-feira*: Pizza Grande + Refri 2L = R$ 59,90\n\n🔥 *Quinta-feira*: 2 Pizzas Médias por R$ 79,90\n\n🔥 *Domingo*: Pizza Família + Bordas Recheadas = R$ 69,90\n\n_Promoções válidas somente para delivery!_",
              format_whatsapp: true
            },
            next_node_id: "node_menu",
            position_x: 200,
            position_y: 350,
            display_order: 6
          },
          {
            node_id: "node_add_cart",
            name: "Adicionar ao Pedido",
            node_type: "buttons",
            content: {
              body: "Ótima escolha! Deseja adicionar mais alguma coisa?",
              buttons: [
                { id: "btn_mais", title: "Sim, ver mais", next_node: "node_cardapio" },
                { id: "btn_finalizar", title: "Finalizar Pedido", next_node: "node_pagamento" },
                { id: "btn_atendente", title: "Falar com Atendente", next_node: "node_transfer" }
              ]
            },
            position_x: 0,
            position_y: 450,
            display_order: 7
          },
          {
            node_id: "node_pagamento",
            name: "Forma de Pagamento",
            node_type: "buttons",
            content: {
              body: "Como prefere pagar?",
              buttons: [
                { id: "btn_pix", title: "PIX", next_node: "node_confirma" },
                { id: "btn_cartao", title: "Cartão na Entrega", next_node: "node_confirma" },
                { id: "btn_dinheiro", title: "Dinheiro", next_node: "node_troco" }
              ]
            },
            position_x: 100,
            position_y: 550,
            display_order: 8
          },
          {
            node_id: "node_troco",
            name: "Troco",
            node_type: "input",
            content: {
              prompt: "Precisa de troco para quanto?",
              variable_name: "troco",
              input_type: "text",
              required: false
            },
            next_node_id: "node_confirma",
            position_x: 200,
            position_y: 650,
            display_order: 9
          },
          {
            node_id: "node_confirma",
            name: "Confirmação",
            node_type: "message",
            content: {
              text: "✅ *Pedido Recebido!*\n\nSeu pedido está sendo preparado com muito carinho!\n\n⏱️ Tempo estimado: 40-50 minutos\n\n_Acompanhe o status pelo nosso WhatsApp!_",
              format_whatsapp: true
            },
            next_node_id: "node_end",
            position_x: 100,
            position_y: 750,
            display_order: 10
          },
          {
            node_id: "node_transfer",
            name: "Transferir para Atendente",
            node_type: "transfer_human",
            content: {
              message: "Aguarde um momento, vou te transferir para um atendente...",
              notify_admin: true
            },
            position_x: 0,
            position_y: 550,
            display_order: 11
          },
          {
            node_id: "node_end",
            name: "Fim",
            node_type: "end",
            content: {},
            position_x: 100,
            position_y: 850,
            display_order: 12
          }
        ]
      },
      config: {
        name: businessName,
        welcome_message: `🍕 Olá! Bem-vindo à ${businessName}!`,
        fallback_message: "Desculpe, não entendi. Por favor, escolha uma das opções do menu.",
        goodbye_message: "Obrigado por escolher a " + businessName + "! Volte sempre! 🍕"
      }
    };
  }

  function createDeliveryFlow(message: string): any {
    const businessName = extractNameFromMessage(message) || 'Delivery Express';
    return {
      message: `Criei um fluxo para o ${businessName} com cardápio, pedidos e acompanhamento de entrega!`,
      flow: {
        nodes: [
          { node_id: "node_start_1", name: "Início", node_type: "start", content: {}, next_node_id: "node_menu", position_x: 100, position_y: 50, display_order: 0 },
          { node_id: "node_menu", name: "Menu", node_type: "buttons", content: { body: `Olá! Bem-vindo ao ${businessName}! Como posso ajudar?`, buttons: [{ id: "btn_1", title: "📋 Cardápio", next_node: "node_cardapio" }, { id: "btn_2", title: "🛒 Fazer Pedido", next_node: "node_pedido" }, { id: "btn_3", title: "📞 Atendente", next_node: "node_transfer" }] }, position_x: 100, position_y: 150, display_order: 1 },
          { node_id: "node_cardapio", name: "Cardápio", node_type: "message", content: { text: "📋 *CARDÁPIO*\n\n🍔 Hambúrgueres\n🍟 Porções\n🥤 Bebidas\n\nEscolha uma categoria para ver os itens!", format_whatsapp: true }, next_node_id: "node_menu", position_x: 0, position_y: 250, display_order: 2 },
          { node_id: "node_pedido", name: "Pedido", node_type: "input", content: { prompt: "Qual seu nome?", variable_name: "nome", input_type: "text", required: true }, next_node_id: "node_endereco", position_x: 100, position_y: 250, display_order: 3 },
          { node_id: "node_endereco", name: "Endereço", node_type: "input", content: { prompt: "Qual o endereço de entrega?", variable_name: "endereco", input_type: "text", required: true }, next_node_id: "node_confirma", position_x: 100, position_y: 350, display_order: 4 },
          { node_id: "node_confirma", name: "Confirmação", node_type: "message", content: { text: "✅ Pedido recebido! Em breve um atendente irá confirmar.", format_whatsapp: true }, next_node_id: "node_end", position_x: 100, position_y: 450, display_order: 5 },
          { node_id: "node_transfer", name: "Atendente", node_type: "transfer_human", content: { message: "Aguarde, transferindo...", notify_admin: true }, position_x: 200, position_y: 250, display_order: 6 },
          { node_id: "node_end", name: "Fim", node_type: "end", content: {}, position_x: 100, position_y: 550, display_order: 7 }
        ]
      },
      config: { name: businessName, welcome_message: `Bem-vindo ao ${businessName}!`, fallback_message: "Não entendi, escolha uma opção.", goodbye_message: "Obrigado!" }
    };
  }

  function createClinicaFlow(message: string): any {
    const businessName = extractNameFromMessage(message) || 'Clínica Saúde';
    return {
      message: `Criei um fluxo para a ${businessName} com agendamento, informações e contato!`,
      flow: {
        nodes: [
          { node_id: "node_start_1", name: "Início", node_type: "start", content: {}, next_node_id: "node_menu", position_x: 100, position_y: 50, display_order: 0 },
          { node_id: "node_menu", name: "Menu", node_type: "buttons", content: { body: `🏥 ${businessName}\n\nComo posso ajudar?`, buttons: [{ id: "btn_1", title: "📅 Agendar Consulta", next_node: "node_agendar" }, { id: "btn_2", title: "ℹ️ Informações", next_node: "node_info" }, { id: "btn_3", title: "📞 Falar com Atendente", next_node: "node_transfer" }] }, position_x: 100, position_y: 150, display_order: 1 },
          { node_id: "node_agendar", name: "Agendar", node_type: "input", content: { prompt: "Qual seu nome completo?", variable_name: "nome", input_type: "text", required: true }, next_node_id: "node_especialidade", position_x: 0, position_y: 250, display_order: 2 },
          { node_id: "node_especialidade", name: "Especialidade", node_type: "buttons", content: { body: "Qual especialidade você precisa?", buttons: [{ id: "btn_clinico", title: "Clínico Geral", next_node: "node_data" }, { id: "btn_cardio", title: "Cardiologia", next_node: "node_data" }, { id: "btn_outro", title: "Outra", next_node: "node_transfer" }] }, position_x: 0, position_y: 350, display_order: 3 },
          { node_id: "node_data", name: "Data", node_type: "input", content: { prompt: "Qual data você prefere? (ex: 15/01)", variable_name: "data", input_type: "text", required: true }, next_node_id: "node_confirma", position_x: 0, position_y: 450, display_order: 4 },
          { node_id: "node_info", name: "Informações", node_type: "message", content: { text: "🏥 *Informações*\n\n📍 Endereço: Rua Exemplo, 123\n⏰ Horário: Seg-Sex 8h às 18h\n📞 Telefone: (00) 0000-0000", format_whatsapp: true }, next_node_id: "node_menu", position_x: 100, position_y: 250, display_order: 5 },
          { node_id: "node_confirma", name: "Confirmação", node_type: "message", content: { text: "✅ Solicitação de agendamento recebida!\n\nEntraremos em contato para confirmar.", format_whatsapp: true }, next_node_id: "node_end", position_x: 0, position_y: 550, display_order: 6 },
          { node_id: "node_transfer", name: "Atendente", node_type: "transfer_human", content: { message: "Aguarde, transferindo para atendimento...", notify_admin: true }, position_x: 200, position_y: 250, display_order: 7 },
          { node_id: "node_end", name: "Fim", node_type: "end", content: {}, position_x: 100, position_y: 650, display_order: 8 }
        ]
      },
      config: { name: businessName, welcome_message: `Bem-vindo à ${businessName}!`, fallback_message: "Não entendi, escolha uma opção do menu.", goodbye_message: "Obrigado por entrar em contato!" }
    };
  }

  function createImobiliariaFlow(message: string): any {
    const businessName = extractNameFromMessage(message) || 'Imobiliária Central';
    return {
      message: `Criei um fluxo para a ${businessName} com opções de compra, aluguel e atendimento!`,
      flow: {
        nodes: [
          { node_id: "node_start_1", name: "Início", node_type: "start", content: {}, next_node_id: "node_menu", position_x: 100, position_y: 50, display_order: 0 },
          { node_id: "node_menu", name: "Menu", node_type: "buttons", content: { body: `🏠 ${businessName}\n\nComo posso ajudar?`, buttons: [{ id: "btn_1", title: "🏠 Comprar Imóvel", next_node: "node_comprar" }, { id: "btn_2", title: "🔑 Alugar Imóvel", next_node: "node_alugar" }, { id: "btn_3", title: "📞 Falar com Corretor", next_node: "node_transfer" }] }, position_x: 100, position_y: 150, display_order: 1 },
          { node_id: "node_comprar", name: "Comprar", node_type: "buttons", content: { body: "Que tipo de imóvel você procura para comprar?", buttons: [{ id: "btn_casa", title: "Casa", next_node: "node_valores" }, { id: "btn_apto", title: "Apartamento", next_node: "node_valores" }, { id: "btn_terreno", title: "Terreno", next_node: "node_valores" }] }, position_x: 0, position_y: 250, display_order: 2 },
          { node_id: "node_alugar", name: "Alugar", node_type: "buttons", content: { body: "Que tipo de imóvel você procura para alugar?", buttons: [{ id: "btn_casa_a", title: "Casa", next_node: "node_valores_aluguel" }, { id: "btn_apto_a", title: "Apartamento", next_node: "node_valores_aluguel" }, { id: "btn_comercial", title: "Comercial", next_node: "node_valores_aluguel" }] }, position_x: 200, position_y: 250, display_order: 3 },
          { node_id: "node_valores", name: "Faixa de Preço", node_type: "input", content: { prompt: "Qual a faixa de valor que você procura? (ex: até 500 mil)", variable_name: "faixa_preco", input_type: "text", required: true }, next_node_id: "node_contato", position_x: 0, position_y: 350, display_order: 4 },
          { node_id: "node_valores_aluguel", name: "Valor Aluguel", node_type: "input", content: { prompt: "Qual valor de aluguel você procura? (ex: até 2 mil)", variable_name: "valor_aluguel", input_type: "text", required: true }, next_node_id: "node_contato", position_x: 200, position_y: 350, display_order: 5 },
          { node_id: "node_contato", name: "Contato", node_type: "input", content: { prompt: "Qual seu nome e telefone para contato?", variable_name: "contato", input_type: "text", required: true }, next_node_id: "node_confirma", position_x: 100, position_y: 450, display_order: 6 },
          { node_id: "node_confirma", name: "Confirmação", node_type: "message", content: { text: "✅ Perfeito! Um corretor entrará em contato em breve com opções de imóveis!", format_whatsapp: true }, next_node_id: "node_end", position_x: 100, position_y: 550, display_order: 7 },
          { node_id: "node_transfer", name: "Corretor", node_type: "transfer_human", content: { message: "Aguarde, transferindo para um corretor...", notify_admin: true }, position_x: 300, position_y: 250, display_order: 8 },
          { node_id: "node_end", name: "Fim", node_type: "end", content: {}, position_x: 100, position_y: 650, display_order: 9 }
        ]
      },
      config: { name: businessName, welcome_message: `Bem-vindo à ${businessName}!`, fallback_message: "Não entendi, escolha uma opção.", goodbye_message: "Obrigado pelo interesse!" }
    };
  }

  function createLojaFlow(message: string): any {
    const businessName = extractNameFromMessage(message) || 'Loja Virtual';
    return {
      message: `Criei um fluxo para a ${businessName} com produtos, pedidos e suporte!`,
      flow: {
        nodes: [
          { node_id: "node_start_1", name: "Início", node_type: "start", content: {}, next_node_id: "node_menu", position_x: 100, position_y: 50, display_order: 0 },
          { node_id: "node_menu", name: "Menu", node_type: "buttons", content: { body: `🛍️ ${businessName}\n\nComo posso ajudar?`, buttons: [{ id: "btn_1", title: "🛒 Ver Produtos", next_node: "node_produtos" }, { id: "btn_2", title: "📦 Rastrear Pedido", next_node: "node_rastrear" }, { id: "btn_3", title: "💬 Atendimento", next_node: "node_transfer" }] }, position_x: 100, position_y: 150, display_order: 1 },
          { node_id: "node_produtos", name: "Produtos", node_type: "message", content: { text: "🛍️ *Nossos Produtos*\n\nAcesse nosso catálogo completo:\n🔗 www.loja.com.br\n\nOu fale com um atendente para recomendações!", format_whatsapp: true }, next_node_id: "node_menu", position_x: 0, position_y: 250, display_order: 2 },
          { node_id: "node_rastrear", name: "Rastrear", node_type: "input", content: { prompt: "Informe o número do seu pedido:", variable_name: "numero_pedido", input_type: "text", required: true }, next_node_id: "node_status", position_x: 100, position_y: 250, display_order: 3 },
          { node_id: "node_status", name: "Status", node_type: "message", content: { text: "📦 Estamos verificando seu pedido...\n\nUm atendente irá informar o status em instantes!", format_whatsapp: true }, next_node_id: "node_transfer", position_x: 100, position_y: 350, display_order: 4 },
          { node_id: "node_transfer", name: "Atendente", node_type: "transfer_human", content: { message: "Aguarde, conectando com atendente...", notify_admin: true }, position_x: 200, position_y: 250, display_order: 5 },
          { node_id: "node_end", name: "Fim", node_type: "end", content: {}, position_x: 100, position_y: 450, display_order: 6 }
        ]
      },
      config: { name: businessName, welcome_message: `Bem-vindo à ${businessName}!`, fallback_message: "Não entendi, escolha uma opção.", goodbye_message: "Obrigado pela preferência!" }
    };
  }

  function createGenericFlow(message: string): any {
    const businessName = extractNameFromMessage(message) || 'Meu Negócio';
    return {
      message: `Criei um fluxo básico para ${businessName}. Me conte mais detalhes sobre seu negócio para personalizar melhor!`,
      flow: {
        nodes: [
          { node_id: "node_start_1", name: "Início", node_type: "start", content: {}, next_node_id: "node_menu", position_x: 100, position_y: 50, display_order: 0 },
          { node_id: "node_menu", name: "Menu", node_type: "buttons", content: { body: `Olá! Bem-vindo ao ${businessName}!\n\nComo posso ajudar?`, buttons: [{ id: "btn_1", title: "ℹ️ Informações", next_node: "node_info" }, { id: "btn_2", title: "📞 Contato", next_node: "node_contato" }, { id: "btn_3", title: "💬 Atendente", next_node: "node_transfer" }] }, position_x: 100, position_y: 150, display_order: 1 },
          { node_id: "node_info", name: "Informações", node_type: "message", content: { text: "ℹ️ *Sobre Nós*\n\nSomos uma empresa dedicada a oferecer o melhor atendimento!\n\nPara mais detalhes, fale com um atendente.", format_whatsapp: true }, next_node_id: "node_menu", position_x: 0, position_y: 250, display_order: 2 },
          { node_id: "node_contato", name: "Contato", node_type: "message", content: { text: "📞 *Nossos Contatos*\n\n📧 Email: contato@empresa.com\n📱 WhatsApp: (00) 0000-0000\n🌐 Site: www.empresa.com", format_whatsapp: true }, next_node_id: "node_menu", position_x: 100, position_y: 250, display_order: 3 },
          { node_id: "node_transfer", name: "Atendente", node_type: "transfer_human", content: { message: "Aguarde, conectando com um atendente...", notify_admin: true }, position_x: 200, position_y: 250, display_order: 4 },
          { node_id: "node_end", name: "Fim", node_type: "end", content: {}, position_x: 100, position_y: 350, display_order: 5 }
        ]
      },
      config: { name: businessName, welcome_message: `Bem-vindo ao ${businessName}!`, fallback_message: "Não entendi. Escolha uma opção do menu.", goodbye_message: "Obrigado pelo contato!" }
    };
  }

  /**
   * POST /api/chatbot/generate-flow
   * Gera ou modifica o fluxo do chatbot usando IA conversacional
   * A IA deve SEMPRE entender e criar o fluxo dinamicamente baseado no pedido do cliente
   */
  app.post("/api/chatbot/generate-flow", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { message, currentFlow, currentConfig, chatHistory, hasExistingFlow, isDefinitelyEdit } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Mensagem é obrigatória" });
      }

      console.log(`🤖 [FLOW_GENERATOR] Gerando fluxo para usuário ${userId}`);
      console.log(`📝 Mensagem: ${message.substring(0, 200)}...`);
      console.log(`📊 Tem fluxo existente: ${hasExistingFlow}`);
      console.log(`✏️ É definitivamente edição: ${isDefinitelyEdit}`);

      // ============================================================
      // DETECTAR se o usuário quer criar algo NOVO (não editar)
      // ============================================================
      const lowerMessage = message.toLowerCase();
      const isExplicitNewCreation = (
        /cri(e|ar)|novo|nova|fazer um|quero um|preciso de um|começar do zero|substituir|apagar tudo/i.test(lowerMessage) && 
        /(chatbot|fluxo|robô|atendimento|salão|loja|restaurante|pizzaria|clínica|imobili|cardápio|cardapio)/i.test(lowerMessage)
      );
      
      console.log(`🆕 Quer criar novo: ${isExplicitNewCreation}`);

      // ============================================================
      // Se é DEFINITIVAMENTE uma edição (E NÃO quer criar algo novo)
      // ============================================================
      if (isDefinitelyEdit && hasExistingFlow && currentFlow && currentFlow.length > 0 && !isExplicitNewCreation) {
        console.log(`⚡ [FLOW_GENERATOR] Modo de edição direta ativado`);
        
        // Pedir confirmação com pergunta clara sobre o que fazer
        const confirmationMessage = `Entendi que você quer fazer uma alteração no fluxo atual. 

Você pode me dizer mais especificamente:
- **O que exatamente** você quer adicionar/remover/modificar?
- **Onde no fluxo** (qual categoria, qual menu)?
- **Detalhes** como nome e preço (se for um item)?

Exemplo: "Adicionar Escova Simples por R$45 na categoria Tratamentos"`;

        return res.json({
          needsConfirmation: true,
          confirmationMessage: confirmationMessage,
          message: confirmationMessage
        });
      }

      // ============================================================
      // A IA DEVE SEMPRE ENTENDER E CRIAR O FLUXO DINAMICAMENTE!
      // A IA interpreta naturalmente o que o usuário quer
      // E CONFIRMA antes de fazer alterações significativas
      // ============================================================

      // Construir contexto para a IA - System Prompt INTELIGENTE
      const systemPrompt = `Você é um ESPECIALISTA em criar e gerenciar fluxos de chatbot para WhatsApp.

VOCÊ É INTELIGENTE E ENTENDE NATURALMENTE O QUE O CLIENTE QUER.

SUA CAPACIDADE DE INTERPRETAÇÃO:
Você entende diferentes formas de falar. Por exemplo:
- "bota mais uma pizza" = adicionar item ao cardápio
- "tira aquele negócio do preço" = remover item ou alterar preço
- "coloca delivery também" = adicionar funcionalidade de delivery
- "muda o nome pra outro" = alterar nome do chatbot
- "quero começar de novo" = criar novo fluxo do zero
- "faz um robô pra minha loja" = criar chatbot para loja

REGRA DE OURO - SEMPRE PERGUNTE QUANDO HOUVER DÚVIDA:
Se a solicitação for AMBÍGUA ou puder ter MÚLTIPLAS INTERPRETAÇÕES:
1. NÃO execute a ação imediatamente
2. Retorne um JSON com "needsConfirmation": true
3. Faça uma pergunta clara para confirmar o que o usuário quer

EXEMPLOS DE QUANDO PERGUNTAR:
- "muda o preço" → Perguntar: "Qual item você quer alterar o preço? E qual o novo valor?"
- "adiciona mais coisa" → Perguntar: "O que você gostaria de adicionar? Um novo item, categoria, ou funcionalidade?"
- "tira isso" → Perguntar: "O que exatamente você quer remover do fluxo?"
- "melhora isso" → Perguntar: "O que especificamente você gostaria de melhorar?"

QUANDO JÁ EXISTE UM FLUXO (hasExistingFlow = true):
1. ANALISE se o usuário quer EDITAR o fluxo atual ou CRIAR um novo
2. Se parecer edição (adicionar/remover/alterar algo específico):
   - Modifique APENAS o que foi pedido
   - Mantenha todo o resto intacto
3. Se parecer criação de novo fluxo (novo negócio, começar do zero):
   - Crie um fluxo completamente novo
4. Se não tiver certeza:
   - Pergunte: "Você quer modificar o fluxo atual ou criar um novo do zero?"

FORMATO DE RESPOSTA PARA CONFIRMAÇÃO (quando precisar perguntar):
{
  "needsConfirmation": true,
  "confirmationMessage": "Sua pergunta clara aqui",
  "message": "Sua pergunta clara aqui"
}

FORMATO DE RESPOSTA PARA AÇÃO (quando executar):
{
  "needsConfirmation": false,
  "message": "Descrição do que foi feito",
  "flow": { "nodes": [...] },
  "config": { "name": "...", ... }
}

🚨🚨🚨 REGRA CRÍTICA OBRIGATÓRIA - CONFIG É OBRIGATÓRIO 🚨🚨🚨
Ao criar um NOVO fluxo (não edição), você DEVE SEMPRE incluir o objeto "config" completo com TODOS os campos:
- "name": Nome do negócio/chatbot (extraído da mensagem do usuário)
- "welcome_message": Mensagem de boas-vindas personalizada para o tipo de negócio
- "fallback_message": Mensagem quando o bot não entende (ex: "Desculpe, não entendi. Por favor, escolha uma opção do menu.")
- "goodbye_message": Mensagem de despedida (ex: "Obrigado por utilizar nosso atendimento! Até logo! 👋")

EXEMPLO DE CONFIG OBRIGATÓRIO:
"config": {
  "name": "Pizzaria Bella Napoli",
  "welcome_message": "🍕 Olá! Bem-vindo à Pizzaria Bella Napoli! Como posso ajudar?",
  "fallback_message": "Desculpe, não entendi. Por favor, escolha uma opção do menu.",
  "goodbye_message": "Obrigado por escolher a Pizzaria Bella Napoli! Até a próxima! 🍕"
}

⚠️ SE VOCÊ NÃO INCLUIR O CONFIG, A CONFIGURAÇÃO DO CHATBOT NÃO SERÁ ATUALIZADA E O USUÁRIO VERÁ DADOS ANTIGOS!
🚨🚨🚨 FIM DA REGRA CRÍTICA 🚨🚨🚨

ANALISE A SOLICITAÇÃO DO CLIENTE COM CUIDADO:
- Se ele menciona "pizzaria", crie um fluxo COMPLETO para pizzaria com cardápio, pedidos, promoções
- Se ele menciona "clínica", crie um fluxo para agendamento médico, especialidades, convênios
- Se ele menciona "imobiliária", crie fluxo para busca de imóveis, agendamento de visitas
- Se ele menciona qualquer outro tipo de negócio, ENTENDA e crie fluxo adequado

EXTRAIA INFORMAÇÕES IMPORTANTES DA MENSAGEM:
- Nome do negócio/chatbot (se mencionado)
- Tipo de negócio
- Funcionalidades desejadas (cardápio, pedidos, agendamento, promoções, etc.)
- Tom de voz desejado

CRIE FLUXOS RICOS E COMPLETOS:
- Para pizzaria/restaurante: Menu de cardápio, categorias (pizzas, bebidas), opções de pedido, promoções
- Para clínica: Especialidades, agendamento, informações de contato
- Para loja: Catálogo, categorias de produtos, carrinho, promoções
- Para qualquer negócio: Entenda e crie fluxo relevante e completo

REGRAS DO WHATSAPP:
- Botões: máximo 3 opções (use lista se precisar de mais)
- Lista: máximo 10 opções por seção
- Mantenha textos curtos e claros
- Use emojis para deixar mais amigável

REGRAS IMPORTANTES:
1. Sempre retorne um JSON válido com a estrutura especificada
2. Cada nó deve ter um node_id único (use formato: node_tipo_numero, ex: node_start_1, node_msg_2)
3. O fluxo SEMPRE deve começar com um nó do tipo "start"
4. Conecte os nós usando next_node_id ou campos específicos (true_node, false_node para condições, next_node para botões)
5. Use nomes descritivos para os nós
6. Para botões, limite a 3 opções (limite do WhatsApp)
7. Para listas, limite a 10 opções por seção
8. Sempre termine o fluxo com um nó "end" ou "transfer_human"

TIPOS DE NÓS DISPONÍVEIS:
- start: Início do fluxo (obrigatório, apenas 1)
- message: Envia mensagem de texto simples
- buttons: Mensagem com botões clicáveis (max 3)
- list: Menu com lista de opções (max 10 por seção)
- input: Coleta dados do usuário e salva em variável
- media: Envia imagem/áudio/vídeo/documento
- condition: Bifurcação baseada em variável
- delay: Pausa em segundos
- set_variable: Define/altera variável
- transfer_human: Transfere para atendente
- end: Finaliza o fluxo
- goto: Pula para outro nó

ESTRUTURA DO JSON DE RESPOSTA:
{
  "needsConfirmation": false,
  "message": "Descrição do que foi feito",
  "flow": {
    "nodes": [
      {
        "node_id": "node_start_1",
        "name": "Início",
        "node_type": "start",
        "content": {},
        "next_node_id": "node_msg_1",
        "position_x": 100,
        "position_y": 100,
        "display_order": 0
      },
      ...
    ]
  },
  "config": {
    "name": "Nome do Chatbot",
    "welcome_message": "Mensagem de boas-vindas",
    "fallback_message": "Mensagem quando não entende",
    "goodbye_message": "Mensagem de despedida"
  }
}

EXEMPLOS DE CONTEÚDO POR TIPO DE NÓ:

message (mensagem simples):
{ "text": "Olá! Bem-vindo à nossa loja!", "format_whatsapp": true }

message (usando variáveis no resumo/confirmação):
{ "text": "✅ *Resumo do Pedido*\n\n👤 Nome: {{nome}}\n📍 Endereço: {{endereco}}\n🍕 Pedido: {{pedido}}\n💰 Pagamento: {{pagamento}}\n\nConfirma?", "format_whatsapp": true }

IMPORTANTE SOBRE VARIÁVEIS:
- Use {{nome_variavel}} (duas chaves) para exibir o valor de variáveis nas mensagens
- Sempre use save_variable em botões e listas para salvar a escolha do usuário
- O save_variable salva o TITLE do botão/item que o usuário clicou

buttons (COM save_variable para salvar escolha):
{
  "body": "Escolha a forma de pagamento:",
  "buttons": [
    { "id": "btn_pix", "title": "💰 PIX", "next_node": "node_confirmar", "save_variable": "pagamento" },
    { "id": "btn_dinheiro", "title": "💵 Dinheiro", "next_node": "node_confirmar", "save_variable": "pagamento" },
    { "id": "btn_cartao", "title": "💳 Cartão", "next_node": "node_confirmar", "save_variable": "pagamento" }
  ]
}

buttons (navegação simples sem salvar):
{
  "body": "Menu Principal:",
  "buttons": [
    { "id": "btn_1", "title": "Ver Cardápio", "next_node": "node_cardapio" },
    { "id": "btn_2", "title": "Fazer Pedido", "next_node": "node_pedido" },
    { "id": "btn_3", "title": "Falar com Atendente", "next_node": "node_transfer" }
  ]
}

list (COM save_variable para salvar item selecionado):
{
  "body": "Selecione o produto:",
  "button_text": "Ver produtos",
  "sections": [
    {
      "title": "Pizzas",
      "rows": [
        { "id": "pizza_1", "title": "Margherita - R$35", "description": "Molho, muçarela e manjericão", "next_node": "node_sabor_selecionado", "save_variable": "pedido" },
        { "id": "pizza_2", "title": "Calabresa - R$38", "description": "Calabresa e cebola", "next_node": "node_sabor_selecionado", "save_variable": "pedido" }
      ]
    }
  ]
}

input (coleta dados e salva em variável):
{
  "prompt": "Qual é o seu nome?",
  "variable_name": "nome",
  "input_type": "text",
  "required": true
}

condition:
{
  "variable": "quer_mais",
  "operator": "equals",
  "value": "sim",
  "true_node": "node_mais_produtos",
  "false_node": "node_finalizar"
}

delay:
{ "seconds": 3 }

transfer_human:
{
  "message": "Aguarde, vou transferir para um atendente...",
  "notify_admin": true
}

REGRAS CRÍTICAS PARA VARIÁVEIS:
1. Use save_variable em TODOS os botões/listas onde a escolha do usuário importa
2. Use variable_name em TODOS os inputs para salvar dados digitados
3. No nó de confirmação/resumo, use {{nome_variavel}} para mostrar os valores
4. Nomes de variáveis devem ser simples: nome, endereco, pedido, pagamento, servico, horario

TEMPLATES CONDICIONAIS SUPORTADOS (use quando necessário):
- {{#if variavel}}conteúdo{{/if}} - Mostra conteúdo se variável existe e não é vazia
- {{#if variavel}}se sim{{else}}se não{{/if}} - Com alternativa
- {{#ifEqual variavel "valor"}}conteúdo{{/ifEqual}} - Mostra se variável == valor
- {{#ifNotEqual variavel "valor"}}conteúdo{{/ifNotEqual}} - Mostra se variável != valor
- {{#ifContains variavel "texto"}}conteúdo{{/ifContains}} - Mostra se variável contém texto
- {{#unless variavel}}conteúdo{{/unless}} - Mostra se variável NÃO existe ou é vazia

EXEMPLO DE RESUMO COM CONDICIONAL (para delivery):
{
  "text": "✅ *Resumo do Pedido*\\n\\n👤 Nome: {{nome}}\\n{{#ifEqual tipo_entrega \"🏠 Entrega (R$5)\"}}📍 Endereço: {{endereco}}\\n🚚 Taxa: R$5{{/ifEqual}}{{#ifEqual tipo_entrega \"🏬 Retirada\"}}🏬 Retirar na loja{{/ifEqual}}\\n🍕 Pedido: {{pedido}}\\n💰 Pagamento: {{pagamento}}\\n\\nTudo certo?"
}

EXEMPLO SIMPLES DE RESUMO (sem condicional):
{
  "text": "✅ *Resumo do Pedido*\\n\\n👤 Nome: {{nome}}\\n📍 Endereço: {{endereco}}\\n🍕 Pedido: {{pedido}}\\n💰 Pagamento: {{pagamento}}\\n🚚 Entrega: {{tipo_entrega}}\\n\\nTudo certo?"
}

FLUXO PARA DELIVERY/PIZZARIA/RESTAURANTE:
Deve incluir nós para:
- Menu principal com opções (cardápio, pedido, promoções)
- Lista de produtos COM save_variable para salvar escolha
- Coleta de nome (input com variable_name: "nome")
- Coleta de endereço (input com variable_name: "endereco")
- Forma de pagamento (botões COM save_variable: "pagamento")
- Nó de confirmação MOSTRANDO todas as variáveis: {{nome}}, {{endereco}}, {{pedido}}, {{pagamento}}

FLUXO PARA CLÍNICA/CONSULTÓRIO:
Deve incluir nós para:
- Menu com especialidades
- Lista de serviços COM save_variable: "servico"
- Coleta de nome (input com variable_name: "nome")
- Preferência de horário (botões COM save_variable: "horario")
- Nó de confirmação: "Agendamento para {{nome}}\nServiço: {{servico}}\nHorário: {{horario}}"

FLUXO PARA SALÃO/BARBEARIA:
Deve incluir nós para:
- Menu com tipos de serviço (corte, barba, tratamentos)
- Lista de serviços COM save_variable: "servico"
- Lista de profissionais COM save_variable: "profissional"
- Preferência de horário COM save_variable: "horario"
- Coleta de nome (input com variable_name: "nome")
- Nó de confirmação: "{{nome}}, seu agendamento:\n✂️ {{servico}}\n👤 {{profissional}}\n🕐 {{horario}}"

EXEMPLO COMPLETO - PIZZARIA:
Se o usuário pedir: "Crie um chatbot para uma pizzaria chamada 'Pizza Express' com opções de cardápio, pedidos e promoções"

O fluxo deve ter MUITOS nós completos como:
- Nó start (início)
- Nó de boas-vindas com botões: 📋 Ver Cardápio | 🛒 Fazer Pedido | 🎁 Promoções
- Nó de cardápio com lista de pizzas (Margherita, Calabresa, 4 Queijos, Portuguesa, etc)
- Nó para cada pizza mostrando descrição e preço
- Nó de promoções mostrando ofertas do dia
- Nó para coletar dados do pedido (nome, endereço, forma de pagamento)
- Nó de confirmação
- Nó de transferência para atendente
- Nó de finalização

CRIE FLUXOS COMPLETOS COM NO MÍNIMO 8-15 NÓS para ser útil ao negócio!

DICA IMPORTANTE: 
- Use o NOME DO NEGÓCIO mencionado pelo cliente nas mensagens
- Personalize as opções para o TIPO DE NEGÓCIO específico
- Crie fluxos ricos e funcionais, não genéricos`;

      // Histórico da conversa
      const historyContext = chatHistory && chatHistory.length > 0
        ? chatHistory.map((m: any) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`).join('\n')
        : '';

      // Fluxo atual (se existir) - Criar RESUMO dos nós ao invés de enviar JSON completo
      let currentFlowContext: string;
      if (currentFlow && currentFlow.length > 0) {
        // Criar resumo legível dos nós para a IA
        const flowSummary = currentFlow.map((node: any) => {
          const nodeData = node.data || {};
          let summary = `- ${node.id} (${nodeData.type || 'message'}): ${nodeData.content?.substring(0, 50) || nodeData.title || 'sem título'}`;
          if (nodeData.options && nodeData.options.length > 0) {
            summary += ` [opções: ${nodeData.options.map((o: any) => o.label).join(', ')}]`;
          }
          return summary;
        }).join('\n');
        
        currentFlowContext = `\n\nFLUXO ATUAL DO CHATBOT (${currentFlow.length} nós):
O usuário JÁ TEM um fluxo criado. Analise se ele quer EDITAR ou CRIAR NOVO.

RESUMO DOS NÓS EXISTENTES:
${flowSummary}

Se o usuário quer EDITAR (adicionar, remover, modificar), você deve retornar o fluxo COMPLETO atualizado.`;
      } else {
        currentFlowContext = '\n\nO usuário ainda NÃO TEM um fluxo criado. Crie um novo fluxo COMPLETO e PERSONALIZADO.';
      }

      // Configuração atual
      const currentConfigContext = currentConfig
        ? `\n\nCONFIGURAÇÃO ATUAL:\nNome: ${currentConfig.name}\nBoas-vindas: ${currentConfig.welcome_message}`
        : '';

      // User prompt aprimorado
      const userPrompt = `${historyContext ? `HISTÓRICO DA CONVERSA:\n${historyContext}\n\n` : ''}${currentFlowContext}\n${currentConfigContext}

SOLICITAÇÃO DO USUÁRIO:
"${message}"

INSTRUÇÕES:
1. INTERPRETE naturalmente o que o usuário quer (ele pode falar de várias formas)
2. Se a solicitação for AMBÍGUA, retorne needsConfirmation: true com uma pergunta clara
3. Se já existe fluxo e não tem certeza se é edição ou criação nova, PERGUNTE
4. Se for claro o que fazer, execute e retorne o fluxo
5. ENTENDA exatamente o que o cliente quer
6. EXTRAIA o nome do negócio, tipo e funcionalidades desejadas
7. CRIE um fluxo COMPLETO e PERSONALIZADO (mínimo 8 nós)
8. USE o nome do negócio nas mensagens
9. Responda APENAS com o JSON válido conforme especificado`;

      // Chamar API de IA (usar Mistral ou OpenRouter)
      let aiResponse: string | null = null;
      let usedFallback = false;
      let attemptNumber = 0;

      // ============================================================
      // ESTRATÉGIA DE RETRY COM IA - NUNCA USAR TEMPLATES LOCAIS
      // Igual ao comportamento do llm.ts que tenta múltiplos modelos
      // ============================================================
      const { chatComplete } = await import('./llm');

      // Função para fazer chamada LLM com prompt específico
      const tryLLMCall = async (
        sysPrompt: string, 
        usrPrompt: string, 
        attempt: number,
        timeoutMs: number = 60000 // 60 segundos por tentativa
      ): Promise<string | null> => {
        try {
          console.log(`🤖 [FLOW_GENERATOR] Tentativa ${attempt} - Chamando LLM...`);
          
          const timeoutPromise = new Promise<null>((_, reject) => {
            setTimeout(() => reject(new Error(`TIMEOUT após ${timeoutMs/1000}s`)), timeoutMs);
          });

          const llmPromise = chatComplete({
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: usrPrompt }
            ],
            temperature: attempt === 1 ? 0.3 : 0.5, // Aumentar temperatura nos retries
            maxTokens: 8000
          });

          const response = await Promise.race([llmPromise, timeoutPromise]) as any;
          
          if (response?.choices?.[0]?.message?.content) {
            const content = response.choices[0].message.content;
            console.log(`✅ [FLOW_GENERATOR] Tentativa ${attempt} - Resposta recebida (${content.length} chars)`);
            return content;
          }
          return null;
        } catch (err: any) {
          console.warn(`⚠️ [FLOW_GENERATOR] Tentativa ${attempt} falhou: ${err?.message || err}`);
          return null;
        }
      };

      // Prompt simplificado para retry (mais direto e curto)
      const simplifiedSystemPrompt = `Você é um assistente que cria fluxos de chatbot para WhatsApp.
Responda APENAS com JSON válido no formato:
{
  "message": "Mensagem de sucesso",
  "flow": {
    "config": { "name": "Nome do Negócio", "welcome_message": "Bem-vindo!", "fallback_message": "Não entendi", "goodbye_message": "Obrigado!" },
    "nodes": [array de nós do fluxo]
  }
}

Tipos de nós disponíveis: start, message, buttons, input, transfer_human, end

Exemplo de nó buttons:
{
  "node_id": "node_menu",
  "name": "Menu",
  "node_type": "buttons",
  "content": {
    "body": "Escolha uma opção:",
    "buttons": [
      {"id": "btn_1", "title": "Opção 1", "next_node": "node_opcao1"},
      {"id": "btn_2", "title": "Opção 2", "next_node": "node_opcao2"}
    ]
  }
}`;

      const simplifiedUserPrompt = `Crie um fluxo de chatbot para: ${message}

Inclua no mínimo:
- Nó start (início)
- Nó menu com botões
- 2-3 opções de serviço
- Opção de falar com atendente
- Nó end (fim)

Responda APENAS com o JSON do fluxo.`;

      // Prompt ultra-simples para último retry
      const ultraSimplePrompt = `Crie um JSON de fluxo de chatbot simples para "${message}".
Use este formato EXATO:
{
  "message": "Fluxo criado!",
  "flow": {
    "config": { "name": "Meu Negócio", "welcome_message": "Olá!", "fallback_message": "Não entendi", "goodbye_message": "Até logo!" },
    "nodes": [
      {"node_id": "node_start", "name": "Início", "node_type": "start", "content": {}, "next_node_id": "node_menu"},
      {"node_id": "node_menu", "name": "Menu", "node_type": "buttons", "content": {"body": "Como posso ajudar?", "buttons": [{"id": "btn_1", "title": "Informações", "next_node": "node_info"}, {"id": "btn_2", "title": "Atendente", "next_node": "node_transfer"}]}},
      {"node_id": "node_info", "name": "Info", "node_type": "message", "content": {"text": "Aqui estão nossas informações."}, "next_node_id": "node_menu"},
      {"node_id": "node_transfer", "name": "Atendente", "node_type": "transfer_human", "content": {"message": "Transferindo..."}},
      {"node_id": "node_end", "name": "Fim", "node_type": "end", "content": {}}
    ]
  }
}
Personalize os textos para o negócio solicitado. Responda APENAS o JSON.`;

      // ============================================================
      // TENTATIVA 1: Prompt completo (60 segundos)
      // ============================================================
      attemptNumber = 1;
      console.log(`🚀 [FLOW_GENERATOR] === TENTATIVA 1/3: Prompt completo ===`);
      console.log(`📝 [FLOW_GENERATOR] Prompt do usuário: ${message}`);
      
      aiResponse = await tryLLMCall(systemPrompt, userPrompt, 1, 60000);

      // ============================================================
      // TENTATIVA 2: Prompt simplificado (45 segundos)
      // ============================================================
      if (!aiResponse || aiResponse.trim() === '' || aiResponse === '{}') {
        attemptNumber = 2;
        console.log(`🔄 [FLOW_GENERATOR] === TENTATIVA 2/3: Prompt simplificado ===`);
        usedFallback = true;
        
        aiResponse = await tryLLMCall(simplifiedSystemPrompt, simplifiedUserPrompt, 2, 45000);
      }

      // ============================================================
      // TENTATIVA 3: Prompt ultra-simples (45 segundos)
      // ============================================================
      if (!aiResponse || aiResponse.trim() === '' || aiResponse === '{}') {
        attemptNumber = 3;
        console.log(`🔄 [FLOW_GENERATOR] === TENTATIVA 3/3: Prompt ultra-simples ===`);
        usedFallback = true;
        
        aiResponse = await tryLLMCall(
          'Você é um gerador de JSON. Responda APENAS com JSON válido.',
          ultraSimplePrompt,
          3,
          45000
        );
      }

      // ============================================================
      // VALIDAÇÃO FINAL: Se todas as tentativas falharam
      // ============================================================
      if (!aiResponse || aiResponse.trim() === '' || aiResponse === '{}') {
        console.error(`❌ [FLOW_GENERATOR] Todas as 3 tentativas falharam!`);
        // Retornar mensagem amigável pedindo para tentar novamente
        return res.json({
          needsConfirmation: true,
          confirmationMessage: `Estou processando seu pedido... Por favor, tente novamente em alguns segundos. Nosso sistema está trabalhando para criar o fluxo perfeito para você! 🚀`,
          message: `Por favor, repita sua solicitação: "${message}"`
        });
      }
      
      console.log(`✅ [FLOW_GENERATOR] Resposta obtida na tentativa ${attemptNumber}`);
      console.log(`📋 [FLOW_GENERATOR] Preview: ${aiResponse?.substring(0, 300)}...`);

      // Parsear resposta da IA
      let parsedResponse: any;
      try {
        // Limpar resposta - remover possíveis marcadores de código
        let cleanResponse = aiResponse || '{}';
        cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        // Tentar encontrar JSON válido
        const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          // Sanitizar JSON - remover caracteres de controle dentro de strings
          let jsonStr = jsonMatch[0];
          
          // SANITIZAÇÃO ROBUSTA: Limpar caracteres de controle dentro de strings JSON
          // Processar string por string para não quebrar a estrutura JSON
          jsonStr = jsonStr.replace(/"((?:[^"\\]|\\.)*)"/g, (match, content) => {
            // Dentro de strings JSON:
            // 1. Substituir quebras de linha reais por espaços
            // 2. Substituir tabs por espaços
            // 3. Remover carriage returns
            // 4. Substituir outros caracteres de controle
            let cleanContent = content
              .replace(/\n/g, ' ')
              .replace(/\r/g, '')
              .replace(/\t/g, ' ')
              .replace(/[\x00-\x1F\x7F]/g, ' ') // Remover outros chars de controle
              .replace(/  +/g, ' '); // Colapsar múltiplos espaços
            return `"${cleanContent}"`;
          });
          
          parsedResponse = JSON.parse(jsonStr);
        } else {
          // Se não encontrou JSON, verificar se a IA respondeu em texto natural (fazendo pergunta)
          // Isso acontece quando a IA quer confirmar algo mas não seguiu o formato
          if (cleanResponse.includes('?') || cleanResponse.toLowerCase().includes('poderia') || cleanResponse.toLowerCase().includes('qual')) {
            console.log(`❓ [FLOW_GENERATOR] IA respondeu em texto natural (possível confirmação): ${cleanResponse.substring(0, 200)}`);
            return res.json({
              needsConfirmation: true,
              confirmationMessage: cleanResponse,
              message: cleanResponse
            });
          }
          throw new Error('JSON não encontrado na resposta');
        }
      } catch (parseError) {
        console.error('[FLOW_GENERATOR] Erro ao parsear resposta:', parseError);
        console.log('[FLOW_GENERATOR] Resposta original:', aiResponse?.substring(0, 500));
        
        // Verificar se a resposta contém um JSON (mesmo que mal-formado)
        // Se contiver, NÃO tratar como pergunta de confirmação
        const looksLikeJSON = aiResponse && (
          aiResponse.includes('"flow"') || 
          aiResponse.includes('"nodes"') || 
          aiResponse.includes('"needsConfirmation"')
        );
        
        // Se a resposta parece ser uma pergunta E NÃO parece ser JSON, tratar como confirmação
        if (!looksLikeJSON && aiResponse && (
          aiResponse.includes('?') || 
          aiResponse.toLowerCase().includes('você quer') || 
          aiResponse.toLowerCase().includes('deseja')
        )) {
          return res.json({
            needsConfirmation: true,
            confirmationMessage: aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim(),
            message: aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          });
        }
        
        // ============================================================
        // FALLBACK: Se parse falhou, pedir para tentar novamente
        // NUNCA retornar erro 500 para o usuário!
        // ============================================================
        console.log(`🔄 [FLOW_GENERATOR] Parse falhou, pedindo para tentar novamente...`);
        return res.json({
          needsConfirmation: true,
          confirmationMessage: `Quase lá! Estou finalizando a criação do seu fluxo. Por favor, envie sua solicitação novamente para que eu possa concluir: "${message}"`,
          message: `Por favor, repita: ${message}`
        });
      }

      // ============================================================
      // VERIFICAR SE A IA PRECISA DE CONFIRMAÇÃO
      // ============================================================
      if (parsedResponse.needsConfirmation === true) {
        console.log(`❓ [FLOW_GENERATOR] IA pediu confirmação: ${parsedResponse.confirmationMessage || parsedResponse.message}`);
        return res.json({
          needsConfirmation: true,
          confirmationMessage: parsedResponse.confirmationMessage || parsedResponse.message,
          message: parsedResponse.message || parsedResponse.confirmationMessage
        });
      }

      console.log(`✅ [FLOW_GENERATOR] Fluxo gerado com ${parsedResponse.flow?.nodes?.length || 0} nós`);
      console.log(`📋 [FLOW_GENERATOR] Config recebido: ${JSON.stringify(parsedResponse.config || 'NENHUM')}`);

      // ============================================================
      // AUTO-REVISÃO: Verificar e corrigir o fluxo gerado
      // ============================================================
      if (parsedResponse.flow?.nodes?.length > 0) {
        console.log(`🔍 [FLOW_GENERATOR] Iniciando auto-revisão do fluxo...`);
        
        const nodes = parsedResponse.flow.nodes;
        let corrections = 0;
        
        // Mapeamento de variáveis encontradas
        const declaredVariables: Set<string> = new Set();
        const usedVariables: Set<string> = new Set();
        
        // Primeira passagem: identificar todas as variáveis declaradas
        for (const node of nodes) {
          const content = node.content || {};
          
          // Input nodes - variable_name
          if (node.node_type === 'input' && content.variable_name) {
            declaredVariables.add(content.variable_name);
          }
          
          // Buttons com save_variable
          if (content.buttons && Array.isArray(content.buttons)) {
            for (const btn of content.buttons) {
              if (btn.save_variable) {
                declaredVariables.add(btn.save_variable);
              }
            }
          }
          
          // Lists com save_variable
          if (content.sections && Array.isArray(content.sections)) {
            for (const section of content.sections) {
              if (section.rows && Array.isArray(section.rows)) {
                for (const row of section.rows) {
                  if (row.save_variable) {
                    declaredVariables.add(row.save_variable);
                  }
                }
              }
            }
          }
          
          // set_variable nodes
          if (node.node_type === 'set_variable' && content.variable) {
            declaredVariables.add(content.variable);
          }
        }
        
        console.log(`📋 [AUTO-REVISAO] Variáveis declaradas: ${Array.from(declaredVariables).join(', ')}`);
        
        // Segunda passagem: verificar uso de variáveis e corrigir problemas
        for (const node of nodes) {
          const content = node.content || {};
          
          // Verificar mensagens que usam variáveis {{var}}
          if (content.text && typeof content.text === 'string') {
            const matches = content.text.match(/\{\{(\w+)\}\}/g);
            if (matches) {
              for (const match of matches) {
                const varName = match.replace(/\{\{|\}\}/g, '');
                usedVariables.add(varName);
              }
            }
          }
          
          // AUTO-CORREÇÃO 1: Botões de escolha sem save_variable
          // Se um botão leva a um nó de coleta de dados ou confirmação, provavelmente deveria salvar a escolha
          if (content.buttons && Array.isArray(content.buttons)) {
            const bodyLower = (content.body || '').toLowerCase();
            const shouldSave = 
              bodyLower.includes('forma de pagamento') ||
              bodyLower.includes('escolha') ||
              bodyLower.includes('selecione') ||
              bodyLower.includes('como prefere') ||
              bodyLower.includes('horário') ||
              bodyLower.includes('tipo de');
            
            if (shouldSave) {
              // Determinar nome da variável baseado no contexto
              let varName = 'escolha';
              if (bodyLower.includes('pagamento')) varName = 'pagamento';
              else if (bodyLower.includes('horário') || bodyLower.includes('hora')) varName = 'horario';
              else if (bodyLower.includes('serviço')) varName = 'servico';
              else if (bodyLower.includes('tamanho')) varName = 'tamanho';
              
              for (const btn of content.buttons) {
                if (!btn.save_variable && btn.next_node) {
                  btn.save_variable = varName;
                  corrections++;
                  console.log(`🔧 [AUTO-REVISAO] Adicionado save_variable="${varName}" ao botão "${btn.title}"`);
                }
              }
            }
          }
          
          // AUTO-CORREÇÃO 2: Listas sem save_variable que deveriam ter
          if (content.sections && Array.isArray(content.sections)) {
            const bodyLower = (content.body || '').toLowerCase();
            const shouldSave = 
              bodyLower.includes('escolha') ||
              bodyLower.includes('selecione') ||
              bodyLower.includes('cardápio') ||
              bodyLower.includes('menu') ||
              bodyLower.includes('serviço') ||
              bodyLower.includes('produto');
            
            if (shouldSave) {
              let varName = 'pedido';
              if (bodyLower.includes('serviço')) varName = 'servico';
              else if (bodyLower.includes('profissional')) varName = 'profissional';
              
              for (const section of content.sections) {
                if (section.rows && Array.isArray(section.rows)) {
                  for (const row of section.rows) {
                    if (!row.save_variable && row.next_node) {
                      row.save_variable = varName;
                      corrections++;
                      console.log(`🔧 [AUTO-REVISAO] Adicionado save_variable="${varName}" ao item "${row.title}"`);
                    }
                  }
                }
              }
            }
          }
        }
        
        // Verificar variáveis usadas mas não declaradas
        for (const usedVar of usedVariables) {
          if (!declaredVariables.has(usedVar)) {
            console.log(`⚠️ [AUTO-REVISAO] Variável {{${usedVar}}} usada mas não declarada`);
          }
        }
        
        console.log(`✅ [AUTO-REVISAO] Revisão completa. ${corrections} correções aplicadas.`);
        
        // Atualizar os nós no parsedResponse
        parsedResponse.flow.nodes = nodes;
      }

      // ============================================================
      // FORÇAR IA A GERAR CONFIG: Loop até IA retornar corretamente
      // ============================================================
      if (!parsedResponse.config && !isDefinitelyEdit) {
        console.log(`⚠️ [FLOW_GENERATOR] IA não retornou config. Fazendo chamadas adicionais até obter o config...`);
        
        // Limpar prefixos de sistema para obter mensagem original
        let cleanMessage = message
          .replace(/^(Criar novo fluxo do zero:\s*)/i, '')
          .replace(/^(Criar novo fluxo:\s*)/i, '')
          .replace(/^(Novo fluxo:\s*)/i, '')
          .trim();
        
        // Tentar até 3 vezes para obter o config da IA
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts && !parsedResponse.config; attempt++) {
          console.log(`🔄 [FLOW_GENERATOR] Tentativa ${attempt}/${maxAttempts} para obter config da IA...`);
          
          const configPrompt = `
TAREFA CRÍTICA: Extrair configuração do chatbot.

Solicitação original do usuário:
"${cleanMessage}"

Você DEVE retornar um JSON válido com a configuração do chatbot.

FORMATO OBRIGATÓRIO (copie e preencha):
{
  "config": {
    "name": "[NOME EXATO DO NEGÓCIO DA MENSAGEM]",
    "welcome_message": "[BOAS-VINDAS PERSONALIZADA COM NOME E EMOJIS]",
    "fallback_message": "[MENSAGEM PARA QUANDO NÃO ENTENDER]",
    "goodbye_message": "[DESPEDIDA COM NOME DO NEGÓCIO E EMOJIS]"
  }
}

EXEMPLOS:
- Se a mensagem menciona "Loja de Roupas Fashion Style", o name deve ser exatamente "Loja de Roupas Fashion Style"
- Se a mensagem menciona "Clínica Médica Saúde Total", o name deve ser exatamente "Clínica Médica Saúde Total"

RESPONDA APENAS COM O JSON, NADA MAIS.`;

          try {
            // Usar chatComplete que já está importado no escopo
            const configResponse = await chatComplete({
              model: 'mistral-medium-latest',
              messages: [{ role: 'user', content: configPrompt }],
              temperature: 0.1,
              maxTokens: 600,
            });
            
            // chatComplete retorna { choices: [{ message: { content: "..." } }] }
            // Extrair o conteúdo da resposta corretamente
            const configContent = configResponse?.choices?.[0]?.message?.content || '';
            
            console.log(`📝 [FLOW_GENERATOR] Tentativa ${attempt} - Resposta: ${configContent.substring(0, 300)}...`);
            
            // Extrair JSON da resposta
            const jsonMatch = configContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const configJson = JSON.parse(jsonMatch[0]);
                if (configJson.config && configJson.config.name) {
                  parsedResponse.config = configJson.config;
                  console.log(`✅ [FLOW_GENERATOR] Config obtido na tentativa ${attempt}: "${parsedResponse.config.name}"`);
                  break;
                }
              } catch (parseErr) {
                console.log(`⚠️ [FLOW_GENERATOR] Tentativa ${attempt} - Erro ao parsear JSON: ${parseErr}`);
              }
            }
          } catch (configError) {
            console.log(`❌ [FLOW_GENERATOR] Tentativa ${attempt} - Erro na chamada: ${configError}`);
          }
        }
        
        // Se após todas as tentativas ainda não tem config, lança erro
        if (!parsedResponse.config) {
          console.log(`❌ [FLOW_GENERATOR] FALHA CRÍTICA: Não foi possível obter config após ${maxAttempts} tentativas`);
          throw new Error('Não foi possível gerar a configuração do chatbot. Por favor, tente novamente com uma descrição mais detalhada do seu negócio.');
        }
      }

      // ============================================================
      // AUTO-SAVE: Salvar versão automaticamente após gerar fluxo
      // ============================================================
      try {
        // Obter chatbot_id do usuário
        const configResult = await withRetry(async () => {
          return db.execute(sql`
            SELECT id FROM chatbot_configs WHERE user_id = ${userId}
          `);
        });

        let chatbotId: string;
        if (configResult.rows.length === 0) {
          // Criar config se não existir
          const newConfig = await withRetry(async () => {
            return db.execute(sql`
              INSERT INTO chatbot_configs (user_id, name, welcome_message, fallback_message, goodbye_message)
              VALUES (
                ${userId}, 
                ${parsedResponse.config?.name || 'Meu Robô'},
                ${parsedResponse.config?.welcome_message || null},
                ${parsedResponse.config?.fallback_message || null},
                ${parsedResponse.config?.goodbye_message || null}
              )
              RETURNING id
            `);
          });
          chatbotId = (newConfig.rows[0] as any).id;
        } else {
          chatbotId = (configResult.rows[0] as any).id;
          
          // IMPORTANTE: Atualizar o config existente com os novos dados da IA
          if (parsedResponse.config) {
            console.log(`🔄 [FLOW_GENERATOR] Atualizando config existente com nome: ${parsedResponse.config.name}`);
            await withRetry(async () => {
              return db.execute(sql`
                UPDATE chatbot_configs 
                SET 
                  name = COALESCE(${parsedResponse.config.name}, name),
                  welcome_message = COALESCE(${parsedResponse.config.welcome_message}, welcome_message),
                  fallback_message = COALESCE(${parsedResponse.config.fallback_message}, fallback_message),
                  goodbye_message = COALESCE(${parsedResponse.config.goodbye_message}, goodbye_message),
                  updated_at = NOW()
                WHERE id = ${chatbotId}
              `);
            });
          }
        }

        // Obter próximo número de versão
        const versionResult = await withRetry(async () => {
          return db.execute(sql`
            SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
            FROM chatbot_flow_versions
            WHERE chatbot_id = ${chatbotId}
          `);
        });
        const nextVersion = (versionResult.rows[0] as any).next_version || 1;

        // Marcar versões anteriores como não-atuais
        await withRetry(async () => {
          return db.execute(sql`
            UPDATE chatbot_flow_versions
            SET is_current = false
            WHERE chatbot_id = ${chatbotId} AND is_current = true
          `);
        });

        // Salvar nova versão
        const versionName = parsedResponse.config?.name || 'Fluxo Gerado por IA';
        await withRetry(async () => {
          return db.execute(sql`
            INSERT INTO chatbot_flow_versions (
              chatbot_id, user_id, version_number, name,
              config_snapshot, nodes_snapshot, connections_snapshot,
              edit_type, edit_summary, edit_details, is_current
            ) VALUES (
              ${chatbotId}, ${userId}, ${nextVersion}, ${versionName},
              ${JSON.stringify(parsedResponse.config || {})}::jsonb,
              ${JSON.stringify(parsedResponse.flow?.nodes || [])}::jsonb,
              ${JSON.stringify([])}::jsonb,
              'ai_generate',
              ${`Fluxo gerado via IA: ${parsedResponse.message?.substring(0, 100) || 'Novo fluxo'}`},
              ${JSON.stringify({ original_message: message.substring(0, 500), nodes_count: parsedResponse.flow?.nodes?.length || 0 })}::jsonb,
              true
            )
          `);
        });

        console.log(`📁 [FLOW_GENERATOR] Versão ${nextVersion} salva automaticamente`);
      } catch (saveError) {
        console.error('[FLOW_GENERATOR] Erro ao auto-salvar versão:', saveError);
        // Não falhar a request por causa do auto-save
      }

      res.json(parsedResponse);

    } catch (error: any) {
      console.error('[FLOW_GENERATOR] Erro ao gerar fluxo:', error);
      res.status(500).json({ error: "Erro ao gerar fluxo", details: error.message });
    }
  });

  // ============================================================
  // HISTÓRICO DE VERSÕES DO FLUXO
  // ============================================================

  // Listar todas as versões do fluxo
  app.get("/api/chatbot/flow-versions", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const result = await withRetry(async () => {
        return db.execute(sql`
          SELECT 
            v.id, v.version_number, v.edit_type, v.edit_summary, 
            v.is_current, v.created_at,
            jsonb_array_length(v.nodes_snapshot) as nodes_count
          FROM chatbot_flow_versions v
          JOIN chatbot_configs c ON v.chatbot_id = c.id
          WHERE c.user_id = ${userId}
          ORDER BY v.version_number DESC
          LIMIT 50
        `);
      });

      res.json(result.rows);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao listar versões:', error);
      res.status(500).json({ error: "Erro ao listar versões" });
    }
  });

  // Obter detalhes de uma versão específica
  app.get("/api/chatbot/flow-versions/:versionId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { versionId } = req.params;

      const result = await withRetry(async () => {
        return db.execute(sql`
          SELECT v.*
          FROM chatbot_flow_versions v
          JOIN chatbot_configs c ON v.chatbot_id = c.id
          WHERE c.user_id = ${userId} AND v.id = ${versionId}
        `);
      });

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Versão não encontrada" });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao buscar versão:', error);
      res.status(500).json({ error: "Erro ao buscar versão" });
    }
  });

  // Restaurar uma versão anterior
  app.post("/api/chatbot/flow-versions/:versionId/restore", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { versionId } = req.params;

      // Buscar versão a restaurar
      const versionResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT v.*, c.id as chatbot_id
          FROM chatbot_flow_versions v
          JOIN chatbot_configs c ON v.chatbot_id = c.id
          WHERE c.user_id = ${userId} AND v.id = ${versionId}
        `);
      });

      if (versionResult.rows.length === 0) {
        return res.status(404).json({ error: "Versão não encontrada" });
      }

      const version = versionResult.rows[0] as any;
      const chatbotId = version.chatbot_id;

      // Deletar nós e conexões atuais
      await withRetry(async () => {
        return db.execute(sql`
          DELETE FROM chatbot_flow_connections WHERE chatbot_id = ${chatbotId}
        `);
      });
      await withRetry(async () => {
        return db.execute(sql`
          DELETE FROM chatbot_flow_nodes WHERE chatbot_id = ${chatbotId}
        `);
      });

      // Restaurar nós da versão
      const nodes = version.nodes_snapshot || [];
      for (const node of nodes) {
        await withRetry(async () => {
          return db.execute(sql`
            INSERT INTO chatbot_flow_nodes (
              chatbot_id, node_id, name, node_type, content,
              next_node_id, position_x, position_y, display_order
            ) VALUES (
              ${chatbotId}, ${node.node_id}, ${node.name}, ${node.node_type},
              ${JSON.stringify(node.content || {})}::jsonb, ${node.next_node_id || null},
              ${node.position_x ?? 0}, ${node.position_y ?? 0}, ${node.display_order ?? 0}
            )
          `);
        });
      }

      // Restaurar conexões
      const connections = version.connections_snapshot || [];
      for (const conn of connections) {
        await withRetry(async () => {
          return db.execute(sql`
            INSERT INTO chatbot_flow_connections (
              chatbot_id, from_node_id, to_node_id, condition_type, condition_value
            ) VALUES (
              ${chatbotId}, ${conn.from_node_id}, ${conn.to_node_id},
              ${conn.condition_type || null}, ${conn.condition_value || null}
            )
          `);
        });
      }

      // Restaurar config
      const config = version.config_snapshot || {};
      if (config.name) {
        await withRetry(async () => {
          return db.execute(sql`
            UPDATE chatbot_configs SET
              name = ${config.name},
              welcome_message = ${config.welcome_message || null},
              fallback_message = ${config.fallback_message || null},
              goodbye_message = ${config.goodbye_message || null},
              updated_at = now()
            WHERE id = ${chatbotId}
          `);
        });
      }

      // Obter próximo número de versão e criar nova versão (tipo restore)
      const nextVersionResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
          FROM chatbot_flow_versions
          WHERE chatbot_id = ${chatbotId}
        `);
      });
      const nextVersion = (nextVersionResult.rows[0] as any).next_version || 1;

      // Marcar versões anteriores como não-atuais
      await withRetry(async () => {
        return db.execute(sql`
          UPDATE chatbot_flow_versions
          SET is_current = false
          WHERE chatbot_id = ${chatbotId} AND is_current = true
        `);
      });

      // Criar nova versão (tipo restore)
      const restoreName = config?.name || `Fluxo Restaurado v${nextVersion}`;
      await withRetry(async () => {
        return db.execute(sql`
          INSERT INTO chatbot_flow_versions (
            chatbot_id, user_id, version_number, name,
            config_snapshot, nodes_snapshot, connections_snapshot,
            edit_type, edit_summary, edit_details, is_current
          ) VALUES (
            ${chatbotId}, ${userId}, ${nextVersion}, ${restoreName},
            ${JSON.stringify(config)}::jsonb,
            ${JSON.stringify(nodes)}::jsonb,
            ${JSON.stringify(connections)}::jsonb,
            'restore',
            ${`Restaurado da versão ${version.version_number}`},
            ${JSON.stringify({ restored_from_version: version.version_number, restored_from_id: versionId })}::jsonb,
            true
          )
        `);
      });

      console.log(`✅ [CHATBOT_FLOW] Versão ${version.version_number} restaurada como versão ${nextVersion}`);

      res.json({
        success: true,
        message: `Versão ${version.version_number} restaurada com sucesso`,
        new_version: nextVersion,
        nodes_count: nodes.length
      });
    } catch (error) {
      console.error('[CHATBOT_FLOW] Erro ao restaurar versão:', error);
      res.status(500).json({ error: "Erro ao restaurar versão" });
    }
  });

  // ============================================================
  // EDIÇÃO DO FLUXO VIA CHAT IA
  // ============================================================

  // Editar fluxo existente via chat (adicionar, remover, modificar)
  app.post("/api/chatbot/edit-flow-chat", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const { message, currentNodes, currentConfig } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Mensagem é obrigatória" });
      }

      if (!currentNodes || currentNodes.length === 0) {
        return res.status(400).json({ error: "Fluxo atual é necessário para edição" });
      }

      console.log(`✏️ [FLOW_EDITOR] Editando fluxo para usuário ${userId}`);
      console.log(`📝 Comando: ${message.substring(0, 200)}...`);

      // System prompt para EDIÇÃO (diferente de criação)
      const editSystemPrompt = `Você é um especialista em EDITAR fluxos de chatbot para WhatsApp.

VOCÊ RECEBE UM FLUXO EXISTENTE E DEVE MODIFICÁ-LO conforme a solicitação do usuário.

OPERAÇÕES QUE VOCÊ PODE FAZER:
1. ADICIONAR novos itens (produtos, serviços, opções)
2. REMOVER itens existentes
3. MODIFICAR textos, preços, descrições
4. REORGANIZAR ordem dos itens
5. ADICIONAR novos nós ao fluxo
6. REMOVER nós do fluxo
7. MODIFICAR mensagens existentes

REGRAS IMPORTANTES:
- MANTENHA a estrutura geral do fluxo
- NÃO remova nós importantes como start, end, transfer_human
- PRESERVE os node_ids existentes quando possível
- Ao adicionar itens em lista, siga o padrão dos itens existentes
- Ao modificar preços, mantenha o formato (R$ XX,XX)
- Máximo 3 botões, máximo 10 itens por seção de lista

FORMATO DA RESPOSTA:
{
  "message": "Descrição clara do que foi alterado",
  "changes_summary": ["Mudança 1", "Mudança 2"],
  "flow": {
    "nodes": [... todos os nós incluindo modificações ...]
  },
  "config": {
    "name": "Nome do Chatbot",
    ...
  }
}

EXEMPLOS DE SOLICITAÇÕES:
- "Adicione uma pizza de pepperoni no cardápio por R$ 52,00" → Adicionar na lista de pizzas
- "Remova a opção de promoções" → Remover nó de promoções e referências
- "Mude o preço da Margherita para R$ 48,00" → Modificar descrição do item
- "Adicione mais 5 sabores de pizza" → Expandir lista de pizzas
- "Troque a mensagem de boas-vindas" → Modificar texto do nó de welcome`;

      const editUserPrompt = `FLUXO ATUAL (modifique conforme solicitado):
${JSON.stringify(currentNodes, null, 2)}

CONFIGURAÇÃO ATUAL:
${JSON.stringify(currentConfig || {}, null, 2)}

SOLICITAÇÃO DE EDIÇÃO:
${message}

IMPORTANTE:
- Retorne o fluxo COMPLETO com as modificações aplicadas
- Preserve os node_ids existentes
- Retorne APENAS JSON válido`;

      // Chamar IA para edição
      const { chatComplete } = await import('./llm');

      const llmResponse = await chatComplete({
        messages: [
          { role: 'system', content: editSystemPrompt },
          { role: 'user', content: editUserPrompt }
        ],
        temperature: 0.2, // Mais baixo para edições precisas
        maxTokens: 8000
      });

      const aiResponse = llmResponse.choices?.[0]?.message?.content || null;

      if (!aiResponse) {
        throw new Error('Resposta vazia da IA');
      }

      // Parsear resposta
      let cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON não encontrado na resposta');
      }

      const parsedResponse = JSON.parse(jsonMatch[0]);

      // Obter chatbot_id
      const configResult = await withRetry(async () => {
        return db.execute(sql`
          SELECT id FROM chatbot_configs WHERE user_id = ${userId}
        `);
      });

      const chatbotId = (configResult.rows[0] as any)?.id;

      if (chatbotId) {
        // Auto-save da edição
        const versionResult = await withRetry(async () => {
          return db.execute(sql`
            SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
            FROM chatbot_flow_versions
            WHERE chatbot_id = ${chatbotId}
          `);
        });
        const nextVersion = (versionResult.rows[0] as any).next_version || 1;

        await withRetry(async () => {
          return db.execute(sql`
            UPDATE chatbot_flow_versions
            SET is_current = false
            WHERE chatbot_id = ${chatbotId} AND is_current = true
          `);
        });

        const editName = parsedResponse.config?.name || currentConfig?.name || `Fluxo Editado v${nextVersion}`;
        await withRetry(async () => {
          return db.execute(sql`
            INSERT INTO chatbot_flow_versions (
              chatbot_id, user_id, version_number, name,
              config_snapshot, nodes_snapshot, connections_snapshot,
              edit_type, edit_summary, edit_details, is_current
            ) VALUES (
              ${chatbotId}, ${userId}, ${nextVersion}, ${editName},
              ${JSON.stringify(parsedResponse.config || currentConfig || {})}::jsonb,
              ${JSON.stringify(parsedResponse.flow?.nodes || [])}::jsonb,
              ${JSON.stringify([])}::jsonb,
              'ai_chat',
              ${`Edição via chat: ${message.substring(0, 100)}`},
              ${JSON.stringify({ 
                edit_command: message.substring(0, 500), 
                changes_summary: parsedResponse.changes_summary || [],
                nodes_before: currentNodes.length,
                nodes_after: parsedResponse.flow?.nodes?.length || 0
              })}::jsonb,
              true
            )
          `);
        });

        console.log(`📁 [FLOW_EDITOR] Edição salva como versão ${nextVersion}`);
      }

      console.log(`✅ [FLOW_EDITOR] Fluxo editado: ${parsedResponse.changes_summary?.join(', ') || 'Modificações aplicadas'}`);

      res.json(parsedResponse);

    } catch (error: any) {
      console.error('[FLOW_EDITOR] Erro ao editar fluxo:', error);
      res.status(500).json({ error: "Erro ao editar fluxo", details: error.message });
    }
  });

  console.log('✅ [CHATBOT_FLOW] Rotas registradas com sucesso!');
}
