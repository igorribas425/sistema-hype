function respostaJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function hypeEsc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hypeDataUrlBlob(dataUrl, name) {
  try {
    const m = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    return Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], name);
  } catch (_) {
    return null;
  }
}

function hypeImageBlob(src, name) {
  const value = String(src || "").trim();
  if (!value) return null;
  if (value.indexOf("data:image/") === 0) return hypeDataUrlBlob(value, name);
  if (/^https?:\/\//i.test(value)) {
    try {
      const r = UrlFetchApp.fetch(value, { muteHttpExceptions: true, followRedirects: true });
      if (r.getResponseCode() >= 200 && r.getResponseCode() < 300) return r.getBlob().setName(name);
    } catch (_) {}
  }
  return null;
}

function hypeFormatEventDate(value) {
  if (!value) return "";
  try {
    const parts = String(value).slice(0, 10).split("-");
    if (parts.length === 3) return parts[2] + "/" + parts[1] + "/" + parts[0];
  } catch (_) {}
  return String(value);
}


function hypeSendReaderLink(dados) {
  const email = String(dados.email || "").trim();
  const link = String(dados.reader_link || "").trim();
  const nomeLeitor = String(dados.reader_label || "Celular leitor").trim().slice(0, 80);

  if (!email || !email.includes("@")) {
    return respostaJson({ ok: false, erro: "E-mail inválido" });
  }
  if (!/^https:\/\//i.test(link) || link.indexOf("leitor.html") === -1 || link.indexOf("reader=") === -1) {
    return respostaJson({ ok: false, erro: "Link do leitor inválido" });
  }

  const assunto = "📱 Acesso ao Leitor QR — HYPE LOUNGE CLUB";
  const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#050505;color:#fff;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050505;padding:28px 10px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#0b0b0e;border:1px solid #25252b;border-radius:24px;overflow:hidden">
        <tr><td style="padding:32px 28px;text-align:center;background:linear-gradient(180deg,#15151b,#0b0b0e)">
          <div style="font-size:11px;letter-spacing:4px;color:#bdbdc4;font-weight:700">HYPE LOUNGE CLUB</div>
          <div style="font-size:28px;font-weight:900;margin-top:10px">LEITOR QR DA PORTARIA</div>
          <div style="font-size:13px;color:#a6a6af;margin-top:10px">${hypeEsc(nomeLeitor)}</div>
        </td></tr>
        <tr><td style="padding:28px">
          <div style="font-size:16px;line-height:1.7;color:#c4c4cc">Este acesso foi criado para usar este celular somente como <b style="color:#fff">leitor de QR Code da Portaria</b>. Funciona em Android e iPhone.</div>
          <div style="text-align:center;margin:28px 0">
            <a href="${hypeEsc(link)}" style="display:inline-block;background:#f4f4f6;color:#050505;text-decoration:none;padding:16px 24px;border-radius:14px;font-size:14px;font-weight:900">📷 ABRIR LEITOR QR</a>
          </div>
          <div style="background:#121217;border:1px solid #282830;border-radius:16px;padding:18px;color:#a9a9b2;font-size:12px;line-height:1.7">
            • Abra o link no celular que será usado na entrada.<br>
            • Na primeira abertura, permita o acesso à câmera.<br>
            • O link de ativação é individual e expira se não for aberto no prazo configurado.<br>
            • Se o Admin bloquear o leitor, este acesso deixa de funcionar.
          </div>
          <div style="margin-top:24px;text-align:center;color:#707078;font-size:11px">HYPE LOUNGE CLUB • acesso oficial da Portaria</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const texto =
    "HYPE LOUNGE CLUB\n\n" +
    "Acesso ao Leitor QR da Portaria\n" +
    "Leitor: " + nomeLeitor + "\n\n" +
    "Abra no celular: " + link + "\n\n" +
    "Permita o uso da câmera quando solicitado.";

  GmailApp.sendEmail(email, assunto, texto, {
    name: "HYPE LOUNGE CLUB",
    htmlBody: html
  });

  return respostaJson({ ok: true, enviado: true, tipo: "reader_link", email: email });
}



// ============================================================
// V34: PESQUISA POS-EVENTO
// Recebe um lote de convites da Edge Function e envia por Gmail.
// ============================================================
function hypeSendSurveyBatch(dados) {
  const lista = Array.isArray(dados.recipients) ? dados.recipients.slice(0, 100) : [];
  if (!lista.length) return respostaJson({ ok: true, sent: 0, failed: 0, results: [] });

  const results = [];
  let sent = 0;
  let failed = 0;

  lista.forEach(function(item) {
    const email = String(item.email || "").trim();
    const link = String(item.survey_link || "").trim();
    const nome = String(item.customer_name || "Cliente HYPE").trim();
    const evento = String(item.event_name || "HYPE LOUNGE CLUB").trim();
    const dataEvento = hypeFormatEventDate(item.event_date || "");
    const inviteToken = String(item.invite_token || "");

    try {
      if (!email || email.indexOf("@") < 1) throw new Error("E-mail inválido");
      if (!/^https:\/\//i.test(link) || link.indexOf("pesquisa.html") === -1 || link.indexOf("token=") === -1) {
        throw new Error("Link da pesquisa inválido");
      }

      const assunto = "⭐ Sua opinião sobre " + evento + " — HYPE";
      const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#040405;color:#fff;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#040405;padding:30px 10px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#0b0b0f;border:1px solid #2a2a31;border-radius:28px;overflow:hidden;box-shadow:0 26px 70px rgba(0,0,0,.45)">
        <tr><td style="height:4px;background:linear-gradient(90deg,#050505,#ffffff,#050505)"></td></tr>
        <tr><td style="padding:36px 28px 26px;text-align:center;background:linear-gradient(180deg,#18181f,#0b0b0f)">
          <div style="width:58px;height:58px;line-height:58px;margin:0 auto 16px;border-radius:18px;background:#f3f3f5;color:#060607;font-size:32px;font-weight:900">H</div>
          <div style="font-size:10px;letter-spacing:4px;color:#bdbdc6;font-weight:800">HYPE LOUNGE CLUB</div>
          <div style="font-size:30px;font-weight:900;margin-top:10px;letter-spacing:-1px">SUA NOITE. SUA OPINIÃO.</div>
          <div style="font-size:15px;color:#e4e4e8;margin-top:12px;font-weight:700">${hypeEsc(evento)}</div>
          ${dataEvento ? `<div style="font-size:12px;color:#8f8f99;margin-top:7px">${hypeEsc(dataEvento)}</div>` : ""}
        </td></tr>
        <tr><td style="padding:28px">
          <div style="font-size:18px;font-weight:800">Oi, ${hypeEsc(nome)}! 🔥</div>
          <div style="font-size:14px;line-height:1.75;color:#bebec6;margin-top:11px">Obrigado por ter vivido essa noite com a HYPE. Queremos saber o que foi incrível e o que podemos melhorar para o próximo evento.</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;background:#111116;border:1px solid #292930;border-radius:18px">
            <tr>
              <td style="width:33.33%;padding:16px 8px;text-align:center;border-right:1px solid #292930"><div style="font-size:20px">⭐</div><div style="font-size:10px;color:#bdbdc6;margin-top:5px;font-weight:800">NOTA 1 A 5</div></td>
              <td style="width:33.33%;padding:16px 8px;text-align:center;border-right:1px solid #292930"><div style="font-size:20px">💬</div><div style="font-size:10px;color:#bdbdc6;margin-top:5px;font-weight:800">COMENTÁRIO</div></td>
              <td style="width:33.33%;padding:16px 8px;text-align:center"><div style="font-size:20px">🔥</div><div style="font-size:10px;color:#bdbdc6;margin-top:5px;font-weight:800">VOLTARIA?</div></td>
            </tr>
          </table>
          <div style="text-align:center;margin:28px 0 22px">
            <a href="${hypeEsc(link)}" style="display:inline-block;background:#f4f4f6;color:#050505;text-decoration:none;padding:17px 27px;border-radius:15px;font-size:14px;font-weight:900;letter-spacing:.3px">⭐ ENVIAR MEU FEEDBACK</a>
          </div>
          <div style="background:#101015;border:1px dashed #32323a;border-radius:15px;padding:16px;color:#9f9fa9;font-size:12px;line-height:1.7;text-align:center">Leva menos de 1 minuto. O link é individual e permite uma resposta por ingresso.</div>
          <div style="margin-top:24px;text-align:center;color:#6f6f78;font-size:10px">HYPE LOUNGE CLUB • sua opinião ajuda a construir a próxima experiência</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const texto =
        "HYPE LOUNGE CLUB\n\n" +
        "Oi, " + nome + "! 🔥\n\n" +
        "Como foi sua noite no evento " + evento + "? Sua opinião ajuda a HYPE a melhorar os próximos eventos.\n\n" +
        "Envie seu feedback aqui: " + link + "\n\n" +
        "Leva menos de 1 minuto. Obrigado por fazer parte da HYPE.";

      GmailApp.sendEmail(email, assunto, texto, {
        name: "HYPE LOUNGE CLUB",
        htmlBody: html
      });
      sent++;
      results.push({ ok: true, invite_token: inviteToken, email: email });
    } catch (err) {
      failed++;
      results.push({ ok: false, invite_token: inviteToken, email: email, error: String(err && err.message ? err.message : err) });
    }
  });

  return respostaJson({ ok: true, sent: sent, failed: failed, results: results });
}

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents || "{}");

    const segredo = PropertiesService
      .getScriptProperties()
      .getProperty("HYPE_WEBHOOK_SECRET");

    if (!segredo || dados.secret !== segredo) {
      return respostaJson({ ok: false, erro: "Não autorizado" });
    }

    // V33: envio do link exclusivo do leitor da Portaria.
    if (String(dados.action || "").toLowerCase() === "reader_link") {
      return hypeSendReaderLink(dados);
    }

    // V34: pesquisa pos-evento para quem realmente entrou.
    if (String(dados.action || "").toLowerCase() === "survey_batch") {
      return hypeSendSurveyBatch(dados);
    }

    if (String(dados.payment_status || "").toLowerCase() !== "pago") {
      return respostaJson({ ok: false, erro: "Pagamento ainda não confirmado" });
    }

    const email = String(dados.email || "").trim();
    if (!email || !email.includes("@")) {
      return respostaJson({ ok: false, erro: "E-mail inválido" });
    }

    const nome = dados.customer_name || "Cliente HYPE";
    const evento = dados.event_name || "HYPE LOUNGE CLUB";
    const artista = dados.artist_name || "";
    const dataEvento = hypeFormatEventDate(dados.event_date || "");
    const abertura = dados.opening_time || "";
    const local = dados.venue || "";
    const lote = dados.lot_name || "Ingresso";
    const setor = dados.sector || "";
    const genero = dados.gender || "";
    const codigo = dados.ticket_code || "";
    const qrToken = dados.qr_token || codigo;

    const valor = Number(dados.price || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });

    const imagens = {};
    let qrHtml = "";
    let arteHtml = "";

    if (dados.event_cover_image) {
      const arte = hypeImageBlob(dados.event_cover_image, "arte-evento-hype.jpg");
      if (arte && arte.getBytes().length <= 8 * 1024 * 1024) {
        imagens.arteEvento = arte;
        arteHtml = `
          <tr>
            <td style="padding:0;background:#050505">
              <img src="cid:arteEvento" alt="Arte do evento" style="display:block;width:100%;max-height:420px;object-fit:cover;border:0">
            </td>
          </tr>`;
      }
    }

    if (qrToken) {
      const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=12&data=" + encodeURIComponent(qrToken);
      const respostaQr = UrlFetchApp.fetch(qrUrl, { muteHttpExceptions: true });
      if (respostaQr.getResponseCode() === 200) {
        imagens.qrIngresso = respostaQr.getBlob().setName("qrcode-ingresso-hype.png");
        qrHtml = `
          <div style="text-align:center;margin:28px 0 16px">
            <div style="display:inline-block;background:#ffffff;padding:14px;border-radius:20px">
              <img src="cid:qrIngresso" width="235" height="235" alt="QR Code do ingresso" style="display:block">
            </div>
          </div>`;
      }
    }

    const detalhesEvento = [
      dataEvento ? `📅 ${hypeEsc(dataEvento)}` : "",
      abertura ? `🕘 ${hypeEsc(abertura)}` : "",
      local ? `📍 ${hypeEsc(local)}` : ""
    ].filter(Boolean).join(" &nbsp; • &nbsp; ");

    const assunto = "🎟️ Ingresso confirmado — " + evento;

    const html = `
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#050505;color:#ffffff;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#050505;padding:24px 10px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#0b0b0e;border:1px solid #25252b;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.45)">
        ${arteHtml}
        <tr>
          <td style="padding:30px 28px 18px;text-align:center;background:linear-gradient(180deg,#121217,#0b0b0e)">
            <div style="font-size:11px;letter-spacing:4px;color:#bdbdc4;font-weight:700">HYPE LOUNGE CLUB</div>
            <div style="font-size:30px;line-height:1.05;font-weight:900;margin-top:10px;color:#ffffff">${hypeEsc(evento)}</div>
            ${artista ? `<div style="font-size:16px;color:#d6d6dc;margin-top:8px">${hypeEsc(artista)}</div>` : ""}
            ${detalhesEvento ? `<div style="font-size:12px;color:#9c9ca5;margin-top:13px;line-height:1.7">${detalhesEvento}</div>` : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 30px">
            <div style="margin:0 auto 22px;text-align:center;background:#0d2117;border:1px solid #1f6c46;border-radius:999px;padding:10px 14px;color:#72e4a8;font-size:12px;font-weight:900;max-width:260px">✓ PAGAMENTO CONFIRMADO</div>

            <div style="font-size:23px;font-weight:800;margin:0 0 8px">Olá, ${hypeEsc(nome)}!</div>
            <div style="font-size:14px;line-height:1.7;color:#b7b7c0">Seu ingresso está liberado. Guarde este e-mail e apresente o QR Code na entrada junto com seu documento.</div>

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;background:#121217;border:1px solid #282830;border-radius:16px;overflow:hidden">
              <tr><td style="padding:18px 20px;border-bottom:1px solid #25252b;color:#8e8e98;font-size:11px;font-weight:700;letter-spacing:1px">SEU INGRESSO</td></tr>
              <tr><td style="padding:18px 20px;line-height:1.9;font-size:14px">
                <b style="color:#fff">🎟️ ${hypeEsc(lote)}</b>${setor ? ` &nbsp; • &nbsp; ${hypeEsc(setor)}` : ""}<br>
                ${genero ? `<span style="color:#bdbdc4">🚻 ${hypeEsc(genero)}</span><br>` : ""}
                <span style="color:#bdbdc4">💰 ${hypeEsc(valor)}</span><br>
                <span style="color:#bdbdc4">🔖 Código: <b style="color:#fff;letter-spacing:1px">${hypeEsc(codigo)}</b></span>
              </td></tr>
            </table>

            ${qrHtml}

            <div style="text-align:center;font-size:12px;line-height:1.65;color:#8f8f99;margin-top:12px">
              Este QR Code é individual. Não compartilhe com outras pessoas.<br>
              Na Portaria, tenha seu documento em mãos.
            </div>

            <div style="margin-top:28px;padding-top:20px;border-top:1px solid #24242a;text-align:center">
              <div style="font-size:18px;font-weight:900;color:#fff">Nos vemos na HYPE 🔥</div>
              <div style="font-size:11px;color:#707078;margin-top:8px">HYPE LOUNGE CLUB • ingresso oficial</div>
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const texto =
      `HYPE LOUNGE CLUB\n\n` +
      `Pagamento confirmado!\n\n` +
      `Nome: ${nome}\n` +
      `Evento: ${evento}\n` +
      (artista ? `Artista: ${artista}\n` : "") +
      (dataEvento ? `Data: ${dataEvento}\n` : "") +
      (local ? `Local: ${local}\n` : "") +
      `Ingresso: ${lote}\n` +
      `Setor: ${setor}\n` +
      `Valor: ${valor}\n` +
      `Código: ${codigo}\n\n` +
      `Apresente o QR Code recebido neste e-mail na Portaria.`;

    GmailApp.sendEmail(email, assunto, texto, {
      name: "HYPE LOUNGE CLUB",
      htmlBody: html,
      inlineImages: imagens
    });

    return respostaJson({ ok: true, enviado: true, email: email });
  } catch (erro) {
    return respostaJson({ ok: false, erro: String(erro) });
  }
}
