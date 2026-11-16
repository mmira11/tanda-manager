-- Review fixes for the live project. Safe to run more than once in the SQL editor.
-- Fresh installs already include this in supabase/schema.sql.

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, PUBLIC;

revoke execute on all functions in schema public from PUBLIC;
revoke execute on all functions in schema public from anon;

grant execute on function public.get_member_board(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
