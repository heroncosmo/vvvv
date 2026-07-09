import assert from "node:assert/strict";
import { buildBusinessFaqDirectAnswer } from "../businessFaqDirectAnswer";

const businessConfig = {
  agentName: "Regina",
  faqItems: [
    {
      pergunta: "Como funciona a avaliacao online para adultos?",
      resposta:
        "Para adultos (18+), a avaliacao online comeca com 1 sessao de anamnese. Depois, os testes sao feitos por links enviados um por vez no WhatsApp ou e-mail; cada sessao/teste dura ate 1 hora, em plataforma oficial e com chamada de video durante a aplicacao.",
      categoria: "avaliacao_online",
      directAnswer: true,
      requiresAdult: true,
      missingRequirementAnswer:
        "Consigo te explicar certinho. A avaliacao online e somente para adultos (18+). Qual a idade de quem sera avaliado?",
      minorAnswer:
        "Para menores de 18 anos, a avaliacao deve ser presencial ou confirmada diretamente pela equipe.",
    },
  ],
};

const adultReply = buildBusinessFaqDirectAnswer({
  message: "Tenho 30 anos. Como funciona a avaliacao online?",
  businessConfig,
});
assert.doesNotMatch(adultReply || "", /^\*Regina:\*/);
assert.match(adultReply || "", /plataforma oficial/i);
assert.match(adultReply || "", /anamnese/i);

const missingAgeReply = buildBusinessFaqDirectAnswer({
  message: "Como funciona a avaliacao online?",
  businessConfig,
});
assert.match(missingAgeReply || "", /Qual a idade/i);
assert.doesNotMatch(missingAgeReply || "", /plataforma oficial/i);

const minorReply = buildBusinessFaqDirectAnswer({
  message: "Minha filha tem 15 anos, pode fazer avaliacao online?",
  businessConfig,
});
assert.match(minorReply || "", /menores de 18 anos/i);
assert.doesNotMatch(minorReply || "", /plataforma oficial/i);

const unrelatedReply = buildBusinessFaqDirectAnswer({
  message: "Quais os valores da supervisao clinica?",
  businessConfig,
});
assert.equal(unrelatedReply, null);

const freePlanConfig = {
  agentName: "AgenteZap",
  faqItems: [
    {
      pergunta: "É grátis?",
      resposta: "Sim. Voce pode criar sua conta gratis permanente em www.agentezap.online.",
      directAnswer: true,
    },
    {
      pergunta: "Quanto custa?",
      resposta: "O Gratis continua para o basico. O Plus custa R$99,99/mes para mensagens rapidas e ferramentas.",
      directAnswer: true,
    },
    {
      pergunta: "Vocês configuram para mim?",
      resposta: "Primeiro crie sua conta gratis em www.agentezap.online. Depois chame o suporte com o email da conta.",
      directAnswer: true,
    },
  ],
};

const shortFreeReply = buildBusinessFaqDirectAnswer({
  message: "é grátis?",
  businessConfig: freePlanConfig,
});
assert.match(shortFreeReply || "", /www\.agentezap\.online/i);

const mojibakeFreeReply = buildBusinessFaqDirectAnswer({
  message: "gr\u00c3\u00a1tis?",
  businessConfig: freePlanConfig,
});
assert.match(mojibakeFreeReply || "", /www\.agentezap\.online/i);

const contextualFreeReply = buildBusinessFaqDirectAnswer({
  message: "tem plano gratis?",
  businessConfig: freePlanConfig,
});
assert.match(contextualFreeReply || "", /www\.agentezap\.online/i);

const freeSynonymReply = buildBusinessFaqDirectAnswer({
  message: "é gratuito?",
  businessConfig: freePlanConfig,
});
assert.match(freeSynonymReply || "", /gratis permanente/i);

const priceSynonymReply = buildBusinessFaqDirectAnswer({
  message: "qual valor?",
  businessConfig: freePlanConfig,
});
assert.match(priceSynonymReply || "", /R\$99,99\/mes/i);

const configureReply = buildBusinessFaqDirectAnswer({
  message: "quero que voces configurem pra mim",
  businessConfig: freePlanConfig,
});
assert.match(configureReply || "", /Primeiro crie sua conta gratis/i);
assert.match(configureReply || "", /www\.agentezap\.online/i);

const vagueShortReply = buildBusinessFaqDirectAnswer({
  message: "funciona?",
  businessConfig,
});
assert.equal(vagueShortReply, null);

const nonOptInReply = buildBusinessFaqDirectAnswer({
  message: "Como funciona a entrega?",
  businessConfig: {
    agentName: "Ana",
    faqItems: [{ pergunta: "Como funciona a entrega?", resposta: "Entregamos por motoboy." }],
  },
});
assert.equal(nonOptInReply, null);

const contextualFollowupReply = buildBusinessFaqDirectAnswer({
  message: "Sim",
  conversationHistory: [
    {
      text: "Quero valores, fotos e especificacoes",
      fromMe: false,
      isFromAgent: false,
    },
    {
      text: "Consigo te passar sim. Voce quer ver os detalhes?",
      fromMe: true,
      isFromAgent: true,
    },
  ],
  businessConfig: {
    agentName: "Tendas",
    faqItems: [
      {
        pergunta: "valores fotos especificacoes",
        resposta: "Locacao: 5x5m R$ 750,00 e 10x10m R$ 1.400,00.",
        directAnswer: true,
        contextualFollowup: true,
      },
    ],
  },
});
assert.match(contextualFollowupReply || "", /5x5m R\$ 750,00/);
assert.doesNotMatch(contextualFollowupReply || "", /^\*Tendas:\*/);

const contextualFollowupWithoutOptInReply = buildBusinessFaqDirectAnswer({
  message: "Sim",
  conversationHistory: [
    {
      text: "Quero valores, fotos e especificacoes",
      fromMe: false,
      isFromAgent: false,
    },
  ],
  businessConfig: {
    agentName: "Tendas",
    faqItems: [
      {
        pergunta: "valores fotos especificacoes",
        resposta: "Locacao: 5x5m R$ 750,00 e 10x10m R$ 1.400,00.",
        directAnswer: true,
      },
    ],
  },
});
assert.equal(contextualFollowupWithoutOptInReply, null);

const specificMediaRequestReply = buildBusinessFaqDirectAnswer({
  message: "manda foto da tenda 5x5 com fechamento",
  businessConfig: {
    agentName: "Tendas",
    faqItems: [
      {
        pergunta: "locacao tenda 5x5",
        resposta: "Locacao da tenda 5x5m: R$ 750,00.",
        directAnswer: true,
      },
    ],
  },
});
assert.equal(specificMediaRequestReply, null);

console.log("businessFaqDirectAnswer.test.ts ok");
