import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as assert from 'node:assert/strict';

const root = process.cwd();
const antiBan = readFileSync(resolve(root, 'server/antiBanProtectionService.ts'), 'utf8');
const queue = readFileSync(resolve(root, 'server/messageQueueService.ts'), 'utf8');
const whatsapp = readFileSync(resolve(root, 'server/whatsapp.ts'), 'utf8');

function expectIncludes(haystack: string, needle: string, label: string) {
  assert.ok(haystack.includes(needle), `${label}: missing ${needle}`);
}

expectIncludes(antiBan, 'MIN_DELAY_MS: 10000', 'global anti-ban minimum delay');
expectIncludes(antiBan, 'MAX_DELAY_MS: 20000', 'global anti-ban maximum delay');
expectIncludes(antiBan, 'OWNER_MESSAGE_DELAY_MS: 10000', 'owner manual spacing delay');
expectIncludes(queue, 'const INTERACTIVE_AI_CONTENTION_MIN_DELAY_MS = 10000;', 'interactive AI contention minimum delay');
expectIncludes(queue, 'const INTERACTIVE_AI_CONTENTION_MAX_DELAY_MS = 18000;', 'interactive AI contention random delay');

const manualAdminConversationBlock = /sendAdminConversationMessage[\s\S]*?const sentMessage = await sendWithQueue\(`admin_\$\{adminId\}`, 'admin conversa msg',[\s\S]*?await simulateTyping\(session\.socket, jid, text\.length\);[\s\S]*?session\.socket\.sendMessage\(jid, \{ text \}\)/m;
assert.ok(manualAdminConversationBlock.test(whatsapp), 'admin conversation manual send must simulate typing before sendMessage');

const adminDirectBlock = /sentMessage = await sendWithQueue\(getAdminQueueId\(adminUser\.id\), 'admin msg texto',[\s\S]*?await simulateTyping\(adminSession\.socket!, jid, text\.length\);[\s\S]*?adminSession\.socket!\.sendMessage\(jid, \{ text \}\)/m;
assert.ok(adminDirectBlock.test(whatsapp), 'admin direct text send must keep simulateTyping before sendMessage');

console.log('manual typing/delay contract ok');
