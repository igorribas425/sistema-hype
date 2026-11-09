# MALIBU — cópia de trabalho do sistema HYPE

Base preservada: 720f2a64be5b52ef84fa066ef90d63a2a03fd0d0.
Não utilizar como produção antes de testes completos.

- Main da HYPE: intacta.
- Branch do clone: clone/malibu-hype-base-2026-11-09.
- Supabase: AINDA NÃO CONFIGURADO — host inválido intencionalmente.
- Script clone-isolation.js bloqueia tráfego do navegador a domínios da HYPE.
- Configuração do push desligada.
- CNAME da HYPE removido desta branch.
- NÃO importar clientes, CPF, fotos, documentos, credenciais ou dados de pagamentos da HYPE.
- Pendente: revisão do código e reescrita dos endpoints, funções, CORS, callback Asaas, Brevo, autenticação, segurança, pagamentos e portaria; executar testes antes de apontar domínios.
- Nenhuma chave secreta de Asaas, Brevo ou service_role deve ser colocada neste repositório público.
