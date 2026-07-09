import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readSource = (...parts: string[]) => fs.readFileSync(path.resolve(root, ...parts), "utf8");

const accessBlockerSource = readSource("client", "src", "components", "access-blocker.tsx");
const dashboardSource = readSource("client", "src", "pages", "dashboard.tsx");
const plansSource = readSource("client", "src", "pages", "plans.tsx");
const publicPlanPricingSource = readSource("client", "src", "lib", "public-plan-pricing.ts");
const premiumOverlaySource = readSource("client", "src", "components", "premium-overlay.tsx");
const agendamento3Source = readSource("client", "src", "pages", "agendamento3-agentic.tsx");
const contactsSource = readSource("client", "src", "pages", "contacts.tsx");
const reservationsSource = readSource("client", "src", "pages", "reservations.tsx");
const leadQualificationSource = readSource("client", "src", "pages", "lead-qualification.tsx");
const integrationsSource = readSource("client", "src", "pages", "integrations.tsx");
const courseSchedulingSource = readSource("client", "src", "pages", "course-scheduling-insights.tsx");
const agendamento2Source = readSource("client", "src", "pages", "agendamento2-insights.tsx");
const connectionPanelSource = readSource("client", "src", "components", "connection-panel.tsx");
const upgradeCtaSource = readSource("client", "src", "components", "upgrade-cta.tsx");
const actionGateSource = readSource("client", "src", "components", "subscription-action-gate.tsx");
const subscriptionGateSource = readSource("client", "src", "lib", "subscription-gate.ts");
const agentStudioSource = readSource("client", "src", "components", "agent-studio-unified.tsx");
const httpSource = readSource("api", "http.ts");
const routesSource = readSource("server", "routes.ts");
const adminPlanPricingSource = readSource("server", "adminPlanPricing.ts");
const adminAgentServiceSource = readSource("server", "adminAgentService.ts");
const notificationSchedulerSource = readSource("server", "notificationSchedulerService.ts");
const whatsappSource = readSource("server", "whatsapp.ts");
const aiAgentSource = readSource("server", "aiAgent.ts");
const subscriptionPlanContextSource = readSource("server", "subscriptionPlanContext.ts");
const rodrigoPlan100kPromptV331Sql = readSource(
  "server",
  "ops",
  "20260709_rodrigo_plan_100k_prompt_v331.sql",
);

const plansAssistantStart = httpSource.indexOf("async function handlePlansAssistantChat");
const plansAssistantSource = plansAssistantStart >= 0 ? httpSource.slice(plansAssistantStart, plansAssistantStart + 10_000) : "";
const renewalPriceNormalizerStart = httpSource.indexOf("function normalizeCheckoutRenewalMonthlyPrice");
const renewalPriceNormalizerSource = renewalPriceNormalizerStart >= 0
  ? httpSource.slice(renewalPriceNormalizerStart, renewalPriceNormalizerStart + 1_200)
  : "";
const mobileBottomNavStart = dashboardSource.indexOf("{/* Mobile bottom navigation */}");
const mobileBottomNavEnd = dashboardSource.indexOf("{/* Menu lateral completo", mobileBottomNavStart);
const mobileBottomNavSection = dashboardSource.slice(mobileBottomNavStart, mobileBottomNavEnd);
const upgradeBannerStart = upgradeCtaSource.indexOf("export function UpgradeBanner()");
const upgradeBannerEnd = upgradeCtaSource.indexOf("export function UpgradeSidebarButton()", upgradeBannerStart);
const upgradeBannerSection = upgradeCtaSource.slice(upgradeBannerStart, upgradeBannerEnd);

assert.doesNotMatch(
  accessBlockerSource,
  /shouldBlockForSubscriptionPayment/,
  "AccessBlocker must not turn expired/pending payment rows into a global panel block for Gratis users.",
);

assert.doesNotMatch(
  accessBlockerSource,
  /accessStatus\?\.isSubscriptionExpired[\s\S]{0,240}shouldBlockAccess/,
  "The frontend must trust the backend access contract; expired paid accounts must not be reclassified locally.",
);

assert.match(
  accessBlockerSource,
  /const isSubscriptionPaymentNotice[\s\S]*subscription_expired[\s\S]*subscription_pending_payment/,
  "AccessBlocker must identify expired and pending-payment subscriptions as navigable billing notices.",
);

assert.match(
  accessBlockerSource,
  /const shouldRedirectToPlans[\s\S]*shouldBlockAccess[\s\S]*!isSubscriptionPaymentNotice/,
  "Expired or pending-payment subscriptions must render the in-page notice instead of being forced to /plans.",
);

assert.match(
  accessBlockerSource,
  /const isPendingPaymentNotice[\s\S]*subscription_pending_payment[\s\S]*Pagamento pendente/,
  "Pending-payment billing notices must not be labeled as a finished free test.",
);

assert.doesNotMatch(
  dashboardSource,
  /subscription-grace-main-overlay|Sua assinatura venceu|startSubscriptionPlansCloseGrace|getSubscriptionPlansCloseGraceUntil/,
  "Closing /plans must not create the old subscription-expired overlay for Gratis accounts.",
);

assert.doesNotMatch(
  plansSource,
  /startSubscriptionPlansCloseGrace|getSubscriptionPlansCloseGraceUntil/,
  "Plans must not arm a forced renewal grace overlay when a Gratis user closes checkout.",
);

assert.doesNotMatch(
  plansSource,
  /Simulador e Personalize com prioridade/,
  "Plans copy must not imply simulator or Personalize enter the slow economy queue.",
);

assert.match(
  publicPlanPricingSource,
  /PUBLIC_LIMITED_100K_PLAN_ID\s*=\s*"b93843cd-5261-43ff-b522-7366b3e95509"/,
  "Public pricing helper must define the limited 100k plan id.",
);

assert.match(
  publicPlanPricingSource,
  /PUBLIC_VISIBLE_PLAN_IDS\s*=\s*new Set\(\[\s*PUBLIC_CONFIGURED_PLAN_ID,\s*\]\)/,
  "The limited 100k plan must not be part of the default public visible plan set.",
);

assert.match(
  plansSource,
  /buildPublicPlansApiPath[\s\S]{0,260}PUBLIC_LIMITED_100K_PLAN_API_PARAM/,
  "Plans page must request the limited 100k plan only through the explicit API unlock parameter.",
);

assert.match(
  plansSource,
  /if \(limited100kPlanUnlocked\) \{[\s\S]{0,120}allowedPublicCatalogPlanIds\.add\(PUBLIC_LIMITED_100K_PLAN_ID\)/,
  "Plans page must only render the limited 100k plan after URL/session unlock.",
);

assert.match(
  httpSource,
  /includeLimited100kPlan[\s\S]{0,700}OR \(\$1::boolean = true AND id = \$2\)[\s\S]{0,220}CHECKOUT_LIMITED_100K_PLAN_ID/,
  "Public plans API must include only the hidden limited 100k plan when explicitly unlocked.",
);

assert.match(
  routesSource,
  /shouldIncludeLimited100kPublicPlan[\s\S]{0,420}includeLimited100kPlan[\s\S]{0,220}plano49[\s\S]{0,620}extraVisiblePlanIds:\s*shouldIncludeLimited100kPublicPlan\(req\)\s*\?\s*\[LIMITED_100K_PUBLIC_PLAN_ID\]\s*:\s*\[\]/,
  "Monolith public plans API must also include the hidden limited 100k plan only through explicit context unlock.",
);

assert.doesNotMatch(
  routesSource,
  /api\/dev\/update-agent-prompt|completeSystemPrompt|normalizedPlanPrompt|REGRAS DE PRECO E LINK DE PLANOS/,
  "Legacy dev prompt overwrite route must not be able to replace Rodrigo/admin prompt with hardcoded sales copy.",
);

assert.match(
  httpSource,
  /buildCheckoutPlanEntitlementMetadata[\s\S]{0,500}limited_100k_ai_messages[\s\S]{0,300}aiMessageTokensMonthlyLimit:\s*100000[\s\S]{0,300}recurringTeamEditsIncluded:\s*false/,
  "Limited 100k checkout subscriptions must carry structured entitlement context for future AI/runtime use.",
);

assert.match(
  httpSource,
  /buildCheckoutPlanEntitlementMetadata[\s\S]{0,900}plus_unlimited_ai[\s\S]{0,260}aiMessagesUnlimited:\s*true[\s\S]{0,260}recurringTeamEditsIncluded:\s*true/,
  "Plus checkout subscriptions must carry structured unlimited AI and recurring-edit entitlement context.",
);

assert.match(
  httpSource,
  /function isCheckoutLimited100kPlanEvidence\([\s\S]{0,500}CHECKOUT_LIMITED_100K_PLAN_ID[\s\S]{0,700}100/,
  "Checkout renewal pricing must recognize the limited 100k plan by catalog evidence before legacy price normalization.",
);

assert.match(
  httpSource,
  /normalizeCheckoutRenewalMonthlyPrice\(highestPaid\.plan_name,\s*rawLastPaidAmount,\s*highestPaid\.plan_id\)/,
  "Checkout renewal pricing must pass plan_id into renewal normalization so R$49,99 100k subscriptions stay on their own plan.",
);

assert.match(
  httpSource,
  /if \(isCheckoutLimited100kPlanEvidence\(planId,\s*planName\)\) \{[\s\S]{0,120}return amount;/,
  "Checkout renewal normalization must preserve the R$49,99 limited 100k amount instead of upgrading it to Plus.",
);

assert.match(
  subscriptionPlanContextSource,
  /Contexto neutro de assinatura\/plano para o Codex CLI vivo[\s\S]*Nenhuma regra local deve inferir oferta/,
  "Subscription plan context must be neutral evidence for Codex, not a local commercial detector.",
);

assert.match(
  subscriptionPlanContextSource,
  /limited_100k_ai_messages[\s\S]{0,260}aiMessageTokensMonthlyLimit:\s*100000[\s\S]{0,260}recurringTeamEditsIncluded:\s*false/,
  "Subscription plan context must expose limited 100k entitlement when the plan is current.",
);

assert.match(
  subscriptionPlanContextSource,
  /plus_unlimited_ai[\s\S]{0,260}aiMessagesUnlimited:\s*true[\s\S]{0,260}recurringTeamEditsIncluded:\s*true/,
  "Subscription plan context must expose Plus unlimited entitlement when the plan is current.",
);

assert.match(
  httpSource,
  /const subscriptionPlanContext = await getSubscriptionWithPlan\(userId\)[\s\S]{0,260}buildSubscriptionPlanContextArtifact/,
  "Web-only/test Codex context must include subscription and plan evidence for the tenant.",
);

assert.match(
  aiAgentSource,
  /loadAiAgentSubscriptionPlanContext[\s\S]{0,900}FROM subscriptions s[\s\S]{0,300}JOIN plans p ON p\.id = s\.plan_id/,
  "WhatsApp Codex context must load subscription and plan evidence without relying on prompt-only memory.",
);

assert.match(
  aiAgentSource,
  /contextArtifacts:\s*\{[\s\S]{0,900}tenantContext: tenantContextArtifact,[\s\S]{0,120}subscriptionPlanContext/,
  "WhatsApp Codex contextArtifacts must pass subscriptionPlanContext next to tenantContext.",
);

assert.match(
  rodrigoPlan100kPromptV331Sql,
  /CALIBRACAO_2026_07_09_RODRIGO_PLANOS_100K_V331[\s\S]*R\$99,99[\s\S]*R\$49,99[\s\S]*100\.000 tokens/,
  "Rodrigo v331 SQL must carry the tenant-only plan context requested by the user.",
);

assert.match(
  rodrigoPlan100kPromptV331Sql,
  /https:\/\/www\.agentezap\.online\/plans\?plano49=1[\s\S]*config_type = 'ai_agent'[\s\S]*version_number/,
  "Rodrigo v331 SQL must version the active ai_agent prompt and expose the hidden plan only through the unlock link.",
);

assert.match(
  rodrigoPlan100kPromptV331Sql,
  /21617303e024b507b33c73bb4536005d[\s\S]*expected_prompt_md5/,
  "Rodrigo v331 SQL must guard against overwriting a prompt changed after the audit.",
);

assert.doesNotMatch(
  plansSource,
  /E quem pagava R\$ 49|7 dias de garantia/,
  "Plans page must not expose old R$49 or 7-day positioning in the public Free/Plus offer.",
);

assert.doesNotMatch(
  premiumOverlaySource,
  /useQuery|fixed\s+(top-0|inset-0)|backdrop-blur|pointer-events-none\s+select-none|Seu per[ií]odo de teste acabou|Seu periodo de teste acabou/,
  "PremiumBlocked must remain a compatibility wrapper only.",
);

assert.doesNotMatch(
  agendamento3Source,
  /PremiumBlocked|Seu per[ií]odo de teste acabou|Seu periodo de teste acabou/,
  "Agendamento 3.0 must be navigable on Gratis; only paid actions can open the upgrade dialog.",
);

assert.match(
  agendamento3Source,
  /data-gated-action="true"[\s\S]*Salvar lembrete/,
  "Agendamento 3.0 must gate activation/save actions instead of blocking the whole page.",
);

for (const [pageName, source] of [
  ["Contatos", contactsSource],
  ["Reservas", reservationsSource],
  ["Fila de Atencao", leadQualificationSource],
  ["Integracoes", integrationsSource],
  ["Cursos", courseSchedulingSource],
  ["Agendamento 2.0", agendamento2Source],
] as const) {
  assert.doesNotMatch(
    source,
    /PremiumBlocked|Seu per[ií]odo de teste acabou|Seu periodo de teste acabou|Ativar Plano Ilimitado/,
    `${pageName} must not wrap the page in legacy full-page premium copy.`,
  );
}

for (const [pageName, source] of [
  ["Contatos", contactsSource],
  ["Reservas", reservationsSource],
] as const) {
  assert.match(
    source,
    /useSubscriptionActionGate[\s\S]*requestUpgrade/,
    `${pageName} paid actions must use the small subscription action gate.`,
  );
}

assert.match(
  mobileBottomNavSection,
  /button-mobile-bottom-whatsapp[\s\S]*WhatsApp/,
  "Mobile bottom navigation must expose WhatsApp connection as a primary action for new users.",
);

assert.doesNotMatch(
  mobileBottomNavSection,
  />Planos<|setLocation\("\/plans"\)/,
  "Mobile bottom navigation must not use Planos as the primary bottom tab.",
);

assert.doesNotMatch(
  upgradeBannerSection,
  /from-blue-600 to-violet-600|p-3 flex items-center justify-between/,
  "Mobile upgrade CTA must stay compact and must not render a full-width banner that pushes the page.",
);

assert.match(
  dashboardSource,
  /const shouldShowEconomyUpgradePill[\s\S]*usageData\.isEconomyMode[\s\S]*usageData\.freeQueue\?\.active/,
  "Mobile/top upgrade CTA must appear only when Gratis is in economy/queue state, not while the normal free experience is active.",
);

assert.match(
  dashboardSource,
  /shouldShowEconomyUpgradePill && !isMeuAgenteRoute && selectedView !== "agent"[\s\S]{0,120}<UpgradeBanner \/>/,
  "Dashboard must use the economy-only upgrade CTA flag before rendering the header pill.",
);

assert.doesNotMatch(
  dashboardSource,
  /!isEffectivelyPaid && !isMeuAgenteRoute && selectedView !== "agent"[\s\S]{0,120}<UpgradeBanner \/>/,
  "Dashboard must not render the upgrade pill for every unpaid Gratis session.",
);

assert.match(
  connectionPanelSource,
  /autoStartedEmptyConnectionFlowRef[\s\S]*startNewConnectionFlow\(\);/,
  "A new account with no WhatsApp connection should automatically open the connection flow.",
);

assert.match(
  plansSource,
  /Mensagens r[aá]pidas e priorit[aá]rias/,
  "Plus plan copy must explain the core paid value: fast prioritized messages plus tools.",
);

assert.match(
  plansSource,
  /key=\{plan\.id\} className="order-1 h-full"/,
  "Paid plans must render before Gratis on mobile and desktop.",
);

assert.match(
  plansSource,
  /className="order-2 h-full"/,
  "Gratis card must remain visible below the paid offer.",
);

assert.match(
  publicPlanPricingSource,
  /PUBLIC_PRO_PLAN_OFFER_AMOUNT\s*=\s*300/,
  "The public Pro checkout offer must be R$300,00, not the old R$349,99.",
);

assert.doesNotMatch(
  publicPlanPricingSource,
  /PUBLIC_PRO_PLAN_ID\)\s*return\s*349\.99/,
  "Frontend Pro pricing helper must not return the old R$349,99 offer.",
);

assert.match(
  plansSource,
  /introOfferPrice:\s*PUBLIC_PRO_PLAN_OFFER_AMOUNT/,
  "Plans page must render the Pro card from the shared R$300 offer constant.",
);

assert.match(
  httpSource,
  /CHECKOUT_PUBLIC_PRO_MONTHLY_PRICE\s*=\s*300/,
  "Backend checkout must use R$300,00 for the Pro public offer.",
);

assert.doesNotMatch(
  httpSource,
  /CHECKOUT_PUBLIC_PRO_PLAN_ID\)\s*return\s*349\.99/,
  "Backend checkout helpers must not return the old R$349,99 Pro offer.",
);

assert.match(
  httpSource,
  /CHECKOUT_LEGACY_PRO_MONTHLY_PRICE\s*=\s*349\.99/,
  "Backend must keep the old R$349,99 Pro price only as a legacy normalization marker.",
);

assert.match(
  renewalPriceNormalizerSource,
  /CHECKOUT_LEGACY_PRO_MONTHLY_PRICE[\s\S]{0,900}CHECKOUT_PUBLIC_PRO_MONTHLY_PRICE/,
  "Legacy R$349,99 Pro renewal pricing must normalize to the current R$300 offer.",
);

assert.match(
  httpSource,
  /Math\.abs\(currentAmount - expectedAmount\) < 0\.01/,
  "Existing plans checkout subscriptions must be corrected when the expected amount changes down or up.",
);

assert.match(
  plansSource,
  /IA ilimitada no atendimento[\s\S]{0,260}Conversas ilimitadas[\s\S]{0,260}Clientes ilimitados[\s\S]{0,260}Mensagens ilimitadas[\s\S]{0,260}Respostas da IA ilimitadas/,
  "Plus card must explain unlimited AI, conversations, clients, messages and AI responses.",
);

assert.match(
  plansSource,
  /shouldShowFreePlusFaq[\s\S]{0,180}currentSubscriptionPlanAmount <= PUBLIC_MAIN_PLUS_PLAN_AMOUNT/,
  "Free/Plus FAQ must be hidden for customers whose current plan is above R$99,99.",
);

assert.doesNotMatch(
  routesSource,
  /FREE_TRIAL_LIMIT\s*=\s*25|trial_limit_reached|limite de 25 mensagens de teste|shouldBlock\s*=\s*accessStatus === 'blocked' \|\| accessStatus === 'expired'/,
  "Legacy /api/access-status in server/routes.ts must not globally block Gratis users after a message counter.",
);

assert.doesNotMatch(
  httpSource,
  /messageLimit:\s*hasActiveSubscription\s*\?\s*-1\s*:\s*25|messagesRemaining:\s*hasActiveSubscription\s*\?\s*-1\s*:\s*Math\.max\(0,\s*25\s*-|agentMessagesCount\s*>=\s*25/,
  "Admin/user payloads must not keep the old 25-message Gratis limit.",
);

assert.match(
  httpSource,
  /PLAN_FEATURE_BLOCKED_METHODS\s*=\s*new Set\(\["POST", "PUT", "PATCH", "DELETE"\]\)/,
  "Backend tool gate must only block paid actions that mutate state, keeping read/navigation open.",
);

for (const apiPrefix of [
  "/api/qrcodes",
  "/api/tags",
  "/api/custom-fields",
  "/api/sectors",
  "/api/products-config",
  "/api/agent/media",
  "/api/audio-config",
  "/api/agent/notification-config",
  "/api/agent/flow",
  "/api/agent/flow2",
  "/api/whatsapp/bulk-send",
  "/api/whatsapp/bulk-send-media",
  "/api/whatsapp/groups/bulk-send",
] as const) {
  assert.match(
    httpSource,
    new RegExp(apiPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `${apiPrefix} mutations must be covered by the backend Plus gate.`,
  );
}

assert.match(
  routesSource,
  /requirePlusPlanForLegacyToolAction[\s\S]{0,900}plan_required/,
  "Legacy monolith routes must have a shared Plus guard for paid tool actions.",
);

for (const legacyBulkRoute of [
  '/api/whatsapp/bulk-send',
  '/api/whatsapp/bulk-send-media',
  '/api/whatsapp/groups/bulk-send',
] as const) {
  assert.match(
    routesSource,
    new RegExp(
      `${legacyBulkRoute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]{0,500}requirePlusPlanForLegacyToolAction`,
    ),
    `${legacyBulkRoute} must reject Gratis users before creating sends/campaigns.`,
  );
}

assert.match(
  subscriptionGateSource,
  /gatePremiumModuleControls[\s\S]{0,700}role === "switch"[\s\S]{0,900}buttonType === "button"/,
  "Frontend action gate must catch switches and icon/button controls inside premium modules.",
);

assert.match(
  actionGateSource,
  /isSubscriptionGatedActionTarget\(target, \{ gatePremiumModuleControls: true \}\)/,
  "Premium action gate must enable stricter module controls for Gratis users.",
);

assert.match(
  httpSource,
  /if \(!subscription \|\| String\(subscription\.status \|\| ""\) !== "active"\) \{[\s\S]{0,500}sendJson\(res, 402,[\s\S]{0,500}plan_required/,
  "Backend tool gate must reject Plus API mutations for Gratis users instead of returning false.",
);

assert.doesNotMatch(
  httpSource,
  /CHECKOUT_ADDON_IDS\.conversationsCrm[\s\S]{0,180}\/api\/conversations|CHECKOUT_ADDON_IDS\.conversationsCrm[\s\S]{0,180}\/api\/messages/,
  "Backend tool gate must not classify core conversations/messages as Plus-only APIs.",
);

assert.match(
  routesSource,
  /trialLimitReached\s*=\s*false[\s\S]{0,700}const shouldBlock\s*=\s*hardAccessBlocked\s*\|\|\s*subscriptionAccessBlocked/,
  "server/routes.ts access-status must keep legacy trial fields non-blocking while hard-blocking suspended/blocked/expired accounts.",
);

assert.doesNotMatch(
  adminAgentServiceSource,
  /www\.agentezap\.online/,
  "Rodrigo/admin service must not hardcode public site direction; plan/site copy belongs to Codex context or the plans surfaces.",
);

assert.doesNotMatch(
  adminAgentServiceSource,
  /NAO mande o cliente pro site|VOCE cria tudo por ele aqui|7 dias de garantia|\bFree\b|\bFREE\b|limite de 25 msgs|25 mensagens gratuitas/,
  "Rodrigo/admin prompt must not keep the old no-site, Free-wording, or 7-day sales flow.",
);

assert.doesNotMatch(
  httpSource,
  /tenho interesse no agentezap[\s\S]{0,120}(?:r\\?\$?\s*49|49|ilimitado|saber mais)|function hasWebOnlySalesEntryIntent|sales_entry_or_link_turn|audio_not_allowed_on_entry_intent/,
  "Web-only runtime must not use local AgenteZap R$49/sales-entry detectors to block media or infer the sales flow; this belongs to Codex context.",
);

assert.doesNotMatch(
  notificationSchedulerSource + whatsappSource,
  /limite de 25 mensagens de teste|limite de 25 mensagens \(plano de teste\)|limite de teste atingido/,
  "Operational scheduler/WhatsApp source must not describe expired plans as the old 25-message trial block.",
);

assert.doesNotMatch(
  adminPlanPricingSource,
  /R\$49|R\$ 49|R\$599|plano-promo-ilimitado-mensal|oferta de 49/,
  "Admin plan pricing must not offer old R$49/R$599 promotional paths to new leads.",
);

assert.match(
  actionGateSource,
  /Continuar no plano gr.tis/,
  "Premium action gate must remain dismissible so Gratis users can keep navigating.",
);

assert.doesNotMatch(
  actionGateSource,
  /Plus R\$|por R\$|99,99/,
  "Premium action gate/modal copy must not show pricing; the price belongs to /plans.",
);

assert.match(
  actionGateSource,
  /O agente continua respondendo normalmente no Modo Econ.mico[\s\S]{0,220}respostas priorit.rias r.pidas/,
  "Premium action gate must explain that Gratis keeps answering in economy mode and Plus restores fast priority.",
);

assert.doesNotMatch(
  actionGateSource,
  /Continuar no Free|plano Free|O Free/,
  "Customer-facing premium action gate copy must use Gratis/plano gratuito in Brazil.",
);

assert.match(
  subscriptionGateSource,
  /function isLockedMyAgentSection[\s\S]*return false;/,
  "Meu Agente IA sections must stay navigable; premium gating belongs to actions, not tabs.",
);

assert.doesNotMatch(
  agentStudioSource,
  /<Lock|border-dashed border-amber/,
  "Meu Agente IA tabs must not render lock icons or amber locked styling for Gratis users.",
);

assert.doesNotMatch(
  agentStudioSource,
  /isLockedMyAgentSection|openLockedSectionUpgrade/,
  "Meu Agente IA must not keep a tab-level subscription gate; only premium actions can open the upgrade dialog.",
);

assert.doesNotMatch(
  agentStudioSource,
  /edi..es restantes hoje|cr.ditos restantes hoje|Voc. atingiu o limite de edi..es|dailyLimits/,
  "Personalize IA must not show or rely on daily edit counters in any plan.",
);

assert.match(
  agentStudioSource,
  /rounded-\[32px\]/,
  "Personalize IA mobile composer must use a compact rounded chat input.",
);

assert.match(
  agentStudioSource,
  /min-h-\[64px\][^\n]*max-h-\[132px\]/,
  "Personalize IA mobile composer must use a compact ChatGPT-style input while preserving desktop sizing.",
);

assert.match(
  agentStudioSource,
  /hidden gap-1\.5 md:flex/,
  "Personalize IA quick action chips inside the composer must be hidden on mobile to avoid duplicate controls.",
);

assert.doesNotMatch(
  agentStudioSource,
  /mt-4 flex flex-wrap justify-center gap-2 md:hidden/,
  "Personalize IA must not render Mais formal/vendedor/curto chips below the mobile composer.",
);

assert.match(
  agentStudioSource,
  /guardMyAgentAction\("salvar instru..es do agente"[\s\S]*guardMyAgentAction\(editingMedia \? "atualizar m.dia do agente"/,
  "Meu Agente IA must gate save/media actions locally while keeping navigation and tests open.",
);

assert.match(
  actionGateSource,
  /const hasKnownActiveSubscription[\s\S]{0,420}accessStatus\?\.accessStatus === "active"[\s\S]{0,420}!hasKnownActiveSubscription[\s\S]{0,120}accessStatus\?\.shouldBlock !== true/,
  "Premium action gate must block Gratis actions by default until a real Plus subscription is known.",
);

assert.match(
  actionGateSource,
  /const accessStatusLoaded = accessStatus !== undefined;[\s\S]{0,180}const subscriptionGateDataReady = accessStatusLoaded;/,
  "Premium action gate must wait for authoritative access-status data before intercepting paid actions.",
);

assert.match(
  actionGateSource,
  /const isActionGateEnabled =[\s\S]{0,220}subscriptionGateDataReady[\s\S]{0,220}!hasKnownActiveSubscription[\s\S]{0,220}accessStatus\?\.shouldBlock !== true/,
  "Premium action gate must stay disabled during loading and only enable for confirmed non-Plus access.",
);

assert.match(
  actionGateSource,
  /useEffect\(\(\) => \{[\s\S]{0,180}if \(isActionGateEnabled \|\| \(!dialogState\.actionLabel && !dialogState\.override\)\)[\s\S]{0,260}setDialogState\(\{[\s\S]{0,100}actionLabel: null,[\s\S]{0,100}override: null/,
  "Premium action gate must close a stale upgrade dialog when active subscription data arrives.",
);

assert.doesNotMatch(
  actionGateSource,
  /accessStatus\?\.hasSubscription === true/,
  "Premium action gate must not treat subscription history as active entitlement.",
);

assert.match(
  httpSource,
  /shouldBlock:\s*hardAccessBlocked\s*\|\|\s*subscriptionAccessBlocked/,
  "Backend access status must hard-block expired subscriptions without blocking normal Gratis.",
);

assert.match(
  plansAssistantSource,
  /Gratis permanente[\s\S]{0,500}Plus: R\$99,99\/mes[\s\S]{0,600}www\.agentezap\.online/,
  "Plans assistant must explain the current Gratis + Plus R$99,99 offer.",
);

assert.doesNotMatch(
  plansAssistantSource,
  /R\$49,99|R\$199,99|24 meses|ADICIONAL PRO|adicional Pro|7 dias|recursos ilimitados|adicionais/,
  "Plans assistant must not carry the old R$49/R$199/PRO plan ladder.",
);

assert.match(
  subscriptionGateSource,
  /currentPath === "\/conexao"[\s\S]{0,120}return null;/,
  "WhatsApp connection must remain part of the Gratis basic path, not a Plus action module.",
);

assert.match(
  subscriptionGateSource,
  /currentPath === "\/meu-agente-ia"[\s\S]{0,120}return null;/,
  "Meu Agente IA and Personalize must remain part of the Gratis basic path, not a Plus action module.",
);

assert.doesNotMatch(
  routesSource,
  /items\?\.map\(i => i\.name\.toLowerCase\(\)|products\?\.map\(p => p\.name\.toLowerCase\(\)/,
  "Legacy Personalize context must normalize nullable menu/product names before toLowerCase.",
);

assert.match(
  routesSource,
  /hasActiveSubscription[\s\S]{0,120}hasSubscription:/,
  "Access status must expose active entitlement separately from subscription history.",
);

console.log("freePlusAccessGateContract source contract ok");
