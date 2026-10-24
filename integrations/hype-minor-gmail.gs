/**
 * HYPE Lounge Club — E-mail exclusivo de AUTORIZAÇÕES DE MENORES.
 *
 * Cole isto somente no projeto separado "HYPE - Notificações de Menores".
 * NÃO substituir o script original de ingressos.
 *
 * Script Properties: HYPE_MINOR_EMAIL_SECRET (mesmo segredo do Supabase).
 * Implantar > Gerenciar implantações > Editar > Nova versão.
 * Web App: executar como Você; acesso Qualquer pessoa.
 */
function doPost(e) {
  try {
    var raw = String(e && e.postData && e.postData.contents || '');
    if (!raw || raw.length > 6500000) throw new Error('Mensagem inválida ou PDF muito grande.');
    var b = JSON.parse(raw);
    var secret = String(PropertiesService.getScriptProperties().getProperty('HYPE_MINOR_EMAIL_SECRET') || '');
    if (secret.length < 40 || !secureEquals_(String(b.secret || ''), secret)) {
      throw new Error('Acesso não autorizado');
    }
    var kind = String(b.kind || '');
    var allowed = ['authorization_pdf','rejected','demo','demo_rejected','approved'];
    if (allowed.indexOf(kind) === -1) throw new Error('Tipo de mensagem inválido');
    var emails = (Array.isArray(b.emails) ? b.emails : [])
      .map(function (x) { return String(x || '').trim().toLowerCase(); })
      .filter(function (x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) && x.length <= 254; });
    emails = emails.filter(function (x, i) { return emails.indexOf(x) === i; });
    if (emails.length < 1 || emails.length > 2) throw new Error('Destinatários inválidos');
    var name = String(b.minorName || 'Adolescente').slice(0, 100);
    var eventName = String(b.eventName || 'HYPE Lounge Club').slice(0, 100);
    var title, textBody, html, attachment = null;
    if (kind === 'authorization_pdf') {
      var filename = String(b.filename || '');
      var base64 = String(b.pdfBase64 || '');
      if (!/^HYPE-AUTORIZACAO-[0-9a-f]{8}\.pdf$/i.test(filename) ||
          !/^[A-Za-z0-9+/=\r\n]+$/.test(base64) || base64.length < 5000 || base64.length > 5800000) {
        throw new Error('PDF da autorização inválido');
      }
      var bytes = Utilities.base64Decode(base64.replace(/\s/g, ''));
      if (bytes.length < 3000 ||
          (bytes[0] & 255) !== 37 || (bytes[1] & 255) !== 80 ||
          (bytes[2] & 255) !== 68 || (bytes[3] & 255) !== 70) {
        throw new Error('Anexo não é um arquivo PDF válido');
      }
      attachment = Utilities.newBlob(bytes, 'application/pdf', filename);
      title = String(b.subject || ('HYPE - Autorização conferida de ' + name + ' - PDF com QR Code')).slice(0, 170);
      textBody = 'Olá! A autorização de ' + name + ' para ' + eventName +
        ' foi conferida pela HYPE Lounge Club.\n\n' +
        'O PDF de autorização está ANEXADO a este e-mail com QR Code, dados, fotos e assinatura.\n\n' +
        'O próprio menor pode apresentar o documento e seu documento original à equipe da HYPE. ' +
        'A entrada continua sujeita às regras do evento e à exigência legal de acompanhante quando aplicável.\n\n' +
        'O ingresso Pista, noite toda, R$ 30,00, será comprado SOMENTE NO EVENTO, presencialmente.\n\n' +
        'Este PDF NÃO é ingresso, NÃO é pagamento e NÃO libera entrada automática. ' +
        'É proibido fornecer bebidas alcoólicas a menores de 18 anos.';
      html = String(b.html || '').slice(0, 24000);
      if (!html || html.indexOf('HYPE LOUNGE CLUB') === -1) {
        html = '<div style="font:16px Arial;padding:25px"><h2 style="color:#c02a62">HYPE LOUNGE CLUB</h2>' +
          '<p><b>Autorização conferida</b></p><p>O PDF com QR Code está anexado.</p>' +
          '<p>O ingresso de R$ 30,00 é comprado somente presencialmente, no evento.</p>' +
          '<p>O menor pode apresentar o PDF, respeitadas as regras de acompanhante e conferência documental.</p>' +
          '<p>O PDF não é ingresso e não libera entrada automaticamente.</p></div>';
      }
    } else {
      var rejected = kind === 'rejected' || kind === 'demo_rejected';
      var test = kind === 'demo' || kind === 'demo_rejected';
      title = (test ? '[TESTE FICTÍCIO] ' : '') + (rejected ?
        'HYPE - Resultado da análise de menores' : 'HYPE - Informações sobre autorização');
      textBody = rejected ?
        'A solicitação de autorização de ' + name + ' não foi aprovada. Entre em contato com a HYPE para informações.' :
        'Esta é uma mensagem de demonstração da HYPE. Nenhum ingresso foi criado.';
      html = '<div style="font:16px Arial;padding:25px"><h2 style="color:#c02a62">HYPE LOUNGE CLUB</h2><p>' +
        escapeHtml_(textBody) + '</p><p>Não existe venda online de ingressos para menores.</p></div>';
    }
    var options = {name:'HYPE Lounge Club',htmlBody:html};
    if (emails.length === 2) options.bcc = emails[1];
    if (attachment) options.attachments = [attachment];
    GmailApp.sendEmail(emails[0], title, textBody, options);
    return json_({ok:true,accepted:true,recipient_count:emails.length,attachment:!!attachment});
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || 'Falha no envio').slice(0,250)});
  }
}
function secureEquals_(a,b) {
  if (a.length !== b.length) return false;
  var result = 0;
  for (var i=0;i<a.length;i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
function escapeHtml_(v) {
  return String(v).replace(/[&<>"']/g,function (c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
