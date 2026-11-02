-- 02/11/2026 (Tiago): "Ative as notificações" na página de obrigado, já para o cadastro da pessoa.
-- Na página ainda não há login: o aparelho fica guardado pelo e-mail do cadastro, e só recebe
-- os avisos da live de lançamento (nunca os das I.A., que seguem em push_assinaturas, por conta).
create table if not exists public.lancamento_push (
  endpoint text primary key,
  marca text not null,
  email text not null,
  parceiro text,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);
alter table public.lancamento_push enable row level security;

create or replace function public.gf_avisos_da_live(p_email text, p_endpoint text, p_p256dh text, p_auth text, p_parceiro text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email = '' or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 40 and 200 or coalesce(length(p_auth), 0) not between 10 and 100 then
    return false;
  end if;
  -- só quem se inscreveu na GF nas últimas 24 h (a página de obrigado vem logo depois do cadastro)
  if not exists (select 1 from public.clientes_pendentes c
                  where c.marca = 'globalfly' and lower(c.email) = v_email and c.ultima_inscricao_em > now() - interval '24 hours') then
    return false;
  end if;
  insert into public.lancamento_push (endpoint, marca, email, parceiro, p256dh, auth)
  values (p_endpoint, 'globalfly', v_email, case when p_parceiro in ('n', 'v') then p_parceiro end, p_p256dh, p_auth)
  on conflict (endpoint) do update set email = excluded.email, parceiro = excluded.parceiro, p256dh = excluded.p256dh, auth = excluded.auth;
  return true;
end $$;
revoke all on function public.gf_avisos_da_live(text, text, text, text, text) from public;
grant execute on function public.gf_avisos_da_live(text, text, text, text, text) to anon, authenticated;
