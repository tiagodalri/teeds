-- Nenhum e-mail sai para as contas importadas da base de leads antes do
-- disparo oficial.
--
-- Em 11/09/2026 a base consolidada de leads foi cadastrada como clientes da
-- Teeds, com senha provisória e sem aviso nenhum: o combinado é que essas
-- pessoas só fiquem sabendo pelo disparo que o Tiago vai fazer depois. As
-- contas nascem já confirmadas, então o cadastro em si não gera e-mail. Mas
-- a partir de agora a conta existe, e um "esqueci minha senha" digitado por
-- qualquer um com aquele endereço faria o Supabase mandar um e-mail.
--
-- Esta trava cobre isso. O aviso de conta importada continua indo para a
-- fila (fica registrado), mas já nasce com 5 tentativas — o carteiro do
-- servidor só pega o que tem menos de 5. Clientes que não vieram da
-- importação seguem exatamente como antes.
--
-- Para liberar no dia do disparo: voltar a função ao corpo original
-- (insert simples) e apagar da fila as linhas seguradas.
create or replace function public.teeds_enfileirar_email(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(event->'user'->'app_metadata'->>'importacao', '') <> '' then
    insert into public.emails_pendentes (aviso, tentativas, ultimo_erro)
    values (event, 5, 'segurado: conta importada, aguardando o disparo oficial');
  else
    insert into public.emails_pendentes (aviso) values (event);
  end if;
  return '{}'::jsonb;
end;
$$;

revoke execute on function public.teeds_enfileirar_email(jsonb) from public, anon, authenticated;
grant execute on function public.teeds_enfileirar_email(jsonb) to supabase_auth_admin;

comment on function public.teeds_enfileirar_email(jsonb) is
  'Gancho "Send Email" do Supabase Auth. Não manda nada: põe na fila para o servidor mandar com a marca certa. Contas importadas (app_metadata.importacao) ficam seguradas até o disparo oficial.';
