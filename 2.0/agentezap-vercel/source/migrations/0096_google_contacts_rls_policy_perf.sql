DROP POLICY IF EXISTS google_contacts_configs_service_role_all ON public.google_contacts_configs;
DROP POLICY IF EXISTS google_contacts_entries_service_role_all ON public.google_contacts_entries;

DROP POLICY IF EXISTS google_contacts_configs_owner_select ON public.google_contacts_configs;
CREATE POLICY google_contacts_configs_owner_select
  ON public.google_contacts_configs
  FOR SELECT
  TO authenticated
  USING (((select auth.uid()))::text = user_id);

DROP POLICY IF EXISTS google_contacts_entries_owner_select ON public.google_contacts_entries;
CREATE POLICY google_contacts_entries_owner_select
  ON public.google_contacts_entries
  FOR SELECT
  TO authenticated
  USING (((select auth.uid()))::text = user_id);
