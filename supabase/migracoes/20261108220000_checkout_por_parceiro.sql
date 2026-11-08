-- 08/11/2026: o checkout do subplano segue o parceiro do cliente.
-- Quem veio pelo /n (Naor) compra na Cakto do Naor; o resto continua no link
-- padrão (Cakto do Victor). O banco já devolve o link certo em
-- teeds_meu_subplano, então os botões da tela (Meu plano, Marketplace) não mudam.

alter table public.subplanos
  add column if not exists checkout_por_parceiro jsonb not null default '{}'::jsonb;

update public.subplanos set checkout_por_parceiro = jsonb_build_object('n', 'https://pay.cakto.com.br/f2jvqbi')
 where marca = 'globalfly' and id = 'black';
update public.subplanos set checkout_por_parceiro = jsonb_build_object('n', 'https://pay.cakto.com.br/3fnk7dt')
 where marca = 'globalfly' and id = 'prestige';

create or replace function public.teeds_meu_subplano(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  with eu as (
    select (select c.parceiro from clientes c where c.user_id = auth.uid() and c.marca = p_marca limit 1) as parceiro
  )
  select jsonb_build_object(
    'atual', public.teeds_subplano_id(auth.uid(), p_marca),
    'admin', exists(select 1 from administradores where user_id = auth.uid() and marca = p_marca),
    'minutos_hoje', round(public.teeds_simulador_minutos_hoje(auth.uid(), p_marca)),
    'subplanos', coalesce((
      select jsonb_agg(
        (to_jsonb(s) - 'marca' - 'checkout_por_parceiro')
        || jsonb_build_object('checkout_url', coalesce(nullif(s.checkout_por_parceiro ->> eu.parceiro, ''), s.checkout_url))
        order by s.ordem)
      from subplanos s, eu
      where s.marca = p_marca and s.ativo), '[]'::jsonb))
$$;
