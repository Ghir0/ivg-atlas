/* IVG Atlas — interazioni locali, nessuna dipendenza esterna */
(function () {
  "use strict";

  var KEY = "ivg-atlas-board";

  /* ---------------- storage ---------------- */
  var mem = null;
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return mem || [];
    }
  }
  function write(ids) {
    mem = ids;
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (e) {}
    document.dispatchEvent(new CustomEvent("board:change", { detail: ids }));
  }
  function toggle(id) {
    var ids = read();
    var i = ids.indexOf(id);
    if (i === -1) { ids.push(id); } else { ids.splice(i, 1); }
    write(ids);
    return ids.indexOf(id) !== -1;
  }
  function idsFromUrl() {
    var p = new URLSearchParams(location.search).get("ids");
    return p ? p.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : null;
  }

  /* ---------------- toast ---------------- */
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, 1800);
  }

  /* ---------------- copia ---------------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? resolve() : reject(); }
      catch (e) { reject(e); }
      finally { document.body.removeChild(ta); }
    });
  }

  document.addEventListener("click", function (ev) {
    var hexBtn = ev.target.closest("[data-copy]");
    if (hexBtn) {
      var hex = hexBtn.getAttribute("data-copy");
      copyText(hex).then(function () {
        hexBtn.setAttribute("data-done", "1");
        toast(hex + " copiato");
        setTimeout(function () { hexBtn.removeAttribute("data-done"); }, 1400);
      }).catch(function () { toast("Copia non disponibile: " + hex); });
      return;
    }

    var preBtn = ev.target.closest("[data-copy-target]");
    if (preBtn) {
      var node = document.querySelector(preBtn.getAttribute("data-copy-target"));
      if (!node) return;
      copyText(node.textContent.trim()).then(function () {
        var old = preBtn.textContent;
        preBtn.textContent = "Copiato";
        toast("Prompt copiato negli appunti");
        setTimeout(function () { preBtn.textContent = old; }, 1600);
      }).catch(function () { toast("Copia non disponibile"); });
      return;
    }

    var tog = ev.target.closest("[data-board-toggle]");
    if (tog) {
      var on = toggle(tog.getAttribute("data-board-toggle"));
      syncToggles();
      toast(on ? "Aggiunta alla board" : "Tolta dalla board");
    }
  });

  function syncToggles() {
    var ids = read();
    document.querySelectorAll("[data-board-toggle]").forEach(function (el) {
      var on = ids.indexOf(el.getAttribute("data-board-toggle")) !== -1;
      el.setAttribute("aria-pressed", on ? "true" : "false");
      if (el.classList.contains("btn")) {
        el.textContent = on ? "Nella board · togli" : "Seleziona per il confronto";
        el.classList.toggle("btn-primary", !on);
      } else {
        el.textContent = on ? "In board" : "Board";
      }
    });
    document.querySelectorAll("#board-count-inline").forEach(function (el) {
      el.textContent = ids.length ? "(" + ids.length + ")" : "";
    });
  }

  /* ---------------- filtri ---------------- */
  var form = document.getElementById("filters");
  if (form) {
    var timer = null;
    form.querySelectorAll("[data-autosubmit]").forEach(function (el) {
      if (el.tagName === "SELECT") {
        el.addEventListener("change", function () { form.submit(); });
      } else {
        el.addEventListener("input", function () {
          clearTimeout(timer);
          timer = setTimeout(function () { form.submit(); }, 420);
        });
      }
    });
  }

  /* ---------------- board ---------------- */
  var dataEl = document.getElementById("atlas-data");
  if (dataEl) {
    var DATA = JSON.parse(dataEl.textContent);
    var byId = {};
    DATA.forEach(function (v) { byId[v.id] = v; });
    var rowsEl = document.getElementById("board-rows");
    var emptyEl = document.getElementById("board-empty");
    var statsEl = document.getElementById("board-stats");
    var selCount = document.getElementById("sel-count");
    var dupNote = document.getElementById("dup-note");
    var lecture = document.getElementById("lecture");

    /* un link con ?ids= vince sulla selezione locale e la riallinea */
    var fromUrl = idsFromUrl();
    if (fromUrl) {
      var valid = fromUrl.filter(function (id) { return byId[id]; });
      if (valid.length) write(valid);
    }

    function temperature(hex) {
      var r = parseInt(hex.substr(1, 2), 16) / 255,
          g = parseInt(hex.substr(3, 2), 16) / 255,
          b = parseInt(hex.substr(5, 2), 16) / 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      var l = (max + min) / 2, d = max - min, h = 0;
      var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      if (d !== 0) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
      }
      if (h < 0) h += 360;
      if (s < 0.12) return "neutro";
      if (h < 55 || h >= 330) return "caldo";
      if (h < 160) return "verde";
      return "freddo";
    }

    function hexes(v) { return v.palette.map(function (p) { return p.hex; }); }

    function render() {
      var ids = read().filter(function (id) { return byId[id]; });
      var sel = ids.map(function (id) { return byId[id]; });
      rowsEl.innerHTML = "";

      emptyEl.hidden = sel.length > 0;
      statsEl.hidden = !sel.length;
      lecture.hidden = !sel.length;
      selCount.textContent = sel.length ? "· " + sel.length : "";

      sel.forEach(function (v, i) {
        var row = document.createElement("div");
        row.className = "board-row";

        var name = document.createElement("div");
        name.className = "n";
        var a = document.createElement("a");
        a.href = "/voce/" + v.id;
        a.textContent = v.nome;
        a.style.border = "0";
        name.appendChild(a);
        var small = document.createElement("small");
        small.textContent = v.paese + (v.area ? " · " + v.area : "") + " · " +
          (v.registro === "entrambi" ? "Colorful + Color Block" : v.registro);
        name.appendChild(small);

        var strip = document.createElement("div");
        strip.className = "strip";
        strip.setAttribute("role", "img");
        strip.setAttribute("aria-label", "Palette di " + v.nome + ": " + hexes(v).join(", "));
        v.palette.forEach(function (p) {
          var s = document.createElement("span");
          s.style.background = p.hex;
          s.style.color = contrast(p.hex);
          s.textContent = p.hex.replace("#", "");
          s.title = (p.nome || "") + " " + p.hex + (p.uso ? " — " + p.uso : "");
          strip.appendChild(s);
        });

        var light = document.createElement("div");
        light.className = "light";
        light.textContent = v.luce || "luce non dichiarata";

        var del = document.createElement("button");
        del.className = "icon-btn";
        del.type = "button";
        del.textContent = "×";
        del.title = "Togli " + v.nome;
        del.setAttribute("aria-label", "Togli " + v.nome + " dalla board");
        del.addEventListener("click", function () {
          toggle(v.id);
          render();
          syncToggles();
        });

        row.appendChild(name);
        row.appendChild(strip);
        row.appendChild(light);
        row.appendChild(del);
        rowsEl.appendChild(row);
      });

      renderStats(sel);
    }

    function contrast(hex) {
      var r = parseInt(hex.substr(1, 2), 16) / 255,
          g = parseInt(hex.substr(3, 2), 16) / 255,
          b = parseInt(hex.substr(5, 2), 16) / 255;
      function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
      var lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      return lum > 0.179 ? "#101215" : "#F4F1EA";
    }

    function renderStats(sel) {
      var all = {};
      sel.forEach(function (v) {
        hexes(v).forEach(function (h) {
          all[h] = all[h] || [];
          all[h].push(v.nome);
        });
      });
      var uniq = Object.keys(all);
      var shared = uniq.filter(function (h) { return all[h].length > 1; });
      var temp = { caldo: 0, freddo: 0, neutro: 0, verde: 0 };
      uniq.forEach(function (h) { temp[temperature(h)]++; });

      statsEl.innerHTML =
        stat(sel.length, "voci selezionate") +
        stat(uniq.length, "colori distinti") +
        stat(shared.length, "colori condivisi") +
        stat(temp.caldo + " · " + temp.freddo + " · " + temp.neutro, "caldi · freddi · neutri");

      if (shared.length) {
        dupNote.innerHTML = shared.map(function (h) {
          return '<span class="dup">' + h + " ×" + all[h].length + "</span>";
        }).join(" ");
      } else {
        dupNote.innerHTML = '<span class="dup dup-ok">nessun colore identico tra le voci</span>';
      }

      var rec = document.getElementById("recurrences");
      if (rec) {
        var list = Object.keys(all).sort(function (a, b) { return all[b].length - all[a].length; }).slice(0, 12);
        rec.innerHTML = list.map(function (h) {
          return '<div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">' +
            '<span style="width:22px;height:22px;background:' + h + ';border:1px solid var(--line);flex:0 0 auto"></span>' +
            '<span class="mono">' + h + "</span>" +
            '<span style="color:var(--ink-mute)">' + all[h].length + "× · " + temperature(h) + "</span></div>";
        }).join("");
      }
    }

    function stat(v, k) {
      return '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + "</div></div>";
    }

    document.getElementById("export-btn").addEventListener("click", function () {
      var ids = read();
      if (!ids.length) { toast("Seleziona almeno una voce"); return; }
      if (document.documentElement.dataset.static === "1") { exportLocal(ids); return; }
      location.href = "/board/export?ids=" + encodeURIComponent(ids.join(","));
    });

    /* nella build statica il briefing si compone nel browser, senza server */
    function exportLocal(ids) {
      var data = JSON.parse(document.getElementById("atlas-data").textContent);
      var all = Array.isArray(data) ? data : (data.voci || []);
      var sel = all.filter(function (v) { return ids.indexOf(v.id) !== -1; });
      var line = "=".repeat(76), dash = "-".repeat(76);
      var out = ["IVG POETICA — BRIEFING DI SELEZIONE SET", "voci: " + sel.length, line, ""];
      sel.forEach(function (s) {
        out.push("[" + s.id.toUpperCase() + "] " + s.nome, dash,
          "Paese / area : " + s.paese + " / " + (s.area || "n.d."),
          "Tipologia    : " + (s.tipologia || "n.d."),
          "Registro     : " + s.registro,
          "Altezza      : " + (s.altezza || "n.d."),
          "Usi          : " + ((s.usi || []).join(", ") || "n.d."),
          "Palette      :");
        (s.palette || []).forEach(function (p) {
          out.push("   " + p.hex + "  " + (p.nome || "") + "  " + (p.uso || ""));
        });
        out.push("Luce         : " + (s.luce || "n.d."), "", "Prompt (EN):");
        var words = (s.prompt || "n.d.").split(/\s+/), cur = "   ";
        words.forEach(function (w) {
          if ((cur + w).length > 75) { out.push(cur); cur = "   " + w + " "; }
          else { cur += w + " "; }
        });
        out.push(cur.trimEnd(), "", line, "");
      });
      var blob = new Blob([out.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "poetica-briefing.txt";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      toast("Briefing esportato");
    }

    document.getElementById("clear-btn").addEventListener("click", function () {
      write([]);
      render();
      syncToggles();
      toast("Selezione svuotata");
    });

    document.getElementById("print-btn").addEventListener("click", function () { window.print(); });

    document.addEventListener("board:change", render);
    render();
  }

  syncToggles();
})();

/* ---------------- filtri lato client (versione statica) ----------------
   Nella build statica non c'è un server che legge i parametri: gli stessi
   controlli filtrano le card già presenti nel DOM tramite i data-*. */
(function () {
  "use strict";
  var form = document.getElementById("filters");
  if (!form || form.dataset.static !== "1") return;

  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  var total = cards.length;
  var countEl = document.querySelector(".count");
  var grid = document.querySelector(".grid");
  var empty = null;

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function apply() {
    var q = norm(val("q"));
    var paese = val("paese"), area = val("area"), tip = val("tipologia"),
        uso = val("uso"), reg = val("registro"), lusso = val("lusso");
    var shown = 0;

    cards.forEach(function (c) {
      var d = c.dataset, ok = true;
      if (q && norm(d.q).indexOf(q) === -1) ok = false;
      if (ok && paese && d.paese !== paese) ok = false;
      if (ok && area && d.area !== area) ok = false;
      if (ok && tip && d.tipologia !== tip) ok = false;
      if (ok && uso && (d.usi || "").split(",").indexOf(uso) === -1) ok = false;
      if (ok && reg && d.registro !== reg) ok = false;
      if (ok && lusso) {
        if (lusso === "non-classificato" ? d.lusso !== "" : d.lusso !== lusso) ok = false;
      }
      c.hidden = !ok;
      if (ok) shown++;
    });

    if (countEl) {
      var attivi = [q, paese, area, tip, uso, reg, lusso].filter(Boolean).length;
      countEl.innerHTML = "<b>" + shown + "</b> di " + total + " voci" +
        (attivi ? " · " + attivi + (attivi === 1 ? " filtro attivo" : " filtri attivi") : "");
    }
    if (!shown && grid && !empty) {
      empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = '<p style="margin:0 0 12px">Nessuna voce corrisponde ai filtri attivi.</p>' +
                        '<button class="btn" type="button" id="empty-reset">Azzera i filtri</button>';
      grid.parentNode.insertBefore(empty, grid.nextSibling);
      empty.addEventListener("click", reset);
    } else if (shown && empty) {
      empty.remove(); empty = null;
    }
    var u = new URL(location.href);
    var qs = new URLSearchParams();
    [["q", q], ["paese", paese], ["area", area], ["tipologia", tip], ["uso", uso],
     ["registro", reg], ["lusso", lusso]].forEach(function (p) {
      if (p[1] && !(p[0] === "q" && !document.getElementById("q").value.trim())) qs.set(p[0], p[1]);
    });
    history.replaceState(null, "", qs.toString() ? "?" + qs.toString() : location.pathname);
  }

  function reset() {
    ["q", "paese", "area", "tipologia", "uso", "registro", "lusso"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = "";
    });
    apply();
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); apply(); });
  form.addEventListener("input", apply);
  form.addEventListener("change", apply);

  var clear = document.createElement("a");
  clear.className = "clear";
  clear.href = "#";
  clear.textContent = "Azzera filtri";
  clear.style.display = "none";
  clear.addEventListener("click", function (e) { e.preventDefault(); reset(); });
  if (countEl && countEl.parentNode) countEl.parentNode.appendChild(clear);
  var obs = function () {
    var any = ["q", "paese", "area", "tipologia", "uso", "registro", "lusso"].some(val);
    clear.style.display = any ? "" : "none";
  };
  form.addEventListener("input", obs);
  form.addEventListener("change", obs);

  // stato iniziale: rispetta eventuali parametri nel link condiviso
  var sp = new URLSearchParams(location.search);
  ["q", "paese", "area", "tipologia", "uso", "registro", "lusso"].forEach(function (id) {
    if (sp.get(id)) { var el = document.getElementById(id); if (el) el.value = sp.get(id); }
  });
  apply(); obs();
})();
