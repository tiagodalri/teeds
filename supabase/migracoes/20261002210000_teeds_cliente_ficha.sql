-- A ficha completa de um cliente, numa consulta so.
--
-- O painel ja sabia quase tudo sobre a base e quase nada sobre UMA pessoa: a
-- ficha mostrava quatro numeros e as contas da corretora. Para atender um
-- cliente, falava tudo o que importa — quando ele entra, quanto fica, o que
-- assistiu, quais robos rodou, como foi, se abriu os e-mails.
--
-- Vem tudo junto de proposito. Oito consultas separadas a partir da tela
-- seriam oito idas ao banco, oito estados de carregamento e oito jeitos de
-- ficar pela metade. Aqui a ficha chega inteira ou nao chega.
--
-- `security definer` COM GUARDA EXPLICITA no topo. As tabelas envolvidas tem
-- politicas de RLS diferentes entre si, e alguma sem politica de leitura para
-- o admin devolveria vazio em silencio — foi exatamente o que aconteceu com
-- as visitas, que anunciaram "nenhuma visita" com o banco cheio. Definer tira
-- o RLS da jogada e a autorizacao passa a ser uma linha que da para ler: se
-- quem pergunta nao e admin da marca da pessoa, volta null.
--
-- As listas sao cortadas (90 dias de acesso, 30 operacoes, 20 sessoes) porque
-- esta ficha abre num clique: ela precisa ser barata, nao exaustiva. O que
-- precisar de mais fundo tem tela propria.

create or replace function public.teeds_cliente_ficha(p_marca text, p_user_id uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $function$
declare m text[]; c record; resultado json;
begin
  m := public.teeds_marcas_em_foco(p_marca);
  if coalesce(array_length(m, 1), 0) = 0 then return null; end if;

  select cl.*, case
      when cl.acesso_expira_em is not null and cl.acesso_expira_em < now()
       and coalesce(cl.status_acesso, 'ativo') = 'ativo' then 'expirado'
      else coalesce(cl.status_acesso, 'ativo') end as situacao
    into c
  from public.clientes cl
  where cl.user_id = p_user_id and cl.marca = any(m)
  limit 1;
  -- Nao e cliente das marcas que este admin enxerga: mesma resposta de quem
  -- nao e admin, para a ficha nao virar um detector de "existe ou nao".
  if c.user_id is null then return null; end if;

  select json_build_object(
    'cliente', json_build_object(
      'user_id', c.user_id, 'nome', c.nome, 'email', c.email, 'telefone', c.telefone,
      'cpf', c.cpf, 'marca', c.marca, 'plano_id', c.plano_id, 'situacao', c.situacao,
      'criado_em', c.criado_em, 'visto_em', c.visto_em,
      'acesso_inicio', c.acesso_inicio, 'acesso_expira_em', c.acesso_expira_em,
      'total_acessos', coalesce(c.total_acessos, 0),
      'tempo_total_segundos', coalesce(c.tempo_total_segundos, 0),
      'sessao_atual', c.sessao_atual, 'sessao_atual_segundos', coalesce(c.sessao_atual_segundos, 0),
      'fuso_horario', c.fuso_horario, 'idioma', c.idioma, 'observacoes', c.observacoes
    ),

    -- Como esta pessoa entrou: pedido, aprovacao, e se foi recadastro.
    'cadastro', (
      select json_build_object('status', p.status, 'pedido_em', p.criado_em,
                               'decidido_em', p.decidido_em, 'recadastro', p.recadastro,
                               'email_cadastro_em', p.email_cadastro_em, 'email_aprovacao_em', p.email_enviado_em)
      from public.clientes_pendentes p
      where p.user_id = c.user_id order by p.criado_em desc limit 1
    ),

    'contas', (
      select coalesce(json_agg(json_build_object(
        'conta_id', d.conta_id, 'tipo', d.tipo, 'moeda', d.moeda, 'saldo', d.saldo,
        'conectada_em', d.conectada_em, 'vista_em', d.vista_em) order by d.tipo, d.conta_id), '[]'::json)
      from public.contas_deriv d where d.user_id = c.user_id
    ),

    -- Quando entra e quanto fica, dia a dia. O `dispositivo` e o `fuso` contam
    -- de onde: celular no almoco e computador a noite sao pessoas diferentes.
    'acessos', (
      select json_build_object(
        'dias', coalesce((select json_agg(json_build_object(
            'dia', a.dia, 'acessos', a.acessos, 'segundos', a.segundos,
            'dispositivo', a.dispositivo, 'fuso', a.fuso) order by a.dia)
          from public.acessos_diarios a
          where a.user_id = c.user_id and a.dia >= current_date - 89), '[]'::json),
        'primeiro_dia', (select min(a.dia) from public.acessos_diarios a where a.user_id = c.user_id),
        'dias_com_acesso', (select count(*) from public.acessos_diarios a where a.user_id = c.user_id),
        'por_dispositivo', coalesce((select json_agg(x) from (
            select coalesce(a.dispositivo, 'desconhecido') as dispositivo,
                   sum(a.acessos) as acessos, sum(a.segundos) as segundos
            from public.acessos_diarios a where a.user_id = c.user_id
            group by 1 order by 2 desc) x), '[]'::json)
      )
    ),

    'aulas', (
      select coalesce(json_agg(json_build_object(
        'aula_id', g.aula_id, 'aberturas', g.aberturas, 'segundos', g.segundos,
        'posicao_max', g.posicao_max, 'concluida', g.concluida,
        'primeira_vez', g.primeira_vez, 'ultima_vez', g.ultima_vez) order by g.ultima_vez desc), '[]'::json)
      from public.aulas_progresso g where g.user_id = c.user_id
    ),

    -- O que ele rodou, por robo, e as ultimas sessoes como linha do tempo.
    'robos', json_build_object(
      'por_robo', coalesce((select json_agg(x) from (
          select s.robo_id, max(s.robo_nome) as robo_nome, count(*) as sessoes,
                 sum(s.operacoes) as operacoes, sum(s.ganhas) as ganhas, sum(s.perdidas) as perdidas,
                 sum(s.resultado) as resultado, max(s.criada_em) as ultima_vez,
                 count(*) filter (where s.demo) as sessoes_demo
          from public.sessoes_robos s where s.user_id = c.user_id
          group by s.robo_id order by count(*) desc) x), '[]'::json),
      'ultimas', coalesce((select json_agg(x) from (
          select s.robo_nome, s.robo_id, s.demo, s.moeda, s.situacao, s.operacoes, s.ganhas, s.perdidas,
                 s.resultado, s.entrada_inicial, s.motivo_da_parada, s.criada_em, s.encerrada_em
          from public.sessoes_robos s where s.user_id = c.user_id
          order by s.criada_em desc limit 20) x), '[]'::json)
    ),

    'operacoes', json_build_object(
      'resumo', (select json_build_object(
          'total', count(*), 'ganhas', count(*) filter (where o.ganhou),
          'entradas', coalesce(sum(o.entrada), 0), 'resultado', coalesce(sum(o.resultado), 0),
          'markup', coalesce(sum(o.markup), 0),
          'reais', count(*) filter (where not o.demo),
          'resultado_real', coalesce(sum(o.resultado) filter (where not o.demo), 0),
          'markup_real', coalesce(sum(o.markup) filter (where not o.demo), 0),
          'primeira', min(o.executada_em), 'ultima', max(o.executada_em))
        from public.operacoes_robos o
        where o.user_id = c.user_id and o.executada_em >= now() - interval '90 days'),
      'ultimas', coalesce((select json_agg(x) from (
          select o.robo_nome, o.ativo, o.demo, o.moeda, o.entrada, o.resultado, o.markup,
                 o.ganhou, o.digito_saida, o.executada_em
          from public.operacoes_robos o where o.user_id = c.user_id
          order by o.executada_em desc limit 30) x), '[]'::json)
    ),

    -- O lado do e-mail: o que a casa mandou e o que esta pessoa abriu. Diz se
    -- vale insistir por e-mail ou se o caminho e outro.
    'emails', (
      select json_build_object(
        'enviados', count(*),
        'abertos', count(*) filter (where ev.aberto),
        'ultimo_envio', max(e.enviado_em),
        'ultima_abertura', max(ev.quando),
        'descadastrado', exists (select 1 from public.descadastros d
                                  where d.marca = c.marca and lower(d.email) = lower(c.email))
      )
      from public.envios_campanha e
      left join lateral (
        select bool_or(r.tipo = 'opened') as aberto, max(r.ocorrido_em) filter (where r.tipo = 'opened') as quando
        from public.email_eventos_resend r where r.email_id = e.id_envio::uuid
      ) ev on true
      where e.marca = c.marca and lower(e.email) = lower(c.email)
    )
  ) into resultado;

  return resultado;
end;
$function$;
