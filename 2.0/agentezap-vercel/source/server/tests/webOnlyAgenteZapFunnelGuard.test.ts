import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const httpSource = readFileSync(new URL("../../api/http.ts", import.meta.url), "utf8");

assert.match(
  httpSource,
  /const strictConfiguredFunnelEnabled = getWebOnlyConfiguredSequentialFunnelStages\(mediaLibrary\)\.length > 0;/,
  "funil configurado precisa ser protegido por configuracao de midias, nao por regra comercial de pagamento",
);

assert.doesNotMatch(
  httpSource,
  /function shouldApplyWebOnlySubscriptionPaymentSupportIntent\(/,
  "regra comercial de pagamento/suporte nao deve existir no runtime compartilhado",
);

assert.doesNotMatch(
  httpSource,
  /buildWebOnlySubscriptionPaymentSupportText|Planos > Assinatura|Eu já paguei/,
  "texto de plano/suporte do tenant nao deve ficar hardcoded no simulador compartilhado",
);

assert.doesNotMatch(
  httpSource,
  /strictAgenteZapFunnelEnabled:\s*subscriptionPaymentSupportGuardEnabled/,
  "guarda do funil nao pode depender do guard comercial de assinatura",
);

console.log("webOnlyAgenteZapFunnelGuard.test.ts ok");
