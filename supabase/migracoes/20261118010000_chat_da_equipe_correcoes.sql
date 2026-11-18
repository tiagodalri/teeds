-- Chat da equipe: correções da revisão (18/11/2026).
--  * reagir trava a linha: duas reações ao mesmo tempo não se apagam mais;
--  * o anexo só pode apontar para a pasta da própria conversa (<marca>/<conversa>/...);
--  * as barrinhas da onda do áudio viram números de 0 a 31.

create or replace function public.equipe_reagir(p_mensagem uuid, p_emoji text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v public.equipe_mensagens; v_eu text := (select auth.uid())::text; v_novo jsonb;
begin
  select * into v from public.equipe_mensagens where id = p_mensagem for update;
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

create or replace function public.equipe_ao_mandar() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_original public.equipe_mensagens; v_ondas jsonb;
begin
  select c.marca into new.marca from public.equipe_conversas c where c.id = new.conversa_id;
  new.autor := auth.uid();
  new.criado_em := now();
  new.texto := btrim(new.texto);
  new.reacoes := '{}'::jsonb;
  new.editada_em := null;
  -- o anexo mora na pasta da conversa
  if new.anexo is not null and left(new.anexo, char_length(new.marca || '/' || new.conversa_id::text || '/')) <> new.marca || '/' || new.conversa_id::text || '/' then
    raise exception 'Anexo inválido.' using errcode = '22023';
  end if;
  if new.midia is not null then
    if new.anexo is null or new.midia ->> 'tipo' not in ('imagem', 'audio') then new.midia := null;
    elsif new.midia ->> 'tipo' = 'audio' then
      v_ondas := '[]'::jsonb;
      if jsonb_typeof(new.midia -> 'ondas') = 'array' and jsonb_array_length(new.midia -> 'ondas') <= 80 then
        select coalesce(jsonb_agg(least(greatest(case when jsonb_typeof(x) = 'number' then (x #>> '{}')::numeric::int else 0 end, 0), 31)), '[]'::jsonb)
          into v_ondas from jsonb_array_elements(new.midia -> 'ondas') x;
      end if;
      new.midia := jsonb_build_object('tipo', 'audio',
        'duracao', least(greatest(coalesce((new.midia ->> 'duracao')::int, 0), 0), 900), 'ondas', v_ondas);
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
