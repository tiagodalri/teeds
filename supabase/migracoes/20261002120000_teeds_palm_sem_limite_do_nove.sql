-- O limite do dígito 9 sai da validação do The Palm.
--
-- O robô deixou de ter análise na estratégia-base: o Under 9 acerta em nove
-- dígitos de dez e agora entra em todo tick, sem esperar um loss virtual. O
-- `limiteNove` era o teto de 9 na janela que armava aquela espera, e sem a
-- espera ele não decide mais nada. Saiu do código; esta função é a outra
-- metade da mesma regra e precisa sair junto, senão o painel não consegue
-- publicar parâmetros novos (eles chegariam sem a chave e seriam recusados).
--
-- Compatível nos dois sentidos: configurações já gravadas continuam com o
-- `limiteNove` dentro de `palm` e passam, porque as chaves de dentro do palm
-- nunca foram conferidas uma a uma — só as de primeiro nível, que não mudam.
-- E uma aba antiga que ainda mande a chave também passa.

create or replace function public.teeds_robos_parametros_valida(p jsonb) returns void
language plpgsql immutable set search_path = public as $$
declare n numeric; t text; d jsonb; qtd integer; ag jsonb; palm jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Os parâmetros do robô precisam ser um objeto.'; end if;
  if (p - array['v','entrada','contrato','recuperacao','limites','palm']) <> '{}'::jsonb then raise exception 'Há uma chave desconhecida nos parâmetros do robô.'; end if;
  if (p ->> 'v') is distinct from '1' then raise exception 'Formato de parâmetros desconhecido (esperado v = 1).'; end if;
  n := (p #>> '{entrada,lossVirtual}')::numeric;
  if n is null or n <> trunc(n) or n < 0 or n > 12 then raise exception 'Loss virtual precisa ser um número inteiro de 0 a 12.'; end if;
  if jsonb_typeof(p #> '{entrada,sequenciaSemAnalise}') is distinct from 'boolean' then raise exception 'Informe se o robô segue a sequência sem nova análise (sim ou não).'; end if;
  t := p #>> '{contrato,contractType}'; n := (p #>> '{contrato,barreira}')::numeric;
  if t = 'DIGITOVER' then if n is null or n < 0 or n > 8 then raise exception 'A barreira do Over precisa ficar entre 0 e 8.'; end if;
  elsif t = 'DIGITUNDER' then if n is null or n < 1 or n > 9 then raise exception 'A barreira do Under precisa ficar entre 1 e 9.'; end if;
  else raise exception 'Tipo de contrato desconhecido.'; end if;
  n := (p #>> '{recuperacao,galeApos}')::numeric;
  if n is null or n <> trunc(n) or n < 0 or n > 10 then raise exception 'O gatilho da recuperação precisa ser um inteiro de 0 a 10.'; end if;
  n := (p #>> '{recuperacao,descontoRetorno}')::numeric;
  if n is null or n < 0.8 or n > 1 then raise exception 'A segurança do payout precisa ficar entre 0,80 e 1,00.'; end if;
  n := (p #>> '{recuperacao,lucroMinimo}')::numeric;
  if n is null or n < 0.01 or n > 1 then raise exception 'O lucro mínimo em dólares precisa ficar entre 0,01 e 1,00.'; end if;
  n := (p #>> '{recuperacao,modos,conservador,margem}')::numeric;
  if n is null or n < 0 or n > 2 then raise exception 'O lucro ao fechar a sequência (conservador) precisa ficar entre 0%% e 200%% da entrada.'; end if;
  n := (p #>> '{recuperacao,modos,conservador,sobrePrejuizo}')::numeric;
  if n is null or n < 0 or n > 1 then raise exception 'A parte do prejuízo que vira lucro precisa ficar entre 0 e 1.'; end if;
  ag := p #> '{recuperacao,modos,agressivo}';
  if ag is null then raise exception 'Informe o modo agressivo (um objeto ou null).'; end if;
  if jsonb_typeof(ag) <> 'null' then
    n := (ag ->> 'margem')::numeric; if n is null or n < 0 or n > 2 then raise exception 'O lucro ao fechar a sequência (agressivo) precisa ficar entre 0%% e 200%% da entrada.'; end if;
    n := (ag ->> 'sobrePrejuizo')::numeric; if n is null or n < 0 or n > 1 then raise exception 'A parte do prejuízo que vira lucro (agressivo) precisa ficar entre 0 e 1.'; end if;
  end if;
  t := p #>> '{recuperacao,escada,tipo}';
  if t = 'tabela' then
    if jsonb_typeof(p #> '{recuperacao,escada,degraus}') is distinct from 'array' then raise exception 'A tabela precisa de uma lista de degraus.'; end if;
    qtd := jsonb_array_length(p #> '{recuperacao,escada,degraus}');
    if qtd < 1 or qtd > 30 then raise exception 'A tabela aceita de 1 a 30 degraus.'; end if;
    for d in select value from jsonb_array_elements(p #> '{recuperacao,escada,degraus}') loop
      if d ? 'multiplicador' then n := (d ->> 'multiplicador')::numeric;
        if n is null or n < 1 or n > 50 then raise exception 'Cada multiplicador precisa ficar entre 1 e 50 vezes a entrada base.'; end if;
      elsif d ? 'valor' then n := (d ->> 'valor')::numeric;
        if n is null or n < 0.35 or n > 10000 then raise exception 'Cada valor fixo precisa ficar entre US$ 0,35 e US$ 10.000.'; end if;
      else raise exception 'Cada degrau precisa de um multiplicador ou de um valor fixo.'; end if;
    end loop;
    if (p #>> '{recuperacao,escada,depoisDoUltimo}') not in ('formula', 'repetir', 'parar') then raise exception 'Diga o que fazer depois do último degrau: formula, repetir ou parar.'; end if;
  elsif t is distinct from 'formula' then raise exception 'A escada precisa ser "formula" ou "tabela".'; end if;
  n := (p #>> '{limites,valorMaximoPorEntrada}')::numeric;
  if n is null or n < 0 or (n > 0 and n < 0.35) or n > 50000 then raise exception 'O teto por entrada precisa ser 0 (sem teto) ou um valor entre US$ 0,35 e US$ 50.000.'; end if;
  palm := p -> 'palm';
  if palm is not null and jsonb_typeof(palm) <> 'null' then
    if (palm ->> 'janela')::numeric is distinct from 25 then raise exception 'A janela do The Palm é fixa em 25 dígitos nesta versão.'; end if;
    n := (palm ->> 'limiteBaixos')::numeric; if n is null or n < 0 or n > 100 then raise exception 'O mínimo de 0 a 4 precisa ficar entre 0%% e 100%%.'; end if;
    n := (palm ->> 'retornoInicial')::numeric; if n is null or n < 0.5 or n > 1.5 then raise exception 'O retorno presumido do Under 5 precisa ficar entre 0,50 e 1,50.'; end if;
    n := (palm ->> 'desconto')::numeric; if n is null or n < 0.8 or n > 1 then raise exception 'A segurança do payout do The Palm precisa ficar entre 0,80 e 1,00.'; end if;
    n := (palm ->> 'margem')::numeric; if n is null or n < 0 or n > 2 then raise exception 'O lucro ao fechar do The Palm precisa ficar entre 0%% e 200%%.'; end if;
  end if;
end $$;
