/* Halloween interativo HYPE v174. Nenhuma alteração no pagamento ou no promoter. */
(function () {
  "use strict";
  if (!document.querySelector(".page-shell") || document.getElementById("hypeHalloweenControlsV174")) return;
  var broom = '<svg viewBox="0 0 180 120" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M8 94 L169 82" stroke="#2a1618" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M153 77 Q167 71 178 78 L172 87 L180 95 L153 91Z" fill="#251317"/>' +
    '<path d="M85 49 L111 4 L126 48 Q144 53 144 58 L74 58 Z" fill="#17080c"/>' +
    '<path d="M76 55 Q113 68 147 56" fill="none" stroke="#8e2527" stroke-width="4"/>' +
    '<circle cx="112" cy="62" r="14" fill="#1a080a"/>' +
    '<path d="M101 75 Q78 80 64 107 Q101 95 118 93 Q130 100 156 110 Q142 80 125 76Z" fill="#12060a"/>' +
    '<path d="M91 69 Q107 78 136 75 L145 87 L138 91 L119 86 L101 84Z" fill="#1d0b0f"/>' +
    '<circle cx="121" cy="63" r="2" fill="#ff9955"/></svg>';
  var promo = new URLSearchParams(window.location.search).has("promoter");
  var section = document.createElement("section");
  section.id = "hypeHalloweenControlsV174";
  section.setAttribute("aria-label", "Halloween interativo da HYPE");
  section.innerHTML = '<div class="hhx-copy"><span class="hhx-eyebrow">🦇 HYPE LOUNGE CLUB • HALLOWEEN</span>' +
    '<h2 class="hhx-title">A NOITE ESTÁ <em>ENFEITIÇADA</em></h2>' +
    '<p class="hhx-sub">' + (promo ? 'Seu link de promoter entrou no clima. Escolha o ingresso e prepare-se!' : 'Escolha o ingresso, solte os morcegos e toque na bruxa!') + '</p>' +
    '<div class="hhx-actions"><button type="button" id="hhxLaunch" class="hhx-call">🦇 SOLTAR MORCEGOS</button>' +
    '<button type="button" id="hhxToggle" class="hhx-toggle" aria-pressed="true">✨ EFEITOS ON</button></div>' +
    '<div class="hhx-status" id="hhxStatus" role="status" aria-live="polite"></div></div>' +
    '<div class="hhx-visual"><div class="hhx-moon"></div><button type="button" class="hhx-witch" id="hhxWitch" aria-label="Tocar na bruxa para lançar um feitiço">' +
    broom + '<span class="hhx-hint">TOQUE NA BRUXA</span></button></div><div class="hhx-magic" id="hhxMagic" aria-hidden="true"></div>';
  var shell = document.querySelector(".page-shell");
  var brand = shell.querySelector(".page-brand");
  if (brand) brand.insertAdjacentElement("afterend", section);
  else shell.prepend(section);
  var magic = document.getElementById("hhxMagic");
  var status = document.getElementById("hhxStatus");
  var toggle = document.getElementById("hhxToggle");
  var launch = document.getElementById("hhxLaunch");
  var witch = document.getElementById("hhxWitch");
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function motion(on) {
    document.body.classList.toggle("hhx-paused", !on);
    toggle.setAttribute("aria-pressed", String(on));
    toggle.textContent = on ? "✨ EFEITOS ON" : "🌙 EFEITOS OFF";
  }
  motion(!reduced);
  function burst(target, isBat) {
    if (reduced) return;
    var r = target.getBoundingClientRect(), p = section.getBoundingClientRect();
    var x = r.left + r.width / 2 - p.left, y = r.top + r.height / 2 - p.top;
    var count = isBat ? 10 : 19;
    for (var i = 0; i < count; i++) {
      var node = document.createElement("span");
      node.className = isBat ? "hhx-swarm" : "hhx-star";
      if (isBat) node.textContent = "🦇";
      var a = 2 * Math.PI * i / count;
      var d = 50 + Math.random() * 110;
      node.style.setProperty("--x", x + "px");
      node.style.setProperty("--y", y + "px");
      node.style.setProperty("--dx", Math.cos(a) * d + "px");
      node.style.setProperty("--dy", Math.sin(a) * d + "px");
      node.style.setProperty("--rot", ((Math.random() - .5) * 140) + "deg");
      magic.appendChild(node);
      node.addEventListener("animationend", function () { this.remove(); }, {once:true});
      window.setTimeout((function(n){return function(){n.remove();};})(node), 1900);
    }
  }
  witch.addEventListener("click", function () {
    section.classList.add("hhx-enchanted");
    status.textContent = "✨ Feitiço lançado! Garanta seu ingresso.";
    burst(witch, false);
    window.setTimeout(function(){section.classList.remove("hhx-enchanted");},1500);
  });
  launch.addEventListener("click", function () {
    motion(true);
    status.textContent = "🦇 Os morcegos acordaram!";
    burst(launch, true);
    var scene = document.getElementById("hypeHalloweenSceneV173");
    if (scene) scene.querySelectorAll(".hhw-bat").forEach(function(el){
      el.style.animationDuration = "6s";
      window.setTimeout(function(){el.style.animationDuration="";},2700);
    });
  });
  toggle.addEventListener("click", function () {
    var off = document.body.classList.contains("hhx-paused");
    motion(off);
    status.textContent = off ? "✨ A magia voltou!" : "🌙 Efeitos pausados.";
  });
})();