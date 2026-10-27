/* HYPE Halloween V173 — decoracao isolada.
   Atua no cliente.html, inclusive ?promoter=CODIGO; nao consulta banco ou Asaas. */
(function () {
  "use strict";
  const sceneId = "hypeHalloweenSceneV173";
  function bat(extra) {
    return '<svg class="hhw-fly hhw-bat ' + extra + '" viewBox="0 0 170 85" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      '<path d="M84 31c-3-11-13-18-23-12 5 2 8 7 6 12-11-7-22-15-34-12-13 4-25 1-31-13-2 17 1 28 11 36-4-1-9-1-14 4 13 2 23 6 28 14-2-9 0-16 7-20 11 2 22 12 29 20 2-8 10-14 21-14 11 0 19 6 21 14 7-8 18-18 29-20 7 4 9 11 7 20 5-8 15-12 28-14-5-5-10-5-14-4 10-8 13-19 11-36-6 14-18 17-31 13-12-3-23 5-34 12-2-5 1-10 6-12-10-6-20 1-23 12z" fill="#130507" stroke="#6e0b0d" stroke-opacity=".50" stroke-width="2"/>' +
      '</svg>';
  }
  function witch(extra) {
    return '<svg class="hhw-fly hhw-witch ' + extra + '" viewBox="0 0 240 135" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
      '<defs><linearGradient id="hhw-broom-v173"><stop stop-color="#701916"/><stop offset="1" stop-color="#170809"/></linearGradient></defs>' +
      '<path d="M20 100L221 88" fill="none" stroke="#24100c" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M14 92L48 101 16 115 7 105Z" fill="#44200e" stroke="#1a0605" stroke-width="3"/>' +
      '<path d="M25 92L6 91 M32 96L6 104 M31 107L6 118" stroke="#783b13" stroke-width="3" opacity=".8"/>' +
      '<path d="M107 59Q121 55 127 64L159 80 171 106Q143 105 133 92L117 83 100 111 87 109 96 86 70 77Q87 69 107 59Z" fill="#0e0608"/>' +
      '<path d="M119 87Q142 104 179 116Q160 116 146 112Q172 128 191 128Q143 139 107 114L97 92Z" fill="#160609"/>' +
      '<path d="M112 65Q91 56 84 69L52 72 73 81 106 77Z" fill="#18070a"/>' +
      '<path d="M90 77Q92 90 114 95" stroke="#4c1c1b" stroke-width="5" fill="none"/>' +
      '<circle cx="104" cy="42" r="13" fill="#120709"/>' +
      '<path d="M95 46Q81 67 88 76L100 58 112 65Q126 60 121 47" fill="#150608"/>' +
      '<path d="M79 39L107 2 120 30 161 39Q125 51 79 45L68 42Z" fill="#0b0506" stroke="#45130f" stroke-width="2"/>' +
      '<path d="M114 14Q121 26 135 32" fill="none" stroke="#7f2522" stroke-width="3"/>' +
      '<path d="M99 43Q93 60 86 64M110 49Q123 66 117 73" stroke="#0b0506" stroke-width="8" fill="none"/>' +
      '<path d="M68 81L190 86" stroke="#37140d" stroke-width="3" fill="none" opacity=".8"/>' +
      '</svg>';
  }
  function buildScene() {
    if (document.getElementById(sceneId)) return;
    const scene = document.createElement("div");
    scene.id = sceneId;
    scene.setAttribute("aria-hidden", "true");
    scene.innerHTML =
      '<img class="hhw-frame" src="assets/hype-halloween-frame-v173.svg" alt="" decoding="async" data-hype-fallback="1">' +
      '<div class="hhw-ember"></div>' +
      witch("hhw-witch-one") + witch("hhw-witch-two") +
      bat("hhw-bat-one") + bat("hhw-bat-two") +
      bat("hhw-bat-three") + bat("hhw-bat-four");
    document.body.appendChild(scene);
  }
  let requestedOriginalFrame=false;
  function loadOriginalFrame() {
    if(requestedOriginalFrame)return;
    requestedOriginalFrame=true;
    // Moldura escolhida: miniatura AVIF da arte original (centro transparente).
    // O SVG anterior é mantido como reserva se houver falha de rede.
    fetch("assets/hype-halloween-frame-v172.b64.txt?v=20261026-original", {cache:"force-cache"})
      .then(response=>{if(!response.ok)throw new Error("Moldura indisponível");return response.text();})
      .then(uri=>{
        uri=uri.trim();
        if(!/^data:image\/avif;base64,[A-Za-z0-9+\/=]+$/.test(uri)||uri.length>12000)return;
        const frame=document.querySelector("#"+sceneId+" .hhw-frame");
        if(frame){frame.src=uri;frame.removeAttribute("data-hype-fallback");}
      })
      .catch(()=>{});
  }
  function syncHalloween() {
    const title = document.getElementById("v14EventName");
    const text = String(title?.textContent || "").trim().toLowerCase();
    const shouldShow = /halloween/.test(text);
    if (shouldShow) { buildScene(); loadOriginalFrame(); }
    document.body.classList.toggle("hype-halloween-live", shouldShow);
  }
  function init() {
    const eventTitle = document.getElementById("v14EventName");
    if (!eventTitle) return;
    const watcher = new MutationObserver(syncHalloween);
    watcher.observe(eventTitle, {childList:true,subtree:true,characterData:true});
    window.addEventListener("pageshow", syncHalloween, {passive:true});
    syncHalloween();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once:true});
  } else {
    init();
  }
})();
