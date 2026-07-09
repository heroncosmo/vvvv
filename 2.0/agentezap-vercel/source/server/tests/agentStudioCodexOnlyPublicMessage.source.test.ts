import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const agentStudioSource = fs.readFileSync(
  path.resolve(root, "client", "src", "components", "agent-studio-unified.tsx"),
  "utf8",
);
const webOnlySource = fs.readFileSync(path.resolve(root, "api", "http.ts"), "utf8");
const routesSource = fs.readFileSync(path.resolve(root, "server", "routes.ts"), "utf8");

function sliceFunction(name: string): string {
  const start = agentStudioSource.indexOf(`function ${name}`);
  assert.ok(start >= 0, `must locate ${name}`);

  const nextFunction = agentStudioSource.indexOf("\nfunction ", start + 1);
  return agentStudioSource.slice(start, nextFunction > start ? nextFunction : undefined);
}

function sliceBetween(startMarker: string, endMarker: string): string {
  return sliceBetweenIn(agentStudioSource, startMarker, endMarker);
}

function sliceBetweenIn(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `must locate ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `must locate ${endMarker}`);
  return source.slice(start, end);
}

function sliceMutationOnError(block: string): string {
  const start = block.indexOf("onError:");
  assert.ok(start >= 0, "must locate mutation onError");
  const end = block.indexOf("\n    }\n  });", start);
  assert.ok(end > start, "must locate mutation onError end");
  return block.slice(start, end);
}

const editPromptSanitizer = sliceFunction("sanitizeEditPromptClientMessage");
const publicMessageSanitizer = sliceFunction("sanitizeAgentStudioPublicMessage");
const chatMessageDisplaySanitizer = sliceFunction("sanitizeAgentStudioChatMessageForDisplay");
const processMessageSanitizer = sliceFunction("toCustomerProcessMessage");
const backendFeedbackNormalizer = sliceFunction("normalizePromptEditBackendFeedbackMessage");
const handleEditPromptBlock = sliceBetween(
  "const handleEditPrompt = async",
  "const handleSendEditAudio = async",
);
const restoreFromHistoryBlock = sliceBetween(
  "const restoreFromHistory = useCallback",
  "// ============ EDIÇÃO VIA CHAT COM STREAMING ============",
);
const sendSimulatorMessageBlock = sliceBetween(
  "const sendSimulatorMessage = async",
  "const handleSimulate = async",
);
const handleSendEditAudioBlock = sliceBetween(
  "const handleSendEditAudio = async",
  "const addGreetingExtraTextItem =",
);
const handleGreetingExtraMediaUploadBlock = sliceBetween(
  "const handleGreetingExtraMediaUpload = async",
  "const syncGreetingExtraFlow = async",
);
const handleGreetingExtraMediaUploadCatchBlock =
  handleGreetingExtraMediaUploadBlock.match(/catch \{[\s\S]*?\} finally/)?.[0] || "";
const uploadFlowItemFileBlock = sliceBetween(
  "const uploadFlowItemFile = async",
  "const handleMediaSubmit = async",
);
const uploadFlowItemFileCatchBlock = uploadFlowItemFileBlock.match(/catch \{[\s\S]*?\} finally/)?.[0] || "";
const handleSaveConfigBlock = sliceBetween(
  "const handleSaveConfig = async",
  "// ============ FUN",
);
const handleSaveConfigCatchBlock = handleSaveConfigBlock.match(/catch \{[\s\S]*?\}\s*\};/)?.[0] || "";
const handleMediaSubmitBlock = sliceBetween(
  "const handleMediaSubmit = async",
  "const getMediaIcon =",
);
const editMediaFileUploadBlock = sliceBetweenIn(
  handleMediaSubmitBlock,
  "novo arquivo selecionado",
  "metadados sem novo arquivo",
);
const editMediaFileUploadCatchBlock = editMediaFileUploadBlock.match(/catch \{[\s\S]*?return;\s*\}/)?.[0] || "";
const publicMessageBlocks = [
  editPromptSanitizer,
  publicMessageSanitizer,
  chatMessageDisplaySanitizer,
  processMessageSanitizer,
  backendFeedbackNormalizer,
].join("\n");
const webOnlyPromptVersionRestoreBlock = sliceBetweenIn(
  webOnlySource,
  "async function handlePromptVersionRestore",
  "async function handlePromptChat",
);
const localPromptVersionRestoreBlock = sliceBetweenIn(
  routesSource,
  'app.post("/api/agent/prompt-versions/:id/restore"',
  'app.get("/api/agent/prompt-chat"',
);
const uploadMediaMutationBlock = sliceBetween(
  "const uploadMediaMutation = useMutation",
  "const updateMediaMutation = useMutation",
);
const saveAgentMutationBlock = sliceBetween(
  "const updateConfigMutation = useMutation",
  "const uploadMediaMutation = useMutation",
);
const saveAgentMutationErrorBlock = sliceMutationOnError(saveAgentMutationBlock);
const createFlowMediaMutationBlock = sliceBetween(
  "const createFlowMediaMutation = useMutation",
  "// ============ EFFECTS ============",
);
const uploadMediaMutationErrorBlock = sliceMutationOnError(uploadMediaMutationBlock);
const createFlowMediaMutationErrorBlock = sliceMutationOnError(createFlowMediaMutationBlock);

test("Agent Studio does not hide Codex/provider output with local technical-word filters", () => {
  assert.match(
    editPromptSanitizer,
    /const cleaned = repairMojibake\(message\)\.trim\(\);[\s\S]*if \(!cleaned\) \{[\s\S]*return FALLBACK_EDIT_PROMPT_ERROR;[\s\S]*return cleaned;/,
    "Prompt-edit sanitizer should repair mojibake and handle empty text without semantic censorship.",
  );

  assert.match(
    publicMessageSanitizer,
    /return safe;/,
    "Public Agent Studio messages should be displayed as authored by the backend/Codex.",
  );

  assert.doesNotMatch(
    publicMessageBlocks,
    /codex|opencode|nvidia|mistral|openrouter|groq|provider|provedor|modelo|model|runtime|tool|tools|schema|supabase|jwt|row-level|row level|rls/i,
    "Client-side UI must not replace public feedback based on technical/provider keywords.",
  );

  assert.doesNotMatch(
    publicMessageSanitizer,
    /\.replace\(/,
    "Public Agent Studio messages must not be locally rewritten by regex.",
  );

  assert.match(
    chatMessageDisplaySanitizer,
    /const repaired = repairMojibake\(String\(content \|\| ""\)\);[\s\S]*if \(role === "user"\) \{[\s\S]*return repaired;[\s\S]*return repaired\.trim\(\);/,
    "Assistant chat history display should show repaired backend/Codex text and keep empty content empty.",
  );

  assert.doesNotMatch(
    chatMessageDisplaySanitizer,
    /Ajuste preparado|Confira as instrucoes|sanitizeAgentStudioPublicMessage\(/,
    "Assistant chat history display must not invent fallback text for empty backend/Codex messages.",
  );

  assert.match(
    processMessageSanitizer,
    /const cleaned = repairMojibake\(message\)\.trim\(\);[\s\S]*if \(!cleaned\) \{[\s\S]*return "Organizando o contexto do agente";[\s\S]*return sanitizeEditPromptClientMessage\(cleaned\);/,
    "Process messages should keep backend/Codex wording except for mojibake repair and empty fallback.",
  );

  assert.doesNotMatch(
    processMessageSanitizer,
    /normalized\.includes|normalize\("NFD"\)|midia|media|catalog|teste|simul|salv|aplic|regra|instruc/i,
    "Process messages must not be locally remapped by semantic progress keywords.",
  );
});

test("Agent Studio prompt-edit stream does not invent public fallback feedback", () => {
  assert.match(
    backendFeedbackNormalizer,
    /const cleaned = repairMojibake\(message\)\.trim\(\);[\s\S]*if \(!cleaned\) \{[\s\S]*return "";[\s\S]*if \(isRetryablePromptEditMessage\(cleaned\)\) \{[\s\S]*return "";[\s\S]*return cleaned;/,
    "Backend feedback normalizer should pass through only real backend/Codex text and fail closed on empty or retryable messages.",
  );

  assert.match(
    agentStudioSource,
    /const clearProcessingMessage = \(consoleMessage: string\) => \{[\s\S]*setChatMessages\(prev => prev\.filter\(msg => msg\.id !== processingMessageId\)\);[\s\S]*setEditProcessingStatus\(""\);/,
    "Prompt-edit stream should be able to remove the placeholder instead of showing local fallback copy.",
  );

  assert.match(
    agentStudioSource,
    /const updateProcessingMessageFromBackendFeedback = \([\s\S]*normalizePromptEditBackendFeedbackMessage/,
    "Prompt-edit stream should route terminal backend feedback through the fail-closed backend feedback normalizer.",
  );

  assert.match(
    agentStudioSource,
    /updateProcessingMessageFromBackendFeedback\(\s*data\.feedbackMessage,/,
    "Prompt-edit stream should display terminal feedback only when it comes from backend feedbackMessage.",
  );

  assert.doesNotMatch(
    agentStudioSource,
    /normalizeEditPromptFeedbackMessage\(data\.feedbackMessage\)\s*\|\||normalizeEditPromptFeedbackMessage\(rawErrorMessage\)/,
    "Prompt-edit stream must not replace missing backend feedback with local feedback text.",
  );

  assert.doesNotMatch(
    agentStudioSource,
    /Mudancas aplicadas|Revise a proposta e responda se deseja aplicar|Não consegui aplicar a edição agora|Não foi possível aplicar essa mudança/,
    "Prompt-edit stream must not invent success, confirmation, limit, or failure messages when backend feedback is empty.",
  );

  assert.doesNotMatch(
    handleEditPromptBlock,
    /updateProcessingMessage\("⏹️ Edição interrompida por você"|updateProcessingMessage\(friendlyMessage\)|updateProcessingMessage\(buildEditPromptErrorMessage\(error\)\)|updateProcessingMessage\(FALLBACK_EDIT_PROMPT_ERROR\)|const friendlyMessage = buildEditPromptErrorMessage\(error\)/,
    "Prompt-edit exception paths must clear the placeholder instead of displaying local fallback error copy.",
  );

  assert.match(
    handleEditPromptBlock,
    /AbortError[\s\S]*clearProcessingMessage\("Fluxo interrompido pelo usuario\."/,
    "AbortError in prompt-edit stream should clear the placeholder without public fallback text.",
  );
});

test("Agent Studio simulator errors do not invent retry fallback copy", () => {
  assert.match(
    sendSimulatorMessageBlock,
    /catch \(error: any\) \{[\s\S]*console\.error\("\[AgentStudio\] Simulator failed:", error\);[\s\S]*toast\(\{[\s\S]*title: "Erro no simulador"[\s\S]*variant: "destructive"/,
    "Simulator catch should preserve error state without producing a fake agent/test response.",
  );

  assert.doesNotMatch(
    sendSimulatorMessageBlock,
    /Não foi possível concluir o teste agora|Tente novamente em instantes|description:\s*"[^"]*"/,
    "Simulator catch must not display local fallback/retry text when the backend/Codex test fails.",
  );
});

test("Agent Studio edit-audio errors do not invent local fallback copy", () => {
  assert.match(
    handleSendEditAudioBlock,
    /catch \(error: any\) \{[\s\S]*if \(error instanceof DOMException && error\.name === "AbortError"\)[\s\S]*toast\(\{[\s\S]*title: "Erro no áudio"[\s\S]*variant: "destructive"/,
    "Edit-audio catch should preserve a technical UI error state without authoring fallback feedback.",
  );

  assert.doesNotMatch(
    handleSendEditAudioBlock,
    /buildEditPromptErrorMessage\(error\)|Falha ao gravar ou transcrever|description:\s*"[^"]*"/,
    "Edit-audio errors must not display local fallback text when upload/transcription fails.",
  );

  assert.match(
    handleSendEditAudioBlock,
    /await handleEditPrompt\(transcription,[\s\S]*mediaUrl: uploadData\.storageUrl[\s\S]*mediaType: "audio"/,
    "Successful edit-audio flow should still hand transcription and media context to Prompt Edit.",
  );
});

test("Agent Studio prompt-version restore errors stay structured without local retry copy", () => {
  assert.match(
    restoreFromHistoryBlock,
    /catch \(error: any\) \{[\s\S]*console\.error\("\[RESTORE\][\s\S]*toast\(\{[\s\S]*title: "Erro ao restaurar versão"[\s\S]*variant: "destructive"/,
    "Restore catch should preserve an error UI state without authoring fallback feedback.",
  );

  assert.doesNotMatch(
    restoreFromHistoryBlock,
    /sanitizeAgentStudioPublicMessage\(error\?\.message,\s*"Tente novamente"\)|Tente novamente|description:\s*sanitizeAgentStudioPublicMessage/,
    "Restore catch must not display local retry text when backend restore fails.",
  );

  assert.match(
    webOnlyPromptVersionRestoreBlock,
    /return sendJson\(res, 500, \{[\s\S]*success:\s*false[\s\S]*error:\s*"prompt_version_restore_failed"/,
    "Vercel restore catch should fail closed with a structured error.",
  );

  assert.match(
    localPromptVersionRestoreBlock,
    /res\.status\(500\)\.json\(\{[\s\S]*success:\s*false[\s\S]*error:\s*"prompt_version_restore_failed"/,
    "Local restore catch should fail closed with a structured error.",
  );

  assert.doesNotMatch(
    [webOnlyPromptVersionRestoreBlock, localPromptVersionRestoreBlock].join("\n"),
    /Failed to restore version|message:\s*error\?\.message|message:\s*error\.message/,
    "Restore backend catches must not forward or invent public error messages.",
  );

  assert.match(
    [webOnlyPromptVersionRestoreBlock, localPromptVersionRestoreBlock].join("\n"),
    /newPrompt[\s\S]*versionId[\s\S]*versionNumber[\s\S]*restoredFrom/,
    "Restore success response must keep the structured prompt version payload.",
  );
});

test("Agent Studio media library errors do not invent local fallback copy", () => {
  assert.match(
    uploadMediaMutationErrorBlock,
    /toast\(\{[\s\S]*title: "Erro"[\s\S]*variant: "destructive"/,
    "Media upload errors should preserve an error UI state without local fallback text.",
  );

  assert.match(
    createFlowMediaMutationErrorBlock,
    /toast\(\{[\s\S]*title: "Erro"[\s\S]*variant: "destructive"/,
    "Flow media creation errors should preserve an error UI state without local fallback text.",
  );

  assert.doesNotMatch(
    [uploadMediaMutationErrorBlock, createFlowMediaMutationErrorBlock].join("\n"),
    /sanitizeAgentStudioPublicMessage\(error\?\.message|Falha ao fazer upload\.|Falha ao criar fluxo\.|description:/,
    "Media library error toasts must not display local fallback copy.",
  );

  assert.match(
    uploadMediaMutationBlock,
    /queryClient\.invalidateQueries\(\{ queryKey: \["\/api\/agent\/media"\] \}\);[\s\S]*toast\(\{ title: "M.dia salva!"[\s\S]*closeMediaDialog\(\);/,
    "Media upload success behavior should still invalidate media and close the dialog.",
  );

  assert.match(
    createFlowMediaMutationBlock,
    /queryClient\.invalidateQueries\(\{ queryKey: \["\/api\/agent\/media"\] \}\);[\s\S]*toast\(\{ title: "Fluxo criado!"[\s\S]*closeMediaDialog\(\);/,
    "Flow media creation success behavior should still invalidate media and close the dialog.",
  );
});

test("Agent Studio edit-media upload errors do not invent local fallback copy", () => {
  assert.match(
    editMediaFileUploadCatchBlock,
    /catch \{[\s\S]*toast\(\{[\s\S]*title: "Erro"[\s\S]*variant: "destructive"[\s\S]*return;/,
    "Edit-media file replacement errors should preserve an error UI state without local fallback text.",
  );

  assert.doesNotMatch(
    editMediaFileUploadCatchBlock,
    /sanitizeAgentStudioPublicMessage\(error\?\.message|Falha ao fazer upload\.|description:/,
    "Edit-media file replacement errors must not display local fallback copy.",
  );

  assert.match(
    editMediaFileUploadBlock,
    /updateMediaMutation\.mutate\(\{[\s\S]*storageUrl: uploadData\.storageUrl[\s\S]*fileName: uploadData\.fileName[\s\S]*fileSize: uploadData\.fileSize[\s\S]*mimeType: uploadData\.mimeType/,
    "Successful edit-media file replacement should still persist uploaded file metadata.",
  );
});

test("Agent Studio opening-flow upload errors do not invent local fallback copy", () => {
  assert.match(
    handleGreetingExtraMediaUploadCatchBlock,
    /catch \{[\s\S]*toast\(\{[\s\S]*title: "Erro no upload"[\s\S]*variant: "destructive"[\s\S]*\} finally/,
    "Opening-flow media upload errors should preserve an error UI state without local fallback text.",
  );

  assert.doesNotMatch(
    handleGreetingExtraMediaUploadCatchBlock,
    /sanitizeAgentStudioPublicMessage\(error\?\.message|Nao foi possivel enviar a midia\.|description:/,
    "Opening-flow media upload errors must not display local fallback copy.",
  );

  assert.match(
    handleGreetingExtraMediaUploadBlock,
    /updateGreetingExtraFlowItem\(itemId,[\s\S]*storageUrl: uploadData\.storageUrl[\s\S]*fileName: uploadData\.fileName \|\| file\.name[\s\S]*mimeType: uploadData\.mimeType[\s\S]*caption: item\.caption \|\| file\.name[\s\S]*transcription: uploadData\.transcription/,
    "Successful opening-flow media upload should still attach uploaded media metadata to the flow item.",
  );

  assert.match(
    handleGreetingExtraMediaUploadBlock,
    /finally \{[\s\S]*setUploadingGreetingFlowItemId\(null\);[\s\S]*\}/,
    "Opening-flow media upload should still clear uploading state in finally.",
  );
});

test("Agent Studio opening-flow save errors do not invent local fallback copy", () => {
  assert.match(
    handleSaveConfigCatchBlock,
    /catch \{[\s\S]*toast\(\{[\s\S]*title: "Erro"[\s\S]*variant: "destructive"[\s\S]*\}\s*\};/,
    "Opening-flow save errors should preserve an error UI state without local fallback text.",
  );

  assert.doesNotMatch(
    handleSaveConfigCatchBlock,
    /sanitizeAgentStudioPublicMessage\(error\?\.message|Falha ao salvar o fluxo de abertura\.|description:/,
    "Opening-flow save errors must not display local fallback copy.",
  );

  assert.match(
    handleSaveConfigBlock,
    /await updateConfigMutation\.mutateAsync\(\{[\s\S]*greetingVariation[\s\S]*greetingEnabled[\s\S]*offHoursMessage/,
    "Saving config should still persist agent settings.",
  );

  assert.match(
    handleSaveConfigBlock,
    /await syncGreetingExtraFlow\(\);[\s\S]*queryClient\.invalidateQueries\(\{ queryKey: \["\/api\/agent\/media"\] \}\);[\s\S]*setGreetingExtraFlowDirty\(false\);/,
    "Saving config should still sync opening flow, invalidate media, and clear dirty state.",
  );
});

test("Agent Studio flow-item upload errors do not expose local exception messages", () => {
  assert.match(
    uploadFlowItemFileCatchBlock,
    /catch \{[\s\S]*toast\(\{[\s\S]*title: "Erro ao enviar arquivo"[\s\S]*variant: "destructive"[\s\S]*return null;[\s\S]*\} finally/,
    "Flow-item upload errors should preserve an error UI state without exposing exception text.",
  );

  assert.doesNotMatch(
    uploadFlowItemFileCatchBlock,
    /err\.message|description:/,
    "Flow-item upload errors must not expose local exception messages.",
  );

  assert.match(
    uploadFlowItemFileBlock,
    /const data = await uploadAgentMediaFileForLibrary\(file,[\s\S]*return data\?\.storageUrl \? data : null;/,
    "Successful flow-item uploads should still return uploaded data only when a storageUrl exists.",
  );

  assert.match(
    uploadFlowItemFileBlock,
    /finally \{[\s\S]*setUploadingFlowItemId\(null\);[\s\S]*\}/,
    "Flow-item upload should still clear uploading state in finally.",
  );
});

test("Agent Studio save-config errors do not invent local fallback copy", () => {
  assert.match(
    saveAgentMutationErrorBlock,
    /onError: \(error\) => \{[\s\S]*console\.error\("\[MUTATION\][\s\S]*toast\(\{[\s\S]*title: "Erro"[\s\S]*variant: "destructive"/,
    "Save-config errors should preserve an error UI state and log without local fallback text.",
  );

  assert.doesNotMatch(
    saveAgentMutationErrorBlock,
    /Falha ao salvar\.|description:/,
    "Save-config errors must not display local fallback copy.",
  );

  assert.match(
    saveAgentMutationBlock,
    /toast\(\{[\s\S]*title: "✅ Instruções salvas!"[\s\S]*description: "Nova versão criada no histórico automaticamente\."/,
    "Prompt save success toast should remain intact.",
  );

  assert.match(
    saveAgentMutationBlock,
    /toast\(\{[\s\S]*title: "✅ Salvo!"[\s\S]*description: "Configurações atualizadas\."/,
    "Config save success toast should remain intact.",
  );

  assert.match(
    saveAgentMutationBlock,
    /invalidateQueries\(\{ queryKey: \["\/api\/agent\/config"\] \}\);[\s\S]*invalidateQueries\(\{ queryKey: \["\/api\/agent\/prompt-versions"\] \}\);/,
    "Save-config success should still invalidate config and prompt-version queries.",
  );
});
