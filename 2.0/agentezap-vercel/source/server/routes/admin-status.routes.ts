import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { isAdmin } from "../middleware";

const router = Router();

// Get all statuses
router.get("/admin/statuses", isAdmin, async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT * FROM whatsapp_statuses 
      ORDER BY created_at DESC
    `);
    res.json(result.rows || []);
  } catch (error) {
    console.error("Error fetching statuses:", error);
    res.status(500).json({ message: "Failed to fetch statuses" });
  }
});

// Get status history
router.get("/admin/status-history", isAdmin, async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT * FROM status_history 
      ORDER BY sent_at DESC 
      LIMIT 100
    `);
    res.json(result.rows || []);
  } catch (error) {
    console.error("Error fetching status history:", error);
    res.status(500).json({ message: "Failed to fetch status history" });
  }
});

// Create status
router.post("/admin/statuses", isAdmin, async (req, res) => {
  try {
    const { name, type, content, contentUrl, duration, schedule, rotation } = req.body;
    
    const result = await db.execute(sql`
      INSERT INTO whatsapp_statuses (
        id, name, type, content, content_url, duration, 
        schedule, rotation, is_active, priority, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), ${name}, ${type}, ${content}, ${contentUrl || null}, ${duration || null},
        ${schedule ? JSON.stringify(schedule) : null}, 
        ${rotation ? JSON.stringify(rotation) : null},
        true, 0, NOW(), NOW()
      )
      RETURNING *
    `);
    
    res.status(201).json(result.rows?.[0] || { message: "Status created" });
  } catch (error) {
    console.error("Error creating status:", error);
    res.status(500).json({ message: "Failed to create status" });
  }
});

// Update status
router.put("/admin/statuses/:id", isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, content, contentUrl, duration, schedule, rotation, isActive } = req.body;
    
    const result = await db.execute(sql`
      UPDATE whatsapp_statuses SET
        name = ${name},
        type = ${type},
        content = ${content},
        content_url = ${contentUrl || null},
        duration = ${duration || null},
        schedule = ${schedule ? JSON.stringify(schedule) : null},
        rotation = ${rotation ? JSON.stringify(rotation) : null},
        is_active = ${isActive !== undefined ? isActive : true},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    
    res.json(result.rows?.[0] || { message: "Status updated" });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ message: "Failed to update status" });
  }
});

// Delete status
router.delete("/admin/statuses/:id", isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.execute(sql`
      DELETE FROM whatsapp_statuses WHERE id = ${id}
    `);
    
    res.json({ message: "Status deleted" });
  } catch (error) {
    console.error("Error deleting status:", error);
    res.status(500).json({ message: "Failed to delete status" });
  }
});

// Send status to specific user
router.post("/admin/statuses/send", isAdmin, async (req, res) => {
  try {
    const { statusId, userId, phoneNumber } = req.body;
    
    // Get status details
    const statusResult = await db.execute(sql`
      SELECT * FROM whatsapp_statuses WHERE id = ${statusId}
    `);
    
    if (!statusResult.rows?.[0]) {
      return res.status(404).json({ message: "Status not found" });
    }
    
    const status = statusResult.rows[0];
    
    // Record in history
    await db.execute(sql`
      INSERT INTO status_history (
        id, status_id, user_id, phone_number, sent_at, content, type
      ) VALUES (
        gen_random_uuid(), ${statusId}, ${userId}, ${phoneNumber}, NOW(), 
        ${status.content}, ${status.type}
      )
    `);
    
    res.json({ message: "Status sent" });
  } catch (error) {
    console.error("Error sending status:", error);
    res.status(500).json({ message: "Failed to send status" });
  }
});

// Send status to all users
router.post("/admin/statuses/send-all", isAdmin, async (req, res) => {
  try {
    const { statusId } = req.body;
    
    // Get status details
    const statusResult = await db.execute(sql`
      SELECT * FROM whatsapp_statuses WHERE id = ${statusId}
    `);
    
    if (!statusResult.rows?.[0]) {
      return res.status(404).json({ message: "Status not found" });
    }
    
    const status = statusResult.rows[0];
    
    // Get all users with WhatsApp connected
    const usersResult = await db.execute(sql`
      SELECT id, whatsapp_number FROM users 
      WHERE whatsapp_connected = true AND whatsapp_number IS NOT NULL
    `);
    
    const users = usersResult.rows || [];
    
    // Record in history for each user
    for (const user of users) {
      await db.execute(sql`
        INSERT INTO status_history (
          id, status_id, user_id, phone_number, sent_at, content, type
        ) VALUES (
          gen_random_uuid(), ${statusId}, ${user.id}, ${user.whatsapp_number}, NOW(),
          ${status.content}, ${status.type}
        )
      `);
    }
    
    res.json({ message: `Status sent to ${users.length} users` });
  } catch (error) {
    console.error("Error sending status to all:", error);
    res.status(500).json({ message: "Failed to send status" });
  }
});

export default router;
