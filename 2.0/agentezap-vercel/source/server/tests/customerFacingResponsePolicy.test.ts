import assert from "node:assert/strict";

import {
  isExplicitOperationalMediaRequest,
  sanitizeCustomerFacingResponseText,
} from "../customerFacingResponsePolicy";

const leakedPromptReply = sanitizeCustomerFacingResponseText(`
1. Depois que o cliente escolhe um item, a conversa continua aberta.
2. Se o cliente mudar de assunto no meio do catalogo, responda o assunto atual.
[ENVIAR_FOTOS:CAPA_DE_CILINDRO_HULK]
Perfeito! A capa de cilindro do Hulk sem costura fica por R$ 80,00.
Me confirme se voce quer costurado ou sem costura e a quantidade.
`);

assert.equal(
  leakedPromptReply,
  "Perfeito! A capa de cilindro do Hulk sem costura fica por R$ 80,00.\nMe confirme se voce quer costurado ou sem costura e a quantidade.",
);

const leakedHeaderReply = sanitizeCustomerFacingResponseText(`
CALIBRACAO DE CONTINUIDADE OPERACIONAL E MUDANCA DE ASSUNTO - 30/03/2026
MENSAGEM_ATUAL:
manda endereco da loja
Nosso endereco da loja fisica e: Estrada da Liberdade, no 320.
`);

assert.equal(
  leakedHeaderReply,
  "Nosso endereco da loja fisica e: Estrada da Liberdade, no 320.",
);

const leakedClosingTailReply = sanitizeCustomerFacingResponseText(`
Perfeito! Vamos finalizar o seu pedido.
Total Geral: R$ 700,00

Aguarde a resposta do atendente humano para o proximo passo.
Se precisar de algo, basta perguntar!

---
*ATENDIMENTO VIA IA FINALIZADO. AGUARDA ATENDENTE HUMANO.*

**MIDIA ADICIONAL (SE APLICAVEL, USE A TAG [MEDIA:QR_CODE_PIX])**
`);

assert.equal(
  leakedClosingTailReply,
  "Perfeito! Vamos finalizar o seu pedido.\nTotal Geral: R$ 700,00",
);

const leakedRuleBasedFinalReply = sanitizeCustomerFacingResponseText(`
*ASSISTENTE VIRTUAL MFC SUBLIMACAO:*
FINAL COM BASE NAS REGRAS CITADAS*

*ASSISTENTE VIRTUAL MFC SUBLIMACAO:* Perfeito! Segue a chave Pix oficial.
`);

assert.equal(
  leakedRuleBasedFinalReply,
  "*ASSISTENTE VIRTUAL MFC SUBLIMACAO:* Perfeito! Segue a chave Pix oficial.",
);

const leakedAddressOptionsReply = sanitizeCustomerFacingResponseText(`
*ASSISTENTE VIRTUAL MFC SUBLIMACAO:*
Endereco: Estrada da Liberdade, 320.

Se precisar de ajuda para chegar, posso enviar o link ou uma foto.

---
*Opcoes para resposta do cliente:*
1. Sim, envie o link.
2. Sim, envie a foto.

*Resposta do Assistente*
`);

assert.equal(
  leakedAddressOptionsReply,
  "Endereco: Estrada da Liberdade, 320.",
);

const leakedInlineOpeningRuleReply = sanitizeCustomerFacingResponseText(`
Ola, Yuri Barbeiro! Tudo bem? rodrigo da primeira resposta e idioma esta regra tem prioridade sobre to aqui. Que otimo que voce tem interesse no plano ilimitado.
Me conta: qual a maior dor que voce enfrenta hoje no atendimento? Assim eu te mostro como o primeira resposta e idioma esta regra tem prioridade sobre to resolve isso pra voce.
`);

assert.equal(
  leakedInlineOpeningRuleReply,
  "Ola, Yuri Barbeiro! Tudo bem? Que otimo que voce tem interesse no plano ilimitado.\nMe conta: qual a maior dor que voce enfrenta hoje no atendimento? Assim eu te mostro como resolve isso pra voce.",
);

const leakedOpeningRuleHeaderReply = sanitizeCustomerFacingResponseText(`
REGRA SUPREMA DA PRIMEIRA RESPOSTA E IDIOMA
Esta regra tem prioridade sobre todo o resto do prompt, FAQ, funil antigo, valores, links e midias.
Ola, tudo bem? Me fala rapidinho: voce quer vender mais, atender melhor ou organizar leads no WhatsApp?
`);

assert.equal(
  leakedOpeningRuleHeaderReply,
  "Ola, tudo bem? Me fala rapidinho: voce quer vender mais, atender melhor ou organizar leads no WhatsApp?",
);

const leakedFormattedRulesWrapperReply = sanitizeCustomerFacingResponseText(`
formatada de acordo com as regras fornecidas: *Resposta para o Cliente*

\`\`\`
Bom dia.

Entendi, voce gostaria de marcar uma reuniao para falar sobre consorcio amanha de manha.
Para agendar, preciso de mais um detalhe: qual horario fica melhor para voce?
\`\`\`
`);

assert.equal(
  leakedFormattedRulesWrapperReply,
  "Bom dia.\n\nEntendi, voce gostaria de marcar uma reuniao para falar sobre consorcio amanha de manha.\nPara agendar, preciso de mais um detalhe: qual horario fica melhor para voce?",
);

const leakedSingleLineEstablishedRulesWrapperReply = sanitizeCustomerFacingResponseText(`
formatada de acordo com as regras estabelecidas: > *Ola, tudo bem?* Me fala sua cidade e estado para eu verificar a entrega certinho.
`);

assert.equal(
  leakedSingleLineEstablishedRulesWrapperReply,
  "Ola, tudo bem? Me fala sua cidade e estado para eu verificar a entrega certinho.",
);

const leakedBareResponseWrapperReply = sanitizeCustomerFacingResponseText(`
*Resposta*

Varia de pessoa para pessoa. Use uma pequena quantidade e aguarde cerca de 10 minutos. Qual sua cidade e estado?
`, { referenceText: "sem markdown, sem asterisco" });

assert.equal(
  leakedBareResponseWrapperReply,
  "Varia de pessoa para pessoa. Use uma pequena quantidade e aguarde cerca de 10 minutos. Qual sua cidade e estado?",
);

const leakedQuotedFinalReply = sanitizeCustomerFacingResponseText(`
*Resposta*

A pergunta aborda dois aspectos distintos, que vou atender de acordo com as regras fornecidas:
1. *Aumento de Tamanho*
2. *Cura de Ejaculacao*

*Resposta:*
"Nao prometo cura nem aumento. Pode auxiliar na firmeza, confianca e desempenho, mas varia de pessoa para pessoa. Qual sua cidade e estado?"

*Razao pela Escolha:* texto interno que nao deve ir ao cliente.
`, { referenceText: "texto comum, sem markdown" });

assert.equal(
  leakedQuotedFinalReply,
  "Nao prometo cura nem aumento. Pode auxiliar na firmeza, confianca e desempenho, mas varia de pessoa para pessoa. Qual sua cidade e estado?",
);

const plainTextRequestedReply = sanitizeCustomerFacingResponseText(`
Perfeito. Voce escolheu o kit com *2 unidades* por R$ 129,90.

Para confirmar o pedido, me envie: *Nome Completo*, *Rua e Numero*, *Bairro*, *Cidade e Estado*

(Aguarde a resposta do cliente antes de prosseguir)
`, { referenceText: "responda sem markdown, sem asterisco e sem negrito" });

assert.equal(
  plainTextRequestedReply,
  "Perfeito. Voce escolheu o kit com 2 unidades por R$ 129,90.\n\nPara confirmar o pedido, me envie: Nome Completo, Rua e Numero, Bairro, Cidade e Estado",
);

const plainTextNumberedListReply = sanitizeCustomerFacingResponseText(`
Perfeito. Voce escolheu o kit com 2 unidades, que custa R$129,90.

Para finalizar, preciso dos seguintes dados para a entrega:
1. Nome Completo
2. Rua e Numero
3. Bairro
4. Cidade e Estado
`, { referenceText: "responda sem lista, sem markdown, sem asterisco" });

assert.equal(
  plainTextNumberedListReply,
  "Perfeito. Voce escolheu o kit com 2 unidades, que custa R$129,90.\n\nPara finalizar, preciso dos seguintes dados para a entrega:\nNome Completo\nRua e Numero\nBairro\nCidade e Estado",
);

const leakedSchedulingInternalStepsReply = sanitizeCustomerFacingResponseText(`
Essa nova solicitacao parece ser para um segundo servico. Vou reiniciar o fluxo corretamente:

1. *Entender necessidade*:
Pedro, esse novo agendamento e para qual servico?

*Observacao interna*:
• Etapa atual: *1/17* (recomecando fluxo para novo servico)
• Dados anteriores sao do agendamento concluido.
• Aguardar resposta do cliente para prosseguir com a triagem.
`);

assert.equal(
  leakedSchedulingInternalStepsReply,
  "Essa nova solicitacao parece ser para um segundo servico. Vou reiniciar o fluxo corretamente:\n\nPedro, esse novo agendamento e para qual servico?",
);

const leakedAttendantObservationReply = sanitizeCustomerFacingResponseText(`
Para lhe fornecer mais detalhes especificos, preciso saber sua localizacao. Pode me informar sua cidade e estado? 😊 *Observacoes para o Atendente (nao enviar ao cliente):*
• A resposta atendeu ao pedido de mais informacoes.
• Proximo passo: solicitar cidade e estado.
`);

assert.equal(
  leakedAttendantObservationReply,
  "Para lhe fornecer mais detalhes especificos, preciso saber sua localizacao. Pode me informar sua cidade e estado? 😊",
);

const leakedToolsJsonReply = sanitizeCustomerFacingResponseText(`
Obrigado pelo retorno. Vou encerrar este atendimento por aqui.

*FIM DO REGISTRO* {
"tools": [
  {"name": "finalizar"}
]
}
`);

assert.equal(
  leakedToolsJsonReply,
  "Obrigado pelo retorno. Vou encerrar este atendimento por aqui.",
);

const leakedAuditOnlyReply = sanitizeCustomerFacingResponseText(`
• Proximo passo: solicitacao de localizacao para seguir com o fluxo de venda.
• Formato e estilo: resposta concisa, com emoji, e estrutura simples.
• Mantem o tom atraente com emojis.
`);

assert.equal(leakedAuditOnlyReply, null);

const leakedMenuWrapperReply = sanitizeCustomerFacingResponseText(`
### NOVO ATENDIMENTO
3. *Outro (especifique)*
*Lembre-se:* Sempre responda com o numero da opcao escolhida para atender de acordo com as regras.
### EXEMPLO DE COMO PROSSEGUIRA BASEADO NA OPCAO 1
`);

assert.equal(leakedMenuWrapperReply, null);

const leakedBareEnvelopeMarkersReply = sanitizeCustomerFacingResponseText(`attention_json

routing_json
assistant_response`);

assert.equal(leakedBareEnvelopeMarkersReply, null);

const leakedBracketEnvelopeMarkersReply = sanitizeCustomerFacingResponseText(`
Saida Final: [assistant_response]
[ATENCAO_HUMANA_JSON]
[ROUTING_JSON]
`);

assert.equal(leakedBracketEnvelopeMarkersReply, null);

const publicReplyBeforeEnvelopeMarkers = sanitizeCustomerFacingResponseText(`
Sim, para clinica odontologica o agente pode atender leads, tirar duvidas iniciais e ajudar no agendamento.
attention_json
routing_json
assistant_response
`);

assert.equal(
  publicReplyBeforeEnvelopeMarkers,
  "Sim, para clinica odontologica o agente pode atender leads, tirar duvidas iniciais e ajudar no agendamento.",
);

const leakedCurrentContextPriorityReply = sanitizeCustomerFacingResponseText(`
=== PRIORIDADE DO CONTEXTO ATUAL ===
O prompt/config atual desta chamada tem prioridade sobre qualquer mensagem antiga do historico.
Mensagens antigas do assistente podem ter valores, datas, horarios, links ou orientacoes desatualizadas.
Use o historico apenas para continuidade do assunto.
Nao use valores antigos como fonte autorizada.
=== FIM DA PRIORIDADE DO CONTEXTO ATUAL ===

Recebi seu briefing. Vou ajustar o atendimento para acolher pacientes e orientar alunos com clareza.
`);

assert.equal(
  leakedCurrentContextPriorityReply,
  "Recebi seu briefing. Vou ajustar o atendimento para acolher pacientes e orientar alunos com clareza.",
);

const leakedCurrentContextOnlyReply = sanitizeCustomerFacingResponseText(`
=== PRIORIDADE DO CONTEXTO ATUAL ===
O prompt/config atual desta chamada tem prioridade sobre qualquer mensagem antiga do historico.
=== FIM DA PRIORIDADE DO CONTEXTO ATUAL ===
`);

assert.equal(leakedCurrentContextOnlyReply, null);

const leakedPriorityMaxAndAttentionReply = sanitizeCustomerFacingResponseText(`
=== PRIORIDADE MAXIMA, Material de configuracao ou ajuste fino ===
Recebi o material. Vou usar isso para orientar o atendimento.

### ATENÇÃO: Vou revisar o material recebido para entender melhor o que voce precisa.
### ATENÇÃO: Vou aguardar sua resposta para prosseguir.
`);

assert.equal(
  leakedPriorityMaxAndAttentionReply,
  "Recebi o material. Vou usar isso para orientar o atendimento.",
);

const leakedPlanningAuditOnlyReply = sanitizeCustomerFacingResponseText(`
Resposta Atual: Abordou o funcionamento do atendimento e perguntou o tipo de negocio.
Proxima Acao Esperada do Cliente: Escolher uma das opcoes ou explicar a necessidade.
Proxima Acao do Agente: Se o cliente escolher vendas, seguir o fluxo comercial.
Baseado na resposta do cliente, manter o tom consultivo.

REGRAS A SEREM OBEDECIDAS NESTA RESPOSTA:
1. NAO repetir a apresentacao.
2. SIM oferecer opcoes claras.
`);

assert.equal(leakedPlanningAuditOnlyReply, null);

const leakedPlanningAuditTailReply = sanitizeCustomerFacingResponseText(`
Claro, consigo te ajudar a reduzir as respostas longas e deixar o atendimento mais direto.

Resposta Atual: Abordou o funcionamento do atendimento e perguntou o tipo de negocio.
Proxima Acao Esperada do Cliente: Escolher uma das opcoes ou explicar a necessidade.
REGRAS A SEREM OBEDECIDAS NESTA RESPOSTA:
1. NAO repetir a apresentacao.
`);

assert.equal(
  leakedPlanningAuditTailReply,
  "Claro, consigo te ajudar a reduzir as respostas longas e deixar o atendimento mais direto.",
);

const leakedHumanTodoTailReply = sanitizeCustomerFacingResponseText(`
Para finalizar, me informe a data do evento e o bairro.
<TO DO ATENDENTE HUMANO: Este cliente esta iniciando compra, aguarde as informacoes para prosseguir.>
`);

assert.equal(
  leakedHumanTodoTailReply,
  "Para finalizar, me informe a data do evento e o bairro.",
);

const leakedCorrectiveActionReply = sanitizeCustomerFacingResponseText(`
O valor do Toboga Inflavel por 1 dia fica R$350.

*Acao Corretiva*: Para manter a consistencia com o prompt atual, vamos considerar o valor como um pedido de confirmacao.
`);

assert.equal(
  leakedCorrectiveActionReply,
  "O valor do Toboga Inflavel por 1 dia fica R$350.",
);

const leakedConcreteRequestReply = sanitizeCustomerFacingResponseText(`
Boa noite, Yuri! Resposta ao Pedido Concreto (nao havia pedido explicito, apenas saudacao):
Como nao havia um pedido especifico alem da saudacao, ofereco uma abertura com um toque de curiosidade para encorajar a interacao.

Continuacao (para atender as regras de qualificacao inicial):
Seja bem-vindo, amigo! Sou a Camila. Seu atendimento e totalmente sigiloso e voce so paga quando receber.
`);

assert.equal(leakedConcreteRequestReply, "Boa noite, Yuri!");

const leakedInternalTotalFormulaReply = sanitizeCustomerFacingResponseText(`
Total Final: R$ 120,00 + R$ 30,00 = R$ 150,00
Calculo usado internamente para validar o pedido.
`);

assert.equal(leakedInternalTotalFormulaReply, null);

assert.equal(isExplicitOperationalMediaRequest("Manda o endereco da loja"), true);
assert.equal(isExplicitOperationalMediaRequest("Me manda o QR Code do Pix"), true);
assert.equal(isExplicitOperationalMediaRequest("Tem foto do produto?"), true);
assert.equal(isExplicitOperationalMediaRequest("Me manda uma imagem desse produto"), true);
assert.equal(isExplicitOperationalMediaRequest("O atendimento suporta audio e foto quando estiver configurado."), false);
assert.equal(isExplicitOperationalMediaRequest("Tem painel Hulk?"), false);

const unexpectedCjkReply = sanitizeCustomerFacingResponseText(
  "Rodrigo, nosso atendimento \u652f\u6301 audio e foto quando estiver configurado.",
);

assert.equal(
  unexpectedCjkReply,
  "Rodrigo, nosso atendimento suporta audio e foto quando estiver configurado.",
);

console.log("customerFacingResponsePolicy.test.ts ok");
