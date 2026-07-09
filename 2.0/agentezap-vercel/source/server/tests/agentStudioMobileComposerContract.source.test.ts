import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readSource = (...parts: string[]) => fs.readFileSync(path.resolve(root, ...parts), "utf8");

const agentStudioSource = readSource("client", "src", "components", "agent-studio-unified.tsx");
const dashboardSource = readSource("client", "src", "pages", "dashboard.tsx");

const mobileTopSwitcherStart = agentStudioSource.indexOf('data-testid="mobile-studio-top-switcher"');
const mobileTopSwitcherEnd = agentStudioSource.indexOf("{/* Main Split View */}", mobileTopSwitcherStart);
const mobileTopSwitcher = agentStudioSource.slice(mobileTopSwitcherStart, mobileTopSwitcherEnd);

const chatSectionStart = agentStudioSource.indexOf("{/* ============ SECTION: CHAT ============ */}");
const chatSectionEnd = agentStudioSource.indexOf("{/* Prompt History Panel */}", chatSectionStart);
const chatSection = agentStudioSource.slice(chatSectionStart, chatSectionEnd);

const bottomNavStart = dashboardSource.indexOf("{/* Mobile bottom navigation */}");
const bottomNavEnd = dashboardSource.indexOf("{/* Menu lateral completo", bottomNavStart);
const bottomNavSection = dashboardSource.slice(bottomNavStart, bottomNavEnd);

const countMatches = (source: string, value: string) => source.split(value).length - 1;

assert.match(
  agentStudioSource,
  /import\s*\{[\s\S]*\bMenu\b[\s\S]*\}\s*from\s*"lucide-react"/,
  "Agent Studio mobile top bar must import the menu icon for the collapsed dashboard menu.",
);

assert.match(
  mobileTopSwitcher,
  /data-testid="button-mobile-dashboard-menu"[\s\S]*openDashboardMobileMenu/,
  "Mobile Agent Studio must expose a hamburger button beside the bot icon.",
);

assert.doesNotMatch(
  mobileTopSwitcher,
  />\s*AgenteZap\s*</,
  "Mobile Agent Studio top bar must not spend horizontal space with the AgenteZap wordmark.",
);

assert.match(
  mobileTopSwitcher,
  />\s*Testar Agente\s*</,
  "Mobile simulator tab must be named Testar Agente.",
);

assert.doesNotMatch(
  agentStudioSource,
  /Simulador WhatsApp/,
  "Agent Studio must not show the old Simulador WhatsApp label.",
);

assert.equal(
  countMatches(agentStudioSource, 'data-testid="button-mobile-editor-more"'),
  1,
  "Mobile editor options must have one three-dot button in the top bar, not a duplicated row.",
);

assert.match(
  agentStudioSource,
  /window\.dispatchEvent\(new CustomEvent\("agentezap:open-mobile-menu"\)\)/,
  "The Agent Studio hamburger must request the dashboard mobile menu.",
);

assert.match(
  dashboardSource,
  /window\.addEventListener\("agentezap:open-mobile-menu", handleOpenMobileMenu\)/,
  "Dashboard must listen for the Agent Studio mobile menu event.",
);

assert.match(
  bottomNavSection,
  /!\s*isMeuAgenteRoute\s*&&\s*\([\s\S]*mobile-bottom-nav/,
  "Dashboard bottom navigation must be hidden on /meu-agente-ia so it does not compete with the composer.",
);

assert.match(
  chatSection,
  /sticky bottom-0[\s\S]*env\(safe-area-inset-bottom\)/,
  "Personalize IA composer must stay fixed at the bottom and respect the mobile safe area.",
);

assert.match(
  chatSection,
  /rounded-\[32px\][\s\S]*min-h-\[64px\][\s\S]*max-h-\[132px\]/,
  "Personalize IA mobile composer must use a compact ChatGPT-style rounded input, not a large card.",
);

assert.match(
  chatSection,
  /absolute bottom-2 right-2[\s\S]*md:hidden/,
  "Personalize IA mobile composer actions must sit inside the input on the right.",
);

assert.match(
  chatSection,
  /rows=\{1\}/,
  "Personalize IA mobile textarea must start as a compact one-row composer.",
);

assert.doesNotMatch(
  chatSection,
  /mt-4 flex flex-wrap justify-center gap-2 md:hidden/,
  "Personalize IA must not show the Mais formal/vendedor/curto quick chips below the mobile composer.",
);

assert.match(
  chatSection,
  /title="Enviar áudio para ajustar o agente"[\s\S]*<Mic className/,
  "Personalize IA composer must keep a microphone action.",
);

assert.match(
  chatSection,
  /title="Enviar instrução"[\s\S]*<Send className/,
  "Personalize IA composer must keep a send action separate from the microphone.",
);

assert.doesNotMatch(
  chatSection,
  /edi[cç][oõ]es restantes/i,
  "Personalize IA must not reintroduce an edit quota message in the mobile composer.",
);

console.log("Agent Studio mobile composer contract passed.");
