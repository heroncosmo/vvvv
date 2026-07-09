import assert from "node:assert/strict";
import {
  extractReusableAddressProfile,
  generateDeliveryResponse,
  getSavedProfilePrompt,
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
    welcome_message: "Ola {cliente_nome}, ja vou te mandar o visual do cardapio.",
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
      name: "Molhos",
      image_url: null,
      items: [
        {
          id: "molho-casa",
          name: "Molho da Casa",
          description: "Molho especial da casa",
          price: 3.5,
          category_name: "Molhos",
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
  [{ fromMe: false, text: "Oi" }]
);

assert.equal(greeting.intent, "GREETING");
assert.equal(greeting.bubbles.length, 1);
assert.match(greeting.bubbles[0] || "", /card.*acima/i);
assert.doesNotMatch(greeting.bubbles.join("\n"), /Calabresa/i);

const imageOnlyMenu = await generateDeliveryResponse(
  "user-1",
  "quais pizzas tem",
  "WANT_MENU",
  deliveryData,
  "",
  undefined,
  undefined,
  []
);

assert.equal(imageOnlyMenu.intent, "WANT_MENU");
assert.equal(imageOnlyMenu.bubbles.length, 0);
assert.equal(imageOnlyMenu.metadata?.categoryImageUrl, "https://cdn.exemplo.com/pizzas.jpg");
assert.doesNotMatch(imageOnlyMenu.bubbles.join("\n"), /Calabresa/i);

const imageOnlyCategory = await generateDeliveryResponse(
  "user-1",
  "pizzas",
  "WANT_CATEGORY",
  deliveryData,
  "",
  undefined,
  undefined,
  []
);

assert.equal(imageOnlyCategory.intent, "WANT_CATEGORY");
assert.equal(imageOnlyCategory.bubbles.length, 0);
assert.equal(imageOnlyCategory.metadata?.categoryImageUrl, "https://cdn.exemplo.com/pizzas.jpg");

const fallbackTextCategory = await generateDeliveryResponse(
  "user-1",
  "molhos",
  "WANT_CATEGORY",
  deliveryData,
  "",
  undefined,
  undefined,
  []
);

assert.equal(fallbackTextCategory.intent, "WANT_CATEGORY");
assert.match(fallbackTextCategory.bubbles.join("\n"), /molho/i);

const savedProfile = extractReusableAddressProfile([
  {
    customer_name: null,
    customer_address: null,
    customer_reference: null,
    payment_method: null,
  },
  {
    customer_name: "Lucas",
    customer_address: "Rua Antonio Plastina, 252A",
    customer_reference: "Perto da praca",
    payment_method: "Pix",
  },
]);

assert.deepEqual(savedProfile, {
  customerName: "Lucas",
  customerAddress: "Rua Antonio Plastina, 252A",
  customerReference: "Perto da praca",
  paymentMethod: "Pix",
});

const savedProfilePrompt = getSavedProfilePrompt(savedProfile, true) || "";
assert.match(savedProfilePrompt, /endere.*usado/i);
assert.match(savedProfilePrompt, /Rua Antonio Plastina, 252A/i);
assert.match(savedProfilePrompt, /Perto da praca/i);
assert.match(savedProfilePrompt, /Pix/i);

console.log("deliveryAIService.image-memory.test.ts ok");
process.exit(0);
