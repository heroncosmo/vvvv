BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'update_updated_at_column'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
  END IF;
END $$;

DO $$
DECLARE
  tbl text;
  protected_tables text[] := ARRAY[
    'admin_setup_request_messages',
    'admin_setup_requests',
    'blog_asset_images',
    'blog_author_profiles',
    'blog_context_packs',
    'blog_generation_jobs',
    'blog_indexing_checks',
    'blog_post_metrics',
    'blog_post_revisions',
    'blog_post_sources',
    'blog_posts',
    'blog_publish_jobs',
    'blog_source_snapshots',
    'blog_topics',
    'conversation_lead_intelligence',
    'conversation_reports',
    'grupo_olx_integrations',
    'grupo_olx_lead_events',
    'grupo_olx_listings',
    'referral_attributions',
    'referral_commission_requests',
    'referral_events',
    'referral_links',
    'referral_profiles',
    'referral_program_settings',
    'referral_share_logs',
    'referral_support_materials',
    'referral_wallet_ledger',
    'referral_withdrawal_requests',
    'schema_migrations',
    'status_post_items',
    'status_posts',
    'status_publish_jobs',
    'status_publish_run_items',
    'status_publish_runs',
    'status_rotation_posts',
    'status_rotations'
  ];
BEGIN
  FOREACH tbl IN ARRAY protected_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = tbl
          AND policyname = tbl || '_service_role_all'
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
          tbl || '_service_role_all',
          tbl
        );
      END IF;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  cfg jsonb;
  tbl text;
  owner_col text;
BEGIN
  FOR cfg IN
    SELECT *
    FROM jsonb_array_elements(
      '[
        {"table":"appointments","column":"user_id"},
        {"table":"google_calendar_tokens","column":"user_id"},
        {"table":"scheduling_config","column":"user_id"},
        {"table":"scheduling_exceptions","column":"user_id"},
        {"table":"salon_config","column":"user_id"},
        {"table":"admin_broadcast_messages","column":"admin_id"},
        {"table":"smart_qrcodes","column":"user_id"},
        {"table":"qrcode_scan_logs","column":"user_id"},
        {"table":"broadcast_campaigns","column":"user_id"},
        {"table":"conversation_scheduled_messages","column":"user_id"},
        {"table":"payment_receipts","column":"user_id"}
      ]'::jsonb
    )
  LOOP
    tbl := cfg->>'table';
    owner_col := cfg->>'column';

    IF EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_owner_select', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (((select auth.uid())::text = %I))',
        tbl || '_owner_select',
        tbl,
        owner_col
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_owner_insert', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (((select auth.uid())::text = %I))',
        tbl || '_owner_insert',
        tbl,
        owner_col
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_owner_update', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (((select auth.uid())::text = %I)) WITH CHECK (((select auth.uid())::text = %I))',
        tbl || '_owner_update',
        tbl,
        owner_col,
        owner_col
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_owner_delete', tbl);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (((select auth.uid())::text = %I))',
        tbl || '_owner_delete',
        tbl,
        owner_col
      );
    END IF;
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.idx_sector_members_unique;
DROP INDEX IF EXISTS public.idx_sectors_auto_assign_agent;
DROP INDEX IF EXISTS public.idx_sectors_owner;

DO $$
DECLARE
  idx jsonb;
  tbl text;
  idx_name text;
  idx_expr text;
BEGIN
  FOR idx IN
    SELECT *
    FROM jsonb_array_elements(
      '[
        {"table":"blog_generation_jobs","index":"idx_blog_generation_jobs_post_id","expr":"post_id"},
        {"table":"blog_posts","index":"idx_blog_posts_hero_image_id","expr":"hero_image_id"},
        {"table":"blog_posts","index":"idx_blog_posts_topic_id","expr":"topic_id"},
        {"table":"conversation_lead_intelligence","index":"idx_conversation_lead_intelligence_connection_id","expr":"connection_id"},
        {"table":"conversation_reports","index":"idx_conversation_reports_closed_by","expr":"closed_by"},
        {"table":"grupo_olx_integrations","index":"idx_grupo_olx_integrations_connection_id","expr":"connection_id"},
        {"table":"grupo_olx_integrations","index":"idx_grupo_olx_integrations_funnel_id","expr":"funnel_id"},
        {"table":"grupo_olx_integrations","index":"idx_grupo_olx_integrations_stage_id","expr":"stage_id"},
        {"table":"grupo_olx_lead_events","index":"idx_grupo_olx_lead_events_conversation_id","expr":"conversation_id"},
        {"table":"grupo_olx_lead_events","index":"idx_grupo_olx_lead_events_deal_id","expr":"deal_id"},
        {"table":"referral_events","index":"idx_referral_events_attribution_id","expr":"attribution_id"},
        {"table":"referral_share_logs","index":"idx_referral_share_logs_target_conversation_id","expr":"target_conversation_id"},
        {"table":"referral_wallet_ledger","index":"idx_referral_wallet_ledger_attribution_id","expr":"attribution_id"},
        {"table":"referral_wallet_ledger","index":"idx_referral_wallet_ledger_referral_event_id","expr":"referral_event_id"},
        {"table":"status_posts","index":"idx_status_posts_connection_id","expr":"connection_id"},
        {"table":"status_publish_jobs","index":"idx_status_publish_jobs_connection_id","expr":"connection_id"},
        {"table":"status_publish_jobs","index":"idx_status_publish_jobs_post_id","expr":"post_id"},
        {"table":"status_publish_jobs","index":"idx_status_publish_jobs_user_id","expr":"user_id"},
        {"table":"status_publish_run_items","index":"idx_status_publish_run_items_post_item_id","expr":"post_item_id"},
        {"table":"status_publish_runs","index":"idx_status_publish_runs_connection_id","expr":"connection_id"},
        {"table":"status_publish_runs","index":"idx_status_publish_runs_job_id","expr":"job_id"},
        {"table":"status_publish_runs","index":"idx_status_publish_runs_post_id","expr":"post_id"},
        {"table":"status_publish_runs","index":"idx_status_publish_runs_rotation_id","expr":"rotation_id"},
        {"table":"status_rotation_posts","index":"idx_status_rotation_posts_post_id","expr":"post_id"},
        {"table":"status_rotations","index":"idx_status_rotations_connection_id","expr":"connection_id"},
        {"table":"status_rotations","index":"idx_status_rotations_user_id","expr":"user_id"}
      ]'::jsonb
    )
  LOOP
    tbl := idx->>'table';
    idx_name := idx->>'index';
    idx_expr := idx->>'expr';

    IF EXISTS (
      SELECT 1
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)',
        idx_name,
        tbl,
        idx_expr
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
