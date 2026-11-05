-- 05/11/2026: os registros do WhatsApp oficial, feitos de uma vez só no banco.
-- Só a função whatsapp (chave de serviço) chama estas funções.

-- o contato pelo número (cria se não existe; atualiza o nome do perfil)
create or replace function public.whatsapp_contato_do_numero(p_marca text, p_wa_id text, p_nome text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_wa text := regexp_replace(coalesce(p_wa_id, ''), '\D', '', 'g');
begin
  if length(v_wa) < 10 then raise exception 'número inválido'; end if;
  insert into public.whatsapp_contatos (marca, wa_id, nome) values (p_marca, v_wa, nullif(trim(p_nome), ''))
  on conflict (marca, wa_id) do update set nome = coalesce(nullif(trim(excluded.nome), ''), whatsapp_contatos.nome)
  returning id into v_id;
  return v_id;
end $$;

-- uma mensagem que o cliente mandou
create or replace function public.whatsapp_registrar_entrada(
  p_marca text, p_wa_id text, p_nome text, p_wamid text, p_tipo text, p_texto text,
  p_midia jsonb default null, p_citando text default null, p_quando timestamptz default now())
returns json language plpgsql security definer set search_path = public as $$
declare v_contato uuid; v_msg uuid;
begin
  v_contato := public.whatsapp_contato_do_numero(p_marca, p_wa_id, p_nome);
  insert into public.whatsapp_mensagens (marca, contato_id, wamid, direcao, tipo, texto, midia, citando, status, criado_em)
  values (p_marca, v_contato, p_wamid, 'entrada', p_tipo, p_texto, p_midia, p_citando, 'recebida', coalesce(p_quando, now()))
  on conflict (wamid) do nothing
  returning id into v_msg;
  if v_msg is not null then
    update public.whatsapp_contatos set
      ultima_em = greatest(coalesce(ultima_em, p_quando), p_quando),
      ultima_texto = coalesce(nullif(p_texto, ''), case p_tipo when 'imagem' then '📷 Foto' when 'audio' then '🎤 Áudio' when 'video' then '🎬 Vídeo' when 'documento' then '📄 Arquivo' when 'figurinha' then 'Figurinha' when 'localizacao' then '📍 Localização' else 'Mensagem' end),
      ultima_direcao = 'entrada',
      ultima_entrada_em = greatest(coalesce(ultima_entrada_em, p_quando), p_quando),
      nao_lidas = nao_lidas + 1,
      situacao = 'aberta'
    where id = v_contato;
  end if;
  return json_build_object('contato', v_contato, 'mensagem', v_msg);
end $$;

-- uma mensagem que a equipe mandou (já aceita pela Meta)
create or replace function public.whatsapp_registrar_saida(
  p_marca text, p_contato uuid, p_wamid text, p_tipo text, p_texto text,
  p_midia jsonb default null, p_modelo jsonb default null, p_citando text default null, p_autor uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_msg uuid;
begin
  insert into public.whatsapp_mensagens (marca, contato_id, wamid, direcao, tipo, texto, midia, modelo, citando, status, autor)
  values (p_marca, p_contato, p_wamid, 'saida', p_tipo, p_texto, p_midia, p_modelo, p_citando, 'enviada', p_autor)
  on conflict (wamid) do nothing
  returning id into v_msg;
  update public.whatsapp_contatos set
    ultima_em = now(),
    ultima_texto = coalesce(nullif(p_texto, ''), case p_tipo when 'imagem' then '📷 Foto' when 'audio' then '🎤 Áudio' when 'video' then '🎬 Vídeo' when 'documento' then '📄 Arquivo' else 'Mensagem' end),
    ultima_direcao = 'saida',
    nao_lidas = 0
  where id = p_contato;
  return v_msg;
end $$;

-- o caminho da mensagem que a Meta avisa: enviada > entregue > lida (nunca volta), ou falhou
create or replace function public.whatsapp_registrar_status(p_wamid text, p_status text, p_erro text default null)
returns void language sql security definer set search_path = public as $$
  update public.whatsapp_mensagens set
    status = p_status,
    erro = coalesce(p_erro, erro)
  where wamid = p_wamid
    and (p_status = 'falhou'
      or (case p_status when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3 else 0 end)
       > (case status when 'pendente' then 0 when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3 else 4 end));
$$;

-- o emoji que o cliente deixou numa mensagem (vazio = tirou)
create or replace function public.whatsapp_registrar_reacao(p_wamid text, p_emoji text)
returns void language sql security definer set search_path = public as $$
  update public.whatsapp_mensagens set reacao = nullif(p_emoji, '') where wamid = p_wamid;
$$;

revoke all on function public.whatsapp_contato_do_numero(text, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_registrar_entrada(text, text, text, text, text, text, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public.whatsapp_registrar_saida(text, uuid, text, text, text, jsonb, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.whatsapp_registrar_status(text, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_registrar_reacao(text, text) from public, anon, authenticated;
grant execute on function public.whatsapp_contato_do_numero(text, text, text) to service_role;
grant execute on function public.whatsapp_registrar_entrada(text, text, text, text, text, text, jsonb, text, timestamptz) to service_role;
grant execute on function public.whatsapp_registrar_saida(text, uuid, text, text, text, jsonb, jsonb, text, uuid) to service_role;
grant execute on function public.whatsapp_registrar_status(text, text, text) to service_role;
grant execute on function public.whatsapp_registrar_reacao(text, text) to service_role;
