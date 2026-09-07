-- A mesma conta da corretora pode ser usada por mais de um login na mesma plataforma.
--
-- Mais cedo hoje a regra virou "uma conta Deriv, um dono POR PLATAFORMA". Ela
-- barrou o proprio Tiago: logado na Teeds com um segundo e-mail, tentou operar
-- com a conta que ja estava ligada ao primeiro e-mail, e o servidor recusou
-- com "conecte a Deriv por aqui uma vez" — sem jeito de resolver, porque a
-- ligacao era recusada em silencio pelo banco.
--
-- A regra protegia contra alguem apontar a conta de outra pessoa para si. Mas
-- essa protecao nunca esteve nesta tabela: quem prova que a conta e sua e a
-- autorizacao feita na Deriv, e o servidor so opera com o token do proprio
-- login — token que nao alcanca conta alheia. A linha aqui e um espelho para
-- a tela e para os relatorios, nao a fronteira de seguranca.
--
-- Fica valendo a chave (login, conta, marca): cada login ve as proprias
-- operacoes; a mesma conta pode aparecer em mais de um login.
alter table public.contas_deriv drop constraint if exists contas_deriv_conta_por_marca;

comment on table public.contas_deriv is
  'Contas da corretora ligadas a cada login, por plataforma. A mesma conta pode estar em mais de um login e em mais de uma plataforma; quem prova a posse e a autorizacao na Deriv.';
