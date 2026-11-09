-- 08/11/2026 (Tiago): "sabe quando abrimos o insta, e tem as bolinhas la em cima de stories?
-- nesse mesmo estilo... admin pode postar, ver qtos views, compartilhamentos, metricas etc".
-- Maquete aprovada no mesmo dia ("SIGA"), com as sugestões: bolinhas GlobalFly, Victor e Naor
-- (mais as que o admin criar), 24 h ou destaque fixo, resposta cai no Suporte, compartilhar
-- para fora com link de cadastro, até 60 s por story.
--
-- O cliente nunca lê as tabelas direto: tudo passa pelas funções abaixo (security definer),
-- que decidem quem vê cada story (plano, parceiro, só admins) e gravam o que a pessoa fez.
-- Admins não entram nas métricas: o número é só de cliente.

create table if not exists public.stories_perfis (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  nome text not null check (char_length(nome) between 1 and 30),
  foto_url text,
  -- perfil de um parceiro (n, v): só o admin dele e o geral publicam nele
  parceiro text,
  oficial boolean not null default false,
  ordem integer not null default 100,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid
);
create index if not exists stories_perfis_marca on public.stories_perfis (marca, ordem);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  perfil_id uuid not null references public.stories_perfis(id) on delete cascade,
  -- o código curto do link de compartilhar (globalflytrade.com/n/s/<codigo>)
  codigo text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  tipo text not null check (tipo in ('video', 'imagem')),
  midia_url text not null,
  midia_caminho text,
  capa_url text,
  duracao numeric not null default 6 check (duracao > 0 and duracao <= 61),
  -- o enquadramento escolhido no painel: {zoom: 1..1.6, x: 0..100, y: 0..100}
  enquadramento jsonb not null default '{}'::jsonb,
  chip text check (chip is null or char_length(chip) <= 30),
  titulo text check (titulo is null or char_length(titulo) <= 70),
  subtitulo text check (subtitulo is null or char_length(subtitulo) <= 120),
  botao_tipo text check (botao_tipo is null or botao_tipo in ('aula', 'ia', 'deposito', 'aovivo', 'gerenciamento', 'marketplace', 'link')),
  botao_texto text check (botao_texto is null or char_length(botao_texto) <= 30),
  botao_destino text,
  -- {"todos": true} | {"subplanos": ["gold","black","prestige"], "parceiros": ["n","v","direto"]} | {"so_admins": true}
  publico jsonb not null default '{"todos": true}'::jsonb,
  inicia_em timestamptz not null default now(),
  -- null = destaque fixo (não sai sozinho)
  expira_em timestamptz,
  destaque boolean not null default false,
  compartilhar boolean not null default true,
  responder boolean not null default true,
  status text not null default 'publicado' check (status in ('publicado', 'arquivado')),
  avisado_em timestamptz,
  criado_por uuid,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists stories_no_ar on public.stories (marca, status, inicia_em desc);

-- uma linha por pessoa e story: o que a bolinha precisa (visto) e a retenção (segundos)
create table if not exists public.stories_vistas (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null,
  marca text not null,
  primeira_em timestamptz not null default now(),
  ultima_em timestamptz not null default now(),
  vezes integer not null default 1,
  segundos numeric not null default 0,
  completo boolean not null default false,
  reacao text,
  primary key (story_id, user_id)
);

-- cada toque: avançou, voltou, saiu, pulou o perfil, clicou no botão, compartilhou, reagiu, respondeu
create table if not exists public.stories_eventos (
  id bigint generated always as identity primary key,
  story_id uuid not null references public.stories(id) on delete cascade,
  marca text not null,
  user_id uuid,
  tipo text not null check (tipo in ('visto', 'avancou', 'voltou', 'saiu', 'pulou', 'pausou', 'clique', 'reacao', 'resposta', 'compartilhou', 'visita_link')),
  valor text,
  criado_em timestamptz not null default now()
);
create index if not exists stories_eventos_story on public.stories_eventos (story_id, tipo);

alter table public.stories_perfis enable row level security;
alter table public.stories enable row level security;
alter table public.stories_vistas enable row level security;
alter table public.stories_eventos enable row level security;

-- leitura direta só para a equipe da marca (o painel); escrita só pelas funções
drop policy if exists "equipe ve os perfis" on public.stories_perfis;
create policy "equipe ve os perfis" on public.stories_perfis for select to authenticated using (public.teeds_sou_equipe_da(marca));
drop policy if exists "equipe ve os stories" on public.stories;
create policy "equipe ve os stories" on public.stories for select to authenticated using (public.teeds_sou_equipe_da(marca));

/* ------------------------------------------------------------------ quem vê */

-- O parceiro em que o painel está olhando: o admin do parceiro fica preso ao dele;
-- o geral escolhe pelo filtro do topo (x-teeds-vitrine) ou vê todos (null).
create or replace function public.teeds_stories_escopo(p_marca text)
returns text language sql stable security definer set search_path = public as $$
  select case when public.teeds_admin_geral_da(p_marca) then public.teeds_vitrine_pedida()
              else public.teeds_parceiro_forcado(p_marca) end;
$$;

-- O cliente cabe no público do story?
create or replace function public.teeds_story_no_publico(p_publico jsonb, p_marca text, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clientes c
     where c.user_id = p_user and c.marca = p_marca
       and not coalesce((p_publico->>'so_admins')::boolean, false)
       and (coalesce((p_publico->>'todos')::boolean, false) or (
         (jsonb_array_length(coalesce(p_publico->'subplanos', '[]'::jsonb)) = 0
           or (p_publico->'subplanos') ? public.teeds_subplano_id(p_user, p_marca))
         and (jsonb_array_length(coalesce(p_publico->'parceiros', '[]'::jsonb)) = 0
           or (p_publico->'parceiros') ? coalesce(nullif(c.parceiro, ''), 'direto'))
       ))
  );
$$;

-- No ar e para esta pessoa? A equipe vê todos os que estão no ar (para conferir).
create or replace function public.teeds_story_pode_ver(p_story uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.stories s join public.stories_perfis p on p.id = s.perfil_id
     where s.id = p_story and p.ativo and s.status = 'publicado'
       and s.inicia_em <= now() and (s.expira_em is null or s.expira_em > now())
       and (public.teeds_sou_equipe_da(s.marca) or public.teeds_story_no_publico(s.publico, s.marca, (select auth.uid())))
  );
$$;

/* ----------------------------------------------------------- tela do cliente */

create or replace function public.teeds_stories_do_cliente(p_marca text)
returns jsonb language sql stable security definer set search_path = public as $$
  with meus as (
    select s.*, v.user_id is not null as visto, v.reacao as minha_reacao
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
             'publico', case when (select e from equipe) then m.publico end
           ) order by m.inicia_em) as itens
      from meus m join public.stories_perfis p on p.id = m.perfil_id
     group by p.id
  ) x;
$$;
revoke all on function public.teeds_stories_do_cliente(text) from public, anon;
grant execute on function public.teeds_stories_do_cliente(text) to authenticated;

-- O que a pessoa fez no story. p_segundos: até onde assistiu (a retenção).
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
  elsif p_tipo = 'reacao' then
    if p_valor is null or char_length(p_valor) > 8 then return; end if;
    update public.stories_vistas set reacao = p_valor where story_id = p_story and user_id = eu;
  elsif p_tipo = 'resposta' then
    if not s.responder or p_valor is null or char_length(trim(p_valor)) = 0 then return; end if;
    p_valor := left(trim(p_valor), 500);
    -- a resposta cai no Suporte, numa conversa aberta da pessoa (ou numa nova)
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

  insert into public.stories_eventos (story_id, marca, user_id, tipo, valor) values (p_story, s.marca, eu, p_tipo, p_valor);
end $$;
revoke all on function public.teeds_story_evento(uuid, text, text, numeric) from public, anon;
grant execute on function public.teeds_story_evento(uuid, text, text, numeric) to authenticated;

-- O link de compartilhar: abre sem login (só stories com compartilhar ligado e no ar).
create or replace function public.teeds_story_publico(p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; sid uuid; m text;
begin
  select s.id, s.marca, jsonb_build_object(
           'id', s.id, 'codigo', s.codigo, 'marca', s.marca, 'tipo', s.tipo, 'midia', s.midia_url, 'capa', s.capa_url,
           'duracao', s.duracao, 'enquadramento', s.enquadramento, 'chip', s.chip, 'titulo', s.titulo,
           'subtitulo', s.subtitulo, 'quando', s.inicia_em,
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
revoke all on function public.teeds_story_publico(text) from public;
grant execute on function public.teeds_story_publico(text) to anon, authenticated;

/* ------------------------------------------------------------------ painel */

-- Quantas pessoas um público alcança (para o formulário), no escopo de quem pergunta.
create or replace function public.teeds_stories_alcance(p_marca text, p_publico jsonb)
returns integer language plpgsql stable security definer set search_path = public as $$
declare esc text := public.teeds_stories_escopo(p_marca); n integer;
begin
  if not public.teeds_sou_equipe_da(p_marca) then raise exception 'Só a equipe'; end if;
  if coalesce((p_publico->>'so_admins')::boolean, false) then
    select count(*) into n from public.administradores a where a.marca in (p_marca, 'teeds'); return n;
  end if;
  select count(*) into n from public.clientes c
   where c.marca = p_marca and c.status_acesso = 'ativo'
     and c.user_id not in (select a.user_id from public.administradores a)
     and (esc is null or coalesce(nullif(c.parceiro, ''), 'direto') = esc)
     and public.teeds_story_no_publico(p_publico, p_marca, c.user_id);
  return n;
end $$;
revoke all on function public.teeds_stories_alcance(text, jsonb) from public, anon;
grant execute on function public.teeds_stories_alcance(text, jsonb) to authenticated;

-- Cria ou edita um story. O admin do parceiro publica só para os clientes dele.
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
  r public.stories%rowtype;
begin
  if not public.teeds_sou_equipe_da(v_marca) then raise exception 'Só a equipe da plataforma publica stories'; end if;
  select * into v_perfil from public.stories_perfis where id = (p->>'perfil_id')::uuid and marca = v_marca and ativo;
  if v_perfil.id is null then raise exception 'Escolha a bolinha do story'; end if;
  v_forcado := case when v_geral then null else public.teeds_parceiro_forcado(v_marca) end;
  if v_forcado is not null then
    if v_perfil.parceiro is not null and v_perfil.parceiro <> v_forcado then raise exception 'Esta bolinha é de outro parceiro'; end if;
    -- o público fica preso aos clientes dele (o plano ele pode escolher)
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
                                criado_por, criado_por_nome)
    values (v_marca, v_perfil.id, p->>'tipo', p->>'midia_url', p->>'midia_caminho', nullif(p->>'capa_url', ''),
            least(greatest(coalesce((p->>'duracao')::numeric, 6), 1), 60), coalesce(p->'enquadramento', '{}'::jsonb),
            nullif(trim(p->>'chip'), ''), nullif(trim(p->>'titulo'), ''), nullif(trim(p->>'subtitulo'), ''),
            nullif(p->>'botao_tipo', ''), nullif(trim(p->>'botao_texto'), ''), nullif(trim(p->>'botao_destino'), ''),
            v_publico, v_inicio, v_expira, v_destaque, coalesce((p->>'compartilhar')::boolean, true), coalesce((p->>'responder')::boolean, true),
            (select auth.uid()), v_nome)
    returning * into r;
  else
    update public.stories set perfil_id = v_perfil.id, chip = nullif(trim(p->>'chip'), ''), titulo = nullif(trim(p->>'titulo'), ''),
           subtitulo = nullif(trim(p->>'subtitulo'), ''), enquadramento = coalesce(p->'enquadramento', enquadramento),
           botao_tipo = nullif(p->>'botao_tipo', ''), botao_texto = nullif(trim(p->>'botao_texto'), ''), botao_destino = nullif(trim(p->>'botao_destino'), ''),
           publico = v_publico, inicia_em = v_inicio, expira_em = v_expira, destaque = v_destaque,
           compartilhar = coalesce((p->>'compartilhar')::boolean, compartilhar), responder = coalesce((p->>'responder')::boolean, responder),
           status = 'publicado', atualizado_em = now()
     where id = v_id returning * into r;
  end if;
  return to_jsonb(r);
end $$;
revoke all on function public.teeds_story_salvar(jsonb) from public, anon;
grant execute on function public.teeds_story_salvar(jsonb) to authenticated;

-- Tira do ar (arquivar) ou apaga de vez. Devolve o caminho do arquivo para o painel apagar.
create or replace function public.teeds_story_remover(p_id uuid, p_apagar boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare v public.stories%rowtype;
begin
  select * into v from public.stories where id = p_id;
  if v.id is null then return null; end if;
  if not (public.teeds_admin_pleno_da(v.marca) or (public.teeds_sou_equipe_da(v.marca) and v.criado_por = (select auth.uid()))) then
    raise exception 'Você não pode mexer neste story';
  end if;
  if p_apagar then delete from public.stories where id = p_id; return v.midia_caminho; end if;
  update public.stories set status = 'arquivado', atualizado_em = now() where id = p_id;
  return null;
end $$;
revoke all on function public.teeds_story_remover(uuid, boolean) from public, anon;
grant execute on function public.teeds_story_remover(uuid, boolean) to authenticated;

-- Marca o aviso no celular como enviado (o envio é da função notificacoes).
create or replace function public.teeds_story_avisado(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.stories set avisado_em = now()
   where id = p_id and public.teeds_sou_equipe_da(marca);
$$;
revoke all on function public.teeds_story_avisado(uuid) from public, anon;
grant execute on function public.teeds_story_avisado(uuid) to authenticated;

-- As bolinhas: só quem tem acesso pleno cria e edita.
create or replace function public.teeds_story_perfil_salvar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_marca text := p->>'marca'; r public.stories_perfis%rowtype;
begin
  if not public.teeds_admin_pleno_da(v_marca) then raise exception 'Só o administrador geral cria bolinhas'; end if;
  if nullif(p->>'id', '') is null then
    insert into public.stories_perfis (marca, nome, foto_url, parceiro, oficial, ordem, criado_por)
    values (v_marca, trim(p->>'nome'), nullif(p->>'foto_url', ''), nullif(p->>'parceiro', ''), coalesce((p->>'oficial')::boolean, false),
            coalesce((p->>'ordem')::integer, 100), (select auth.uid()))
    returning * into r;
  else
    update public.stories_perfis set nome = trim(p->>'nome'), foto_url = nullif(p->>'foto_url', ''), parceiro = nullif(p->>'parceiro', ''),
           oficial = coalesce((p->>'oficial')::boolean, oficial), ordem = coalesce((p->>'ordem')::integer, ordem),
           ativo = coalesce((p->>'ativo')::boolean, ativo)
     where id = (p->>'id')::uuid and marca = v_marca returning * into r;
  end if;
  return to_jsonb(r);
end $$;
revoke all on function public.teeds_story_perfil_salvar(jsonb) from public, anon;
grant execute on function public.teeds_story_perfil_salvar(jsonb) to authenticated;

-- A lista do painel, com o resumo de cada story (no escopo do parceiro).
create or replace function public.teeds_stories_painel(p_marca text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare esc text := public.teeds_stories_escopo(p_marca);
begin
  if not public.teeds_sou_equipe_da(p_marca) then raise exception 'Só a equipe'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'story', to_jsonb(s),
      'perfil', jsonb_build_object('id', p.id, 'nome', p.nome, 'foto', p.foto_url, 'oficial', p.oficial, 'parceiro', p.parceiro),
      'vistas', (select count(*) from public.stories_eventos e join public.clientes c on c.user_id = e.user_id and c.marca = p_marca
                  where e.story_id = s.id and e.tipo = 'visto' and e.user_id not in (select a.user_id from public.administradores a)
                    and (esc is null or coalesce(nullif(c.parceiro, ''), 'direto') = esc)),
      'pessoas', (select count(*) from public.stories_vistas v join public.clientes c on c.user_id = v.user_id and c.marca = p_marca
                   where v.story_id = s.id and v.user_id not in (select a.user_id from public.administradores a)
                     and (esc is null or coalesce(nullif(c.parceiro, ''), 'direto') = esc)),
      'completos', (select count(*) from public.stories_vistas v join public.clientes c on c.user_id = v.user_id and c.marca = p_marca
                   where v.story_id = s.id and v.completo and v.user_id not in (select a.user_id from public.administradores a)
                     and (esc is null or coalesce(nullif(c.parceiro, ''), 'direto') = esc))
    ) order by s.criado_em desc)
      from public.stories s join public.stories_perfis p on p.id = s.perfil_id
     where s.marca = p_marca
       and (esc is null or p.parceiro is null or p.parceiro = esc)
  ), '[]'::jsonb);
end $$;
revoke all on function public.teeds_stories_painel(text) from public, anon;
grant execute on function public.teeds_stories_painel(text) to authenticated;

-- As métricas de um story: totais, retenção por segundo, navegação, plano, parceiro e quem viu.
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
    select c.user_id, c.nome, c.email, coalesce(nullif(c.parceiro, ''), 'direto') as parceiro,
           public.teeds_subplano_id(c.user_id, s.marca) as subplano
      from public.clientes c
     where c.marca = s.marca and c.user_id not in (select a.user_id from public.administradores a)
       and (esc is null or coalesce(nullif(c.parceiro, ''), 'direto') = esc)
  ), vis as (
    select v.*, cli.nome, cli.email, cli.parceiro, cli.subplano from public.stories_vistas v join cli on cli.user_id = v.user_id where v.story_id = p_story
  ), ev as (
    select e.* from public.stories_eventos e join cli on cli.user_id = e.user_id where e.story_id = p_story
  )
  select jsonb_build_object(
    'vistas', (select count(*) from ev where tipo = 'visto'),
    'pessoas', (select count(*) from vis),
    'completos', (select count(*) from vis where completo),
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
    'quem', coalesce((select jsonb_agg(jsonb_build_object('user_id', user_id, 'nome', nome, 'email', email, 'parceiro', parceiro,
                     'subplano', subplano, 'segundos', segundos, 'completo', completo, 'vezes', vezes, 'reacao', reacao,
                     'quando', ultima_em, 'clicou', exists (select 1 from ev where ev.user_id = vis.user_id and ev.tipo = 'clique'),
                     'compartilhou', exists (select 1 from ev where ev.user_id = vis.user_id and ev.tipo = 'compartilhou'))
                     order by ultima_em desc) from (select * from vis order by ultima_em desc limit 300) vis), '[]'::jsonb),
    'ultimas_respostas', coalesce((select jsonb_agg(jsonb_build_object('nome', c.nome, 'texto', e.valor, 'quando', e.criado_em) order by e.criado_em desc)
                     from (select * from ev where tipo = 'resposta' order by criado_em desc limit 20) e join cli c on c.user_id = e.user_id), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke all on function public.teeds_story_metricas(uuid) from public, anon;
grant execute on function public.teeds_story_metricas(uuid) to authenticated;

/* ------------------------------------------------------------- os arquivos */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stories', 'stories', true, 104857600,
        array['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "stories: equipe envia" on storage.objects;
create policy "stories: equipe envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'stories' and public.teeds_sou_equipe_da((storage.foldername(name))[1]));
drop policy if exists "stories: equipe substitui" on storage.objects;
create policy "stories: equipe substitui" on storage.objects for update to authenticated
  using (bucket_id = 'stories' and public.teeds_sou_equipe_da((storage.foldername(name))[1]))
  with check (bucket_id = 'stories' and public.teeds_sou_equipe_da((storage.foldername(name))[1]));
drop policy if exists "stories: equipe apaga" on storage.objects;
create policy "stories: equipe apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'stories' and public.teeds_sou_equipe_da((storage.foldername(name))[1]));

/* ---------------------------------------------------- as bolinhas iniciais */

insert into public.stories_perfis (marca, nome, foto_url, parceiro, oficial, ordem)
select 'globalfly', x.nome, x.foto, x.parceiro, x.oficial, x.ordem
  from (values ('GlobalFly', '/globalfly-monograma-claro.png', null, true, 0),
               ('Victor', '/parceiros/v.webp', 'v', true, 10),
               ('Naor', '/parceiros/n.webp', 'n', true, 20)) as x(nome, foto, parceiro, oficial, ordem)
 where not exists (select 1 from public.stories_perfis p where p.marca = 'globalfly' and p.nome = x.nome);
