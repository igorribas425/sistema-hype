HYPE // SISTEMA DE INGRESSOS - VERSAO PROFISSIONAL

ARQUIVOS
- cliente.html: compra de ingresso, PIX e ingresso com QR Code.
- admin.html: dashboard, lotes, estoque, pagamentos, cancelamentos, equipe e exportacao CSV.
- portaria.html: busca por nome/telefone/ID, leitura de QR Code e registro de entrada unica.
- app.js: logica compartilhada.
- style.css: arquivo CSS original fornecido no projeto. As paginas possuem estilos proprios e nao dependem dele.

ACESSOS PADRAO
- Admin: usuario admin | senha Hype@2026
- Portaria: usuario portaria | senha portaria2026

FUNCOES NOVAS
- Limite de ingressos por lote (0 = ilimitado).
- Contagem de vendidos/disponiveis.
- Lote esgotado bloqueia a compra.
- Dashboard com pagos, pendentes, caixa, entradas e cancelados.
- Cancelamento/reabertura de ingresso.
- Registro de horario de entrada e bloqueio de segunda entrada.
- QR Code individual do ingresso no formato HYPE|ID.
- Leitura QR pela camera quando suportada pelo navegador.
- Busca de portaria por nome, telefone ou ID.
- Cadastro de usuarios da equipe: admin, caixa e portaria.
- Exportacao CSV dos ingressos.

IMPORTANTE
Este projeto continua usando localStorage/sessionStorage, sem banco de dados. Portanto os dados nao ficam sincronizados entre computadores/celulares diferentes. Para operar uma portaria com varios aparelhos ao mesmo tempo, sera necessario um backend/banco compartilhado.

COMO ABRIR
1. Coloque todos os arquivos na mesma pasta.
2. Abra cliente.html para compras, admin.html para gestao e portaria.html para a entrada.
3. Para a camera QR, use HTTPS/localhost e permita o acesso a camera.
