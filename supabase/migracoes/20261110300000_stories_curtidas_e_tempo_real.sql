-- Stories: o que faltava da lista do Victor (10/11/2026, doc "Stories GlobalFly: o que já tem e o que falta";
-- Tiago: "execute as coisas que faltaram com maestria, faça tudo").
--  1. Curtir separado das reações: o coração liga e desliga (curtiu_em), as reações seguem em `reacao`.
--  2. Painel: contagem de curtidas; em "Quem viu", a foto, a hora exata, se curtiu e se respondeu (até 1.000 pessoas).
--  3. "Visto por N" na própria tela do story, só para a equipe (no escopo do parceiro, sem admins).
--  4. Story novo chega na hora: stories_sinal avisa pelo Realtime; a fileira pergunta de novo.

/* ------------------------------------------------------------- 1. curtida */

alter table public.stories_vistas add column if not exists curtiu_em timestamptz;

create or replace function public.teeds_story_evento(p_story uuid, p_tipo text, p_valor text default null, p_segundos numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.stories%rowtype;
  eu uuid := (select auth.uid());
  conversa uuid;
  nome text;
begin
  if eu is null or not public.teeds_story_pode_ver(p_story) then return; end if;
  select * into s from public.stories where id = p_story;

  if p_tipo = 'visto' then
    insert into public.stories_vistas (story_id, user_id, marca) values (p_story, eu, s.marca)
      on conflict (story_id, user_id) do update set vezes = stories_vistas.vezes + 1, ultima_em = now();
  elsif p_tipo = 'progresso' then
    update public.stories_vistas
       set segundos = greatest(segundos, least(coalesce(p_segundos, 0), s.duracao)),
           completo = completo or coalesce(p_segundos, 0) >= s.duracao - 0.35,
           ultima_em = now()
     where story_id = p_story and user_id = eu;
    return;
  elsif p_tipo = 'curtir' then
    -- '1' curte, '0' desfaz; uma curtida por pessoa (não vira evento: o estado mora na linha da pessoa)
    if p_valor is null or p_valor not in ('0', '1') then return; end if;
    insert into public.stories_vistas (story_id, user_id, marca, curtiu_em)
    values (p_story, eu, s.marca, case when p_valor = '1' then now() end)
      on conflict (story_id, user_id) do update
        set curtiu_em = case when p_valor = '1' then coalesce(stories_vistas.curtiu_em, now()) end;
    return;
  elsif p_tipo = 'voto' then
    if p_valor is null or p_valor !~ '^[0-3]$' then return; end if;
    insert into public.stories_vistas (story_id, user_id, marca, voto) values (p_story, eu, s.marca, p_valor::smallint)
      on conflict (story_id, user_id) do update set voto = coalesce(stories_vistas.voto, excluded.voto);
  elsif p_tipo = 'reacao' then
    if p_valor is null or char_length(p_valor) > 8 then return; end if;
    insert into public.stories_vistas (story_id, user_id, marca, reacao) values (p_story, eu, s.marca, p_valor)
      on conflict (story_id, user_id) do update set reacao = excluded.reacao;
  elsif p_tipo = 'resposta' then
    if not s.responder or p_valor is null or char_length(trim(p_valor)) = 0 then return; end if;
    p_valor := left(trim(p_valor), 500);
    select c.id into conversa from public.suporte_conversas c
     where c.user_id = eu and c.marca = s.marca and c.status <> 'resolvida' and c.arquivada_em is null
     order by c.atualizada_em desc limit 1;
    if conversa is null then
      insert into public.suporte_conversas (user_id, marca, origem, assunto, parceiro, contexto)
      values (eu, s.marca, 'story', 'Resposta a um story',
              (select nullif(c.parceiro, '') from public.clientes c where c.user_id = eu and c.marca = s.marca),
              jsonb_build_object('story', s.id, 'titulo', s.titulo))
      returning id into conversa;
    end if;
    select c.nome into nome from public.clientes c where c.user_id = eu and c.marca = s.marca;
    insert into public.suporte_mensagens (conversa_id, marca, autor, autor_id, autor_nome, texto)
    values (conversa, s.marca, 'cliente', eu, nome,
            'Respondeu ao story "' || coalesce(s.titulo, s.chip, 'sem título') || '": ' || p_valor);
  elsif p_tipo not in ('avancou', 'voltou', 'saiu', 'pulou', 'pausou', 'clique', 'compartilhou') then
    return;
  end if;

  insert into public.stories_eventos (story_id, marca, user_id, tipo, valor) values (p_story, s.marca, eu, p_tipo, left(p_valor, 200));
end $$;
revoke all on function public.teeds_story_evento(uuid, text, text, numeric) from public, anon;
grant execute on function public.teeds_story_evento(uuid, text, text, numeric) to authenticated;

/* ------------------------------------------- 3. quantas pessoas viram (equipe) */

-- clientes que viram, sem admins, no escopo do parceiro de quem pergunta; null para quem não é da equipe
create or replace function public.teeds_story_pessoas(p_story uuid, p_marca text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare esc text;
begin
  if not public.teeds_sou_equipe_da(p_marca) then return null; end if;
  esc := public.teeds_stories_escopo(p_marca);
  return (select count(*) from public.stories_vistas v
            join public.clientes c on c.user_id = v.user_id and c.marca = p_marca
           where v.story_id = p_story
             and v.user_id not in (select a.user_id from public.administradores a)
             and (esc is null or coalesce(nullif(c.parceiro, ''), 'direto') = esc));
end $$;
revoke all on function public.teeds_story_pessoas(uuid, text) from public, anon;
grant execute on function public.teeds_story_pessoas(uuid, text) to authenticated;

create or replace function public.teeds_stories_do_cliente(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  with meus as (
    select s.*, v.user_id is not null as visto, v.reacao as minha_reacao, v.voto as meu_voto, v.curtiu_em is not null as curti
      from public.stories s
      left join public.stories_vistas v on v.story_id = s.id and v.user_id = (select auth.uid())
     where s.marca = p_marca and public.teeds_story_pode_ver(s.id)
  ), equipe as (select public.teeds_sou_equipe_da(p_marca) as e)
  select coalesce(jsonb_agg(x order by x.ordem, x.nome), '[]'::jsonb) from (
    select p.id, p.nome, p.foto_url as foto, p.oficial, p.ordem, p.parceiro,
           jsonb_agg(jsonb_build_object(
             'id', m.id, 'codigo', m.codigo, 'tipo', m.tipo, 'midia', m.midia_url, 'capa', m.capa_url,
             'duracao', m.duracao, 'enquadramento', m.enquadramento, 'chip', m.chip, 'titulo', m.titulo,
             'subtitulo', m.subtitulo, 'quando', m.inicia_em, 'destaque', m.destaque,
             'compartilhar', m.compartilhar, 'responder', m.responder, 'visto', m.visto, 'reacao', m.minha_reacao,
             'curti', m.curti,
             'botao', case when m.botao_tipo is null then null else jsonb_build_object('tipo', m.botao_tipo, 'texto', m.botao_texto, 'destino', m.botao_destino) end,
             'publico', case when (select e from equipe) then m.publico end,
             'pessoas', case when (select e from equipe) then public.teeds_story_pessoas(m.id, p_marca) end,
             'camadas', m.camadas,
             'meu_voto', m.meu_voto,
             -- a contagem da enquete só para quem já votou (ou a equipe), como no Instagram
             'votos', case when m.meu_voto is not null or (select e from equipe) then public.teeds_story_votos(m.id) end
           ) order by m.inicia_em) as itens
      from meus m join public.stories_perfis p on p.id = m.perfil_id
     group by p.id
  ) x;
$$;

/* ------------------------------------------------------------ 2. o painel */

create or replace function public.teeds_story_metricas(p_story uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s public.stories%rowtype;
  esc text;
  dur integer;
  r jsonb;
begin
  select * into s from public.stories where id = p_story;
  if s.id is null or not public.teeds_sou_equipe_da(s.marca) then raise exception 'Só a equipe'; end if;
  esc := public.teeds_stories_escopo(s.marca);
  dur := greatest(1, ceil(s.duracao)::integer);

  with cli as (
    select c.user_id, c.nome, c.email, c.foto_url, coalesce(nullif(c.parceiro, ''), 'direto') as parceiro,
           public.teeds_subplano_id(c.user_id, s.marca) as subplano
      from public.clientes c
     where c.marca = s.marca and c.user_id not in (select a.user_id from public.administradores a)
       and (esc is null or coalesce(nullif(c.parceiro, ''), 'direto') = esc)
  ), vis as (
    select v.*, cli.nome, cli.email, cli.foto_url, cli.parceiro, cli.subplano from public.stories_vistas v join cli on cli.user_id = v.user_id where v.story_id = p_story
  ), ev as (
    select e.* from public.stories_eventos e join cli on cli.user_id = e.user_id where e.story_id = p_story
  )
  select jsonb_build_object(
    'vistas', (select count(*) from ev where tipo = 'visto'),
    'pessoas', (select count(*) from vis),
    'completos', (select count(*) from vis where completo),
    'curtidas', (select count(*) from vis where curtiu_em is not null),
    'publico', public.teeds_stories_alcance(s.marca, s.publico),
    'cliques', (select count(*) from ev where tipo = 'clique'),
    'pessoas_clique', (select count(distinct user_id) from ev where tipo = 'clique'),
    'compartilhamentos', (select count(*) from ev where tipo = 'compartilhou'),
    'visitas_link', (select count(*) from public.stories_eventos e where e.story_id = p_story and e.tipo = 'visita_link'),
    'cadastros_link', (select count(*) from public.leads_capturados l where l.marca = s.marca and l.origem = 'story' and l.conteudo = s.codigo),
    'respostas', (select count(*) from ev where tipo = 'resposta'),
    'reacoes', coalesce((select jsonb_object_agg(reacao, n) from (select reacao, count(*) n from vis where reacao is not null group by reacao) x), '{}'::jsonb),
    'navegacao', jsonb_build_object(
      'avancou', (select count(*) from ev where tipo = 'avancou'),
      'voltou', (select count(*) from ev where tipo = 'voltou'),
      'saiu', (select count(*) from ev where tipo = 'saiu'),
      'pulou', (select count(*) from ev where tipo = 'pulou'),
      'pausou', (select count(*) from ev where tipo = 'pausou')),
    -- quantos ainda assistiam em cada segundo (0..duração)
    'retencao', (select jsonb_agg((select count(*) from vis where vis.segundos >= g or vis.completo) order by g) from generate_series(0, dur) g),
    'por_subplano', coalesce((select jsonb_object_agg(subplano, n) from (select subplano, count(*) n from vis group by subplano) x), '{}'::jsonb),
    'por_parceiro', coalesce((select jsonb_object_agg(parceiro, n) from (select parceiro, count(*) n from vis group by parceiro) x), '{}'::jsonb),
    'por_hora', coalesce((select jsonb_agg(jsonb_build_object('hora', h, 'n', n) order by h) from (
        select date_trunc('hour', primeira_em) h, count(*) n from vis group by 1) x), '[]'::jsonb),
    'quem', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'nome', nome, 'email', email, 'foto', foto_url, 'parceiro', parceiro,
                     'subplano', subplano, 'segundos', segundos, 'completo', completo, 'vezes', vezes, 'reacao', reacao,
                     'curtiu', curtiu_em is not null, 'curtiu_em', curtiu_em,
                     'primeira', primeira_em, 'quando', ultima_em,
                     'clicou', exists (select 1 from ev where ev.user_id = vis.user_id and ev.tipo = 'clique'),
                     'respondeu', exists (select 1 from ev where ev.user_id = vis.user_id and ev.tipo = 'resposta'),
                     'compartilhou', exists (select 1 from ev where ev.user_id = vis.user_id and ev.tipo = 'compartilhou'))
                     order by ultima_em desc) from (select * from vis order by ultima_em desc limit 1000) vis), '[]'::jsonb),
    'ultimas_respostas', coalesce((select jsonb_agg(jsonb_build_object('nome', c.nome, 'texto', e.valor, 'quando', e.criado_em) order by e.criado_em desc)
                     from (select * from ev where tipo = 'resposta' order by criado_em desc limit 20) e join cli c on c.user_id = e.user_id), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.teeds_story_metricas(uuid) from public, anon;
grant execute on function public.teeds_story_metricas(uuid) to authenticated;

/* -------------------------------------------------- 4. story novo na hora */

-- uma linha por marca, tocada a cada mudança nos stories; a fileira ouve pelo Realtime e pergunta de novo
-- a teeds_stories_do_cliente (que é quem decide o que cada um vê). Aqui só há a marca e a hora.
create table if not exists public.stories_sinal (
  marca text primary key,
  mudou_em timestamptz not null default now()
);
alter table public.stories_sinal enable row level security;
drop policy if exists "logado ve o sinal dos stories" on public.stories_sinal;
create policy "logado ve o sinal dos stories" on public.stories_sinal for select to authenticated using (true);
grant select on public.stories_sinal to authenticated;

create or replace function public.teeds_stories_sinalizar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.stories_sinal (marca, mudou_em) values (coalesce(new.marca, old.marca), now())
    on conflict (marca) do update set mudou_em = now();
  return null;
end $$;
revoke all on function public.teeds_stories_sinalizar() from public, anon, authenticated;

drop trigger if exists stories_sinalizar on public.stories;
create trigger stories_sinalizar after insert or update or delete on public.stories
  for each row execute function public.teeds_stories_sinalizar();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'stories_sinal') then
    alter publication supabase_realtime add table public.stories_sinal;
  end if;
end $$;
