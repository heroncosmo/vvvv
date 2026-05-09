import "dotenv/config";
import express from "express";
import path from "path";

const port = Number(process.env.PORT || 5100);
process.env.BLOG_LOCAL_FIXTURES = process.env.BLOG_LOCAL_FIXTURES || "true";
process.env.BLOG_BASE_URL = process.env.BLOG_BASE_URL || `http://127.0.0.1:${port}`;

const { registerBlogRoutes } = await import("../server/routes_blog");

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/", (_req, res) => {
  res.redirect("/blog");
});

const previewPages = new Map([
  ["/login", { title: "Entrar | AgenteZap", heading: "Entrar", description: "Preview local simplificado da rota publica de login." }],
  ["/cadastro", { title: "Criar conta | AgenteZap", heading: "Criar conta", description: "Preview local simplificado da rota publica de cadastro." }],
  ["/ajuda", { title: "Central de ajuda | AgenteZap", heading: "Central de ajuda", description: "Preview local simplificado da central de ajuda." }],
  ["/termos-de-uso", { title: "Termos de uso | AgenteZap", heading: "Termos de uso", description: "Preview local simplificado da rota de termos." }],
]);

for (const [route, page] of previewPages.entries()) {
  app.get(route, (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${page.title}</title><style>body{font-family:Arial,sans-serif;background:#f5f7f6;color:#102126;margin:0;padding:32px}main{max-width:720px;margin:0 auto;background:#fff;border:1px solid #d7e4e6;border-radius:24px;padding:32px;box-shadow:0 18px 40px rgba(15,23,42,.08)}a{color:#0f766e;text-decoration:none;font-weight:700}</style></head><body><main><h1>${page.heading}</h1><p>${page.description}</p><p><a href="/blog">Voltar para o blog</a></p></main></body></html>`);
  });
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    mode: "blog-preview-local",
    localFixtures: process.env.BLOG_LOCAL_FIXTURES === "true",
  });
});

app.get("/favicon.ico", (_req, res) => {
  res.status(204).end();
});

registerBlogRoutes(app);

app.listen(port, "127.0.0.1", () => {
  console.log(`[BLOG PREVIEW] http://127.0.0.1:${port}`);
});
