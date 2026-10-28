# HYPE — Envio de autorizações de menores (Resend)

Atualizado em 28/10/2026. O método ativo para e-mails de menores é **Resend**, independentemente do Google Apps Script antigo.

## Funcionamento
- O Admin aprova ou recusa a autorização.
- A função `hype-minor-notify` gera o PDF completo quando o cadastro é aprovado, incluindo fotos, documentos, assinatura e QR Code.
- A função `hype-minor-email` (versão 8 no Supabase) envia pelo Resend para os endereços do responsável e do adolescente.
- Aprovados: PDF anexado aos e-mails. Recusados: notificação sem PDF.
- A aceitação do provedor é registrada em `email_notified_at`. Falhas ficam em `email_notification_error`; aceitar o envio não comprova recebimento na caixa de entrada.
- Os documentos originais e a autorização continuam sendo verificados presencialmente. Autorização não é ingresso e não libera entrada automaticamente.

## Configuração
A função usa os mesmos segredos Resend já utilizados no envio dos ingressos:
- `RESEND_API_KEY` (com alternativa legada `HYPE_RESEND_API_KEY`)
- `RESEND_FROM_EMAIL` (com alternativa `HYPE_NOTIFICATION_FROM`)

Configure e confira esses segredos somente em **Supabase > Edge Functions > Secrets**. O endereço remetente deve pertencer a um domínio verificado no Resend. Não publique credenciais no repositório, em páginas HTML ou em mensagens.

A função aceita chamadas internas autenticadas com `SUPABASE_SERVICE_ROLE_KEY`. Não acesse nem exponha esta chave no navegador.

## Teste e reenvio
1. Abra Admin > Menores de idade.
2. Utilize o fluxo de teste fictício ou um cadastro autorizado e conferido. Verifique o destinatário antes de iniciar.
3. Confira no Admin a confirmação de envio e no Resend os eventos de aceitação, entrega ou rejeição.
4. Os erros antigos não são reenviados automaticamente. Para reenvio manual, confira primeiro ambos os endereços, especialmente os que foram devolvidos.

## Código e legado
Código atual: `supabase/functions/hype-minor-email/index.ts`.

O antigo `integrations/hype-minor-gmail.gs` continua no repositório só para histórico. **A função de envio de menores não faz chamadas ao Gmail Apps Script e não usa mais a cota diária do Gmail.** Não apague o script de ingressos, pois ele é independente.
