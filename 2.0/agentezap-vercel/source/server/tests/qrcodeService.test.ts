import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://test:test@127.0.0.1:5432/testdb";

const {
  buildWhatsAppUrl,
  normalizePhoneDigits,
  resolveSmartQrcodeState,
} = await import("../qrcodeService");

assert.equal(normalizePhoneDigits("+55 (11) 99876-5432"), "5511998765432");
assert.equal(
  buildWhatsAppUrl("+55 (11) 99876-5432", "Ola! Quero atendimento."),
  "https://wa.me/5511998765432?text=Ola!%20Quero%20atendimento."
);

const createdState = resolveSmartQrcodeState(null, {
  whatsappNumber: "(11) 99876-5432",
  templateId: "imobiliaria",
});

assert.equal(createdState.whatsappNumber, "(11) 99876-5432");
assert.equal(createdState.templateName, "Imobiliária / Corretor");
assert.equal(createdState.welcomeMessage, "Olá! Tenho interesse em imóveis 🏠");
assert.equal(
  createdState.targetUrl,
  "https://wa.me/11998765432?text=Ol%C3%A1!%20Tenho%20interesse%20em%20im%C3%B3veis%20%F0%9F%8F%A0"
);
assert.equal(createdState.shouldRegenerate, true);

const updatedState = resolveSmartQrcodeState(
  {
    whatsappNumber: "5511998765432",
    welcomeMessage: "Ola! Quero saber mais.",
    templateId: "generico",
    templateName: "Negocio Geral",
    foregroundColor: "#2c3e50",
    backgroundColor: "#ffffff",
    errorCorrection: "H",
    qrSize: 1024,
    targetUrl: "https://wa.me/5511998765432?text=Ola!%20Quero%20saber%20mais.",
  },
  {
    templateId: "imobiliaria",
  }
);

assert.equal(updatedState.templateId, "imobiliaria");
assert.equal(updatedState.templateName, "Imobiliária / Corretor");
assert.equal(updatedState.foregroundColor, "#27ae60");
assert.equal(updatedState.welcomeMessage, "Olá! Tenho interesse em imóveis 🏠");
assert.equal(updatedState.shouldRegenerate, true);

const unchangedState = resolveSmartQrcodeState(
  {
    whatsappNumber: "5511998765432",
    welcomeMessage: "Olá! Tenho interesse em imóveis 🏠",
    templateId: "imobiliaria",
    templateName: "Imobiliaria / Corretor",
    foregroundColor: "#27ae60",
    backgroundColor: "#ffffff",
    errorCorrection: "H",
    qrSize: 2048,
    targetUrl:
      "https://wa.me/5511998765432?text=Ol%C3%A1!%20Tenho%20interesse%20em%20im%C3%B3veis%20%F0%9F%8F%A0",
  },
  {}
);

assert.equal(unchangedState.shouldRegenerate, false);

console.log("qrcodeService.test.ts ok");
