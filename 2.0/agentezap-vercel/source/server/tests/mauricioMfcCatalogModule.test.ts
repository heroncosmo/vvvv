import assert from "node:assert/strict";

import {
  MAURICIO_MFC_READY_50X50_PROMO_LINK,
  MAURICIO_MFC_USER_ID,
  buildMauricioMfcArtReferenceContext,
  buildMauricioMfcArtReferenceHandoffReply,
  buildMauricioMfcCatalogCaptionPriceLine,
  buildMauricioMfcDedicatedAddressReply,
  buildMauricioMfcDeliveryHandoffReply,
  buildMauricioMfcLinePriceInquiryReply,
  buildMauricioMfcPendingItemContinuationReply,
  buildMauricioMfcPostSaleIssueReply,
  buildMauricioMfcReady50x50PromoReply,
  buildMauricioMfcUnsupportedExternalFileOrLinkReply,
  containsMauricioMfcReady50x50PromoText,
  extractMauricioMfcPendingCartItems,
  getMauricioMfcCatalogPriceDescription,
  looksLikeMauricioMfcAddressRequest,
  looksLikeMauricioMfcCatalogPhotoRequest,
  looksLikeMauricioMfcCatalogThemeContinuation,
  looksLikeMauricioMfcGenericCatalogPhotoContinuation,
  looksLikeMauricioMfcDeliveryHandoffRequest,
  looksLikeMauricioMfcNormalCatalogTurn,
  looksLikeMauricioMfcPostSaleIssue,
  looksLikeMauricioMfcUnsupportedExternalFileOrLink,
  looksLikeMauricioMfcReady50x50PromoRequest,
  looksLikeMauricioMfcPixNegation,
  looksLikeMauricioMfcPixPaymentRequest,
  mauricioMfcCatalogEntryMatchesLineKind,
  resolveMauricioMfcDedicatedTurnFallback,
  resolveMauricioMfcRequestedLineKind,
  resolveMauricioMfcCatalogUnitPrice,
} from "../mauricioMfcCatalogModule";

const artReferenceContext = buildMauricioMfcArtReferenceContext({
  userId: MAURICIO_MFC_USER_ID,
  currentMessage: "Marquei com X na foto que gostei",
  conversationHistory: [
    {
      role: "assistant",
      content: "Codigo 1\nCATALOGO DE FOTOS DE ARTES\nMarque com um X na foto escolhida.",
      fromMe: true,
      isFromAgent: true,
    },
  ],
});

assert.equal(artReferenceContext.shouldUseArtReferenceHandoff, true);
assert.equal(artReferenceContext.currentMessageIntent, "marked_selection");
assert.match(buildMauricioMfcArtReferenceHandoffReply(artReferenceContext.recentArtReferenceCount), /Marque com um X/i);

const physicalOrderContext = buildMauricioMfcArtReferenceContext({
  userId: MAURICIO_MFC_USER_ID,
  currentMessage: "Quero painel lateral Lilo sem costura quantidade 1",
  conversationHistory: [
    {
      role: "assistant",
      content: "Codigo 1\nCATALOGO DE FOTOS DE ARTES\nMarque com um X na foto escolhida.",
      fromMe: true,
      isFromAgent: true,
    },
  ],
});

assert.equal(physicalOrderContext.shouldUseArtReferenceHandoff, false);

const baseEntry = {
  userId: MAURICIO_MFC_USER_ID,
  productName: "LILO STHIC CATÁLOGO DE FOTOS",
};

const lateralSemCostura = resolveMauricioMfcCatalogUnitPrice({
  ...baseEntry,
  variationName: "PAINEL LATERAL DO LILO STHIC",
  variationPrice: "70.00",
  contextText: "vai ser sem costura, quantidade 1",
  details: { acabamento: "Sem costura", quantidade: "1" },
});

assert.equal(lateralSemCostura.price, 65, "painel lateral sem costura deve usar R$ 65,00");
assert.equal(lateralSemCostura.kind, "lateral");

const lateralCosturado = resolveMauricioMfcCatalogUnitPrice({
  ...baseEntry,
  variationName: "PAINEL LATERAL DO LILO STHIC",
  variationPrice: "70.00",
  contextText: "costurado quantidade 1",
  details: { acabamento: "Costurado", quantidade: "1" },
});

assert.equal(lateralCosturado.price, 70, "painel lateral costurado deve usar R$ 70,00");

const cilindroSemCostura = resolveMauricioMfcCatalogUnitPrice({
  ...baseEntry,
  variationName: "CILINDROS DO LILO STHIC",
  variationPrice: "100.00",
  contextText: "sem costura, quantidade 2",
  details: { acabamento: "Sem costura", quantidade: "2" },
});

assert.equal(cilindroSemCostura.price, 80, "cilindro sem costura deve usar R$ 80,00");

const redondo50SemCostura = resolveMauricioMfcCatalogUnitPrice({
  ...baseEntry,
  variationName: "PAINEL REDONDO LILO STHIC",
  variationPrice: "60.00",
  contextText: "50x50 sem costura quantidade 1",
  details: { tamanho: "50x50", acabamento: "Sem costura", quantidade: "1" },
});

assert.equal(redondo50SemCostura.price, 60, "painel redondo por foto/codigo deve usar R$ 60,00");

const redondo50CosturadoPromoUnit = resolveMauricioMfcCatalogUnitPrice({
  ...baseEntry,
  variationName: "PAINEL REDONDO LILO STHIC",
  variationPrice: "60.00",
  contextText: "50x50 costurado quantidade 1",
  details: { tamanho: "50x50", acabamento: "Costurado", quantidade: "1" },
});

assert.equal(redondo50CosturadoPromoUnit.price, 60, "painel redondo por foto/codigo deve usar R$ 60,00 mesmo com 50x50");

const redondo50CosturadoPromoThree = resolveMauricioMfcCatalogUnitPrice({
  ...baseEntry,
  variationName: "PAINEL REDONDO LILO STHIC",
  variationPrice: "60.00",
  contextText: "50x50 costurado quantidade 3",
  details: { tamanho: "50x50", acabamento: "Costurado", quantidade: "3" },
});

assert.equal(redondo50CosturadoPromoThree.price, 60, "painel redondo por foto/codigo deve usar R$ 60,00 sem desconto por quantidade");

const redondoGrandeSemCostura = resolveMauricioMfcCatalogUnitPrice({
  ...baseEntry,
  variationName: "PAINEL REDONDO LILO STHIC",
  variationPrice: "60.00",
  contextText: "1,50x1,50 sem costura quantidade 1",
  details: { tamanho: "1,50x1,50", acabamento: "Sem costura", quantidade: "1" },
});

assert.equal(redondoGrandeSemCostura.price, 60, "painel redondo por foto/codigo deve usar R$ 60,00");

const redondoSemTamanho = resolveMauricioMfcCatalogUnitPrice({
  ...baseEntry,
  variationName: "PAINEL REDONDO LILO STHIC",
  variationPrice: "60.00",
  contextText: "sem costura quantidade 1",
  details: { acabamento: "Sem costura", quantidade: "1" },
});

assert.equal(redondoSemTamanho.price, 60, "painel redondo por foto/codigo usa R$ 60,00 mesmo quando ainda falta tamanho");
assert.match(
  redondoSemTamanho.description || "",
  /painel redondo por foto\/codigo R\$ 60,00/,
  "painel redondo deve expor valor unico quando faltar tamanho",
);

const anotherTenant = resolveMauricioMfcCatalogUnitPrice({
  userId: "outro-tenant",
  productName: "LILO STHIC CATÁLOGO DE FOTOS",
  variationName: "PAINEL LATERAL DO LILO STHIC",
  variationPrice: "70.00",
  contextText: "sem costura",
  details: { acabamento: "Sem costura" },
});

assert.equal(anotherTenant.price, null, "outro tenant nao deve herdar regra do Mauricio");
assert.equal(
  getMauricioMfcCatalogPriceDescription({
    ...baseEntry,
    variationName: "CILINDROS DO LILO STHIC",
  }),
  "costurado R$ 100,00; sem costura R$ 80,00",
);

assert.equal(
  buildMauricioMfcCatalogCaptionPriceLine({
    ...baseEntry,
    variationName: "PAINEL LATERAL DO LILO STHIC",
  }),
  "Valores: costurado R$ 70,00; sem costura R$ 65,00.",
);

assert.equal(
  buildMauricioMfcCatalogCaptionPriceLine({
    ...baseEntry,
    productName: "HULK CATALOGO DE FOTOS",
    productDescription: "Valores por item: painel redondo Hulk R$ 60,00; cilindros do Hulk costurado R$ 100,00 e sem costura R$ 80,00; painel lateral Hulk costurado R$ 70,00 e sem costura R$ 65,00.",
    variationName: "PAINEL REDONDO HULK",
    variationPrice: "60.00",
  }),
  "Valores: painel redondo por foto/codigo R$ 60,00.",
  "legenda da foto redonda deve usar a variacao, nao a descricao geral do produto",
);

assert.equal(
  buildMauricioMfcCatalogCaptionPriceLine({
    ...baseEntry,
    productName: "HULK CATALOGO DE FOTOS",
    productDescription: "Valores por item: painel redondo Hulk R$ 60,00; cilindros do Hulk costurado R$ 100,00 e sem costura R$ 80,00; painel lateral Hulk costurado R$ 70,00 e sem costura R$ 65,00.",
    variationName: "CILINDROS DO HULK",
    variationPrice: "100.00",
  }),
  "Valores: costurado R$ 100,00; sem costura R$ 80,00.",
  "legenda dos cilindros deve usar a variacao, nao a ultima linha da descricao geral",
);

assert.match(
  buildMauricioMfcLinePriceInquiryReply("Quanto fica o painel redondo Hulk?") || "",
  /Painel redondo por foto\/codigo fica R\$ 60,00/,
  "pergunta aberta de painel redondo deve ter resposta deterministica curta",
);
assert.doesNotMatch(
  buildMauricioMfcLinePriceInquiryReply("Quanto fica o painel redondo Hulk?") || "",
  /ASSISTENTE VIRTUAL MFC/i,
  "resposta deterministica nao deve carregar assinatura interna duplicavel",
);

assert.match(
  buildMauricioMfcLinePriceInquiryReply("Qual valor do painel lateral Hulk?") || "",
  /costurado R\$ 70,00; sem costura R\$ 65,00/,
  "pergunta aberta de lateral deve informar os dois acabamentos",
);

assert.equal(
  buildMauricioMfcLinePriceInquiryReply("Quanto fica a promocao de painel 50x50 pronto do Hulk?"),
  null,
  "pedido de promocao 50x50 nao deve cair no preco normal do painel redondo por foto/codigo",
);

assert.equal(
  buildMauricioMfcCatalogCaptionPriceLine({
    ...baseEntry,
    productName: "LILO STHIC CATALOGO DE FOTOS",
    productDescription: `Promocao painel 50x50 ${MAURICIO_MFC_READY_50X50_PROMO_LINK}`,
    variationName: "CATALOGO DE FOTOS DE ARTES",
    contextText: "quero painel lateral do lilo",
  }),
  "Valores: costurado R$ 70,00; sem costura R$ 65,00.",
  "pedido lateral com produto generico de fotos nao deve puxar promocao 50x50",
);

assert.match(
  buildMauricioMfcCatalogCaptionPriceLine({
    ...baseEntry,
    productName: "LILO STHIC CATALOGO DE FOTOS",
    productDescription: `Promocao painel 50x50 ${MAURICIO_MFC_READY_50X50_PROMO_LINK}`,
    variationName: "CATALOGO DE FOTOS DE ARTES",
    contextText: "quero painel lilo de 50",
    includeReady50x50Promo: true,
  }) || "",
  /50x50 costurado promocional/,
  "pedido explicito de painel 50 deve manter promocao 50x50",
);

assert.equal(
  containsMauricioMfcReady50x50PromoText(`Fotos e temas: ${MAURICIO_MFC_READY_50X50_PROMO_LINK}`),
  true,
  "descricao com link da promocao deve ser reconhecida",
);
assert.equal(resolveMauricioMfcRequestedLineKind("quero painel lateral do lilo"), "lateral");
assert.equal(resolveMauricioMfcRequestedLineKind("quero cilindro do lilo"), "cilindro");
assert.equal(resolveMauricioMfcRequestedLineKind("quero painel lilo de 50"), "redondo");
assert.equal(
  mauricioMfcCatalogEntryMatchesLineKind({
    ...baseEntry,
    variationName: "PAINEL REDONDO LILO STHIC",
  }, "lateral"),
  false,
  "pedido lateral nao deve liberar midia redonda",
);
assert.equal(
  mauricioMfcCatalogEntryMatchesLineKind({
    ...baseEntry,
    variationName: "PAINEL LATERAL DO LILO STHIC",
  }, "lateral"),
  true,
  "pedido lateral deve liberar midia lateral",
);

assert.equal(
  looksLikeMauricioMfcCatalogThemeContinuation("E galáxia também"),
  true,
  "continuação curta com tema deve voltar ao catálogo do Mauricio",
);
assert.equal(
  looksLikeMauricioMfcCatalogThemeContinuation("também tem Girassol?"),
  true,
  "continuação com também e tema deve ser reconhecida",
);
assert.equal(
  looksLikeMauricioMfcCatalogThemeContinuation("e chito tambem"),
  true,
  "continuidade com Chito deve acionar o tema Lilo/Stitch",
);
assert.equal(
  looksLikeMauricioMfcCatalogThemeContinuation("obrigado também"),
  false,
  "continuação sem tema MFC não deve acionar catálogo",
);

assert.equal(
  looksLikeMauricioMfcPixNegation("Na verdade quero código 9 sem costura quantidade 2, mas não manda pix ainda."),
  true,
  "negação explícita de Pix deve impedir QR Code",
);
assert.equal(
  looksLikeMauricioMfcPixPaymentRequest("Pode fechar no Pix."),
  true,
  "pedido final de Pix deve permitir QR Code",
);
assert.equal(
  looksLikeMauricioMfcPixPaymentRequest("não manda pix ainda"),
  false,
  "pedido negativo de Pix não deve virar solicitação de pagamento",
);

assert.equal(
  looksLikeMauricioMfcReady50x50PromoRequest("Quais paineis 50x50 costurados em promocao voces tem?"),
  true,
  "pedido de promocao 50x50 deve receber resposta dedicada",
);
assert.equal(
  looksLikeMauricioMfcReady50x50PromoRequest("quero painel lilo de 50"),
  true,
  "pedido direto de painel de 50 por tema deve receber promocao 50x50",
);
assert.match(buildMauricioMfcReady50x50PromoReply(), /photos\.app\.goo\.gl\/sXa7C9AX1BHctpsP7/);
assert.match(buildMauricioMfcReady50x50PromoReply(), /3 unidades R\$ 12,00 cada/);

assert.equal(
  looksLikeMauricioMfcAddressRequest("Também me manda o endereço da loja para retirada."),
  true,
  "pedido de endereço/retirada deve ser reconhecido no módulo do Mauricio",
);

assert.equal(
  looksLikeMauricioMfcDeliveryHandoffRequest("Tem motoboy da loja?"),
  true,
  "pergunta de motoboy deve usar resposta de entrega MFC",
);
assert.equal(
  looksLikeMauricioMfcDeliveryHandoffRequest("https://dreamy-granita-27a922.netlify.app/"),
  false,
  "dominio .app externo nao deve virar pergunta de entrega MFC",
);
assert.equal(
  looksLikeMauricioMfcUnsupportedExternalFileOrLink("https://dreamy-granita-27a922.netlify.app/"),
  true,
  "link externo .app deve receber resposta de material externo",
);
assert.equal(
  looksLikeMauricioMfcUnsupportedExternalFileOrLink("AGRO_BRAVO (2).apk"),
  true,
  "arquivo APK deve receber resposta de material externo",
);
assert.equal(
  looksLikeMauricioMfcDeliveryHandoffRequest("Posso pedir pelo app para entrega?"),
  true,
  "app com contexto de entrega deve continuar usando resposta de entrega MFC",
);
assert.equal(
  looksLikeMauricioMfcAddressRequest("Tem motoboy da loja?"),
  false,
  "pergunta de motoboy nao deve cair no endereco da loja",
);
assert.equal(
  looksLikeMauricioMfcDeliveryHandoffRequest("Posso pedir Uber Flash para retirar?"),
  true,
  "Uber Flash para retirada deve usar resposta de entrega MFC",
);
assert.equal(
  looksLikeMauricioMfcAddressRequest("Posso pedir Uber Flash para retirar?"),
  false,
  "Uber Flash para retirada nao deve ser sobrescrito por endereco",
);
assert.equal(
  looksLikeMauricioMfcDeliveryHandoffRequest("quero codigo 26 sem costura quantidade 1"),
  false,
  "selecao de produto nao deve ser sobrescrita por entrega",
);
assert.equal(
  looksLikeMauricioMfcDeliveryHandoffRequest("nao chegou as fotos do Girassol"),
  false,
  "reclamacao de fotos do catalogo nao deve virar resposta de entrega",
);
assert.equal(
  looksLikeMauricioMfcNormalCatalogTurn("nao chegou as fotos do Girassol"),
  true,
  "reenvio de fotos do catalogo deve seguir fluxo normal de catalogo",
);
assert.deepEqual(
  resolveMauricioMfcDedicatedTurnFallback({ message: "nao chegou as fotos do Girassol" }).kind,
  "none",
  "fallback MFC deve deixar reenvio de fotos passar para catalogo",
);
assert.equal(
  looksLikeMauricioMfcAddressRequest("Posso retirar na loja?"),
  true,
  "retirada simples deve continuar mostrando endereco da loja",
);

const addressReply = buildMauricioMfcDedicatedAddressReply();
assert.match(addressReply, /Pode retirar na loja/);
assert.match(addressReply, /Estrada da Liberdade, 320/);
assert.match(addressReply, /segunda a sabado, das 8h as 17h/);
assert.doesNotMatch(addressReply, /segunda-feira/i, "endereco MFC nao deve inventar retorno somente na segunda");

const deliveryReply = buildMauricioMfcDeliveryHandoffReply();
assert.match(deliveryReply, /nao tem motoboy proprio/);
assert.match(deliveryReply, /Uber Flash/);
assert.match(deliveryReply, /Leo \(71\) 98784-0840/);
assert.match(deliveryReply, /Valor e prazo/);

const unsupportedExternalReply = buildMauricioMfcUnsupportedExternalFileOrLinkReply();
assert.match(unsupportedExternalReply, /arquivo\/link/);
assert.match(unsupportedExternalReply, /tema, painel, codigo, acabamento/);
assert.doesNotMatch(unsupportedExternalReply, /motoboy|Pix|QR Code/i);

const postSaleIssueReply = buildMauricioMfcPostSaleIssueReply();
assert.match(postSaleIssueReply, /Pedimos desculpas pelo transtorno/);
assert.match(postSaleIssueReply, /fotos e\/ou vídeos/);
assert.match(postSaleIssueReply, /equipe responsável/);
assert.doesNotMatch(postSaleIssueReply, /Pix|motoboy|catálogo/i);

const postSaleIssueWithImageReply = buildMauricioMfcPostSaleIssueReply({ alreadySentEvidence: true });
assert.match(postSaleIssueWithImageReply, /Recebemos as imagens/);
assert.match(postSaleIssueWithImageReply, /equipe responsável/);
assert.doesNotMatch(postSaleIssueWithImageReply, /envie fotos/i);

assert.equal(looksLikeMauricioMfcPostSaleIssue("O painel chegou danificado"), true);
assert.equal(looksLikeMauricioMfcPostSaleIssue("Veio com tamanho diferente do que pedi"), true);
assert.equal(looksLikeMauricioMfcPostSaleIssue("O material veio com um furo"), true);
assert.equal(looksLikeMauricioMfcPostSaleIssue("A imagem do painel não ficou legal"), true);
assert.equal(looksLikeMauricioMfcPostSaleIssue("Me manda fotos do tema Hulk"), false);
assert.equal(looksLikeMauricioMfcPostSaleIssue("Me manda o Pix para pagar"), false);
assert.equal(looksLikeMauricioMfcNormalCatalogTurn("Quanto fica painel redondo Hulk 1,50?"), true);
assert.equal(looksLikeMauricioMfcNormalCatalogTurn("Me manda fotos do tema Hulk"), true);
assert.equal(looksLikeMauricioMfcNormalCatalogTurn("O painel chegou danificado"), false);

assert.deepEqual(
  resolveMauricioMfcDedicatedTurnFallback({ message: "O painel chegou danificado" }).kind,
  "post_sale_issue",
  "classificador fallback deve priorizar reclamacao de pos-venda MFC",
);
assert.deepEqual(
  resolveMauricioMfcDedicatedTurnFallback({ message: "Recebi errado e quero resolver" }).kind,
  "post_sale_issue",
  "classificador fallback deve reconhecer pedido recebido errado como pos-venda",
);
assert.deepEqual(
  resolveMauricioMfcDedicatedTurnFallback({ message: "https://dreamy-granita-27a922.netlify.app/" }).kind,
  "unsupported_external_file_or_link",
  "classificador fallback deve priorizar link externo antes de entrega",
);
assert.deepEqual(
  resolveMauricioMfcDedicatedTurnFallback({ message: "AGRO_BRAVO (2).apk" }).kind,
  "unsupported_external_file_or_link",
  "classificador fallback deve priorizar arquivo externo",
);
assert.deepEqual(
  resolveMauricioMfcDedicatedTurnFallback({ message: "Tem motoboy da loja?" }).kind,
  "delivery",
  "classificador fallback deve reconhecer entrega real",
);
assert.deepEqual(
  resolveMauricioMfcDedicatedTurnFallback({ message: "Tambem me manda o endereco da loja para retirada." }).kind,
  "address",
  "classificador fallback deve reconhecer endereco",
);
assert.deepEqual(
  resolveMauricioMfcDedicatedTurnFallback({ message: "Pode fechar no Pix." }).kind,
  "pix",
  "classificador fallback deve reconhecer pedido de Pix",
);
assert.deepEqual(
  resolveMauricioMfcDedicatedTurnFallback({ message: "quero codigo 26 sem costura quantidade 1" }).kind,
  "none",
  "classificador fallback nao deve atropelar selecao de produto",
);
assert.deepEqual(
  resolveMauricioMfcDedicatedTurnFallback({ message: "Quanto fica painel redondo Hulk 1,50?" }).kind,
  "none",
  "classificador fallback nao deve tratar orcamento normal como pos-venda",
);

const pendingHistoryText = [
  "Item 1",
  "Produto: Painel lateral Lilo STHIC",
  "Codigo: 23",
  "Falta: acabamento e quantidade",
].join("\n");
const pendingItems = extractMauricioMfcPendingCartItems(pendingHistoryText);
assert.equal(pendingItems.length, 1, "deve extrair item pendente sem valor ainda");
assert.deepEqual(pendingItems[0].missing, ["acabamento", "quantidade"]);

const pendingCompletionReply = buildMauricioMfcPendingItemContinuationReply({
  currentMessage: "bom dia, sem costura 2 unidades",
  conversationHistory: [{ role: "assistant", content: pendingHistoryText }],
});
assert.ok(pendingCompletionReply, "deve continuar item pendente sem chamar IA lenta");
assert.match(pendingCompletionReply || "", /Codigo: 23/);
assert.match(pendingCompletionReply || "", /Acabamento: Sem costura/);
assert.match(pendingCompletionReply || "", /Quantidade: 2/);
assert.match(pendingCompletionReply || "", /Valor: R\$ 65,00/);
assert.match(pendingCompletionReply || "", /Subtotal: R\$ 130,00/);
assert.doesNotMatch(pendingCompletionReply || "", /redondo/i, "painel lateral pendente nao deve virar redondo");

const pendingGreetingReply = buildMauricioMfcPendingItemContinuationReply({
  currentMessage: "bom dia",
  conversationHistory: [{ role: "assistant", content: pendingHistoryText }],
});
assert.ok(pendingGreetingReply, "saudacao no dia seguinte deve recuperar pendencia");
assert.match(pendingGreetingReply || "", /Falta: acabamento e quantidade/);
assert.match(pendingGreetingReply || "", /Me envie acabamento e quantidade/);

assert.equal(
  looksLikeMauricioMfcCatalogPhotoRequest("Manda foto do painéis hulk"),
  true,
  "pedido explicito de foto deve ser reconhecido no modulo MFC",
);
assert.equal(
  looksLikeMauricioMfcGenericCatalogPhotoContinuation("Quero fotos"),
  true,
  "pedido generico de fotos deve permitir recuperar o tema recente no MFC",
);
assert.equal(
  looksLikeMauricioMfcGenericCatalogPhotoContinuation("Manda foto do painéis hulk"),
  false,
  "pedido com tema explicito nao e continuacao generica",
);
const pendingPhotoRequestBypassesCart = buildMauricioMfcPendingItemContinuationReply({
  currentMessage: "Manda foto do painéis hulk",
  conversationHistory: [{ role: "assistant", content: pendingHistoryText }],
});
assert.equal(
  pendingPhotoRequestBypassesCart,
  null,
  "pedido de foto/catalogo nao deve ser engolido por pendencia de acabamento",
);

const captionHistory = [
  { role: "user", content: "Codigo 21 CILINDROS DO LILO STHIC. Costurado R$ 100,00; sem costura R$ 80,00." },
  { role: "user", content: "Codigo 28 PAINEL LATERAL DO LILO STHIC. Costurado R$ 70,00; sem costura R$ 65,00." },
  { role: "user", content: "Codigo 27 PAINEL LATERAL DO LILO STHIC. Costurado R$ 70,00; sem costura R$ 65,00." },
  { role: "user", content: "1 de cada" },
  { role: "assistant", content: "Para calcular o valor total, preciso saber qual acabamento voce prefere: costurado ou sem costura." },
];
const captionPendingTotalInquiry = buildMauricioMfcPendingItemContinuationReply({
  currentMessage: "Quanto fica esses eu pedi",
  conversationHistory: captionHistory.slice(0, 4),
});
assert.ok(captionPendingTotalInquiry, "deve recuperar codigos recentes antes do acabamento");
assert.match(captionPendingTotalInquiry || "", /Codigo: 21/);
assert.match(captionPendingTotalInquiry || "", /Codigo: 28/);
assert.match(captionPendingTotalInquiry || "", /Codigo: 27/);
assert.match(captionPendingTotalInquiry || "", /Falta: acabamento/);
assert.match(captionPendingTotalInquiry || "", /Me envie acabamento/);

const captionSemCosturaTotal = buildMauricioMfcPendingItemContinuationReply({
  currentMessage: "sem costura",
  conversationHistory: captionHistory,
});
assert.ok(captionSemCosturaTotal, "deve reconstruir total por captions quando cliente informa sem costura");
assert.match(captionSemCosturaTotal || "", /Codigo: 21/);
assert.match(captionSemCosturaTotal || "", /Codigo: 28/);
assert.match(captionSemCosturaTotal || "", /Codigo: 27/);
assert.match(captionSemCosturaTotal || "", /Total dos itens: R\$ 210,00/);

const captionCosturadoTotal = buildMauricioMfcPendingItemContinuationReply({
  currentMessage: "costurado",
  conversationHistory: captionHistory,
});
assert.ok(captionCosturadoTotal, "deve reconstruir total por captions quando cliente informa costurado");
assert.match(captionCosturadoTotal || "", /Total dos itens: R\$ 240,00/);

const newOrderShouldBypassPending = buildMauricioMfcPendingItemContinuationReply({
  currentMessage: "novo pedido, item painel hulk",
  conversationHistory: [{ role: "assistant", content: pendingHistoryText }],
});
assert.equal(newOrderShouldBypassPending, null, "pedido novo nao deve herdar item pendente antigo");

const liloCorrectionReply = buildMauricioMfcPendingItemContinuationReply({
  currentMessage: "Lilo STHIC",
  conversationHistory: [
    { role: "user", content: "Item painel lilo" },
    {
      role: "assistant",
      content: 'Item Painel Lilo. Assumindo "Lilo" se refere ao tema Lilo & Stitch. Para atender, preciso do tamanho do painel redondo: 50x50 ou 1,50x1,50.',
    },
  ],
});
assert.ok(liloCorrectionReply, "correcao Lilo STHIC deve ter resposta deterministica");
assert.match(liloCorrectionReply || "", /Lilo STHIC/);
assert.match(liloCorrectionReply || "", /painel lateral, painel redondo ou cilindro/);
assert.doesNotMatch(liloCorrectionReply || "", /assumindo/i);

console.log("mauricioMfcCatalogModule.test.ts ok");
process.exit(0);
