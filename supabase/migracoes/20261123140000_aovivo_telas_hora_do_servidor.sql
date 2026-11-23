-- 23/11/2026 (revisão): a hora e o autor de cada gravação das telas saem do banco, não do
-- relógio do computador (um relógio atrasado fazia a mudança de um admin ser ignorada).
-- E o bucket `aovivo` deixa de ser listável por qualquer um: as URLs públicas continuam
-- abrindo (bucket público), mas ninguém mais lista os arquivos.

create or replace function public.aovivo_telas_carimbo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := clock_timestamp();
  new.atualizado_por := auth.uid();
  return new;
end $$;

drop trigger if exists aovivo_telas_carimbo on public.aovivo_telas;
create trigger aovivo_telas_carimbo before insert or update on public.aovivo_telas
for each row execute function public.aovivo_telas_carimbo();

drop policy if exists "aovivo: qualquer um vê" on storage.objects;
