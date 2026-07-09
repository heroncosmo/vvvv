import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "api/http.ts"), "utf8");
const runtimeSource = readFileSync(resolve(process.cwd(), "server/aiAgent.ts"), "utf8");

assert.match(source, /const WEB_ONLY_TENDAS_ELDORADO_USER_ID = "01b3cebc-6f0f-4b29-a324-415a7becce9a"/);
assert.match(source, /function hasWebOnlyTendasEldoradoExplicitSizeMediaRequest/);
assert.match(source, /function isWebOnlyTendasEldoradoLeadInfoWithoutExplicitPriceOrMedia/);
assert.match(source, /function buildWebOnlyTendasEldoradoLeadInfoReply/);
assert.match(source, /function hasWebOnlyTendasEldoradoClosingRequest/);
assert.match(source, /function buildWebOnlyTendasEldoradoSizeMediaReply/);
assert.match(source, /foto\|fotos\|imagem\|imagens\|video\|videos/);
assert.ok(source.includes('return "Ola! Claro, eu te ajudo. Voce busca locacao ou compra da tenda?";'));
assert.ok(!source.includes("Se for locacao, me diga tambem a cidade e a data aproximada."));
assert.match(source, /function resolveWebOnlyTendasEldoradoSizeMediaActions/);
assert.match(source, /if \(!hasWebOnlyTendasEldoradoExplicitSizeMediaRequest\(messageText\)\) \{\s*return \{ matched: false, actions: \[\] \};\s*\}/);
assert.ok(source.includes('{ mediaName: "TENDA_10_X_10", pattern: /\\b10\\s*(?:x|por)\\s*10\\b/, order: 0 }'));
assert.ok(source.includes('{ mediaName: wantsClosing ? "TENDA_5_X_5_COM_FECHAMENTOS" : "TENDA_5_X_5", pattern: /\\b5\\s*(?:x|por)\\s*5\\b/, order: 1 }'));
assert.ok(source.includes('{ mediaName: wantsClosing ? "TENDA_4_X_4_COM_FECHAMENTO" : "TENDA_4_X_4", pattern: /\\b4\\s*(?:x|por)\\s*4\\b/, order: 2 }'));
assert.match(source, /if \(tendasEldoradoSizeMedia\.matched\) \{\s*return tendasEldoradoSizeMedia\.actions;\s*\}/);
assert.match(source, /const finalTendasEldoradoSizeMedia = resolveWebOnlyTendasEldoradoSizeMediaActions/);
assert.match(source, /if \(finalTendasEldoradoSizeMedia\.matched\) \{\s*mediaActions = finalTendasEldoradoSizeMedia\.actions;\s*cleanText = buildWebOnlyTendasEldoradoSizeMediaReply\(message, mediaActions\);\s*\}/);
assert.match(source, /const finalTendasEldoradoSizeOrPrice = false/);
assert.ok(!source.includes("isWebOnlyTendasEldoradoSizeOrPriceRequest"));
assert.ok(!source.includes("buildWebOnlyTendasEldoradoSizeOrPriceReply"));
assert.ok(!source.includes('mode: "toldos_eldorado_size_price_contract"'));
assert.ok(!source.includes("toldos_eldorado_size_price"));
assert.match(source, /if \(tendasEldoradoLeadInfoNoPrice\) \{\s*cleanText = buildWebOnlyTendasEldoradoLeadInfoReply\(\);\s*mediaActions = \[\];\s*\}/);
assert.match(source, /userId,\s*message,\s*responseText: cleanText,\s*mediaLibrary,\s*sentMedias: body\.sentMedias/s);
assert.match(source, /userId: conversation\.userId,\s*message: recentDecisionContext,\s*responseText: cleaned/s);

const locationGuardIndex = source.indexOf("if (isWebOnlyLocationOrVisitTextOnlyRequest(params.message)) return [];");
const tendasResolverIndex = source.indexOf("const tendasEldoradoSizeMedia = resolveWebOnlyTendasEldoradoSizeMediaActions");
assert.ok(locationGuardIndex >= 0, "location/visit text-only guard must exist");
assert.ok(tendasResolverIndex > locationGuardIndex, "Toldos media resolver must preserve the location/visit guard");

assert.match(runtimeSource, /const TENDAS_ELDORADO_RUNTIME_USER_ID = "01b3cebc-6f0f-4b29-a324-415a7becce9a"/);
assert.match(runtimeSource, /function isTendasEldoradoRuntimeLeadInfoWithoutExplicitPriceOrMedia/);
assert.match(runtimeSource, /function applyTendasEldoradoRuntimeMediaGuard/);
assert.match(runtimeSource, /TENDA_5_X_5_COM_FECHAMENTOS/);
assert.match(runtimeSource, /Guard de midia Tendas Eldorado aplicado no runtime stateful/);
assert.match(runtimeSource, /const lateTendasEldoradoRuntimeMediaGuard = applyTendasEldoradoRuntimeMediaGuard/);
assert.match(runtimeSource, /Guard de midia Tendas Eldorado reaplicado no final do runtime stateful/);
assert.ok(!runtimeSource.includes("isTendasEldoradoRuntimeSizeOrPriceRequest"));
assert.ok(!runtimeSource.includes("buildTendasEldoradoRuntimeSizeOrPriceReply"));
assert.ok(!runtimeSource.includes("shouldForceTendasEldoradoSizeOrPriceReply"));
assert.ok(!runtimeSource.includes("earlyTendasEldoradoSizeOrPriceReply"));
assert.ok(!runtimeSource.includes("buildTendasEldoradoRuntimeSizeOrPriceReply(newMessageText)"));
assert.ok(!runtimeSource.includes("Resposta Tendas Eldorado de tamanho/valor aplicada"));
assert.match(runtimeSource, /!tendasEldoradoRuntimeMediaGuardAppliedLate/);
assert.match(runtimeSource, /Midia Tendas Eldorado removida de abertura generica sem pedido de foto\/preco/);

const lateTendasGuardIndex = runtimeSource.indexOf("const lateTendasEldoradoRuntimeMediaGuard = applyTendasEldoradoRuntimeMediaGuard");
const timedGreetingIndex = runtimeSource.indexOf("const shouldForceTimedGreetingBeforeFirstMedia");
assert.ok(!runtimeSource.includes("applyMediaExecutionAlignment"), "runtime nao deve depender do alinhador morto de midia");
assert.ok(lateTendasGuardIndex >= 0, "late Tendas guard must exist");
assert.ok(timedGreetingIndex > lateTendasGuardIndex, "timed greeting must run after the late Tendas media guard");

console.log("toldosEldoradoMediaSelectionPolicy.test.ts ok");
