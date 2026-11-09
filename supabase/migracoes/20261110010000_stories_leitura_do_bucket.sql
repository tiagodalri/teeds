-- 09/11/2026: o primeiro envio real (iPhone do Tiago) falhou com "new row violates row-level security policy".
-- O Storage grava o arquivo e lê a linha de volta (INSERT ... RETURNING), o que exige a política de leitura.
-- A pasta das aulas tinha ("qualquer um assiste"); a dos stories ficou sem. O bucket já é público.
drop policy if exists "stories: qualquer um assiste" on storage.objects;
create policy "stories: qualquer um assiste" on storage.objects for select to public using (bucket_id = 'stories');
