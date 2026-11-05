-- 05/11/2026: a central do WhatsApp com a cara do aplicativo.
-- Conversa fixada no topo da lista e a reação (emoji) que a equipe deixa numa mensagem.
alter table public.whatsapp_contatos add column if not exists fixada boolean not null default false;
alter table public.whatsapp_mensagens add column if not exists reacao_equipe text;
