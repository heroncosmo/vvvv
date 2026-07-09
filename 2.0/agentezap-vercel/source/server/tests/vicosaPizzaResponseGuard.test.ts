import assert from "node:assert/strict";

import {
  VICOSA_PIZZA_USER_ID,
  applyVicosaPizzaResponseGuard,
  ensureVicosaPizzaMenuMediaAction,
} from "../vicosaPizzaResponseGuard";

const notWilson = applyVicosaPizzaResponseGuard({
  userId: "00000000-0000-0000-0000-000000000000",
  message: "Vocês têm pizza média de calabresa?",
  text: "Temos pizza média de calabresa por R$31,00.",
});

assert.equal(notWilson.text, "Temos pizza média de calabresa por R$31,00.");
assert.deepEqual(notWilson.applied, []);

const mediumPizza = applyVicosaPizzaResponseGuard({
  userId: VICOSA_PIZZA_USER_ID,
  message: "Vocês têm pizza média de calabresa?",
  text: "Temos pizza média (G) de calabresa sim! Ela tem 8 fatias e custa R$31,00.",
});

assert.match(mediumPizza.text, /não trabalhamos com pizza média/i);
assert.match(mediumPizza.text, /P\/pequena/);
assert.match(mediumPizza.text, /G\/grande/);
assert.match(mediumPizza.text, /R\$31,00/);
assert.deepEqual(mediumPizza.applied, ["no_medium_pizza"]);

const halfHalfCarneDoSol = applyVicosaPizzaResponseGuard({
  userId: VICOSA_PIZZA_USER_ID,
  message: "Qual o valor da grande metade calabresa e metade carne do sol especial?",
  text: "A pizza fica R$69,90 somando os sabores.",
});

assert.match(halfHalfCarneDoSol.text, /R\$40,00/);
assert.doesNotMatch(halfHalfCarneDoSol.text, /69,90/);
assert.deepEqual(halfHalfCarneDoSol.applied, ["half_half_highest_price:calabresa_carne_do_sol_especial"]);

const halfHalfFrango = applyVicosaPizzaResponseGuard({
  userId: VICOSA_PIZZA_USER_ID,
  message: "Quero uma pizza grande meio a meio calabresa e frango.",
  text: "Perfeito! Pizza meio a meio: metade Frango com Catupiry e metade Frango com Catupiry. Total R$33,00.",
});

assert.match(halfHalfFrango.text, /Calabresa \+ Frango com Catupiry/);
assert.match(halfHalfFrango.text, /R\$33,00/);
assert.doesNotMatch(halfHalfFrango.text, /Frango com Catupiry e metade Frango com Catupiry/);
assert.deepEqual(halfHalfFrango.applied, ["half_half_highest_price:calabresa_frango_catupiry"]);

const deliveryFee = applyVicosaPizzaResponseGuard({
  userId: VICOSA_PIZZA_USER_ID,
  message: "Qual o prazo de entrega e qual a taxa?",
  text: "A entrega é em 45 minutos e a taxa é grátis.",
});

assert.match(deliveryFee.text, /30 minutos/);
assert.match(deliveryFee.text, /equipe da loja confirma/);
assert.doesNotMatch(deliveryFee.text, /grátis|45 minutos/i);
assert.deepEqual(deliveryFee.applied, ["delivery_fee_final_by_store"]);

const summary = applyVicosaPizzaResponseGuard({
  userId: VICOSA_PIZZA_USER_ID,
  message: "Resumo do pedido: pizza G metade calabresa metade carne do sol especial, Pix, Rua A 123.",
  text: "Resposta formatada de acordo com o cardápio: R$XX,XX e R$YY,YZ.",
});

assert.match(summary.text, /Resumo do pedido/);
assert.match(summary.text, /R\$40,00/);
assert.match(summary.text, /taxa de entrega/);
assert.doesNotMatch(summary.text, /R\$XX|YY,YZ|formatada/i);

const menuHandoffTaxa = applyVicosaPizzaResponseGuard({
  userId: VICOSA_PIZZA_USER_ID,
  message: "qual a taxa de entrega?",
  text: "A entrega fica em ate 30 minutos. Envie endereco completo.",
  prompt: "CALIBRACAO_VICOSA_MENU_HUMANO_2026_05_28",
});

assert.match(menuHandoffTaxa.text, /cardapio oficial/i);
assert.match(menuHandoffTaxa.text, /equipe da loja vai continuar/i);
assert.doesNotMatch(menuHandoffTaxa.text, /30 minutos|endereco/i);
assert.deepEqual(menuHandoffTaxa.applied, ["menu_handoff_only"]);

const menuHandoffPedido = applyVicosaPizzaResponseGuard({
  userId: VICOSA_PIZZA_USER_ID,
  message: "quero uma pizza calabresa grande",
  text: "Pizza calabresa grande anotada!",
  prompt: "CALIBRACAO_VICOSA_MENU_HUMANO_2026_05_28",
});

assert.match(menuHandoffPedido.text, /cardapio oficial/i);
assert.doesNotMatch(menuHandoffPedido.text, /anotada|grande/i);
assert.deepEqual(menuHandoffPedido.applied, ["menu_handoff_only"]);

const menuNoHandoffCardapio = applyVicosaPizzaResponseGuard({
  userId: VICOSA_PIZZA_USER_ID,
  message: "estou aguardando o cardapio",
  text: "A equipe da loja vai continuar o atendimento por aqui e confirmar pedido, valor final e taxa de entrega.",
  prompt: "CALIBRACAO_VICOSA_MENU_HUMANO_2026_05_28\nCALIBRACAO_VICOSA_CARDAPIO_SEM_HANDOFF_2026_05_29",
});

assert.equal(menuNoHandoffCardapio.text, "Vou te enviar o cardapio oficial da Vicosa Pizza Burguer.");
assert.equal(menuNoHandoffCardapio.shouldSendMenuMedia, true);
assert.doesNotMatch(menuNoHandoffCardapio.text, /equipe da loja|valor final|taxa de entrega/i);
assert.deepEqual(menuNoHandoffCardapio.applied, ["menu_handoff_only"]);

const menuMediaAdded = ensureVicosaPizzaMenuMediaAction([], menuNoHandoffCardapio);
assert.deepEqual(menuMediaAdded, [{ type: "send_media", media_name: "CARDAPIO_VICOSA" }]);

const menuMediaNotDuplicated = ensureVicosaPizzaMenuMediaAction([
  { type: "send_media_url", media_name: "SAUDACAO_INFO_EXTRA", media_url: "https://example.com/cardapio.jpg" },
], menuNoHandoffCardapio);
assert.equal(menuMediaNotDuplicated.length, 1);

const menuAlreadySentDelivery = applyVicosaPizzaResponseGuard({
  userId: VICOSA_PIZZA_USER_ID,
  message: "vcs fazem entrega hoje?",
  text: "A entrega sera confirmada pela loja.",
  prompt: "CALIBRACAO_VICOSA_MENU_HUMANO_2026_05_28\nCALIBRACAO_VICOSA_CARDAPIO_SEM_HANDOFF_2026_05_29",
  history: [
    { role: "assistant", content: "Boa noite! Seja bem-vindo a Vicosa Pizza Burguer. Vou te enviar o cardapio para voce escolher." },
    { role: "assistant", content: "Cardapio Vicosa Pizza Burguer" },
  ],
  sentMedias: ["SAUDACAO_INFO_EXTRA", "CARDAPIO_VICOSA"],
});

assert.equal(menuAlreadySentDelivery.text, "A entrega sera confirmada pela loja.");
assert.equal(menuAlreadySentDelivery.shouldSendMenuMedia, undefined);
assert.deepEqual(menuAlreadySentDelivery.applied, []);

const menuAlreadySentPedido = applyVicosaPizzaResponseGuard({
  userId: VICOSA_PIZZA_USER_ID,
  message: "quero uma pizza calabresa grande",
  text: "Pode mandar o que escolheu pelo cardapio.",
  prompt: "CALIBRACAO_VICOSA_MENU_HUMANO_2026_05_28\nCALIBRACAO_VICOSA_CARDAPIO_SEM_HANDOFF_2026_05_29",
  sentMedias: ["SAUDACAO_INFO_EXTRA"],
});

assert.equal(menuAlreadySentPedido.text, "Pode mandar o que escolheu pelo cardapio.");
assert.equal(menuAlreadySentPedido.shouldSendMenuMedia, undefined);
assert.deepEqual(menuAlreadySentPedido.applied, []);

const explicitMenuResend = applyVicosaPizzaResponseGuard({
  userId: VICOSA_PIZZA_USER_ID,
  message: "manda o cardapio de novo",
  text: "Certo.",
  prompt: "CALIBRACAO_VICOSA_MENU_HUMANO_2026_05_28\nCALIBRACAO_VICOSA_CARDAPIO_SEM_HANDOFF_2026_05_29",
  sentMedias: ["SAUDACAO_INFO_EXTRA"],
});

assert.equal(explicitMenuResend.text, "Vou te enviar o cardapio oficial da Vicosa Pizza Burguer.");
assert.equal(explicitMenuResend.shouldSendMenuMedia, true);
assert.deepEqual(explicitMenuResend.applied, ["menu_handoff_resend"]);
