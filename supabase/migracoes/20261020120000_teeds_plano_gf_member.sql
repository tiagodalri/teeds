-- 20/10/2026: o plano da sala de treino passa a se chamar "GF Member".
-- O id continua 'treino' (as funções teeds_minha_sala_de_treino e a função
-- live-token procuram por ele). Só GF Member e admin entram na sala de
-- treino; o link público das lives não vale para ela (live-token v7).
update public.planos set nome = 'GF Member' where id = 'treino';
