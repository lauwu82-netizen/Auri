-- MBTI en el perfil (tipo y si usa el color del tema en lugar del suyo)
alter table public.profiles add column if not exists mbti text not null default '';
alter table public.profiles add column if not exists mbti_theme boolean not null default false;
alter table public.profiles drop constraint if exists profiles_mbti_check;
alter table public.profiles add constraint profiles_mbti_check check (mbti in ('','INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP'));
