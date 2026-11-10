# Acesso administrativo Rogue — 09/11/2026

- E-mail designado: rogue@gmail.com
- Banco: Supabase Rogue `etxvkvdsnqqdkonvbgzf`. A Hype não foi alterada.
- Nova tabela privada `rogue_internal.admin_allowlist`, com RLS habilitado e sem permissões para papéis de navegador.
- Entrada reservada com `active=false` e `auth_user_id=NULL`. **Nenhum administrador foi ativado.**
- RPC `public.rogue_admin_access_v1()` só retorna verdadeiro após login Supabase, e-mail confirmado e vinculação explícita de UUID à lista privada. Apenas papel `authenticated` pode consultá-la.
- Página `acesso-rogue.html`: cadastro e login por Supabase Auth, senha inserida pelo usuário no site; não divulga senhas no código.
- `admin.html` aponta para a página de acesso, mas o ADM de produção permanece não operacional; não liberar pagamentos, clientes ou ingressos.
- URL de redirecionamento da autenticação precisa estar na allowlist em **Supabase Auth > URL Configuration**; testar recebimento da confirmação antes de ativar a conta.
- Após a confirmação, verificar em `auth.users` que o e-mail `rogue@gmail.com` está confirmado; vincular o UUID verificado à allowlist privada em mudança controlada, sem habilitar antigas funções administrativas indiscriminadamente.
- As funções antigas `verify_staff` e `staff_*` continuam com permissões restritas. A Hype e Malibu não foram alteradas.
