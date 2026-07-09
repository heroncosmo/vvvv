import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mediaEvidenceSource = readFileSync(join(process.cwd(), "server", "mediaEvidenceContext.ts"), "utf8");
const toolCallingSource = readFileSync(join(process.cwd(), "server", "adminAgentToolCalling.ts"), "utf8");
const adminAgentServiceSource = readFileSync(join(process.cwd(), "server", "adminAgentService.ts"), "utf8");
const whatsappSource = readFileSync(join(process.cwd(), "server", "whatsapp.ts"), "utf8");
const dockerfileSource = readFileSync(join(process.cwd(), "Dockerfile.vps"), "utf8");

assert.match(
  mediaEvidenceSource,
  /https:\/\/api\.openai\.com\/v1\/responses[\s\S]*type:\s*"input_file"[\s\S]*file_url:\s*params\.mediaUrl/,
  "PDF evidence extraction must use OpenAI Responses file input with file_url",
);

assert.match(
  mediaEvidenceSource,
  /PDF files[\s\S]*kind === "pdf"|kind === "pdf"[\s\S]*openai_responses_file_input/,
  "PDF media must have a dedicated evidence path before falling back to metadata only",
);

assert.match(
  mediaEvidenceSource,
  /mistral-ocr-latest[\s\S]*document_url[\s\S]*https:\/\/api\.mistral\.ai\/v1\/ocr[\s\S]*provider:\s*"mistral_ocr"/,
  "PDF evidence extraction must try Mistral OCR before falling back to OpenAI file input",
);

assert.match(
  mediaEvidenceSource,
  /pdftoppm[\s\S]*data:image\/png;base64[\s\S]*provider:\s*"pdf_rendered_image_vision"/,
  "PDF evidence extraction must render the first PDF page to PNG and run image vision when OCR/file input do not produce text",
);

assert.match(
  mediaEvidenceSource,
  /try\s*\{[\s\S]*analyzePdfByRenderedImage[\s\S]*catch \(error\)[\s\S]*pdf_ocr_file_input_and_rendered_vision_unavailable/,
  "PDF rendered-image fallback errors must degrade to metadata_only evidence instead of failing the whole media context",
);

assert.match(
  dockerfileSource,
  /poppler-utils/,
  "production runtime image must include poppler-utils so pdftoppm can render PDF evidence",
);

assert.match(
  mediaEvidenceSource,
  /Nao aprove pagamento, nao libere conta, nao escreva mensagem publica/,
  "media evidence extraction must not approve payments or author public messages",
);

assert.match(
  mediaEvidenceSource,
  /kind === "image"[\s\S]*analyzeImageWithMistral/,
  "image evidence must reuse the existing vision pipeline",
);

assert.match(
  toolCallingSource,
  /import \{ buildMediaEvidenceContext \} from '\.\/mediaEvidenceContext';/,
  "admin tool-calling runtime must import the media evidence helper",
);

assert.match(
  toolCallingSource,
  /mediaFromRecentBuffer[\s\S]*const mediaMimeType[\s\S]*buildMediaEvidenceContext\(\{[\s\S]*mediaType,[\s\S]*mimeType:\s*mediaMimeType \|\| undefined,[\s\S]*mediaUrl,[\s\S]*userId/,
  "admin tool-calling runtime must build neutral media evidence for current media",
);

assert.match(
  toolCallingSource,
  /approveVisualPaymentReceiptFromWhatsApp\(\{[\s\S]*mimeTypeHint: params\.mediaMimeType \|\| params\.mediaEvidence\.mimeType \|\| undefined/,
  "visual payment receipt approval must preserve the current media MIME type",
);

assert.match(
  toolCallingSource,
  /mime="\$\{mediaMimeType\}"[\s\S]*Evidencia neutra extraida da midia atual[\s\S]*currentMediaEvidence\.extractedText[\s\S]*slice\(0, 6000\)/,
  "Codex live transcript must receive bounded neutral media evidence",
);

assert.match(
  toolCallingSource,
  /contextArtifacts:\s*\{[\s\S]*currentMediaEvidence: currentMediaEvidence \|\| null[\s\S]*mediaMimeType: mediaMimeType \|\| null/,
  "Codex context artifacts must include currentMediaEvidence",
);

assert.match(
  adminAgentServiceSource,
  /processAdminMessage\([\s\S]*mediaMimeType\?: string \| null[\s\S]*processToolCallingMessage\([\s\S]*\{ mediaMimeType: mediaMimeType \|\| undefined \}/,
  "admin agent service must pass media MIME type into tool-calling runtime options",
);

assert.match(
  whatsappSource,
  /interface PendingAdminMessage[\s\S]*mediaMimeType\?: string \| null[\s\S]*scheduleAdminAccumulatedResponse[\s\S]*mediaMimeType\?: string \| null[\s\S]*accMediaMimeType[\s\S]*processAdminMessage\([\s\S]*accMediaMimeType/,
  "WhatsApp admin accumulator must preserve media MIME type until processAdminMessage",
);

console.log("mediaEvidenceContext.source.test.ts ok");
