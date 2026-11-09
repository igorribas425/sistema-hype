# CLONAGEM SEGURA — status de 09/11/2026

## Confirmado
- Código original da HYPE preservado no commit 720f2a64be5b52ef84fa066ef90d63a2a03fd0d0.
- Backup de referência do código em backup/hype-frozen-2026-11-09.
- Branch isolada de desenvolvimento criada a partir da HYPE.
- CNAME da HYPE retirado.
- Scripts de isolamento carregados nas 23 páginas HTML.
- Referências diretas conhecidas ao domínio e banco da HYPE reendereçadas ou bloqueadas.
- Push desativado enquanto não houver configuração separada.
- Nenhuma modificação no banco Supabase da HYPE, seus 38 tabelas e 28 funções.
- Nenhum deploy de produção trocado.

## Pendente — não homologado
- Conferir todas as rotas do admin, compra, cliente, lista, promoter, menor, venda manual, financeiro e portaria.
- Isolar pagamentos Asaas (credenciais e webhook próprios), Brevo (remetente/domínio e templates próprios) e QR Code/check-in.
- Conferir RLS e privilégios de funções do Supabase.
- Comparar o código do GitHub com as 28 Edge Functions ativas da HYPE; várias funções de produção não existem no repositório.
- Testar cadastro e selfie/documento do menor em iPhone/Android, aprovação, envio de e-mails e QR único.
- Validar venda paga somente com sandbox/homologação sem dinheiro real.
- Não importar CPF, fotos, autorização, dados financeiros, clientes ou credenciais da HYPE.
- Não usar o clone em produção antes de passar testes end-to-end e ter backup real do banco e Storage.

## Checklist mínimo de aceitação
- [ ] ADM autentica e autoriza somente a equipe da própria casa.
- [ ] Venda de ingresso e Pix não utilizam Asaas da HYPE.
- [ ] Lista free e promoter são criadas, aprovadas e refletem no ADM.
- [ ] Menores: captura, documentação, revisão e check-in isolados.
- [ ] Brevo envia confirmação com identidade e links corretos.
- [ ] QR: duplicação rejeitada; pesquisa CPF/nome e registro de entrada.
- [ ] Relatórios e histórico por casa conferem com financeiro.
- [ ] Android/iOS, versões em cache e links antigos testados.
- [ ] Segurança RLS + funções públicas inspecionadas.
- [ ] HYPE original sem mudanças confirmada.

**Estado:** CÓDIGO CLONADO / INTEGRAÇÕES AINDA NÃO HOMOLOGADAS. Não conectar produção.

## Situação MALIBU
- Módulo de autorização publicado em malibu-menores.vercel.app (site antigo não modificado).
- O arquivo de configuração deste clone usa um host inválido intencionalmente, porque o banco próprio da Malibu ainda não foi criado/aprovado.
- Antes de pagamentos ou cadastros reais, é obrigatório configurar projeto Supabase próprio e segredos externos.
