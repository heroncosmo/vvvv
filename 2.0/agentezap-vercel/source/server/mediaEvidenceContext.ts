import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { analyzeImageWithMistral, resolveApiKeyCandidates } from "./mistralClient";

const execFileAsync = promisify(execFile);

export type MediaEvidenceContext = {
  mediaType: string | null;
  mimeType: string | null;
  mediaUrl: string;
  kind: "image" | "pdf" | "document" | "other";
  provider:
    | "mistral_ocr"
    | "openai_responses_file_input"
    | "pdf_rendered_image_vision"
    | "image_vision"
    | "metadata_only"
    | "unavailable";
  extractedText: string | null;
  status: "ok" | "skipped" | "failed";
  error?: string;
};

function normalizeMimeType(value?: string | null): string {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

function normalizeMediaType(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function inferKind(params: {
  mediaType?: string | null;
  mimeType?: string | null;
  mediaUrl?: string | null;
}): MediaEvidenceContext["kind"] {
  const mediaType = normalizeMediaType(params.mediaType);
  const mimeType = normalizeMimeType(params.mimeType);
  const path = String(params.mediaUrl || "").split("?", 1)[0].toLowerCase();

  if (mediaType === "image" || mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf" || path.endsWith(".pdf")) return "pdf";
  if (mediaType === "document" || mimeType) return "document";
  return "other";
}

function getOpenAIApiKey(): string {
  return String(process.env.AGENTEZAP_MEDIA_EVIDENCE_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
}

function getMediaEvidenceModel(): string {
  return String(process.env.AGENTEZAP_MEDIA_EVIDENCE_MODEL || "gpt-5.5").trim();
}

function getMediaEvidenceTimeoutMs(): number {
  const parsed = Number(process.env.AGENTEZAP_MEDIA_EVIDENCE_TIMEOUT_MS || "");
  return Number.isFinite(parsed) && parsed >= 5_000 ? Math.min(parsed, 90_000) : 35_000;
}

function getMistralOcrModel(): string {
  return String(process.env.AGENTEZAP_MEDIA_EVIDENCE_MISTRAL_OCR_MODEL || "mistral-ocr-latest").trim();
}

function getPdfDownloadMaxBytes(): number {
  const parsed = Number(process.env.AGENTEZAP_MEDIA_EVIDENCE_PDF_MAX_BYTES || "");
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 25 * 1024 * 1024) : 12 * 1024 * 1024;
}

function getPdfRenderDpi(): number {
  const parsed = Number(process.env.AGENTEZAP_MEDIA_EVIDENCE_PDF_RENDER_DPI || "");
  return Number.isFinite(parsed) && parsed >= 72 ? Math.min(Math.floor(parsed), 200) : 144;
}

function buildVisualReceiptPrompt(): string {
  return [
    "Analise esta imagem como evidencia factual para um atendimento de WhatsApp.",
    "Se for comprovante de pagamento, extraia apenas fatos observaveis: valor, data/hora, pagador, recebedor, instituicoes, identificador/transacao, status visivel e incertezas.",
    "Nao aprove pagamento, nao libere conta, nao escreva mensagem publica e nao invente campos ausentes.",
    "Responda em portugues brasileiro de forma curta.",
  ].join(" ");
}

function extractOpenAIResponseText(data: any): string | null {
  const direct = String(data?.output_text || "").trim();
  if (direct) return direct;

  const output = Array.isArray(data?.output) ? data.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      const text = String(part?.text || part?.content || "").trim();
      if (text) parts.push(text);
    }
  }

  return parts.join("\n").trim() || null;
}

async function analyzePdfWithOpenAIFileInput(params: {
  mediaUrl: string;
  userId?: string | null;
  prompt?: string;
}): Promise<string | null> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getMediaEvidenceTimeoutMs());
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: getMediaEvidenceModel(),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  params.prompt ||
                  [
                    "Analise o arquivo anexado como evidencia factual para um atendimento de WhatsApp.",
                    "Se for comprovante de pagamento, extraia apenas fatos observaveis: valor, data/hora, pagador, recebedor, instituicoes, identificador/transacao, status visivel e incertezas.",
                    "Nao aprove pagamento, nao libere conta, nao escreva mensagem publica e nao invente campos ausentes.",
                    "Responda em portugues brasileiro, curto, em JSON simples com chaves: tipo, resumo, fatos, incertezas.",
                  ].join(" "),
              },
              {
                type: "input_file",
                file_url: params.mediaUrl,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`OpenAI file input failed ${response.status}: ${errorText.slice(0, 240)}`);
    }

    const data = await response.json();
    return extractOpenAIResponseText(data);
  } finally {
    clearTimeout(timeout);
  }
}

async function renderFirstPdfPageToImageDataUrl(params: { mediaUrl: string }): Promise<string | null> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `agentezap-pdf-evidence-${randomUUID()}-`));
  const pdfPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "page");
  const pngPath = `${outputPrefix}.png`;
  const maxBytes = getPdfDownloadMaxBytes();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getMediaEvidenceTimeoutMs());

  try {
    const response = await fetch(params.mediaUrl, {
      headers: { Accept: "application/pdf,*/*" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`download_failed_${response.status}`);
    }

    const contentLength = Number(response.headers.get("content-length") || "");
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`pdf_too_large_${contentLength}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new Error(`pdf_too_large_${buffer.byteLength}`);
    }
    await fs.writeFile(pdfPath, buffer);
    clearTimeout(timeout);

    await execFileAsync(
      "pdftoppm",
      ["-png", "-f", "1", "-l", "1", "-singlefile", "-r", String(getPdfRenderDpi()), pdfPath, outputPrefix],
      { timeout: getMediaEvidenceTimeoutMs() },
    );

    const image = await fs.readFile(pngPath);
    return `data:image/png;base64,${image.toString("base64")}`;
  } finally {
    clearTimeout(timeout);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function analyzePdfByRenderedImage(params: {
  mediaUrl: string;
  userId?: string | null;
}): Promise<string | null> {
  const imageDataUrl = await renderFirstPdfPageToImageDataUrl({ mediaUrl: params.mediaUrl });
  if (!imageDataUrl) return null;
  return await analyzeImageWithMistral(imageDataUrl, buildVisualReceiptPrompt(), params.userId || undefined);
}

function extractMistralOcrText(data: any): string | null {
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  const pageTexts = pages
    .map((page: any, index: number) => {
      const markdown = String(page?.markdown || "").trim();
      if (!markdown) return "";
      return `Pagina ${Number.isFinite(Number(page?.index)) ? Number(page.index) + 1 : index + 1}:\n${markdown}`;
    })
    .filter(Boolean);

  const annotation = String(data?.document_annotation || "").trim();
  const text = [...pageTexts, annotation ? `Anotacao do documento:\n${annotation}` : ""].filter(Boolean).join("\n\n").trim();
  return text || null;
}

async function analyzeDocumentWithMistralOcr(params: {
  mediaUrl: string;
  kind: "pdf" | "image";
  userId?: string | null;
}): Promise<string | null> {
  let candidates: Array<{ apiKey: string; source: string }> = [];
  try {
    candidates = await resolveApiKeyCandidates(params.userId || undefined);
  } catch {
    candidates = [];
  }

  if (candidates.length === 0) {
    return null;
  }

  const document =
    params.kind === "image"
      ? { type: "image_url", image_url: params.mediaUrl }
      : { type: "document_url", document_url: params.mediaUrl };

  for (const candidate of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), getMediaEvidenceTimeoutMs());
    try {
      const response = await fetch("https://api.mistral.ai/v1/ocr", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${candidate.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: getMistralOcrModel(),
          document,
          table_format: "markdown",
          include_image_base64: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.warn(
          `[MediaEvidence] Mistral OCR failed for ${candidate.source}: ${response.status} ${errorText.slice(0, 180)}`,
        );
        continue;
      }

      const data = await response.json();
      const text = extractMistralOcrText(data);
      if (text) return text.slice(0, 12000);
    } catch (error) {
      console.warn(
        `[MediaEvidence] Mistral OCR exception for ${candidate.source}:`,
        error instanceof Error ? error.message : String(error || ""),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

export async function buildMediaEvidenceContext(params: {
  mediaType?: string | null;
  mimeType?: string | null;
  mediaUrl?: string | null;
  userId?: string | null;
}): Promise<MediaEvidenceContext | null> {
  const mediaUrl = String(params.mediaUrl || "").trim();
  if (!mediaUrl) return null;

  const kind = inferKind(params);
  const base = {
    mediaType: params.mediaType ? String(params.mediaType) : null,
    mimeType: params.mimeType ? String(params.mimeType) : null,
    mediaUrl,
    kind,
  };

  try {
    if (kind === "pdf") {
      const ocrText = await analyzeDocumentWithMistralOcr({
        mediaUrl,
        kind: "pdf",
        userId: params.userId,
      });

      if (ocrText) {
        return {
          ...base,
          provider: "mistral_ocr",
          extractedText: ocrText,
          status: "ok",
        };
      }

      const extractedText = await analyzePdfWithOpenAIFileInput({
        mediaUrl,
        userId: params.userId,
      });

      if (extractedText) {
        return {
          ...base,
          provider: "openai_responses_file_input",
          extractedText,
          status: "ok",
        };
      }

      let renderedImageText: string | null = null;
      let renderedImageError: string | null = null;
      try {
        renderedImageText = await analyzePdfByRenderedImage({
          mediaUrl,
          userId: params.userId,
        });
      } catch (error) {
        renderedImageError = error instanceof Error ? error.message.slice(0, 160) : String(error || "").slice(0, 160);
        console.warn("[MediaEvidence] PDF rendered image vision unavailable:", renderedImageError);
      }

      if (renderedImageText) {
        return {
          ...base,
          provider: "pdf_rendered_image_vision",
          extractedText: renderedImageText,
          status: "ok",
        };
      }

      return {
        ...base,
        provider: "metadata_only",
        extractedText: null,
        status: "skipped",
        error: renderedImageError
          ? `pdf_ocr_file_input_and_rendered_vision_unavailable:${renderedImageError}`
          : "pdf_ocr_file_input_and_rendered_vision_unavailable_or_no_text",
      };
    }

    if (kind === "image") {
      const extractedText = await analyzeImageWithMistral(
        mediaUrl,
        buildVisualReceiptPrompt(),
        params.userId || undefined,
      );

      return {
        ...base,
        provider: extractedText ? "image_vision" : "metadata_only",
        extractedText,
        status: extractedText ? "ok" : "skipped",
        error: extractedText ? undefined : "vision_unavailable_or_no_text",
      };
    }

    return {
      ...base,
      provider: "metadata_only",
      extractedText: null,
      status: "skipped",
      error: "unsupported_media_kind",
    };
  } catch (error) {
    return {
      ...base,
      provider: "unavailable",
      extractedText: null,
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 300) : String(error || "").slice(0, 300),
    };
  }
}
