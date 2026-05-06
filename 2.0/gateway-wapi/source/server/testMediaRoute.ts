/**
 * Rota de teste para configurar fluxo completo de mídia
 */

import { Router } from "express";
import { storage } from "./storage";
import { v4 as uuidv4 } from "uuid";

const router = Router();

router.post("/api/test/setup-media-flow", async (req, res) => {
  try {
    console.log("🚀 Configurando fluxo de teste de mídia...");

    // 1. Buscar ou criar usuário teste
    let user = await storage.getUserByEmail("teste@agentezap.com");
    
    if (!user) {
      const userId = uuidv4();
      await storage.createUser({
        id: userId,
        email: "teste@agentezap.com",
        name: "Usuário Teste",
        phone: "+5511999999999",
        role: "user",
      });
      user = await storage.getUserByEmail("teste@agentezap.com");
      console.log(`✅ Usuário criado: ${user?.id}`);
    } else {
      console.log(`✅ Usuário encontrado: ${user.id}`);
    }

    if (!user) {
      return res.status(500).json({ error: "Falha ao criar/buscar usuário" });
    }

    // 2. Configurar agente
    const agentPrompt = `# IDENTIDADE
Sou o Vendedor Virtual da Loja Teste. Atendo clientes com cordialidade.

# CONTEXTO
Loja de produtos diversos com catálogo de imagens.

# INSTRUÇÕES IMPORTANTES PARA MÍDIA
Quando o cliente perguntar sobre "catalogo" ou "produtos", você DEVE incluir EXATAMENTE a tag [MEDIA:CATALOGO_TESTE] no final da sua resposta.

Exemplo correto:
Cliente: "quero ver o catalogo"
Você: "Claro! Aqui está nosso catálogo completo: [MEDIA:CATALOGO_TESTE]"`;

    let agent = await storage.getAgentConfig(user.id);
    
    if (!agent) {
      await storage.createAgentConfig({
        userId: user.id,
        prompt: agentPrompt,
        isActive: true,
        model: "mistral-small-latest",
      });
      console.log(`✅ Agente criado`);
    } else {
      await storage.updateAgentPrompt(user.id, agentPrompt);
      console.log(`✅ Agente atualizado`);
    }

    // 3. Limpar e adicionar mídia
    console.log("📸 Configurando mídia...");
    
    // Deletar mídias antigas
    await storage.db("agent_media_library")
      .where({ user_id: user.id })
      .del();
    
    // Adicionar nova mídia
    const mediaUrl = "https://via.placeholder.com/300x200.png?text=CATALOGO";
    
    await storage.db("agent_media_library").insert({
      user_id: user.id,
      name: "CATALOGO_TESTE",
      media_type: "image",
      storage_url: mediaUrl,
      description: "Catálogo de produtos da loja",
      when_to_use: "catalogo",
      is_active: true,
      send_alone: false,
      display_order: 0,
    });
    console.log(`✅ Mídia adicionada: ${mediaUrl}`);

    // 4. Criar/buscar token de teste
    let token = await storage.db("test_agent_tokens")
      .where({ user_id: user.id })
      .first();

    if (!token) {
      [token] = await storage.db("test_agent_tokens")
        .insert({
          user_id: user.id,
          token: "TEST_MEDIA_" + Date.now(),
          agent_name: "Vendedor Virtual",
          company_name: "Loja Teste",
        })
        .returning("*");
      console.log(`✅ Token criado: ${token.token}`);
    } else {
      console.log(`✅ Token existente: ${token.token}`);
    }

    // 5. Verificar configuração
    const medias = await storage.db("agent_media_library")
      .where({ user_id: user.id, is_active: true })
      .select("*");

    res.json({
      success: true,
      userId: user.id,
      token: token.token,
      testUrl: `http://localhost:5000/test/${token.token}`,
      mediasCount: medias.length,
      medias: medias.map(m => ({
        name: m.name,
        whenToUse: m.when_to_use,
        type: m.media_type
      })),
      instructions: [
        "1. Abra o link testUrl",
        "2. Digite: 'quero ver o catalogo'",
        "3. O agente deve incluir [MEDIA:CATALOGO_TESTE] na resposta",
        "4. O frontend deve exibir a imagem"
      ]
    });

  } catch (error) {
    console.error("❌ Erro ao configurar teste:", error);
    res.status(500).json({ error: String(error) });
  }
});

export default router;
