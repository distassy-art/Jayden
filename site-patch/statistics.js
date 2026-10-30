(function () {
  function ident(s) {
    s = String(s || "").trim().toLowerCase();
    var at = s.indexOf("@");
    return at === -1 ? s : s.slice(0, at);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function email() { return ident(sessionStorage.getItem("ss_email") || ""); }
  function isAdmin() {
    var em = email();
    return sessionStorage.getItem("ss_ok") === "1" && sessionStorage.getItem("ss_role") === "owner" &&
      (em === "admin" || em === "smartsolutionsai");
  }
  function money(n) {
    n = Number(n);
    if (!isFinite(n)) return "—";
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  }

  var view = document.getElementById("view");
  if (!view) return;
  if (sessionStorage.getItem("ss_mgr") === "1" && sessionStorage.getItem("ss_ok") !== "1") {
    location.href = "/mgr-profile.html";
    return;
  }
  if (!isAdmin()) {
    location.href = sessionStorage.getItem("ss_ok") ? "/overview.html" : "/portal.html";
    return;
  }

  var rows = [];
  var storeSel = document.getElementById("stStoreFilter");
  var vendorSel = document.getElementById("stVendorFilter");
  var searchInp = document.getElementById("stSearch");
  var body = document.getElementById("stBody");
  var summary = document.getElementById("stSummary");
  var metaEl = document.getElementById("stMeta");

  function filtered() {
    var store = storeSel.value;
    var vendor = vendorSel.value;
    var q = String(searchInp.value || "").trim().toLowerCase();
    return rows.filter(function (r) {
      if (store && String(r.store) !== store) return false;
      if (vendor && String(r.vendor) !== vendor) return false;
      if (q) {
        var hay = (r.client + " " + r.vendor + " " + r.store).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function render() {
    var list = filtered();
    var year = 0, avgSum = 0;
    list.forEach(function (r) {
      year += Number(r.year_spend) || 0;
      avgSum += Number(r.avg_per_month) || 0;
    });
    summary.innerHTML =
      "<span>Rows <b>" + list.length + "</b></span>" +
      "<span>Year spend <b>" + money(year) + "</b></span>" +
      "<span>Sum of monthly avgs <b>" + money(avgSum) + "</b></span>";

    if (!list.length) {
      body.innerHTML = '<tr><td colspan="7" class="st-empty">No vendors match these filters.</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (r) {
      return "<tr>" +
        "<td>" + esc(r.client) + '<div class="store">' + esc(r.store) + "</div></td>" +
        "<td>" + esc(r.vendor) + "</td>" +
        "<td>" + esc(r.delivery_days || "—") + "</td>" +
        '<td class="num">' + money(r.year_spend) + "</td>" +
        '<td class="num"><b>' + money(r.avg_per_month) + "</b></td>" +
        '<td class="num">' + esc(r.months_active) + "</td>" +
        '<td class="num">' + esc(r.invoices) + "</td>" +
        "</tr>";
    }).join("");
  }

  function fillFilters() {
    var stores = {};
    var vendors = {};
    rows.forEach(function (r) {
      stores[r.store] = r.client;
      vendors[r.vendor] = 1;
    });
    var storeOpts = Object.keys(stores).sort(function (a, b) {
      return String(stores[a]).localeCompare(String(stores[b]));
    }).map(function (id) {
      return '<option value="' + esc(id) + '">' + esc(stores[id]) + " (" + esc(id) + ")</option>";
    }).join("");
    storeSel.innerHTML = '<option value="">All stores</option>' + storeOpts;
    vendorSel.innerHTML = '<option value="">All vendors</option>' +
      Object.keys(vendors).sort().map(function (v) {
        return '<option value="' + esc(v) + '">' + esc(v) + "</option>";
      }).join("");
  }

  storeSel.addEventListener("change", render);
  vendorSel.addEventListener("change", render);
  searchInp.addEventListener("input", render);

  fetch("/data/vendor-avg-per-month-2026.json", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      rows = Array.isArray(data.rows) ? data.rows.slice() : [];
      rows.sort(function (a, b) {
        var c = String(a.client).localeCompare(String(b.client));
        if (c) return c;
        return (Number(b.avg_per_month) || 0) - (Number(a.avg_per_month) || 0);
      });
      var m = data.meta || {};
      metaEl.textContent =
        (m.source || "S2K Non-Fuel invoices") +
        ". Avg / month = year spend ÷ months with invoices." +
        (m.note ? " " + m.note : "") +
        (m.generated ? " Generated " + String(m.generated).slice(0, 10) + "." : "");
      fillFilters();
      render();
    })
    .catch(function (err) {
      metaEl.textContent = "Could not load vendor averages.";
      body.innerHTML = '<tr><td colspan="7" class="st-empty">Failed to load data (' + esc(err && err.message) + ").</td></tr>";
    });
})();
