import assert from "node:assert/strict";
import { estimateDeliveryFee, type DeliveryConfig } from "../deliveryAIService";

const originalFetch = global.fetch;

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function run() {
  global.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url.includes("nominatim.openstreetmap.org")) {
      const parsed = new URL(url);
      const query = decodeURIComponent(parsed.searchParams.get("q") || "");
      if (query.includes("Rua Jose Batista de Almeida Sobrinho")) {
        return jsonResponse([
          {
            lat: "-22.1676807",
            lon: "-49.9698736",
            address: {
              road: "Rua Jose Batista de Almeida Sobrinho",
              city: "Marilia",
              state_code: "sp",
            },
          },
        ]);
      }

      return jsonResponse([]);
    }

    if (url.includes("viacep.com.br")) {
      return jsonResponse([
        {
          cep: "17512-875",
          logradouro: "Rua Antonio Plastina",
          bairro: "Conjunto Habitacional Lindomar Gomes de Carvalho",
          localidade: "Marilia",
          uf: "SP",
        },
      ]);
    }

    if (url.includes("cep.awesomeapi.com.br")) {
      return jsonResponse({
        cep: "17512875",
        address: "Rua Antonio Plastina",
        city: "Marilia",
        state: "SP",
        lat: "-22.2175846",
        lng: "-49.9505291",
      });
    }

    if (url.includes("router.project-osrm.org")) {
      return jsonResponse({
        routes: [
          {
            distance: 8700,
          },
        ],
      });
    }

    throw new Error(`URL inesperada no teste: ${url}`);
  }) as typeof fetch;

  const config: DeliveryConfig = {
    id: "cfg-distance",
    user_id: "user-distance",
    business_name: "The King dos Sabores",
    business_type: "pizzaria",
    delivery_fee: 2,
    min_order_value: 0,
    estimated_delivery_time: 45,
    accepts_delivery: true,
    accepts_pickup: true,
    accepts_cancellation: false,
    payment_methods: ["dinheiro", "cartao", "pix"],
    is_active: true,
    send_to_ai: true,
    opening_hours: {},
    delivery_fee_settings: {
      mode: "distance",
      originAddress: "Rua Jose Batista de Almeida Sobrinho, 503",
      cityContext: "",
      baseFee: 2,
      baseDistanceKm: 2,
      additionalFeePerKm: 1,
      maxDistanceKm: 15,
      fallbackFee: 0,
    },
  };

  const result = await estimateDeliveryFee(config, "Lucas, Rua Antonio Plastina, 252A");

  assert.equal(result.mode, "distance");
  assert.match(result.label, /^Taxa por dist/i);
  assert.ok(result.distanceKm !== null, "deveria calcular a distancia com fallback postal");
  assert.ok(Math.abs((result.distanceKm || 0) - 8.7) < 0.001, `distancia inesperada: ${result.distanceKm}`);
  assert.ok(Math.abs(result.fee - 8.7) < 0.001, `taxa inesperada: ${result.fee}`);
}

run()
  .then(() => {
    console.log("deliveryAIService.distance.test.ts ok");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    global.fetch = originalFetch;
  });
