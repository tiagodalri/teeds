-- Quarta marca: Legacy Pro (24/11/2026), da família da GlobalFly.
--
-- Mesmo caminho da GlobalFly (20261016170000_teeds_marca_globalfly.sql):
-- nada é apagado. Cada regra de lista de marcas ganha 'legacypro', e cada
-- função é reescrita a partir da própria definição no banco, trocando só o
-- trecho conferido. Se um trecho não for encontrado, a migração para inteira.
--
-- O que é negócio só da GlobalFly NÃO entra aqui e continua só 'globalfly':
-- live/lançamento de 09/11 (gf_avisos_da_live, teeds_gf_liberar_novos,
-- teeds_lancamento_*, gf_registrar_liberacao, gf_responder_questionario,
-- teeds_gf_aprovar_pedidos_de_membros), produtos gf-black/gf-prestige
-- (teeds_gf_categoria_pela_compra), subplanos públicos (gf_subplanos_publicos)
-- e os avisos de comissão/operação real aos admins da GF
-- (teeds_avisar_comissao, teeds_avisar_operacao_real).

-- 1) As tabelas que conferem a marca passam a aceitar 'legacypro'.
do $$
declare t text;
begin
  foreach t in array array[
    'acessos_diarios','acessos_horas','aovivo_config','auditoria_monitoramento_admin','aulas_progresso',
    'aulas_videos','clientes_pendentes','email_eventos_resend','eventos_robos_ao_vivo','grafico_layouts',
    'lab_receitas','leads_capturados','lives','planos_da_marca','pulsos_robos_ao_vivo','robos_parametros',
    'robos_parametros_versoes','sessoes_robos_ao_vivo'
  ] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_marca_check');
    execute format('alter table public.%I add constraint %I check (marca in (''teeds'',''omni'',''globalfly'',''legacypro''))', t, t || '_marca_check');
  end loop;
end $$;

-- 2) As funções: troca exata de um trecho por outro, função a função.
do $$
declare
  r record; f record; def text; novo text;
begin
  for r in
    select * from (values
      -- listas de marcas válidas
      ('teeds_registrar_acesso',      $a$('teeds','omni','globalfly')$a$, $b$('teeds','omni','globalfly','legacypro')$b$),
      ('teeds_registrar_aula',        $a$('teeds','omni','globalfly')$a$, $b$('teeds','omni','globalfly','legacypro')$b$),
      ('teeds_registrar_visita',      $a$('teeds','omni','globalfly')$a$, $b$('teeds','omni','globalfly','legacypro')$b$),
      ('teeds_auditar_monitoramento', $a$('teeds','omni','globalfly')$a$, $b$('teeds','omni','globalfly','legacypro')$b$),
      ('teeds_auditar_negado',        $a$('teeds','omni','globalfly')$a$, $b$('teeds','omni','globalfly','legacypro')$b$),
      ('teeds_escopos',               $a$array['teeds', 'omni', 'globalfly']$a$, $b$array['teeds', 'omni', 'globalfly', 'legacypro']$b$),
      ('teeds_marcas_admin_total',    $a$array['teeds', 'omni', 'globalfly']$a$, $b$array['teeds', 'omni', 'globalfly', 'legacypro']$b$),
      -- funções da família GF
      ('gf_rastro',           $a$p_marca is distinct from 'globalfly'$a$, $b$coalesce(p_marca, '') not in ('globalfly', 'legacypro')$b$),
      ('gf_rastro_app',       $a$p_marca is distinct from 'globalfly'$a$, $b$coalesce(p_marca, '') not in ('globalfly', 'legacypro')$b$),
      ('teeds_conta_travada', $a$and p_marca = 'globalfly'$a$, $b$and p_marca in ('globalfly', 'legacypro')$b$),
      ('teeds_robo_liberado', $a$select p_marca <> 'globalfly'$a$, $b$select p_marca not in ('globalfly', 'legacypro')$b$),
      ('teeds_proteger_plano', $a$new.marca = 'globalfly' and new.categoria is null$a$, $b$new.marca in ('globalfly', 'legacypro') and new.categoria is null$b$),
      ('teeds_proteger_plano', $a$case when new.marca = 'globalfly' then 'gold'$a$, $b$case when new.marca in ('globalfly', 'legacypro') then 'gold'$b$),
      ('teeds_suporte_depois_da_mensagem', $a$when 'globalfly' then 'GlobalFly Trade'$a$, $b$when 'globalfly' then 'GlobalFly Trade' when 'legacypro' then 'Legacy Pro'$b$)
    ) as v(funcao, de, para)
  loop
    for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.funcao loop
      def := pg_get_functiondef(f.oid);
      if position(r.de in def) = 0 then
        raise exception 'trecho não encontrado em %: %', f.oid::regprocedure, r.de;
      end if;
      novo := replace(def, r.de, r.para);
      execute novo;
    end loop;
  end loop;
end $$;

-- 3) O dono administra a marca nova (a conta Teeds do Tiago, como na GlobalFly).
insert into public.administradores (user_id, marca)
values ('7679630d-54dc-439d-a0b5-f2e8d8f5a7aa', 'legacypro')
on conflict do nothing;

-- 4) As I.A. operam com os mesmos parâmetros publicados na GlobalFly
--    (Gulf e Phenom com 5 loss virtuais). Cada marca edita os seus depois.
insert into public.robos_parametros (marca, robo_id, versao, parametros, teste_demo, observacao, simulacao)
select 'legacypro', robo_id, 1, parametros, teste_demo,
       'Copiado da GlobalFly na criação da Legacy Pro (24/11/2026)', simulacao
  from public.robos_parametros where marca = 'globalfly'
on conflict do nothing;

-- 5) Planos PROVISÓRIOS: os mesmos da GlobalFly (menos o da live de 09/11),
--    com o nome da marca. Os definitivos se editam em Administração > Planos.
insert into public.planos_da_marca (marca, plano_id, nome, descricao, duracao_dias, ativo, padrao, recursos, ordem)
select 'legacypro', plano_id,
       case when plano_id = 'treino' then 'Legacy Pro Member' else nome end,
       replace(coalesce(descricao, ''), 'GF Member', 'Legacy Pro Member'),
       duracao_dias, ativo, padrao, recursos, ordem
  from public.planos_da_marca
 where marca = 'globalfly' and plano_id <> 'globalfly-aguardando-live'
on conflict do nothing;
