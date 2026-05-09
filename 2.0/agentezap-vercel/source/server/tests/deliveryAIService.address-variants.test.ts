import assert from "node:assert/strict";
import {
  estimateDeliveryFee,
  prepareDeliveryAddressForGeocoding,
  type DeliveryConfig,
} from "../deliveryAIService";

const originalFetch = global.fetch;

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const destinationFixtures = [
  {
    label: "av abreviada",
    input: "Lucas, Av Vicente Ferreira, 120",
    prepared: "Avenida Vicente Ferreira, 120, Marilia - SP",
    viacepStreet: "Avenida Vicente Ferreira",
    cep: "17515-120",
    lat: -22.209,
    lon: -49.938,
    distanceKm: 5.8,
  },
  {
    label: "travessa",
    input: "Maria, Travessa Primavera, 45",
    prepared: "Travessa Primavera, 45, Marilia - SP",
    viacepStreet: "Travessa Primavera",
    cep: "17510-111",
    lat: -22.2001,
    lon: -49.9401,
    distanceKm: 4.2,
  },
  {
    label: "alameda",
    input: "Joao, Alameda Almeria, 88",
    prepared: "Alameda Almeria, 88, Marilia - SP",
    viacepStreet: "Alameda Almeria",
    cep: "17514-881",
    lat: -22.205,
    lon: -49.935,
    distanceKm: 5.4,
  },
  {
    label: "praca",
    input: "Lucas, Praca Dona Maria Izabel, 123",
    prepared: "Praca Dona Maria Izabel, 123, Marilia - SP",
    viacepStreet: "Praca Dona Maria Izabel",
    cep: "17509-113",
    lat: -22.214,
    lon: -49.947,
    distanceKm: 3.6,
  },
  {
    label: "estrada",
    input: "Ana, Estrada Municipal Danilo Gonzales, 299",
    prepared: "Estrada Municipal Danilo Gonzales, 299, Marilia - SP",
    viacepStreet: "Estrada Municipal Danilo Gonzales",
    cep: "17523-000",
    lat: -22.184,
    lon: -49.904,
    distanceKm: 9.8,
  },
];

async function run() {
  const fixtureByCep = new Map(destinationFixtures.map(fixture => [fixture.cep.replace(/\D/g, ""), fixture]));

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

      if (query.includes("Praca Dona Maria Izabel")) {
        return jsonResponse([
          {
            lat: "-19.9191",
            lon: "-43.9386",
            address: {
              road: "Praca Dona Maria Izabel",
              city: "Belo Horizonte",
              state_code: "mg",
            },
          },
        ]);
      }

      return jsonResponse([]);
    }

    if (url.includes("viacep.com.br")) {
      const parsed = new URL(url);
      const decodedUrl = decodeURIComponent(parsed.toString());
      const fixture = destinationFixtures.find(entry => decodedUrl.includes(entry.viacepStreet));
      if (!fixture) {
        return jsonResponse([]);
      }

      return jsonResponse([
        {
          cep: fixture.cep,
          logradouro: fixture.viacepStreet,
          bairro: "Centro",
          localidade: "Marilia",
          uf: "SP",
        },
      ]);
    }

    if (url.includes("cep.awesomeapi.com.br")) {
      const parsed = new URL(url);
      const cep = (parsed.pathname.split("/").pop() || "").replace(/\D/g, "");
      const fixture = fixtureByCep.get(cep);
      if (!fixture) {
        return jsonResponse({}, 404);
      }

      return jsonResponse({
        cep,
        address: fixture.viacepStreet,
        city: "Marilia",
        state: "SP",
        lat: String(fixture.lat),
        lng: String(fixture.lon),
      });
    }

    if (url.includes("router.project-osrm.org")) {
      const destination = destinationFixtures.find(entry => {
        const [destinationCoords] = url.split(";").slice(1);
        return destinationCoords?.includes(`${entry.lon},${entry.lat}`);
      });
      if (!destination) {
        return jsonResponse({ routes: [] }, 404);
      }

      return jsonResponse({
        routes: [
          {
            distance: destination.distanceKm * 1000,
          },
        ],
      });
    }

    if (url.includes("geocode.arcgis.com")) {
      return jsonResponse({ candidates: [] });
    }

    throw new Error(`URL inesperada no teste: ${url}`);
  }) as typeof fetch;

  const config: DeliveryConfig = {
    id: "cfg-distance-variants",
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

  for (const fixture of destinationFixtures) {
    const prepared = prepareDeliveryAddressForGeocoding(
      fixture.input,
      "Rua Jose Batista de Almeida Sobrinho, 503, Marilia - SP",
      fixture.input.split(",")[0]
    );

    assert.equal(prepared, fixture.prepared, `endereco preparado incorreto para ${fixture.label}`);

    const result = await estimateDeliveryFee(config, fixture.input);
    assert.equal(result.mode, "distance", `modo incorreto para ${fixture.label}`);
    assert.ok(result.distanceKm !== null, `distancia ausente para ${fixture.label}`);
    assert.ok(Math.abs((result.distanceKm || 0) - fixture.distanceKm) < 0.001, `distancia inesperada para ${fixture.label}: ${result.distanceKm}`);

    const expectedFee = Math.round((2 + Math.max(0, fixture.distanceKm - 2)) * 100) / 100;
    assert.ok(Math.abs(result.fee - expectedFee) < 0.001, `taxa inesperada para ${fixture.label}: ${result.fee}`);
  }
}

run()
  .then(() => {
    console.log("deliveryAIService.address-variants.test.ts ok");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    global.fetch = originalFetch;
  });
