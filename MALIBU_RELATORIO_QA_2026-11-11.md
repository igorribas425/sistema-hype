# Malibu Lounge — Auditoria pré-Supabase (11/11/2026)

> Status: **homologação visual/isolada**, não pronta para receber vendas ou dados reais. Não iniciar cobrança, check-in ou emissão de QR Code.

## Escopo
- Branch isolada: `clone/malibu-hype-base-2026-11-09`.
- Referência visual: módulo ADM V95 da Hype, sem importar banco, clientes ou pagamentos.
- Publicação verificada (READY): `malibu-hype-clone-preview-mvq12ko4c-igorribas425-1920.vercel.app`, commit `cfa8b125285d90625634a5c55a87fb9b1271bba4`.
- Revisões locais posteriores no GitHub: `clone-brand.js` e `clone-isolation.js`, **ainda não publicadas** devido ao limite diário de deploys da Vercel (HTTP 402 `api-deployments-free-per-day`).
- A Vercel exige autenticação para o ambiente de prévia.

## Resultados verificados
1. **Central ADM:** 12 cartões e 12 seções correspondentes; abertura de cada seção, isolamento entre abas e retorno ao início verificados com um DOM simulado (não substitui teste visual em navegador).
2. **Eventos locais:** gravação em localStorage, rejeição de nome curto e preço negativo, exclusão de rascunho e exportação JSON executadas com dados fictícios. Sem gravação no Supabase.
3. **Segurança da versão em código:** bloqueados POST, XHR, sendBeacon, submissão de formulário, leitura/escrita em qualquer Supabase, chamada Pix/Asaas, abertura externa de WhatsApp/checkout e navegação ao domínio Hype. O link atual do formulário `malibu-menores.vercel.app` foi preservado.
4. **Páginas HTML:** 24 rotas existentes verificadas. Nas páginas públicas, o script de isolamento aparece antes dos scripts comerciais; `admin.html` e `admin-demo.html` são prévias independentes sem backend.
5. **Arquivos:** referências locais das principais páginas de compra, clientes, listas, promoters, menores, portaria e leitor não apresentam caminhos ausentes. Scripts JavaScript inline inspecionados passaram na verificação de sintaxe.
6. **Ambientes:** nenhum banco Supabase foi criado, reativado ou alterado. Hype, Rogue e Açaí não foram modificados neste trabalho.

## Estado dos 12 módulos

| Módulo | Testado | Próximo passo para operação |
| --- | --- | --- |
| Financeiro | Navegação/visual | Pedidos, extrato, conciliação, devoluções e permissões |
| Promoters | Navegação/link | Cadastro seguro, link individual, ranking |
| Lista FREE | Navegação/link | Selfie, aprovação, e-mail, QR |
| Lista/Promoter | Navegação/link | Convite, selfie, aprovação, QR, check-in |
| Portaria | Navegação/link | Câmera iOS/Android, consulta, QR de uso único |
| Clientes | Navegação/visual | Busca, histórico e isolamento de dados |
| Cadastros | Navegação/visual | Histórico, frequência e bloqueios |
| Eventos & Lotes | Rascunho **local** testado | Persistência real, lotes, preços, publicação |
| Avaliações | Navegação/visual | Feedback após saída |
| Sorteio & Acessos | Navegação/visual | Roles e controle de dispositivos |
| Menores | Navegação/link existente | Autorização, validação de documentos, PDF/e-mail |
| Vendas manuais | Navegação/link | Solicitação, confirmação ADM, geração de ingresso |

## Testes que **não** podem ser considerados aprovados
- Fluxo completo real de venda, Pix/Asaas, aprovação manual, emissão e reenvio de ingresso.
- Dados reais de promoters, lista FREE, menores, Brevo/PDF, portaria, antifraude/duplicidade e financeiro.
- Teste visual humano em iPhone/Android; câmera, selfie, permissão, Safari e rede.
- Validação de segurança de RLS, autenticação, registro financeiro e webhooks da **Malibu** — dependem do banco exclusivo.
- Nova publicação dos últimos ajustes da branch: bloqueada pela cota diária da Vercel. **Não confundir código revisado com código já publicado.**

## Mudanças seguras realizadas
- `admin.html`: central V95 com módulos isolados e seção Eventos com rascunhos locais.
- `malibu-admin-preview.js`: navegação + rascunhos offline, sem APIs.
- `clone-brand.js`: aviso de homologação nas páginas públicas (ainda aguardando publicação).
- `clone-isolation.js`: bloqueio explícito de escrita em qualquer destino, submissão nativa e saída para pagamentos/WhatsApp externos na prévia (ainda aguardando publicação).

## Critério para habilitar operação
1. Conectar um banco **exclusivo Malibu**, com backup do projeto escolhido e sem importar dados pessoais da Hype.
2. Instalar esquema, RLS e Supabase Auth próprios; testar autorização por função.
3. Validar evento/lotes → compra → pagamento (homologação) → confirmação → QR → portaria → relatório; também listas, promoters, menores, fotos, PDF e e-mails.
4. Publicar uma versão separada para testes, confirmar build READY e testar Android e iPhone.
5. Obter autorização para abrir venda real. Nunca colocar a prévia visual como bilheteria em produção.

**Conclusão:** estrutura e bloqueios passaram nas simulações indicadas; a Malibu **não** está homologada ponta a ponta sem backend.
