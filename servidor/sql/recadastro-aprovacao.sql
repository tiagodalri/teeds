-- Aplicar antes do servidor novo. Não altera acessos, senhas ou a base antiga.
-- Cada novo ciclo tem ID próprio: preserva histórico e idempotência do e-mail.
begin;
alter table public.leads_capturados add column inscricao_recebida_em timestamptz;
alter table public.clientes_pendentes add column recadastro boolean not null default false;
alter table public.clientes_pendentes add column ultima_inscricao_em timestamptz;
update public.clientes_pendentes set ultima_inscricao_em=criado_em;
alter table public.clientes_pendentes alter column ultima_inscricao_em set default now();
alter table public.clientes_pendentes alter column ultima_inscricao_em set not null;
alter table public.clientes_pendentes drop constraint clientes_pendentes_marca_email_key;
create unique index clientes_pendentes_um_pedido_aberto
  on public.clientes_pendentes(marca,email) where status in ('pendente','processando');

create or replace function public.teeds_lead_pendente() returns trigger language plpgsql
security definer set search_path = public as $$
declare d jsonb; v_email text; v_marca text; v_recadastro boolean;
begin
  if tg_table_name = 'auditoria_admin' then
    if new.acao <> 'lead_capturado' then return new; end if;
    d := new.detalhes || jsonb_build_object('marca',new.marca);
  else
    -- Uma edição administrativa do lead não equivale a um novo formulário.
    if tg_op='UPDATE' then
      if new.inscricao_recebida_em is not distinct from old.inscricao_recebida_em then return new; end if;
    end if;
    d := to_jsonb(new);
  end if;
  v_email := lower(trim(d->>'email')); v_marca := d->>'marca';
  -- Serializa inclusive o caminho alternativo da captura, sem travar outras pessoas.
  perform pg_advisory_xact_lock(hashtextextended(v_marca || ':' || v_email,0));
  v_recadastro := exists(select 1 from public.clientes c where c.marca=v_marca and lower(trim(c.email))=v_email)
    or exists(select 1 from public.clientes_pendentes p where p.marca=v_marca and p.email=v_email);
  insert into public.clientes_pendentes(marca,email,nome,telefone,recadastro,ultima_inscricao_em)
  values(v_marca,v_email,d->>'nome',d->>'telefone',v_recadastro,now())
  on conflict(marca,email) where status in ('pendente','processando')
  do update set nome=excluded.nome,telefone=excluded.telefone,
    recadastro=clientes_pendentes.recadastro or excluded.recadastro,
    ultima_inscricao_em=excluded.ultima_inscricao_em
  -- A ficha em aprovação fica estável até finalizar ou retomar sua trava.
  where clientes_pendentes.status='pendente';
  return new;
end $$;
revoke all on function public.teeds_lead_pendente() from public,anon,authenticated;
commit;
