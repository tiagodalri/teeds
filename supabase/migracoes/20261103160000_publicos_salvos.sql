-- Estúdio de anúncios › Públicos salvos (03/11/2026, Tiago: "uma central de inteligência... com o poder
-- do Gerenciador"). Um público montado no Estúdio (local, idade, interesses, aparelho, onde aparece,
-- semelhantes, remarketing) fica guardado para usar em outros anúncios e testes.
create table if not exists public.anuncios_publicos (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  parceiro text not null,
  nome text not null,
  publico jsonb not null,
  tamanho jsonb,
  arquivado boolean not null default false,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists anuncios_publicos_marca on public.anuncios_publicos (marca, parceiro, atualizado_em desc);
alter table public.anuncios_publicos enable row level security;
revoke all on public.anuncios_publicos from anon, authenticated;

create or replace function public.teeds_estudio_publicos(p_marca text, p_parceiro text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral usa o estúdio de anúncios'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'publico', p.publico, 'tamanho', p.tamanho, 'atualizadoEm', p.atualizado_em) order by p.atualizado_em desc)
    from public.anuncios_publicos p where p.marca = p_marca and p.parceiro = p_parceiro and not p.arquivado
  ), '[]'::jsonb);
end $$;

create or replace function public.teeds_estudio_publico_salvar(p_marca text, p_parceiro text, p_id uuid, p_nome text, p_publico jsonb, p_tamanho jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral usa o estúdio de anúncios'; end if;
  if p_parceiro !~ '^[a-z0-9]{1,12}$' then raise exception 'Parceiro inválido'; end if;
  if btrim(coalesce(p_nome, '')) = '' then raise exception 'Dê um nome ao público'; end if;
  if pg_column_size(p_publico) > 100000 then raise exception 'Público grande demais'; end if;
  if p_id is null then
    insert into public.anuncios_publicos (marca, parceiro, nome, publico, tamanho) values (p_marca, p_parceiro, left(btrim(p_nome), 120), p_publico, p_tamanho) returning id into v_id;
  else
    update public.anuncios_publicos set nome = left(btrim(p_nome), 120), publico = p_publico, tamanho = p_tamanho, atualizado_em = now()
    where id = p_id and marca = p_marca and parceiro = p_parceiro returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.teeds_estudio_publico_arquivar(p_marca text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral usa o estúdio de anúncios'; end if;
  update public.anuncios_publicos set arquivado = true, atualizado_em = now() where id = p_id and marca = p_marca;
end $$;

revoke all on function public.teeds_estudio_publicos(text, text) from public, anon;
revoke all on function public.teeds_estudio_publico_salvar(text, text, uuid, text, jsonb, jsonb) from public, anon;
revoke all on function public.teeds_estudio_publico_arquivar(text, uuid) from public, anon;
grant execute on function public.teeds_estudio_publicos(text, text) to authenticated;
grant execute on function public.teeds_estudio_publico_salvar(text, text, uuid, text, jsonb, jsonb) to authenticated;
grant execute on function public.teeds_estudio_publico_arquivar(text, uuid) to authenticated;
