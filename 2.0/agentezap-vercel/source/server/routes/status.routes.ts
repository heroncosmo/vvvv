import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../supabaseAuth";
import {
  statusPostInputSchema,
  statusPostItems,
  statusPosts,
  statusPublishJobInputSchema,
  statusPublishJobs,
  statusRotationInputSchema,
  statusRotationPosts,
  statusRotations,
  type StatusPostInput,
  type StatusPostRotationInput,
} from "@shared/schema";
import {
  computeNextRunAt,
  listStatusHistory,
  listStatusJobs,
  listStatusPosts,
  listStatusRotations,
  publishStatusPost,
} from "../statusPostingService";

function getUserId(req: any): string {
  return req.user.claims.sub;
}

async function assertOwnedPost(userId: string, postId: string) {
  const [post] = await db
    .select()
    .from(statusPosts)
    .where(and(eq(statusPosts.id, postId), eq(statusPosts.userId, userId)))
    .limit(1);

  if (!post) {
    throw new Error("Postagem não encontrada");
  }

  return post;
}

async function assertOwnedRotation(userId: string, rotationId: string) {
  const [rotation] = await db
    .select()
    .from(statusRotations)
    .where(and(eq(statusRotations.id, rotationId), eq(statusRotations.userId, userId)))
    .limit(1);

  if (!rotation) {
    throw new Error("Rotação não encontrada");
  }

  return rotation;
}

async function savePost(userId: string, postId: string, input: StatusPostInput) {
  await db.delete(statusPostItems).where(eq(statusPostItems.postId, postId));

  if (input.items.length > 0) {
    await db.insert(statusPostItems).values(
      input.items.map((item, index) => ({
        postId,
        type: item.type,
        text: item.text || null,
        storageUrl: item.storageUrl || null,
        mimeType: item.mimeType || null,
        caption: item.caption || null,
        durationSeconds: item.durationSeconds || null,
        displayOrder: item.displayOrder ?? index,
        isActive: item.isActive ?? true,
      })),
    );
  }

  const posts = await listStatusPosts(userId);
  return posts.find((post) => post.id === postId) || null;
}

async function saveRotation(userId: string, rotationId: string, input: StatusPostRotationInput) {
  await db.delete(statusRotationPosts).where(eq(statusRotationPosts.rotationId, rotationId));

  if (input.items.length > 0) {
    await db.insert(statusRotationPosts).values(
      input.items.map((item, index) => ({
        rotationId,
        postId: item.postId,
        displayOrder: item.displayOrder ?? index,
        weight: item.weight ?? 1,
        isActive: item.isActive ?? true,
      })),
    );
  }

  const rotations = await listStatusRotations(userId);
  return rotations.find((rotation) => rotation.id === rotationId) || null;
}

export function registerStatusRoutes(app: Express) {
  app.get("/api/status/posts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const posts = await listStatusPosts(userId);
      res.json(posts);
    } catch (error) {
      console.error("[STATUS POSTS] Error listing posts:", error);
      res.status(500).json({ message: "Falha ao listar postagens de status" });
    }
  });

  app.get("/api/status/posts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const posts = await listStatusPosts(userId);
      const post = posts.find((entry) => entry.id === req.params.id);
      if (!post) {
        return res.status(404).json({ message: "Postagem não encontrada" });
      }
      res.json(post);
    } catch (error) {
      console.error("[STATUS POSTS] Error fetching post:", error);
      res.status(500).json({ message: "Falha ao buscar postagem" });
    }
  });

  app.post("/api/status/posts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const input = statusPostInputSchema.parse(req.body);

      const [post] = await db
        .insert(statusPosts)
        .values({
          userId,
          connectionId: input.connectionId || null,
          name: input.name,
          description: input.description || null,
          defaultCaption: input.defaultCaption || null,
          isActive: input.isActive ?? true,
        })
        .returning();

      const saved = await savePost(userId, post.id, input);
      res.status(201).json(saved);
    } catch (error: any) {
      console.error("[STATUS POSTS] Error creating post:", error);
      res.status(400).json({ message: error?.message || "Falha ao criar postagem" });
    }
  });

  app.put("/api/status/posts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const input = statusPostInputSchema.parse(req.body);
      const post = await assertOwnedPost(userId, req.params.id);

      await db
        .update(statusPosts)
        .set({
          connectionId: input.connectionId || null,
          name: input.name,
          description: input.description || null,
          defaultCaption: input.defaultCaption || null,
          isActive: input.isActive ?? true,
          updatedAt: new Date(),
        })
        .where(eq(statusPosts.id, post.id));

      const saved = await savePost(userId, post.id, input);
      res.json(saved);
    } catch (error: any) {
      console.error("[STATUS POSTS] Error updating post:", error);
      res.status(400).json({ message: error?.message || "Falha ao atualizar postagem" });
    }
  });

  app.delete("/api/status/posts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      await assertOwnedPost(userId, req.params.id);
      await db.delete(statusPosts).where(eq(statusPosts.id, req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      console.error("[STATUS POSTS] Error deleting post:", error);
      res.status(400).json({ message: error?.message || "Falha ao remover postagem" });
    }
  });

  app.post("/api/status/posts/:id/publish-now", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const post = await assertOwnedPost(userId, req.params.id);
      const result = await publishStatusPost({
        userId,
        postId: post.id,
        connectionId: req.body?.connectionId || post.connectionId,
        runType: "manual",
        triggeredBy: "user",
      });
      res.json({ success: true, run: result });
    } catch (error: any) {
      console.error("[STATUS POSTS] Error publishing now:", error);
      res.status(400).json({ message: error?.message || "Falha ao publicar status" });
    }
  });

  app.get("/api/status/jobs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      res.json(await listStatusJobs(userId));
    } catch (error) {
      console.error("[STATUS JOBS] Error listing jobs:", error);
      res.status(500).json({ message: "Falha ao listar agendamentos" });
    }
  });

  app.post("/api/status/jobs", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const input = statusPublishJobInputSchema.parse(req.body);
      await assertOwnedPost(userId, input.postId);

      const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
      const nextRunAt = computeNextRunAt({
        recurrenceType: input.recurrenceType,
        scheduledFor,
        timeOfDay: input.timeOfDay,
        daysOfWeek: input.daysOfWeek,
        dayOfMonth: input.dayOfMonth,
      });

      const [job] = await db
        .insert(statusPublishJobs)
        .values({
          userId,
          postId: input.postId,
          connectionId: input.connectionId || null,
          mode: input.mode,
          recurrenceType: input.recurrenceType,
          timezone: input.timezone,
          scheduledFor,
          timeOfDay: input.timeOfDay || null,
          daysOfWeek: input.daysOfWeek || [],
          dayOfMonth: input.dayOfMonth || null,
          isActive: input.isActive ?? true,
          status: input.isActive === false ? "paused" : "active",
          nextRunAt,
        })
        .returning();

      res.status(201).json(job);
    } catch (error: any) {
      console.error("[STATUS JOBS] Error creating job:", error);
      res.status(400).json({ message: error?.message || "Falha ao criar agendamento" });
    }
  });

  app.put("/api/status/jobs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const input = statusPublishJobInputSchema.parse(req.body);
      await assertOwnedPost(userId, input.postId);

      const [job] = await db
        .select()
        .from(statusPublishJobs)
        .where(and(eq(statusPublishJobs.id, req.params.id), eq(statusPublishJobs.userId, userId)))
        .limit(1);

      if (!job) {
        return res.status(404).json({ message: "Agendamento não encontrado" });
      }

      const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
      const nextRunAt = computeNextRunAt({
        recurrenceType: input.recurrenceType,
        scheduledFor,
        timeOfDay: input.timeOfDay,
        daysOfWeek: input.daysOfWeek,
        dayOfMonth: input.dayOfMonth,
      });

      const [updated] = await db
        .update(statusPublishJobs)
        .set({
          postId: input.postId,
          connectionId: input.connectionId || null,
          mode: input.mode,
          recurrenceType: input.recurrenceType,
          timezone: input.timezone,
          scheduledFor,
          timeOfDay: input.timeOfDay || null,
          daysOfWeek: input.daysOfWeek || [],
          dayOfMonth: input.dayOfMonth || null,
          isActive: input.isActive ?? true,
          status: input.isActive === false ? "paused" : "active",
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(statusPublishJobs.id, job.id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("[STATUS JOBS] Error updating job:", error);
      res.status(400).json({ message: error?.message || "Falha ao atualizar agendamento" });
    }
  });

  app.delete("/api/status/jobs/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      await db
        .delete(statusPublishJobs)
        .where(and(eq(statusPublishJobs.id, req.params.id), eq(statusPublishJobs.userId, userId)));
      res.json({ success: true });
    } catch (error) {
      console.error("[STATUS JOBS] Error deleting job:", error);
      res.status(500).json({ message: "Falha ao remover agendamento" });
    }
  });

  app.get("/api/status/rotations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      res.json(await listStatusRotations(userId));
    } catch (error) {
      console.error("[STATUS ROTATIONS] Error listing rotations:", error);
      res.status(500).json({ message: "Falha ao listar rotações" });
    }
  });

  app.post("/api/status/rotations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const input = statusRotationInputSchema.parse(req.body);

      for (const item of input.items) {
        await assertOwnedPost(userId, item.postId);
      }

      const [rotation] = await db
        .insert(statusRotations)
        .values({
          userId,
          connectionId: input.connectionId || null,
          name: input.name,
          selectionMode: input.selectionMode,
          intervalMinutes: input.intervalMinutes,
          isActive: input.isActive ?? true,
          nextRunAt: input.isActive === false ? null : new Date(),
        })
        .returning();

      const saved = await saveRotation(userId, rotation.id, input);
      res.status(201).json(saved);
    } catch (error: any) {
      console.error("[STATUS ROTATIONS] Error creating rotation:", error);
      res.status(400).json({ message: error?.message || "Falha ao criar rotação" });
    }
  });

  app.put("/api/status/rotations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const input = statusRotationInputSchema.parse(req.body);
      const rotation = await assertOwnedRotation(userId, req.params.id);

      for (const item of input.items) {
        await assertOwnedPost(userId, item.postId);
      }

      await db
        .update(statusRotations)
        .set({
          connectionId: input.connectionId || null,
          name: input.name,
          selectionMode: input.selectionMode,
          intervalMinutes: input.intervalMinutes,
          isActive: input.isActive ?? true,
          nextRunAt: input.isActive === false ? null : rotation.nextRunAt || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(statusRotations.id, rotation.id));

      const saved = await saveRotation(userId, rotation.id, input);
      res.json(saved);
    } catch (error: any) {
      console.error("[STATUS ROTATIONS] Error updating rotation:", error);
      res.status(400).json({ message: error?.message || "Falha ao atualizar rotação" });
    }
  });

  app.delete("/api/status/rotations/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      await assertOwnedRotation(userId, req.params.id);
      await db.delete(statusRotations).where(eq(statusRotations.id, req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      console.error("[STATUS ROTATIONS] Error deleting rotation:", error);
      res.status(400).json({ message: error?.message || "Falha ao remover rotação" });
    }
  });

  app.post("/api/status/rotations/:id/items", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      await assertOwnedRotation(userId, req.params.id);
      await assertOwnedPost(userId, req.body?.postId);

      const [created] = await db
        .insert(statusRotationPosts)
        .values({
          rotationId: req.params.id,
          postId: req.body.postId,
          displayOrder: req.body.displayOrder ?? 0,
          weight: req.body.weight ?? 1,
          isActive: req.body.isActive ?? true,
        })
        .returning();

      res.status(201).json(created);
    } catch (error: any) {
      console.error("[STATUS ROTATIONS] Error adding rotation item:", error);
      res.status(400).json({ message: error?.message || "Falha ao adicionar postagem na rotação" });
    }
  });

  app.put("/api/status/rotations/:id/items/:itemId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      await assertOwnedRotation(userId, req.params.id);

      const [item] = await db
        .select()
        .from(statusRotationPosts)
        .where(and(eq(statusRotationPosts.id, req.params.itemId), eq(statusRotationPosts.rotationId, req.params.id)))
        .limit(1);

      if (!item) {
        return res.status(404).json({ message: "Item da rotação não encontrado" });
      }

      if (req.body?.postId) {
        await assertOwnedPost(userId, req.body.postId);
      }

      const [updated] = await db
        .update(statusRotationPosts)
        .set({
          postId: req.body?.postId || item.postId,
          displayOrder: req.body?.displayOrder ?? item.displayOrder,
          weight: req.body?.weight ?? item.weight,
          isActive: req.body?.isActive ?? item.isActive,
          updatedAt: new Date(),
        })
        .where(eq(statusRotationPosts.id, item.id))
        .returning();

      res.json(updated);
    } catch (error: any) {
      console.error("[STATUS ROTATIONS] Error updating rotation item:", error);
      res.status(400).json({ message: error?.message || "Falha ao atualizar item da rotação" });
    }
  });

  app.delete("/api/status/rotations/:id/items/:itemId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      await assertOwnedRotation(userId, req.params.id);
      await db
        .delete(statusRotationPosts)
        .where(and(eq(statusRotationPosts.id, req.params.itemId), eq(statusRotationPosts.rotationId, req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      console.error("[STATUS ROTATIONS] Error deleting rotation item:", error);
      res.status(400).json({ message: error?.message || "Falha ao remover item da rotação" });
    }
  });

  app.get("/api/status/history", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      res.json(await listStatusHistory(userId));
    } catch (error) {
      console.error("[STATUS HISTORY] Error listing history:", error);
      res.status(500).json({ message: "Falha ao listar histórico" });
    }
  });
}
