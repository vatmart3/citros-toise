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
    var spin = document.querySelector("[data-spin]");
    var petitEcran = window.innerWidth < 861;

    /* L'ombrage d'un cylindre ne dépend pas de la lamelle mais de sa position
       à l'écran : un dégradé FIXE posé au-dessus du cylindre le rend donc
       gratuitement, au lieu de réécrire une opacité par lamelle à chaque
       image. Les faces arrière, elles, sont simplement masquées
       (`backface-visibility`) — de toute façon on ne voit pas l'étiquette du
       dos à travers une citronnade trouble. Résultat : la seule écriture de
       style par image est l'angle du cylindre. */
    function buildCylinder(cyl, template) {
      var N = parseInt(cyl.dataset.slats, 10);
      if (petitEcran) N = Math.max(9, Math.round(N * 0.78));
      var R = parseFloat(cyl.dataset.radius);
      var step = 360 / N;
      var w = 2 * R * Math.tan(Math.PI / N);
      var stripW = N * w;

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

        slat.appendChild(strip);
        cyl.appendChild(slat);
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
      for (var d = 0; d < 150; d++) {
        var c = document.createElementNS(ns, "circle");
        var x = 32 + rand() * 176;
        var y = 165 + rand() * 415;
        var r = 0.6 + rand() * 2.6;
        c.setAttribute("cx", x.toFixed(1));
        c.setAttribute("cy", y.toFixed(1));
        c.setAttribute("r", r.toFixed(1));
        c.setAttribute("fill-opacity", (0.22 + rand() * 0.62).toFixed(2));
        frag.appendChild(c);
      }
      drops.appendChild(frag);
    }

    return {
      set: function (rot) {
        if (spin) spin.style.setProperty("--rot", rot.toFixed(2) + "deg");
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
  var forme = document.querySelector("[data-forme]");
  var progressBar = document.querySelector(".site-header__progress i");
  var header = document.querySelector(".site-header");

  var TOURS = 3;                 /* nombre de tours complets sur la scène */
  var CHAPTERS = chapters.length;
  var smooth = 0, target = 0, current = -1;
  var vh = window.innerHeight, vw = window.innerWidth;

  /* écrans courts : on rend un peu de hauteur au texte */
  function facteur() { return vh < 620 ? 0.00040 : 0.00052; }

  /* Téléphone : on mesure la bande réellement libre entre l'en-tête et le
     chapitre le plus haut. C'est elle qui décide de la taille de la bouteille
     ET de la distance qu'elle peut parcourir — donc la même chorégraphie que
     sur ordinateur, sans jamais mordre sur le texte. */
  var bande = { haut: 74, bas: 0, course: 0, echelle: 0.4 };

  function mesureBande() {
    vh = window.innerHeight; vw = window.innerWidth;
    if (vw >= 861) return;
    var bas = vh;
    for (var i = 1; i < chapters.length; i++) {
      var enfants = chapters[i].children;
      for (var j = 0; j < enfants.length; j++) {
        var r = enfants[j].getBoundingClientRect();
        if (r.height > 0) bas = Math.min(bas, r.top);
      }
    }
    bande.haut = 74;
    bande.bas = clamp(bas - 20, bande.haut + 150, vh - 40);
    var dispo = bande.bas - bande.haut;
    var hauteur = Math.min(vh * facteur() * 620, dispo);
    bande.echelle = Math.min(hauteur / 620, vw / 780);
    bande.course = Math.max(0, dispo - 620 * bande.echelle) * 0.7;
  }

  function fitBottle() {
    vh = window.innerHeight; vw = window.innerWidth;
    var s = vw < 861 ? bande.echelle : Math.min(vh / 1150, vw / 860);
    if (bottle) bottle.style.setProperty("--bottle-scale", clamp(s, 0.3, 0.95).toFixed(3));
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
    var tilt = Math.sin(p * Math.PI * 2) * 2.6;
    var by, bs, bx;

    if (petit) {
      /* Même chorégraphie que sur ordinateur — la bouteille respire, descend
         et se décale — mais bornée à la bande mesurée. */
      bs = track(p, [[0, 1.04], [0.17, 1], [0.42, .93], [0.62, 1], [0.84, .94], [1, 1]]);
      var hBouteille = 620 * bande.echelle * bs;
      var descente = track(p, [[0.17, 0], [0.5, .55], [0.86, 1], [1, .84]]) * bande.course;
      var byScene = bande.haut + descente + hBouteille / 2 - vh / 2;
      /* ouverture : posée plus bas, dans le paysage, puis elle rejoint la bande */
      by = byScene;          /* même bande dès l'ouverture : le texte reste dessous */
      bx = track(p, [
        [0.30, 0], [0.42, -0.13], [0.58, -0.13], [0.68, 0],
        [0.80, 0], [0.87, 0.12], [1, 0.12]
      ]) * vw;
    } else {
      by = track(p, [[0, 0.1], [0.16, 0.04], [0.62, 0.09], [1, 0.16]]) * vh;
      bs = track(p, [[0, 1.16], [0.16, .94], [0.4, 0.92], [0.75, 0.88], [1, 0.94]]);
      /* ouverture : la bouteille est posée à droite, sur la forme marine ;
         chapitres 2 et 4 : elle libère la moitié de l'écran */
      bx = track(p, [
        [0, 0.2], [0.16, 0], [0.30, 0], [0.42, -0.16], [0.58, -0.16], [0.68, 0],
        [0.80, 0], [0.87, 0.15], [1, 0.15]
      ]) * vw;
    }

    if (holder) {
      holder.style.setProperty("--bx", bx.toFixed(1) + "px");
      holder.style.setProperty("--by", by.toFixed(1) + "px");
      holder.style.setProperty("--bs", bs.toFixed(3));
    }
    if (bottle) bottle.style.setProperty("--tilt", tilt.toFixed(2) + "deg");
    Bottle.set(rot);


    /* La grande forme marine porte le hero ; dès qu'on entre dans le récit
       elle se retire vers le coin, sinon elle avalerait les chapitres. */
    if (forme) {
      var sortie = clamp((p - 0.03) / 0.13, 0, 1);
      forme.style.transform =
        "translate3d(" + (sortie * 30).toFixed(1) + "vw," + (-sortie * 12).toFixed(1) + "vh,0)" +
        " scale(" + (1 - sortie * 0.3).toFixed(3) + ")";
    }

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

  var peint = -1;
  function loop() {
    smooth = lerp(smooth, target, 0.11);
    if (Math.abs(smooth - target) < 0.00012) smooth = target;
    /* rien n'a bougé : on rend la main au navigateur */
    if (smooth !== peint) { paint(smooth); peint = smooth; }
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
    Array.prototype.forEach.call(surfaces, function (el) {
      /* Piège : un clip-path réduit la boîte vue par l'IntersectionObserver.
         Sur un élément qui est lui-même observé, le volet l'empêcherait
         d'être jamais déclaré visible — il ne se lèverait donc jamais.
         Ces éléments-là gardent le fondu simple. */
      if (el.hasAttribute("data-reveal")) return;
      el.setAttribute("data-volet", "");
    });
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
   * 6 bis. Sélecteur de parfum du hero (flèches, puces, clavier)
   * ------------------------------------------------------------------ */
  (function parfums() {
    var VARIANTES = [
      {
        nom: "l'Originale", prix: "3,20 €", format: "la bouteille 33 cl",
        texte: "Citron pressé, zestes infusés 48 heures à froid, sucre de canne blond. La recette de 1953, sans colorant ni conservateur — pressée face à la mer, à Sète.",
        jus: ["#D9B860", "#EFD88C", "#FAEBB4", "#F4E19A", "#DEBF69", "#BC9B48"]
      },
      {
        nom: "la Rosée", prix: "3,40 €", format: "édition d'été, 33 cl",
        texte: "Le même citron, rejoint par le pamplemousse rose de Corse. Plus tendre en bouche, une amertume qui reste longue. Tirage d'été.",
        jus: ["#DFA07E", "#F5C6AC", "#FDE2D3", "#F7CDB6", "#E3A583", "#C67F5C"]
      },
      {
        nom: "la Verte", prix: "3,40 €", format: "édition d'été, 33 cl",
        texte: "Citron et menthe fraîche du Lodévois, infusée à froid elle aussi. Le nez part sur la menthe, la fin de bouche revient au citron.",
        jus: ["#A7C88A", "#CBE0B4", "#E6F1D8", "#D3E5BE", "#A9CB8C", "#84A968"]
      }
    ];
    var nom = document.querySelector("[data-var-nom]");
    var prix = document.querySelector("[data-var-prix]");
    var format = document.querySelector("[data-var-format]");
    var texte = document.querySelector("[data-var-texte]");
    var puces = document.querySelector("[data-puces]");
    if (!nom || !puces) return;

    var index = 0;

    VARIANTES.forEach(function (v, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-label", "Citrosétoise " + v.nom);
      b.addEventListener("click", function () { montre(i); });
      puces.appendChild(b);
    });

    function montre(i) {
      index = (i + VARIANTES.length) % VARIANTES.length;
      var v = VARIANTES[index];
      /* on ne repeint que le liquide : l'encre marine de l'étiquette,
         elle, ne doit pas changer de teinte. */
      for (var k = 0; k < v.jus.length; k++) {
        if (bottle) bottle.style.setProperty("--jus-" + (k + 1), v.jus[k]);
      }
      nom.textContent = v.nom;
      if (prix) prix.textContent = v.prix;
      if (format) format.textContent = v.format;
      if (texte) texte.textContent = v.texte;
      Array.prototype.forEach.call(puces.children, function (b, j) {
        b.setAttribute("aria-selected", j === index ? "true" : "false");
      });
    }

    var prec = document.querySelector("[data-var-prec]");
    var suiv = document.querySelector("[data-var-suiv]");
    if (prec) prec.addEventListener("click", function () { montre(index - 1); });
    if (suiv) suiv.addEventListener("click", function () { montre(index + 1); });
    document.addEventListener("keydown", function (e) {
      if (current !== 0) return;                       /* seulement pendant le hero */
      if (e.key === "ArrowLeft") montre(index - 1);
      if (e.key === "ArrowRight") montre(index + 1);
    });
    montre(0);
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
  mesureBande();
  fitBottle();
  /* une seconde passe après la mise en page des polices */
  window.addEventListener("load", function () {
    requestAnimationFrame(function () { mesureBande(); fitBottle(); target = readProgress(); });
  });
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
    vh = window.innerHeight; vw = window.innerWidth;
    mesureBande();
    fitBottle();
    target = readProgress();
  });
})();
