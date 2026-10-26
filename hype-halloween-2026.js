/* HYPE Halloween • 30/10/2026 • decoração somente na compra (normal + promoter).
   Não toca em formulários, preços, Asaas ou dados de ingresso. */
(function () {
  "use strict";
  const witchSvg = '<svg viewBox="0 0 230 125" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'+
    '<path d="M7 82Q97 67 215 89L226 96Q130 87 7 89Z" fill="#10080b" stroke="#e34c28" stroke-width="2"/>'+
    '<path d="M78 55Q102 33 130 51L157 73Q140 81 126 70L107 89L71 79L62 65Z" fill="#08080b" stroke="#d33b26" stroke-width="1.6"/>'+
    '<path d="M89 36Q88 14 109 15Q129 22 120 40L112 50L94 47Z" fill="#10080a"/>'+
    '<path d="M71 26L108 7L98 22L136 29L147 38L64 36Z" fill="#13080b" stroke="#ca3c27" stroke-width="1.5"/>'+
    '<path d="M124 70L145 95L166 94L137 64ZM85 75L76 111L59 117L71 71Z" fill="#0a080a"/>'+
    '<path d="M120 52L150 76L165 75" fill="none" stroke="#16090b" stroke-width="12" stroke-linecap="round"/>'+
    '<circle cx="123" cy="39" r="2" fill="#ff6a29"/>'+
    '<path d="M16 87L1 83M28 91L8 104M21 85L4 70" stroke="#a73a1e" stroke-width="1.7"/>'+
  '</svg>';
  const batSvg = '<svg viewBox="0 0 100 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'+
    '<path fill="#13070a" stroke="#fa5430" stroke-width="1.6" d="M1 20Q16 7 32 19Q36 9 44 6L50 13L56 6Q64 9 68 19Q84 7 99 20Q83 20 77 36Q63 29 50 35Q37 29 23 36Q17 20 1 20Z"/>'+
    '<path fill="#260b0b" d="M41 30L50 43L59 30Z"/>'+
  '</svg>';
  function makeFlyer(kind, clazz, top, speed, delay, size, opacity) {
    const el = document.createElement("span");
    el.className = "hh-flyer " + kind + " " + clazz;
    el.style.setProperty("--hh-top", top);
    el.style.setProperty("--hh-speed", speed);
    el.style.setProperty("--hh-delay", delay);
    el.style.setProperty("--hh-size", size);
    el.style.setProperty("--hh-opacity", opacity);
    el.innerHTML = kind === "hh-witch" ? witchSvg : batSvg;
    return el;
  }
  function isHalloweenSelected() {
    try {
      const chosen = typeof HYPE !== "undefined" && HYPE && HYPE.event;
      if (!chosen) return false;
      const title = String(chosen.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
      const day = String(chosen.event_date || "").slice(0, 10);
      return chosen.active !== false && title.includes("halloween") && day === "2026-10-30";
    } catch (_) { return false; }
  }
  function apply() {
    if (!document.body) return;
    const enabled = isHalloweenSelected();
    document.body.classList.toggle("hype-halloween-active", enabled);
    if (enabled && document.querySelector(".hype-halloween-sky")) {
      document.querySelector(".hype-halloween-sky").setAttribute("aria-hidden","true");
    }
  }
  function init() {
    if (document.getElementById("hypeHalloweenFrameV172")) return;
    const frame = document.createElement("div");
    frame.className = "hype-halloween-frame";
    frame.id = "hypeHalloweenFrameV172";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);
    const sky = document.createElement("div");
    sky.className = "hype-halloween-sky";
    sky.setAttribute("aria-hidden","true");
    sky.append(
      makeFlyer("hh-witch","hh-witch-1","13%","28s","-7s","154px",".88"),
      makeFlyer("hh-witch","hh-witch-2","64%","38s","-20s","116px",".60"),
      makeFlyer("hh-bat","hh-bat-1","19%","14s","-5s","62px",".88"),
      makeFlyer("hh-bat","hh-bat-2","8%","21s","-13s","48px",".84"),
      makeFlyer("hh-bat","hh-bat-3","41%","17s","-11s","57px",".65"),
      makeFlyer("hh-bat","hh-bat-4","70%","23s","-16s","43px",".68"),
      makeFlyer("hh-bat","hh-bat-5","30%","19s","-3s","52px",".70")
    );
    document.body.appendChild(sky);
    const shell = document.querySelector(".page-shell");
    if (shell) {
      const ribbon = document.createElement("div");
      ribbon.className = "hype-halloween-ribbon";
      ribbon.setAttribute("aria-hidden","true");
      ribbon.innerHTML = '<span class="hh-ribbon-mark">✦</span>'+
        '<span>HALLOWEEN DA HYPE · 30 OUT · INGRESSOS OFICIAIS</span>'+
        '<span class="hh-ribbon-mark">✦</span>';
      const brand = shell.querySelector(".page-brand");
      if (brand) brand.insertAdjacentElement("afterend", ribbon);
      else shell.prepend(ribbon);
    }
    // O evento e o flyer são preenchidos pelo app.js; ao mudar o evento,
    // o MutationObserver aciona a decoração sem modificar o checkout.
    const eventName = document.getElementById("v14EventName");
    if (eventName && typeof MutationObserver !== "undefined") {
      const watcher = new MutationObserver(apply);
      watcher.observe(eventName, {characterData:true,childList:true,subtree:true});
    }
    document.addEventListener("visibilitychange", apply, {passive:true});
    window.addEventListener("pageshow", apply, {passive:true});
    window.HypeHalloween2026 = {apply};
    apply();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
  else init();
})();
