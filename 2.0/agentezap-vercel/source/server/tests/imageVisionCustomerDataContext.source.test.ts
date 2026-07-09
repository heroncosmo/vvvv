import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const apiHttpSource = fs.readFileSync(path.resolve(process.cwd(), "api", "http.ts"), "utf8");
const aiAgentSource = fs.readFileSync(path.resolve(process.cwd(), "server", "aiAgent.ts"), "utf8");
const storageSource = fs.readFileSync(path.resolve(process.cwd(), "server", "storage.ts"), "utf8");

assert.match(
  storageSource,
  /DADOS DO CLIENTE[\s\S]*ENDERECO[\s\S]*CPF\/CNPJ\/documento[\s\S]*telefone[\s\S]*rua[\s\S]*cidade[\s\S]*CEP/,
  "storage image vision prompt must extract customer/address/document data from incoming photos",
);

const storageCustomerDataPromptCount = (
  storageSource.match(/DADOS DO CLIENTE[\s\S]{0,500}CPF\/CNPJ\/documento[\s\S]{0,500}CEP/g) || []
).length;
assert.ok(
  storageCustomerDataPromptCount >= 2,
  "normal and admin storage image vision paths must both extract customer/address/document OCR",
);

assert.match(
  storageSource,
  /Nao confunda CPF\/CNPJ\/documento com valor de pagamento[\s\S]*Valor monetario precisa ter R\$ ou formato claro de dinheiro/,
  "storage image vision prompt must not let document numbers become payment values",
);

assert.match(
  apiHttpSource,
  /dados do cliente[\s\S]*endereco[\s\S]*CPF\/CNPJ\/documento[\s\S]*telefone[\s\S]*rua[\s\S]*cidade[\s\S]*CEP/,
  "web-only incoming image prompt must preserve customer/address/document OCR",
);

assert.match(
  aiAgentSource,
  /contexto\/informação fornecida pelo cliente nesta conversa[\s\S]*prompt\/configuração do tenant/,
  "Codex conversation context must pass analyzed image data as neutral tenant context",
);

assert.doesNotMatch(
  aiAgentSource,
  /pedir somente campos faltantes/,
  "global image context must not impose a tenant-specific next step",
);

assert.doesNotMatch(
  apiHttpSource,
  /se faltarem tamanho, acabamento ou quantidade, pergunte somente esses dados/,
  "web-only image context must not impose catalog next-step behavior globally",
);

assert.match(
  apiHttpSource,
  /CONTEXTO_DE_CATALOGO[\s\S]*contexto\/evidencia da conversa[\s\S]*prompt\/configuracao do tenant/,
  "web-only catalog image context must remain neutral evidence for the tenant prompt",
);

console.log("imageVisionCustomerDataContext.source.test.ts: ok");
