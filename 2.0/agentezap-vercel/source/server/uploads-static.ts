import { Express } from 'express';
import path from 'path';
import fs from 'fs';
import express from 'express';

export function registerUploadsStatic(app: Express) {
  const uploadsPath = path.join(process.cwd(), 'uploads');
  if (fs.existsSync(uploadsPath)) {
    app.use('/uploads', express.static(uploadsPath));
    console.log('[Static] Serving uploads folder:', uploadsPath);
  } else {
    console.log('[Static] Uploads folder not found, skipping:', uploadsPath);
  }
}
