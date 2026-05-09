import assert from "node:assert/strict";
import {
  extractBrazilianCityContextFromFreeText,
  extractPromptAddressCandidate,
  parseBrazilianCityContext,
} from "../deliveryAIService";

async function run() {
  assert.deepEqual(parseBrazilianCityContext("Marilia SP"), {
    city: "Marilia",
    stateCode: "SP",
  });

  assert.equal(
    extractBrazilianCityContextFromFreeText(
      "Estamos localizados na Rua Jose Batista de Almeida Sobrinho, 503, Marilia SP. Atendimento via WhatsApp."
    ),
    "Marilia - SP"
  );

  assert.equal(
    extractPromptAddressCandidate(
      "Estamos localizados na Rua Jose Batista de Almeida Sobrinho, 503, Marilia SP. Atendimento via WhatsApp."
    ),
    "Rua Jose Batista de Almeida Sobrinho, 503, Marilia - SP"
  );

  assert.equal(
    extractPromptAddressCandidate(
      "Peça o endereço no formato rua, número e bairro. CONTEXTO: Você é o assistente da loja localizada na Rua Jose Batista de Almeida Sobrinho, 503, Marilia/SP. Venda com rapidez."
    ),
    "Rua Jose Batista de Almeida Sobrinho, 503, Marilia - SP"
  );
}

run()
  .then(() => {
    console.log("deliveryAIService.city-context.test.ts ok");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
