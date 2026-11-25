-- Chat do Assessor GF no ADM (25/11/2026, Tiago: "preciso do chat mesmo, pra visualizar as conversas, até mesmo
-- se eu quiser responder alguém manualmente").
--
-- Uma conversa por número (assessor_whatsapp_contatos): não lidas, aberta/resolvida, responsável, etiquetas,
-- fixada e a PAUSA do Assessor (quando a equipe assume, a I.A. para de responder aquele número).
-- As mensagens ganham quem escreveu (equipe), nota interna, mídia guardada, citação, reação e favorita.
-- Como as tabelas de antes: só o servidor lê e grava (service_role); RLS ligado e nenhuma política.

alter table public.assessor_whatsapp_mensagens drop constraint if exists assessor_whatsapp_mensagens_papel_check;
alter table public.assessor_whatsapp_mensagens add constraint assessor_whatsapp_mensagens_papel_check
  check (papel in ('cliente', 'assessor', 'equipe', 'nota'));
alter table public.assessor_whatsapp_mensagens
  add column if not exists autor uuid references auth.users(id) on delete set null,
  add column if not exists midia jsonb,
  add column if not exists citando text,
  add column if not exists reacao text,
  add column if not exists reacao_equipe text,
  add column if not exists favorita boolean not null default false,
  add column if not exists status text not null default 'enviada',
  -- a tela acompanha pelo que mudou (transcrição do áudio, reação, favorita)
  add column if not exists atualizado_em timestamptz not null default now();
create index if not exists assessor_whatsapp_mensagens_atualizado on public.assessor_whatsapp_mensagens (marca, atualizado_em desc);

create table if not exists public.assessor_whatsapp_contatos (
  marca text not null,
  numero text not null,
  user_id uuid references auth.users(id) on delete set null,
  nome text,
  nao_lidas integer not null default 0,
  situacao text not null default 'aberta' check (situacao in ('aberta', 'resolvida')),
  responsavel uuid references auth.users(id) on delete set null,
  etiquetas text[] not null default '{}',
  fixada boolean not null default false,
  -- a equipe assumiu: o Assessor (I.A.) não responde este número até devolver (ou 6 h sem a equipe escrever)
  ia_pausada boolean not null default false,
  pausada_em timestamptz,
  pausada_por uuid references auth.users(id) on delete set null,
  ultima_em timestamptz,
  ultima_texto text,
  ultima_direcao text,
  ultima_entrada_em timestamptz,
  ultima_equipe_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (marca, numero)
);
create index if not exists assessor_whatsapp_contatos_atualizado on public.assessor_whatsapp_contatos (marca, atualizado_em desc);
alter table public.assessor_whatsapp_contatos enable row level security;
revoke all on public.assessor_whatsapp_contatos from anon, authenticated;

-- as conversas que já existem (desde 25/11) entram na lista
insert into public.assessor_whatsapp_contatos (marca, numero, user_id, ultima_em, ultima_texto, ultima_direcao, ultima_entrada_em, criado_em, atualizado_em)
select m.marca, m.numero,
  (select x.user_id from public.assessor_whatsapp_mensagens x where x.marca = m.marca and x.numero = m.numero and x.user_id is not null order by x.criado_em desc limit 1),
  max(m.criado_em),
  (select left(x.texto, 160) from public.assessor_whatsapp_mensagens x where x.marca = m.marca and x.numero = m.numero order by x.criado_em desc limit 1),
  (select case when x.papel = 'cliente' then 'entrada' else 'saida' end from public.assessor_whatsapp_mensagens x where x.marca = m.marca and x.numero = m.numero order by x.criado_em desc limit 1),
  max(m.criado_em) filter (where m.papel = 'cliente'),
  min(m.criado_em), max(m.criado_em)
from public.assessor_whatsapp_mensagens m
group by m.marca, m.numero
on conflict (marca, numero) do nothing;
