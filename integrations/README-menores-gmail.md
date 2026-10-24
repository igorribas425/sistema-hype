# HYPE — Gmail das autorizações de menores (integração separada)

**Não edite nem substitua o Google Apps Script existente dos ingressos.** Esta integração usa um script NOVO, na mesma conta Gmail.

1. Entre em https://script.google.com/ com a conta Gmail que já usa para enviar os ingressos da Hype. Clique em **Novo projeto**.
2. Nome: **HYPE — Notificações de menores**. Apague apenas o código vazio deste **novo** projeto e cole o arquivo [hype-minor-gmail.gs](./hype-minor-gmail.gs).
3. Em **Configurações do projeto → Propriedades do script**, crie `HYPE_MINOR_EMAIL_SECRET` com um segredo aleatório de no mínimo 40 caracteres (use 64 caracteres hexadecimais gerados em um gerenciador de senhas). Não publique nem envie o segredo em mensagens ou no GitHub.
4. Em **Implantar → Nova implantação → Aplicativo da Web**, escolha **Executar como: Eu** e **Quem tem acesso: Qualquer pessoa**, autorize o uso do Gmail e copie o endereço terminado em `/exec`.
5. No painel Supabase do projeto Hype, abra **Edge Functions → Secrets** e cadastre `HYPE_MINOR_APPS_SCRIPT_URL` = a URL `/exec` do **novo script**, e `HYPE_MINOR_EMAIL_SECRET` = o mesmo segredo da etapa 3.
6. No Admin da Hype, use **Testes fictícios → Ver teste → Simular conferido**. O painel deve registrar a aceitação do e-mail para os dois Gmails. Confira a entrada e spam em ambos.

O fluxo real exige **16 ou 17 anos na data do evento**, selfie e documento do adolescente, documentos/assinatura do responsável e aprovação do Admin. O link exclusivo é válido 72 horas e cria um ingresso Pista de R$ 30,00 após o pagamento. O Gmail de autorização é separado do Gmail de QR Code que já existe.

Os dois Gmails são preenchidos no cadastro real. A demonstração utiliza os endereços de teste configurados na função de demonstração. **Nunca use imagens reais de documentos em testes fictícios.**

Observação: a resposta `accepted` significa que o Google Apps Script/Gmail aceitou o envio, **não prova entrega em caixa de entrada**. Confira os dois endereços.
