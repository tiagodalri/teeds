-- 09/11/2026, dia da live (Tiago): a transmissão passa FORA da plataforma. O link é colado às
-- 19h40 em Administração › Live de lançamento (coluna lancamento_live.youtube, que aceita qualquer
-- endereço) e precisa chegar a quem ainda não entrou: a tela de entrar (aviso de tela cheia) e a
-- página globalflytrade.com/live, para onde vão os e-mails e os avisos no celular.
-- Só o que já é público: o horário, o link e se a live terminou. Uma linha, sem tabela de clientes.
create or replace function public.teeds_lancamento_publico(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('inicioPrevisto', l.inicio_previsto, 'link', l.youtube, 'terminouEm', l.terminou_em)
    from public.lancamento_live l
   where l.marca = p_marca and p_marca = 'globalfly';
$$;
revoke all on function public.teeds_lancamento_publico(text) from public;
grant execute on function public.teeds_lancamento_publico(text) to anon, authenticated;
