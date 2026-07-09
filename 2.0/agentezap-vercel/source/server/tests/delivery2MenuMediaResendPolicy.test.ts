import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "api/http.ts"), "utf8");
const runtimeSource = readFileSync(resolve(process.cwd(), "server/delivery2MediaService.ts"), "utf8");

assert.match(source, /const WEB_ONLY_DELIVERY2_MENU_FLOW_NAME = "DELIVERY2_CARDAPIO"/);
assert.match(source, /const WEB_ONLY_DELIVERY2_BEVERAGES_MEDIA_NAME = "BEBIDAS_DELIVERY2"/);
assert.match(source, /function hasWebOnlyDelivery2MenuRequest/);
assert.match(source, /function hasWebOnlyDelivery2BeverageOffer/);
assert.match(source, /function getWebOnlyDelivery2Config/);
assert.match(source, /function resolveWebOnlyDelivery2MenuMediaActions/);
assert.match(source, /\\b\(cardapio\|menu\|catalogo\|pizzas\|sabores\)\\b/);
assert.match(source, /\\b\(\?:novo\|outro\|proximo\)\\s\+pedido\\b/);
assert.match(source, /menuAutoSendOnGreeting/);
assert.match(source, /isWebOnlySimpleGreetingMessage\(params\.message\)/);
assert.match(source, /hasWebOnlyDelivery2BeverageOffer\(params\.responseText\)/);
assert.match(source, /media_name: beverageMedia\.name/);
assert.match(source, /const mediaUrl = String\(action\?\.media_url \|\| action\?\.mediaUrl \|\| ""\)\.trim\(\);/);
assert.match(source, /\? \(mediaUrl \? `media:\$\{mediaName\}:\$\{mediaUrl\}` : `media:\$\{mediaName\}`\)/);
assert.match(source, /let finalDelivery2MenuMediaActions: any\[\] = \[\];/);
assert.match(source, /finalDelivery2MenuMediaActions = await resolveWebOnlyDelivery2MenuMediaActions/);
assert.match(source, /mediaActions = mergeWebOnlyMediaActions\(finalDelivery2MenuMediaActions, mediaActions\);/);
assert.match(source, /delivery2MenuMedia: finalDelivery2MenuMediaActions\.length > 0/);

assert.match(runtimeSource, /export const DELIVERY2_BEVERAGES_MEDIA_NAME = "BEBIDAS_DELIVERY2"/);
assert.match(runtimeSource, /export async function buildDelivery2CodexContext/);
assert.match(runtimeSource, /module:\s*"delivery_2_0"/);
assert.match(runtimeSource, /actionType:\s*"send_media"/);
assert.match(runtimeSource, /actionArguments:\s*\{ mediaName \}/);
assert.doesNotMatch(runtimeSource, /USER_ID|marcelpinheiroadm|ESTACAO_PIZZA_USER_ID/);
assert.match(runtimeSource, /function responseOffersBeverages/);
assert.match(runtimeSource, /responseText\?: string \| null/);
assert.match(runtimeSource, /responseOffersBeverages\(params\.responseText\)/);
assert.match(runtimeSource, /media_name: DELIVERY2_BEVERAGES_MEDIA_NAME/);

console.log("delivery2MenuMediaResendPolicy.test.ts ok");
