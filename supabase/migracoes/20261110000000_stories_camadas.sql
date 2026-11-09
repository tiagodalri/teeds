-- 09/11/2026 (Tiago): "tem como melhorar a experiencia pra gente que sobe os stories?... abrir a camera
-- pra gravar na hora igual o insta... ferramentas de edicao igual o insta, com localizacao, emojis,
-- texto, figurinha... adicionar link tambem, mesmo formato do insta".
--
-- O que o estúdio desenha por cima do vídeo (texto, emoji, figurinhas, desenho, link, enquete,
-- contagem) vai em `camadas`, em coordenadas da tela 9:16 (0–100). A tela cheia desenha as camadas
-- por cima da mídia: ficam nítidas em qualquer tela e as figurinhas respondem ao toque.
-- A enquete grava um voto por pessoa (stories_vistas.voto) e a contagem volta para quem já votou.

alter table public.stories add column if not exists camadas jsonb not null default '[]'::jsonb;
alter table public.stories_vistas add column if not exists voto smallint;

alter table public.stories_eventos drop constraint if exists stories_eventos_tipo_check;
alter table public.stories_eventos add constraint stories_eventos_tipo_check check (tipo in (
  'visto', 'avancou', 'voltou', 'saiu', 'pulou', 'pausou', 'clique', 'reacao', 'resposta', 'compartilhou', 'visita_link', 'voto'));

-- os votos da enquete de um story: {"0": n, "1": n}
create or replace function public.teeds_story_votos(p_story uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(voto::text, n), '{}'::jsonb)
    from (select voto, count(*) n from public.stories_vistas where story_id = p_story and voto is not null group by voto) x;
$$;
revoke all on function public.teeds_story_votos(uuid) from public, anon, authenticated;

create or replace function public.teeds_stories_do_cliente(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  with meus as (
    select s.*, v.user_id is not null as visto, v.reacao as minha_reacao, v.voto as meu_voto
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
             'botao', case when m.botao_tipo is null then null else jsonb_build_object('tipo', m.botao_tipo, 'texto', m.botao_texto, 'destino', m.botao_destino) end,
             'publico', case when (select e from equipe) then m.publico end,
             'camadas', m.camadas,
             'meu_voto', m.meu_voto,
             -- a contagem da enquete só para quem já votou (ou a equipe), como no Instagram
             'votos', case when m.meu_voto is not null or (select e from equipe) then public.teeds_story_votos(m.id) end
           ) order by m.inicia_em) as itens
      from meus m join public.stories_perfis p on p.id = m.perfil_id
     group by p.id
  ) x;
$$;

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
  elsif p_tipo = 'voto' then
    -- um voto por pessoa, sem trocar depois (como no Instagram)
    if p_valor is null or p_valor !~ '^[0-3]$' then return; end if;
    insert into public.stories_vistas (story_id, user_id, marca, voto) values (p_story, eu, s.marca, p_valor::smallint)
      on conflict (story_id, user_id) do update set voto = coalesce(stories_vistas.voto, excluded.voto);
  elsif p_tipo = 'reacao' then
    if p_valor is null or char_length(p_valor) > 8 then return; end if;
    update public.stories_vistas set reacao = p_valor where story_id = p_story and user_id = eu;
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

create or replace function public.teeds_story_publico(p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; sid uuid; m text;
begin
  select s.id, s.marca, jsonb_build_object(
           'id', s.id, 'codigo', s.codigo, 'marca', s.marca, 'tipo', s.tipo, 'midia', s.midia_url, 'capa', s.capa_url,
           'duracao', s.duracao, 'enquadramento', s.enquadramento, 'chip', s.chip, 'titulo', s.titulo,
           'subtitulo', s.subtitulo, 'quando', s.inicia_em, 'camadas', s.camadas,
           'perfil', jsonb_build_object('nome', p.nome, 'foto', p.foto_url, 'oficial', p.oficial, 'parceiro', p.parceiro))
    into sid, m, r
    from public.stories s join public.stories_perfis p on p.id = s.perfil_id
   where s.codigo = lower(p_codigo) and s.compartilhar and s.status = 'publicado' and p.ativo
     and s.inicia_em <= now() and (s.expira_em is null or s.expira_em > now())
     and not coalesce((s.publico->>'so_admins')::boolean, false);
  if sid is null then return null; end if;
  insert into public.stories_eventos (story_id, marca, user_id, tipo) values (sid, m, (select auth.uid()), 'visita_link');
  return r;
end $$;

-- salvar: as camadas entram junto (o resto igual à versão de 08/11)
create or replace function public.teeds_story_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_marca text := p->>'marca';
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_perfil public.stories_perfis%rowtype;
  v_forcado text;
  v_publico jsonb := coalesce(p->'publico', '{"todos": true}'::jsonb);
  v_geral boolean := public.teeds_admin_geral_da(v_marca);
  v_nome text;
  v_destaque boolean := coalesce((p->>'destaque')::boolean, false);
  v_inicio timestamptz := coalesce(nullif(p->>'inicia_em', '')::timestamptz, now());
  v_expira timestamptz;
  v_camadas jsonb := case when jsonb_typeof(p->'camadas') = 'array' then p->'camadas' else null end;
  r public.stories%rowtype;
begin
  if not public.teeds_sou_equipe_da(v_marca) then raise exception 'Só a equipe da plataforma publica stories'; end if;
  if v_camadas is not null and (jsonb_array_length(v_camadas) > 60 or length(v_camadas::text) > 200000) then raise exception 'Camadas demais neste story'; end if;
  select * into v_perfil from public.stories_perfis where id = (p->>'perfil_id')::uuid and marca = v_marca and ativo;
  if v_perfil.id is null then raise exception 'Escolha a bolinha do story'; end if;
  v_forcado := case when v_geral then null else public.teeds_parceiro_forcado(v_marca) end;
  if v_forcado is not null then
    if v_perfil.parceiro is not null and v_perfil.parceiro <> v_forcado then raise exception 'Esta bolinha é de outro parceiro'; end if;
    v_publico := jsonb_build_object('parceiros', jsonb_build_array(v_forcado), 'subplanos', coalesce(v_publico->'subplanos', '[]'::jsonb))
                 || case when coalesce((v_publico->>'so_admins')::boolean, false) then '{"so_admins": true}'::jsonb else '{}'::jsonb end;
  end if;
  if v_id is not null and not exists (select 1 from public.stories where id = v_id and marca = v_marca
       and (v_geral or public.teeds_admin_pleno_da(v_marca) or criado_por = (select auth.uid()))) then
    raise exception 'Você não pode editar este story';
  end if;
  v_expira := case when v_destaque then null
                   when nullif(p->>'expira_em', '') is not null then (p->>'expira_em')::timestamptz
                   else v_inicio + interval '24 hours' end;
  select coalesce(nullif(c.nome, ''), split_part(u.email, '@', 1)) into v_nome
    from auth.users u left join public.clientes c on c.user_id = u.id and c.marca = v_marca where u.id = (select auth.uid());

  if v_id is null then
    insert into public.stories (marca, perfil_id, tipo, midia_url, midia_caminho, capa_url, duracao, enquadramento, chip, titulo, subtitulo,
                                botao_tipo, botao_texto, botao_destino, publico, inicia_em, expira_em, destaque, compartilhar, responder,
                                criado_por, criado_por_nome, camadas)
    values (v_marca, v_perfil.id, p->>'tipo', p->>'midia_url', p->>'midia_caminho', nullif(p->>'capa_url', ''),
            least(greatest(coalesce((p->>'duracao')::numeric, 6), 1), 60), coalesce(p->'enquadramento', '{}'::jsonb),
            nullif(trim(p->>'chip'), ''), nullif(trim(p->>'titulo'), ''), nullif(trim(p->>'subtitulo'), ''),
            nullif(p->>'botao_tipo', ''), nullif(trim(p->>'botao_texto'), ''), nullif(trim(p->>'botao_destino'), ''),
            v_publico, v_inicio, v_expira, v_destaque, coalesce((p->>'compartilhar')::boolean, true), coalesce((p->>'responder')::boolean, true),
            (select auth.uid()), v_nome, coalesce(v_camadas, '[]'::jsonb))
    returning * into r;
  else
    update public.stories set perfil_id = v_perfil.id, chip = nullif(trim(p->>'chip'), ''), titulo = nullif(trim(p->>'titulo'), ''),
           subtitulo = nullif(trim(p->>'subtitulo'), ''), enquadramento = coalesce(p->'enquadramento', enquadramento),
           botao_tipo = nullif(p->>'botao_tipo', ''), botao_texto = nullif(trim(p->>'botao_texto'), ''), botao_destino = nullif(trim(p->>'botao_destino'), ''),
           publico = v_publico, inicia_em = v_inicio, expira_em = v_expira, destaque = v_destaque,
           compartilhar = coalesce((p->>'compartilhar')::boolean, compartilhar), responder = coalesce((p->>'responder')::boolean, responder),
           camadas = coalesce(v_camadas, camadas), status = 'publicado', atualizado_em = now()
     where id = v_id returning * into r;
  end if;
  return to_jsonb(r);
end $$;

-- métricas: o resultado da enquete e os cliques por figurinha de link entram no JSON
create or replace function public.teeds_story_metricas_extra(p_story uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.stories%rowtype; esc text;
begin
  select * into s from public.stories where id = p_story;
  if s.id is null or not public.teeds_sou_equipe_da(s.marca) then raise exception 'Só a equipe'; end if;
  esc := public.teeds_stories_escopo(s.marca);
  return jsonb_build_object(
    'votos', coalesce((select jsonb_object_agg(voto::text, n) from (
        select v.voto, count(*) n from public.stories_vistas v join public.clientes c on c.user_id = v.user_id and c.marca = s.marca
         where v.story_id = p_story and v.voto is not null and v.user_id not in (select a.user_id from public.administradores a)
           and (esc is null or coalesce(nullif(c.parceiro, ''), 'direto') = esc)
         group by v.voto) x), '{}'::jsonb),
    'cliques_por', coalesce((select jsonb_object_agg(coalesce(valor, 'botao'), n) from (
        select e.valor, count(*) n from public.stories_eventos e join public.clientes c on c.user_id = e.user_id and c.marca = s.marca
         where e.story_id = p_story and e.tipo = 'clique' and e.user_id not in (select a.user_id from public.administradores a)
           and (esc is null or coalesce(nullif(c.parceiro, ''), 'direto') = esc)
         group by e.valor) x), '{}'::jsonb));
end $$;
revoke all on function public.teeds_story_metricas_extra(uuid) from public, anon;
grant execute on function public.teeds_story_metricas_extra(uuid) to authenticated;
