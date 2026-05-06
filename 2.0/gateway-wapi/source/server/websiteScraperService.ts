/**
 * 🌐 WEBSITE SCRAPER SERVICE
 * Serviço para extrair dados de websites e alimentar o agente IA
 * Usa Playwright para sites dinâmicos e LLM configurado (Groq/Mistral) para processar o conteúdo
 */

import { chromium, Browser, Page } from "playwright";
import { generateWithLLM } from "./llm";

// ============================================================================
// TIPOS
// ============================================================================

export interface ExtractedProduct {
  name: string;
  description?: string;
  price?: string;
  priceValue?: number;
  currency?: string;
  category?: string;
  imageUrl?: string;
  availability?: string;
  features?: string[];
}

export interface ExtractedBusinessInfo {
  businessName?: string;
  businessDescription?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  workingHours?: string;
  socialMedia?: Record<string, string>;
  paymentMethods?: string[];
  shippingInfo?: string;
  returnPolicy?: string;
  categories?: string[];
}

export interface WebsiteScrapingResult {
  success: boolean;
  websiteUrl: string;
  websiteName?: string;
  websiteDescription?: string;
  extractedText: string;
  extractedHtml?: string;
  products: ExtractedProduct[];
  businessInfo: ExtractedBusinessInfo;
  formattedContext: string;
  pagesScraped: number;
  productsFound: number;
  error?: string;
}

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

const SCRAPER_CONFIG = {
  timeout: 30000, // 30 segundos
  maxRetries: 3,
  maxTextLength: 50000, // Limitar texto extraído
  maxHtmlLength: 100000, // Limitar HTML armazenado
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// ============================================================================
// FUNÇÕES DE SCRAPING
// ============================================================================

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/**
 * Valida se a URL é acessível e segura
 */
export function validateUrl(url: string): { valid: boolean; error?: string; normalizedUrl?: string } {
  try {
    // Normalizar URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    const parsed = new URL(normalizedUrl);

    // Validações básicas
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "Protocolo inválido. Use http ou https." };
    }

    // Bloquear URLs suspeitas
    const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "192.168.", "10.", "172."];
    if (blockedHosts.some((h) => parsed.hostname.includes(h))) {
      return { valid: false, error: "URL de rede local não permitida." };
    }

    return { valid: true, normalizedUrl };
  } catch (error) {
    return { valid: false, error: "URL inválida. Verifique o formato." };
  }
}

/**
 * Extrai texto limpo de uma página
 */
async function extractTextFromPage(page: Page): Promise<string> {
  // Remover scripts, styles e elementos desnecessários
  const text = await page.evaluate(() => {
    // Remover elementos que não queremos
    const removeSelectors = [
      "script",
      "style",
      "noscript",
      "iframe",
      "nav",
      "header",
      "footer",
      ".cookie-banner",
      ".popup",
      ".modal",
      "#cookie",
      ".advertisement",
      ".ad",
    ];

    removeSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => el.remove());
    });

    // Extrair texto
    return document.body?.innerText || "";
  });

  // Limpar texto
  return text
    .replace(/\s+/g, " ")
    .replace(/\n+/g, "\n")
    .trim()
    .slice(0, SCRAPER_CONFIG.maxTextLength);
}

/**
 * Extrai JSON-LD de produtos (schema.org)
 */
async function extractJsonLdProducts(page: Page): Promise<ExtractedProduct[]> {
  const products: ExtractedProduct[] = [];

  try {
    const jsonLdScripts = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
      scripts.map((s) => s.textContent).filter(Boolean)
    );

    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script || "{}");
        
        // Verificar se é um produto ou lista de produtos
        if (data["@type"] === "Product") {
          products.push(parseJsonLdProduct(data));
        } else if (Array.isArray(data["@graph"])) {
          for (const item of data["@graph"]) {
            if (item["@type"] === "Product") {
              products.push(parseJsonLdProduct(item));
            }
          }
        } else if (data["@type"] === "ItemList" && data.itemListElement) {
          for (const item of data.itemListElement) {
            if (item["@type"] === "Product" || item.item?.["@type"] === "Product") {
              products.push(parseJsonLdProduct(item.item || item));
            }
          }
        }
      } catch {
        // Ignorar JSON inválido
      }
    }
  } catch (error) {
    console.error("[WebsiteScraper] Error extracting JSON-LD:", error);
  }

  return products;
}

function parseJsonLdProduct(data: any): ExtractedProduct {
  const price = data.offers?.price || data.offers?.[0]?.price;
  const currency = data.offers?.priceCurrency || data.offers?.[0]?.priceCurrency || "BRL";

  return {
    name: data.name || "",
    description: data.description || "",
    price: price ? `${currency} ${price}` : undefined,
    priceValue: price ? parseFloat(price) : undefined,
    currency,
    category: data.category || data.brand?.name,
    imageUrl: Array.isArray(data.image) ? data.image[0] : data.image,
    availability: data.offers?.availability || data.offers?.[0]?.availability,
  };
}

/**
 * Extrai produtos usando seletores comuns de e-commerce
 */
async function extractProductsBySelectors(page: Page): Promise<ExtractedProduct[]> {
  const products: ExtractedProduct[] = [];

  try {
    // Seletores comuns de e-commerce
    const productSelectors = [
      ".product",
      ".product-item",
      ".product-card",
      "[data-product]",
      ".item-product",
      ".produto",
      ".card-produto",
    ];

    for (const selector of productSelectors) {
      const elements = await page.$$(selector);
      
      for (const element of elements.slice(0, 50)) {
        // Limitar a 50 produtos
        try {
          const product = await element.evaluate((el) => {
            // Tentar extrair nome
            const nameEl =
              el.querySelector("h1, h2, h3, h4, .product-name, .product-title, .nome, .title") ||
              el.querySelector("a[title]");
            const name =
              nameEl?.textContent?.trim() ||
              (nameEl as HTMLAnchorElement)?.title ||
              "";

            // Tentar extrair preço
            const priceEl = el.querySelector(
              ".price, .preco, .valor, [data-price], .product-price"
            );
            const priceText = priceEl?.textContent?.trim() || "";
            
            // Extrair valor numérico do preço
            const priceMatch = priceText.match(/[\d.,]+/);
            const priceValue = priceMatch
              ? parseFloat(priceMatch[0].replace(/\./g, "").replace(",", "."))
              : undefined;

            // Tentar extrair imagem
            const imgEl = el.querySelector("img");
            const imageUrl = imgEl?.src || imgEl?.getAttribute("data-src") || "";

            // Tentar extrair descrição
            const descEl = el.querySelector(".description, .descricao, .desc, p");
            const description = descEl?.textContent?.trim() || "";

            return { name, priceText, priceValue, imageUrl, description };
          });

          if (product.name && product.name.length > 2) {
            products.push({
              name: product.name,
              description: product.description,
              price: product.priceText,
              priceValue: product.priceValue,
              currency: "BRL",
              imageUrl: product.imageUrl,
            });
          }
        } catch {
          // Ignorar elemento com erro
        }
      }

      if (products.length > 0) break; // Se encontrou produtos, parar
    }
  } catch (error) {
    console.error("[WebsiteScraper] Error extracting by selectors:", error);
  }

  return products;
}

/**
 * Extrai informações do negócio
 */
async function extractBusinessInfo(page: Page, text: string): Promise<ExtractedBusinessInfo> {
  const info: ExtractedBusinessInfo = {};

  try {
    // Extrair do JSON-LD
    const jsonLdScripts = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
      scripts.map((s) => s.textContent).filter(Boolean)
    );

    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script || "{}");
        if (data["@type"] === "Organization" || data["@type"] === "LocalBusiness") {
          info.businessName = data.name;
          info.businessDescription = data.description;
          info.contactPhone = data.telephone;
          info.contactEmail = data.email;
          info.address = typeof data.address === "string" 
            ? data.address 
            : data.address?.streetAddress;
        }
      } catch {
        // Ignorar
      }
    }

    // Extrair redes sociais
    const socialLinks = await page.$$eval("a[href]", (links) => {
      const social: Record<string, string> = {};
      const patterns: Record<string, RegExp> = {
        instagram: /instagram\.com/,
        facebook: /facebook\.com/,
        twitter: /twitter\.com|x\.com/,
        youtube: /youtube\.com/,
        linkedin: /linkedin\.com/,
        whatsapp: /wa\.me|whatsapp/,
      };

      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        for (const [name, pattern] of Object.entries(patterns)) {
          if (pattern.test(href) && !social[name]) {
            social[name] = href;
          }
        }
      }

      return social;
    });

    if (Object.keys(socialLinks).length > 0) {
      info.socialMedia = socialLinks;
    }

    // Extrair título da página como nome do negócio (fallback)
    if (!info.businessName) {
      const title = await page.title();
      info.businessName = title.split("|")[0].split("-")[0].trim();
    }

    // Extrair meta description
    if (!info.businessDescription) {
      const metaDesc = await page.$eval(
        'meta[name="description"]',
        (el) => el.getAttribute("content")
      ).catch(() => null);
      
      if (metaDesc) {
        info.businessDescription = metaDesc;
      }
    }

    // Tentar extrair telefone e email do texto
    const phoneMatch = text.match(/(?:\+55\s?)?(?:\(?\d{2}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}/);
    if (phoneMatch && !info.contactPhone) {
      info.contactPhone = phoneMatch[0];
    }

    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (emailMatch && !info.contactEmail) {
      info.contactEmail = emailMatch[0];
    }
  } catch (error) {
    console.error("[WebsiteScraper] Error extracting business info:", error);
  }

  return info;
}

// ============================================================================
// PROCESSAMENTO COM MISTRAL
// ============================================================================

/**
 * Usa Mistral para extrair produtos do texto quando JSON-LD não está disponível
 */
export async function extractProductsWithMistral(
  text: string
): Promise<ExtractedProduct[]> {
  const systemPrompt = `Você é um especialista em extrair dados de produtos de textos de websites de e-commerce.
Analise o texto fornecido e extraia TODOS os produtos encontrados.

IMPORTANTE:
- Extraia APENAS produtos reais mencionados no texto
- Inclua nome, preço (se disponível), descrição curta
- Retorne um JSON válido com array de produtos
- Se não encontrar produtos, retorne array vazio []
- Máximo de 50 produtos

Formato de resposta (JSON puro, sem markdown):
[
  {
    "name": "Nome do Produto",
    "price": "R$ 99,90",
    "priceValue": 99.90,
    "description": "Descrição curta",
    "category": "Categoria"
  }
]`;

  try {
    const response = await generateWithLLM(
      systemPrompt,
      `Extraia os produtos deste texto de website:\n\n${text.slice(0, 15000)}`,
      { maxTokens: 4000, temperature: 0.1 }
    );

    // Tentar extrair JSON da resposta
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return [];
  } catch (error) {
    console.error("[WebsiteScraper] Error extracting with LLM:", error);
    return [];
  }
}

/**
 * Formata o contexto extraído para usar no prompt do agente
 */
export function formatContextForAgent(
  products: ExtractedProduct[],
  businessInfo: ExtractedBusinessInfo,
  websiteUrl: string
): string {
  let context = `\n\n## 📦 CATÁLOGO DE PRODUTOS/SERVIÇOS (Importado de: ${websiteUrl})\n`;

  // Informações do negócio
  if (businessInfo.businessName) {
    context += `\n### Sobre o Negócio\n`;
    if (businessInfo.businessName) context += `- **Nome:** ${businessInfo.businessName}\n`;
    if (businessInfo.businessDescription) context += `- **Descrição:** ${businessInfo.businessDescription}\n`;
    if (businessInfo.contactPhone) context += `- **Telefone:** ${businessInfo.contactPhone}\n`;
    if (businessInfo.contactEmail) context += `- **Email:** ${businessInfo.contactEmail}\n`;
    if (businessInfo.address) context += `- **Endereço:** ${businessInfo.address}\n`;
    if (businessInfo.workingHours) context += `- **Horário:** ${businessInfo.workingHours}\n`;
    
    if (businessInfo.socialMedia && Object.keys(businessInfo.socialMedia).length > 0) {
      context += `- **Redes Sociais:**\n`;
      for (const [name, url] of Object.entries(businessInfo.socialMedia)) {
        context += `  - ${name}: ${url}\n`;
      }
    }
  }

  // Lista de produtos
  if (products.length > 0) {
    context += `\n### Produtos/Serviços Disponíveis (${products.length} itens)\n`;
    
    for (const product of products) {
      context += `\n**${product.name}**\n`;
      if (product.price) context += `- Preço: ${product.price}\n`;
      if (product.description) context += `- ${product.description}\n`;
      if (product.category) context += `- Categoria: ${product.category}\n`;
      if (product.availability) context += `- Disponibilidade: ${product.availability}\n`;
    }
  }

  context += `\n---\n`;
  context += `*Dados atualizados automaticamente via importação de website.*\n`;

  return context;
}

// ============================================================================
// FUNÇÃO PRINCIPAL DE SCRAPING
// ============================================================================

/**
 * Scrape um website e extrai dados estruturados
 */
export async function scrapeWebsite(
  url: string,
  retryCount = 0
): Promise<WebsiteScrapingResult> {
  const startTime = Date.now();
  
  // Validar URL
  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      success: false,
      websiteUrl: url,
      extractedText: "",
      products: [],
      businessInfo: {},
      formattedContext: "",
      pagesScraped: 0,
      productsFound: 0,
      error: validation.error,
    };
  }

  const normalizedUrl = validation.normalizedUrl!;
  console.log(`[WebsiteScraper] Iniciando scraping de: ${normalizedUrl}`);

  let page: Page | null = null;

  try {
    const browserInstance = await getBrowser();
    page = await browserInstance.newPage();

    // Configurar página
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      "User-Agent": SCRAPER_CONFIG.userAgent,
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    // Navegar para a página
    await page.goto(normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: SCRAPER_CONFIG.timeout,
    });

    // Aguardar conteúdo carregar
    await page.waitForTimeout(2000);

    // Extrair texto
    const extractedText = await extractTextFromPage(page);
    console.log(`[WebsiteScraper] Texto extraído: ${extractedText.length} chars`);

    // Extrair HTML limitado (para referência)
    const extractedHtml = await page.content();
    const limitedHtml = extractedHtml.slice(0, SCRAPER_CONFIG.maxHtmlLength);

    // Extrair produtos via JSON-LD
    let products = await extractJsonLdProducts(page);
    console.log(`[WebsiteScraper] Produtos JSON-LD encontrados: ${products.length}`);

    // Se não encontrou produtos via JSON-LD, tentar seletores
    if (products.length === 0) {
      products = await extractProductsBySelectors(page);
      console.log(`[WebsiteScraper] Produtos por seletores: ${products.length}`);
    }

    // Se ainda não encontrou, usar Mistral
    if (products.length === 0 && extractedText.length > 100) {
      console.log(`[WebsiteScraper] Usando Mistral para extrair produtos...`);
      products = await extractProductsWithMistral(extractedText);
      console.log(`[WebsiteScraper] Produtos via Mistral: ${products.length}`);
    }

    // Extrair informações do negócio
    const businessInfo = await extractBusinessInfo(page, extractedText);

    // Formatar contexto para o agente
    const formattedContext = formatContextForAgent(products, businessInfo, normalizedUrl);

    const elapsed = Date.now() - startTime;
    console.log(`[WebsiteScraper] Scraping completo em ${elapsed}ms`);

    return {
      success: true,
      websiteUrl: normalizedUrl,
      websiteName: businessInfo.businessName,
      websiteDescription: businessInfo.businessDescription,
      extractedText,
      extractedHtml: limitedHtml,
      products,
      businessInfo,
      formattedContext,
      pagesScraped: 1,
      productsFound: products.length,
    };
  } catch (error: any) {
    console.error(`[WebsiteScraper] Erro:`, error.message);

    // Retry logic
    if (retryCount < SCRAPER_CONFIG.maxRetries - 1) {
      console.log(`[WebsiteScraper] Tentativa ${retryCount + 2}/${SCRAPER_CONFIG.maxRetries}...`);
      await new Promise((r) => setTimeout(r, 2000 * (retryCount + 1)));
      return scrapeWebsite(url, retryCount + 1);
    }

    return {
      success: false,
      websiteUrl: url,
      extractedText: "",
      products: [],
      businessInfo: {},
      formattedContext: "",
      pagesScraped: 0,
      productsFound: 0,
      error: `Falha ao acessar o site: ${error.message}`,
    };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}

/**
 * Fecha recursos quando o servidor encerrar
 */
process.on("beforeExit", async () => {
  await closeBrowser();
});
