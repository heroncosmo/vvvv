import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const httpSource = fs.readFileSync(path.resolve(process.cwd(), "api", "http.ts"), "utf8");

function blockBetween(startMarker: string, endMarker: string): string {
  const start = httpSource.indexOf(startMarker);
  assert.notEqual(start, -1, `Nao encontrou ${startMarker}`);
  const end = httpSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Nao encontrou fim ${endMarker}`);
  return httpSource.slice(start, end);
}

const calculatorGateBlock = blockBetween(
  "function shouldUseWebOnlyAgenticCalculatorTool",
  "function didWebOnlyAgenticTaskCallTool",
);
const optimizerBlock = blockBetween(
  "function isWebOnlyFixedPlanPriceOnlyContext",
  "async function optimizeWebOnlyAgentTextResponse",
);

assert.ok(
  calculatorGateBlock.includes('const activeTextWithoutUrls = activeText.replace(/https?:\\/\\/[^\\s)]+|www\\.[^\\s)]+/gi, " ");'),
  "gate de calculo deve ignorar URLs antes de detectar numeros e operadores",
);

const hasOperatorLine = calculatorGateBlock
  .split(/\r?\n/g)
  .find((line) => line.includes("const hasOperator ="));

assert.ok(hasOperatorLine, "gate de calculo deve definir hasOperator");
assert.ok(
  hasOperatorLine.includes("\\d+(?:[.,]\\d+)?\\s*(?:") &&
    hasOperatorLine.includes("|[+*xX") &&
    hasOperatorLine.includes("\\s*\\d+(?:[.,]\\d+)?") &&
    hasOperatorLine.endsWith(".test(activeTextWithoutUrls);"),
  "gate de calculo deve exigir expressao numerica para tratar / ou = como operador",
);

assert.doesNotMatch(
  calculatorGateBlock,
  /const hasOperator\s*=\s*\/\[\+\*\/=×÷\]\//,
  "gate de calculo nao pode tratar qualquer / ou = em links como calculo",
);

assert.match(
  calculatorGateBlock,
  /numericMatches\s*=\s*activeTextWithoutUrls\.match/,
  "contagem numerica do gate deve usar o texto sem URLs",
);

assert.match(
  calculatorGateBlock,
  /fixedPlanPriceContext[\s\S]*return false/,
  "preco fixo de plano ou assinatura nao deve disparar auditoria agentica de calculo",
);

assert.match(
  calculatorGateBlock,
  /activeUnitOrVariableQuoteContext/,
  "auditoria de calculo deve continuar disponivel para quantidade, periodo, taxa, frete, desconto e medidas",
);

assert.match(
  optimizerBlock,
  /isWebOnlyFixedPlanPriceOnlyContext[\s\S]*return !\/\\b\(calcul\|total\|subtotal/,
  "contexto de plano fixo deve ter detector proprio antes do otimizador",
);

assert.doesNotMatch(
  optimizerBlock,
  /hora\|horas\|diaria\|diarias/,
  "prazo fixo como configuracao completa em 24 horas nao deve transformar plano fixo em auditoria de preco",
);

assert.match(
  httpSource,
  /const fixedPlanPriceOnlyContext = isWebOnlyFixedPlanPriceOnlyContext[\s\S]*const calculatorToolEnabled = fixedPlanPriceOnlyContext \? false : shouldUseWebOnlyAgenticCalculatorTool/,
  "otimizador nao deve chamar auditoria de calculo/preco para plano fixo",
);

console.log("webOnlyAgenticCalculatorGate.source.test.ts: ok");
