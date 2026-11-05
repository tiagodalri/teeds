-- 05/11/2026: central do WhatsApp, revisão completa (Tiago: "função de nova conversa
-- também... e várias outras funções importantes. revise TUDO").
--
-- 1. mensagem favorita (a estrela do WhatsApp)
-- 2. buscar pessoas da plataforma (clientes e leads) para começar uma conversa:
--    o admin de parceiro só acha as pessoas do parceiro dele.

alter table public.whatsapp_mensagens add column if not exists favorita boolean not null default false;

create or replace function public.whatsapp_favoritar(p_mensagem uuid, p_sim boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_marca text;
begin
  select marca into v_marca from public.whatsapp_mensagens where id = p_mensagem;
  if v_marca is null or not public.whatsapp_posso(v_marca) then raise exception 'sem acesso'; end if;
  update public.whatsapp_mensagens set favorita = coalesce(p_sim, false) where id = p_mensagem;
end $$;
revoke all on function public.whatsapp_favoritar(uuid, boolean) from public, anon;
grant execute on function public.whatsapp_favoritar(uuid, boolean) to authenticated;

create or replace function public.whatsapp_buscar_pessoas(p_marca text, p_q text)
returns table (origem text, id uuid, nome text, email text, telefone text, parceiro text, subplano text, contato_id uuid, criado_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := lower(trim(coalesce(p_q, '')));
  v_dig text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_parceiro text;
  v_geral boolean;
begin
  if not public.whatsapp_posso(p_marca) then return; end if;
  select bool_or(a.parceiro is null), max(a.parceiro) into v_geral, v_parceiro
    from public.administradores a where a.user_id = (select auth.uid()) and (a.marca = p_marca or a.marca = 'teeds');
  if length(v_q) < 2 and length(v_dig) < 3 then
    -- sem busca: as pessoas que entraram por último (para sugerir)
    v_q := '';
  end if;

  return query
  with c as (
    select 'cliente'::text as origem, k.user_id as id, k.nome, k.email, k.telefone, k.parceiro,
           public.teeds_subplano_id(k.user_id, k.marca) as subplano, k.criado_em,
           public.whatsapp_chave_tel(k.telefone) as chave
      from public.clientes k
     where k.marca = p_marca and coalesce(k.telefone, '') <> ''
       and (v_geral or k.parceiro = v_parceiro)
       and (v_q = '' or lower(coalesce(k.nome, '')) like '%' || v_q || '%' or lower(coalesce(k.email, '')) like '%' || v_q || '%'
            or (length(v_dig) >= 3 and regexp_replace(k.telefone, '\D', '', 'g') like '%' || v_dig || '%'))
     order by k.visto_em desc nulls last
     limit 25
  ), l as (
    select 'lead'::text as origem, d.id, d.nome, d.email, coalesce(d.telefone, d.telefone_normalizado) as telefone, d.parceiro,
           null::text as subplano, coalesce(d.inscricao_recebida_em, d.atualizado_em) as criado_em,
           public.whatsapp_chave_tel(coalesce(d.telefone_normalizado, d.telefone)) as chave
      from public.leads_capturados d
     where d.marca = p_marca and coalesce(d.telefone, d.telefone_normalizado, '') <> ''
       and (v_geral or d.parceiro = v_parceiro)
       and (v_q = '' or lower(coalesce(d.nome, '')) like '%' || v_q || '%' or lower(coalesce(d.email, '')) like '%' || v_q || '%'
            or (length(v_dig) >= 3 and regexp_replace(coalesce(d.telefone, d.telefone_normalizado), '\D', '', 'g') like '%' || v_dig || '%'))
       and not exists (select 1 from c where c.chave = public.whatsapp_chave_tel(coalesce(d.telefone_normalizado, d.telefone)))
     order by coalesce(d.inscricao_recebida_em, d.atualizado_em) desc nulls last
     limit 15
  )
  select x.origem, x.id, x.nome, x.email, x.telefone, x.parceiro, x.subplano,
         (select w.id from public.whatsapp_contatos w where w.marca = p_marca and public.whatsapp_chave_tel(w.wa_id) = x.chave limit 1),
         x.criado_em
    from (select * from c union all select * from l) x
   where x.chave is not null;
end $$;
revoke all on function public.whatsapp_buscar_pessoas(text, text) from public, anon;
grant execute on function public.whatsapp_buscar_pessoas(text, text) to authenticated;
