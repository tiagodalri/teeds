-- 20/10/2026: "Meu Perfil" e o tour guiado.
--
-- Perfil: endereço com CEP e foto na ficha (clientes). O CPF, depois de
-- preenchido, só muda pelo suporte (admin). O e-mail da ficha acompanha a
-- troca de e-mail do login (depois de confirmada pelos links).
-- Tour: tour_visto_em marca quando a pessoa terminou o tour obrigatório.

alter table public.clientes
  add column if not exists end_cep text,
  add column if not exists end_rua text,
  add column if not exists end_numero text,
  add column if not exists end_complemento text,
  add column if not exists end_bairro text,
  add column if not exists end_cidade text,
  add column if not exists end_uf text,
  add column if not exists foto_url text,
  add column if not exists tour_visto_em timestamptz;

-- CPF: a pessoa preenche uma vez; corrigir depois é com o suporte.
create or replace function public.teeds_proteger_cpf()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.role() = 'authenticated' and not public.teeds_sou_admin_da(new.marca)
     and coalesce(old.cpf, '') <> '' and new.cpf is distinct from old.cpf then
    raise exception 'O CPF já está cadastrado. Para corrigir, fale com o suporte.';
  end if;
  return new;
end $function$;
drop trigger if exists proteger_cpf on public.clientes;
create trigger proteger_cpf before update on public.clientes
  for each row execute function public.teeds_proteger_cpf();

-- A troca de e-mail confirmada chega na ficha (sempre o endereço de verdade).
create or replace function public.teeds_email_da_ficha()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.email is distinct from old.email then
    update public.clientes set email = public.teeds_email_real(new.email)
     where user_id = new.id and marca = public.teeds_marca_da_conta(new.email);
  end if;
  return new;
end $function$;
drop trigger if exists teeds_email_da_ficha on auth.users;
create trigger teeds_email_da_ficha after update of email on auth.users
  for each row execute function public.teeds_email_da_ficha();

-- Fotos de perfil: leitura pública (aparecem no menu e no perfil); cada um
-- grava só na própria pasta (<user_id>/...). Até 2 MB, só imagem.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

drop policy if exists "avatar: cada um na sua pasta (gravar)" on storage.objects;
create policy "avatar: cada um na sua pasta (gravar)" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar: cada um na sua pasta (trocar)" on storage.objects;
create policy "avatar: cada um na sua pasta (trocar)" on storage.objects for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatar: cada um na sua pasta (apagar)" on storage.objects;
create policy "avatar: cada um na sua pasta (apagar)" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
