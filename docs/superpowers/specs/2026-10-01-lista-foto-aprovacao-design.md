# Lista HYPE com foto e aprovacao

## Objetivo

Permitir que o publico se candidate para a Lista HYPE com foto e Instagram. O Admin analisa cada cadastro e decide quem entra. O limite inicial e de 10 homens aprovados por evento. Nenhum e-mail e enviado no cadastro; o Gmail so e enviado depois da aprovacao.

## Fluxo do publico

1. O link permanente mostra as festas ativas e a pessoa escolhe sexta, sabado ou outro evento liberado antes do formulario.
2. O formulario exige nome completo, CPF, WhatsApp, genero, e-mail, Instagram, foto e consentimento para uso da foto na analise da lista.
3. O envio cria um registro com status `Pendente` vinculado ao evento escolhido.
4. O cadastro pendente nao aparece na Portaria e nao conta como entrada liberada.
5. O formulario informa que o cadastro esta em analise, sem enviar Gmail.

## Fluxo do Admin

1. A aba de link da lista mostra cada evento ativo e permite liberar/bloquear o cadastro e configurar o limite masculino por evento, com valor inicial 10.
2. A lista administrativa mostra foto privada, nome, genero, Instagram, e-mail, CPF, WhatsApp e horario do cadastro.
3. O Admin pode aprovar ou recusar cada cadastro.
4. A aprovacao masculina e atomica por evento: o banco conta homens `Liberado` na festa escolhida e recusa a aprovacao quando o limite daquele evento ja foi atingido.
5. Ao aprovar, o status vira `Liberado`, o registro passa a aparecer na Portaria e a Edge Function envia um Gmail com a capa e os dados do evento.
6. Ao recusar, o cadastro fica `Cancelado`, nao aparece na Portaria e nenhum Gmail e enviado.

## Dados e seguranca

- `guest_list_simple_v406` recebe e-mail, Instagram, caminho da foto, consentimento, status de revisao, revisor e data da revisao.
- A configuracao publica passa a ser por evento, permitindo que o mesmo link apresente varias festas ativas.
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
- O mesmo link apresenta duas festas e grava cada candidatura no evento escolhido.
- Admin visualiza foto/Instagram e aprova um cadastro.
- Aprovacao envia Gmail, marca `email_sent_at` e torna o nome visivel na Portaria.
- O 11o homem nao pode ser aprovado quando o limite e 10.
- Cadastro feminino nao consome o limite masculino.
- O limite de homens de uma festa nao altera o limite da outra.
- Recusados nao aparecem na Portaria e nao recebem Gmail.
- Storage continua privado e a Portaria nao recebe URL de foto.
