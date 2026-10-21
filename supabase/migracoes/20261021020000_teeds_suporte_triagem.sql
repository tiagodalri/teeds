-- 20/10/2026: triagem do suporte. O chat pergunta o assunto e 1 a 3
-- detalhes antes de abrir a conversa (src/core/teeds/triagem.ts); o resumo
-- vem em contexto.triagem. Na abertura, o banco aceita dali só o que é
-- seguro: UMA etiqueta da lista e, no máximo, prioridade "alta" (urgente
-- continua sendo só pelo texto ou pela equipe).
create or replace function public.teeds_suporte_proteger_conversa()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_etiqueta text;
begin
  if current_setting('teeds.suporte_sistema', true) = '1' then new.atualizada_em := now(); return new; end if;
  if tg_op = 'INSERT' then
    if not public.teeds_sou_admin_da(new.marca) then
      new.status := 'aberta'; new.prioridade := 'normal'; new.etiquetas := '{}'; new.responsavel := null; new.responsavel_nome := null;
      new.ultima_mensagem := null; new.ultima_de := null; new.ultima_em := null; new.aguardando_desde := null; new.primeira_resposta_em := null;
      new.resolvida_em := null; new.nao_lidas_cliente := 0; new.nao_lidas_equipe := 0; new.avaliacao := null; new.avaliacao_comentario := null;
      new.assunto := left(nullif(btrim(new.assunto), ''), 90);
      v_etiqueta := new.contexto -> 'triagem' ->> 'etiqueta';
      if v_etiqueta = any (array['deposito','saque','conta-deriv','acesso','ia','operacao','plano','aulas','treino','app','erro','cadastro']) then
        new.etiquetas := array[v_etiqueta];
      end if;
      if (new.contexto -> 'triagem' ->> 'alta') = 'true' then new.prioridade := 'alta'; end if;
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
    if new.status is distinct from old.status and new.status <> 'resolvida' then new.status := old.status; end if;
    if new.status = 'resolvida' and old.status <> 'resolvida' then new.resolvida_em := now(); new.aguardando_desde := null; else new.resolvida_em := old.resolvida_em; end if;
    if new.status <> 'resolvida' then new.avaliacao := old.avaliacao; new.avaliacao_comentario := old.avaliacao_comentario; end if;
  else
    if new.status = 'resolvida' and old.status <> 'resolvida' then new.resolvida_em := now(); new.aguardando_desde := null; end if;
    if new.status <> 'resolvida' then new.resolvida_em := null; end if;
  end if;
  new.atualizada_em := now();
  return new;
end $function$;
