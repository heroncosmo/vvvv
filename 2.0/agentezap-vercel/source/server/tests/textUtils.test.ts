import assert from "node:assert/strict";

import { processResponsePlaceholders } from "../textUtils";

const followUpTemplates = `O segredo está em personalizar com *urgência + benefício claro*. Para cursos, estas 3 mensagens costumam ter melhor resposta no follow-up inteligente:
1. *"ESCOLA VIP FORMAÇÃO PROFISSIONAL, sua vaga na turma ESCOLA VIP FORMAÇÃO PROFISSIONAL está garantida até [data]. Depois disso, o valor volta para R$[X] ou as vagas podem esgotar."*
2. *"Vi que você parou na matrícula do [curso]. Se quiser, posso te enviar agora o link direto para concluir sem perder sua condição especial."*
3. *"Posso reservar sua vaga hoje e te explicar rapidinho como funciona a certificação e as formas de pagamento."*

Se quiser, eu também posso te entregar uma versão mais agressiva, uma mais elegante e uma mais curta para WhatsApp.`;

const preservedList = processResponsePlaceholders(followUpTemplates, "Rodrigo");
assert.equal(
  preservedList,
  followUpTemplates,
  "listas numeradas curtas não devem ser truncadas"
);
assert.match(preservedList, /3\.\s+\*"Posso reservar sua vaga hoje/i);

const longParagraph = `Rodrigo, ${"este bloco explica detalhes extras sem estrutura de lista e segue alongando a resposta para simular uma concatenação acidental. ".repeat(8)}No fim, a mensagem ainda continua sem organização clara e deve ser limitada para evitar respostas quebradas ou duplicadas.`;

const truncatedParagraph = processResponsePlaceholders(longParagraph, "Rodrigo");
assert.ok(
  truncatedParagraph.length < longParagraph.length,
  "parágrafos longos sem estrutura devem continuar protegidos pelo truncamento"
);

console.log("textUtils.test.ts ok");
