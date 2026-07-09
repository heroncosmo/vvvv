import assert from "node:assert/strict";
import { buildTicoLocacoesDeterministicTurn, TICO_LOCACOES_USER_ID } from "../ticoLocacoesModule";

const previousLegacyTicoFlag = process.env.AGENTEZAP_ENABLE_LEGACY_TICO_LOCACOES_MODULE;
delete process.env.AGENTEZAP_ENABLE_LEGACY_TICO_LOCACOES_MODULE;

const nonTenant = buildTicoLocacoesDeterministicTurn({
  userId: "00000000-0000-0000-0000-000000000000",
  message: "foto piscina",
});
assert.equal(nonTenant, null);

const tenantDisabledByDefault = buildTicoLocacoesDeterministicTurn({
  userId: TICO_LOCACOES_USER_ID,
  message: "Tem foto da piscina?",
});
assert.equal(tenantDisabledByDefault, null);

process.env.AGENTEZAP_ENABLE_LEGACY_TICO_LOCACOES_MODULE = "true";

const piscina = buildTicoLocacoesDeterministicTurn({
  userId: TICO_LOCACOES_USER_ID,
  message: "Tem foto da piscina?",
});
assert.ok(piscina);
assert.equal(piscina.mode, "tico_locacoes_media");
assert.deepEqual(
  piscina.mediaActions.map((action) => action.media_name),
  ["PISCINA_DE_BOLINHAS_CASINHA", "PISCINA_DE_BOLINHAS_INFLAVEL"],
);
assert.match(piscina.text, /Piscina de Bolinhas Casinha/);
assert.doesNotMatch(piscina.text, /\[MEDIA:|\[ENVIAR/i);

const futebol = buildTicoLocacoesDeterministicTurn({
  userId: TICO_LOCACOES_USER_ID,
  message: "Quero alugar futebol de sabao inflavel, me manda foto e valor",
});
assert.ok(futebol);
assert.deepEqual(
  futebol.mediaActions.map((action) => action.media_name),
  ["FUTEBOL_DE_SABAO_INFLAVEL"],
);
assert.equal(futebol.mediaActions[0]?.type, "send_media_url");
assert.match(futebol.text, /R\$700/);

const camaMedia = buildTicoLocacoesDeterministicTurn({
  userId: TICO_LOCACOES_USER_ID,
  message: "foto e valor da cama elastica M",
});
assert.ok(camaMedia);
assert.deepEqual(
  camaMedia.mediaActions.map((action) => action.media_name),
  ["CAMA_ELASTICA_M"],
);
assert.match(camaMedia.text, /3,00m/);
assert.match(camaMedia.text, /R\$160/);

const camaGenerica = buildTicoLocacoesDeterministicTurn({
  userId: TICO_LOCACOES_USER_ID,
  message: "qual o valor da cama elastica? me manda fotos",
});
assert.ok(camaGenerica);
assert.deepEqual(
  camaGenerica.mediaActions.map((action) => action.media_name),
  ["CAMA_ELASTICA_P", "CAMA_ELASTICA_M", "CAMA_ELASTICA_G"],
);
assert.match(camaGenerica.text, /Cama Elastica P/);
assert.match(camaGenerica.text, /Cama Elastica M/);
assert.match(camaGenerica.text, /Cama Elastica G/);

const contextualPhotos = buildTicoLocacoesDeterministicTurn({
  userId: TICO_LOCACOES_USER_ID,
  message: "Tem foto para me manda",
  contextText: [
    "Cama Elastica P (2,30m): R$150",
    "Piscina de Bolinhas Casinha (1,50x1,50m): R$150",
  ].join("\n"),
});
assert.ok(contextualPhotos);
assert.deepEqual(
  contextualPhotos.mediaActions.map((action) => action.media_name),
  ["CAMA_ELASTICA_P", "PISCINA_DE_BOLINHAS_CASINHA"],
);
assert.match(contextualPhotos.text, /Cama Elastica P/);
assert.match(contextualPhotos.text, /Piscina de Bolinhas Casinha/);

const catalogo = buildTicoLocacoesDeterministicTurn({
  userId: TICO_LOCACOES_USER_ID,
  message: "Quais brinquedos voces tem para festa de crianca de 6 anos? Quero ver fotos e valores",
});
assert.ok(catalogo);
assert.equal(catalogo.mediaActions.length, 15);
assert.ok(catalogo.mediaActions.map((action) => action.media_name).includes("CAMA_ELASTICA_P"));
assert.ok(catalogo.mediaActions.map((action) => action.media_name).includes("MAQUINA_DE_ALGODAO_DOCE"));
assert.ok(catalogo.mediaActions.map((action) => action.media_name).includes("MESAS_E_CADEIRAS"));

const genericGreeting = buildTicoLocacoesDeterministicTurn({
  userId: TICO_LOCACOES_USER_ID,
  message: "Bom dia",
});
assert.equal(genericGreeting, null);

if (previousLegacyTicoFlag === undefined) {
  delete process.env.AGENTEZAP_ENABLE_LEGACY_TICO_LOCACOES_MODULE;
} else {
  process.env.AGENTEZAP_ENABLE_LEGACY_TICO_LOCACOES_MODULE = previousLegacyTicoFlag;
}

console.log("ticoLocacoesModule.test.ts ok");
