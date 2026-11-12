-- Transmissão ao vivo pelo painel (12/11/2026, Tiago: "no menu de ADM, uma opção pra eu colocar um link da
-- transmissão ao vivo... criar uma função para os próprios adms fazerem isso").
-- Em 10/11 a call pelo Google Meet foi ligada à mão (link no banco, horário fixo no código). Agora qualquer
-- administrador pleno da marca cola o link e aperta Iniciar: o popup abre para todos e o Ao vivo do menu pisca.
-- Encerrar tira do ar. Se ninguém encerrar, ela sai sozinha 6 horas depois de iniciada.

create table if not exists public.transmissao_ao_vivo (
  marca text primary key,
  link text,
  iniciada_em timestamptz,
  iniciada_por uuid,
  iniciada_por_nome text,
  encerrada_em timestamptz,
  encerrada_por_nome text,
  link_trocado_em timestamptz,
  atualizada_em timestamptz not null default now()
);
alter table public.transmissao_ao_vivo enable row level security;
revoke all on public.transmissao_ao_vivo from anon, authenticated;

-- no ar: iniciada, sem encerrar, com link, e há menos de 6 horas
create or replace function public.teeds_transmissao_no_ar(t public.transmissao_ao_vivo)
returns boolean language sql stable set search_path = public as $$
  select t.link is not null and t.iniciada_em is not null and t.encerrada_em is null
     and now() < t.iniciada_em + interval '6 hours';
$$;

-- O que todo mundo lê (também na tela de entrar, sem login): só enquanto está no ar.
create or replace function public.teeds_transmissao_publica(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_build_object('noAr', true, 'link', t.link, 'iniciadaEm', t.iniciada_em, 'linkTrocadoEm', t.link_trocado_em)
      from public.transmissao_ao_vivo t
     where t.marca = p_marca and public.teeds_transmissao_no_ar(t)
  ), jsonb_build_object('noAr', false));
$$;
revoke all on function public.teeds_transmissao_publica(text) from public;
grant execute on function public.teeds_transmissao_publica(text) to anon, authenticated;

-- O painel do administrador: o estado completo.
create or replace function public.teeds_transmissao_painel(p_marca text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.transmissao_ao_vivo;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração controla a transmissão ao vivo'; end if;
  select * into t from public.transmissao_ao_vivo where marca = p_marca;
  return jsonb_build_object(
    'noAr', coalesce(public.teeds_transmissao_no_ar(t), false),
    'link', t.link, 'iniciadaEm', t.iniciada_em, 'iniciadaPor', t.iniciada_por_nome,
    'encerradaEm', t.encerrada_em, 'encerradaPor', t.encerrada_por_nome,
    'linkTrocadoEm', t.link_trocado_em,
    'saiSozinhaEm', case when t.iniciada_em is not null then t.iniciada_em + interval '6 hours' end);
end $$;
revoke all on function public.teeds_transmissao_painel(text) from public, anon;
grant execute on function public.teeds_transmissao_painel(text) to authenticated;

-- iniciar (com o link) · trocar_link (no ar: o popup volta para todos) · encerrar
create or replace function public.teeds_transmissao_controlar(p_marca text, p_acao text, p_link text default null, p_nome text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_link text := nullif(trim(coalesce(p_link, '')), '');
        v_nome text := nullif(trim(coalesce(p_nome, '')), '');
        v_no_ar boolean;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração controla a transmissão ao vivo'; end if;
  if p_acao in ('iniciar', 'trocar_link') and (v_link is null or v_link !~* '^https?://[^/\s]+\.[^/\s]+') then
    raise exception 'Cole um link válido, começando com https://';
  end if;
  select coalesce(public.teeds_transmissao_no_ar(t), false) into v_no_ar from public.transmissao_ao_vivo t where t.marca = p_marca;
  if p_acao = 'iniciar' then
    insert into public.transmissao_ao_vivo (marca, link, iniciada_em, iniciada_por, iniciada_por_nome, encerrada_em, encerrada_por_nome, link_trocado_em, atualizada_em)
    values (p_marca, v_link, now(), (select auth.uid()), v_nome, null, null, null, now())
    on conflict (marca) do update set link = excluded.link, iniciada_em = now(), iniciada_por = excluded.iniciada_por,
      iniciada_por_nome = excluded.iniciada_por_nome, encerrada_em = null, encerrada_por_nome = null, link_trocado_em = null, atualizada_em = now();
  elsif p_acao = 'trocar_link' then
    if not coalesce(v_no_ar, false) then raise exception 'A transmissão não está no ar. Use Iniciar.'; end if;
    update public.transmissao_ao_vivo set link = v_link, link_trocado_em = now(), atualizada_em = now() where marca = p_marca;
  elsif p_acao = 'encerrar' then
    update public.transmissao_ao_vivo set encerrada_em = now(), encerrada_por_nome = v_nome, atualizada_em = now()
     where marca = p_marca and encerrada_em is null;
  else
    raise exception 'Ação inválida';
  end if;
  return public.teeds_transmissao_painel(p_marca);
end $$;
revoke all on function public.teeds_transmissao_controlar(text, text, text, text) from public, anon;
grant execute on function public.teeds_transmissao_controlar(text, text, text, text) to authenticated;
