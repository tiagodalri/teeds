-- O rádio do monitoramento (13/11/2026): quem pode OUVIR os canais privados
-- de Broadcast que o servidor transmite (servidor/src/radio.ts).
--
-- Até aqui o Realtime RELIA cada gravação do espelho (WAL) e conferia a RLS
-- de cada admin, linha a linha — metade do trabalho do banco num dia calmo e
-- o que travou o play na live de 12/11. Com o rádio, esta regra é conferida
-- UMA vez, quando a tela entra no canal.
--
--   espelho:<marca>             admin geral da marca (teeds_marcas_admin_total)
--   espelho:<marca>:<parceiro>  quem tem o escopo '<marca>:<parceiro>' ('-' = direto)
--   espelho-sessao:<uuid>       quem vê aquela sessão (marca inteira ou o escopo do parceiro)
--
-- Só leitura (SELECT): ninguém do navegador transmite; o servidor usa a chave de serviço.

create policy "admin ouve o radio do espelho" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (
      case split_part((select realtime.topic()), ':', 1)
        when 'espelho' then
          (split_part((select realtime.topic()), ':', 3) = ''
            and split_part((select realtime.topic()), ':', 2) = any ((select public.teeds_marcas_admin_total())::text[]))
          or (split_part((select realtime.topic()), ':', 3) <> ''
            and (split_part((select realtime.topic()), ':', 2) = any ((select public.teeds_marcas_admin_total())::text[])
              or split_part((select realtime.topic()), ':', 2) || ':' ||
                 case split_part((select realtime.topic()), ':', 3) when '-' then '' else split_part((select realtime.topic()), ':', 3) end
                 = any ((select public.teeds_escopos())::text[])))
        when 'espelho-sessao' then
          exists (
            select 1 from public.sessoes_robos s
            left join public.clientes c on c.user_id = s.user_id and c.marca = s.marca
            -- o CASE protege o cast: tópico que não é uuid não vira erro, vira "não"
            where s.id = case when split_part((select realtime.topic()), ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                              then (split_part((select realtime.topic()), ':', 2))::uuid end
              and (s.marca = any ((select public.teeds_marcas_admin_total())::text[])
                or s.marca || ':' || coalesce(s.parceiro, c.parceiro, '') = any ((select public.teeds_escopos())::text[])))
        else false
      end
    )
  );
