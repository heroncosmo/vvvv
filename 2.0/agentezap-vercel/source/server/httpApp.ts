import fs from "fs";
import path from "path";
import type { Server } from "http";
import express, { type Express } from "express";

import { createHttpApiApp } from "./httpApiApp";
import { setupVite, serveStatic } from "./vite";

export interface CreateHttpAppOptions {
  mountFrontend?: boolean;
  mountUploads?: boolean;
}

function mountSharedStaticAssets(app: Express) {
  const uploadsPath = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  app.use("/uploads", express.static(uploadsPath));

  const findeasThemePath = path.join(process.cwd(), "findeas theme");
  const clientPublicAssetsPath = path.join(process.cwd(), "client", "public", "assets");

  if (fs.existsSync(clientPublicAssetsPath)) {
    app.use("/assets", express.static(clientPublicAssetsPath));
  }
  if (fs.existsSync(path.join(findeasThemePath, "assets"))) {
    app.use("/assets", express.static(path.join(findeasThemePath, "assets")));
  }
}

export async function createHttpApp(
  options: CreateHttpAppOptions = {},
): Promise<{ app: Express; server: Server }> {
  const { mountFrontend = true, mountUploads = true } = options;
  const { app, server } = await createHttpApiApp();

  if (mountUploads) {
    mountSharedStaticAssets(app);
  }

  if (mountFrontend) {
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  }

  return { app, server };
}
