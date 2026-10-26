-- 26/10/2026 (Tiago): "clicar nas conversas do chat com o botão direito e ter
-- funções, de apagar etc., assim como no WhatsApp". O menu da conversa na
-- caixa do suporte: fixar no topo, arquivar, marcar como não lida, atribuir,
-- prioridade, resolver/reabrir e apagar.

alter table public.suporte_conversas
  add column if not exists fixada_em timestamptz,
  add column if not exists arquivada_em timestamptz;

-- Fixar e arquivar são organização da equipe: o cliente não mexe. E quando o
-- cliente escreve numa conversa arquivada, ela volta para a fila (como no WhatsApp).
create or replace function public.teeds_suporte_organizacao_da_equipe()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('teeds.suporte_sistema', true) = '1' then
    if new.ultima_de = 'cliente' and new.ultima_em is distinct from old.ultima_em then new.arquivada_em := null; end if;
    return new;
  end if;
  if auth.role() = 'authenticated' and not public.teeds_sou_admin_da(old.marca) then
    new.fixada_em := old.fixada_em; new.arquivada_em := old.arquivada_em;
  end if;
  return new;
end $$;
drop trigger if exists organizacao_da_equipe on public.suporte_conversas;
create trigger organizacao_da_equipe before update on public.suporte_conversas
  for each row execute function public.teeds_suporte_organizacao_da_equipe();

-- Apagar a conversa: as mensagens e a conversa saem para a equipe e para o
-- cliente. Fica o registro na auditoria (quem, quando, de quem era, quantas
-- mensagens), sem o conteúdo. Devolve os prints para a tela tirar do armazenamento.
create or replace function public.teeds_suporte_apagar_conversa(p_id uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare c public.suporte_conversas; v_anexos text[]; v_total int;
begin
  select * into c from suporte_conversas where id = p_id;
  if c.id is null then raise exception 'Conversa não encontrada.'; end if;
  if not public.teeds_sou_admin_da(c.marca) then raise exception 'Somente a equipe pode apagar conversas.'; end if;
  select coalesce(array_agg(anexo) filter (where anexo is not null), '{}'), count(*) into v_anexos, v_total
    from suporte_mensagens where conversa_id = p_id;
  delete from suporte_mensagens where conversa_id = p_id;
  delete from suporte_conversas where id = p_id;
  insert into auditoria_admin (marca, admin_id, cliente_id, acao, detalhes)
  values (c.marca, auth.uid(), c.user_id, 'suporte_conversa_apagada',
          jsonb_build_object('conversa', p_id, 'assunto', c.assunto, 'mensagens', v_total, 'prints', coalesce(array_length(v_anexos, 1), 0), 'criada_em', c.criada_em, 'status', c.status));
  return v_anexos;
end $$;
revoke all on function public.teeds_suporte_apagar_conversa(uuid) from public, anon;
grant execute on function public.teeds_suporte_apagar_conversa(uuid) to authenticated;

-- A equipe da marca pode tirar do armazenamento os prints das conversas dela.
drop policy if exists "suporte: anexo (apagar pela equipe)" on storage.objects;
create policy "suporte: anexo (apagar pela equipe)" on storage.objects for delete to authenticated
  using (bucket_id = 'suporte' and public.teeds_sou_admin_da((storage.foldername(name))[1]));
