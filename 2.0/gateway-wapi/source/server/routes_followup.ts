
  // ==================== FOLLOW-UP TOGGLE ====================
  
  /**
   * Ativar/Desativar follow-up para uma conversa específica
   * POST /api/admin/conversations/:id/followup-toggle
   */
  app.post("/api/admin/conversations/:id/followup-toggle", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { active } = req.body;
      
      if (active === undefined) {
        return res.status(400).json({ message: "active boolean is required" });
      }
      
      const conversation = await storage.getAdminConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Atualizar no banco
      await storage.updateAdminConversation(id, { 
        followupActive: active,
        // Se desativar, limpa a data. Se ativar, agenda para 10 min (reset)
        nextFollowupAt: active ? new Date(Date.now() + 10 * 60 * 1000) : null,
        followupStage: active ? 0 : conversation.followupStage
      });
      
      console.log(`🔄 [ADMIN] Follow-up ${active ? 'ATIVADO' : 'DESATIVADO'} para conversa ${id}`);
      
      res.json({ success: true, active });
    } catch (error: any) {
      console.error("Error toggling follow-up:", error);
      res.status(500).json({ message: "Failed to toggle follow-up" });
    }
  });
