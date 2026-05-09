import "dotenv/config";
import assert from "node:assert/strict";
import { validatePromptInstructionApplication } from "../promptEditService";

const promptAntes = [
  "BLOCO INICIAL",
  "Regra ativa",
  "",
  "MARCADOR_QA_ATIVO: rodada-08",
].join("\n");

const promptComMudancaValida = [
  "BLOCO INICIAL",
  "Regra ativa",
  "",
  "MARCADOR_QA_ATIVO: rodada-10.",
].join("\n");

const promptComMudancaInvalida = [
  "BLOCO INICIAL",
  "Regra ativa ajustada",
  "",
  "MARCADOR_QA_ATIVO: rodada-08",
].join("\n");

const promptComLiteralForaDoFinal = [
  "BLOCO INICIAL",
  "Regra ativa ajustada",
  "",
  "MARCADOR_QA_ATIVO: rodada-10.",
  "OBSERVACAO FINAL",
].join("\n");

const instrucaoLiteral = [
  "Preserve regras, modulos e fluxos;",
  'apenas torne a redacao mais concisa e atualize a linha final de marcador interno para ficar exatamente assim: MARCADOR_QA_ATIVO: rodada-10.',
].join(" ");

const verificacaoValida = validatePromptInstructionApplication(
  promptAntes,
  promptComMudancaValida,
  instrucaoLiteral,
);

assert.equal(
  verificacaoValida.applied,
  true,
  "deve aceitar quando o prompt final contem o literal exigido pela instrucao",
);

const verificacaoInvalida = validatePromptInstructionApplication(
  promptAntes,
  promptComMudancaInvalida,
  instrucaoLiteral,
);

assert.equal(
  verificacaoInvalida.applied,
  false,
  "deve rejeitar quando a edicao nao contem o literal obrigatorio",
);

assert.deepEqual(
  verificacaoInvalida.missingLiteralRequirements,
  ["MARCADOR_QA_ATIVO: rodada-10."],
  "deve apontar qual literal obrigatorio ficou faltando",
);

const verificacaoLiteralForaDoFinal = validatePromptInstructionApplication(
  promptAntes,
  promptComLiteralForaDoFinal,
  instrucaoLiteral,
);

assert.equal(
  verificacaoLiteralForaDoFinal.applied,
  false,
  "deve rejeitar quando o literal existe, mas nao termina o prompt como linha final",
);

assert.equal(
  verificacaoLiteralForaDoFinal.feedbackMessage,
  "A edicao nao terminou com a linha literal obrigatoria no final do prompt.",
  "deve explicar que a linha literal precisa fechar o prompt",
);

const verificacaoSemMudanca = validatePromptInstructionApplication(
  promptAntes,
  promptAntes,
  "Deixe o texto mais objetivo.",
);

assert.equal(
  verificacaoSemMudanca.applied,
  false,
  "deve rejeitar quando o prompt final nao muda",
);

console.log("promptEditInstructionVerification.test.ts: ok");
