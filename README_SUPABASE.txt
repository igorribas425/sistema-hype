HYPE — VERSÃO COM SUPABASE

ARQUIVOS
- cliente.html — compra de ingressos
- admin.html — dashboard, lotes, pagamentos e equipe
- portaria.html — validação e QR
- app.js — lógica conectada ao Supabase
- supabase-config.js — URL e chave pública
- supabase_schema.sql — tabelas, RLS e funções do banco

CONFIGURAÇÃO
1. Crie um projeto no Supabase.
2. Abra SQL Editor > New query.
3. Cole o conteúdo de supabase_schema.sql e execute.
4. Abra supabase-config.js e coloque a Project URL e a chave publicável/anon.
5. Sirva esta pasta por HTTP/HTTPS (por exemplo Live Server no VS Code). Não abra os HTML pelo file://.
6. Acesse cliente.html.

ACESSOS INICIAIS
Admin: admin / Hype@2026
Portaria: portaria / portaria2026
Troque/desative essas credenciais após configurar o sistema.

COMO FUNCIONA
- Cliente chama create_ticket no banco; estoque é protegido por trava transacional.
- Admin/Caixa confirmam pagamento usando RPC.
- Portaria valida por ticket_code ou qr_token. A liberação é atômica e o mesmo ingresso não pode entrar duas vezes.
- Dados são compartilhados entre dispositivos porque ficam no PostgreSQL do Supabase.
- O frontend faz polling periódico para atualizar a tela.

PIX
O sistema exibe a chave PIX e gera um QR para a chave. Para cobrança PIX real com payload EMV/BR Code completo, use uma integração de cobrança (gateway/API) ou gere o payload correto no backend.

SEGURANÇA
Esta versão usa RPCs SECURITY DEFINER e guarda a senha da equipe na sessionStorage para conseguir autorizar operações sem colocar service_role no navegador. Em produção, a evolução recomendada é migrar a equipe para Supabase Auth + Edge Function para evitar transportar a senha em cada RPC e adicionar rate limiting/2FA. Nunca coloque a service_role key no HTML ou app.js.
