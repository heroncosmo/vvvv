import type { Express, Request, Response } from "express";
import { isAdmin } from "./middleware";
import {
  archiveBlogPost,
  buildBlogAuthorHtml,
  buildBlogFixtureImageSvg,
  buildBlogHomepageHtml,
  buildBlogListingHtml,
  buildBlogPostHtml,
  discoverBlogTopics,
  editBlogPostWithAi,
  getBlogAdminDashboard,
  getBlogContextPackById,
  generateBlogPostFromTopic,
  generateBlogRssXml,
  generateBlogSitemapXml,
  getBlogAdminMetrics,
  getBlogIndexingStatus,
  getPublicBlogPostBySlug,
  inspectBlogPostUrl,
  listPublicBlogCategories,
  listPublicBlogPosts,
  listPublicBlogTags,
  publishBlogPost,
  refreshBlogPost,
  restoreArchivedBlogPost,
  reviewBlogPost,
  submitBlogSitemap,
  updateBlogAutomationSettings,
} from "./blogService";

export function registerBlogRoutes(app: Express): void {
  app.get("/api/public/blog/posts", async (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit || 12);
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
      const posts = await listPublicBlogPosts({ limit, category, tag });
      res.json({ success: true, data: posts, total: posts.length });
    } catch (error) {
      console.error("[BLOG] Erro na listagem publica:", error);
      res.status(500).json({ success: false, message: "Falha ao listar posts do blog" });
    }
  });

  app.get("/api/public/blog/posts/:slug", async (req: Request, res: Response) => {
    try {
      const post = await getPublicBlogPostBySlug(req.params.slug);
      if (!post) {
        return res.status(404).json({ success: false, message: "Post nao encontrado" });
      }
      res.json({ success: true, data: post });
    } catch (error) {
      console.error("[BLOG] Erro ao carregar post publico:", error);
      res.status(500).json({ success: false, message: "Falha ao carregar post do blog" });
    }
  });

  app.get("/api/public/blog/categories", async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await listPublicBlogCategories() });
    } catch (error) {
      console.error("[BLOG] Erro ao listar categorias:", error);
      res.status(500).json({ success: false, message: "Falha ao listar categorias do blog" });
    }
  });

  app.get("/api/public/blog/tags", async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await listPublicBlogTags() });
    } catch (error) {
      console.error("[BLOG] Erro ao listar tags:", error);
      res.status(500).json({ success: false, message: "Falha ao listar tags do blog" });
    }
  });

  app.get("/blog", async (_req: Request, res: Response) => {
    try {
      const html = await buildBlogHomepageHtml();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      console.error("[BLOG] Erro na home do blog:", error);
      res.status(500).send("Falha ao carregar o blog");
    }
  });

  app.get("/blog-imagens/:slug/:variant.svg", async (req: Request, res: Response) => {
    try {
      const variant = req.params.variant === "4x3" || req.params.variant === "1x1" ? req.params.variant : "16x9";
      const svg = await buildBlogFixtureImageSvg(req.params.slug, variant);
      if (!svg) return res.status(404).send("Imagem nao encontrada");
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(svg);
    } catch (error) {
      console.error("[BLOG] Erro na imagem fixture do blog:", error);
      res.status(500).send("Falha ao carregar imagem");
    }
  });

  app.get("/blog/categoria/:slug", async (req: Request, res: Response) => {
    try {
      const html = await buildBlogListingHtml("category", req.params.slug);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      console.error("[BLOG] Erro na categoria do blog:", error);
      res.status(500).send("Falha ao carregar categoria do blog");
    }
  });

  app.get("/blog/tag/:slug", async (req: Request, res: Response) => {
    try {
      const html = await buildBlogListingHtml("tag", req.params.slug);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      console.error("[BLOG] Erro na tag do blog:", error);
      res.status(500).send("Falha ao carregar tag do blog");
    }
  });

  app.get("/blog/autor/:slug", async (req: Request, res: Response) => {
    try {
      const html = await buildBlogAuthorHtml(req.params.slug);
      if (!html) return res.status(404).send("Autor nao encontrado");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      console.error("[BLOG] Erro na pagina do autor:", error);
      res.status(500).send("Falha ao carregar autor");
    }
  });

  app.get("/blog/:slug", async (req: Request, res: Response) => {
    try {
      const html = await buildBlogPostHtml(req.params.slug);
      if (!html) {
        return res.status(404).send("Post nao encontrado");
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (error) {
      console.error("[BLOG] Erro no post do blog:", error);
      res.status(500).send("Falha ao carregar post do blog");
    }
  });

  app.get("/sitemap-blog.xml", async (_req: Request, res: Response) => {
    try {
      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(await generateBlogSitemapXml());
    } catch (error) {
      console.error("[BLOG] Erro ao gerar sitemap do blog:", error);
      res.status(500).send("Falha ao gerar sitemap do blog");
    }
  });

  app.get("/rss.xml", async (_req: Request, res: Response) => {
    try {
      res.setHeader("Content-Type", "application/rss+xml");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(await generateBlogRssXml());
    } catch (error) {
      console.error("[BLOG] Erro ao gerar RSS:", error);
      res.status(500).send("Falha ao gerar RSS do blog");
    }
  });

  app.post("/api/admin/blog/discovery/run", isAdmin, async (req: Request, res: Response) => {
    try {
      const limit = Number(req.body?.limit || 8);
      const result = await discoverBlogTopics(limit);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("[BLOG] Erro na discovery manual:", error);
      res.status(500).json({ success: false, message: "Falha ao descobrir pautas" });
    }
  });

  app.post("/api/admin/blog/generate/run", isAdmin, async (req: Request, res: Response) => {
    try {
      const topicId = typeof req.body?.topicId === "string" ? req.body.topicId : undefined;
      const autoPublish = Boolean(req.body?.autoPublish);
      const post = await generateBlogPostFromTopic(topicId, { autoPublish });
      res.json({ success: true, data: post });
    } catch (error) {
      console.error("[BLOG] Erro na geracao manual:", error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Falha ao gerar post" });
    }
  });

  app.post("/api/admin/blog/publish/run", isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.body?.postId || typeof req.body.postId !== "string") {
        return res.status(400).json({ success: false, message: "postId obrigatorio" });
      }
      const post = await publishBlogPost(req.body.postId);
      res.json({ success: true, data: post });
    } catch (error) {
      console.error("[BLOG] Erro na publicacao manual:", error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Falha ao publicar post" });
    }
  });

  app.post("/api/admin/blog/refresh/run", isAdmin, async (req: Request, res: Response) => {
    try {
      const postId = typeof req.body?.postId === "string" ? req.body.postId : undefined;
      const post = await refreshBlogPost(postId);
      res.json({ success: true, data: post });
    } catch (error) {
      console.error("[BLOG] Erro no refresh manual:", error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Falha ao atualizar post" });
    }
  });

  app.post("/api/admin/blog/review/run", isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.body?.postId || typeof req.body.postId !== "string") {
        return res.status(400).json({ success: false, message: "postId obrigatorio" });
      }
      res.json({ success: true, data: await reviewBlogPost(req.body.postId) });
    } catch (error) {
      console.error("[BLOG] Erro na revisao IA:", error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Falha ao revisar post" });
    }
  });

  app.post("/api/admin/blog/edit/run", isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.body?.postId || typeof req.body.postId !== "string") {
        return res.status(400).json({ success: false, message: "postId obrigatorio" });
      }
      const instruction = typeof req.body?.instruction === "string" ? req.body.instruction : "";
      res.json({ success: true, data: await editBlogPostWithAi(req.body.postId, instruction) });
    } catch (error) {
      console.error("[BLOG] Erro na edicao IA:", error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Falha ao editar post com IA" });
    }
  });

  app.post("/api/admin/blog/archive/run", isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.body?.postId || typeof req.body.postId !== "string") {
        return res.status(400).json({ success: false, message: "postId obrigatorio" });
      }
      const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
      res.json({ success: true, data: await archiveBlogPost(req.body.postId, reason) });
    } catch (error) {
      console.error("[BLOG] Erro ao arquivar post:", error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Falha ao arquivar post" });
    }
  });

  app.post("/api/admin/blog/restore/run", isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.body?.postId || typeof req.body.postId !== "string") {
        return res.status(400).json({ success: false, message: "postId obrigatorio" });
      }
      res.json({ success: true, data: await restoreArchivedBlogPost(req.body.postId) });
    } catch (error) {
      console.error("[BLOG] Erro ao restaurar post:", error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Falha ao restaurar post" });
    }
  });

  app.post("/api/admin/blog/settings", isAdmin, async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        data: await updateBlogAutomationSettings({
          publishEnabled: typeof req.body?.publishEnabled === "boolean" ? req.body.publishEnabled : undefined,
          discoveryEnabled: typeof req.body?.discoveryEnabled === "boolean" ? req.body.discoveryEnabled : undefined,
          refreshEnabled: typeof req.body?.refreshEnabled === "boolean" ? req.body.refreshEnabled : undefined,
          autoApproveEnabled: typeof req.body?.autoApproveEnabled === "boolean" ? req.body.autoApproveEnabled : undefined,
          autoPublishEnabled: typeof req.body?.autoPublishEnabled === "boolean" ? req.body.autoPublishEnabled : undefined,
          publishMaxPerDay: typeof req.body?.publishMaxPerDay === "number" ? req.body.publishMaxPerDay : undefined,
          publishMinHoursBetween: typeof req.body?.publishMinHoursBetween === "number" ? req.body.publishMinHoursBetween : undefined,
          publishMaxClusterPerWeek: typeof req.body?.publishMaxClusterPerWeek === "number" ? req.body.publishMaxClusterPerWeek : undefined,
          autoRewriteAttempts: typeof req.body?.autoRewriteAttempts === "number" ? req.body.autoRewriteAttempts : undefined,
        }),
      });
    } catch (error) {
      console.error("[BLOG] Erro ao atualizar configuracoes:", error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Falha ao salvar configuracoes do blog" });
    }
  });

  app.get("/api/admin/blog/metrics", isAdmin, async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await getBlogAdminMetrics() });
    } catch (error) {
      console.error("[BLOG] Erro ao buscar metricas:", error);
      res.status(500).json({ success: false, message: "Falha ao buscar metricas do blog" });
    }
  });

  app.get("/api/admin/blog/dashboard", isAdmin, async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await getBlogAdminDashboard() });
    } catch (error) {
      console.error("[BLOG] Erro ao buscar dashboard:", error);
      res.status(500).json({ success: false, message: "Falha ao buscar dashboard do blog" });
    }
  });

  app.get("/api/admin/blog/context-packs/:id", isAdmin, async (req: Request, res: Response) => {
    try {
      const pack = await getBlogContextPackById(req.params.id);
      if (!pack) return res.status(404).json({ success: false, message: "Context pack nao encontrado" });
      res.json({ success: true, data: pack });
    } catch (error) {
      console.error("[BLOG] Erro ao buscar context pack:", error);
      res.status(500).json({ success: false, message: "Falha ao buscar context pack" });
    }
  });

  app.get("/api/admin/blog/indexing", isAdmin, async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await getBlogIndexingStatus() });
    } catch (error) {
      console.error("[BLOG] Erro ao buscar status de indexacao:", error);
      res.status(500).json({ success: false, message: "Falha ao buscar status de indexacao" });
    }
  });

  app.post("/api/admin/blog/search-console/submit-sitemap", isAdmin, async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await submitBlogSitemap() });
    } catch (error) {
      console.error("[BLOG] Erro ao submeter sitemap:", error);
      res.status(500).json({ success: false, message: "Falha ao submeter sitemap do blog" });
    }
  });

  app.post("/api/admin/blog/indexing/inspect", isAdmin, async (req: Request, res: Response) => {
    try {
      if (!req.body?.postId || typeof req.body.postId !== "string") {
        return res.status(400).json({ success: false, message: "postId obrigatorio" });
      }
      res.json({ success: true, data: await inspectBlogPostUrl(req.body.postId) });
    } catch (error) {
      console.error("[BLOG] Erro na inspecao manual:", error);
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Falha na inspecao de URL" });
    }
  });
}
