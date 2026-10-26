-- Aplicada em 27/10/2026 ("parceiros_meu_parceiro_e_os_proprios").
-- teeds_meu_parceiro(p_marca): o parceiro da conta logada, para o endereço levar /n ou /v.
-- E, a pedido do Tiago, a conta do próprio parceiro no grupo dele: Naor -> n, Victor Cordeiro -> v
-- (fonte 'manual', registradas em parceiro_trocas).
create or replace function public.teeds_meu_parceiro(p_marca text)
returns text language sql stable security definer set search_path to 'public' as $$
  select c.parceiro from public.clientes c where c.user_id = (select auth.uid()) and c.marca = p_marca;
$$;
grant execute on function public.teeds_meu_parceiro(text) to authenticated;
