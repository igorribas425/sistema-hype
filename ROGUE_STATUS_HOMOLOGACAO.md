# Rogue — integração progressiva e homologação (09/11/2026)

## Proteção da Hype
- Produção Hype e branch `main`: sem alterações por este trabalho.
- Os clones usam branches e projetos Vercel separados, protegidos por SSO.
- Nenhum dado real da Hype foi importado, excluído ou copiado.

## Estado verificado do Supabase Rogue
- Projeto: `etxvkvdsnqqdkonvbgzf` (Rogue Lounge Ingressos).
- 42 tabelas públicas e 144 nomes de funções SQL em `public` (Hype tem 38 tabelas e 182 nomes de funções).
- Rogue: 12 Edge Functions ativas; Hype: 28. Diferenças precisam ser mapeadas por função, não copiadas automaticamente.
- 1 evento ativo já cadastrado, com data 07/11/2026 (encerrado na data da auditoria), 1 ingresso no banco, 0 contas em `staff_users`.
- `verify_staff`, `staff_list_events`, `staff_list_tickets` e funções administrativas não permitem execução de `anon` nem `authenticated`. Isto é mais seguro que abrir publicamente, mas impede o login legado do clone.
- `public_events_v13` e `public_lots_by_event_v16` são funções `STABLE` acessíveis ao papel anônimo: podem ser usadas com GET para consultar somente o catálogo público.

## Implementação feita sem ativar pagamentos
- O cliente clonado da Rogue consulta apenas eventos e lotes públicos por GET, sem apresentar formulário de compra.
- Scripts de bloqueio do clone ainda impedem POST/PUT/DELETE no Supabase e pagamentos.
- Cartão de menores da Malibu removido do ADM da Rogue, preservando apenas o módulo de menores da própria casa.
- Prévia ADM ilustrativa continua separada do ADM verdadeiro; não é login real.

## Bloqueadores antes de operar
1. Criar autenticação e autorização seguras para a equipe Rogue, sem reaproveitar senha Hype e sem expor `SECURITY DEFINER` publicamente.
2. Revisar privilégios de todos os RPCs administrativos e permissões RLS (verificar avisos do Supabase Security Advisor).
3. Integrar aprovações de lista FREE/promoters e menores às Edge Functions e tabelas da Rogue, sem chamar serviços da Hype.
4. Conferir o fluxo de Pix e webhook do Asaas; só habilitar cobranças após verificar credenciais da casa e conciliação.
5. Configurar remetentes e templates Brevo da Rogue; testar entrega de QR e correção de links.
6. Testar check-in com QR duplicado e portaria Android/iOS; backup/rollback e checklist pós-teste.

**Não homologado para vendas reais.** Não utilizar links de preview em convites ou pagamentos.
