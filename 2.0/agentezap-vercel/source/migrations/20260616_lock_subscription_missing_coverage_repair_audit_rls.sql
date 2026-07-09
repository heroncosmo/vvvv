begin;

alter table public.subscription_missing_coverage_repair_audit_20260611
  enable row level security;

revoke all privileges on table public.subscription_missing_coverage_repair_audit_20260611
  from public;

revoke all privileges on table public.subscription_missing_coverage_repair_audit_20260611
  from anon, authenticated;

drop policy if exists audit_client_access_denied
  on public.subscription_missing_coverage_repair_audit_20260611;

create policy audit_client_access_denied
  on public.subscription_missing_coverage_repair_audit_20260611
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

commit;
