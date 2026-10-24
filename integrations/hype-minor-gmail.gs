/**
 * HYPE Lounge Club — notificações de autorizações de menores (Gmail).
 * INSTALAÇÃO SEPARADA. NÃO COLE ESTE CÓDIGO SOBRE O SCRIPT DOS INGRESSOS!
 * Propriedade obrigatória do script: HYPE_MINOR_EMAIL_SECRET.
 * Publique como aplicativo da Web: Executar como: Eu; Acesso: Qualquer pessoa.
 * O segredo impede chamadas não autorizadas; use uma chave longa e aleatória.
 */
function doPost(e) {
  try {
    var raw = String((e && e.postData && e.postData.contents) || "");
    if (!raw || raw.length > 16000) throw new Error("Dados inválidos");
    var b = JSON.parse(raw);
    var expected = PropertiesService.getScriptProperties().getProperty("HYPE_MINOR_EMAIL_SECRET");
    if (!expected || expected.length < 40 || !secureEquals_(String(b.secret || ""), expected)) {
      throw new Error("Acesso não autorizado");
    }
    var kind = String(b.kind || "");
    if (["demo", "demo_rejected", "approved", "rejected"].indexOf(kind) === -1) {
      throw new Error("Notificação inválida");
    }
    var emails = (Array.isArray(b.emails) ? b.emails : [])
      .map(function(x){return String(x || "").trim().toLowerCase();})
      .filter(function(x){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) && x.length <= 254;});
    emails = emails.filter(function(x, i){return emails.indexOf(x) === i;});
    if (!emails.length || emails.length > 2) throw new Error("Gmail inválido");

    var test = kind === "demo" || kind === "demo_rejected";
    var approved = kind === "demo" || kind === "approved";
    var link = String(b.link || "");
    if (approved && !/^https:\/\/(?:www\.)?hypeloungeclub\.com\.br\/menor-comprar\.html\?(?:token=[0-9a-f]{64}|demo=[a-f0-9-]{36})$/i.test(link)) {
      throw new Error("Link oficial inválido");
    }
    var name = String(b.minorName || "Adolescente").slice(0, 100);
    var eventName = String(b.eventName || "HYPE Lounge Club").slice(0, 100);
    var title = (test ? "[TESTE FICTÍCIO] " : "") +
      (approved ? "HYPE — Autorização conferida e link de compra" : "HYPE — Resultado da autorização");
    var msg = test ?
      (approved ? "Esta é uma simulação do sistema HYPE. Nenhuma pessoa real foi autorizada, nenhum PIX foi criado e nenhum ingresso foi emitido." :
        "Esta é uma simulação de autorização RECUSADA. Nenhum ingresso ou cobrança real foi criada.") :
      (approved ? "A autorização de " + name + " para " + eventName +
        " foi conferida. A compra exclusiva de Pista para menores de 16 a 17 anos, noite toda, custa R$ 30,00. A entrada exige conferência presencial dos documentos e cumprimento das regras do evento." :
        "A autorização de " + name + " para " + eventName +
        " não foi aprovada. Entre em contato com a HYPE para esclarecimentos.");
    var textBody = msg + (approved ? "\n\n" + (test ? "Link de demonstração (sem cobrança): " : "Link privado de compra: ") + link : "") +
      "\n\nProibido fornecer bebidas alcoólicas a menores de 18 anos. Documento original obrigatório na portaria.";
    var html = "<div style='font:16px/1.6 Arial,sans-serif;max-width:600px;color:#231923;padding:20px'>" +
      "<h2 style='color:#be2357'>HYPE LOUNGE CLUB</h2>" +
      "<h3>" + htmlEscape_(title) + "</h3><p>" + htmlEscape_(msg) + "</p>" +
      (approved ? "<p><a href='" + htmlEscape_(link) + "' style='display:inline-block;padding:13px 18px;color:white;background:#ba2055;border-radius:9px;text-decoration:none'>" +
      (test ? "ABRIR TESTE FICTÍCIO" : "CONTINUAR COMPRA AUTORIZADA") +
      "</a></p><p style='overflow-wrap:anywhere'>" + htmlEscape_(link) + "</p>" : "") +
      "<p style='font-size:12px;color:#86596a'>A entrada está sujeita às regras do evento. É proibido fornecer bebidas alcoólicas a menores de 18 anos.</p></div>";

    // Um único disparo, usando BCC para não revelar o Gmail do menor ao responsável nem vice-versa.
    var options = { name: "HYPE Lounge Club", htmlBody: html };
    if (emails.length === 2) options.bcc = emails[1];
    GmailApp.sendEmail(emails[0], title, textBody, options);
    return json_({ok:true,accepted:true,recipient_count:emails.length});
  } catch (error) {
    return json_({ok:false,error:String(error && error.message || "Falha no envio").slice(0,250)});
  }
}
function secureEquals_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function htmlEscape_(s) {
  return String(s).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function json_(data){
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
