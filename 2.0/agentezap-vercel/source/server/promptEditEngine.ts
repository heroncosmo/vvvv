export interface EditOperation {
  type: "replace" | "insert" | "delete" | "modify_section";
  search?: string;
  replace?: string;
  section?: string;
  position?: "before" | "after" | "start" | "end";
  anchor?: string;
  explanation: string;
}

export interface EditResult {
  success: boolean;
  newPrompt: string;
  operations: EditOperation[];
  summary: string;
  feedbackMessage: string;
}

function disabledResult(currentPrompt: string, message: string): EditResult {
  return {
    success: false,
    newPrompt: currentPrompt,
    operations: [],
    summary: message,
    feedbackMessage: message,
  };
}

export function applyLLMBlocks(doc: string, blocks: string): EditResult {
  const operations: EditOperation[] = [];
  let newDoc = String(doc || "");
  const blockRegex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)>>>>>>> REPLACE/g;

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(String(blocks || ""))) !== null) {
    const searchBlock = match[1];
    const replaceBlock = match[2].replace(/^\n/, "").replace(/\n$/, "");

    if (!searchBlock || !newDoc.includes(searchBlock)) {
      continue;
    }

    newDoc = newDoc.replace(searchBlock, replaceBlock);
    operations.push({
      type: "replace",
      search: searchBlock,
      replace: replaceBlock,
      explanation: "Edicao aplicada a partir do contrato Codex SEARCH/REPLACE.",
    });
  }

  const success = operations.length > 0 && newDoc !== doc;
  return {
    success,
    newPrompt: success ? newDoc : doc,
    operations,
    summary: success ? "Edicoes aplicadas via Codex." : "Nenhuma edicao aplicavel retornada pelo Codex.",
    feedbackMessage: success
      ? "Alteracoes aplicadas com Codex."
      : "O Codex nao retornou um bloco aplicavel para alterar o prompt.",
  };
}

export function editPromptAdvanced(
  currentPrompt: string,
  _userInstruction: string,
): EditResult {
  return disabledResult(
    currentPrompt,
    "Edicao local heuristica desativada; a alteracao exige Codex com contexto do tenant.",
  );
}

export async function editPromptWithLLM(
  currentPrompt: string,
  userInstruction: string,
  _apiKey?: string,
  options?: { userId?: string; conversationId?: string },
): Promise<EditResult> {
  const userId = String(options?.userId || "").trim();
  const instruction = String(userInstruction || "").trim();
  const prompt = String(currentPrompt || "");

  if (!userId) {
    return disabledResult(prompt, "Codex exige userId/contexto do tenant para editar prompt.");
  }

  if (!prompt || !instruction) {
    return disabledResult(prompt, "Prompt atual e instrucao sao obrigatorios para editar.");
  }

  try {
    const { runWebOnlyCodexPromptTextForUser } = await import("../api/http");
    const raw = await runWebOnlyCodexPromptTextForUser({
      userId,
      task: "prompt_edit_engine_search_replace",
      messages: [
        {
          role: "system",
          content: [
            "Voce e o editor Codex de prompts do AgenteZap.",
            "Receba o prompt completo e a instrucao do tenant.",
            "Retorne somente blocos SEARCH/REPLACE aplicaveis ao texto original.",
            "Nao escreva fala publica, resumo fora do contrato, markdown extra ou JSON.",
            "Use exatamente este formato para cada alteracao:",
            "<<<<<<< SEARCH",
            "texto original exato",
            "=======",
            "novo texto",
            ">>>>>>> REPLACE",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Instrucao do tenant: ${instruction}`,
            "",
            "Prompt atual completo:",
            prompt,
          ].join("\n"),
        },
      ],
      message: instruction,
      conversationId: options?.conversationId || `prompt-edit-engine:${userId}`,
      contactName: "Personalize IA",
      maxTokens: 6000,
      timeoutMs: 90_000,
      contextArtifacts: {
        channel: "prompt_edit_engine",
        instruction,
        currentPromptLength: prompt.length,
      },
    });

    return applyLLMBlocks(prompt, raw);
  } catch (error: any) {
    return disabledResult(
      prompt,
      error?.message || "Falha operacional ao editar prompt com Codex.",
    );
  }
}

export async function editPromptWithGPTv2(
  currentPrompt: string,
  _userInstruction: string,
  _legacyApiKey: string,
): Promise<EditResult> {
  return disabledResult(
    currentPrompt,
    "GPTv2 direto foi desativado; a alteracao exige Codex com contexto do tenant.",
  );
}

export async function editPrompt(
  currentPrompt: string,
  userInstruction: string,
  legacyApiKey?: string,
  options?: { userId?: string; conversationId?: string },
): Promise<EditResult> {
  return editPromptWithLLM(currentPrompt, userInstruction, legacyApiKey, options);
}
