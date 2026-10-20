-- 20/10/2026: "iniciou / encerrou" tem que aparecer na hora para os GF
-- Members (o Tiago encerrou e o "ao vivo" seguiu aceso por segundos). A
-- tabela treino_no_ar passa a avisar pelo Realtime; a plataforma do membro,
-- ao ouvir qualquer mudança, pergunta de novo a teeds_treino_agora (que é
-- quem decide). Ler a tabela: só quem pode estar na sala de treino da marca.
drop policy if exists "membro ve treino no ar" on public.treino_no_ar;
create policy "membro ve treino no ar" on public.treino_no_ar
  for select to authenticated using (public.teeds_minha_sala_de_treino(marca));
grant select on public.treino_no_ar to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'treino_no_ar') then
    alter publication supabase_realtime add table public.treino_no_ar;
  end if;
end $$;
