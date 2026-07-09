import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  applyFkSemijoiasResponsePolicy,
  fkSemijoiasPolicyTexts,
} from "../fkSemijoiasResponsePolicy";

const fkPrompt = "FRANCIELE - FK SEMIJOIAS\nVoce e a Franciele, atendente da FK Semijoias.";
const fkPromptWithQualityContext = [
  fkPrompt,
  "As pecas sao banhadas a ouro 18k e tem garantia de 1 ano no banho.",
].join("\n");
const fkOfficialAddress = "Rua Rio Parana, 12, Jardim Santo Amaro - Cambe/PR";
const greetingAction = {
  type: "send_text",
  text: fkSemijoiasPolicyTexts.greeting,
  media_name: "SAUDACAO_INFO_EXTRA",
  opening_flow_source: "greeting",
};
const videoAction = {
  type: "send_media",
  media_name: "VIDEO_SEMIJOIAS",
  media_type: "video",
  media_url: "https://example.com/video.mp4",
};
const fichaAction = {
  type: "send_media",
  media_name: "FICHA_REVENDEDORA_FK",
};

const driftOnFirstInterest = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Ola! Tenho interesse e queria mais informacoes, por favor.",
  history: [],
  responseText: "Aqui vai o catalogo digital com todas as pecas e valores! Voce pode dar uma olhada enquanto me diz qual o seu nome?",
  mediaActions: [greetingAction],
  isFirstAgentResponse: true,
});

assert.equal(driftOnFirstInterest.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(driftOnFirstInterest.mediaActions, []);
assert.deepEqual(driftOnFirstInterest.applied, ["generic_initial_interest_to_name_question"]);

const duplicateGreeting = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Tenho interesse",
  history: [],
  responseText: fkSemijoiasPolicyTexts.greeting,
  mediaActions: [greetingAction],
  isFirstAgentResponse: true,
});

assert.equal(duplicateGreeting.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(duplicateGreeting.mediaActions, []);

const nameAfterGreetingAsksFichaPermission = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Marya",
  history: [{ role: "assistant", content: fkSemijoiasPolicyTexts.greeting }],
  responseText: fkSemijoiasPolicyTexts.greeting,
  mediaActions: [greetingAction, fichaAction],
  isFirstAgentResponse: false,
});

assert.equal(nameAfterGreetingAsksFichaPermission.text, fkSemijoiasPolicyTexts.consignadoInfoReply);
assert.deepEqual(nameAfterGreetingAsksFichaPermission.mediaActions, []);
assert.deepEqual(nameAfterGreetingAsksFichaPermission.applied, ["name_answer_to_consignado_info"]);

const sellingInterestBeforeName = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Eu gostaria de pegar pra vender",
  history: [],
  responseText: "Vou te enviar agora mesmo o catalogo digital com os modelos disponiveis e a tabela de comissoes por faixa de venda.",
  mediaActions: [greetingAction],
  isFirstAgentResponse: true,
});

assert.equal(sellingInterestBeforeName.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(sellingInterestBeforeName.mediaActions, []);
assert.deepEqual(sellingInterestBeforeName.applied, ["generic_initial_interest_to_name_question"]);

const consignadoAfterAdGreetingWithoutName = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Gostaria de saber como consignar",
  history: [{ role: "assistant", content: "Bem-vinda! Em que posso ajudar voce hoje?" }],
  responseText: "Claro! Consignar e uma otima opcao. Posso te enviar a ficha de cadastro por aqui mesmo?",
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(consignadoAfterAdGreetingWithoutName.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(consignadoAfterAdGreetingWithoutName.mediaActions, []);
assert.deepEqual(consignadoAfterAdGreetingWithoutName.applied, ["consignado_before_name_to_name_question"]);

const consignadoFirstAgentResponseUserOnlyWithoutName = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "como faco para consignar?",
  history: [{ role: "user", content: "Ola! Tenho interesse e queria mais informacoes" }],
  responseText: "Para consignar, primeiro precisamos preencher a ficha de cadastro. Posso te enviar a ficha por aqui mesmo?",
  mediaActions: [greetingAction],
  isFirstAgentResponse: true,
});

assert.equal(consignadoFirstAgentResponseUserOnlyWithoutName.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(consignadoFirstAgentResponseUserOnlyWithoutName.mediaActions, []);
assert.deepEqual(consignadoFirstAgentResponseUserOnlyWithoutName.applied, ["consignado_before_name_to_name_question"]);

const consignadoAfterNameQuestionWithoutName = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Eu gostaria de ser revendedora no consignado",
  history: [{ role: "assistant", content: fkSemijoiasPolicyTexts.greeting }],
  responseText: fkSemijoiasPolicyTexts.consignadoInfoReply,
  mediaActions: [fichaAction],
  isFirstAgentResponse: false,
});

assert.equal(consignadoAfterNameQuestionWithoutName.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(consignadoAfterNameQuestionWithoutName.mediaActions, []);
assert.deepEqual(consignadoAfterNameQuestionWithoutName.applied, ["consignado_before_name_repeat_name_question"]);

const fichaConfirmationBeforeNameRepeatsNameQuestion = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Pode ser",
  history: [
    { role: "assistant", content: "Posso te enviar por aqui mesmo a ficha de cadastro?" },
  ],
  responseText: "Vou enviar a ficha agora.",
  mediaActions: [fichaAction],
  isFirstAgentResponse: false,
});

assert.equal(fichaConfirmationBeforeNameRepeatsNameQuestion.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(fichaConfirmationBeforeNameRepeatsNameQuestion.mediaActions, []);
assert.deepEqual(fichaConfirmationBeforeNameRepeatsNameQuestion.applied, ["ficha_confirmation_before_name_to_name_question"]);

const consignadoAfterNameWasGiven = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Como funciona o consignado?",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Mariana" },
  ],
  responseText: "Resposta fora de ordem",
  mediaActions: [fichaAction],
  isFirstAgentResponse: false,
});

assert.equal(consignadoAfterNameWasGiven.text, fkSemijoiasPolicyTexts.consignadoInfoReply);
assert.deepEqual(consignadoAfterNameWasGiven.mediaActions, []);
assert.deepEqual(consignadoAfterNameWasGiven.applied, ["consignado_info_reply"]);

const identityQuestionAfterNameMustNotBecomeNameAnswer = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "voce e de onde?",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Mariana" },
  ],
  responseText: "Sou a Franciele, atendente da FK Semijoias em Londrina/PR.",
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(identityQuestionAfterNameMustNotBecomeNameAnswer.text, "Sou a Franciele, atendente da FK Semijoias em Londrina/PR.");
assert.deepEqual(identityQuestionAfterNameMustNotBecomeNameAnswer.mediaActions, []);
assert.deepEqual(identityQuestionAfterNameMustNotBecomeNameAnswer.applied, []);

const addressQuestionAfterNameUsesConfiguredAddress = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "voce e de onde?",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Mariana" },
  ],
  responseText: "Mariana, qual sua cidade e estado?",
  mediaActions: [videoAction, fichaAction],
  isFirstAgentResponse: false,
  officialAddress: fkOfficialAddress,
});

assert.equal(
  addressQuestionAfterNameUsesConfiguredAddress.text,
  "Sou a Franciele, atendente da FK Semijoias. Nosso endereco e Rua Rio Parana, 12, Jardim Santo Amaro - Cambe/PR. Atendemos presencialmente Londrina e regiao."
);
assert.deepEqual(addressQuestionAfterNameUsesConfiguredAddress.mediaActions, []);
assert.deepEqual(addressQuestionAfterNameUsesConfiguredAddress.applied, ["official_address_reply"]);

const addressQuestionBeforeNameUsesConfiguredAddress = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "qual o endereco da loja?",
  history: [],
  responseText: fkSemijoiasPolicyTexts.greeting,
  mediaActions: [greetingAction],
  isFirstAgentResponse: true,
  officialAddress: fkOfficialAddress,
});

assert.match(addressQuestionBeforeNameUsesConfiguredAddress.text, /Rua Rio Parana, 12/);
assert.deepEqual(addressQuestionBeforeNameUsesConfiguredAddress.mediaActions, []);
assert.deepEqual(addressQuestionBeforeNameUsesConfiguredAddress.applied, ["official_address_reply"]);

const realVeronicaAddressQuestionUsesConfiguredAddress = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "De onde vcs são",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Bom dia" },
  ],
  responseText: "[Mensagem apagada]",
  mediaActions: [],
  isFirstAgentResponse: false,
  officialAddress: fkOfficialAddress,
});

assert.match(realVeronicaAddressQuestionUsesConfiguredAddress.text, /Rua Rio Parana, 12/);
assert.deepEqual(realVeronicaAddressQuestionUsesConfiguredAddress.mediaActions, []);
assert.deepEqual(realVeronicaAddressQuestionUsesConfiguredAddress.applied, ["official_address_reply"]);

const podeSerAfterConsignadoInfoSendsFicha = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Pode ser",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Mariana" },
    { role: "assistant", content: fkSemijoiasPolicyTexts.consignadoInfoReply },
  ],
  responseText: "Posso te enviar por aqui mesmo a ficha de cadastro?",
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(podeSerAfterConsignadoInfoSendsFicha.text, "");
assert.deepEqual(podeSerAfterConsignadoInfoSendsFicha.mediaActions, [fichaAction]);
assert.deepEqual(podeSerAfterConsignadoInfoSendsFicha.applied, ["send_ficha_after_confirmation"]);

const simSimAfterConsignadoOfferExplainsFlow = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Sim Sim",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Nicolly" },
    { role: "assistant", content: "Prazer, Nicolly! Eu sou a Franciele. Posso te explicar como funcionam as nossas maletas no consignado?" },
  ],
  responseText: "Pode, por favor, fornecer mais detalhes ou especificar sobre o que Sim Sim se refere?",
  mediaActions: [videoAction, fichaAction],
  isFirstAgentResponse: false,
});

assert.equal(simSimAfterConsignadoOfferExplainsFlow.text, fkSemijoiasPolicyTexts.consignadoInfoReply);
assert.deepEqual(simSimAfterConsignadoOfferExplainsFlow.mediaActions, []);
assert.deepEqual(simSimAfterConsignadoOfferExplainsFlow.applied, ["short_affirmative_after_consignado_offer"]);

const podeExplicarAfterConsignadoOfferExplainsFlow = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "pode explicar",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Nicolly" },
    { role: "assistant", content: "Prazer, Nicolly! Eu sou a Franciele. Posso te explicar como funcionam as nossas maletas no consignado?" },
  ],
  responseText: "Claro, me diga sobre qual assunto.",
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(podeExplicarAfterConsignadoOfferExplainsFlow.text, fkSemijoiasPolicyTexts.consignadoInfoReply);
assert.deepEqual(podeExplicarAfterConsignadoOfferExplainsFlow.mediaActions, []);
assert.deepEqual(podeExplicarAfterConsignadoOfferExplainsFlow.applied, ["short_affirmative_after_consignado_offer"]);

const podeExplicarWithLaughAfterConsignadoOfferExplainsFlow = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Uai q pode explicar kkkkk",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Nicolly" },
    { role: "assistant", content: "Prazer, Nicolly! Eu sou a Franciele. Posso te explicar como funcionam as nossas maletas no consignado?" },
  ],
  responseText: "Lamento, mas como assistente read-only, nao posso atender por WhatsApp.",
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(podeExplicarWithLaughAfterConsignadoOfferExplainsFlow.text, fkSemijoiasPolicyTexts.consignadoInfoReply);
assert.deepEqual(podeExplicarWithLaughAfterConsignadoOfferExplainsFlow.mediaActions, []);
assert.deepEqual(podeExplicarWithLaughAfterConsignadoOfferExplainsFlow.applied, ["short_affirmative_after_consignado_offer"]);

const explicitCatalog = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Tem catalogo digital com as pecas e valores?",
  history: [],
  responseText: fkSemijoiasPolicyTexts.catalogFallback,
  mediaActions: [greetingAction],
  isFirstAgentResponse: true,
});

assert.equal(explicitCatalog.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(explicitCatalog.mediaActions, []);
assert.deepEqual(explicitCatalog.applied, ["catalog_request_before_name_to_name_question", "clear_media_before_name"]);

const explicitCatalogDrift = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Tem preco das pecas?",
  history: [],
  responseText: "Aqui vai o catalogo digital com todas as pecas e valores!",
  mediaActions: [greetingAction],
  isFirstAgentResponse: true,
});

assert.equal(explicitCatalogDrift.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(explicitCatalogDrift.mediaActions, []);
assert.deepEqual(explicitCatalogDrift.applied, ["catalog_request_before_name_to_name_question", "clear_media_before_name"]);

const explicitCatalogAfterName = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Tem catalogo digital com as pecas e valores?",
  history: [{ role: "assistant", content: fkSemijoiasPolicyTexts.greeting }],
  responseText: "Aqui vai o catalogo digital com todas as pecas e valores!",
  mediaActions: [greetingAction, videoAction],
  isFirstAgentResponse: false,
});

assert.equal(explicitCatalogAfterName.text, fkSemijoiasPolicyTexts.videoReply);
assert.deepEqual(explicitCatalogAfterName.mediaActions, [videoAction]);
assert.deepEqual(explicitCatalogAfterName.applied, [
  "catalog_request_video",
  "ensure_video_media_after_catalog_request",
]);

const catalogFallbackAfterNameWithoutCatalogPromise = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Tem catalogo digital com as pecas e valores?",
  history: [{ role: "assistant", content: fkSemijoiasPolicyTexts.greeting }],
  responseText: "Essa informacao eu nao tenho aqui comigo, mas vou verificar com o setor.",
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(catalogFallbackAfterNameWithoutCatalogPromise.text, fkSemijoiasPolicyTexts.videoReply);
assert.deepEqual(catalogFallbackAfterNameWithoutCatalogPromise.mediaActions, [
  { type: "send_media", media_name: "VIDEO_SEMIJOIAS" },
]);
assert.deepEqual(catalogFallbackAfterNameWithoutCatalogPromise.applied, [
  "catalog_request_video",
  "ensure_video_media_after_catalog_request",
]);

const realVeronicaBusinessValueQuestionDoesNotSendVideoOnly = applyFkSemijoiasResponsePolicy({
  prompt: fkPromptWithQualityContext,
  message: "Ah, então, deixa eu te fazer uma pergunta, mas daí como que você passa? Valor, se vocês deixam aqui pra mim que eu sou de apucarana? Eu tenho vontade de revender e tem que ver o valor também, né?",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Bom dia" },
    { role: "user", content: "De onde vcs são" },
    { role: "assistant", content: "Sou a Franciele, atendente da FK Semijoias. Nosso endereco e Rua Rio Parana, 12, Jardim Santo Amaro - Cambe/PR. Atendemos presencialmente Londrina e regiao." },
  ],
  responseText: fkSemijoiasPolicyTexts.videoReply,
  mediaActions: [videoAction],
  isFirstAgentResponse: false,
});

assert.equal(realVeronicaBusinessValueQuestionDoesNotSendVideoOnly.text, fkSemijoiasPolicyTexts.consignadoInfoReply);
assert.deepEqual(realVeronicaBusinessValueQuestionDoesNotSendVideoOnly.mediaActions, []);
assert.deepEqual(realVeronicaBusinessValueQuestionDoesNotSendVideoOnly.applied, ["business_value_no_video"]);

const realVeronicaWarrantyAfterCatalogAnswersContextWithoutRepeatingVideo = applyFkSemijoiasResponsePolicy({
  prompt: fkPromptWithQualityContext,
  message: "Tá assim, eu vi aqui, né? E são boas as peças mais deixe pra eu falar. Garante e essas coisas, como que é?",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Ah, então, deixa eu te fazer uma pergunta, mas daí como que você passa? Valor" },
    { role: "assistant", content: fkSemijoiasPolicyTexts.videoReply },
    { role: "assistant", content: "*Video*" },
  ],
  responseText: "*Video*",
  mediaActions: [videoAction],
  isFirstAgentResponse: false,
});

assert.equal(
  realVeronicaWarrantyAfterCatalogAnswersContextWithoutRepeatingVideo.text,
  "As pecas sao banhadas a ouro 18k e tem garantia de 1 ano no banho."
);
assert.deepEqual(realVeronicaWarrantyAfterCatalogAnswersContextWithoutRepeatingVideo.mediaActions, []);
assert.deepEqual(realVeronicaWarrantyAfterCatalogAnswersContextWithoutRepeatingVideo.applied, ["warranty_quality_answer_from_context"]);

const warrantyBeforeCatalogSendsCatalogWithContext = applyFkSemijoiasResponsePolicy({
  prompt: fkPromptWithQualityContext,
  message: "As pecas tem garantia? Sao banhadas a ouro?",
  history: [{ role: "assistant", content: fkSemijoiasPolicyTexts.greeting }],
  responseText: fkSemijoiasPolicyTexts.videoReply,
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(
  warrantyBeforeCatalogSendsCatalogWithContext.text,
  "Vou te enviar o catalogo das pecas.\n\nAs pecas sao banhadas a ouro 18k e tem garantia de 1 ano no banho."
);
assert.deepEqual(warrantyBeforeCatalogSendsCatalogWithContext.mediaActions, [
  { type: "send_media", media_name: "VIDEO_SEMIJOIAS" },
]);
assert.deepEqual(warrantyBeforeCatalogSendsCatalogWithContext.applied, [
  "warranty_quality_answer_from_context",
  "ensure_video_media_after_warranty_quality",
]);

const commissionTableAfterName = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Antes, me explica a comissao por tabela",
  history: [{ role: "assistant", content: fkSemijoiasPolicyTexts.greeting }],
  responseText: "Vou te enviar um video com as pecas para voce conferir!",
  mediaActions: [videoAction],
  isFirstAgentResponse: false,
});

assert.equal(
  commissionTableAfterName.text,
  `${fkSemijoiasPolicyTexts.commissionTableReply}\n\n${fkSemijoiasPolicyTexts.fichaConsentReply}`
);
assert.deepEqual(commissionTableAfterName.mediaActions, []);
assert.deepEqual(commissionTableAfterName.applied, ["commission_table_no_video"]);

const commissionTableFirstMessage = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Como funciona a comissao?",
  history: [],
  responseText: "Ola, qual o seu nome?",
  mediaActions: [greetingAction, videoAction],
  isFirstAgentResponse: true,
});

assert.equal(
  commissionTableFirstMessage.text,
  `${fkSemijoiasPolicyTexts.commissionTableReply}\n\n${fkSemijoiasPolicyTexts.fichaConsentReply}`
);
assert.deepEqual(commissionTableFirstMessage.mediaActions, []);
assert.deepEqual(commissionTableFirstMessage.applied, ["commission_table_no_video"]);

const commissionTableDirectQuestion = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Qual a comissao?",
  history: [],
  responseText: fkSemijoiasPolicyTexts.greeting,
  mediaActions: [greetingAction],
  isFirstAgentResponse: true,
});

assert.equal(
  commissionTableDirectQuestion.text,
  `${fkSemijoiasPolicyTexts.commissionTableReply}\n\n${fkSemijoiasPolicyTexts.fichaConsentReply}`
);
assert.deepEqual(commissionTableDirectQuestion.mediaActions, []);
assert.deepEqual(commissionTableDirectQuestion.applied, ["commission_table_no_video"]);

const earningsQuestion = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Quanto eu ganho vendendo?",
  history: [],
  responseText: fkSemijoiasPolicyTexts.greeting,
  mediaActions: [greetingAction],
  isFirstAgentResponse: true,
});

assert.equal(
  earningsQuestion.text,
  `${fkSemijoiasPolicyTexts.commissionTableReply}\n\n${fkSemijoiasPolicyTexts.fichaConsentReply}`
);
assert.deepEqual(earningsQuestion.mediaActions, []);
assert.deepEqual(earningsQuestion.applied, ["commission_table_no_video"]);

const productBeforeName = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Voce tem o brinco pendurado coracao bolha inox codigo 238557? Quero um par.",
  history: [],
  responseText: "Vou te enviar um video com as pecas para voce conferir!",
  mediaActions: [greetingAction, videoAction],
  isFirstAgentResponse: true,
});

assert.equal(productBeforeName.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(productBeforeName.mediaActions, []);
assert.deepEqual(productBeforeName.applied, ["specific_request_before_name_to_name_question", "clear_media_before_name"]);

const cpfBeforeName = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Meu CPF e 12345678900",
  history: [],
  responseText: "Muito obrigado! Agora preciso dos seguintes dados para completar seu cadastro.",
  mediaActions: [greetingAction],
  isFirstAgentResponse: true,
});

assert.equal(cpfBeforeName.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(cpfBeforeName.mediaActions, []);
assert.deepEqual(cpfBeforeName.applied, ["specific_request_before_name_to_name_question", "clear_media_before_name"]);

const firstResponseCpfList = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Quais dados precisa?",
  history: [],
  responseText: "Para enviar a ficha de cadastro, preciso de Nome completo e CPF.",
  mediaActions: [fichaAction],
  isFirstAgentResponse: true,
});

assert.equal(firstResponseCpfList.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(firstResponseCpfList.mediaActions, []);
assert.deepEqual(firstResponseCpfList.applied, ["first_response_ficha_to_name_question"]);

const cpfAfterNameRequiresConsent = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Pode mandar CPF por aqui?",
  history: [{ role: "assistant", content: fkSemijoiasPolicyTexts.greeting }],
  responseText: "Pode me enviar seu CPF para o cadastro.",
  mediaActions: [fichaAction, videoAction],
  isFirstAgentResponse: false,
});

assert.equal(cpfAfterNameRequiresConsent.text, fkSemijoiasPolicyTexts.fichaConsentReply);
assert.deepEqual(cpfAfterNameRequiresConsent.mediaActions, []);
assert.deepEqual(cpfAfterNameRequiresConsent.applied, ["ficha_requires_consent"]);

const productAfterName = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Tem esse brinco 238557?",
  history: [{ role: "assistant", content: fkSemijoiasPolicyTexts.greeting }],
  responseText: "Vou te enviar um video com as pecas para voce conferir!",
  mediaActions: [videoAction],
  isFirstAgentResponse: false,
});

assert.equal(productAfterName.text, fkSemijoiasPolicyTexts.videoReply);
assert.deepEqual(productAfterName.mediaActions, [videoAction]);
assert.deepEqual(productAfterName.applied, [
  "product_or_video_request_video",
]);

const registrationDataAfterFicha = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: [
    "Nome completo: Maria Silva",
    "CPF: 12345678900",
    "Data de nascimento: 10/10/1990",
    "Endereco: Rua Teste 123",
    "Bairro: Centro",
    "CEP: 86000000",
    "E-mail: maria@example.com",
    "Telefone: 43999999999",
    "Trabalha CLT: sim",
    "Referencia 1: Ana telefone 43988888888",
    "Referencia 2: Joao telefone 43977777777",
  ].join("\n"),
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "assistant", content: "REVENDEDORA FK\nNome completo:\nCPF:\nReferencia 1:\nTelefone:" },
  ],
  responseText: "Vou te enviar um video com as pecas para voce conferir!",
  mediaActions: [videoAction],
  isFirstAgentResponse: false,
});

assert.equal(registrationDataAfterFicha.text, fkSemijoiasPolicyTexts.registrationReceivedReply);
assert.deepEqual(registrationDataAfterFicha.mediaActions, []);
assert.deepEqual(registrationDataAfterFicha.applied, ["registration_data_no_video_guard"]);

const partialPhoneAfterFicha = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Meu telefone e 43988652526",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "assistant", content: "REVENDEDORA FK\nNome completo:\nCPF:\nTelefone:" },
  ],
  responseText: fkSemijoiasPolicyTexts.registrationReceivedReply,
  mediaActions: [videoAction],
  isFirstAgentResponse: false,
});

assert.match(partialPhoneAfterFicha.text, /Ainda falta completar a ficha/);
assert.doesNotMatch(partialPhoneAfterFicha.text, /Muito obrigado/);
assert.deepEqual(partialPhoneAfterFicha.mediaActions, []);
assert.deepEqual(partialPhoneAfterFicha.applied, ["registration_data_missing_fields_guard"]);

const customerAddressAfterFichaIsNotBusinessAddress = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Endereco: Rua Teste 123, Bairro Centro",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "assistant", content: "REVENDEDORA FK\nNome completo:\nCPF:\nEndereco:" },
  ],
  responseText: "Pode preencher os dados da ficha por aqui. Se algum campo ficar faltando, eu te aviso.",
  mediaActions: [videoAction],
  isFirstAgentResponse: false,
  officialAddress: fkOfficialAddress,
});

assert.match(customerAddressAfterFichaIsNotBusinessAddress.text, /Ainda falta completar a ficha/);
assert.doesNotMatch(customerAddressAfterFichaIsNotBusinessAddress.text, /Rua Rio Parana/);
assert.deepEqual(customerAddressAfterFichaIsNotBusinessAddress.mediaActions, []);
assert.deepEqual(customerAddressAfterFichaIsNotBusinessAddress.applied, ["partial_registration_missing_fields_guard"]);

const incompleteFichaDoesNotThank = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: [
    "Nome completo: Vilma de Souza",
    "CPF: 12345678910",
    "Data de nascimento: 02/04/1990",
    "Endereco: Rua A 80",
    "Bairro: Jardim Primavera",
    "CEP: 86086370",
    "E-mail: vilma@example.com",
    "Telefone: 43988887777",
    "Possui emprego formal CLT: Sim",
    "Referencia 1: Victor telefone 43984528474",
  ].join("\n"),
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "assistant", content: "REVENDEDORA FK\nNome completo:\nCPF:\nReferencia 1:" },
  ],
  responseText: fkSemijoiasPolicyTexts.registrationReceivedReply,
  mediaActions: [videoAction],
  isFirstAgentResponse: false,
});

assert.match(incompleteFichaDoesNotThank.text, /referencia 2 com telefone/);
assert.doesNotMatch(incompleteFichaDoesNotThank.text, /Muito obrigado/);
assert.deepEqual(incompleteFichaDoesNotThank.mediaActions, []);
assert.deepEqual(incompleteFichaDoesNotThank.applied, ["registration_data_missing_fields_guard"]);

const completeFichaMustNotAskFichaAgain = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: `Aqui está a ficha de cadastro, é rapidinho!

REVENDEDORA FK
Nome completo: Maria Teste
CPF: 123.456.789-00
Data de nascimento: 02/04/1990
Endereço: Rua Teste 80
Bairro: Jardim Primavera
CEP: 86086370
E-mail: maria@example.com
Telefone: 43988652526
Tem emprego formal (CLT)?: sim
Referência 1:
Nome: Victor
Telefone: 43984528474
Referência 2:
Nome: Nayara
Telefone: 43991565393`,
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "assistant", content: "Aqui está a ficha de cadastro, é rapidinho!\nNome completo:\nCPF:" },
  ],
  responseText: "Pode preencher os dados da ficha por aqui. Se algum campo ficar faltando, eu te aviso.",
  mediaActions: [fichaAction, videoAction],
  isFirstAgentResponse: false,
});

assert.equal(completeFichaMustNotAskFichaAgain.text, fkSemijoiasPolicyTexts.registrationReceivedReply);
assert.deepEqual(completeFichaMustNotAskFichaAgain.mediaActions, []);
assert.deepEqual(completeFichaMustNotAskFichaAgain.applied, ["registration_data_no_video_guard"]);

const incompleteFichaStillAsksSpecificMissingField = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: `REVENDEDORA FK
Nome completo: Elaine Teste
CPF: 007.751.479-31
Data de nascimento: 02/05/1981
Endereço: Rua dos Bandeirantes 253
Bairro: Jardim São Paulo
CEP: 86400000
E-mail: elaine@example.com
Telefone: 43998653928
Tem emprego formal (CLT)?: funcionária pública
Referência 1:
Nome: Frederico
Telefone:
Referência 2:
Nome: João
Telefone:`,
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "assistant", content: "Aqui está a ficha de cadastro, é rapidinho!\nNome completo:\nCPF:" },
  ],
  responseText: "Preciso dos números de telefone das referências para concluir seu cadastro. Pode me enviar?",
  mediaActions: [videoAction],
  isFirstAgentResponse: false,
});

assert.equal(
  incompleteFichaStillAsksSpecificMissingField.text,
  "Preciso dos números de telefone das referências para concluir seu cadastro. Pode me enviar?"
);
assert.deepEqual(incompleteFichaStillAsksSpecificMissingField.mediaActions, []);
assert.deepEqual(incompleteFichaStillAsksSpecificMissingField.applied, ["registration_data_no_video_guard"]);

const fichaFollowupAfterCompleteData = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Qual ficha?",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    {
      role: "user",
      content: "REVENDEDORA FK Nome completo: Maria Teste CPF: 12345678900 data de nascimento 02041990 endereço Rua Teste bairro Centro CEP 86000000 email maria@example.com telefone 43988652526 CLT sim referencia Victor telefone 43984528474 referencia Nayara telefone 43991565393",
    },
    { role: "assistant", content: "Pode preencher os dados da ficha por aqui. Se algum campo ficar faltando, eu te aviso." },
  ],
  responseText: "Posso te enviar a ficha de cadastro por aqui mesmo?",
  mediaActions: [fichaAction],
  isFirstAgentResponse: false,
});

assert.equal(fichaFollowupAfterCompleteData.text, fkSemijoiasPolicyTexts.registrationReceivedReply);
assert.deepEqual(fichaFollowupAfterCompleteData.mediaActions, []);
assert.deepEqual(fichaFollowupAfterCompleteData.applied, ["registration_data_history_followup_ack"]);

const fragmentedRegistrationHistoryMustNotRestartName = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Minha filha",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "assistant", content: "Aqui esta a ficha de cadastro para revendedora FK.\nNome completo:\nCPF:\nReferencia 1:" },
    { role: "user", content: "Nome completo: Marya" },
    { role: "user", content: "CPF 12345678900" },
    { role: "user", content: "Nascimento 10 10 1990" },
    { role: "user", content: "Rua Teste 123" },
    { role: "user", content: "Bairro Centro CEP 86000000" },
    { role: "user", content: "marya@hotmail.com" },
    { role: "user", content: "43999563146" },
    { role: "user", content: "Sim, trabalho CLT" },
    { role: "user", content: "Referencia Ana 43988887777" },
    { role: "user", content: "Referencia Bia 43977776666" },
  ],
  responseText: "Me diga seu nome para eu continuar, por favor.",
  mediaActions: [fichaAction, videoAction],
  isFirstAgentResponse: false,
});

assert.equal(fragmentedRegistrationHistoryMustNotRestartName.text, fkSemijoiasPolicyTexts.registrationReceivedReply);
assert.deepEqual(fragmentedRegistrationHistoryMustNotRestartName.mediaActions, []);
assert.deepEqual(fragmentedRegistrationHistoryMustNotRestartName.applied, ["fragmented_registration_history_ack"]);

const fichaAfterOffer = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "sim",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Mariana" },
    { role: "assistant", content: "Posso te enviar por aqui mesmo a ficha de cadastro?" },
  ],
  responseText: "Pode preencher os dados da ficha por aqui. Se algum campo ficar faltando, eu te aviso.",
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(fichaAfterOffer.text, "");
assert.deepEqual(fichaAfterOffer.mediaActions, [fichaAction]);
assert.deepEqual(fichaAfterOffer.applied, ["send_ficha_after_confirmation"]);

const fichaAfterOfferPodeMandar = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Pode mandar",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Mariana" },
    { role: "assistant", content: "Posso te enviar por aqui mesmo a ficha de cadastro?" },
  ],
  responseText: "Posso te enviar por aqui mesmo a ficha de cadastro?",
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(fichaAfterOfferPodeMandar.text, "");
assert.deepEqual(fichaAfterOfferPodeMandar.mediaActions, [fichaAction]);
assert.deepEqual(fichaAfterOfferPodeMandar.applied, ["send_ficha_after_confirmation"]);

const fichaAfterJeanneExactSimPodeFlow = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Sim pode",
  history: [
    { role: "user", content: "Ola! Tenho interesse e queria mais informacoes, por favor." },
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Jeanne" },
    { role: "assistant", content: "Prazer, Jeanne! Eu me chamo Franciele. Posso te explicar como funcionam as nossas maletas no consignado?" },
    { role: "user", content: "Sim" },
    { role: "assistant", content: fkSemijoiasPolicyTexts.consignadoInfoReply },
  ],
  responseText: "Posso te enviar a ficha de cadastro por aqui para avaliarmos sua entrada como revendedora FK?",
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(fichaAfterJeanneExactSimPodeFlow.text, "");
assert.deepEqual(fichaAfterJeanneExactSimPodeFlow.mediaActions, [fichaAction]);
assert.deepEqual(fichaAfterJeanneExactSimPodeFlow.applied, ["send_ficha_after_confirmation"]);

const fichaAfterRepeatedConsentSimPode = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Sim pode",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Jeanne" },
    { role: "assistant", content: fkSemijoiasPolicyTexts.consignadoInfoReply },
    { role: "assistant", content: "Posso te enviar a ficha de cadastro por aqui para avaliarmos sua entrada como revendedora FK?" },
  ],
  responseText: "Pode preencher os dados da ficha por aqui. Se algum campo ficar faltando, eu te aviso.",
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(fichaAfterRepeatedConsentSimPode.text, "");
assert.deepEqual(fichaAfterRepeatedConsentSimPode.mediaActions, [fichaAction]);
assert.deepEqual(fichaAfterRepeatedConsentSimPode.applied, ["send_ficha_after_confirmation"]);

const otherTenant = applyFkSemijoiasResponsePolicy({
  prompt: "Atendente de outra loja",
  message: "Tenho interesse",
  history: [],
  responseText: "Aqui vai o catalogo digital com todas as pecas e valores!",
  mediaActions: [greetingAction],
  isFirstAgentResponse: true,
});

assert.equal(otherTenant.text, "Aqui vai o catalogo digital com todas as pecas e valores!");
assert.deepEqual(otherTenant.mediaActions, [greetingAction]);
assert.deepEqual(otherTenant.applied, []);

const repairedOpeningCatalogText = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Ola! Tenho interesse e queria mais informacoes, por favor.",
  history: [],
  responseText: "Enviei nosso catalogo completo e a tabela de precos por aqui! Da uma olhada nas fotos e me diz se tem alguma duvida.",
  mediaActions: [],
  isFirstAgentResponse: true,
});

assert.equal(repairedOpeningCatalogText.text, fkSemijoiasPolicyTexts.greeting);
assert.deepEqual(repairedOpeningCatalogText.mediaActions, []);
assert.deepEqual(repairedOpeningCatalogText.applied, ["generic_initial_interest_to_name_question"]);

const catalogDriftAfterName = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Obrigado",
  history: [{ role: "assistant", content: fkSemijoiasPolicyTexts.greeting }],
  responseText: "Enviei nosso catalogo completo e a tabela de precos por aqui!",
  mediaActions: [],
  isFirstAgentResponse: false,
});

assert.equal(catalogDriftAfterName.text, fkSemijoiasPolicyTexts.catalogFallback);
assert.deepEqual(catalogDriftAfterName.mediaActions, []);
assert.deepEqual(catalogDriftAfterName.applied, ["catalog_drift_fallback"]);

const fichaAlreadySent = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "sim",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "assistant", content: "Aqui esta a ficha de cadastro para revendedora FK.\nNome completo:\nCPF:" },
  ],
  responseText: "Aqui esta a ficha de cadastro para revendedora FK.\nNome completo:\nCPF:",
  mediaActions: [{ type: "send_media", media_name: "FICHA_REVENDEDORA_FK" }],
  isFirstAgentResponse: false,
});

assert.equal(fichaAlreadySent.text, fkSemijoiasPolicyTexts.fichaAlreadySentReply);
assert.deepEqual(fichaAlreadySent.mediaActions, []);
assert.deepEqual(fichaAlreadySent.applied, ["drop_duplicate_ficha_after_confirmation"]);

const jeanneFragmentedFichaMustUseHistory = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Cidade nova bairro",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Jeanne" },
    { role: "assistant", content: fkSemijoiasPolicyTexts.consignadoInfoReply },
    { role: "assistant", content: "Aqui esta a ficha de cadastro para revendedora FK.\nNome completo:\nCPF:\nData de nascimento:\nEndereco:\nBairro:\nCEP:\nE-mail:\nTelefone:\nTem emprego formal (CLT)?:\nReferencia 1:\nTelefone:\nReferencia 2:\nTelefone:" },
    { role: "user", content: "Jeanne aparecida de souza haje" },
    { role: "user", content: "65978978972" },
    { role: "user", content: "02 07 1973" },
    { role: "user", content: "Rua dos pica paus 604" },
    { role: "user", content: "87704 290" },
    { role: "user", content: "Nucleo habita cional  aero porto" },
    { role: "user", content: "jeanne@example.com" },
    { role: "user", content: "42 9864 1849" },
    { role: "user", content: "Sou aposentada" },
  ],
  responseText: "Preciso de nome completo, CPF, data de nascimento, endereco, bairro, CEP, email, telefone, CLT e referencias.",
  mediaActions: [fichaAction, videoAction],
  isFirstAgentResponse: false,
});

assert.match(jeanneFragmentedFichaMustUseHistory.text, /Ainda falta completar a ficha/);
assert.doesNotMatch(jeanneFragmentedFichaMustUseHistory.text, /nome completo|CPF|data de nascimento|endereco|bairro|CEP|e-mail|emprego formal\/CLT/);
assert.match(jeanneFragmentedFichaMustUseHistory.text, /referencia 1 com telefone/);
assert.deepEqual(jeanneFragmentedFichaMustUseHistory.mediaActions, []);
assert.deepEqual(jeanneFragmentedFichaMustUseHistory.applied, ["partial_registration_missing_fields_guard"]);

const mariceliaFragmentedFichaMustNotRestartAllFields = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "43 999 14 83 47 telefone fixo 43 3312 3472",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Maricelia" },
    { role: "assistant", content: fkSemijoiasPolicyTexts.consignadoInfoReply },
    { role: "assistant", content: "Aqui esta a ficha de cadastro para revendedora FK.\nNome completo:\nCPF:\nData de nascimento:\nEndereco:\nBairro:\nCEP:\nE-mail:\nTelefone:\nTem emprego formal (CLT)?:\nReferencia 1:\nTelefone:\nReferencia 2:\nTelefone:" },
    { role: "user", content: "Maricelia Santos da Silva" },
    { role: "user", content: "70141177934" },
    { role: "user", content: "22/02/1966" },
    { role: "user", content: "Avenida Itarare 1003" },
    { role: "user", content: "Jardim vale verde" },
    { role: "user", content: "maricelia@example.com" },
    { role: "user", content: "Sou aposentada" },
    { role: "user", content: "Danilo Betese 43 98826 7995" },
    { role: "user", content: "Ana Alice 43 99781 1765" },
  ],
  responseText: "Por favor, envie nome completo, CPF, data de nascimento, endereco, bairro, CEP, email, telefone, CLT e referencias.",
  mediaActions: [fichaAction, videoAction],
  isFirstAgentResponse: false,
});

assert.match(mariceliaFragmentedFichaMustNotRestartAllFields.text, /Ainda falta completar a ficha/);
assert.doesNotMatch(mariceliaFragmentedFichaMustNotRestartAllFields.text, /nome completo|CPF|data de nascimento|endereco|bairro|e-mail|emprego formal\/CLT|referencia 1 com telefone|referencia 2 com telefone/);
assert.match(mariceliaFragmentedFichaMustNotRestartAllFields.text, /CEP/);
assert.deepEqual(mariceliaFragmentedFichaMustNotRestartAllFields.mediaActions, []);
assert.deepEqual(mariceliaFragmentedFichaMustNotRestartAllFields.applied, ["partial_registration_missing_fields_guard"]);

const postRegistrationTimelineQuestionDoesNotRepeatThanks = applyFkSemijoiasResponsePolicy({
  prompt: fkPrompt,
  message: "Oi demora pra eles entrar em contato?",
  history: [
    { role: "assistant", content: fkSemijoiasPolicyTexts.greeting },
    { role: "user", content: "Patricia de Jesus" },
    { role: "assistant", content: fkSemijoiasPolicyTexts.consignadoInfoReply },
    { role: "assistant", content: "Aqui esta a ficha de cadastro para revendedora FK.\nNome completo:\nCPF:\nData de nascimento:\nEndereco:\nBairro:\nCEP:\nE-mail:\nTelefone:\nTem emprego formal (CLT)?:\nReferencia 1:\nTelefone:\nReferencia 2:\nTelefone:" },
    {
      role: "user",
      content: [
        "Patricia de Jesus",
        "12345678901",
        "10/02/1990",
        "Rua das Flores 100",
        "Centro",
        "86000000",
        "patricia@example.com",
        "43 99999 9999",
        "Sim, CLT",
        "Daniel 43 98888 7777",
        "Germano 43 97777 6666",
      ].join("\n"),
    },
    { role: "assistant", content: fkSemijoiasPolicyTexts.registrationReceivedReply },
    { role: "user", content: "Blz entao obrigada" },
  ],
  responseText: fkSemijoiasPolicyTexts.registrationReceivedReply,
  mediaActions: [fichaAction, videoAction],
  isFirstAgentResponse: false,
});

assert.equal(postRegistrationTimelineQuestionDoesNotRepeatThanks.text, fkSemijoiasPolicyTexts.postRegistrationTimelineReply);
assert.doesNotMatch(postRegistrationTimelineQuestionDoesNotRepeatThanks.text, /Muito obrigado/);
assert.deepEqual(postRegistrationTimelineQuestionDoesNotRepeatThanks.mediaActions, []);
assert.deepEqual(postRegistrationTimelineQuestionDoesNotRepeatThanks.applied, ["registration_timeline_followup_reply"]);

const aiAgentSource = readFileSync(path.join(process.cwd(), "server", "aiAgent.ts"), "utf8");
assert.match(aiAgentSource, /applyFkSemijoiasResponsePolicy/);
assert.match(aiAgentSource, /fkSemijoiasPolicyRuntime/);
assert.match(aiAgentSource, /fkSemijoiasPolicyRuntimeAfterOpeningRepair/);
assert.match(aiAgentSource, /repairFirstConcreteOpeningReply[\s\S]+fkSemijoiasPolicyRuntimeAfterOpeningRepair/);

console.log("fkSemijoiasResponsePolicy.test.ts ok");
