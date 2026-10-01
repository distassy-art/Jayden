(function () {
  var page = (document.body && document.body.getAttribute("data-page")) || "";
  var ownerPages = {
    home: 1, overview: 1, monthly: 1, month: 1, fuel: 1, purchases: 1, waste: 1,
    departments: 1, profit: 1, daily: 1, stations: 1, rankings: 1,
    profile: 1, ask: 1, billing: 1, pnl: 1, weekly: 1, schedule: 1, yearly: 1, tickets: 1, admin: 1,
    "vendor-calendar": 1, statistics: 1
  };
  var ok = sessionStorage.getItem("ss_ok");
  var role = sessionStorage.getItem("ss_role") || "";
  var isMgr = sessionStorage.getItem("ss_mgr") === "1" || role === "manager";
  var email = (sessionStorage.getItem("ss_email") || "").toLowerCase();
  function isAdmin() {
    return email === "smartsolutionsai" || email === "admin";
  }

  var mgrPages = page === "manager" || page.indexOf("mgr-") === 0;
  if (page === "books") {
    location.replace("/yearly.html");
    return;
  } else if (mgrPages) {
    if (!isMgr) {
      location.href = ok ? (isAdmin() ? "/app.html" : "/overview.html") : "/portal.html";
      return;
    }
  } else if (ownerPages[page] || page === "weekly" || page === "yearly") {
    if (isMgr) {
      location.href = page === "profile" ? "/mgr-profile.html" : "/manager.html";
      return;
    }
    if (!ok) {
      location.href = "/portal.html";
      return;
    }
  }

  var flow = [
    ["daily.html", "Daily", "daily"],
    ["weekly.html", "Weekly", "weekly"],
    ["monthly.html", "Monthly", "monthly"],
    ["yearly.html", "Yearly", "yearly"]
  ];
  var more = [
    ["overview.html", "Cover", "overview"],
    ["fuel.html", "Fuel", "fuel"],
    ["purchases.html", "Purchases", "purchases"],
    ["departments.html", "Departments", "departments"],
    ["profit.html", "Profit", "profit"],
    ["schedule.html", "Schedule", "schedule"],
    ["stations.html", "Stations", "stations"],
    ["rankings.html", "Rankings", "rankings"],
    ["profile.html", "Profile", "profile"],
    ["billing.html", "Billing", "billing"],
    ["pnl.html", "P&L", "pnl"],
    ["ask.html", "Ask our team", "ask"]
  ];
  if (isAdmin()) {
    more.unshift(["app.html", "Home", "home"]);
    more.push(["vendor-calendar.html", "Vendor calendar", "vendor-calendar"]);
    more.push(["statistics.html", "Statistics", "statistics"]);
  }

  var mgrNav = [
    ["manager.html", "Daily", "manager"],
    ["mgr-weekly.html", "Weekly", "mgr-weekly"],
    ["mgr-monthly.html", "Monthly", "mgr-monthly"],
    ["mgr-yearly.html", "Yearly", "mgr-yearly"],
    ["mgr-schedule.html", "Schedule", "mgr-schedule"],
    ["mgr-payroll.html", "Payroll", "mgr-payroll"],
    ["mgr-vendor-orders.html", "Vendor orders", "mgr-vendor-orders"],
    ["mgr-pricing.html", "Pricing", "mgr-pricing"],
    ["mgr-s2k-invoices.html", "S2K invoices", "mgr-s2k-invoices"],
    ["mgr-profile.html", "Profile", "mgr-profile"]
  ];
  var mgrSection = page === "manager" || page.indexOf("mgr-") === 0;

  function showRankingsNav() {
    var st = sessionStorage.getItem("ss_station") || "";
    if (st === "all") return true;
    if (!isAdmin()) return false;
    if (st === "owner:bigdaddy" || st === "owner:arco-db-hb") return true;
    return false;
  }

  function filingHtml() {
    var cur = { daily: 0, weekly: 1, monthly: 2, yearly: 3, month: 2 }[page];
    var steps = flow.map(function (it, i) {
      var cls = "todo";
      if (cur === i) cls = "on";
      else if (cur != null && i < cur) cls = "done";
      var on = it[2] === page || (page === "month" && it[2] === "monthly") ? " on" : "";
      return '<li class="' + cls + '" data-step="' + it[2] + '"><a href="' + it[0] + '"' + (on ? ' class="on"' : "") + '><span class="n">' + (i + 1) + '</span><span class="t">' + it[1] + "</span></a></li>";
    }).join("");
    var moreLinks = more.filter(function (it) {
      return it[2] !== "rankings" || showRankingsNav();
    }).map(function (it) {
      var on = (it[2] === page || (page === "month" && it[2] === "monthly")) ? ' class="on"' : "";
      return '<a href="' + it[0] + '"' + on + ">" + it[1] + "</a>";
    }).join("");
    var adminLink = isAdmin()
      ? '<a class="nav-admin' + (page === "tickets" || page === "admin" || page === "statistics" || page === "vendor-calendar" ? " on" : "") + '" href="tickets.html">Admin</a>'
      : "";
    return '<div class="file-label">Filing steps</div><ol class="file-steps">' + steps + '</ol>' + adminLink + '<details class="file-more"' + (cur == null ? " open" : "") + '><summary>More</summary>' + moreLinks + "</details>";
  }

  function navHtml(items) {
    return items.map(function (it) {
      var on = (it[2] === page) ? ' class="on"' : "";
      return '<a href="' + it[0] + '"' + on + ">" + it[1] + "</a>";
    }).join("");
  }

  var app = document.querySelector(".app");
  if (app && ok && !mgrSection) app.classList.add("s2k");

  if (mgrSection || (isMgr && !ok)) {
    var nav = document.querySelector(".side nav");
    if (nav) nav.innerHTML = navHtml(mgrNav);
    var brand = document.querySelector(".side .brand");
    if (brand) brand.setAttribute("href", "manager.html");
    var pick = document.querySelector(".side .pick");
    if (pick && (page === "profile" || page === "ask" || page === "mgr-profile")) pick.style.display = "none";
  } else if (ok) {
    var nav = document.querySelector(".side nav");
    if (nav) nav.innerHTML = filingHtml();
    var brand = document.querySelector(".side .brand");
    if (brand) brand.setAttribute("href", isAdmin() ? "app.html" : "overview.html");
  }

  document.querySelectorAll(".out a").forEach(function (a) {
    if (a.textContent.replace(/\s+/g, " ").trim() !== "Log out") return;
    a.addEventListener("click", function (ev) {
      ev.preventDefault();
      sessionStorage.removeItem("ss_mgr");
      sessionStorage.removeItem("ss_role");
      sessionStorage.removeItem("ss_email");
      sessionStorage.removeItem("ss_ok");
      sessionStorage.removeItem("ss_stores");
      sessionStorage.removeItem("ss_station");
      sessionStorage.removeItem("ss_core_emp");
      location.href = "/";
    });
  });
})();
