HYPE - PRONTO PARA GITHUB PAGES

Suba todos os arquivos desta pasta para a raiz do seu repositório GitHub.

Páginas:
- index.html = compra de ingressos
- admin.html = painel administrativo
- evento.html = alterar artista/capa do evento
- portaria.html = validação de ingressos

O Supabase já está configurado em supabase-config.js.
Não publique arquivos SQL, service_role, senha do banco ou chave secreta.

No GitHub Pages:
Settings > Pages > Deploy from a branch > main > /(root)


ATUALIZAÇÃO DE PREÇOS
---------------------
No Admin agora existe o bloco "CRIAR / ADICIONAR INGRESSO".
Você pode criar Pista, VIP, Camarote ou qualquer outro ingresso e definir o preço.
Os ingressos existentes aparecem abaixo com o campo PREÇO e o botão SALVAR LOTE.
Não precisa executar SQL novo para esta atualização.


BRANDING HYPE LOUNGE CLUB
-------------------------
- Nome visual atualizado para HYPE LOUNGE CLUB.
- Logo adicionada como logo-hype.png.
- Tema principal atualizado para preto, branco e prata/cinza.
- Funções do Supabase, ingressos, Admin e Portaria foram mantidas.
- Não é necessário executar SQL novo.


PREÇOS POR GÊNERO
-----------------
1. Execute ATUALIZACAO_PRECOS_GENERO.sql UMA VEZ no SQL Editor do Supabase.
2. Depois suba os arquivos do site para o GitHub.
3. No Admin, escolha Pista, VIP ou Camarote.
4. Defina Preço Masculino e Preço Feminino.
5. O cliente escolhe o gênero e o site mostra o valor correspondente.
6. A quantidade restante NÃO aparece para o cliente.


CORREÇÃO DE CACHE / PREÇOS POR GÊNERO
--------------------------------------
Versão: 20260830-2110
- Remove definitivamente a lógica antiga de Nome do ingresso.
- Pista / VIP / Camarote são selecionados em lista.
- Masculino e Feminino têm preços separados.
- O botão SALVAR VALORES DO SETOR atualiza o setor se ele já existir.
- app.js, config e logo recebem versão na URL para celulares não usarem cache antigo.
- O preço da página de venda muda quando o gênero é alterado.


SETORES SELETIVOS
-----------------
Agora o Admin mostra PISTA, VIP e CAMAROTE ao mesmo tempo.
Cada setor tem a opção VENDER.
- Se os 3 estiverem ativos, os 3 aparecem na página de venda.
- Se só 1 estiver ativo, somente ele aparece para o cliente.
- Se 2 estiverem ativos, somente esses 2 aparecem.
Cada setor mantém preço Masculino/Feminino, quantidade e horários.

Execute ATUALIZACAO_SETORES_ATIVOS.sql UMA VEZ no Supabase antes de usar esta versão.
