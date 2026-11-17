-- 17/11/2026 (Tiago: "o Victor Cordeiro vê os resultados dele e do Naor separados; ele precisa ver a
-- somatória também, além de ver individual por projeto"). O admin do parceiro que vê mais de um
-- parceiro (administradores.ve_parceiros com 2 ou mais) ganha o "Todos" na Visão geral: o cabeçalho
-- x-teeds-vitrine = 'todos' vira a lista dele ('n,v'), e as funções da Visão geral filtram por
-- qualquer um da lista. Nunca entra parceiro fora da lista (Douglas, Direto).
--
-- Só as funções da Visão geral aceitam a lista. As outras seguem com teeds_parceiro_forcado: com o
-- 'todos' elas continuam no parceiro do próprio admin (o site só manda 'todos' na Visão geral).

-- o cliente/registro entra no filtro? v_par: null = todos; 'direto' = sem parceiro; 'v' ou 'n,v' = um ou vários
create or replace function public.teeds_no_parceiro(p_do_registro text, p_par text)
returns boolean language sql immutable as $$
  select p_par is null or (p_par = 'direto' and p_do_registro is null) or p_do_registro = any(string_to_array(p_par, ','))
$$;

-- o parceiro (ou a lista) que o painel usa: admin geral escolhe pelo parâmetro; admin do parceiro fica
-- no forçado, ou na lista inteira dele quando pede 'todos'
create or replace function public.teeds_parceiro_do_painel(p_marca text, p_parceiro text)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when public.teeds_parceiro_forcado(p_marca) is null then nullif(trim(coalesce(p_parceiro, '')), '')
    when public.teeds_vitrine_pedida() = 'todos' and cardinality(public.teeds_parceiros_que_vejo(p_marca)) > 1
      then array_to_string(array(select x from unnest(public.teeds_parceiros_que_vejo(p_marca)) x order by x), ',')
    else public.teeds_parceiro_forcado(p_marca)
  end
$$;

-- as funções da Visão geral passam a usar os dois acima (troca de texto conferida: se não trocar, para)
do $$
declare
  f record; d text; novo text;
  a_de text := $q$nullif(trim(coalesce(public.teeds_parceiro_forcado(p_marca), p_parceiro, '')), '')$q$;
  a_para text := $q$public.teeds_parceiro_do_painel(p_marca, p_parceiro)$q$;
  b_de text := $q$(v_par is null or (v_par = 'direto' and c.parceiro is null) or c.parceiro = v_par)$q$;
  b_para text := $q$public.teeds_no_parceiro(c.parceiro, v_par)$q$;
  c_de text := $q$(p_parceiro is null or (p_parceiro = 'direto' and c.parceiro is null) or c.parceiro = p_parceiro)$q$;
  c_para text := $q$public.teeds_no_parceiro(c.parceiro, p_parceiro)$q$;
begin
  for f in select * from (values
      ('teeds_painel_visao_geral', true, true, false),
      ('teeds_markup_desde', true, true, false),
      ('teeds_markup_mapa', true, false, false),
      ('teeds_markup_mapa_detalhe', true, false, false),
      ('teeds_painel_periodo', true, true, false),
      ('teeds_painel_negocio', true, true, false),
      ('teeds_markup_operacoes', false, false, true)) t(nome, a, b, c)
  loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f.nome;
    if d is null then raise exception 'função % não existe', f.nome; end if;
    novo := d;
    if f.a then
      if position(a_de in novo) = 0 then raise exception '% sem o parceiro forçado esperado', f.nome; end if;
      novo := replace(novo, a_de, a_para);
    end if;
    if f.b then
      if position(b_de in novo) = 0 then raise exception '% sem o filtro de cliente esperado', f.nome; end if;
      novo := replace(novo, b_de, b_para);
    end if;
    if f.c then
      if position(c_de in novo) = 0 then raise exception '% sem o filtro de cliente esperado', f.nome; end if;
      novo := replace(novo, c_de, c_para);
    end if;
    execute novo;
  end loop;
end $$;

-- as metas: com a lista, a meta de cada parceiro somada (só leitura: salvar continua no parceiro de quem salva)
create or replace function public.teeds_metas_painel(p_marca text, p_parceiro text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_par text;
  v_lista text[];
begin
  if not public.teeds_admin_pleno_da(p_marca) then raise exception 'Só a administração vê as metas'; end if;
  v_par := coalesce(public.teeds_parceiro_do_painel(p_marca, p_parceiro), '');
  v_lista := case when position(',' in v_par) > 0 then string_to_array(v_par, ',') else array[v_par] end;
  return jsonb_build_object(
    'parceiro', v_par,
    'metas', coalesce((select jsonb_object_agg(x.horizonte, jsonb_build_object(
                         'deposito', x.deposito, 'markup', x.markup, 'atualizado_em', x.atualizado_em))
                         from (select m.horizonte, sum(m.deposito) as deposito, sum(m.markup) as markup, max(m.atualizado_em) as atualizado_em
                                 from public.painel_metas m where m.marca = p_marca and m.parceiro = any(v_lista)
                                group by m.horizonte) x), '{}'::jsonb)
  );
end $function$;
