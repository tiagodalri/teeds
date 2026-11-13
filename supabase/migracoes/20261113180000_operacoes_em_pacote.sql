-- Operações das I.A. gravadas em PACOTE (13/11/2026).
--
-- Até aqui cada operação liquidada fazia duas idas ao banco, uma depois da
-- outra: POST em operacoes_robos e PATCH em sessoes_robos. No teste de carga
-- de 13/11 (50 I.A., ~17 operações/s) isso era ~35 pedidos/s só disso, e a API
-- do Supabase foi a ~0,5 s por pedido — o play dos clientes espera na mesma fila.
--
-- Agora o servidor junta as operações de TODAS as sessões a cada ~0,5 s e chama
-- esta função uma vez: insere as operações (repetida = ignorada, como antes) e
-- atualiza o placar de cada sessão com o estado mais novo do pacote. O placar
-- nunca anda para trás: um pacote atrasado (nova tentativa) não sobrescreve um
-- mais novo. Os gatilhos de operacoes_robos (vitrine/parceiro) continuam valendo.
--
-- Só a chave de serviço chama.

create or replace function public.teeds_gravar_operacoes(p_operacoes jsonb, p_sessoes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_ops int := 0;
  n_ses int := 0;
begin
  if jsonb_typeof(p_operacoes) = 'array' and jsonb_array_length(p_operacoes) > 0 then
    insert into public.operacoes_robos (
      contract_id, user_id, marca, conta_id, robo_id, robo_nome, ativo, tipo_contrato, demo, moeda,
      entrada, pagamento, resultado, ganhou, markup, markup_deriv, executada_em, sessao_id, seq,
      preco_entrada, digito_entrada, preco_saida, digito_saida, acumulado)
    select
      r.contract_id, r.user_id, r.marca, r.conta_id, r.robo_id, r.robo_nome, r.ativo, r.tipo_contrato, r.demo, r.moeda,
      r.entrada, r.pagamento, r.resultado, r.ganhou, r.markup, r.markup_deriv, r.executada_em, r.sessao_id, r.seq,
      r.preco_entrada, r.digito_entrada, r.preco_saida, r.digito_saida, r.acumulado
    from jsonb_populate_recordset(null::public.operacoes_robos, p_operacoes) r
    on conflict (user_id, contract_id) do nothing;
    get diagnostics n_ops = row_count;
  end if;

  if jsonb_typeof(p_sessoes) = 'array' and jsonb_array_length(p_sessoes) > 0 then
    update public.sessoes_robos s set
      operacoes = x.operacoes,
      ganhas = x.ganhas,
      perdidas = x.perdidas,
      resultado = x.resultado,
      movimentado = x.movimentado,
      entrada_atual = x.entrada_atual
    from jsonb_to_recordset(p_sessoes) as x(id uuid, operacoes int, ganhas int, perdidas int, resultado numeric, movimentado numeric, entrada_atual numeric)
    where s.id = x.id and x.operacoes >= coalesce(s.operacoes, 0);
    get diagnostics n_ses = row_count;
  end if;

  return jsonb_build_object('operacoes', n_ops, 'sessoes', n_ses);
end
$$;

revoke all on function public.teeds_gravar_operacoes(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.teeds_gravar_operacoes(jsonb, jsonb) to service_role;
