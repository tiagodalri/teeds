-- 05/11/2026: a central do WhatsApp oficial (API da Meta) dentro do ADM.
-- Tiago: "Deixe o chat já visível tudo certinho faltando só conectar a api".
--
-- Quem vê: o admin geral da marca e os admins do parceiro dono do número
-- (o WhatsApp é do Naor, /n). Os Victors (/v) não leem as conversas do Naor.
--
-- O que mora onde:
--   whatsapp_contas      o número conectado (sem segredo nenhum: dá para mostrar na tela)
--   config_servicos      a chave da Meta, o segredo do aplicativo e a senha do webhook,
--                        em WHATSAPP_<MARCA>; só a chave de serviço lê (função whatsapp)
--   whatsapp_contatos    uma linha por pessoa que conversa com o número
--   whatsapp_mensagens   entrada (do cliente), saída (da equipe) e nota interna
--   whatsapp_respostas   as respostas prontas da equipe ("/live")
--   whatsapp_modelos     os modelos aprovados na Meta (cópia para a tela)
--   bucket whatsapp      fotos, áudios e arquivos das conversas (privado)

-- ------------------------------------------------------------ o número
create table if not exists public.whatsapp_contas (
  marca            text primary key,
  parceiro         text,                 -- dono do número ('n' = Naor); null = da marca
  phone_number_id  text unique,
  waba_id          text,
  app_id           text,
  numero           text,                 -- como a Meta mostra: +55 47 99999-8888
  nome_verificado  text,
  qualidade        text,                 -- GREEN | YELLOW | RED
  limite           text,                 -- TIER_250, TIER_1K…
  situacao         text not null default 'desconectado' check (situacao in ('desconectado', 'conectado', 'erro')),
  erro             text,
  ultimo_aviso_em  timestamptz,          -- a última vez que a Meta chamou o webhook
  conectado_em     timestamptz,
  conectado_por    uuid,
  atualizado_em    timestamptz not null default now()
);
alter table public.whatsapp_contas enable row level security;

-- quem pode ver e responder as conversas do WhatsApp desta marca
create or replace function public.whatsapp_posso(p_marca text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.administradores a
    left join public.whatsapp_contas w on w.marca = p_marca
    where a.user_id = (select auth.uid())
      and (a.marca = p_marca or a.marca = 'teeds')
      and (a.parceiro is null or (w.parceiro is not null and a.parceiro = w.parceiro))
  );
$$;
revoke all on function public.whatsapp_posso(text) from public, anon;
grant execute on function public.whatsapp_posso(text) to authenticated;

-- quem pode ligar o número: o admin geral, ou o admin de um parceiro (o número fica sendo dele)
create or replace function public.whatsapp_posso_conectar(p_marca text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.administradores a where a.user_id = (select auth.uid()) and (a.marca = p_marca or a.marca = 'teeds') and a.parceiro is null) then 'geral'
    else (select 'parceiro:' || a.parceiro from public.administradores a where a.user_id = (select auth.uid()) and a.marca = p_marca and a.parceiro is not null limit 1)
  end;
$$;
revoke all on function public.whatsapp_posso_conectar(text) from public, anon;
grant execute on function public.whatsapp_posso_conectar(text) to authenticated;

drop policy if exists whatsapp_contas_ver on public.whatsapp_contas;
create policy whatsapp_contas_ver on public.whatsapp_contas for select to authenticated using (public.whatsapp_posso(marca));

-- ------------------------------------------------------------ telefone
-- A mesma pessoa aparece como 5547999998888 no WhatsApp e "(47) 99999-8888" no cadastro;
-- números antigos vêm sem o 9. A chave é DDD + os 8 últimos dígitos.
create or replace function public.whatsapp_chave_tel(p text)
returns text language sql immutable as $$
  with d as (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as n),
       s as (select case when length(n) >= 12 and left(n, 2) = '55' then substr(n, 3) else n end as n from d)
  select case when length(n) >= 10 then left(n, 2) || right(n, 8) else null end from s;
$$;

-- ------------------------------------------------------------ contatos
create table if not exists public.whatsapp_contatos (
  id                 uuid primary key default gen_random_uuid(),
  marca              text not null,
  wa_id              text not null,          -- só dígitos, com o 55
  nome               text,                   -- o nome do perfil do WhatsApp
  user_id            uuid,                   -- o cadastro na plataforma, quando o telefone bate
  lead_id            uuid,                   -- ou o lead do cadastro da live
  ultima_em          timestamptz,
  ultima_texto       text,
  ultima_direcao     text,
  ultima_entrada_em  timestamptz,            -- abre a janela de 24 h
  nao_lidas          integer not null default 0,
  responsavel        uuid,
  situacao           text not null default 'aberta' check (situacao in ('aberta', 'resolvida')),
  etiquetas          text[] not null default '{}',
  criado_em          timestamptz not null default now(),
  unique (marca, wa_id)
);
create index if not exists whatsapp_contatos_lista on public.whatsapp_contatos (marca, ultima_em desc nulls last);
alter table public.whatsapp_contatos enable row level security;

drop policy if exists whatsapp_contatos_ver on public.whatsapp_contatos;
create policy whatsapp_contatos_ver on public.whatsapp_contatos for select to authenticated using (public.whatsapp_posso(marca));
drop policy if exists whatsapp_contatos_mudar on public.whatsapp_contatos;
create policy whatsapp_contatos_mudar on public.whatsapp_contatos for update to authenticated
  using (public.whatsapp_posso(marca)) with check (public.whatsapp_posso(marca));

-- liga o contato ao cadastro (ou ao lead) pelo telefone, quando ele nasce
create or replace function public.whatsapp_ligar_contato()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_chave text := public.whatsapp_chave_tel(new.wa_id);
begin
  if v_chave is null then return new; end if;
  if new.user_id is null then
    select c.user_id into new.user_id from public.clientes c
     where c.marca = new.marca and public.whatsapp_chave_tel(c.telefone) = v_chave
     order by c.visto_em desc nulls last limit 1;
  end if;
  if new.user_id is null and new.lead_id is null then
    select l.id into new.lead_id from public.leads_capturados l
     where l.marca = new.marca and public.whatsapp_chave_tel(coalesce(l.telefone_normalizado, l.telefone)) = v_chave
     order by l.atualizado_em desc nulls last limit 1;
  end if;
  return new;
end $$;
drop trigger if exists whatsapp_ligar_contato on public.whatsapp_contatos;
create trigger whatsapp_ligar_contato before insert on public.whatsapp_contatos
  for each row execute function public.whatsapp_ligar_contato();

-- ------------------------------------------------------------ mensagens
create table if not exists public.whatsapp_mensagens (
  id          uuid primary key default gen_random_uuid(),
  marca       text not null,
  contato_id  uuid not null references public.whatsapp_contatos (id) on delete cascade,
  wamid       text unique,                 -- o id da mensagem na Meta
  direcao     text not null check (direcao in ('entrada', 'saida', 'nota')),
  tipo        text not null default 'texto' check (tipo in ('texto', 'imagem', 'audio', 'video', 'documento', 'figurinha', 'modelo', 'localizacao', 'contato', 'botao', 'outro')),
  texto       text,
  midia       jsonb,                       -- { caminho, mime, nome, tamanho, id }
  modelo      jsonb,                       -- { nome, idioma, variaveis }
  citando     text,                        -- wamid da mensagem respondida
  reacao      text,                        -- o emoji que o cliente deixou nesta mensagem
  status      text not null default 'pendente' check (status in ('pendente', 'enviada', 'entregue', 'lida', 'falhou', 'recebida')),
  erro        text,
  autor       uuid,
  criado_em   timestamptz not null default now()
);
create index if not exists whatsapp_mensagens_conversa on public.whatsapp_mensagens (contato_id, criado_em desc);
alter table public.whatsapp_mensagens enable row level security;

drop policy if exists whatsapp_mensagens_ver on public.whatsapp_mensagens;
create policy whatsapp_mensagens_ver on public.whatsapp_mensagens for select to authenticated using (public.whatsapp_posso(marca));
-- pela tela só nasce nota interna; o que vai para o cliente passa pela função whatsapp
drop policy if exists whatsapp_mensagens_nota on public.whatsapp_mensagens;
create policy whatsapp_mensagens_nota on public.whatsapp_mensagens for insert to authenticated
  with check (direcao = 'nota' and tipo = 'texto' and autor = (select auth.uid()) and public.whatsapp_posso(marca));

-- ------------------------------------------------------------ respostas prontas
create table if not exists public.whatsapp_respostas (
  id         uuid primary key default gen_random_uuid(),
  marca      text not null,
  atalho     text not null,
  titulo     text not null,
  texto      text not null,
  criado_por uuid,
  criado_em  timestamptz not null default now(),
  unique (marca, atalho)
);
alter table public.whatsapp_respostas enable row level security;
drop policy if exists whatsapp_respostas_tudo on public.whatsapp_respostas;
create policy whatsapp_respostas_tudo on public.whatsapp_respostas for all to authenticated
  using (public.whatsapp_posso(marca)) with check (public.whatsapp_posso(marca));

insert into public.whatsapp_respostas (marca, atalho, titulo, texto) values
  ('globalfly', 'oi', 'Boas-vindas', 'Olá! Aqui é a equipe da GlobalFly Trade. Como podemos te ajudar?'),
  ('globalfly', 'live', 'Live de 09/11', 'A live de lançamento é no dia 09/11, às 20h30, ao vivo no YouTube. Assim que começar, o link aparece dentro da plataforma.'),
  ('globalfly', 'deposito', 'Como depositar', 'Para depositar na sua conta da corretora, use este link: https://home.deriv.com/dashboard/deposit?from=home&depositSheet=1&returnTo=%2Fhome&currency=USD'),
  ('globalfly', 'acesso', 'Acesso à plataforma', 'Você entra em https://globalflytrade.com com o mesmo e-mail do cadastro. Se esqueceu a senha, toque em "Esqueci a senha" na tela de entrada.')
on conflict (marca, atalho) do nothing;

-- ------------------------------------------------------------ modelos aprovados
create table if not exists public.whatsapp_modelos (
  marca         text not null,
  nome          text not null,
  idioma        text not null,
  categoria     text,
  situacao      text,                       -- APPROVED | PENDING | REJECTED…
  componentes   jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (marca, nome, idioma)
);
alter table public.whatsapp_modelos enable row level security;
drop policy if exists whatsapp_modelos_ver on public.whatsapp_modelos;
create policy whatsapp_modelos_ver on public.whatsapp_modelos for select to authenticated using (public.whatsapp_posso(marca));

-- ------------------------------------------------------------ ficha ao lado da conversa
create or replace function public.whatsapp_ficha(p_contato uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare c public.whatsapp_contatos; r json;
begin
  select * into c from public.whatsapp_contatos where id = p_contato;
  if c.id is null or not public.whatsapp_posso(c.marca) then return null; end if;
  select json_build_object(
    'cliente', (select json_build_object(
        'user_id', k.user_id, 'nome', k.nome, 'email', k.email, 'telefone', k.telefone,
        'categoria', k.categoria, 'subplano', public.teeds_subplano_id(k.user_id, k.marca),
        'parceiro', k.parceiro, 'status', k.status_acesso, 'criado_em', k.criado_em, 'visto_em', k.visto_em,
        'cidade', coalesce(k.end_cidade, k.cidade), 'uf', coalesce(k.end_uf, k.regiao))
      from public.clientes k where k.user_id = c.user_id and k.marca = c.marca),
    'lead', (select json_build_object(
        'nome', l.nome, 'email', l.email, 'parceiro', l.parceiro, 'temperatura', l.temperatura,
        'campanha', l.campanha, 'consentiu', l.consentiu_contato, 'criado_em', coalesce(l.inscricao_recebida_em, l.atualizado_em))
      from public.leads_capturados l where l.id = c.lead_id)
  ) into r;
  return r;
end $$;
revoke all on function public.whatsapp_ficha(uuid) from public, anon;
grant execute on function public.whatsapp_ficha(uuid) to authenticated;

-- ------------------------------------------------------------ ao vivo
do $$ begin
  begin alter publication supabase_realtime add table public.whatsapp_contatos; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.whatsapp_mensagens; exception when duplicate_object then null; end;
end $$;

-- ------------------------------------------------------------ arquivos
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp', 'whatsapp', false, 104857600)
on conflict (id) do nothing;

drop policy if exists whatsapp_arquivos_ver on storage.objects;
create policy whatsapp_arquivos_ver on storage.objects for select to authenticated
  using (bucket_id = 'whatsapp' and public.whatsapp_posso(split_part(name, '/', 1)));
drop policy if exists whatsapp_arquivos_enviar on storage.objects;
create policy whatsapp_arquivos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'whatsapp' and public.whatsapp_posso(split_part(name, '/', 1)));
