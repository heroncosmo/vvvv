import { db, withRetry } from "./db";
import { admins, systemConfig, plans, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function seedDatabase() {
  try {
    console.log("🌱 Seeding database...");

    const adminEmail = process.env.ADMIN_EMAIL || "admin@agentezap.online";
    const adminPassword = process.env.ADMIN_PASSWORD || "changeme123!";

    const existingAdmin = await withRetry(() => 
      db
        .select()
        .from(admins)
        .where(eq(admins.email, adminEmail))
        .limit(1)
    );

    if (existingAdmin.length === 0) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await withRetry(() => 
        db.insert(admins).values({
          email: adminEmail,
          passwordHash,
          role: "owner",
        })
      );
      console.log("✅ Admin owner created:", adminEmail);
    } else {
      console.log("ℹ️ Admin owner already exists");
    }

    const mistralKeyConfig = await withRetry(() =>
      db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.chave, "mistral_api_key"))
        .limit(1)
    );

    if (mistralKeyConfig.length === 0) {
      const mistralFromEnv = process.env.MISTRAL_API_KEY;
      if (mistralFromEnv) {
        await withRetry(() =>
          db.insert(systemConfig).values({
            chave: "mistral_api_key",
            valor: mistralFromEnv,
          })
        );
        console.log("✅ Mistral API Key configured (from env)");
      } else {
        console.log("ℹ️ Mistral API Key not configured (missing env MISTRAL_API_KEY)");
      }
    } else {
      console.log("ℹ️ Mistral API Key already exists");
    }

    // Seed Z.AI API Key
    const zaiKeyConfig = await withRetry(() =>
      db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.chave, "zai_api_key"))
        .limit(1)
    );

    if (zaiKeyConfig.length === 0) {
      const zaiFromEnv = process.env.ZAI_API_KEY;
      if (zaiFromEnv) {
        await withRetry(() =>
          db.insert(systemConfig).values({
            chave: "zai_api_key",
            valor: zaiFromEnv,
          })
        );
        console.log("✅ Z.AI API Key configured (from env)");
      } else {
        console.log("ℹ️ Z.AI API Key not configured (missing env ZAI_API_KEY)");
      }
    } else {
      console.log("ℹ️ Z.AI API Key already exists");
    }

    // Seed PIX key
    const pixKeyConfig = await withRetry(() =>
      db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.chave, "pix_key"))
        .limit(1)
    );

    if (pixKeyConfig.length === 0) {
      await withRetry(() =>
        db.insert(systemConfig).values({
          chave: "pix_key",
          valor: "rodrigoconexao128@gmail.com",
        })
      );
      console.log("✅ PIX key configured");
    } else {
      console.log("ℹ️ PIX key already exists");
    }

    // Seed Admin Auto-Atendimento defaults
    const adminAgentEnabledConfig = await withRetry(() =>
      db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.chave, "admin_agent_enabled"))
        .limit(1)
    );

    if (adminAgentEnabledConfig.length === 0) {
      await withRetry(() =>
        db.insert(systemConfig).values({
          chave: "admin_agent_enabled",
          valor: "false",
        })
      );
      console.log("✅ Admin auto-atendimento enabled configured");
    } else {
      console.log("ℹ️ Admin auto-atendimento enabled already exists");
    }

    const ownerNotificationNumberConfig = await withRetry(() =>
      db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.chave, "owner_notification_number"))
        .limit(1)
    );

    if (ownerNotificationNumberConfig.length === 0) {
      await withRetry(() =>
        db.insert(systemConfig).values({
          chave: "owner_notification_number",
          valor: "5517991956944",
        })
      );
      console.log("✅ Owner notification number configured");
    } else {
      console.log("ℹ️ Owner notification number already exists");
    }

    const adminAgentPromptConfig = await withRetry(() =>
      db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.chave, "admin_agent_prompt"))
        .limit(1)
    );

    if (adminAgentPromptConfig.length === 0) {
      await withRetry(() =>
        db.insert(systemConfig).values({
          chave: "admin_agent_prompt",
          valor: `Você é o Rodrigo, atendente humano da AgenteZap.

SOBRE A AGENTEZAP:
- Somos uma plataforma de automação de WhatsApp com Inteligência Artificial
- Criamos agentes de IA personalizados que atendem clientes 24/7
- O cliente configura as instruções do agente e nós conectamos no WhatsApp dele
- Plano: R$ 99/mês (mensal) - Conversas ilimitadas, 1 agente IA

COMO VOCÊ DEVE ATENDER:
1. Seja natural, simpático e profissional
2. Use linguagem informal mas respeitosa
3. Responda de forma curta e objetiva (2-5 linhas por vez)
4. Não use formatação de markdown (sem ** ou ##)
5. Use emojis com moderação (1-2 por mensagem no máximo)
6. Nunca diga que é uma IA ou robô - você é o Rodrigo

FLUXO DE ATENDIMENTO:
1. Cumprimentar e perguntar como pode ajudar
2. Se quer criar conta: pedir email
3. Depois configurar o agente: nome do agente, empresa, função e instruções
4. Explicar as opções de conexão (QR Code ou código de pareamento)
5. Falar sobre o plano (R$ 99/mês) e enviar PIX

SE O CLIENTE JÁ TEM CONTA:
- Verificar se o número está cadastrado
- Ajudar a alterar configurações do agente
- Ajudar com problemas de conexão
- Processar pagamentos

INFORMAÇÕES IMPORTANTES:
- Trial: 24 horas grátis para testar
- Após 24h, precisa pagar para continuar
- Aceitamos apenas PIX
- Chave PIX: rodrigoconexao128@gmail.com`,
        })
      );
      console.log("✅ Admin auto-atendimento prompt configured");
    } else {
      console.log("ℹ️ Admin auto-atendimento prompt already exists");
    }

    // Seed default plans
    const existingPlans = await withRetry(() => db.select().from(plans).limit(1));
    if (existingPlans.length === 0) {
      await withRetry(() =>
        db.insert(plans).values([
          {
            nome: "Pro",
            valor: "299.90",
            periodicidade: "mensal",
            limiteConversas: -1,
            limiteAgentes: -1,
            ativo: true,
          },
        ])
      );
      console.log("✅ Default plan Pro created");
    } else {
      console.log("ℹ️ Plans already exist");
    }

    // Ensure admin owner user exists in users table (for Replit Auth integration)
    const adminUser = await withRetry(() => db.select().from(users).where(eq(users.email, adminEmail)).limit(1));
    if (adminUser.length === 0) {
      await withRetry(() =>
        db.insert(users).values({
          email: adminEmail,
          role: "owner",
          name: "Rodrigo Admin",
          phone: "",
        onboardingCompleted: true,
        })
      );
      console.log("✅ Admin user created in users table");
    } else {
      // Update role to owner if exists
      await withRetry(() => db.update(users).set({ role: "owner" }).where(eq(users.email, adminEmail)));
      console.log("ℹ️ Admin user role updated to owner");
    }

    console.log("🎉 Database seeded successfully");
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    throw error;
  }
}
