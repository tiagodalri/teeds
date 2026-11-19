-- Assessor GF no WhatsApp pela Z-API (19/11/2026).
--
-- O número de WhatsApp do perfil vira o "login" da pessoa no WhatsApp. Antes de valer, ela confirma que o número
-- é dela mandando um código para o assessor (o cliente chama a gente, nunca o contrário). Só o servidor lê e grava
-- estas tabelas (service_role): RLS ligado e nenhuma política para o navegador.

create table if not exists public.assessor_whatsapp_vinculos (
  user_id uuid not null references auth.users(id) on delete cascade,
  marca text not null,
  -- o telefone do perfil no momento do código / da confirmação (só dígitos) e a chave DDD + 8 últimos dígitos
  telefone text not null,
  telefone_chave text not null,
  codigo text,
  codigo_expira_em timestamptz,
  confirmado_em timestamptz,
  -- o número exato de onde veio a confirmação (como o WhatsApp entrega, com 55)
  numero_whatsapp text,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, marca)
);
create index if not exists assessor_whatsapp_vinculos_chave on public.assessor_whatsapp_vinculos (marca, telefone_chave) where confirmado_em is not null;
alter table public.assessor_whatsapp_vinculos enable row level security;

create table if not exists public.assessor_whatsapp_mensagens (
  id bigint generated always as identity primary key,
  marca text not null,
  numero text not null,
  user_id uuid references auth.users(id) on delete set null,
  papel text not null check (papel in ('cliente', 'assessor')),
  texto text not null default '',
  tipo text not null default 'texto',
  id_whatsapp text,
  criado_em timestamptz not null default now()
);
create index if not exists assessor_whatsapp_mensagens_numero on public.assessor_whatsapp_mensagens (marca, numero, criado_em desc);
create unique index if not exists assessor_whatsapp_mensagens_idwpp on public.assessor_whatsapp_mensagens (id_whatsapp) where id_whatsapp is not null;
alter table public.assessor_whatsapp_mensagens enable row level security;

revoke all on public.assessor_whatsapp_vinculos from anon, authenticated;
revoke all on public.assessor_whatsapp_mensagens from anon, authenticated;
