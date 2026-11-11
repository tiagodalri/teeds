-- 11/11/2026 (Tiago: "eu gostaria que no painel da visão geral o markup atualizasse 100% em tempo real...
-- cada vez que um markup é gerado... igual lá nos cards do monitoramento ao vivo").
--
-- Cada operação já entra no banco em ~0,1 s (medido: 16.543 operações reais em 24 h, mediana 0,1 s, máx 4,8 s).
-- O atraso era só da tela, que relia a cada 15 s. Reler o painel inteiro a cada operação custaria ~0,3 s de
-- banco a cada 2 s por tela aberta (painel 123 ms, período do mês 142 ms) — pesado demais.
--
-- Então: a leitura grande continua a cada 15 s e devolve `lido_em`; a tela pergunta a cada 2 s só "quanto markup
-- entrou DEPOIS dessa leitura" (esta função, poucos ms: janela de minutos no índice de contas reais) e soma por
-- cima. Quando a próxima leitura grande chega, ela já inclui essas operações e a soma por cima volta a zero.
-- Mesma regra da contagem única (teeds_markup_operacoes): só conta real, equipe fora, parceiro do topo, um
-- contrato uma vez, I.A. e manual. "Depois" = gravada no banco depois de `p_desde` (criado_em), para nunca contar
-- duas vezes o que a leitura grande já viu.
create or replace function public.teeds_markup_desde(p_marca text, p_desde timestamptz, p_parceiro text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_marcas text[];
  v_par text;
  v_desde timestamptz := greatest(coalesce(p_desde, now()), now() - interval '10 minutes');
  r jsonb;
begin
  if p_marca = 'todas' then
    if public.teeds_parceiro_forcado('todas') is not null then raise exception 'Só a administração vê o markup'; end if;
    v_marcas := public.teeds_marcas_em_foco('todas');
  else
    if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê o markup'; end if;
    v_marcas := array[p_marca];
  end if;
  v_par := nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '');

  with cli as (
    select c.user_id, c.marca from public.clientes c
     where c.marca = any(v_marcas)
       and not exists (select 1 from public.administradores a where a.user_id = c.user_id)
       and (v_par is null or (v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par)
  ),
  ops as (
    select distinct on (x.contract_id) x.* from (
      -- a janela em executada_em usa o índice das contas reais; o corte de verdade é criado_em > desde
      select 'ia'::text as origem, o.contract_id, o.executada_em as quando, coalesce(o.markup, 0) as markup
        from public.operacoes_robos o
        join cli on cli.user_id = o.user_id and cli.marca = o.marca
       where o.marca = any(v_marcas) and not o.demo
         and o.executada_em >= v_desde - interval '5 minutes' and o.criado_em > v_desde
      union all
      select 'manual', m.contract_id, m.comprada_em, coalesce(m.markup, 0)
        from public.operacoes_manuais m
        join cli on cli.user_id = m.user_id and cli.marca = m.marca
       where m.marca = any(v_marcas) and not m.demo and coalesce(m.pagamento, 0) > 0
         and m.comprada_em >= v_desde - interval '5 minutes' and m.criado_em > v_desde
    ) x
    order by x.contract_id, x.origem
  )
  select jsonb_build_object(
    'desde', v_desde,
    'markup', coalesce(sum(markup), 0),
    'operacoes', count(*),
    'ia_markup', coalesce(sum(markup) filter (where origem = 'ia'), 0),
    'manual_markup', coalesce(sum(markup) filter (where origem = 'manual'), 0),
    'ia_operacoes', count(*) filter (where origem = 'ia'),
    'manual_operacoes', count(*) filter (where origem = 'manual'),
    'ultima_em', max(quando),
    'lido_em', now()
  ) into r from ops;
  return r;
end $$;
revoke all on function public.teeds_markup_desde(text, timestamptz, text) from public, anon;
grant execute on function public.teeds_markup_desde(text, timestamptz, text) to authenticated;

-- A aba Comissões lê teeds_markup_interno: ela passa a devolver `lido_em` (já devolvia) — nada muda aqui.
