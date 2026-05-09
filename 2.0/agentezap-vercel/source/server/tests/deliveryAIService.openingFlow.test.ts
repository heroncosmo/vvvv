import assert from "node:assert/strict";
import {
  generateDeliveryResponse,
  mapDeliveryOpeningFlowToActions,
  type DeliveryData,
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
    payment_methods: ["dinheiro", "cartao", "pix"],
    is_active: true,
    opening_hours: {},
    welcome_message: "Ola {cliente_nome}, seja bem-vindo ao delivery.",
    use_customer_name: true,
    response_variation: false,
    menu_send_mode: "image",
  },
  totalItems: 2,
  categories: [
    {
      name: "Pizzas",
      image_url: "https://cdn.exemplo.com/pizzas.jpg",
      items: [
        {
          id: "pizza-calabresa",
          name: "Calabresa",
          description: "Molho, queijo e calabresa",
          price: 30,
          category_name: "Pizzas",
          is_highlight: true,
          is_available: true,
          options: [],
        },
      ],
    },
    {
      name: "Bebidas",
      image_url: "https://cdn.exemplo.com/bebidas.jpg",
      items: [
        {
          id: "refri-2l",
          name: "Refrigerante 2L",
          description: "Gelado",
          price: 12,
          category_name: "Bebidas",
          is_highlight: false,
          is_available: true,
          options: [],
        },
      ],
    },
  ],
};

const greeting = await generateDeliveryResponse(
  "user-1",
  "oi",
  "GREETING",
  deliveryData,
  "",
  undefined,
  undefined,
  [{ fromMe: false, text: "Oi, eu sou Lucas" }]
);

assert.equal(greeting.intent, "GREETING");
assert.equal(greeting.bubbles.length, 1);
assert.match(greeting.bubbles[0] || "", /Lucas/i);
assert.match(greeting.bubbles[0] || "", /seja bem-vindo ao delivery/i);

const openingActions = mapDeliveryOpeningFlowToActions({
  mediaType: "flow",
  caption: "Abertura do delivery",
  flowItems: [
    {
      id: "flow-2",
      order: 2,
      type: "media",
      mediaType: "image",
      storageUrl: "https://cdn.exemplo.com/03.jpg",
      caption: "Terceira imagem",
    },
    {
      id: "flow-1",
      order: 0,
      type: "media",
      mediaType: "image",
      storageUrl: "https://cdn.exemplo.com/01.jpg",
      caption: "Primeira imagem",
    },
    {
      id: "flow-text",
      order: 1,
      type: "text",
      text: "nao entra como imagem",
    },
    {
      id: "flow-3",
      order: 1,
      type: "media",
      mediaType: "image",
      storageUrl: "https://cdn.exemplo.com/02.jpg",
      caption: "Segunda imagem",
    },
  ],
});

assert.equal(openingActions.length, 3);
assert.deepEqual(
  openingActions.map((action) =>
    action.type === "send_media_url" ? action.media_url : "unexpected"
  ),
  [
    "https://cdn.exemplo.com/01.jpg",
    "https://cdn.exemplo.com/02.jpg",
    "https://cdn.exemplo.com/03.jpg",
  ]
);

assert.deepEqual(
  openingActions.map((action) =>
    action.type === "send_media_url" ? action.caption : "unexpected"
  ),
  ["Primeira imagem", "Segunda imagem", "Terceira imagem"]
);

console.log("deliveryAIService.openingFlow.test.ts ok");
process.exit(0);
