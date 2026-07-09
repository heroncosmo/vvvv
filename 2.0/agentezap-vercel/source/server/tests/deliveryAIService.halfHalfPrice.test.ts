import assert from "node:assert/strict";

import {
  applyDeliveryResponseTenantGuards,
  generateDeliveryResponse,
  type DeliveryAIResponse,
  type DeliveryData,
} from "../deliveryAIService";
import { VICOSA_PIZZA_USER_ID } from "../vicosaPizzaResponseGuard";

const sizeOptions = [
  { name: "Pequena (P)", price: 25 },
  { name: "Grande (G)", price: 31 },
];

const deliveryData: DeliveryData = {
  config: {
    id: "delivery-1",
    user_id: "tenant-1",
    business_name: "Pizzaria Teste",
    business_type: "pizzaria",
    delivery_fee: 0,
    min_order_value: 0,
    estimated_delivery_time: 30,
    accepts_delivery: true,
    accepts_pickup: true,
    accepts_cancellation: true,
    payment_methods: ["pix", "dinheiro"],
    is_active: true,
    opening_hours: {},
    menu_send_mode: "text",
  },
  totalItems: 2,
  categories: [
    {
      name: "Pizzas",
      items: [
        {
          id: "calabresa",
          name: "Calabresa",
          description: null,
          price: 25,
          category_name: "Pizzas",
          is_highlight: false,
          is_available: true,
          options: [
            {
              name: "Tamanho",
              type: "single",
              required: true,
              options: sizeOptions,
            },
          ],
        },
        {
          id: "frango-catupiry",
          name: "Frango com Catupiry",
          description: null,
          price: 26,
          category_name: "Pizzas",
          is_highlight: false,
          is_available: true,
          options: [
            {
              name: "Tamanho",
              type: "single",
              required: true,
              options: [
                { name: "Pequena (P)", price: 26 },
                { name: "Grande (G)", price: 33 },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const halfHalf = await generateDeliveryResponse(
  "tenant-1",
  "quero uma pizza grande meio a meio calabresa e frango",
  "HALF_HALF",
  deliveryData,
  "",
);

const halfHalfText = halfHalf.bubbles.join("\n");
assert.match(halfHalfText, /Calabresa/i);
assert.match(halfHalfText, /Frango com Catupiry/i);
assert.match(halfHalfText, /R\$ 33,00/);
assert.doesNotMatch(halfHalfText, /R\$ 31,00/);
assert.equal(halfHalf.metadata?.halfHalfPrice, 33);

const badVicosaFee: DeliveryAIResponse = {
  intent: "OTHER",
  bubbles: ["A entrega e em 45 minutos e a taxa de entrega e R$ 0,00."],
};
const guardedFee = applyDeliveryResponseTenantGuards(
  VICOSA_PIZZA_USER_ID,
  "Qual o prazo de entrega e qual a taxa?",
  badVicosaFee,
);

assert.match(guardedFee.bubbles.join("\n"), /30 minutos/);
assert.match(guardedFee.bubbles.join("\n"), /loja confirma/i);
assert.doesNotMatch(guardedFee.bubbles.join("\n"), /R\$ 0,00|45 minutos/);
assert.deepEqual(guardedFee.metadata?.tenantResponseGuard?.vicosaPizza, ["delivery_fee_final_by_store"]);

console.log("deliveryAIService.halfHalfPrice.test.ts ok");
process.exit(0);
