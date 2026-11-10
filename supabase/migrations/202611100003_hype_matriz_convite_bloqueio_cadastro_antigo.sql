-- HYPE V251.1: impede criar matriz pela RPC pública V49 sem convite.
-- O cadastro V251 e a filial V251 são SECURITY DEFINER e continuam chamando
-- a validação interna da V49. Service role mantém acesso para tarefas internas.
revoke execute on function public.public_promoter_registration_submit_v49(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.public_promoter_registration_submit_v49(text,text,text,text)
  to service_role;
