-- 23/10/2026 (Tiago): Victor Cordeiro e Victor Dias de Avila viram administradores
-- da GlobalFly, com as mesmas permissões do login do Tiago nessa marca.
-- Só na GlobalFly: na Teeds e na OMNI eles não têm cargo nenhum.
insert into public.administradores (user_id, marca)
select u.id, 'globalfly' from auth.users u
where lower(u.email) in ('victooripardo+marca-globalfly@gmail.com', 'avila.victor560+marca-globalfly@gmail.com')
  and not exists (select 1 from public.administradores a where a.user_id = u.id and a.marca = 'globalfly');
