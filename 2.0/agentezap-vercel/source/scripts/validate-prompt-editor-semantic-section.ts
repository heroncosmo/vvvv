import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function base64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fakeJwt(userId: string, email: string) {
  return [
    base64Url({ alg: "none", typ: "JWT" }),
    base64Url({
      sub: userId,
      aud: "authenticated",
      email,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    "signature",
  ].join(".");
}

async function readSseJson(response: Response) {
  const raw = await response.text();
  const events = raw
    .split(/\n\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => chunk.replace(/^data:\s*/i, ""))
    .map((chunk) => {
      try {
        return JSON.parse(chunk);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { raw, events, final: events[events.length - 1] || null };
}

function containsAll(text: string, needles: string[]) {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return needles.every((needle) =>
    normalized.includes(needle.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()),
  );
}

async function main() {

  const marcelPrompt = readFileSync("tmp/marcel-current-prompt-20260429.txt", "utf8").trim();
  const filler = Array.from({ length: 90 }, (_, index) =>
    `- Regra operacional ${index + 1}: preserve contexto, tom, dados do negocio, midias, catalogo, fluxo e confirmacoes ja salvas.`,
  ).join("\n");
  const realEstatePrompt = [
    "# IMOBILIARIA ALPHA",
    "Atenda leads de compra, venda e aluguel com clareza.",
    "## ESTILO DE ATENDIMENTO",
    "Use o nome do cliente quando existir. Seja consultivo e objetivo.",
    filler,
    "## IMOVEIS E CATALOGO",
    "Preserve os imoveis cadastrados, fotos, valores, bairro, disponibilidade e links de visita.",
    "## FINANCIAMENTO E VISITAS",
    "Nunca prometa aprovacao de credito. Agende visita somente depois de alinhar perfil.",
    filler,
  ].join("\n");
  const clinicPrompt = [
    "# CLINICA VIDA",
    "Atenda pacientes para consultas, exames e retornos.",
    "## AGENDAMENTO",
    "Confirme especialidade, profissional, data, horario e convenio antes de concluir.",
    filler,
    "## REGRAS CLINICAS",
    "Nao diagnostique. Oriente procurar emergencia em caso grave. Preserve dados e privacidade.",
    "## MIDIAS E DOCUMENTOS",
    "Quando houver preparo de exame salvo, envie a midia correta apenas se existir no cadastro.",
    filler,
  ].join("\n");

  const scenarios = [
    {
      name: "marcel-delivery-cardapio",
      prompt: marcelPrompt,
      instruction: "Na primeira mensagem envie sempre a imagem do cardapio junto com a saudacao, mas sem remover Delivery 2.0 e sem perder as regras atuais.",
      mustPreserve: ["delivery 2.0", "cardapio", "pedido"],
      mustAdd: ["primeira", "imagem", "cardapio"],
    },
    {
      name: "imobiliaria-financiamento",
      prompt: realEstatePrompt,
      instruction: "Quando o cliente pedir financiamento, confirme renda, entrada e cidade antes de simular e avise que a aprovacao pode mudar.",
      mustPreserve: ["imoveis", "catalogo", "visita"],
      mustAdd: ["financiamento", "renda", "entrada"],
    },
    {
      name: "clinica-agendamento",
      prompt: clinicPrompt,
      instruction: "Antes de agendar, confirme data, horario, profissional e avise para remarcar se nao puder comparecer.",
      mustPreserve: ["agendamento", "profissional", "privacidade"],
      mustAdd: ["remarcar", "horario", "profissional"],
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    const testUserId = randomUUID();
    const testEmail = `prompt.editor.semantic.${Date.now()}.${scenario.name}@agentezap.local`;
    const token = fakeJwt(testUserId, testEmail);
    if (scenario.prompt.length < 8000) throw new Error(`${scenario.name} prompt too small: ${scenario.prompt.length}`);

    const first = await fetch("https://agentezap.online/api/agent/edit-prompt-stream", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentPrompt: scenario.prompt, instruction: scenario.instruction }),
    });
    const firstSse = await readSseJson(first);
    if (!firstSse.final?.requiresConfirmation) {
      throw new Error(`${scenario.name}: expected confirmation proposal, got: ${firstSse.raw.slice(0, 500)}`);
    }

    const second = await fetch("https://agentezap.online/api/agent/edit-prompt-stream", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ currentPrompt: scenario.prompt, instruction: "sim pode aplicar" }),
    });
    const secondSse = await readSseJson(second);
    if (!secondSse.final?.success || !secondSse.final?.newPrompt) {
      throw new Error(`${scenario.name}: expected successful edit, got: ${secondSse.raw.slice(0, 800)}`);
    }

    const newPrompt = String(secondSse.final.newPrompt || "");
    const checks = {
      name: scenario.name,
      beforeLength: scenario.prompt.length,
      afterLength: newPrompt.length,
      versionId: secondSse.final.versionId || null,
      proposalMentionsSemanticPatch: /patch pequeno|secoes certas|sem jogar regra solta no final/i.test(String(firstSse.final.feedbackMessage || "")),
      hasOldAppendMarker: /agentezap-prompt-editor-append|append_block|AJUSTE CONFIRMADO PELO EDITOR/i.test(newPrompt),
      preserved: containsAll(newPrompt, scenario.mustPreserve),
      added: containsAll(newPrompt, scenario.mustAdd),
    };
    results.push(checks);
    if (checks.hasOldAppendMarker) throw new Error(`${scenario.name}: old append marker found`);
    if (!checks.preserved) throw new Error(`${scenario.name}: protected context was not preserved`);
    if (!checks.added) throw new Error(`${scenario.name}: requested rule was not added`);
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
