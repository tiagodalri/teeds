-- 21/10/2026: trocar a foto do perfil (upsert) exige, além de gravar e
-- atualizar, poder LER o próprio arquivo pela API do armazenamento. Sem esta
-- regra a primeira foto subia e a troca falhava. Cada um só lê a própria pasta
-- (a URL pública da foto continua servida pelo bucket público).
create policy "avatar: cada um na sua pasta (ler)"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = (select auth.uid())::text);
