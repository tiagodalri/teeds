-- Visitas ao site, com a origem de quem chegou.
--
-- Os insights até hoje só enxergavam quem ENTRA: os acessos são contados por
-- user_id, então quem abre teedscompany.com e vai embora sem se cadastrar é
-- invisível. Era o buraco que escondia justamente o número que importa numa
-- campanha: quantas pessoas o link alcançou, e por qual caminho.
--
-- O que esta tabela guarda, e o que ela deliberadamente NÃO guarda.
--
-- Guarda: marca, quando, um id anônimo de navegador, a origem (utm_source e
-- companhia), o domínio de onde a pessoa veio, dispositivo, idioma e fuso.
--
-- Não guarda IP. O painel de insights afirma isso em letra miúda desde que
-- nasceu ("a plataforma não guarda o IP de ninguém") e seria uma mentira
-- discreta começar a guardar aqui. O servidor até vê o IP, porque precisa
-- dele para o freio de repetição, mas ele morre na memória do processo.
--
-- O `visitante` é um id aleatório que vive no navegador da pessoa. Serve para
-- separar "500 visitas" de "500 pessoas" e nada mais: não atravessa domínios,
-- não identifica ninguém e some quando a pessoa limpa o navegador.
--
-- Quem escreve é o servidor, com a chave de serviço, por uma porta pública
-- com freio por IP. Por isso a tabela liga o RLS e não ganha política
-- nenhuma: cliente nenhum lê ou escreve direto, e as leituras do painel
-- passam pelas funções abaixo, que conferem se quem pergunta é admin.

create table if not exists public.visitas (
  id bigserial primary key,
  marca text not null,
  visitante text not null,
  criado_em timestamptz not null default now(),
  origem text,
  meio text,
  campanha text,
  referencia text,
  dispositivo text,
  idioma text,
  fuso text,
  caminho text
);

comment on table public.visitas is
  'Uma linha por visita ao site da marca. Sem IP e sem dado pessoal: o `visitante` é um id anônimo de navegador, só para separar visitas de pessoas.';

alter table public.visitas enable row level security;

-- As duas perguntas que o painel faz: "quantas visitas no período" e
-- "quantas por origem". Ambas filtram por marca e data.
create index if not exists visitas_marca_quando on public.visitas (marca, criado_em desc);
create index if not exists visitas_marca_origem on public.visitas (marca, origem, criado_em desc);

-- POR QUE AS LEITURAS SAO `security definer`.
--
-- A tabela acima liga o RLS e nao tem politica nenhuma: ninguem le direto,
-- nem o admin. As outras funcoes de insights sao `invoker` e funcionam porque
-- as tabelas delas tem politica de leitura para o admin; esta nao tem.
--
-- Estas nasceram invoker por engano e o sintoma foi traicoeiro: nao deu erro,
-- deu ZERO LINHA em silencio, e o painel anunciou "nenhuma visita registrada"
-- com o banco cheio. Corrigido em 02/10/2026, com prova nos dois sentidos:
-- admin enxerga, cliente comum recebe null, e a tabela segue ilegivel direto.
--
-- Definer e seguro aqui porque a autorizacao mora DENTRO da funcao:
-- `teeds_marcas_em_foco` confere se quem pergunta e admin da marca, e le
-- `auth.uid()`, que vem do JWT da requisicao e nao muda com definer.

/* ------------------------------------------------------------------ *
 * As leituras do painel. Mesmo molde dos outros insights: respondem
 * pelas marcas em foco e devolvem vazio para quem não é admin delas.
 * ------------------------------------------------------------------ */

create or replace function public.teeds_insights_visitas(p_marca text default 'teeds', p_dias integer default 30)
returns json language sql stable security definer set search_path to 'public' as $$
  select case when coalesce(array_length(public.teeds_marcas_em_foco(p_marca), 1), 0) = 0 then null else json_build_object(
    'visitas', (select count(*) from public.visitas
                 where marca = any(public.teeds_marcas_em_foco(p_marca))
                   and criado_em >= now() - make_interval(days => p_dias)),
    'visitantes', (select count(distinct visitante) from public.visitas
                 where marca = any(public.teeds_marcas_em_foco(p_marca))
                   and criado_em >= now() - make_interval(days => p_dias)),
    'visitas_hoje', (select count(*) from public.visitas
                 where marca = any(public.teeds_marcas_em_foco(p_marca))
                   and criado_em >= date_trunc('day', now())),
    'visitantes_hoje', (select count(distinct visitante) from public.visitas
                 where marca = any(public.teeds_marcas_em_foco(p_marca))
                   and criado_em >= date_trunc('day', now()))
  ) end;
$$;

create or replace function public.teeds_insights_visitas_dia(p_marca text default 'teeds', p_dias integer default 30)
returns table(dia date, visitas bigint, visitantes bigint)
language sql stable security definer set search_path to 'public' as $$
  -- generate_series sobre datas devolve TIMESTAMP, não date: somar 1 inteiro
  -- aqui não compila. A janela do dia vai de intervalo, e o dia sai do select.
  select d.dia::date, count(v.id), count(distinct v.visitante)
  from generate_series(current_date - (p_dias - 1), current_date, '1 day') as d(dia)
  left join public.visitas v
    on v.marca = any(public.teeds_marcas_em_foco(p_marca))
   and v.criado_em >= d.dia and v.criado_em < d.dia + interval '1 day'
  group by d.dia order by d.dia;
$$;

-- De onde vieram. `origem` vazia é quem digitou o endereço ou veio de um
-- link sem marcação: fica como "direto", que é a verdade e não um buraco.
create or replace function public.teeds_insights_origens(p_marca text default 'teeds', p_dias integer default 30)
returns table(origem text, meio text, campanha text, visitas bigint, visitantes bigint, ultima_vez timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select coalesce(nullif(v.origem, ''), nullif(v.referencia, ''), 'direto'),
         coalesce(nullif(v.meio, ''), ''), coalesce(nullif(v.campanha, ''), ''),
         count(*), count(distinct v.visitante), max(v.criado_em)
  from public.visitas v
  where v.marca = any(public.teeds_marcas_em_foco(p_marca))
    and v.criado_em >= now() - make_interval(days => p_dias)
  group by 1, 2, 3
  order by count(*) desc
  limit 40;
$$;
