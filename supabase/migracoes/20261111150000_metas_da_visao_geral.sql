-- 11/11/2026 (Tiago: "quero que tenha algumas metas configuráveis... meta de depósito e meta de markup
-- somente. E aí eu consigo configurar a meta e ver o avanço e quanto falta pra bater, numa animação bem top!").
-- Ele escolheu: metas do dia, da semana e do mês; uma geral (filtro "Todos") e, se quiser, uma própria para
-- cada parceiro (/n, /v, /d, Direto), que aparece quando o topo filtra por ele.
--
-- Só guarda o VALOR da meta. O quanto já foi feito vem da leitura de sempre (teeds_painel_periodo: o markup
-- da contagem única e os depósitos de movimentacoes_deriv), sem conta nova.

create table if not exists public.painel_metas (
  marca text not null,
  -- '' = meta geral (Todos); 'n', 'v', 'd', 'direto' = meta do parceiro
  parceiro text not null default '',
  horizonte text not null check (horizonte in ('dia', 'semana', 'mes')),
  deposito numeric check (deposito is null or deposito > 0),
  markup numeric check (markup is null or markup > 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (marca, parceiro, horizonte)
);
-- Ninguém lê nem grava direto: só pelas duas funções abaixo, que conferem quem pede.
alter table public.painel_metas enable row level security;
revoke all on table public.painel_metas from anon, authenticated;

-- As metas do escopo pedido (as três: dia, semana e mês). Mesmo escopo da Visão geral: admin pleno da marca;
-- o admin de parceiro só enxerga as do parceiro dele.
create or replace function public.teeds_metas_painel(p_marca text, p_parceiro text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_par text;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê as metas'; end if;
  v_par := coalesce(nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), ''), '');
  return jsonb_build_object(
    'parceiro', v_par,
    'metas', coalesce((select jsonb_object_agg(m.horizonte, jsonb_build_object(
                         'deposito', m.deposito, 'markup', m.markup, 'atualizado_em', m.atualizado_em))
                         from public.painel_metas m where m.marca = p_marca and m.parceiro = v_par), '{}'::jsonb)
  );
end $$;
revoke all on function public.teeds_metas_painel(text, text) from public, anon;
grant execute on function public.teeds_metas_painel(text, text) to authenticated;

-- Salvar (ou apagar, com os dois valores vazios) a meta de um horizonte.
create or replace function public.teeds_salvar_meta_painel(p_marca text, p_parceiro text, p_horizonte text, p_deposito numeric, p_markup numeric)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_par text;
  v_dep numeric := case when coalesce(p_deposito, 0) > 0 then round(p_deposito, 2) end;
  v_mk numeric := case when coalesce(p_markup, 0) > 0 then round(p_markup, 2) end;
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração define as metas'; end if;
  if p_horizonte not in ('dia', 'semana', 'mes') then raise exception 'Escolha dia, semana ou mês'; end if;
  v_par := coalesce(nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), ''), '');
  if v_dep is null and v_mk is null then
    delete from public.painel_metas where marca = p_marca and parceiro = v_par and horizonte = p_horizonte;
  else
    insert into public.painel_metas (marca, parceiro, horizonte, deposito, markup, atualizado_em, atualizado_por)
    values (p_marca, v_par, p_horizonte, v_dep, v_mk, now(), auth.uid())
    on conflict (marca, parceiro, horizonte) do update
      set deposito = excluded.deposito, markup = excluded.markup, atualizado_em = now(), atualizado_por = auth.uid();
  end if;
  return public.teeds_metas_painel(p_marca, v_par);
end $$;
revoke all on function public.teeds_salvar_meta_painel(text, text, text, numeric, numeric) from public, anon;
grant execute on function public.teeds_salvar_meta_painel(text, text, text, numeric, numeric) to authenticated;
