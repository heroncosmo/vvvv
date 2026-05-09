import assert from "node:assert/strict";

import {
  buildRealEstateConversationContext,
  groundRealEstateReplyForUserTurn,
  maybeGroundRealEstateReply,
} from "../realEstateReplyGrounding";
import type { RealEstateCatalogForAI } from "../realEstateCatalogService";

const catalog: RealEstateCatalogForAI = {
  active: true,
  totalCount: 38,
  retrievedCount: 1,
  feedUrl: "https://example.com/feed.xml",
  specialInstructions: [],
  listings: [
    {
      code: "RP79654",
      title: "Cobertura Triplex, 185M2, 3 dorm. 1 suite, garagem demarcada",
      transactionType: "Venda",
      propertyType: "Cobertura",
      price: "R$ 550.000,00",
      city: "Santos",
      neighborhood: "Estuario",
      address: "Avenida Afonso Pena, 675",
      bedrooms: 3,
      bathrooms: 2,
      garage: 1,
      livingArea: "185 m2",
      detailUrl: "https://www.landmarkimoveis.com.br/detalhes-imovel/5-cobertura-triplex-venda-estuario-santos-sp.html",
      description: "Cobertura triplex com otima planta e vista aberta.",
      score: 80,
    },
  ],
};

const genericReply =
  "Obrigada! Voce gostaria de agendar uma visita para conhecer o imovel na Av. Afonso Pena, 675, em Santos? Qual dia prefere?";
const groundedReply = maybeGroundRealEstateReply({
  customerMessage: "Av. afonso pena, 675 em santos",
  responseText: genericReply,
  catalog,
});

assert.match(groundedReply, /Cobertura Triplex/i);
assert.match(groundedReply, /3 dorm/i);
assert.match(groundedReply, /550\.000,00/i);
assert.match(groundedReply, /Link do an/i);

const groundedReplyWithoutStreetType = maybeGroundRealEstateReply({
  customerMessage: "afonso pena 675 santos",
  responseText: "Perfeito! Aqui estao os detalhes principais do imovel.",
  catalog,
});

assert.match(groundedReplyWithoutStreetType, /Cobertura Triplex/i);
assert.match(groundedReplyWithoutStreetType, /landmarkimoveis\.com\.br/i);

const pasteurCatalog: RealEstateCatalogForAI = {
  active: true,
  totalCount: 38,
  retrievedCount: 1,
  feedUrl: "https://example.com/feed.xml",
  specialInstructions: [],
  listings: [
    {
      code: "RP24525",
      title: "Apto 3 quartos 1 suite 200 M2 2 garagens no Gonzaga",
      transactionType: "Venda",
      propertyType: "Apartment",
      price: "R$ 980.000,00",
      city: "Santos",
      neighborhood: "Gonzaga",
      address: "Rua Pasteur, 63",
      bedrooms: 3,
      bathrooms: 3,
      garage: 2,
      livingArea: "200 m2",
      detailUrl: "https://www.landmarkimoveis.com.br/detalhes-imovel/105-apartamento-venda-gonzaga-santos-sp.html",
      description: "Apartamento amplo no Gonzaga.",
      score: 80,
    },
  ],
};

const groundedSingleTokenStreetReply = maybeGroundRealEstateReply({
  customerMessage: "Rua Pasteur, 63 em Santos",
  responseText: "Obrigada! Vou confirmar esse imovel para voce.",
  catalog: pasteurCatalog,
});

assert.match(groundedSingleTokenStreetReply, /Rua Pasteur, 63/i);
assert.match(groundedSingleTokenStreetReply, /980\.000,00/i);
assert.match(groundedSingleTokenStreetReply, /landmarkimoveis\.com\.br/i);
assert.doesNotMatch(groundedSingleTokenStreetReply, /corretor humano/i);

const groundedReplyFromLinkAndCode = maybeGroundRealEstateReply({
  customerMessage:
    "Olá! Tenho interesse em cobertura, Avenida Affonso Penna - Estuario, Santos - SP que encontrei no Zap: https://www.zapimoveis.com.br/imovel/venda-cobertura-3-quartos-com-churrasqueira-estuario-santos-sp-185m2-id-2865825162/. Código da oferta: RP79654. Código do anúncio no Zap: 2865825162",
  responseText:
    "Para evitar te passar o imovel errado, vou encaminhar seu atendimento para um corretor humano da equipe, porque ainda faltam dados essenciais para confirmar esse anuncio com seguranca.",
  catalog,
});

assert.match(groundedReplyFromLinkAndCode, /RP79654|Cobertura Triplex/i);
assert.match(groundedReplyFromLinkAndCode, /550\.000,00/i);
assert.match(groundedReplyFromLinkAndCode, /landmarkimoveis\.com\.br/i);
assert.doesNotMatch(groundedReplyFromLinkAndCode, /corretor humano/i);

const contaminatedHistoryCatalog: RealEstateCatalogForAI = {
  active: true,
  totalCount: 40,
  retrievedCount: 1,
  feedUrl: "https://example.com/feed.xml",
  specialInstructions: [
    "O cliente ja trouxe identificadores fortes do anuncio no contexto recente, como codigo, link ou endereco. Trate o imovel confirmado acima como o anuncio certo e responda diretamente com os dados desse imovel.",
  ],
  listings: [
    {
      code: "RP03046",
      title: "Apto 170M² 3 quartos 1 suite frente mar na Aparecida",
      transactionType: "Venda",
      propertyType: "Apartment",
      price: "R$ 2.450.000,00",
      city: "Santos",
      neighborhood: "Ponta da Praia",
      address: "Avenida Bartholomeu de Gusmao, 132",
      bedrooms: 3,
      bathrooms: 3,
      garage: 1,
      livingArea: "170 m2",
      detailUrl: "https://www.landmarkimoveis.com.br/detalhes-imovel/100-apartamento-venda-ponta-da-praia-santos-sp.html",
      description: "Apartamento frente mar em Santos.",
      score: 100,
    },
  ],
};

const groundedFromMixedHistory = maybeGroundRealEstateReply({
  customerMessage:
    "Lead recebido via ZAP Imoveis (WHATSAPP).\nNome: Rodrigo\nCodigo do imovel: RP03046\nCidade: Santos\nBairro: Ponta da Praia",
  responseText:
    "Para evitar te passar o imovel errado, vou encaminhar seu atendimento para um corretor humano da equipe, porque ainda faltam dados essenciais para confirmar esse anuncio com seguranca.",
  catalog: contaminatedHistoryCatalog,
  conversationHistory: [
    { text: "Lead recebido via Grupo OLX (EMAIL). Codigo do imovel: RP79654 Cidade: Santos Bairro: Estuario", fromMe: false },
    { text: "Tenho interesse no anuncio RP03046 que encontrei no VivaReal.", fromMe: false },
  ],
});

assert.match(groundedFromMixedHistory, /RP03046|Bartholomeu/i);
assert.match(groundedFromMixedHistory, /2\.450\.000,00/i);
assert.doesNotMatch(groundedFromMixedHistory, /corretor humano/i);

const context = buildRealEstateConversationContext([
  { text: "avenida afonso pena,675", fromMe: false },
  { text: "Esse imovel na Afonso Pena, 675 e em Santos, certo?", fromMe: true, isFromAgent: true },
  { text: "mensagem manual do dono", fromMe: true, isFromAgent: false },
]);

assert.deepEqual(context, [
  { role: "user", content: "avenida afonso pena,675" },
  { role: "assistant", content: "Esse imovel na Afonso Pena, 675 e em Santos, certo?" },
]);

const contextWithManualReference = buildRealEstateConversationContext([
  { text: "mensagem manual do dono", fromMe: true, isFromAgent: false },
  {
    text: "Segue o link confirmado do anuncio: https://www.landmarkimoveis.com.br/detalhes-imovel/5-cobertura-triplex-venda-estuario-santos-sp.html",
    fromMe: true,
    isFromAgent: false,
  },
]);

assert.deepEqual(contextWithManualReference, [
  {
    role: "assistant",
    content: "Segue o link confirmado do anuncio: https://www.landmarkimoveis.com.br/detalhes-imovel/5-cobertura-triplex-venda-estuario-santos-sp.html",
  },
]);

let capturedHistory:
  | Array<{ role: "user" | "assistant"; content: string }>
  | undefined;

const groundedFromEarlyReturn = await groundRealEstateReplyForUserTurn({
  userId: "user-1",
  customerMessage: "gostaria de saber o preco do imovel avenida afonso pena,675",
  responseText:
    "Vou verificar aqui pra voce! Esse imovel na Afonso Pena, 675 (Santos) esta com valor de venda a partir de R$ 1.250.000,00.",
  conversationHistory: [
    { text: "avenida afonso pena,675", fromMe: false },
    { text: "Esse imovel na Afonso Pena, 675 e em Santos, certo?", fromMe: true, isFromAgent: true },
  ],
  loadCatalog: async (_userId, _message, options) => {
    capturedHistory = options?.conversationHistory;
    return catalog;
  },
});

assert.deepEqual(capturedHistory, [
  { role: "user", content: "avenida afonso pena,675" },
  { role: "assistant", content: "Esse imovel na Afonso Pena, 675 e em Santos, certo?" },
]);
assert.match(String(groundedFromEarlyReturn), /550\.000,00/i);
assert.match(String(groundedFromEarlyReturn), /landmarkimoveis\.com\.br/i);

const multiCatalog: RealEstateCatalogForAI = {
  active: true,
  totalCount: 38,
  retrievedCount: 2,
  feedUrl: "https://example.com/feed.xml",
  specialInstructions: [],
  selectionMode: "alternatives",
  selectionExplanation:
    "Nao encontrei opcoes confirmadas exatamente para apartamentos em Gonzaga entre R$ 500.000 e R$ 600.000, mas encontrei alternativas reais em Santos.",
  listings: [
    {
      code: "RP10001",
      title: "Apartamento frente mar no Gonzaga",
      transactionType: "Venda",
      propertyType: "Apartamento",
      price: "R$ 590.000,00",
      city: "Santos",
      neighborhood: "Gonzaga",
      address: "Rua Bahia, 120",
      bedrooms: 2,
      bathrooms: 2,
      garage: 1,
      livingArea: "78 m2",
      detailUrl: "https://www.landmarkimoveis.com.br/imovel/rp10001",
      description: "Apartamento confirmado no XML.",
      score: 72,
    },
    {
      code: "RP10002",
      title: "Apartamento reformado no Gonzaga",
      transactionType: "Venda",
      propertyType: "Apartamento",
      price: "R$ 560.000,00",
      city: "Santos",
      neighborhood: "Gonzaga",
      address: "Rua Galeao Carvalhal, 88",
      bedrooms: 2,
      bathrooms: 2,
      garage: 1,
      livingArea: "74 m2",
      detailUrl: "https://www.landmarkimoveis.com.br/imovel/rp10002",
      description: "Segundo apartamento confirmado no XML.",
      score: 69,
    },
  ],
};

const groundedMultiReply = maybeGroundRealEstateReply({
  customerMessage: "me manda o link deles?",
  responseText:
    "Vou confirmar os links atualizados desses imoveis para voce. Um momento, por favor!",
  catalog: multiCatalog,
  conversationHistory: [
    { text: "apartamentos no Gonzaga de 500k a 600k", fromMe: false },
    { text: "nao tenho preferencia me mostre", fromMe: false },
  ],
});

assert.match(groundedMultiReply, /RP10001/);
assert.match(groundedMultiReply, /RP10002/);
assert.match(groundedMultiReply, /landmarkimoveis\.com\.br\/imovel\/rp10001/i);
assert.doesNotMatch(groundedMultiReply, /Vou confirmar os links/i);
assert.match(groundedMultiReply, /alternativas reais em Santos/i);

const zeroCatalog: RealEstateCatalogForAI = {
  active: true,
  totalCount: 38,
  retrievedCount: 0,
  feedUrl: "https://example.com/feed.xml",
  specialInstructions: [],
  listings: [],
};

const groundedZeroReply = maybeGroundRealEstateReply({
  customerMessage: "pronto para morar",
  responseText:
    "Perfeito! Tenho 3 opcoes no Gonzaga entre R$500k e R$600k e vou te mandar os links em seguida.",
  catalog: zeroCatalog,
  conversationHistory: [
    { text: "apartamentos no Gonzaga de 500k a 600k", fromMe: false },
    { text: "Voce prefere apartamento pronto para morar ou aceita tambem na planta?", fromMe: true, isFromAgent: true },
  ],
});

assert.match(groundedZeroReply, /Nao encontrei imoveis confirmados/i);
assert.doesNotMatch(groundedZeroReply, /Tenho 3 opcoes/i);

const groundedZeroReplyFromEmpty = maybeGroundRealEstateReply({
  customerMessage: "nao tenho preferencia me mostre",
  responseText: "",
  catalog: zeroCatalog,
  conversationHistory: [
    { text: "apartamentos no Gonzaga de 500k a 600k", fromMe: false },
    { text: "pronto para morar", fromMe: false },
  ],
});

assert.match(groundedZeroReplyFromEmpty, /Nao encontrei imoveis confirmados/i);

const groundedIncompleteAddressReply = maybeGroundRealEstateReply({
  customerMessage: "afonso pena em santos",
  responseText:
    "Obrigada! Qual e o numero do imovel na Avenida Afonso Pena?",
  catalog,
});

assert.match(groundedIncompleteAddressReply, /corretor humano/i);
assert.doesNotMatch(groundedIncompleteAddressReply, /Qual e o numero/i);

const groundedCannotIdentifyReply = maybeGroundRealEstateReply({
  customerMessage: "nao consigo ver",
  responseText:
    "Sem problema! Me diz so o numero que esta na placa ou na fachada do imovel, por favor.",
  catalog,
  conversationHistory: [
    { text: "afonso pena em santos", fromMe: false },
    { text: "Obrigada! Qual e o numero do imovel na Avenida Afonso Pena?", fromMe: true, isFromAgent: true },
  ],
});

assert.match(groundedCannotIdentifyReply, /corretor humano/i);
assert.doesNotMatch(groundedCannotIdentifyReply, /placa|fachada/i);

const groundedGenericOpeningReply = maybeGroundRealEstateReply({
  customerMessage: "Estou em frente a um imovel que tem a placa da imobiliaria e quero mais informacoes.",
  responseText:
    "Claro! Me diga o nome da rua, o numero do imovel e a cidade para eu localizar o anuncio certo.",
  catalog,
});

assert.match(groundedGenericOpeningReply, /nome da rua/i);
assert.doesNotMatch(groundedGenericOpeningReply, /corretor humano/i);

console.log("realEstateReplyGrounding.test.ts ok");
