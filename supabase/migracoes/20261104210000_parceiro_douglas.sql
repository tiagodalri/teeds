-- 04/11/2026 (Tiago): o terceiro expert da GlobalFly, Douglas, no /d, separado igual ao /n (Naor) e ao /v (Victor).
-- O app da Deriv dele (deriv_app_id) entra quando for criado; até lá o /d conecta pelo app da marca.
insert into public.parceiros (marca, codigo, nome, ativo)
values ('globalfly', 'd', 'Douglas', true)
on conflict do nothing;

-- os avisos da live guardam o parceiro de qualquer código cadastrado (antes: só 'n' e 'v')
CREATE OR REPLACE FUNCTION public.gf_avisos_da_live(p_email text, p_endpoint text, p_p256dh text, p_auth text, p_parceiro text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  values (p_endpoint, 'globalfly', v_email,
          case when exists (select 1 from public.parceiros p where p.marca = 'globalfly' and p.codigo = p_parceiro and p.ativo) then p_parceiro end,
          p_p256dh, p_auth)
  on conflict (endpoint) do update set email = excluded.email, parceiro = excluded.parceiro, p256dh = excluded.p256dh, auth = excluded.auth;
  return true;
end $function$;
