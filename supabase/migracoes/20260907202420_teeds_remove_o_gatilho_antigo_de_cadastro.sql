-- O cadastro continuava quebrado — por um gatilho que eu nao tinha visto.
--
-- Mais cedo hoje consertei `teeds_novo_cliente` (a chave de clientes virou
-- pessoa+marca e o `on conflict (user_id)` dele quebrou). Mas havia um
-- SEGUNDO gatilho na criacao de usuario, mais antigo, fazendo a mesma coisa
-- com a mesma chave velha: `teeds_novo_usuario` -> registrar_novo_usuario().
-- Dois gatilhos, um consertado e um nao, e o cadastro falha do mesmo jeito,
-- com a mesma mensagem generica ("Database error saving new user").
--
-- Eu testei a instrucao consertada em vez de testar um cadastro real, e
-- por isso dei o problema por resolvido. Desta vez o teste e o caminho
-- inteiro (ver a migracao seguinte).
--
-- O gatilho velho tambem promovia a administrador, automaticamente, quem
-- se cadastrasse com um de tres e-mails escritos no codigo. Isso e uma
-- porta: bastaria alguem criar conta com um daqueles enderecos para virar
-- admin. Administrador se cria pela tabela, de proposito — nao por e-mail.
drop trigger if exists teeds_novo_usuario on auth.users;
drop function if exists public.registrar_novo_usuario();
