function respostaJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents || "{}");

    const segredo = PropertiesService
      .getScriptProperties()
      .getProperty("HYPE_WEBHOOK_SECRET");

    if (!segredo || dados.secret !== segredo) {
      return respostaJson({
        ok: false,
        erro: "Não autorizado"
      });
    }

    if (String(dados.payment_status || "").toLowerCase() !== "pago") {
      return respostaJson({
        ok: false,
        erro: "Pagamento ainda não confirmado"
      });
    }

    const email = String(dados.email || "").trim();

    if (!email || !email.includes("@")) {
      return respostaJson({
        ok: false,
        erro: "E-mail inválido"
      });
    }

    const nome = dados.customer_name || "Cliente HYPE";
    const evento = dados.event_name || "HYPE LOUNGE CLUB";
    const lote = dados.lot_name || "Ingresso";
    const setor = dados.sector || "";
    const codigo = dados.ticket_code || "";
    const qrToken = dados.qr_token || codigo;

    const valor = Number(dados.price || 0)
      .toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });

    let qrHtml = "";
    let imagens = {};

    if (qrToken) {
      const qrUrl =
        "https://api.qrserver.com/v1/create-qr-code/" +
        "?size=300x300&data=" +
        encodeURIComponent(qrToken);

      const respostaQr = UrlFetchApp.fetch(qrUrl, {
        muteHttpExceptions: true
      });

      if (respostaQr.getResponseCode() === 200) {
        imagens.qrIngresso = respostaQr
          .getBlob()
          .setName("ingresso-hype.png");

        qrHtml = `
          <div style="margin:25px 0;text-align:center">
            <img
              src="cid:qrIngresso"
              width="230"
              height="230"
              alt="QR Code do ingresso"
            >
          </div>
        `;
      }
    }

    const assunto =
      "🎟️ Seu ingresso está confirmado — HYPE";

    const html = `
      <div style="
        max-width:600px;
        margin:auto;
        background:#080808;
        color:#ffffff;
        font-family:Arial,sans-serif;
        border-radius:18px;
        overflow:hidden;
      ">

        <div style="
          padding:28px;
          text-align:center;
          background:#111111;
        ">
          <h1 style="margin:0">
            HYPE LOUNGE CLUB
          </h1>

          <p style="color:#28d17c;font-weight:bold">
            PAGAMENTO CONFIRMADO ✅
          </p>
        </div>

        <div style="padding:28px">

          <h2>
            Olá, ${nome}!
          </h2>

          <p>
            Seu pagamento foi confirmado e
            seu ingresso está liberado.
          </p>

          <div style="
            background:#151515;
            border-radius:14px;
            padding:20px;
            margin-top:20px;
            line-height:1.8;
          ">

            <b>🎤 Evento:</b> ${evento}<br>
            <b>🎟️ Ingresso:</b> ${lote}<br>
            <b>📍 Setor:</b> ${setor}<br>
            <b>💰 Valor:</b> ${valor}<br>
            <b>🔖 Código:</b> ${codigo}

          </div>

          ${qrHtml}

          <p style="
            text-align:center;
            font-size:14px;
            color:#bbbbbb;
          ">
            Apresente este QR Code na portaria
            junto com seu documento.
          </p>

          <p style="
            text-align:center;
            color:#28d17c;
            font-weight:bold;
            margin-top:25px;
          ">
            Nos vemos na HYPE 🔥
          </p>

        </div>
      </div>
    `;

    const texto =
      `HYPE LOUNGE CLUB\n\n` +
      `Pagamento confirmado!\n\n` +
      `Nome: ${nome}\n` +
      `Evento: ${evento}\n` +
      `Ingresso: ${lote}\n` +
      `Setor: ${setor}\n` +
      `Valor: ${valor}\n` +
      `Código: ${codigo}`;

    GmailApp.sendEmail(
      email,
      assunto,
      texto,
      {
        name: "HYPE LOUNGE CLUB",
        htmlBody: html,
        inlineImages: imagens
      }
    );

    return respostaJson({
      ok: true,
      enviado: true,
      email: email
    });

  } catch (erro) {

    return respostaJson({
      ok: false,
      erro: String(erro)
    });

  }
}
