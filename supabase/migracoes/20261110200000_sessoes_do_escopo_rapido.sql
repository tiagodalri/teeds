-- 10/11/2026 — o canal ao vivo do Monitoramento travava (Tiago: "mostra 2 pessoas operando mas na
-- verdade só tem 1… quando clico não tem nenhuma"; e cartões "sem atualização" com o robô vivo).
--
-- Causa: as regras de leitura de pulsos_robos_ao_vivo e eventos_robos_ao_vivo usam
-- teeds_sessoes_do_escopo(). Em SQL puro o Postgres "expandia" teeds_escopos() dentro de cada uma das
-- ~2.900 linhas de sessoes_robos e a recalculava linha a linha: 10–14 s para cada administrador de
-- parceiro. O Realtime confere essa regra a cada pulso (um a cada 2 s por I.A.) para cada admin
-- conectado; estourava o tempo ("canceling statement… teeds_parceiro_extra_pedido") e perdia as
-- mensagens, e a tela só se atualizava na conferência de 20 s.
--
-- Mudança: a MESMA regra, com os escopos calculados uma vez (plpgsql) e o parceiro da conta lido por
-- junção com clientes (o que teeds_parceiro_da_conta fazia linha a linha; (user_id, marca) é único).
-- Conferido antes de aplicar, antigo x novo, sessão a sessão: todos os administradores (geral,
-- /n, /v), um cliente, e o admin geral com vitrine /n e Direto, o Victor vendo o /n — listas
-- idênticas; 10–14 s → 16–39 ms. Nenhuma regra de acesso (policy) muda.
--
-- Para desfazer, a versão anterior era:
--   create or replace function public.teeds_sessoes_do_escopo() returns uuid[] language sql stable
--   security definer set search_path to 'public' as $$
--     select coalesce(array_agg(s.id), '{}')
--     from public.sessoes_robos s, (select public.teeds_escopos() as l) e
--     where cardinality(e.l) > 0
--       and s.marca = any (array(select split_part(v, ':', 1) from unnest(e.l) v))
--       and (s.marca || ':' || coalesce(s.parceiro, public.teeds_parceiro_da_conta(s.marca, s.user_id), '')) = any (e.l);
--   $$;
create or replace function public.teeds_sessoes_do_escopo()
returns uuid[]
language plpgsql stable security definer set search_path to 'public' as $f$
declare l text[] := public.teeds_escopos();
begin
  if l is null or cardinality(l) = 0 then return '{}'; end if;
  return (select coalesce(array_agg(s.id), '{}')
            from public.sessoes_robos s
            left join public.clientes c on c.user_id = s.user_id and c.marca = s.marca
           where s.marca = any (array(select split_part(v, ':', 1) from unnest(l) v))
             and (s.marca || ':' || coalesce(s.parceiro, c.parceiro, '')) = any (l));
end $f$;
