# Lista HYPE com foto e aprovacao

## Objetivo

Permitir que o publico se candidate para a Lista HYPE com foto e Instagram. O Admin analisa cada cadastro e decide quem entra. O limite inicial e de 10 homens aprovados por evento. Nenhum e-mail e enviado no cadastro; o Gmail so e enviado depois da aprovacao.

## Fluxo do publico

1. O formulario exige nome completo, CPF, WhatsApp, genero, e-mail, Instagram, foto e consentimento para uso da foto na analise da lista.
2. O envio cria um registro com status `Pendente` para o evento liberado.
3. O cadastro pendente nao aparece na Portaria e nao conta como entrada liberada.
4. O formulario informa que o cadastro esta em analise, sem enviar Gmail.

## Fluxo do Admin

1. A aba de link da lista permite configurar o limite masculino, com valor inicial 10.
2. A lista administrativa mostra foto privada, nome, genero, Instagram, e-mail, CPF, WhatsApp e horario do cadastro.
3. O Admin pode aprovar ou recusar cada cadastro.
4. A aprovacao masculina e atomica: o banco conta homens `Liberado` no evento e recusa a aprovacao quando o limite ja foi atingido.
5. Ao aprovar, o status vira `Liberado`, o registro passa a aparecer na Portaria e a Edge Function envia um Gmail com a capa e os dados do evento.
6. Ao recusar, o cadastro fica `Cancelado`, nao aparece na Portaria e nenhum Gmail e enviado.

## Dados e seguranca

- `guest_list_simple_v406` recebe e-mail, Instagram, caminho da foto, consentimento, status de revisao, revisor e data da revisao.
- O status aceita `Pendente`, `Liberado`, `Entrou` e `Cancelado`.
- As fotos ficam em bucket privado do Supabase Storage; o Admin recebe URL assinada de curta duracao.
- Portaria nunca recebe fotos nem registros `Pendente`.
- Nao sera criado reconhecimento facial automatico nem armazenamento de templates biometricos nesta etapa.
- A funcao publica valida tamanho, tipo e dimensao da imagem e impede acesso publico ao arquivo.

## E-mail

- A Edge Function existente ganha uma acao de lista aprovada.
- O Apps Script/Gmail recebe somente aprovados e envia a capa do evento, nome, evento, data, local e confirmacao de entrada na lista.
- O registro guarda `email_sent_at` apenas apos retorno positivo do Apps Script.
- Falha no Gmail nao desfaz a aprovacao; o Admin mostra que o envio falhou e oferece reenvio.

## Testes de aceite

- Cadastro com foto e Instagram cria `Pendente` e nao envia Gmail.
- Admin visualiza foto/Instagram e aprova um cadastro.
- Aprovacao envia Gmail, marca `email_sent_at` e torna o nome visivel na Portaria.
- O 11o homem nao pode ser aprovado quando o limite e 10.
- Cadastro feminino nao consome o limite masculino.
- Recusados nao aparecem na Portaria e nao recebem Gmail.
- Storage continua privado e a Portaria nao recebe URL de foto.
