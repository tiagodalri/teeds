-- Estúdio de anúncios (03/11/2026, revisão): um rascunho que ficou em "criando" (a Meta demorou com o
-- vídeo, ou a criação parou no meio) volta a poder ser salvo e retomado. A criação continua de onde
-- parou, porque os ids que já foram criados ficam em `progresso`.
create or replace function public.teeds_estudio_salvar(p_marca text, p_parceiro text, p_id uuid, p_tipo text, p_nome text, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.teeds_admin_geral_da(p_marca) then raise exception 'Só o administrador geral usa o estúdio de anúncios'; end if;
  if p_parceiro !~ '^[a-z0-9]{1,12}$' then raise exception 'Parceiro inválido'; end if;
  if pg_column_size(p_dados) > 400000 then raise exception 'Rascunho grande demais'; end if;
  if p_id is null then
    insert into public.anuncios_rascunhos (marca, parceiro, tipo, nome, dados)
    values (p_marca, p_parceiro, coalesce(p_tipo, 'novo'), left(coalesce(p_nome, ''), 200), coalesce(p_dados, '{}'::jsonb))
    returning id into v_id;
    return v_id;
  end if;
  update public.anuncios_rascunhos set nome = left(coalesce(p_nome, ''), 200), dados = coalesce(p_dados, '{}'::jsonb), atualizado_em = now()
  where id = p_id and marca = p_marca and parceiro = p_parceiro and situacao in ('rascunho', 'erro', 'criando')
  returning id into v_id;
  if v_id is null then raise exception 'Esse rascunho já foi para a Meta e não pode mais ser editado'; end if;
  return v_id;
end $$;
