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
      return jsonResponse([]);
    }

    if (url.includes("viacep.com.br")) {
      return jsonResponse([]);
    }

    if (url.includes("cep.awesomeapi.com.br")) {
      return jsonResponse({}, 404);
    }

    if (url.includes("geocode.arcgis.com")) {
      const parsed = new URL(url);
      const query = decodeURIComponent(parsed.searchParams.get("SingleLine") || parsed.searchParams.get("singleLine") || "");

      if (query.includes("Rua Jose Batista de Almeida Sobrinho")) {
        return jsonResponse({
          candidates: [
            {
              address: "Rua Jose Batista de Almeida Sobrinho 503, Marilia, Sao Paulo, 17512-300",
              location: {
                x: -49.9698736,
                y: -22.1676807,
              },
            },
          ],
        });
      }

      if (query.includes("Travessa Primavera, 45")) {
        return jsonResponse({
          candidates: [
            {
              address: "Rua Primavera 45, Grajau, Sao Paulo, 04846-682",
              location: {
                x: -46.668738036728,
                y: -23.757725997715,
              },
            },
          ],
        });
      }

      if (query.includes("Travessa Primavera") && query.includes("Marilia")) {
        return jsonResponse({
          candidates: [
            {
              address: "Primavera, Marilia, Sao Paulo",
              location: {
                x: -49.97639,
                y: -21.99667,
              },
            },
          ],
        });
      }

      return jsonResponse({
        candidates: [
          {
            address: "Estrada Municipal Danilo Gonzales 299, Marilia, Sao Paulo, 17526-699",
            location: {
              x: -49.989429247707,
              y: -22.251230422682,
            },
          },
        ],
      });
    }

    if (url.includes("router.project-osrm.org")) {
      return jsonResponse({
        routes: [
          {
            distance: 8300,
          },
        ],
      });
    }

    throw new Error(`URL inesperada no teste: ${url}`);
  }) as typeof fetch;

  const config: DeliveryConfig = {
    id: "cfg-arcgis-fallback",
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
      originAddress: "Rua Jose Batista de Almeida Sobrinho, 503, Marilia - SP",
      cityContext: "Marilia - SP",
      baseFee: 2,
      baseDistanceKm: 2,
      additionalFeePerKm: 1,
      maxDistanceKm: 20,
      fallbackFee: 0,
    },
  };

  const result = await estimateDeliveryFee(config, "Estrada Municipal Danilo Gonzales, 299");
  assert.equal(result.mode, "distance");
  assert.ok(result.distanceKm !== null);
  assert.ok(Math.abs((result.distanceKm || 0) - 8.3) < 0.001);
  assert.ok(Math.abs(result.fee - 8.3) < 0.001);

  const travessaResult = await estimateDeliveryFee(config, "Travessa Primavera, 45");
  assert.equal(travessaResult.mode, "fallback");
  assert.equal(travessaResult.fee, 0);
  assert.ok((travessaResult.details || "").includes("bairro"));
}

run()
  .then(() => {
    console.log("deliveryAIService.arcgis-fallback.test.ts ok");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    global.fetch = originalFetch;
  });
