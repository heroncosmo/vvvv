BEGIN;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_broadcast_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_qrcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qrcode_scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_test_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_autologin_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_incoming_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incoming_message_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service only appointments" ON public.appointments;
DROP POLICY IF EXISTS "Service only google_tokens" ON public.google_calendar_tokens;
DROP POLICY IF EXISTS "Service only scheduling_config" ON public.scheduling_config;
DROP POLICY IF EXISTS "Service only scheduling_exceptions" ON public.scheduling_exceptions;
DROP POLICY IF EXISTS "salon_config_delete" ON public.salon_config;
DROP POLICY IF EXISTS "salon_config_insert" ON public.salon_config;
DROP POLICY IF EXISTS "salon_config_select" ON public.salon_config;
DROP POLICY IF EXISTS "salon_config_update" ON public.salon_config;

DROP POLICY IF EXISTS appointments_service_role_all ON public.appointments;
CREATE POLICY appointments_service_role_all
  ON public.appointments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS appointments_owner_select ON public.appointments;
CREATE POLICY appointments_owner_select
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS appointments_owner_insert ON public.appointments;
CREATE POLICY appointments_owner_insert
  ON public.appointments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS appointments_owner_update ON public.appointments;
CREATE POLICY appointments_owner_update
  ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS appointments_owner_delete ON public.appointments;
CREATE POLICY appointments_owner_delete
  ON public.appointments
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS google_calendar_tokens_service_role_all ON public.google_calendar_tokens;
CREATE POLICY google_calendar_tokens_service_role_all
  ON public.google_calendar_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS google_calendar_tokens_owner_select ON public.google_calendar_tokens;
CREATE POLICY google_calendar_tokens_owner_select
  ON public.google_calendar_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS google_calendar_tokens_owner_insert ON public.google_calendar_tokens;
CREATE POLICY google_calendar_tokens_owner_insert
  ON public.google_calendar_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS google_calendar_tokens_owner_update ON public.google_calendar_tokens;
CREATE POLICY google_calendar_tokens_owner_update
  ON public.google_calendar_tokens
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS google_calendar_tokens_owner_delete ON public.google_calendar_tokens;
CREATE POLICY google_calendar_tokens_owner_delete
  ON public.google_calendar_tokens
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS scheduling_config_service_role_all ON public.scheduling_config;
CREATE POLICY scheduling_config_service_role_all
  ON public.scheduling_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS scheduling_config_owner_select ON public.scheduling_config;
CREATE POLICY scheduling_config_owner_select
  ON public.scheduling_config
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS scheduling_config_owner_insert ON public.scheduling_config;
CREATE POLICY scheduling_config_owner_insert
  ON public.scheduling_config
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS scheduling_config_owner_update ON public.scheduling_config;
CREATE POLICY scheduling_config_owner_update
  ON public.scheduling_config
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS scheduling_config_owner_delete ON public.scheduling_config;
CREATE POLICY scheduling_config_owner_delete
  ON public.scheduling_config
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS scheduling_exceptions_service_role_all ON public.scheduling_exceptions;
CREATE POLICY scheduling_exceptions_service_role_all
  ON public.scheduling_exceptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS scheduling_exceptions_owner_select ON public.scheduling_exceptions;
CREATE POLICY scheduling_exceptions_owner_select
  ON public.scheduling_exceptions
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS scheduling_exceptions_owner_insert ON public.scheduling_exceptions;
CREATE POLICY scheduling_exceptions_owner_insert
  ON public.scheduling_exceptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS scheduling_exceptions_owner_update ON public.scheduling_exceptions;
CREATE POLICY scheduling_exceptions_owner_update
  ON public.scheduling_exceptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS scheduling_exceptions_owner_delete ON public.scheduling_exceptions;
CREATE POLICY scheduling_exceptions_owner_delete
  ON public.scheduling_exceptions
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS scheduling_professionals_service_role_all ON public.scheduling_professionals;
CREATE POLICY scheduling_professionals_service_role_all
  ON public.scheduling_professionals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS scheduling_services_service_role_all ON public.scheduling_services;
CREATE POLICY scheduling_services_service_role_all
  ON public.scheduling_services
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS salon_config_service_role_all ON public.salon_config;
CREATE POLICY salon_config_service_role_all
  ON public.salon_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS salon_config_owner_select ON public.salon_config;
CREATE POLICY salon_config_owner_select
  ON public.salon_config
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS salon_config_owner_insert ON public.salon_config;
CREATE POLICY salon_config_owner_insert
  ON public.salon_config
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS salon_config_owner_update ON public.salon_config;
CREATE POLICY salon_config_owner_update
  ON public.salon_config
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS salon_config_owner_delete ON public.salon_config;
CREATE POLICY salon_config_owner_delete
  ON public.salon_config
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS admin_broadcast_messages_service_role_all ON public.admin_broadcast_messages;
CREATE POLICY admin_broadcast_messages_service_role_all
  ON public.admin_broadcast_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS admin_broadcast_messages_owner_select ON public.admin_broadcast_messages;
CREATE POLICY admin_broadcast_messages_owner_select
  ON public.admin_broadcast_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = admin_id);

DROP POLICY IF EXISTS admin_broadcast_messages_owner_insert ON public.admin_broadcast_messages;
CREATE POLICY admin_broadcast_messages_owner_insert
  ON public.admin_broadcast_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = admin_id);

DROP POLICY IF EXISTS admin_broadcast_messages_owner_update ON public.admin_broadcast_messages;
CREATE POLICY admin_broadcast_messages_owner_update
  ON public.admin_broadcast_messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = admin_id)
  WITH CHECK (auth.uid()::text = admin_id);

DROP POLICY IF EXISTS admin_broadcast_messages_owner_delete ON public.admin_broadcast_messages;
CREATE POLICY admin_broadcast_messages_owner_delete
  ON public.admin_broadcast_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = admin_id);

DROP POLICY IF EXISTS smart_qrcodes_service_role_all ON public.smart_qrcodes;
CREATE POLICY smart_qrcodes_service_role_all
  ON public.smart_qrcodes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS smart_qrcodes_owner_select ON public.smart_qrcodes;
CREATE POLICY smart_qrcodes_owner_select
  ON public.smart_qrcodes
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS smart_qrcodes_owner_insert ON public.smart_qrcodes;
CREATE POLICY smart_qrcodes_owner_insert
  ON public.smart_qrcodes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS smart_qrcodes_owner_update ON public.smart_qrcodes;
CREATE POLICY smart_qrcodes_owner_update
  ON public.smart_qrcodes
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS smart_qrcodes_owner_delete ON public.smart_qrcodes;
CREATE POLICY smart_qrcodes_owner_delete
  ON public.smart_qrcodes
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS qrcode_scan_logs_service_role_all ON public.qrcode_scan_logs;
CREATE POLICY qrcode_scan_logs_service_role_all
  ON public.qrcode_scan_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS qrcode_scan_logs_owner_select ON public.qrcode_scan_logs;
CREATE POLICY qrcode_scan_logs_owner_select
  ON public.qrcode_scan_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS qrcode_scan_logs_owner_insert ON public.qrcode_scan_logs;
CREATE POLICY qrcode_scan_logs_owner_insert
  ON public.qrcode_scan_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS qrcode_scan_logs_owner_update ON public.qrcode_scan_logs;
CREATE POLICY qrcode_scan_logs_owner_update
  ON public.qrcode_scan_logs
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS qrcode_scan_logs_owner_delete ON public.qrcode_scan_logs;
CREATE POLICY qrcode_scan_logs_owner_delete
  ON public.qrcode_scan_logs
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS business_categories_service_role_all ON public.business_categories;
CREATE POLICY business_categories_service_role_all
  ON public.business_categories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS business_categories_public_select ON public.business_categories;
CREATE POLICY business_categories_public_select
  ON public.business_categories
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS admin_test_tokens_service_role_all ON public.admin_test_tokens;
CREATE POLICY admin_test_tokens_service_role_all
  ON public.admin_test_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS broadcast_campaigns_service_role_all ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_service_role_all
  ON public.broadcast_campaigns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS broadcast_campaigns_owner_select ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_owner_select
  ON public.broadcast_campaigns
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS broadcast_campaigns_owner_insert ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_owner_insert
  ON public.broadcast_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS broadcast_campaigns_owner_update ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_owner_update
  ON public.broadcast_campaigns
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS broadcast_campaigns_owner_delete ON public.broadcast_campaigns;
CREATE POLICY broadcast_campaigns_owner_delete
  ON public.broadcast_campaigns
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS admin_autologin_tokens_service_role_all ON public.admin_autologin_tokens;
CREATE POLICY admin_autologin_tokens_service_role_all
  ON public.admin_autologin_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS conversation_scheduled_messages_service_role_all ON public.conversation_scheduled_messages;
CREATE POLICY conversation_scheduled_messages_service_role_all
  ON public.conversation_scheduled_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS conversation_scheduled_messages_owner_select ON public.conversation_scheduled_messages;
CREATE POLICY conversation_scheduled_messages_owner_select
  ON public.conversation_scheduled_messages
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS conversation_scheduled_messages_owner_insert ON public.conversation_scheduled_messages;
CREATE POLICY conversation_scheduled_messages_owner_insert
  ON public.conversation_scheduled_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS conversation_scheduled_messages_owner_update ON public.conversation_scheduled_messages;
CREATE POLICY conversation_scheduled_messages_owner_update
  ON public.conversation_scheduled_messages
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS conversation_scheduled_messages_owner_delete ON public.conversation_scheduled_messages;
CREATE POLICY conversation_scheduled_messages_owner_delete
  ON public.conversation_scheduled_messages
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS payment_receipts_service_role_all ON public.payment_receipts;
CREATE POLICY payment_receipts_service_role_all
  ON public.payment_receipts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS payment_receipts_owner_select ON public.payment_receipts;
CREATE POLICY payment_receipts_owner_select
  ON public.payment_receipts
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS payment_receipts_owner_insert ON public.payment_receipts;
CREATE POLICY payment_receipts_owner_insert
  ON public.payment_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS payment_receipts_owner_update ON public.payment_receipts;
CREATE POLICY payment_receipts_owner_update
  ON public.payment_receipts
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

DROP POLICY IF EXISTS payment_receipts_owner_delete ON public.payment_receipts;
CREATE POLICY payment_receipts_owner_delete
  ON public.payment_receipts
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

DROP POLICY IF EXISTS service_role_pending_incoming_messages ON public.pending_incoming_messages;
CREATE POLICY service_role_pending_incoming_messages
  ON public.pending_incoming_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_incoming_message_log ON public.incoming_message_log;
CREATE POLICY service_role_incoming_message_log
  ON public.incoming_message_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_appointments_conversation_id ON public.appointments (conversation_id);
CREATE INDEX IF NOT EXISTS idx_appointments_professional_id ON public.appointments (professional_id);
CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON public.appointments (service_id);
CREATE INDEX IF NOT EXISTS idx_connection_agents_agent_id ON public.connection_agents (agent_id);
CREATE INDEX IF NOT EXISTS idx_conversation_scheduled_messages_conversation_id ON public.conversation_scheduled_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_deal_history_from_stage_id ON public.deal_history (from_stage_id);
CREATE INDEX IF NOT EXISTS idx_deal_history_to_stage_id ON public.deal_history (to_stage_id);
CREATE INDEX IF NOT EXISTS idx_delivery_carts_user_id ON public.delivery_carts (user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_orders_user_id ON public.delivery_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_exclusion_config_user_id ON public.exclusion_config (user_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON public.menu_items (category_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON public.order_items (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON public.payment_history (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_plan_id ON public.payment_receipts (plan_id);
CREATE INDEX IF NOT EXISTS idx_policy_violations_user_id ON public.policy_violations (user_id);
CREATE INDEX IF NOT EXISTS idx_reseller_invoice_items_reseller_client_id ON public.reseller_invoice_items (reseller_client_id);
CREATE INDEX IF NOT EXISTS idx_resellers_user_id ON public.resellers (user_id);
CREATE INDEX IF NOT EXISTS idx_routing_logs_assigned_to_member_id ON public.routing_logs (assigned_to_member_id);
CREATE INDEX IF NOT EXISTS idx_routing_logs_conversation_id ON public.routing_logs (conversation_id);
CREATE INDEX IF NOT EXISTS idx_sales_funnels_user_id ON public.sales_funnels (user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_conversation_id ON public.scheduled_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_status_user_id ON public.scheduled_status (user_id);
CREATE INDEX IF NOT EXISTS idx_scheduling_config_user_id ON public.scheduling_config (user_id);
CREATE INDEX IF NOT EXISTS idx_sectors_auto_assign_agent_id ON public.sectors (auto_assign_agent_id);
CREATE INDEX IF NOT EXISTS idx_status_rotation_user_id ON public.status_rotation (user_id);
CREATE INDEX IF NOT EXISTS idx_status_rotation_items_rotation_id ON public.status_rotation_items (rotation_id);
CREATE INDEX IF NOT EXISTS idx_user_followup_logs_conversation_id ON public.user_followup_logs (conversation_id);
CREATE INDEX IF NOT EXISTS idx_user_quick_replies_user_id ON public.user_quick_replies (user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_connection_phone ON public.whatsapp_contacts (connection_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_created_at ON public.whatsapp_connections (created_at);

DROP INDEX IF EXISTS public.idx_autologin_expires;
DROP INDEX IF EXISTS public.idx_autologin_user_id;
DROP INDEX IF EXISTS public.idx_incoming_message_log_wa_msg_id;
DROP INDEX IF EXISTS public.idx_incoming_msg_whatsapp_id;

COMMIT;
