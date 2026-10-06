-- Quanto cada sessão encerrada rendeu de markup, para a tela de monitoramento.
--
-- A lista de "Sessões encerradas" lê `sessoes_robos`, e essa tabela não guarda
-- markup: ele vive operação a operação, em `operacoes_robos.markup`. Somar isso
-- no navegador significaria baixar as operações de 300 sessões — uma delas tem
-- 337 — só para mostrar uma coluna. Então a soma é feita aqui, de uma vez, para
-- os ids que estão na tela.
--
-- `security definer` COM GUARDA EXPLÍCITA. `operacoes_robos` tem RLS; uma função
-- `invoker` devolveria zero linhas em silêncio, que é o pior resultado possível
-- numa coluna de dinheiro: ela apareceria zerada e pareceria verdade. A guarda é
-- `teeds_sou_admin_da(p_marca)`, a mesma do resto do monitoramento, e vem ANTES
-- de qualquer leitura.
--
-- DEMO ENTRA, e de propósito: a tela mostra sessões demo e reais lado a lado e
-- filtra por conta. Esconder o markup das demo aqui faria a soma da tela não
-- bater com o filtro "Todas". Quem chama recebe o `demo` da própria sessão e
-- rotula — markup de conta demo é simulação, não dinheiro.

create or replace function public.teeds_markup_das_sessoes(
  p_marca text,
  p_ids   uuid[]
) returns table (sessao_id uuid, operacoes bigint, markup numeric, markup_deriv numeric)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.teeds_sou_admin_da(p_marca) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;
  -- Teto defensivo: a tela pede no máximo 300 ids. Um pedido maior que isso é
  -- engano ou abuso, e varrer a tabela inteira por engano é caro.
  if cardinality(p_ids) > 500 then
    raise exception 'ids demais (máximo 500)' using errcode = '22023';
  end if;

  return query
    select o.sessao_id,
           count(*)::bigint,
           round(sum(o.markup)::numeric, 4),
           -- Nulo quando a Deriv não informou o markup em nenhuma operação:
           -- zero diria "ela informou e deu zero", que é outra coisa.
           case when count(o.markup_deriv) = 0 then null
                else round(sum(o.markup_deriv)::numeric, 4) end
      from public.operacoes_robos o
     where o.marca = p_marca
       and o.sessao_id = any (p_ids)
     group by o.sessao_id;
end;
$function$;

comment on function public.teeds_markup_das_sessoes(text, uuid[]) is
  'Markup somado por sessão, para a lista de sessões encerradas. Só admin da marca.';

revoke all on function public.teeds_markup_das_sessoes(text, uuid[]) from public, anon;
grant execute on function public.teeds_markup_das_sessoes(text, uuid[]) to authenticated;
