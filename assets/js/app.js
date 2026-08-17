/* =========================================================================
   LA CITROSÉTOISE — moteur d'interface
   Aucune dépendance. Une seule boucle rAF, transforms/opacity uniquement.
   ========================================================================= */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  /* interpolation sur une suite de points [progression, valeur] */
  function track(p, stops) {
    if (p <= stops[0][0]) return stops[0][1];
    for (var i = 1; i < stops.length; i++) {
      if (p <= stops[i][0]) {
        var t = (p - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
        return lerp(stops[i - 1][1], stops[i][1], t);
      }
    }
    return stops[stops.length - 1][1];
  }

  if (reduced) root.classList.add("no-motion");

  /* ------------------------------------------------------------------ *
   * 1. La bouteille : deux cylindres construits en lamelles 3D.
   *    Chaque lamelle porte une copie de l'étiquette dépliée, décalée
   *    horizontalement — l'impression s'enroule réellement sur le verre.
   * ------------------------------------------------------------------ */
  var Bottle = (function () {
    var slats = [];       /* { el, shade, cos } */
    var spin = document.querySelector("[data-spin]");

    function buildCylinder(cyl, template) {
      var N = parseInt(cyl.dataset.slats, 10);
      var R = parseFloat(cyl.dataset.radius);
      var step = 360 / N;
      var w = 2 * R * Math.tan(Math.PI / N);
      var stripW = N * w;
      var shadeMax = parseFloat(cyl.dataset.shade || "0.92");

      cyl.style.width = w + "px";
      cyl.style.marginLeft = -w / 2 + "px";

      for (var i = 0; i < N; i++) {
        var slat = document.createElement("div");
        slat.className = "slat";
        slat.style.width = w + 0.6 + "px";           /* léger recouvrement : pas de couture visible */
        slat.style.transform = "rotateY(" + i * step + "deg) translateZ(" + R + "px)";

        var strip = document.createElement("div");
        strip.className = "slat__strip";
        strip.style.width = stripW + "px";
        strip.style.left = -i * w + "px";

        var art = template.content.cloneNode(true);
        var band = art.querySelector(".neckband");
        if (band) band.style.justifyContent = "space-around";
        strip.appendChild(art);

        var shade = document.createElement("div");
        shade.className = "slat__shade";

        slat.appendChild(strip);
        slat.appendChild(shade);
        cyl.appendChild(slat);
        slats.push({ el: slat, shade: shade, angle: i * step, max: shadeMax, last: -1 });
      }
    }

    var tplLabel = document.getElementById("tpl-label");
    var tplNeck = document.getElementById("tpl-neck");
    var cylLabel = document.querySelector('[data-cyl="label"]');
    var cylNeck = document.querySelector('[data-cyl="neck"]');
    if (cylLabel && tplLabel) buildCylinder(cylLabel, tplLabel);
    if (cylNeck && tplNeck) buildCylinder(cylNeck, tplNeck);

    /* condensation : gouttes semées de façon déterministe */
    var drops = document.querySelector("[data-droplets]");
    if (drops) {
      var seed = 20240607;
      var rand = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      var ns = "http://www.w3.org/2000/svg";
      var frag = document.createDocumentFragment();
      for (var d = 0; d < 90; d++) {
        var c = document.createElementNS(ns, "circle");
        var x = 32 + rand() * 176;
        var y = 165 + rand() * 415;
        var r = 0.7 + rand() * 2.4;
        c.setAttribute("cx", x.toFixed(1));
        c.setAttribute("cy", y.toFixed(1));
        c.setAttribute("r", r.toFixed(1));
        c.setAttribute("fill-opacity", (0.18 + rand() * 0.5).toFixed(2));
        frag.appendChild(c);
      }
      drops.appendChild(frag);
    }

    /* éclairage : la lumière reste fixe pendant que le cylindre tourne */
    function light(rot) {
      var base = rot + 180;
      for (var i = 0; i < slats.length; i++) {
        var s = slats[i];
        var a = (s.angle + base) * Math.PI / 180;
        var c = Math.cos(a - 0.38);            /* source décalée vers la gauche */
        var shade = Math.round(clamp((1 - c) / 2, 0, 1) * 100) / 100;
        if (shade === s.last) continue;
        s.last = shade;
        s.shade.style.opacity = shade * s.max;
        s.el.style.opacity = c < -0.05 ? 0.07 : 1;   /* face opposée : vue à travers le liquide */
      }
    }

    return {
      spin: spin,
      light: light,
      set: function (rot) {
        if (spin) spin.style.setProperty("--rot", rot.toFixed(2) + "deg");
        light(rot);
      }
    };
  })();

  /* ------------------------------------------------------------------ *
   * 2. La scène : progression du défilement → rotation, descente, chapitres
   * ------------------------------------------------------------------ */
  var scene = document.querySelector("[data-scene]");
  var holder = document.querySelector("[data-bottle-holder]");
  var bottle = document.querySelector("[data-bottle]");
  var chapters = Array.prototype.slice.call(document.querySelectorAll(".chapter"));
  var parallax = Array.prototype.slice.call(document.querySelectorAll("[data-parallax]"));
  var sky = document.querySelector("[data-sky]");
  var progressBar = document.querySelector(".site-header__progress i");
  var header = document.querySelector(".site-header");

  var TOURS = 3;                 /* nombre de tours complets sur la scène */
  var CHAPTERS = chapters.length;
  var smooth = 0, target = 0, current = -1;
  var vh = window.innerHeight, vw = window.innerWidth;

  /* écrans courts : on rend un peu de hauteur au texte */
  function facteur() { return vh < 620 ? 0.00040 : 0.00052; }

  function fitBottle() {
    vh = window.innerHeight; vw = window.innerWidth;
    /* téléphone : la bouteille occupe une hauteur fixe d'écran (32 vh), ce qui
       laisse toujours la même place au texte, du petit iPhone à la grande dalle. */
    var s = vw < 861 ? Math.min(vh * facteur(), vw / 780) : Math.min(vh / 1150, vw / 860);
    if (bottle) bottle.style.setProperty("--bottle-scale", clamp(s, 0.34, 0.95).toFixed(3));
  }

  function readProgress() {
    if (!scene) return 0;
    var box = scene.getBoundingClientRect();
    var span = scene.offsetHeight - vh;
    return span > 0 ? clamp(-box.top / span, 0, 1) : 0;
  }

  function paint(p) {
    /* bouteille : elle descend, ralentit, et tourne sans à-coups */
    var rot = p * 360 * TOURS;
    var petit = vw < 861;
    /* mobile : la bouteille remonte pour laisser la moitié basse au texte */
    /* haut d'écran : sous l'en-tête, à 6 px près, quelle que soit la hauteur */
    /* haut de la bouteille calé à 74 px, soit juste sous l'en-tête */
    var haut = 74 / vh - 0.5 + 291.4 * facteur();
    var by = (petit
      ? track(p, [[0, 0.12], [0.17, haut], [0.86, haut], [1, haut + 0.03]])
      : track(p, [[0, 0.17], [0.16, 0.04], [0.62, 0.09], [1, 0.16]])) * vh;
    var bs = petit
      ? track(p, [[0, 1.3], [0.2, 0.94], [1, 0.94]])
      : track(p, [[0, .96], [0.4, 0.92], [0.75, 0.88], [1, 0.94]]);
    var tilt = Math.sin(p * Math.PI * 2) * 2.6;
    /* chapitres 2 et 4 : la bouteille libère la moitié de l'écran */
    var bx = petit ? 0 : track(p, [
      [0.30, 0], [0.42, -0.16], [0.58, -0.16], [0.68, 0],
      [0.80, 0], [0.87, 0.15], [1, 0.15]
    ]) * vw;

    if (holder) {
      holder.style.setProperty("--bx", bx.toFixed(1) + "px");
      holder.style.setProperty("--by", by.toFixed(1) + "px");
      holder.style.setProperty("--bs", bs.toFixed(3));
    }
    if (bottle) bottle.style.setProperty("--tilt", tilt.toFixed(2) + "deg");
    Bottle.set(rot);


    /* le plein jour se dissipe : on entre dans le bleu nuit de la marque */
    var jour = 1 - clamp((p - 0.04) / 0.13, 0, 1);
    if (sky) {
      sky.style.setProperty("--sky-opacity", jour.toFixed(3));
      sky.style.visibility = jour < 0.01 ? "hidden" : "visible";
    }
    if (header) header.classList.toggle("is-light", jour > 0.55);

    for (var i = 0; i < parallax.length; i++) {
      var f = parseFloat(parallax[i].dataset.parallax);
      parallax[i].style.transform = "translate3d(0," + (-p * vh * f).toFixed(1) + "px,0)";
    }

    /* chapitres : une fenêtre par tranche, avec un temps de respiration */
    var slot = 1 / CHAPTERS;
    var idx = clamp(Math.floor(p / slot), 0, CHAPTERS - 1);
    var local = (p - idx * slot) / slot;
    var visible = idx === 0 ? local < 0.88 : local > 0.07 && local < 0.92;
    var next = visible ? idx : -1;
    if (next !== current) {
      if (current > -1) chapters[current].classList.remove("is-active");
      if (next > -1) {
        chapters[next].classList.add("is-active");
        countUp(chapters[next]);
      }
      current = next;
    }
  }

  function loop() {
    smooth = lerp(smooth, target, 0.11);
    if (Math.abs(smooth - target) < 0.00012) smooth = target;
    paint(smooth);
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------ *
   * 3. Compteurs
   * ------------------------------------------------------------------ */
  function countUp(scope) {
    var nums = scope.querySelectorAll("[data-count-to]");
    Array.prototype.forEach.call(nums, function (el) {
      if (el.dataset.counted) return;
      el.dataset.counted = "1";
      var to = parseFloat(el.dataset.countTo);
      var suffix = el.dataset.countSuffix || "";
      var isYear = el.dataset.countFormat === "year";
      var from = isYear ? to - 40 : 0;
      var t0 = performance.now(), dur = 1200;
      (function step(now) {
        var t = clamp((now - t0) / dur, 0, 1);
        var e = 1 - Math.pow(1 - t, 3);
        var v = Math.round(lerp(from, to, e));
        el.textContent = (isYear ? String(v) : v.toLocaleString("fr-FR")) + suffix;
        if (t < 1) requestAnimationFrame(step);
      })(t0);
    });
  }

  /* ------------------------------------------------------------------ *
   * 3 bis. Coupures : chaque ligne de titre reçoit son propre cadre
   *        masquant, d'où elle remonte. Les <br> font foi.
   * ------------------------------------------------------------------ */
  (function coupures() {
    var titres = document.querySelectorAll(
      ".section__title, .chapter__title, .card__title, .site-footer__slogan"
    );
    Array.prototype.forEach.call(titres, function (el) {
      var lignes = el.innerHTML.split(/<br\s*\/?>/i);
      el.innerHTML = lignes.map(function (t, i) {
        return '<span class="ligne" style="--l:' + i + '"><i>' + t.trim() + "</i></span>";
      }).join("");
      el.setAttribute("data-lignes", "");
    });

    /* volets balayants sur les surfaces */
    var surfaces = document.querySelectorAll(
      ".produit, .serve, .table-scroll, .buy__card, .journey__art, .about__trio, .futur__visuel"
    );
    Array.prototype.forEach.call(surfaces, function (el) { el.setAttribute("data-volet", ""); });
  })();

  /* ------------------------------------------------------------------ *
   * 4. Titre découpé lettre à lettre
   * ------------------------------------------------------------------ */
  (function splitTitle() {
    var el = document.querySelector("[data-split]");
    if (!el) return;
    var text = el.textContent.trim();
    el.textContent = "";
    el.setAttribute("aria-label", text);
    for (var i = 0; i < text.length; i++) {
      var span = document.createElement("span");
      span.className = "ch";
      span.setAttribute("aria-hidden", "true");
      span.textContent = text[i] === " " ? "\u00A0" : text[i];
      span.style.setProperty("--d", i);
      el.appendChild(span);
    }
    requestAnimationFrame(function () { root.classList.add("is-loaded"); });
  })();

  /* ------------------------------------------------------------------ *
   * 5. Révélations au défilement
   * ------------------------------------------------------------------ */
  (function reveals() {
    var items = document.querySelectorAll("[data-reveal], [data-reveal-group]");
    Array.prototype.forEach.call(document.querySelectorAll("[data-reveal-group]"), function (g) {
      Array.prototype.forEach.call(g.children, function (child, i) { child.style.setProperty("--i", i); });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".chapter"), function (c) {
      Array.prototype.forEach.call(c.querySelectorAll("[data-step]"), function (el) {
        el.style.setProperty("--d", el.dataset.step);
      });
    });
    if (reduced || !("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  })();

  /* ------------------------------------------------------------------ *
   * 6. En-tête : ancrage, masquage, progression, menu mobile, section active
   * ------------------------------------------------------------------ */
  (function headerUI() {
    if (!header) return;
    var burger = header.querySelector(".burger");
    var nav = header.querySelector(".nav");
    var lastY = 0;

    burger.addEventListener("click", function () {
      var open = header.classList.toggle("is-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        header.classList.remove("is-open");
        burger.setAttribute("aria-expanded", "false");
      }
    });

    var docSpan = function () { return document.documentElement.scrollHeight - vh; };
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      header.classList.toggle("is-stuck", y > 40);
      if (!header.classList.contains("is-open")) {
        header.classList.toggle("is-hidden", y > lastY && y > 320);
      }
      lastY = y;
      if (progressBar) progressBar.style.width = (clamp(y / docSpan(), 0, 1) * 100).toFixed(2) + "%";
    }, { passive: true });

    /* section courante dans le menu */
    var links = Array.prototype.slice.call(header.querySelectorAll('.nav__link[href^="#"]'));
    var targets = links.map(function (a) { return document.querySelector(a.getAttribute("href")); }).filter(Boolean);
    if ("IntersectionObserver" in window && targets.length) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          links.forEach(function (a) {
            a.classList.toggle("is-current", a.getAttribute("href") === "#" + e.target.id);
          });
        });
      }, { rootMargin: "-45% 0px -50% 0px" });
      targets.forEach(function (t) { spy.observe(t); });
    }
  })();

  /* ------------------------------------------------------------------ *
   * 7. FAQ : ouverture animée en hauteur
   * ------------------------------------------------------------------ */
  (function accordion() {
    Array.prototype.forEach.call(document.querySelectorAll(".faq details"), function (det) {
      var body = det.querySelector("div");
      var summary = det.querySelector("summary");
      if (!body || !summary) return;
      body.style.height = "0px";
      body.style.transition = reduced ? "none" : "height .5s cubic-bezier(.22,1,.36,1)";

      function shut(other) {
        if (other === det || !other.open) return;
        other.querySelector("div").style.height = "0px";
        other.open = false;
      }
      summary.addEventListener("click", function (e) {
        e.preventDefault();
        if (det.open) {
          body.style.height = body.scrollHeight + "px";
          requestAnimationFrame(function () { body.style.height = "0px"; });
          body.addEventListener("transitionend", function end() {
            det.open = false;
            body.removeEventListener("transitionend", end);
          });
        } else {
          Array.prototype.forEach.call(document.querySelectorAll(".faq details"), shut);
          det.open = true;
          body.style.height = "0px";
          requestAnimationFrame(function () { body.style.height = body.scrollHeight + "px"; });
        }
      });
    });
  })();

  /* ------------------------------------------------------------------ *
   * 8. Divers
   * ------------------------------------------------------------------ */
  var year = document.querySelector("[data-year]");
  if (year) year.textContent = new Date().getFullYear();

  /* rideau d'ouverture : deux volets qui se coupent en deux et s'écartent */
  (function rideau() {
    var el = document.querySelector("[data-rideau]");
    if (!el) return;
    if (reduced) { el.remove(); return; }
    root.classList.add("est-fige");
    window.setTimeout(function () { el.classList.add("est-leve"); }, 260);
    window.setTimeout(function () { root.classList.remove("est-fige"); }, 900);
    window.setTimeout(function () { el.remove(); }, 2000);
  })();

  /* ------------------------------------------------------------------ *
   * 9. Démarrage
   * ------------------------------------------------------------------ */
  fitBottle();
  if (reduced) {
    chapters.forEach(function (c) { c.classList.add("is-active"); countUp(c); });
    Bottle.set(18);
  } else {
    target = smooth = readProgress();
    paint(smooth);
    window.addEventListener("scroll", function () { target = readProgress(); }, { passive: true });
    requestAnimationFrame(loop);
  }
  window.addEventListener("resize", function () {
    fitBottle();
    target = readProgress();
  });
})();
