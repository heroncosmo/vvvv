import assert from "node:assert/strict";
import {
  type DeliveryData,
  findItemByNameFuzzy,
  parseOrderItems,
  prepareDeliveryAddressForGeocoding,
  resolveDirectItemOrderFromContext,
} from "../deliveryAIService";

const deliveryData: DeliveryData = {
  config: {
    id: "cfg-1",
    user_id: "user-1",
    business_name: "Estacao da Pizza",
    business_type: "pizzaria",
    delivery_fee: 5,
    min_order_value: 20,
    estimated_delivery_time: 45,
    accepts_delivery: true,
    accepts_pickup: true,
    accepts_cancellation: true,
    opening_hours: {},
    is_active: true,
    send_to_ai: true,
    payment_methods: ["dinheiro", "cartao", "pix"],
    ai_instructions: "",
    display_instructions: null,
    whatsapp_order_number: null,
  },
  totalItems: 3,
  categories: [
    {
      name: "Tradicionais",
      items: [
        {
          id: "calabresa",
          name: "Calabresa",
          description: "Molho, queijo, calabresa, tomate e cebola",
          price: 49.99,
          category_name: "Tradicionais",
          is_highlight: false,
          is_available: true,
          options: [],
        },
      ],
    },
    {
      name: "Especiais",
      items: [
        {
          id: "carne-sol",
          name: "Carne de Sol",
          description: "Molho, queijo, carne de sol desfiada, pimentao, tomate e cebola",
          price: 54.99,
          category_name: "Especiais",
          is_highlight: true,
          is_available: true,
          options: [],
        },
        {
          id: "carne-sol-cheddar",
          name: "Carne de Sol c/Cheddar",
          description: "Carne de sol desfiada com cheddar extra",
          price: 56.99,
          category_name: "Especiais",
          is_highlight: false,
          is_available: true,
          options: [],
        },
      ],
    },
  ],
};

const categoryFlowResolution = resolveDirectItemOrderFromContext({
  rawMessage: "quero a de calabresa mesmo",
  executionMessage: "quero a de calabresa mesmo",
  deliveryData,
  conversationHistory: [
    { fromMe: true, text: "Tradicionais\nConfira a imagem do cardapio acima!\n\nO que voce gostaria de pedir?" },
    { fromMe: false, text: "pizzas" },
    { fromMe: true, text: "TRADICIONAIS\n• Calabresa - R$ 49,99\n\nQual voce quer? E so me dizer!" },
  ],
});

assert.ok(categoryFlowResolution, "deveria resolver item pelo contexto recente da categoria");
assert.equal(categoryFlowResolution?.item.name, "Calabresa");
assert.equal(categoryFlowResolution?.rewrittenMessage, "quero 1 Calabresa");

const parsedNormalizedItem = parseOrderItems("adicionar 1 pizza calabresa (molho, calabresa, cebola e oregano) ao carrinho");
assert.equal(parsedNormalizedItem.length, 1);
assert.equal(parsedNormalizedItem[0]?.name.trim(), "pizza calabresa");

const fuzzyNormalizedItem = findItemByNameFuzzy(
  deliveryData,
  "adicionar 1 pizza calabresa (molho, calabresa, cebola e oregano) ao carrinho",
  "Tradicionais",
);
assert.equal(fuzzyNormalizedItem?.name, "Calabresa");

const descriptiveFollowUpResolution = resolveDirectItemOrderFromContext({
  rawMessage: "quero a carne de sol desfiada mesmo",
  executionMessage: "quero a carne de sol desfiada mesmo",
  deliveryData,
  conversationHistory: [
    { fromMe: true, text: "Especiais\nConfira a imagem do cardapio acima!\n\nO que voce gostaria de pedir?" },
    { fromMe: false, text: "carne de sol" },
    {
      fromMe: true,
      text: "Claro! A Carne de Sol (R$ 54,99) e uma delicia nordestina com carne de sol desfiada, queijo mussarela e molho de tomate especial.",
    },
  ],
});

assert.ok(descriptiveFollowUpResolution, "deveria reaproveitar o item recente mesmo com descricao coloquial");
assert.equal(descriptiveFollowUpResolution?.item.name, "Carne de Sol");
assert.equal(descriptiveFollowUpResolution?.rewrittenMessage, "quero 1 Carne de Sol");

const preparedAddressWithOriginContext = prepareDeliveryAddressForGeocoding(
  "Lucas, Rua Antonio Plastina, 252A",
  "Rua da Loja, 123 - Centro, Curitiba - PR",
  "Lucas",
);
assert.equal(preparedAddressWithOriginContext, "Rua Antonio Plastina, 252A, Curitiba - PR");

const preparedAddressWithoutDuplicatingContext = prepareDeliveryAddressForGeocoding(
  "Rua Antonio Plastina, 252A, Curitiba - PR",
  "Rua da Loja, 123 - Centro, Curitiba - PR",
  "Lucas",
);
assert.equal(preparedAddressWithoutDuplicatingContext, "Rua Antonio Plastina, 252A, Curitiba - PR");

console.log("deliveryAIService.context.test.ts ok");
process.exit(0);
