-- Chat da equipe, nível WhatsApp (17/11/2026, Tiago: "queria ter uma experiência NÍVEL WHATSAPP,
-- perfeita! assim motivamos a equipe a focar as comunicações por lá, fica tudo registrado").
--
-- O que entra no banco:
--   * mensagem de voz e a medida das imagens (coluna `midia`: {tipo, duracao, ondas, l, a});
--   * reações (coluna `reacoes`: {user_id: emoji}), pela função equipe_reagir;
--   * editar a própria mensagem por 15 minutos (equipe_editar, coluna `editada_em`);
--   * "vendo agora" na presença: quem está com a conversa aberta não recebe a notificação dela;
--   * notificação no celular a cada mensagem (gatilho → função `notificacoes`, ação 'equipe');
--   * "digitando…" e "gravando áudio…": canal privado de Broadcast `equipe:<marca>`, só admins da marca;
--   * o bucket aceita áudio (até 5 MB).
-- O id da mensagem pode vir do aparelho: a cópia otimista e a real têm o mesmo id, e reenviar
-- depois de uma queda não duplica (o segundo envio bate na chave primária).

alter table public.equipe_mensagens add column if not exists midia jsonb;
alter table public.equipe_mensagens add column if not exists reacoes jsonb not null default '{}'::jsonb;
alter table public.equipe_mensagens add column if not exists editada_em timestamptz;
alter table public.equipe_presenca add column if not exists vendo uuid;

-- a prévia da lista: texto, "📷 Foto" ou "🎤 Mensagem de voz (0:12)"
create or replace function public.equipe_previa(p_texto text, p_anexo text, p_midia jsonb, p_apagada boolean)
returns text language sql immutable set search_path to 'public' as $$
  select case
    when p_apagada then null
    when p_midia ->> 'tipo' = 'audio' then '🎤 Mensagem de voz (' || ((coalesce((p_midia ->> 'duracao')::int, 0)) / 60)::text || ':'
      || lpad(((coalesce((p_midia ->> 'duracao')::int, 0)) % 60)::text, 2, '0') || ')'
    when p_anexo is not null and coalesce(p_texto, '') <> '' then '📷 ' || left(p_texto, 138)
    when p_anexo is not null then '📷 Foto'
    else left(coalesce(p_texto, ''), 140)
  end;
$$;

create or replace function public.equipe_ao_mandar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_original public.equipe_mensagens;
begin
  select c.marca into new.marca from public.equipe_conversas c where c.id = new.conversa_id;
  new.autor := auth.uid();
  new.criado_em := now();
  new.texto := btrim(new.texto);
  new.reacoes := '{}'::jsonb;
  new.editada_em := null;
  -- só o que a tela sabe mostrar; o resto do jsonb some
  if new.midia is not null then
    if new.anexo is null or new.midia ->> 'tipo' not in ('imagem', 'audio') then new.midia := null;
    elsif new.midia ->> 'tipo' = 'audio' then
      new.midia := jsonb_build_object('tipo', 'audio',
        'duracao', least(greatest(coalesce((new.midia ->> 'duracao')::int, 0), 0), 900),
        'ondas', case when jsonb_typeof(new.midia -> 'ondas') = 'array' and jsonb_array_length(new.midia -> 'ondas') <= 80 then new.midia -> 'ondas' else '[]'::jsonb end);
    else
      new.midia := jsonb_build_object('tipo', 'imagem',
        'l', least(greatest(coalesce((new.midia ->> 'l')::int, 0), 0), 10000),
        'a', least(greatest(coalesce((new.midia ->> 'a')::int, 0), 0), 10000));
    end if;
  end if;
  if new.resposta_a is not null then
    select * into v_original from public.equipe_mensagens m where m.id = new.resposta_a;
    if v_original.conversa_id is distinct from new.conversa_id then new.resposta_a := null; end if;
  end if;
  return new;
end $$;

create or replace function public.equipe_depois_de_mandar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare segredo text;
begin
  update public.equipe_conversas
     set ultima_em = new.criado_em,
         ultima_texto = public.equipe_previa(new.texto, new.anexo, new.midia, new.apagada),
         ultima_autor = new.autor
   where id = new.conversa_id;
  -- quem manda já leu tudo até ali
  update public.equipe_participantes set lida_em = greatest(lida_em, new.criado_em)
   where conversa_id = new.conversa_id and user_id = new.autor;
  -- a notificação no celular dos outros (a função decide quem já está vendo)
  begin
    select valor into segredo from public.config_servicos where chave = 'PUSH_GATILHO';
    if segredo is not null then
      perform net.http_post(
        url := 'https://wonxykovfvfnuhzpqsle.supabase.co/functions/v1/notificacoes',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-gatilho', segredo),
        body := jsonb_build_object('acao', 'equipe', 'id', new.id),
        timeout_milliseconds := 15000
      );
    end if;
  exception when others then
    raise warning 'notificacoes: aviso do chat da equipe não enviado (%)', sqlerrm;
  end;
  return null;
end $$;

-- Reagir: o mesmo emoji de novo (ou nulo) tira a reação.
create or replace function public.equipe_reagir(p_mensagem uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v public.equipe_mensagens; v_eu text := (select auth.uid())::text; v_novo jsonb;
begin
  select * into v from public.equipe_mensagens where id = p_mensagem;
  if v.id is null or not public.equipe_participo(v.conversa_id) then
    raise exception 'Essa mensagem não está numa conversa sua.' using errcode = '42501';
  end if;
  if v.apagada then return v.reacoes; end if;
  if p_emoji is null or btrim(p_emoji) = '' or v.reacoes ->> v_eu = p_emoji then v_novo := v.reacoes - v_eu;
  elsif char_length(p_emoji) > 16 then raise exception 'Reação inválida.' using errcode = '22023';
  else v_novo := v.reacoes || jsonb_build_object(v_eu, p_emoji);
  end if;
  update public.equipe_mensagens set reacoes = v_novo where id = p_mensagem;
  return v_novo;
end $$;

-- Editar a própria mensagem de texto, até 15 minutos depois.
create or replace function public.equipe_editar(p_mensagem uuid, p_texto text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v public.equipe_mensagens; v_texto text := btrim(coalesce(p_texto, ''));
begin
  select * into v from public.equipe_mensagens where id = p_mensagem;
  if v.id is null or v.autor is distinct from auth.uid() or not public.equipe_participo(v.conversa_id) then
    raise exception 'Só dá para editar as suas mensagens.' using errcode = '42501';
  end if;
  if v.apagada then raise exception 'Essa mensagem foi apagada.' using errcode = '22023'; end if;
  if v.criado_em < now() - interval '15 minutes' then raise exception 'Só dá para editar nos primeiros 15 minutos.' using errcode = '22023'; end if;
  if v_texto = '' and v.anexo is null then raise exception 'A mensagem não pode ficar vazia.' using errcode = '22023'; end if;
  if char_length(v_texto) > 4000 then raise exception 'Mensagem longa demais.' using errcode = '22023'; end if;
  if v_texto = v.texto then return; end if;
  update public.equipe_mensagens set texto = v_texto, editada_em = now() where id = p_mensagem;
  update public.equipe_conversas c set ultima_texto = public.equipe_previa(v_texto, v.anexo, v.midia, false)
   where c.id = v.conversa_id and c.ultima_em = v.criado_em;
end $$;

-- Apagar para todos também tira a mídia e as reações.
create or replace function public.equipe_apagar(p_mensagem uuid)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v public.equipe_mensagens;
begin
  select * into v from public.equipe_mensagens where id = p_mensagem;
  if v.id is null or v.autor is distinct from auth.uid() or not public.equipe_participo(v.conversa_id) then
    raise exception 'Só dá para apagar as suas mensagens.' using errcode = '42501';
  end if;
  update public.equipe_mensagens set apagada = true, texto = '', anexo = null, midia = null, reacoes = '{}'::jsonb where id = p_mensagem;
  update public.equipe_conversas c set ultima_texto = null
   where c.id = v.conversa_id and c.ultima_em = v.criado_em;
  return v.anexo;
end $$;

-- Presença com a conversa aberta (nula = a plataforma aberta, sem conversa na frente).
-- A versão de um argumento fica para quem ainda está com o app antigo aberto.
create or replace function public.equipe_estou_aqui(p_marca text, p_vendo uuid)
returns void language sql security definer set search_path to 'public' as $$
  insert into public.equipe_presenca (user_id, marca, visto_em, vendo)
    select (select auth.uid()), p_marca, now(), case when p_vendo is not null and public.equipe_participo(p_vendo) then p_vendo end
     where public.equipe_sou_da(p_marca)
    on conflict (user_id, marca) do update set visto_em = now(), vendo = excluded.vendo;
$$;

revoke all on function public.equipe_reagir(uuid, text), public.equipe_editar(uuid, text), public.equipe_estou_aqui(text, uuid),
  public.equipe_previa(text, text, jsonb, boolean) from public, anon;
grant execute on function public.equipe_reagir(uuid, text), public.equipe_editar(uuid, text), public.equipe_estou_aqui(text, uuid) to authenticated;

-- Para a função `notificacoes` (só a chave de serviço): quem avisar desta mensagem, com o nome de
-- quem escreveu e quantas faltam ler (na conversa e no total, para o número no ícone do app).
-- Fica de fora quem escreveu, quem já leu e quem está com a conversa aberta agora.
create or replace function public.equipe_quem_avisar(p_mensagem uuid)
returns table (user_id uuid, marca text, conversa_id uuid, tipo text, autor_nome text, texto text, nao_lidas_conversa int, nao_lidas_total int)
language sql stable security definer set search_path to 'public' as $$
  with m as (
    select m.*, c.tipo from public.equipe_mensagens m join public.equipe_conversas c on c.id = m.conversa_id
     where m.id = p_mensagem and not m.apagada
  ), autor as (
    select coalesce(nullif(btrim(cl.nome), ''), nullif(btrim(u.raw_user_meta_data->>'nome'), ''), split_part(u.email, '@', 1)) as nome
      from m join auth.users u on u.id = m.autor
      left join public.clientes cl on cl.user_id = m.autor and cl.marca = m.marca
  )
  select p.user_id, m.marca, m.conversa_id, m.tipo, (select nome from autor),
         public.equipe_previa(m.texto, m.anexo, m.midia, false),
         (select count(*)::int from public.equipe_mensagens x
           where x.conversa_id = m.conversa_id and x.criado_em > p.lida_em and x.autor is distinct from p.user_id and not x.apagada),
         (select count(*)::int from public.equipe_participantes p2
            join public.equipe_mensagens x on x.conversa_id = p2.conversa_id and x.criado_em > p2.lida_em
                 and x.autor is distinct from p2.user_id and not x.apagada
           where p2.user_id = p.user_id and p2.marca = m.marca)
    from m
    join public.equipe_participantes p on p.conversa_id = m.conversa_id and p.user_id is distinct from m.autor
    join public.administradores a on a.user_id = p.user_id and a.marca = m.marca
    left join public.equipe_presenca pr on pr.user_id = p.user_id and pr.marca = m.marca
   where p.lida_em < m.criado_em
     and not (pr.vendo = m.conversa_id and pr.visto_em > now() - interval '90 seconds');
$$;
revoke all on function public.equipe_quem_avisar(uuid) from public, anon, authenticated;
grant execute on function public.equipe_quem_avisar(uuid) to service_role;

-- "digitando…": canal privado equipe:<marca>, só administradores daquela marca ouvem e falam
drop policy if exists "equipe: sinais (ouvir)" on realtime.messages;
create policy "equipe: sinais (ouvir)" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) = 'equipe'
    and public.equipe_sou_da(split_part((select realtime.topic()), ':', 2)));
drop policy if exists "equipe: sinais (falar)" on realtime.messages;
create policy "equipe: sinais (falar)" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) = 'equipe'
    and public.equipe_sou_da(split_part((select realtime.topic()), ':', 2)));

-- prints e áudios
update storage.buckets set file_size_limit = 5242880,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/aac']
 where id = 'equipe';
