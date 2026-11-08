-- 08/11/2026 (Tiago): a liberação de todos NÃO acontece mais sozinha às 20h30 de 09/11.
-- Quem libera é o botão "Liberar acesso geral" (Administração › Clientes, só administradores).
-- Encerrar a live passa a só marcar o fim; não libera ninguém.

-- 1. O servidor continua chamando esta função a cada 30 s: agora ela só fecha a live 3 h depois, sem liberar.
create or replace function public.teeds_lancamento_fechar_sozinha(p_marca text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  l public.lancamento_live;
  v_fim timestamptz;
begin
  select * into l from public.lancamento_live where marca = p_marca for update;
  if not found then return 0; end if;
  v_fim := greatest(l.inicio_previsto, coalesce(l.comecou_em, l.inicio_previsto)) + interval '3 hours';
  if l.terminou_em is null and now() >= v_fim then
    update public.lancamento_live
       set comecou_em = coalesce(comecou_em, inicio_previsto), terminou_em = least(now(), v_fim), atualizado_em = now()
     where marca = p_marca;
  end if;
  return 0;
end $$;
revoke all on function public.teeds_lancamento_fechar_sozinha(text) from public, anon, authenticated;

-- 2. 'encerrar' só encerra; 'liberar_geral' libera todo mundo (todos os parceiros) e marca liberado_em,
--    que é o que destranca na plataforma quem já tinha acesso e abre as aulas do GF Member.
create or replace function public.teeds_lancamento_controlar(p_marca text, p_acao text, p_valor text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só administradores controlam a live e a liberação do acesso'; end if;
  if p_acao = 'youtube' then
    update public.lancamento_live set youtube = nullif(trim(p_valor), ''), atualizado_em = now() where marca = p_marca;
  elsif p_acao = 'comecar' then
    update public.lancamento_live set comecou_em = now(), terminou_em = null, atualizado_em = now() where marca = p_marca;
  elsif p_acao = 'retomar' then
    update public.lancamento_live set terminou_em = null, atualizado_em = now() where marca = p_marca;
  elsif p_acao = 'encerrar' then
    update public.lancamento_live
       set comecou_em = coalesce(comecou_em, least(inicio_previsto, now())), terminou_em = now(), atualizado_em = now()
     where marca = p_marca and terminou_em is null;
  elsif p_acao = 'liberar_geral' then
    v_n := public.teeds_lancamento_liberar_agora(p_marca, (select auth.uid()));
    return jsonb_build_object('liberados', v_n);
  elsif p_acao = 'minimo' then
    update public.lancamento_live set minimo_pct = greatest(10, least(100, p_valor::int)), atualizado_em = now() where marca = p_marca;
  else
    raise exception 'Ação inválida';
  end if;
  return '{}'::jsonb;
end $$;
revoke all on function public.teeds_lancamento_controlar(text, text, text) from public, anon;
grant execute on function public.teeds_lancamento_controlar(text, text, text) to authenticated;
