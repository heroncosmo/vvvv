begin;

update public.plans
set
  nome = case id
    when '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f' then 'Especialista 3 dias'
    when '83c7ee7f-97b0-45bd-9b97-4f53af78f814' then 'Especialista dedicado'
    else nome
  end,
  updated_at = now()
where id in (
  '2b2510b4-cb58-4dd4-ab83-f6b4fdf2fe1f',
  '83c7ee7f-97b0-45bd-9b97-4f53af78f814'
);

commit;
