-- 20/10/2026: suporte dentro da plataforma (chat do cliente + caixa de
-- entrada no painel admin). Grátis: só Supabase (tabelas, RLS, tempo real
-- e storage), sem serviço de terceiros.
--
-- Conversa = um atendimento. Enquanto não for resolvida, é a mesma conversa;
-- resolvida, a próxima mensagem do cliente reabre (se for em até 48 h) ou
-- abre uma nova (a tela decide; o banco aceita as duas).
--
-- O banco faz sozinho, a cada mensagem (gatilho):
--   - etiquetas automáticas pelo texto (depósito, saque, acesso, I.A.…);
--   - prioridade (sobe, nunca desce sozinha): saque/acesso/erro = alta;
--     "não recebi", "sumiu", "golpe"… = urgente; irritação = alta + atenção;
--   - status, contadores de não lidas, última mensagem, quanto tempo esperando;
--   - a 1ª resposta automática para o cliente não ficar no vácuo;
--   - tempo da 1ª resposta (vira o "tempo médio de resposta" do widget).
-- Notas internas (interna = true) só a equipe vê (RLS).

-- ------------------------------------------------------------- tabelas
create table if not exists public.suporte_conversas (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'aberta' check (status in ('aberta', 'respondida', 'resolvida')),
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  etiquetas text[] not null default '{}',
  assunto text,
  responsavel uuid references auth.users(id) on delete set null,
  responsavel_nome text,
  origem text,
  contexto jsonb not null default '{}',
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  ultima_mensagem text,
  ultima_de text,
  ultima_em timestamptz,
  aguardando_desde timestamptz,
  primeira_resposta_em timestamptz,
  resolvida_em timestamptz,
  nao_lidas_cliente int not null default 0,
  nao_lidas_equipe int not null default 0,
  avaliacao smallint check (avaliacao between 1 and 5),
  avaliacao_comentario text
);
create index if not exists suporte_conversas_fila on public.suporte_conversas (marca, status, aguardando_desde);
create index if not exists suporte_conversas_cliente on public.suporte_conversas (user_id, marca, criada_em desc);

create table if not exists public.suporte_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.suporte_conversas(id) on delete cascade,
  marca text not null,
  autor text not null check (autor in ('cliente', 'equipe', 'sistema')),
  autor_id uuid,
  autor_nome text,
  texto text not null default '' check (char_length(texto) <= 4000),
  anexo text,
  interna boolean not null default false,
  criada_em timestamptz not null default now()
);
create index if not exists suporte_mensagens_conversa on public.suporte_mensagens (conversa_id, criada_em);

create table if not exists public.suporte_respostas (
  id uuid primary key default gen_random_uuid(),
  marca text not null,
  titulo text not null,
  texto text not null,
  ordem int not null default 100,
  criada_em timestamptz not null default now()
);

-- a equipe "online": a caixa de entrada aberta bate o ponto a cada minuto
create table if not exists public.suporte_presenca (
  user_id uuid not null references auth.users(id) on delete cascade,
  marca text not null,
  visto_em timestamptz not null default now(),
  primary key (user_id, marca)
);

alter table public.suporte_conversas enable row level security;
alter table public.suporte_mensagens enable row level security;
alter table public.suporte_respostas enable row level security;
alter table public.suporte_presenca enable row level security;

-- ------------------------------------------------------------- quem vê o quê
drop policy if exists "suporte: cliente ou equipe le" on public.suporte_conversas;
create policy "suporte: cliente ou equipe le" on public.suporte_conversas for select to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));
drop policy if exists "suporte: cliente abre na propria marca" on public.suporte_conversas;
create policy "suporte: cliente abre na propria marca" on public.suporte_conversas for insert to authenticated
  with check (user_id = (select auth.uid()) and marca = public.teeds_marca_da_conta((select auth.jwt() ->> 'email')));
drop policy if exists "suporte: cliente ou equipe atualiza" on public.suporte_conversas;
create policy "suporte: cliente ou equipe atualiza" on public.suporte_conversas for update to authenticated
  using (user_id = (select auth.uid()) or public.teeds_sou_admin_da(marca));

drop policy if exists "suporte: mensagens da conversa" on public.suporte_mensagens;
create policy "suporte: mensagens da conversa" on public.suporte_mensagens for select to authenticated
  using (public.teeds_sou_admin_da(marca) or (not interna and exists (
    select 1 from public.suporte_conversas c where c.id = conversa_id and c.user_id = (select auth.uid()))));
drop policy if exists "suporte: cliente escreve na sua, equipe em todas" on public.suporte_mensagens;
create policy "suporte: cliente escreve na sua, equipe em todas" on public.suporte_mensagens for insert to authenticated
  with check (
    (autor = 'cliente' and not interna and autor_id = (select auth.uid()) and exists (
      select 1 from public.suporte_conversas c where c.id = conversa_id and c.user_id = (select auth.uid())))
    or (autor = 'equipe' and autor_id = (select auth.uid()) and public.teeds_sou_admin_da(marca))
  );

drop policy if exists "suporte: equipe cuida das respostas" on public.suporte_respostas;
create policy "suporte: equipe cuida das respostas" on public.suporte_respostas for all to authenticated
  using (public.teeds_sou_admin_da(marca)) with check (public.teeds_sou_admin_da(marca));

drop policy if exists "suporte: equipe marca presenca" on public.suporte_presenca;
create policy "suporte: equipe marca presenca" on public.suporte_presenca for all to authenticated
  using (user_id = (select auth.uid()) and public.teeds_sou_admin_da(marca))
  with check (user_id = (select auth.uid()) and public.teeds_sou_admin_da(marca));

-- ------------------------------------------------------------- o cliente só mexe no que é dele
-- Na conversa, o cliente só pode: zerar as não lidas, avaliar e encerrar.
-- O resto (status da equipe, etiquetas, prioridade, responsável) é da equipe.
create or replace function public.teeds_suporte_proteger_conversa()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  -- o gatilho das mensagens (sistema) atualiza contadores e status: passa direto
  if current_setting('teeds.suporte_sistema', true) = '1' then new.atualizada_em := now(); return new; end if;
  if tg_op = 'INSERT' then
    if not public.teeds_sou_admin_da(new.marca) then
      new.status := 'aberta'; new.prioridade := 'normal'; new.etiquetas := '{}'; new.responsavel := null; new.responsavel_nome := null;
      new.ultima_mensagem := null; new.ultima_de := null; new.ultima_em := null; new.aguardando_desde := null; new.primeira_resposta_em := null;
      new.resolvida_em := null; new.nao_lidas_cliente := 0; new.nao_lidas_equipe := 0; new.avaliacao := null; new.avaliacao_comentario := null;
      new.assunto := left(nullif(btrim(new.assunto), ''), 90);
    end if;
    new.criada_em := now(); new.atualizada_em := now();
    return new;
  end if;
  if auth.role() = 'authenticated' and not public.teeds_sou_admin_da(old.marca) then
    new.marca := old.marca; new.user_id := old.user_id; new.prioridade := old.prioridade; new.etiquetas := old.etiquetas;
    new.responsavel := old.responsavel; new.responsavel_nome := old.responsavel_nome; new.assunto := old.assunto;
    new.criada_em := old.criada_em; new.ultima_mensagem := old.ultima_mensagem; new.ultima_de := old.ultima_de; new.ultima_em := old.ultima_em;
    new.aguardando_desde := old.aguardando_desde; new.primeira_resposta_em := old.primeira_resposta_em; new.nao_lidas_equipe := old.nao_lidas_equipe;
    new.origem := old.origem; new.contexto := old.contexto;
    new.nao_lidas_cliente := least(old.nao_lidas_cliente, greatest(new.nao_lidas_cliente, 0));
    -- encerrar: sim; reabrir mudando o status: não (reabre escrevendo)
    if new.status is distinct from old.status and new.status <> 'resolvida' then new.status := old.status; end if;
    if new.status = 'resolvida' and old.status <> 'resolvida' then new.resolvida_em := now(); new.aguardando_desde := null; else new.resolvida_em := old.resolvida_em; end if;
    -- avaliar só depois de resolvida
    if new.status <> 'resolvida' then new.avaliacao := old.avaliacao; new.avaliacao_comentario := old.avaliacao_comentario; end if;
  else
    if new.status = 'resolvida' and old.status <> 'resolvida' then new.resolvida_em := now(); new.aguardando_desde := null; end if;
    if new.status <> 'resolvida' then new.resolvida_em := null; end if;
  end if;
  new.atualizada_em := now();
  return new;
end $function$;
drop trigger if exists proteger_conversa on public.suporte_conversas;
create trigger proteger_conversa before insert or update on public.suporte_conversas
  for each row execute function public.teeds_suporte_proteger_conversa();

-- ------------------------------------------------------------- etiquetas e prioridade automáticas
create or replace function public.teeds_suporte_normalizar(t text)
returns text language sql immutable as $function$
  select translate(lower(coalesce(t, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
$function$;

create or replace function public.teeds_suporte_etiquetas(t text)
returns text[] language sql immutable as $function$
  with x as (select public.teeds_suporte_normalizar(t) as s)
  select coalesce(array_agg(e order by e), '{}') from x, lateral (values
    ('deposito',   s ~ '(deposit|pix|recarg|colocar (dinheiro|saldo)|adicionar saldo|transferi)'),
    ('saque',      s ~ '(saque|sacar|retirar|retirada|withdraw|resgat)'),
    ('conta-deriv', s ~ '(deriv|corretora|conta real|conta demo|verificac|document|selfie|comprovante)'),
    ('acesso',     s ~ '(login|logar|entrar|acess|senha|bloquead|esqueci|codigo)'),
    ('ia',         s ~ '(robo|\mia\M|i\.a|estrategia|raptor|falcon|legacy|gulf|phenom|ligar|deslig)'),
    ('operacao',   s ~ '(operac|contrato|entrada|stake|\mgale|\mloss|\mwin\M|perd|ganh|resultado|meta|limite)'),
    ('plano',      s ~ '(plano|assinatura|pagament|pagar|renov|venc|expir|cobran|boleto|cartao|reembolso|mensalidade)'),
    ('aulas',      s ~ '(aula|video|curso|modulo)'),
    ('treino',     s ~ '(treino|\mlive\M|ao vivo|transmiss|sala)'),
    ('app',        s ~ '(\mapp\M|aplicativo|instal|iphone|android|notificac|tela inicial)'),
    ('erro',       s ~ '(erro|bug|travou|trava|nao funciona|nao carrega|nao abre|falha|caiu|lento|tela branca)'),
    ('cadastro',   s ~ '(cadastr|\mcpf|e-?mail|telefone|endereco|perfil|meus dados|nome)'),
    ('atencao',    s ~ '(absurdo|ridicul|pessim|horrivel|vergonha|procon|reclame aqui|enganad|cancelar|quero meu dinheiro|processar)')
  ) as r(e, ok) where ok
$function$;

create or replace function public.teeds_suporte_prioridade(t text, etiquetas text[])
returns text language sql immutable as $function$
  select case
    when public.teeds_suporte_normalizar(t) ~ '(urgente|sumiu|desapareceu|nao (recebi|caiu|chegou)|golpe|fraude|roub|hack|invadi)' then 'urgente'
    when etiquetas && array['saque', 'acesso', 'erro', 'atencao'] then 'alta'
    else 'normal' end
$function$;

create or replace function public.teeds_suporte_peso(p text)
returns int language sql immutable as $function$
  select case p when 'urgente' then 4 when 'alta' then 3 when 'normal' then 2 else 1 end
$function$;

-- ------------------------------------------------------------- antes de gravar a mensagem
create or replace function public.teeds_suporte_antes_da_mensagem()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_nome text;
begin
  new.criada_em := now();
  new.texto := btrim(coalesce(new.texto, ''));
  if new.texto = '' and new.anexo is null then raise exception 'Mensagem vazia.'; end if;
  select c.marca into new.marca from public.suporte_conversas c where c.id = new.conversa_id;
  if new.autor = 'cliente' then
    select nullif(btrim(cl.nome), '') into v_nome from public.clientes cl
     join public.suporte_conversas c on c.id = new.conversa_id
     where cl.user_id = c.user_id and cl.marca = c.marca limit 1;
    new.autor_nome := coalesce(v_nome, 'Cliente');
    new.interna := false;
  elsif new.autor = 'equipe' then
    new.autor_nome := coalesce(nullif(btrim(new.autor_nome), ''), 'Equipe');
  end if;
  return new;
end $function$;
drop trigger if exists antes_da_mensagem on public.suporte_mensagens;
create trigger antes_da_mensagem before insert on public.suporte_mensagens
  for each row execute function public.teeds_suporte_antes_da_mensagem();

-- ------------------------------------------------------------- depois de gravar: a conversa se atualiza
create or replace function public.teeds_suporte_depois_da_mensagem()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  c public.suporte_conversas;
  v_etiquetas text[];
  v_prioridade text;
  v_primeira boolean;
  v_casa text;
  v_previa text := left(coalesce(nullif(new.texto, ''), '📎 Imagem'), 160);
begin
  perform set_config('teeds.suporte_sistema', '1', true);
  select * into c from public.suporte_conversas where id = new.conversa_id for update;
  if new.autor = 'cliente' then
    v_etiquetas := (select coalesce(array_agg(distinct e order by e), '{}') from unnest(c.etiquetas || public.teeds_suporte_etiquetas(new.texto)) e);
    v_prioridade := public.teeds_suporte_prioridade(new.texto, v_etiquetas);
    if public.teeds_suporte_peso(c.prioridade) > public.teeds_suporte_peso(v_prioridade) then v_prioridade := c.prioridade; end if;
    v_primeira := not exists (select 1 from public.suporte_mensagens m where m.conversa_id = c.id and m.id <> new.id and m.autor = 'cliente');
    update public.suporte_conversas set
      status = 'aberta', resolvida_em = null, avaliacao = case when c.status = 'resolvida' then null else avaliacao end,
      etiquetas = v_etiquetas, prioridade = v_prioridade,
      assunto = coalesce(assunto, nullif(left(new.texto, 90), '')),
      ultima_mensagem = v_previa, ultima_de = 'cliente', ultima_em = new.criada_em,
      aguardando_desde = coalesce(case when c.status = 'aberta' then c.aguardando_desde end, new.criada_em),
      nao_lidas_equipe = nao_lidas_equipe + 1, atualizada_em = now()
     where id = c.id;
    if v_primeira then
      v_casa := case c.marca when 'globalfly' then 'GlobalFly Trade' when 'omni' then 'OMNI' else 'Teeds' end;
      insert into public.suporte_mensagens (conversa_id, marca, autor, autor_nome, texto)
      values (c.id, c.marca, 'sistema', v_casa,
        'Recebemos sua mensagem! Alguém da equipe ' || v_casa || ' responde por aqui mesmo, e você é avisado nesta janela. Se puder, conte o que aconteceu com o máximo de detalhes (e mande um print, se tiver): assim resolvemos mais rápido.');
    end if;
  elsif new.autor = 'equipe' and not new.interna then
    update public.suporte_conversas set
      status = case when status = 'resolvida' then 'resolvida' else 'respondida' end,
      ultima_mensagem = v_previa, ultima_de = 'equipe', ultima_em = new.criada_em,
      aguardando_desde = null, primeira_resposta_em = coalesce(primeira_resposta_em, new.criada_em),
      nao_lidas_cliente = nao_lidas_cliente + 1, nao_lidas_equipe = 0,
      responsavel = coalesce(responsavel, new.autor_id), responsavel_nome = coalesce(responsavel_nome, new.autor_nome),
      atualizada_em = now()
     where id = c.id;
  else
    update public.suporte_conversas set atualizada_em = now() where id = c.id;
  end if;
  perform set_config('teeds.suporte_sistema', '', true);
  return null;
end $function$;
drop trigger if exists depois_da_mensagem on public.suporte_mensagens;
create trigger depois_da_mensagem after insert on public.suporte_mensagens
  for each row execute function public.teeds_suporte_depois_da_mensagem();

-- ------------------------------------------------------------- o que o widget mostra no topo
-- Equipe online (caixa aberta no último 3 min) e o tempo típico da 1ª
-- resposta nos últimos 30 dias (mediana, em minutos).
create or replace function public.teeds_suporte_status(p_marca text)
returns json language sql stable security definer set search_path to 'public' as $function$
  select json_build_object(
    'online', exists (select 1 from public.suporte_presenca p where p.marca = p_marca and p.visto_em > now() - interval '3 minutes'),
    'minutos', (select round(percentile_cont(0.5) within group (order by extract(epoch from (c.primeira_resposta_em - c.criada_em)) / 60))::int
                from public.suporte_conversas c where c.marca = p_marca and c.primeira_resposta_em is not null and c.criada_em > now() - interval '30 days')
  )
$function$;
grant execute on function public.teeds_suporte_status(text) to authenticated;

-- ------------------------------------------------------------- tempo real
do $$ begin
  begin alter publication supabase_realtime add table public.suporte_conversas; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.suporte_mensagens; exception when duplicate_object then null; end;
end $$;

-- ------------------------------------------------------------- anexos (prints)
-- Privado: <marca>/<conversa>/<arquivo>. O cliente só lê e grava nas
-- conversas dele; a equipe da marca, em todas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suporte', 'suporte', false, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 3145728, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

create or replace function public.teeds_suporte_pode_anexo(p_nome text)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.suporte_conversas c
     where c.id::text = (storage.foldername(p_nome))[2] and c.marca = (storage.foldername(p_nome))[1]
       and (c.user_id = (select auth.uid()) or public.teeds_sou_admin_da(c.marca)))
$function$;

drop policy if exists "suporte: anexo (ler)" on storage.objects;
create policy "suporte: anexo (ler)" on storage.objects for select to authenticated
  using (bucket_id = 'suporte' and public.teeds_suporte_pode_anexo(name));
drop policy if exists "suporte: anexo (gravar)" on storage.objects;
create policy "suporte: anexo (gravar)" on storage.objects for insert to authenticated
  with check (bucket_id = 'suporte' and public.teeds_suporte_pode_anexo(name));

-- ------------------------------------------------------------- respostas prontas iniciais (GlobalFly)
insert into public.suporte_respostas (marca, titulo, texto, ordem)
select 'globalfly', t, x, o from (values
  ('Saudação', 'Olá, {nome}! Tudo bem? Aqui é da equipe GlobalFly Trade. Já estou vendo o seu caso.', 10),
  ('Pedir print', '{nome}, consegue me mandar um print da tela onde aparece isso? Fica mais fácil de eu ver exatamente o que está acontecendo.', 20),
  ('Depósito e saque na Deriv', 'O depósito e o saque são feitos direto na sua conta da Deriv (em Caixa / Cashier), {nome}. A GlobalFly Trade não movimenta o seu dinheiro: ela só se conecta à sua conta para operar.', 30),
  ('Conectar a Deriv', 'Para conectar: na tela Início, toque em "Conectar minha Deriv", entre com o seu login da Deriv e autorize. Pronto, o saldo aparece no topo.', 40),
  ('Comece na demo', 'Uma dica, {nome}: comece na conta demo. É dinheiro de treino, sem risco, ideal para conhecer as I.A.s antes de ir para a real.', 50),
  ('Troca de e-mail', 'Para trocar o e-mail de acesso, me confirme o e-mail novo e o seu CPF, {nome}. Faço a troca por aqui e te aviso.', 60),
  ('Renovação do plano', 'Para renovar o seu acesso, {nome}, é por aqui mesmo: me confirme o plano e eu te passo o caminho.', 70),
  ('Resolvido?', 'Consegui te ajudar, {nome}? Se estiver tudo certo, vou encerrar o atendimento. Qualquer coisa, é só chamar de novo por aqui.', 80)
) as v(t, x, o)
where not exists (select 1 from public.suporte_respostas r where r.marca = 'globalfly');
