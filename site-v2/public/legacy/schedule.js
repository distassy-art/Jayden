(function () {
  var C = null;
  var tab = "home";
  var sub = "manager";
  var weekMon = "";
  var dayYmd = "";
  var showTerm = false;
  var searchQ = "";
  var selectedEmp = "";
  var payMode = "day";
  var payStart = "";
  var groupBy = "custom";
  var showEvents = true;
  var showOpen = true;
  var scheduledOnly = false;
  var toolsOpen = false;
  var filtersOpen = false;
  var payEditDay = "";

  function $(id) { return document.getElementById(id); }
  function rawSid() { return sessionStorage.getItem("ss_station") || ""; }
  function sid() {
    var s = rawSid();
    var email = (sessionStorage.getItem("ss_email") || "").toLowerCase();
    if ((email === "racheloberholtzer" || email === "arcodb@outlook.com") && (!s || s === "all")) s = "42352";
    // Keep Diamond Bar data alias; every other store uses its S2K id as location key.
    if (s === "42352") return "diamond";
    return s;
  }
  function locName() { return C.locationLabel(sid()) || C.FIRST_LOCATION; }
  function needStore() {
    var s = rawSid();
    var email = (sessionStorage.getItem("ss_email") || "").toLowerCase();
    if (email === "racheloberholtzer" || email === "arcodb@outlook.com") return false;
    if (s && s !== "all") return false;
    return true;
  }
  function isMgrSchedulePage() {
    return (document.body && document.body.getAttribute("data-page")) === "mgr-schedule";
  }
  function isArcoDbLive() {
    var s = rawSid();
    var email = (sessionStorage.getItem("ss_email") || "").toLowerCase();
    if (email === "racheloberholtzer" || email === "arcodb@outlook.com") return true;
    if (s === "42352" || s === "diamond") return true;
    return false;
  }
  // Manager Schedule is live for EVERY client store (same UI), not only Arco Db.
  function isMgrScheduleLive() {
    if (!isMgrSchedulePage()) return isArcoDbLive();
    if (needStore()) return false;
    return true;
  }
  function lockMgrArco() {
    // Only default Rachel / empty station to Db — never overwrite another store's ss_station.
    if (!isMgrSchedulePage()) return;
    var s = rawSid();
    var email = (sessionStorage.getItem("ss_email") || "").toLowerCase();
    if (s && s !== "all") return;
    if (email === "racheloberholtzer" || email === "arcodb@outlook.com") {
      try { sessionStorage.setItem("ss_station", "42352"); } catch (e) {}
    }
  }
  function allowedHere() {
    if (sessionStorage.getItem("ss_ok")) return true;
    if (sessionStorage.getItem("ss_mgr") === "1") return true;
    if ((sessionStorage.getItem("ss_role") || "") === "manager") return true;
    if ((sessionStorage.getItem("ss_email") || "").toLowerCase() === "racheloberholtzer") return true;
    return false;
  }
  // A manager for the purpose of writing the shared schedule/tasks. Mirrors the
  // signals canManagePay/canDecideTimeOff already trust, so write access lines
  // up with who can edit this page at all.
  function isManagerHere() {
    if (sessionStorage.getItem("ss_mgr") === "1") return true;
    if ((sessionStorage.getItem("ss_role") || "") === "manager") return true;
    if ((sessionStorage.getItem("ss_email") || "").toLowerCase() === "racheloberholtzer") return true;
    if (sessionStorage.getItem("ss_ok")) return true;
    try {
      var id = sessionStorage.getItem("ss_core_emp");
      if (id && C && C.isManagerEmployee) return !!C.isManagerEmployee(C.employeeById(id));
    } catch (e) {}
    // Embedded in the /new console, which stores its signed-in user here. An
    // owner or store manager may publish the schedule; an accountant (timesheets
    // only) stays read-only.
    try {
      var raw = sessionStorage.getItem("ssv2_session");
      if (raw) {
        var u = JSON.parse(raw);
        if (u && (u.role === "owner" || u.role === "manager")) return true;
      }
    } catch (e) {}
    return false;
  }
  function canManagePay() {
    if (sessionStorage.getItem("ss_mgr") === "1") return true;
    if ((sessionStorage.getItem("ss_role") || "") === "manager") return true;
    if ((sessionStorage.getItem("ss_email") || "").toLowerCase() === "racheloberholtzer") return true;
    if (sessionStorage.getItem("ss_ok")) return true;
    try {
      var id = sessionStorage.getItem("ss_core_emp");
      if (id && C && C.isManagerEmployee) return !!C.isManagerEmployee(C.employeeById(id));
    } catch (e) {}
    return false;
  }
  function canDecideTimeOff() {
    if (sessionStorage.getItem("ss_mgr") === "1") return true;
    if ((sessionStorage.getItem("ss_email") || "").toLowerCase() === "racheloberholtzer") return true;
    if (sessionStorage.getItem("ss_ok")) return true;
    try {
      var id = sessionStorage.getItem("ss_core_emp");
      if (id && C && C.isManagerEmployee) return !!C.isManagerEmployee(C.employeeById(id));
    } catch (e) {}
    return false;
  }
  function managerActor() {
    var email = (sessionStorage.getItem("ss_email") || "").toLowerCase();
    if (email === "racheloberholtzer") return "RachelOberholtzer";
    if (sessionStorage.getItem("ss_ok")) return "owner";
    return email || "manager";
  }
  function managerMeta() {
    return { editedBy: managerActor(), editedAt: C.nowISO() };
  }
  function hrs2(n) {
    return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  }
  function fmtHrs(n) {
    n = Math.round((Number(n) || 0) * 100) / 100;
    if (!n) return "0 hrs";
    var whole = Math.round(n * 100) % 100 === 0;
    return (whole ? String(Math.round(n)) : n.toFixed(2).replace(/0$/, "")) + " hrs";
  }
  function daySchedHours(empId, dateYmd) {
    if (C.isTimeOff(empId, sid(), dateYmd)) return 0;
    var sh = C.shiftsFor(sid(), dateYmd, empId)[0];
    if (!sh) return 0;
    return C.hoursBetween(sh.start, sh.end);
  }
  function varianceCls(actual, scheduled) {
    var d = Math.round(((Number(actual) || 0) - (Number(scheduled) || 0)) * 100) / 100;
    if (d > 0.05) return "over";
    if (d < -0.05) return "under";
    return "even";
  }
  function empNameBtn(e) {
    return '<button type="button" class="emp-link" data-payemp="' + C.esc(e.id) + '">' + C.esc(e.name) + "</button>";
  }
  function hmMinutes(hhmm) {
    var parts = String(hhmm || "").split(":");
    var h = Number(parts[0]);
    var m = Number(parts[1] || 0);
    if (isNaN(h) || isNaN(m)) return -1;
    return h * 60 + m;
  }
  function shiftBand(sh) {
    if (!sh || !sh.start) return "";
    var start = hmMinutes(sh.start);
    var end = hmMinutes(sh.end);
    if (start < 0) return "";
    if (end >= 0 && end < start) return "night";
    if (start >= 22 * 60) return "night";
    if (start >= 12 * 60) return "second";
    return "morning";
  }
  function leaderSign() {
    return '<span class="hb-leader-sign" title="Shift leader">★ Leader</span>';
  }
  function catalogSelectHtml(id) {
    var html = '<select class="fld" id="' + id + '"><option value="">Custom…</option>';
    var sec = "";
    C.catalog().forEach(function (t) {
      if (t.section !== sec) {
        if (sec) html += "</optgroup>";
        sec = t.section;
        html += '<optgroup label="' + C.esc(sec) + '">';
      }
      html += '<option value="' + C.esc(t.id) + '">' + C.esc(t.title) +
        (t.requiresPhoto ? " (photo)" : "") + "</option>";
    });
    if (sec) html += "</optgroup>";
    return html + "</select>";
  }
  function reassignSelectHtml(asgId, fromEmpId) {
    var html = '<select class="fld reas-sel" data-reassign="' + C.esc(asgId) + '" aria-label="Switch task to">';
    html += '<option value="">Switch to…</option>';
    activePeople().forEach(function (p) {
      if (p.id === fromEmpId) return;
      html += '<option value="' + C.esc(p.id) + '">' + C.esc(p.name) + "</option>";
    });
    return html + "</select>";
  }
  function addTaskFormHtml(empId, dateYmd, prefix) {
    prefix = prefix || "day";
    return '<div class="task-add"><h4>Add task this day</h4><div class="form-grid">' +
      "<div><label>From cheat sheet</label>" + catalogSelectHtml(prefix + "Cat") + "</div>" +
      '<div><label>Or title</label><input class="fld" id="' + prefix + 'Title" autocomplete="off"></div>' +
      '<div><label><input type="checkbox" id="' + prefix + 'Photo"> Requires photo</label></div>' +
      '<div style="align-self:end">' + btn("btn cyan", "Add task", ' data-adddaytask="' +
        C.esc(empId) + '" data-date="' + C.esc(dateYmd) + '" data-prefix="' + prefix + '"') +
      "</div></div></div>";
  }

  function setHash() {
    try { history.replaceState(null, "", "#" + tab + "/" + sub); } catch (e) {}
  }
  function readHash() {
    var h = (location.hash || "").replace(/^#/, "");
    if (!h) return;
    var p = h.split("/");
    if (p[0]) tab = p[0];
    if (p[1]) sub = p[1];
  }

  function btn(cls, label, attrs) {
    return '<button type="button" class="' + (cls || "btn") + '"' + (attrs || "") + ">" + label + "</button>";
  }

  var MAIL_FROM = "schedule@smartsolutionsai26.onmicrosoft.com";
  var MANAGER_EMAIL = "reoberholtzer@gmail.com";
  var ROSTER_EMAIL = {
    alexhiga: "alexkaitohiga@gmail.com",
    damonlowe: "lowedamon2469@gmail.com",
    elviaarriola: "elvia.arriola@icloud.com",
    glendadelatorre: "glendamtt@yahoo.com",
    hugocanales: "canales.h015@gmail.com",
    josephcho: "cho6059415@gmail.com",
    kenceasar: "kceasar@avc.com",
    michellesmith: "m.smith0616@gmail.com",
    oliversanchez: "noafifx@gmail.com",
    racheloberholtzer: "reoberholtzer@gmail.com",
    tylershenk: "tjack2004@gmail.com"
  };

  function fmtHomebaseTime(hhmm) {
    if (!hhmm) return "";
    var parts = String(hhmm).split(":");
    var h = Number(parts[0]);
    var m = String(parts[1] != null ? parts[1] : "00");
    if (isNaN(h)) return hhmm;
    if (m.length === 1) m = "0" + m;
    var ap = h >= 12 ? "pm" : "am";
    var h12 = h % 12;
    if (!h12) h12 = 12;
    return h12 + ":" + m + ap;
  }
  function rosterPhotoUrl(e) {
    if (!e || !e.photo) return "";
    var p = String(e.photo);
    if (/^https?:\/\//i.test(p) || p.indexOf("data:") === 0) return p;
    return p.charAt(0) === "/" ? p : ("/" + p.replace(/^\.?\//, ""));
  }
  function rosterAvatar(e, cls) {
    var src = rosterPhotoUrl(e);
    if (!src) return '<span class="roster-ph ' + (cls || "") + '" aria-hidden="true">' +
      C.esc((e && e.name || "?").charAt(0)) + "</span>";
    return '<img class="roster-pic ' + (cls || "") + '" alt="" src="' + C.esc(src) + '">';
  }
  function emailFor(name, emp) {
    if (emp && emp.email) return String(emp.email).trim();
    var found = emp || null;
    if (!found) {
      var list = C.employees(sid()) || [];
      for (var i = 0; i < list.length; i++) {
        if (C.normName(list[i].name) === C.normName(name)) { found = list[i]; break; }
      }
    }
    if (found && found.email) return String(found.email).trim();
    return ROSTER_EMAIL[C.normName(name)] || "";
  }
  function dayNum(ymd) {
    return String(Number(String(ymd || "").split("-")[2] || 0));
  }
  function weekSig() {
    var dates = C.weekDates(weekMon);
    var rows = [];
    activePeople().forEach(function (e) {
      dates.forEach(function (d) {
        var off = C.isTimeOff(e.id, sid(), d);
        var sh = C.shiftsFor(sid(), d, e.id)[0];
        if (off) rows.push(e.id + "|" + d + "|off");
        else if (sh) rows.push(e.id + "|" + d + "|" + (sh.start || "") + "|" + (sh.end || "") + "|" + (sh.leader ? "L" : ""));
      });
    });
    return rows.sort().join("\n");
  }
  function unpublishedCount() {
    var now = weekSig();
    var st = C.getState() || {};
    var rec = (st.publishedWeeks || {})[sid() + ":" + weekMon];
    if (!now) return 0;
    if (!rec || !rec.sig) return now.split("\n").length;
    if (rec.sig === now) return 0;
    var a = {}, b = {}, n = 0;
    rec.sig.split("\n").forEach(function (x) { if (x) a[x] = 1; });
    now.split("\n").forEach(function (x) { if (x) b[x] = 1; });
    now.split("\n").forEach(function (x) { if (x && !a[x]) n++; });
    rec.sig.split("\n").forEach(function (x) { if (x && !b[x]) n++; });
    return n;
  }
  function markWeekPublished() {
    var st = C.getState();
    if (!st.publishedWeeks) st.publishedWeeks = {};
    st.publishedWeeks[sid() + ":" + weekMon] = { at: C.nowISO(), sig: weekSig() };
    C.persist();
  }
  function fmtMonthDay(ymd) {
    if (!ymd) return "";
    var p = String(ymd).split("-");
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    return dt.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  }
  function initials(name) {
    var s = String(name || "").trim();
    var bits = s.match(/[A-Z][a-z]+|[A-Z]+(?![a-z])/g);
    if (bits && bits.length >= 2) {
      return (bits[0].charAt(0) + bits[bits.length - 1].charAt(0)).toUpperCase();
    }
    if (s.length >= 2) return s.slice(0, 2).toUpperCase();
    return (s.charAt(0) || "?").toUpperCase();
  }
  function avHue(name) {
    var s = String(name || "");
    var n = 0;
    for (var i = 0; i < s.length; i++) n += s.charCodeAt(i) * (i + 3);
    return n % 360;
  }
  function whoCell(e, weekHrs) {
    var role = C.roleName(e.roleId) || e.role || "";
    var hue = avHue(e.name);
    var hrs = weekHrs == null ? "" : '<div class="hb-emphrs">' + C.esc(fmtHrs(weekHrs)) + "</div>";
    return '<div class="hb-name"><span class="hb-av" style="background:hsl(' + hue + ',42%,36%);color:#fff">' +
      C.esc(initials(e.name)) + "</span><div><b>" + C.esc(e.name) + "</b>" +
      (role ? '<div class="hb-role">' + C.esc(role) + "</div>" : "") + hrs + "</div></div>";
  }
  function dayLine(e, d) {
    if (C.isTimeOff(e.id, sid(), d)) return "Off";
    var sh = C.shiftsFor(sid(), d, e.id)[0];
    if (sh) return fmtHomebaseTime(sh.start) + "–" + fmtHomebaseTime(sh.end) + (sh.leader ? "  ★ Leader" : "");
    return "—";
  }
  function weekRangeLabel(dates) {
    return fmtMonthDay(dates[0]) + " – " + fmtMonthDay(dates[6]);
  }
  function scheduleSubject(dates, who) {
    var s = locName() + " schedule · " + weekRangeLabel(dates);
    if (who) s += " · " + who;
    return s;
  }
  function personWeekLines(e, dates) {
    return dates.map(function (d, i) {
      return C.DAYS[i] + " " + fmtMonthDay(d) + "  " + dayLine(e, d);
    });
  }
  function compactWeek(e, dates) {
    return dates.map(function (d, i) {
      return C.DAYS[i] + " " + dayLine(e, d);
    }).join(" · ");
  }
  function dayTaskLines(empId, dateYmd) {
    return empTasks(empId, dateYmd).map(function (t) {
      var src = t.a.source === "cheatsheet" ? "cheat sheet" : "standing";
      var st = t.done ? "done" : "not done";
      var photo = t.a.requiresPhoto ? "; photo required" : "";
      return "    • " + t.a.title + " (" + src + "; " + st + photo + ")";
    });
  }
  function personWeekText(e, dates) {
    var lines = [];
    dates.forEach(function (d, i) {
      lines.push(C.DAYS[i] + " " + dayNum(d) + "  " + dayLine(e, d));
      dayTaskLines(e.id, d).forEach(function (ln) { lines.push(ln); });
    });
    return lines.join("\n");
  }
  function personWeekBody(e, dates) {
    var role = C.roleName(e.roleId) || e.role || "";
    var hrs = C.hoursForRange(e.id, sid(), dates[0], dates[6]);
    var leadDays = dates.filter(function (d) {
      var sh = C.shiftsFor(sid(), d, e.id)[0];
      return sh && sh.leader && !C.isTimeOff(e.id, sid(), d);
    }).map(function (d, i) { return C.DAYS[dates.indexOf(d)] + " " + fmtMonthDay(d); });
    return "From: " + MAIL_FROM + "\n\nHi " + e.name + ",\n\nYour shifts and tasks at " + locName() +
      " for " + weekRangeLabel(dates) + ".\n\n" +
      (leadDays.length ? "You are shift leader on: " + leadDays.join(", ") + ".\n\n" : "") +
      (role ? role + "\n" : "") +
      personWeekText(e, dates) +
      "\n\nHours this week: " + hrs + "\n\n— Smart Solutions Schedule\n";
  }
  function managerPacketBody(dates) {
    var blocks = [
      "From: " + MAIL_FROM,
      "Full week schedule for " + locName() + " · " + weekRangeLabel(dates),
      "For: RachelOberholtzer",
      ""
    ];
    activePeople().forEach(function (e) {
      var role = C.roleName(e.roleId) || e.role || "";
      var hrs = C.hoursForRange(e.id, sid(), dates[0], dates[6]);
      blocks.push(e.name + (role ? " · " + role : ""));
      blocks.push(personWeekText(e, dates));
      blocks.push("Hours this week: " + hrs);
      blocks.push("");
    });
    blocks.push("— Smart Solutions Schedule");
    return blocks.join("\n");
  }
  function composePublishEmails() {
    var dates = C.weekDates(weekMon);
    var range = weekRangeLabel(dates);
    var loc = locName();
    var list = activePeople();
    var scheduled = list.filter(function (e) {
      return dates.some(function (d) {
        return C.isTimeOff(e.id, sid(), d) || C.shiftsFor(sid(), d, e.id)[0];
      });
    });
    var msgs = [];
    var skipped = [];
    scheduled.forEach(function (e) {
      var to = emailFor(e.name);
      if (!to) { skipped.push(e.name); return; }
      msgs.push({
        kind: "employee",
        name: e.name,
        to: to,
        from: MAIL_FROM,
        subject: "Your schedule · " + loc + " · " + range,
        body: personWeekBody(e, dates)
      });
    });
    msgs.push({
      kind: "manager",
      name: "RachelOberholtzer",
      to: MANAGER_EMAIL,
      from: MAIL_FROM,
      subject: "Full week schedule · " + loc + " · " + range,
      body: managerPacketBody(dates)
    });
    return { msgs: msgs, skipped: skipped, scheduled: scheduled.length };
  }

  function openMailto(to, subject, body) {
    var href = "mailto:" + (to || "") +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
    location.href = href;
    flash("Email draft opened");
  }
  function copyText(text, okMsg) {
    function done() { flash(okMsg || "Copied"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copy", text); });
    } else {
      window.prompt("Copy", text);
    }
  }

  function shell(inner) {
    var loc = locName();
    var weekLabel = "";
    var onPeriod = tab === "timesheets" && sub === "period";
    var navActs;
    if (onPeriod) {
      var per = C.payPeriodOf(payStart || C.todayYMD());
      weekLabel = C.formatYMD(per.start) + " – " + C.formatYMD(per.end);
      navActs =
        btn("btn ghost", "‹", ' data-act="prevPeriod"') +
        "<span>" + C.esc(weekLabel) + "</span>" +
        btn("btn ghost", "›", ' data-act="nextPeriod"') +
        btn("btn ghost", "This period", ' data-act="thisPeriod"');
    } else {
      if (weekMon) {
        var dates = C.weekDates(weekMon);
        weekLabel = C.formatYMD(dates[0]) + " – " + C.formatYMD(dates[6]);
      }
      navActs =
        btn("btn ghost", "‹", ' data-act="prevWeek"') +
        "<span>" + C.esc(weekLabel) + "</span>" +
        btn("btn ghost", "›", ' data-act="nextWeek"') +
        btn("btn ghost", "This week", ' data-act="thisWeek"');
    }
    return (
      '<div class="sch-loc">' + C.esc(loc) + "</div>" +
      '<div class="sch-head"><div><h1>Schedule</h1>' +
      '<p class="lead" style="margin:6px 0 0">First location. Employees use Core at <a href="get-core.html">get-core.html</a>.</p></div>' +
      '<div class="sch-week">' + navActs + "</div></div>" +
      '<nav class="hb-nav">' +
        tabBtn("home", "Home") +
        tabBtn("team", "Team") +
        tabBtn("shifts", "Shifts") +
        tabBtn("timesheets", "Timesheets") +
      "</nav>" +
      '<div class="hb-sub" id="hbSub">' + subNav() + "</div>" +
      '<div id="hbView">' + inner + "</div>"
    );
  }
  function tabBtn(id, label) {
    return '<button type="button" data-tab="' + id + '"' + (tab === id ? ' class="on"' : "") + ">" + label + "</button>";
  }
  function subBtn(id, label) {
    return '<button type="button" data-sub="' + id + '"' + (sub === id ? ' class="on"' : "") + ">" + label + "</button>";
  }
  function subNav() {
    if (tab === "home") return subBtn("manager", "Manager View") + subBtn("myweek", "My Week") + subBtn("bars", "Task bars");
    if (tab === "team") return subBtn("roster", "Roster") + subBtn("roles", "Departments / Roles");
    if (tab === "shifts") return subBtn("schedule", "Schedule") + subBtn("timeoff", "Time Off") + subBtn("avail", "Availability");
    if (tab === "timesheets") return subBtn("day", "Week") + subBtn("period", "Pay period");
    return "";
  }

  function defaultSubs() {
    if (tab === "home" && sub !== "manager" && sub !== "myweek" && sub !== "bars") sub = "manager";
    if (tab === "team" && sub !== "roster" && sub !== "roles") sub = "roster";
    if (tab === "shifts" && sub !== "schedule" && sub !== "timeoff" && sub !== "avail") sub = "schedule";
    if (tab === "timesheets" && sub !== "day" && sub !== "period") sub = "day";
  }

  function render() {
    var view = $("view");
    if (!view) return;
    if (isMgrSchedulePage() && !isMgrScheduleLive()) return;
    lockMgrArco();
    defaultSubs();
    setHash();
    if (needStore()) {
      view.innerHTML = shell('<div class="pick-store">Pick one store in the sidebar to open the schedule for <b>' +
        C.esc(C.FIRST_LOCATION) + "</b>.</div>");
      bindChrome();
      return;
    }
    if (!allowedHere()) {
      location.href = "/portal.html";
      return;
    }
    if (sid()) {
      var label = document.getElementById("storeLabel");
      var pretty = (label && label.textContent) ? label.textContent : (rawSid() || sid());
      C.setLocationLabel(sid(), pretty);
    }
    if (rawSid() === "42352" || sid() === "diamond") {
      C.setLocationLabel("diamond", C.FIRST_LOCATION);
      C.setLocationLabel("42352", C.FIRST_LOCATION);
    }
    var inner = "";
    if (tab === "home") {
      if (sub === "myweek") inner = viewMyWeek();
      else if (sub === "bars") inner = viewTaskBars();
      else inner = viewHome();
    }
    else if (tab === "team") inner = sub === "roles" ? viewRoles() : viewRoster();
    else if (tab === "shifts") {
      if (sub === "timeoff") inner = viewTimeOff();
      else if (sub === "avail") inner = viewAvail();
      else inner = viewShifts();
    } else inner = viewTimesheets();
    view.innerHTML = shell(inner);
    bindChrome();
    bindView();
  }

  function bindChrome() {
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.onclick = function () {
        tab = b.getAttribute("data-tab");
        if (tab === "home") sub = "manager";
        if (tab === "team") sub = "roster";
        if (tab === "shifts") sub = "schedule";
        if (tab === "timesheets") sub = "day";
        selectedEmp = "";
        render();
      };
    });
    document.querySelectorAll("[data-sub]").forEach(function (b) {
      b.onclick = function () {
        sub = b.getAttribute("data-sub");
        selectedEmp = "";
        if (sub === "period" && !payStart) payStart = C.payPeriodOf(C.todayYMD()).start;
        render();
      };
    });
    var v = $("view");
    if (!v) return;
    v.querySelectorAll("[data-act]").forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-act");
        if (a === "prevWeek") weekMon = C.addDays(weekMon, -7);
        if (a === "nextWeek") weekMon = C.addDays(weekMon, 7);
        if (a === "thisWeek") { weekMon = C.weekStartMonday(); dayYmd = C.todayYMD(); }
        if (a === "prevPeriod") payStart = C.payPeriodShift(payStart || C.todayYMD(), -1).start;
        if (a === "nextPeriod") payStart = C.payPeriodShift(payStart || C.todayYMD(), 1).start;
        if (a === "thisPeriod") payStart = C.payPeriodOf(C.todayYMD()).start;
        render();
      };
    });
  }

  function people(includeTerm) {
    return C.employees(sid(), { includeTerminated: !!includeTerm });
  }
  function activePeople() { return people(false); }

  function whoOn(dateYmd) {
    var list = [];
    activePeople().forEach(function (e) {
      if (C.isTimeOff(e.id, sid(), dateYmd)) {
        list.push({ emp: e, kind: "off", shift: null });
        return;
      }
      var sh = C.shiftsFor(sid(), dateYmd, e.id)[0];
      if (sh) list.push({ emp: e, kind: "on", shift: sh });
    });
    return list;
  }

  function empTasks(empId, dateYmd) {
    var asg = C.assignmentsForDay(sid(), empId, dateYmd);
    return asg.map(function (a) {
      var done = C.isDoneToday(a.id, dateYmd);
      return { a: a, done: done };
    });
  }
  function dayTasks(empId, dateYmd) {
    return C.assignments(sid(), empId, dateYmd);
  }
  function managerTaskListBody(dates) {
    var blocks = [
      "From: " + MAIL_FROM,
      "CORE cheat-sheet task list · " + locName() + " · " + weekRangeLabel(dates),
      "For: Rachel (manager copy — all employees this week)",
      ""
    ];
    activePeople().forEach(function (e) {
      var on = dates.some(function (d) {
        return C.shiftsFor(sid(), d, e.id)[0] && !C.isTimeOff(e.id, sid(), d);
      });
      if (!on) return;
      var role = C.roleName(e.roleId) || e.role || "";
      blocks.push(e.name + (role ? " · " + role : ""));
      dates.forEach(function (d, i) {
        var line = C.DAYS[i] + " " + fmtMonthDay(d) + "  " + dayLine(e, d);
        var tasks = dayTaskLines(e.id, d);
        blocks.push(line);
        if (tasks.length) tasks.forEach(function (ln) { blocks.push(ln); });
        else blocks.push("    • no tasks");
      });
      blocks.push("");
    });
    blocks.push("— Smart Solutions Schedule");
    return blocks.join("\n");
  }

  function peopleOnWeek() {
    var dates = C.weekDates(weekMon || C.weekStartMonday());
    return activePeople().filter(function (e) {
      return dates.some(function (d) {
        return C.shiftsFor(sid(), d, e.id)[0] && !C.isTimeOff(e.id, sid(), d);
      });
    });
  }
  function shiftDaysFor(empId) {
    var dates = C.weekDates(weekMon || C.weekStartMonday());
    return dates.filter(function (d) {
      return C.shiftsFor(sid(), d, empId)[0] && !C.isTimeOff(empId, sid(), d);
    });
  }
  function openAssignSheet() {
    C.setCheatSheetManual(true);
    var dates = C.weekDates(weekMon || C.weekStartMonday());
    var people = peopleOnWeek();
    if (!people.length) {
      flash("Paint the week first. Assign goes to people who have a shift.");
      return;
    }
    var empId = people[0].id;
    var days = shiftDaysFor(empId);
    var dayY = days[0] || dates[0];
    var cat = C.catalog() || [];
    var sections = C.catalogSectionOrder() || [];
    function assignedIds(eid, d) {
      var have = {};
      (C.assignments(sid(), eid, d) || []).forEach(function (a) {
        if (a.source === "cheatsheet" && a.catalogId) have[a.catalogId] = true;
      });
      return have;
    }
    function weekAssignedCount() {
      return (C.weekCheatSheetAssignments(sid(), weekMon || C.weekStartMonday()) || []).length;
    }
    var bg = document.createElement("div");
    bg.className = "modal-bg hb-slide-bg";
    function paint() {
      var emp = people.filter(function (e) { return e.id === empId; })[0] || people[0];
      empId = emp.id;
      days = shiftDaysFor(empId);
      if (days.indexOf(dayY) < 0) dayY = days[0] || dates[0];
      var have = assignedIds(empId, dayY);
      var html = '<div class="hb-slide modal" style="max-width:720px;max-height:90vh;overflow:auto">';
      html += "<h3>Assign CORE cheat sheet</h3>";
      html += '<p class="muted">Pick the employee, the day they work, then check their tasks. ' +
        weekAssignedCount() + " of " + cat.length + " sheet items assigned this week.</p>";
      html += '<div class="row" style="gap:12px;flex-wrap:wrap;margin:8px 0 12px">';
      html += '<label>Employee<br><select id="asEmp" class="fld">';
      people.forEach(function (e) {
        html += '<option value="' + C.esc(e.id) + '"' + (e.id === empId ? " selected" : "") + ">" +
          C.esc(e.name) + "</option>";
      });
      html += "</select></label>";
      html += '<label>Day they work<br><select id="asDay" class="fld">';
      days.forEach(function (d, i) {
        html += '<option value="' + d + '"' + (d === dayY ? " selected" : "") + ">" +
          C.DAYS[dates.indexOf(d)] + " " + fmtMonthDay(d) + " · " + dayLine(emp, d) + "</option>";
      });
      html += "</select></label></div>";
      var nMine = 0;
      cat.forEach(function (t) { if (have[t.id]) nMine += 1; });
      html += '<p class="fine">' + C.esc(emp.name) + " · " + nMine + " tasks on this day</p>";
      sections.forEach(function (sec) {
        var items = cat.filter(function (t) { return (t.section || "Other") === sec; });
        if (!items.length) return;
        html += "<h4 style='margin:14px 0 6px;font-size:13px'>" + C.esc(sec) + "</h4>";
        items.forEach(function (t) {
          html += '<label style="display:block;margin:4px 0;font-size:13px"><input type="checkbox" data-cat="' +
            C.esc(t.id) + '"' + (have[t.id] ? " checked" : "") + "> " + C.esc(t.title) +
            (t.requiresPhoto ? ' <span class="chip">photo</span>' : "") + "</label>";
        });
      });
      html += '<div class="hb-actions" style="margin-top:16px;position:sticky;bottom:0;background:#fff;padding-top:8px">';
      html += btn("btn cyan", "Save for this person", ' id="asSave"');
      html += " " + btn("btn ghost", "Email me this week’s tasks", ' id="asEmail"');
      html += " " + btn("btn ghost", "Close", ' id="asClose"');
      html += "</div></div>";
      bg.innerHTML = html;
      if (!bg.parentNode) document.body.appendChild(bg);
      $("asEmp").onchange = function () { empId = $("asEmp").value; paint(); };
      $("asDay").onchange = function () { dayY = $("asDay").value; paint(); };
      $("asClose").onclick = function () { bg.remove(); render(); };
      $("asEmail").onclick = function () { emailMeWeekTasks(); };
      $("asSave").onclick = function () {
        var ids = [];
        bg.querySelectorAll("input[data-cat]:checked").forEach(function (cb) {
          ids.push(cb.getAttribute("data-cat"));
        });
        var r = C.assignCheatSheetToEmployee(sid(), empId, dayY, ids);
        if (r && r.ok) flash("Saved " + r.assigned + " tasks for " + emp.name + ".");
        else flash((r && r.error) || "Could not save.");
        paint();
      };
      bg.onclick = function (ev) { if (ev.target === bg) { bg.remove(); render(); } };
    }
    if (bg.parentNode) bg.remove();
    paint();
  }
  function emailMeWeekTasks() {
    var dates = C.weekDates(weekMon || C.weekStartMonday());
    var body = managerTaskListBody(dates);
    openMailto(
      MANAGER_EMAIL,
      "CORE tasks · " + locName() + " · " + weekRangeLabel(dates),
      body
    );
  }
  function splitSheet() {
    var r = C.splitCheatSheetWeek(sid(), weekMon || C.weekStartMonday());
    if (r && r.ok) {
      flash("Split " + r.assigned + " tasks across " + r.people + " people. Email me this week’s tasks when you are ready.");
    } else {
      flash((r && r.error) || "Paint the week first. Split goes to people who have a shift.");
    }
    render();
  }

  function viewHome() {
    var today = C.todayYMD();
    var rows = whoOn(today);
    var on = rows.filter(function (r) { return r.kind === "on"; });
    var off = rows.filter(function (r) { return r.kind === "off"; });
    var html = '<div class="card"><h2>Manager View · Today</h2>' +
      '<p class="fine">' + C.esc(C.formatYMD(today)) + " · " + C.esc(locName()) + "</p>" +
      '<div style="margin:10px 0 12px">' +
      btn("btn cyan", "Assign cheat sheet", ' data-assignsheet="1"') +
      " " + btn("btn ghost", "Email me this week’s tasks", ' data-emailweek="1"') +
      " " + btn("btn ghost", "Print tasks by employee", ' data-printtasks="1"') +
      "</div>";
    if (!activePeople().length) {
      html += '<p class="muted">No employees yet. Add people on Team → Roster.</p></div>';
      return html;
    }
    if (!on.length) html += '<p class="muted">No one is scheduled today.</p>';
    on.forEach(function (r) {
      var hrs = C.hoursBetween(r.shift.start, r.shift.end);
      var tasks = empTasks(r.emp.id, today);
      var left = tasks.filter(function (t) { return !t.done; });
      html += '<div class="emp-row"><div style="flex:1;min-width:180px"><b>' + C.esc(r.emp.name) + "</b>" +
        (C.roleName(r.emp.roleId) ? ' <span class="chip">' + C.esc(C.roleName(r.emp.roleId)) + "</span>" : "") +
        '<div class="muted">' + C.esc(C.fmtTime(r.shift.start) + "–" + C.fmtTime(r.shift.end)) +
        " · " + hrs + " hrs · " + (left.length ? left.length + " tasks left" : (tasks.length ? "tasks done" : "no tasks")) +
        "</div>" + C.taskBarHtml(C.taskProgress(sid(), r.emp.id, today)) + "</div>" +
        '<div class="row-acts">' +
        (left.length ? btn("btn cyan", "Remind", ' data-remind="' + r.emp.id + '"') : "") +
        btn("btn ghost", "Add task", ' data-opentask="' + r.emp.id + '" data-date="' + today + '"') +
        " " + btn("btn ghost", "Print", ' data-printone="' + r.emp.id + '"') +
        "</div></div>";
      left.forEach(function (t) {
        html += '<div class="task-item"><span>' + C.esc(t.a.title) +
          (t.a.requiresPhoto ? ' <span class="chip warn">Photo</span>' : "") +
          '</span></div>';
      });
    });
    if (off.length) {
      html += "<h3>Time off today</h3>";
      off.forEach(function (r) {
        html += '<div class="emp-row"><b>' + C.esc(r.emp.name) + "</b><span class=\"chip warn\">Off</span></div>";
      });
    }
    html += "</div>" + homeAnniversaries(today) + homeReport(today);
    return html;
  }

  function homeAnniversaries(today) {
    var mon = C.weekStartMonday(today);
    var dates = C.weekDates(mon);
    var hits = [];
    activePeople().forEach(function (e) {
      if (!C.hiredYmd(e)) return;
      dates.forEach(function (d) {
        if (C.isAnniversaryOn(e, d)) {
          hits.push({ emp: e, date: d, year: C.anniversaryYear(e, d) });
        }
      });
    });
    if (!hits.length) return "";
    var html = '<div class="card"><h2>Anniversaries this week</h2>';
    hits.forEach(function (h) {
      html += '<div class="emp-row"><div><b>' + C.esc(h.emp.name) + "</b>";
      if (h.date === today) html += ' <span class="chip anniv">Anniversary</span>';
      html += '<div class="muted">' + C.esc(C.formatYMD(h.date)) + " · " +
        C.esc(C.ordinal(h.year)) + " year</div></div></div>";
    });
    html += "</div>";
    return html;
  }

  function homeReport(today) {
    var mon = weekMon || C.weekStartMonday(today);
    var dates = C.weekDates(mon);
    var end = dates[6];
    var html = '<div class="card"><h2>This week · task report</h2>';
    var any = false;
    activePeople().forEach(function (e) {
      var asg = C.assignments(sid(), e.id).filter(function (a) {
        return !a.date || (a.date >= dates[0] && a.date <= end);
      });
      if (!asg.length) return;
      any = true;
      var done = 0, stamps = [];
      asg.forEach(function (a) {
        var hits = C.completionsFor({ assignmentId: a.id, employeeId: e.id, start: dates[0], end: end });
        done += hits.length;
        hits.forEach(function (c) { stamps.push(C.formatLA(c.doneAt)); });
      });
      var hrs = C.hoursForRange(e.id, sid(), dates[0], end);
      html += '<div class="emp-row"><div><b>' + C.esc(e.name) + "</b>" +
        '<div class="muted">' + hrs + " hrs scheduled · " + done + " task completions · " +
        asg.length + " assigned</div>" +
        (stamps.length ? '<div class="fine">' + C.esc(stamps.join(" · ")) + "</div>" : "") +
        "</div></div>";
    });
    if (!any) html += '<p class="muted">Assign CORE tasks on a person in Team → Roster.</p>';
    html += "</div>";
    return html;
  }

  function viewTaskBars() {
    var day = dayYmd || C.todayYMD();
    var rows = whoOn(day);
    var on = rows.filter(function (r) { return r.kind === "on"; });
    var html = '<div class="card bars-card"><h2>Task bars</h2>' +
      '<p class="fine">' + C.esc(C.formatYMD(day)) + " · " + C.esc(locName()) +
      ". Everyone on a shift starts red. Each done task turns a piece green. All done turns the whole bar green.</p>" +
      '<div class="bars-nav">' +
      btn("btn ghost", "Prev day", ' data-barstep="-1"') +
      '<input class="fld" id="barDay" type="date" value="' + C.esc(day) + '">' +
      btn("btn ghost", "Today", ' data-bartoday="1"') +
      btn("btn ghost", "Next day", ' data-barstep="1"') +
      "</div>";
    if (!on.length) html += '<p class="muted">No one was scheduled this day.</p>';
    on.forEach(function (r) {
      var prog = C.taskProgress(sid(), r.emp.id, day);
      var tone = !prog.total ? "none" : (prog.left ? "mid" : "all");
      var tasks = empTasks(r.emp.id, day);
      html += '<div class="bar-row tone-' + tone + '"><div class="bar-who"><div><b>' + C.esc(r.emp.name) + "</b>" +
        (C.roleName(r.emp.roleId) ? ' <span class="chip">' + C.esc(C.roleName(r.emp.roleId)) + "</span>" : "") +
        '<div class="muted">' + C.esc(C.fmtTime(r.shift.start) + "–" + C.fmtTime(r.shift.end)) + "</div></div></div>" +
        C.taskBarHtml(prog, { size: "lg" });
      if (tasks.length) {
        tasks.forEach(function (t) {
          html += '<div class="task-item"><span>' + C.esc(t.a.title) +
            (t.a.requiresPhoto ? ' <span class="chip warn">Photo</span>' : "") +
            (t.done ? ' <span class="chip anniv">Done</span>' : "") + "</span></div>";
        });
      }
      html += "</div>";
    });
    html += "</div>";
    return html;
  }

  function viewMyWeek() {
    var dates = C.weekDates(weekMon);
    var html = '<div class="card"><h2>My Week</h2><p class="fine">' + C.esc(locName()) +
      " · Morning &lt;12:00 · Second 12:00–21:59 · Night 22:00+ / overnight</p>";
    html += '<div class="scroll"><table class="week-grid"><thead><tr><th>Team</th>';
    dates.forEach(function (d) {
      html += "<th>" + C.DAYS[C.weekDates(weekMon).indexOf(d)] + "<br>" + d.slice(5) + "</th>";
    });
    html += "<th>Hrs</th></tr></thead><tbody>";
    activePeople().forEach(function (e) {
      html += "<tr><td>" + C.esc(e.name) + "</td>";
      dates.forEach(function (d) {
        var sh = C.shiftsFor(sid(), d, e.id)[0];
        var tasks = dayTasks(e.id, d);
        var taskHtml = tasks.map(function (a) {
          return '<div class="cell-task">' + C.esc(a.title) +
            (a.requiresPhoto ? ' <span class="chip warn">Photo</span>' : "") + "</div>";
        }).join("");
        if (C.isTimeOff(e.id, sid(), d)) {
          html += '<td class="shift-cell off" data-edit="' + e.id + '" data-date="' + d + '">Unavailable' + taskHtml + "</td>";
          return;
        }
        html += sh
          ? '<td class="shift-cell has ' + shiftBand(sh) + '" data-edit="' + e.id + '" data-date="' + d + '">' +
            C.esc(C.fmtTime(sh.start) + "–" + C.fmtTime(sh.end)) +
            (sh.leader ? leaderSign() : "") + taskHtml + "</td>"
          : '<td class="shift-cell empty" data-edit="' + e.id + '" data-date="' + d + '">' + (taskHtml || "—") + "</td>";
      });
      html += "<td>" + C.hoursForRange(e.id, sid(), dates[0], dates[6]) + "</td></tr>";
    });
    if (!activePeople().length) html += '<tr><td colspan="9">No employees yet.</td></tr>';
    html += "</tbody></table></div></div>";
    return html;
  }

  function viewRoster() {
    var list = people(showTerm);
    var html = '<div class="card"><h2>Roster</h2>' +
      '<label class="muted"><input type="checkbox" id="showTerm"' + (showTerm ? " checked" : "") +
      "> Show terminated</label>" +
      '<form id="addEmp" class="form-grid" style="margin-top:12px">' +
      '<div><label>Name</label><input class="fld" name="name" autocomplete="off" required></div>' +
      '<div><label>Time clock pass</label><input class="fld" name="pass" type="password" inputmode="numeric" autocomplete="off" required></div>' +
      '<div><label>Date hired</label><input class="fld" name="hired" type="date" required></div>' +
      '<div><label>Address</label><input class="fld" name="address" autocomplete="street-address"></div>' +
      '<div><label>Phone</label><input class="fld" name="phone" type="tel" autocomplete="tel"></div>' +
      '<div><label>Email</label><input class="fld" name="email" type="email" autocomplete="email"></div>' +
      '<div><label>Hourly rate</label><input class="fld" name="rate" type="number" min="0" step="0.01" inputmode="decimal"></div>' +
      '<div><label>Date terminated</label><input class="fld" name="terminated" type="date"></div>' +
      '<div><label>Terminate reason</label><input class="fld" name="termReason" autocomplete="off"></div>' +
      '<div><label>Role</label><select class="fld" name="role"><option value="">—</option>';
    C.roles(sid()).forEach(function (r) {
      html += '<option value="' + C.esc(r.id) + '">' + C.esc(r.name) + "</option>";
    });
    html += '</select></div><div style="align-self:end">' + btn("btn cyan", "Add employee", ' type="submit"') + "</div></form>" +
      '<p class="fine">Login for Core and Time Clock is first name + time clock pass. The pass is hashed immediately and never saved. Hourly rate stays on this manager roster only. It is not on the pay PDF or the employee app.</p></div>';

    html += '<div class="card"><h2>People</h2>';
    if (!list.length) html += '<p class="muted">No one on this roster yet.</p>';
    list.forEach(function (e) {
      var open = selectedEmp === e.id;
      html += '<div class="emp-row"><div class="roster-who">' + rosterAvatar(e) + "<div><b>" + C.esc(e.name) + "</b> ";
      if (e.status === "terminated") html += '<span class="chip dn">Terminated</span>';
      if (C.roleName(e.roleId)) html += '<span class="chip">' + C.esc(C.roleName(e.roleId)) + "</span>";
      if (C.isAnniversaryToday(e)) html += '<span class="chip anniv">Anniversary</span>';
      html += '<div class="muted">Hired ' + (e.hiredOn ? C.esc(C.formatYMD(e.hiredOn)) : "—");
      if (C.hiredYmd(e)) {
        var ty = C.tenureYears(e);
        html += " · " + (ty ? ty + (ty === 1 ? " year" : " years") : C.formatTenure(e));
      }
      html += (e.address ? " · " + C.esc(e.address) : "") +
        (e.phone ? " · " + C.esc(e.phone) : "") +
        (e.email || emailFor(e.name, e) ? " · " + C.esc(e.email || emailFor(e.name, e)) : "") + "</div>";
      if (e.status === "terminated") {
        html += '<div class="muted">' + C.esc(e.terminatedAt) + " · " + C.esc(e.terminateReason) + "</div>";
      }
      html += "</div></div>" + btn("btn ghost", open ? "Close" : "Open", ' data-open="' + e.id + '"') + "</div>";
      if (open) html += empDetail(e);
    });
    html += "</div>";
    return html;
  }

  function empDetail(e) {
    var today = C.todayYMD();
    var dates = C.weekDates(weekMon);
    var asg = C.assignments(sid(), e.id);
    var html = '<div class="card" style="background:#f7fbfc">';
    html += rosterAvatar(e, "lg") +
      '<p class="muted">Edit this person. Time clock pass stays hashed. Hourly rate is manager-only. Photo stays on this roster only.</p>';
    if (C.isAnniversaryToday(e)) {
      html += '<p class="muted"><span class="chip anniv">Happy ' +
        C.esc(C.ordinal(C.anniversaryYear(e))) + " anniversary</span></p>";
    }
    html += '<div class="form-grid">';
    html += '<div><label>Name</label><input class="fld" id="empName" value="' + C.esc(e.name) + '" autocomplete="off"></div>';
    html += '<div><label>Time clock pass (leave blank to keep)</label><input class="fld" type="password" inputmode="numeric" id="empPass" autocomplete="off"></div>';
    html += '<div><label>Date hired</label><input class="fld" type="date" id="empHired" value="' +
      C.esc(e.hiredOn || "") + '"></div>';
    html += '<div><label>Address</label><input class="fld" id="empAddr" value="' +
      C.esc(e.address || "") + '" autocomplete="street-address"></div>';
    html += '<div><label>Phone</label><input class="fld" id="empPhone" type="tel" value="' +
      C.esc(e.phone || "") + '" autocomplete="tel"></div>';
    html += '<div><label>Email</label><input class="fld" id="empEmail" type="email" value="' +
      C.esc(e.email || emailFor(e.name, e)) + '" autocomplete="email"></div>';
    html += '<div><label>Hourly rate</label><input class="fld" id="empRate" type="number" min="0" step="0.01" inputmode="decimal" value="' +
      C.esc(e.hourlyRate === 0 || e.hourlyRate ? String(e.hourlyRate) : "") + '"></div>';
    html += '<div><label>Role</label><select class="fld" id="empRole"><option value="">—</option>';
    C.roles(sid()).forEach(function (r) {
      html += '<option value="' + C.esc(r.id) + '"' + (e.roleId === r.id ? " selected" : "") + ">" + C.esc(r.name) + "</option>";
    });
    html += "</select></div>";
    html += '<div><label>Date terminated</label><input class="fld" type="date" id="empTermDate" value="' +
      C.esc(e.terminatedAt || "") + '"></div>';
    html += '<div><label>Terminate reason</label><input class="fld" id="empTermReason" value="' +
      C.esc(e.terminateReason || "") + '" autocomplete="off"></div>';
    html += '<div style="align-self:end">' + btn("btn cyan", "Save info", ' data-saveemp="' + e.id + '"') + "</div></div>";

    html += "<h3>CORE tasks</h3>";
    if (e.status !== "terminated") {
      html += '<div class="form-grid"><div><label>From cheat sheet</label><select class="fld" id="catPick"><option value="">Custom…</option>';
      var sec = "";
      C.catalog().forEach(function (t) {
        if (t.section !== sec) {
          if (sec) html += "</optgroup>";
          sec = t.section;
          html += '<optgroup label="' + C.esc(sec) + '">';
        }
        html += '<option value="' + C.esc(t.id) + '"' + (t.requiresPhoto ? " data-photo=1" : "") + ">" +
          C.esc(t.title) + (t.requiresPhoto ? " (photo)" : "") + "</option>";
      });
      if (sec) html += "</optgroup>";
      html += '</select></div><div><label>Or title</label><input class="fld" id="taskTitle" autocomplete="off"></div>' +
        '<div><label><input type="checkbox" id="taskPhoto"> Requires photo</label></div>' +
        '<div style="align-self:end">' + btn("btn", "Add task", ' data-addtask="' + e.id + '"') + "</div></div>";
    }

    asg.forEach(function (a) {
      var done = C.isDoneToday(a.id, a.date || today);
      html += '<div class="task-item"><div>' + C.esc(a.title) +
        (a.requiresPhoto ? ' <span class="chip warn">Photo</span>' : "") +
        (a.date ? ' <span class="chip">' + C.esc(C.formatYMD(a.date)) + "</span>" : "") +
        (a.source === "cheatsheet" ? ' <span class="chip">Cheat sheet</span>' : "") +
        '<div class="muted">' + (done ? "Done " + C.esc(C.formatLA(done.doneAt)) : (a.date ? "Due " + C.esc(C.formatYMD(a.date)) : "Not done today")) + "</div></div><div>";
      if (e.status !== "terminated") {
        html += btn("btn ghost", a.requiresPhoto ? "Photo on" : "Photo off", ' data-togphoto="' + a.id + '"') + " ";
        html += reassignSelectHtml(a.id, e.id);
        html += btn("btn ghost", "Remove", ' data-deltask="' + a.id + '"');
      }
      html += "</div></div>";
    });

    var hrs = C.hoursForRange(e.id, sid(), dates[0], dates[6]);
    var comps = C.completionsFor({ employeeId: e.id, stationId: sid(), start: dates[0], end: dates[6] });
    html += "<h3>Weekly report</h3><p class=\"muted\">" + hrs + " hrs scheduled this week · " +
      comps.length + " completions · " + asg.filter(function (a) { return !C.isDoneToday(a.id, today); }).length +
      " not done today.</p>";
    comps.forEach(function (c) {
      var title = "";
      asg.forEach(function (a) { if (a.id === c.assignmentId) title = a.title; });
      html += '<div class="fine">' + C.esc(title || "Task") + " · " + C.esc(C.formatLA(c.doneAt)) + "</div>";
    });

    if (e.status !== "terminated") {
      html += "<h3>Remind</h3>" + btn("btn cyan", "Copy reminder", ' data-remind="' + e.id + '"') + " " +
        btn("btn ghost", "Email reminder", ' data-mailto="' + e.id + '"');
      html += "<h3>Terminate</h3><div class=\"form-grid\">" +
        '<div><label>Last day</label><input class="fld" type="date" id="termDate"></div>' +
        '<div><label>Reason (required)</label><input class="fld" id="termReason" autocomplete="off"></div></div>' +
        '<div style="margin-top:10px">' + btn("btn danger", "Terminate", ' data-term="' + e.id + '"') + "</div>";
    } else {
      html += '<div style="margin-top:10px">' + btn("btn ghost", "Restore to roster", ' data-restore="' + e.id + '"') + "</div>";
    }
    html += "</div>";
    return html;
  }

  function viewRoles() {
    var html = '<div class="card"><h2>Departments / Roles</h2>' +
      '<p class="fine">Simple list for this location. Assign a role on each person in Roster.</p>' +
      '<form id="addRole" class="form-grid"><div><label>Role name</label>' +
      '<input class="fld" name="name" placeholder="Cashier" autocomplete="off" required></div>' +
      '<div style="align-self:end">' + btn("btn cyan", "Add role", ' type="submit"') + "</div></form>" +
      '<div class="role-list">';
    var list = C.roles(sid());
    if (!list.length) html += '<span class="muted">No roles yet.</span>';
    list.forEach(function (r) {
      html += "<span>" + C.esc(r.name) + ' <button type="button" data-delrole="' + r.id + '">×</button></span>';
    });
    html += "</div></div>";
    return html;
  }

  function viewShifts() {
    var dates = C.weekDates(weekMon);
    var today = C.todayYMD();
    var q = (searchQ || "").toLowerCase();
    var list = activePeople().filter(function (e) {
      return !q || e.name.toLowerCase().indexOf(q) !== -1;
    });
    if (scheduledOnly) {
      list = list.filter(function (e) {
        return dates.some(function (d) {
          return C.isTimeOff(e.id, sid(), d) || C.shiftsFor(sid(), d, e.id)[0];
        });
      });
    }
    var unpub = unpublishedCount();
    var html = '<div class="hb-canvas">';
    html += '<div class="hb-toolbar"><div class="hb-toolbar-left">';
    html += btn("hb-tbtn", "Today", ' data-act="thisWeek"');
    html += '<span class="hb-range">' + C.esc(weekRangeLabel(dates)) + "</span>";
    html += btn("hb-tbtn", "‹", ' data-act="prevWeek"');
    html += btn("hb-tbtn", "›", ' data-act="nextWeek"');
    html += '<select class="hb-select" id="hbViewMode" aria-label="View"><option value="week" selected>Week</option></select>';
    html += '<select class="hb-select" id="hbGroup" aria-label="Grouping">';
    html += '<option value="custom"' + (groupBy === "custom" ? " selected" : "") + ">Custom</option>";
    html += '<option value="all"' + (groupBy === "all" ? " selected" : "") + ">All team</option>";
    html += "</select>";
    html += '<span class="hb-legend" title="Morning before noon. Second 12:00–21:59. Night 22:00+ or overnight.">' +
      '<i class="lg morning"></i> Morning <span class="lg-cut">&lt;12:00</span> · ' +
      '<i class="lg second"></i> Second <span class="lg-cut">12:00–21:59</span> · ' +
      '<i class="lg night"></i> Night <span class="lg-cut">22:00+ / overnight</span> · ' +
      '<span class="hb-leader-sign lg-lead">★ Leader</span></span>';
    html += "</div><div class=\"hb-toolbar-right\">";
    html += '<input class="hb-search" id="shiftSearch" placeholder="Search" value="' + C.esc(searchQ) + '">';
    html += '<div class="hb-menu"><button type="button" class="hb-tbtn' + (filtersOpen ? " on" : "") +
      '" data-toggle="filters" aria-expanded="' + (filtersOpen ? "true" : "false") + '">Filters</button>';
    if (filtersOpen) {
      html += '<div class="hb-pop">';
      html += '<label><input type="checkbox" id="fltEvents"' + (showEvents ? " checked" : "") + "> Events</label>";
      html += '<label><input type="checkbox" id="fltOpen"' + (showOpen ? " checked" : "") + "> Open shifts</label>";
      html += '<label><input type="checkbox" id="fltSched"' + (scheduledOnly ? " checked" : "") + "> Scheduled team members only</label>";
      html += "</div>";
    }
    html += "</div>";
    html += '<div class="hb-menu"><button type="button" class="hb-tbtn' + (toolsOpen ? " on" : "") +
      '" data-toggle="tools" aria-expanded="' + (toolsOpen ? "true" : "false") + '">Tools</button>';
    if (toolsOpen) {
      html += '<div class="hb-pop"><button type="button" data-copyweek="1">Apply last week to this week</button>' +
        '<button type="button" data-printweek="1">Print week</button>' +
        '<button type="button" data-printtasks="1">Print tasks by employee</button>' +
        '<button type="button" data-assignsheet="1">Assign cheat sheet</button>' +
        '<button type="button" data-emailweek="1">Email me this week’s tasks</button>' +
        '<button type="button" data-splitweek="1">Auto-split (optional)</button></div>';
    }
    html += "</div>";
    html += '<button type="button" class="hb-publish' + (unpub ? "" : " done") + '" data-publish="1">Publish';
    if (unpub) html += '<span class="hb-count">' + unpub + "</span>";
    html += "</button></div></div>";

    var dayHrs = dates.map(function (d) {
      var t = 0;
      list.forEach(function (e) { t += daySchedHours(e.id, d); });
      return t;
    });
    var weekAll = 0;
    list.forEach(function (e) { weekAll += C.hoursForRange(e.id, sid(), dates[0], dates[6]); });
    html += '<div class="hb-scroll"><table class="hb-grid"><thead><tr>';
    html += '<th class="hb-sticky">Team</th>';
    dates.forEach(function (d, i) {
      html += "<th" + (d === today ? ' class="hb-today"' : "") + ">" + C.DAYS[i] +
        '<span class="hb-dayn">' + dayNum(d) + "</span>" +
        '<div class="hb-tc">' + C.esc(fmtHrs(dayHrs[i])) + "</div></th>";
    });
    html += '<th class="hb-hrs-h">Hours</th>';
    html += "</tr></thead><tbody>";
    if (showEvents) {
      html += '<tr class="hb-extra"><td class="hb-sticky"><div class="hb-name">Events</div></td>';
      dates.forEach(function (d) {
        html += '<td><div class="hb-cell' + (d === today ? " hb-today" : "") + '"></div></td>';
      });
      html += '<td class="hb-hrs"></td></tr>';
    }
    if (showOpen) {
      html += '<tr class="hb-extra"><td class="hb-sticky"><div class="hb-name">Open shifts</div></td>';
      dates.forEach(function (d) {
        html += '<td><div class="hb-cell' + (d === today ? " hb-today" : "") + '"></div></td>';
      });
      html += '<td class="hb-hrs"></td></tr>';
    }
    if (!list.length) {
      html += '<tr><td class="hb-sticky" colspan="9"><div class="hb-name muted">No matching employees.</div></td></tr>';
    }
    list.forEach(function (e) {
      var weekHrs = C.hoursForRange(e.id, sid(), dates[0], dates[6]);
      html += '<tr><td class="hb-sticky">' + whoCell(e, weekHrs) + "</td>";
      dates.forEach(function (d) {
        var off = C.isTimeOff(e.id, sid(), d);
        var sh = C.shiftsFor(sid(), d, e.id)[0];
        var cls = "hb-cell" + (d === today ? " hb-today" : "") + (off || sh ? "" : " hb-empty");
        html += '<td><div class="' + cls + '" data-edit="' + e.id + '" data-date="' + d + '">';
        if (off) html += '<div class="hb-chip off">Unavailable</div>';
        else if (sh) html += '<div class="hb-chip ' + shiftBand(sh) + (sh.leader ? " leader" : "") + '">' +
          C.esc(fmtHomebaseTime(sh.start) + "–" + fmtHomebaseTime(sh.end)) +
          (sh.leader ? leaderSign() : "") + "</div>";
        else html += '<span class="hb-plus">+</span>';
        html += "</div></td>";
      });
      html += '<td class="hb-hrs">' + C.esc(fmtHrs(weekHrs)) + "</td></tr>";
    });
    html += '<tr class="hb-totals"><td class="hb-sticky"><div class="hb-name"><b>Total</b></div></td>';
    dates.forEach(function (d, i) {
      html += '<td class="hb-hrs">' + C.esc(fmtHrs(dayHrs[i])) + "</td>";
    });
    html += '<td class="hb-hrs">' + C.esc(fmtHrs(weekAll)) + "</td></tr>";
    html += "</tbody></table></div>";
    html += '<div class="hb-foot"><span>' + list.length + " team member" + (list.length === 1 ? "" : "s") +
      " · " + C.esc(fmtHrs(weekAll)) + " scheduled</span>";
    html += "<span>" + C.esc(locName()) + "</span></div></div>";
    return html;
  }

  function reqRange(r) {
    if (!r || !r.start) return "";
    if (!r.end || r.end === r.start) return C.formatYMD(r.start);
    return C.formatYMD(r.start) + " – " + C.formatYMD(r.end);
  }
  function viewTimeOff() {
    var canDecide = canDecideTimeOff();
    var pending = (C.listRequests({ stationId: sid(), status: "pending" }) || []).slice().sort(function (a, b) {
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
    var html = '<div class="card"><h2>Pending requests</h2>';
    if (!pending.length) {
      html += '<p class="muted">No pending time-off requests.</p>';
    } else {
      pending.forEach(function (r) {
        var e = C.employeeById(r.employeeId);
        html += '<div class="emp-row"><div><b>' + C.esc(e ? e.name : "Employee") + "</b>" +
          '<div class="muted">' + C.esc(reqRange(r)) +
          (r.reason ? " · " + C.esc(r.reason) : "") + "</div></div>";
        if (canDecide) {
          html += '<div class="row-acts">' +
            btn("btn cyan", "Approve", ' data-approveto="' + C.esc(r.id) + '"') +
            btn("btn danger", "Deny", ' data-denyto="' + C.esc(r.id) + '"') +
            "</div>";
        }
        html += "</div>";
      });
    }
    html += "</div>";
    var clockPending = (C.listClockPermits ? C.listClockPermits({ stationId: sid(), status: "pending" }) : []).slice();
    html += '<div class="card"><h2>Clock-in requests</h2>';
    if (!clockPending.length) {
      html += '<p class="muted">No pending clock-in requests. Unscheduled people cannot clock in until you approve.</p>';
    } else {
      clockPending.forEach(function (r) {
        var e = C.employeeById(r.employeeId);
        html += '<div class="emp-row"><div><b>' + C.esc(e ? e.name : "Employee") + "</b>" +
          '<div class="muted">' + C.esc(C.formatYMD(r.date || r.start)) +
          (r.reason ? " · " + C.esc(r.reason) : " · not scheduled") + "</div></div>";
        if (canDecide) {
          html += '<div class="row-acts">' +
            btn("btn cyan", "Approve", ' data-approvecp="' + C.esc(r.id) + '"') +
            btn("btn danger", "Deny", ' data-denycp="' + C.esc(r.id) + '"') +
            "</div>";
        }
        html += "</div>";
      });
    }
    html += "</div>";
    html += '<div class="card"><h2>Time Off</h2>' +
      '<form id="addOff" class="form-grid">' +
      '<div><label>Employee</label><select class="fld" name="emp" required><option value="">Select</option>';
    activePeople().forEach(function (e) {
      html += '<option value="' + e.id + '">' + C.esc(e.name) + "</option>";
    });
    html += '</select></div><div><label>Date</label><input class="fld" type="date" name="date" required></div>' +
      '<div><label>Reason</label><input class="fld" name="reason" autocomplete="off"></div>' +
      '<div style="align-self:end">' + btn("btn cyan", "Record time off", ' type="submit"') + "</div></form></div>";
    html += '<div class="card"><h2>This week</h2>';
    var dates = C.weekDates(weekMon);
    var any = false;
    C.timeOffFor(sid()).forEach(function (t) {
      if (t.date < dates[0] || t.date > dates[6]) return;
      any = true;
      var e = C.employeeById(t.employeeId);
      html += '<div class="emp-row"><div><b>' + C.esc(e ? e.name : "Employee") + "</b>" +
        '<div class="muted">' + C.esc(C.formatYMD(t.date)) + " · " + C.esc(t.reason) + "</div></div>" +
        btn("btn ghost", "Remove", ' data-deloff="' + t.id + '"') + "</div>";
    });
    if (!any) html += '<p class="muted">No time off recorded this week.</p>';
    html += "</div>";
    return html;
  }

  function viewAvail() {
    var html = '<div class="card"><h2>Team Availability</h2>' +
      '<p class="fine">Mark who can work each weekday. Used when you paint the week grid.</p>' +
      '<div class="scroll"><table class="week-grid"><thead><tr><th>Employee</th>';
    C.DAYS.forEach(function (d) { html += "<th>" + d + "</th>"; });
    html += "</tr></thead><tbody>";
    activePeople().forEach(function (e) {
      html += "<tr><td>" + C.esc(e.name) + "</td>";
      for (var i = 0; i < 7; i++) {
        var rec = C.availabilityFor(sid(), e.id).filter(function (a) { return a.day === i; })[0];
        var on = !rec || rec.available !== false;
        html += '<td><div class="shift-cell ' + (on ? "has" : "off") + '" data-av="' + e.id + '" data-day="' + i + '">' +
          (on ? (rec && rec.start ? C.fmtTime(rec.start) + "–" + C.fmtTime(rec.end) : "Open") : "No") + "</div></td>";
      }
      html += "</tr>";
    });
    if (!activePeople().length) html += '<tr><td colspan="8">Add people on Team first.</td></tr>';
    html += "</tbody></table></div></div>";
    return html;
  }

  function currentPeriod() {
    return C.payPeriodOf(payStart || C.todayYMD());
  }
  function viewTimesheets() {
    if (sub === "period") return selectedEmp ? viewPayDetail(selectedEmp) : viewPayPeriod();
    return viewTimesheetDay();
  }
  function viewTimesheetDay() {
    var dates = C.weekDates(weekMon);
    var html = '<div class="card"><h2>Timesheets · Week</h2>';
    html += '<div class="sch-week" style="margin:8px 0 12px">' +
      btn("btn ghost", "‹", ' data-act="prevWeek"') +
      "<span>" + C.esc(weekRangeLabel(dates)) + "</span>" +
      btn("btn ghost", "›", ' data-act="nextWeek"') +
      btn("btn ghost", "This week", ' data-act="thisWeek"') +
      "</div>";
    html += '<p class="fine">Scheduled vs actual for every employee, like Homebase. Click a name for punches.</p>';
    html += '<div class="scroll"><table class="list-table pay-table"><thead><tr><th>Employee</th>';
    dates.forEach(function (d, i) {
      html += "<th>" + C.DAYS[i] + "<br>" + C.esc(d.slice(5)) + "</th>";
    });
    html += "<th>Scheduled</th><th>Actual</th><th>Diff</th></tr></thead><tbody>";
    var any = false;
    activePeople().forEach(function (e) {
      var tot = 0;
      var cells = dates.map(function (d) {
        var h = C.workedHours(e.id, d, sid());
        tot += h;
        return h;
      });
      var sched = C.hoursForRange(e.id, sid(), dates[0], dates[6]);
      var diff = Math.round((tot - sched) * 100) / 100;
      html += "<tr><td>" + empNameBtn(e) + "</td>";
      cells.forEach(function (h) {
        html += "<td>" + (h ? hrs2(h) : "—") + "</td>";
      });
      html += "<td>" + hrs2(sched) + "</td><td>" + hrs2(tot) +
        '</td><td class="var-' + varianceCls(tot, sched) + '">' +
        (diff > 0 ? "+" : "") + hrs2(diff) + "</td></tr>";
    });
    html += "</tbody></table></div></div>";
    return html;
  }
  function unpaidMealHours(empId, dateYmd) {
    var clocks = (C.displayClocks ? C.displayClocks(empId, dateYmd, sid()) : []).slice().sort(function (a, b) {
      return new Date(a.inAt) - new Date(b.inAt);
    });
    if (clocks.length >= 2 && clocks[0].outAt && clocks[1].inAt) {
      var gap = new Date(clocks[1].inAt) - new Date(clocks[0].outAt);
      if (gap > 0) return Math.round((gap / 3600000) * 100) / 100;
    }
    var b = (C.breaksFor({ employeeId: empId, date: dateYmd, kind: "meal30" }) || [])[0];
    if (!b || !b.startAt) return 0;
    var end = b.endAt ? new Date(b.endAt) : new Date();
    var ms = end - new Date(b.startAt);
    return ms > 0 ? Math.round((ms / 3600000) * 100) / 100 : 0;
  }
  function punchClockLabel(iso) {
    return fmtHomebaseTime(C.laHHmm(iso));
  }
  function timeCardLabel(c) {
    if (!c || !c.inAt) return "";
    var inn = punchClockLabel(c.inAt);
    if (!c.outAt) return inn;
    return inn + " – " + punchClockLabel(c.outAt);
  }
  function dayTimeCard(clocks) {
    var list = (clocks || []).filter(function (c) { return c && c.inAt; }).slice().sort(function (a, b) {
      return new Date(a.inAt) - new Date(b.inAt);
    });
    if (!list.length) return { label: "", labels: [], missing: false };
    var labels = list.map(function (c) { return timeCardLabel(c); });
    var open = list.some(function (c) { return !c.outAt; });
    return { label: labels.join(" + "), labels: labels, missing: open };
  }
  function signedHrs(n) {
    n = Math.round((Number(n) || 0) * 100) / 100;
    return (n > 0 ? "+" : "") + hrs2(n);
  }
  function otCell(n) {
    n = Number(n) || 0;
    return (n > 0.004 ? '<span class="hb-ot">' : "<span>") + hrs2(n) + "</span>";
  }
  function issueCell(missing, noShow) {
    if (missing) return '<span class="hb-issue" title="Missing clock-out">!</span>';
    if (noShow) return '<span class="hb-issue" title="No-Show">!</span>';
    return "";
  }
  function empRole(e) {
    return C.roleName(e.roleId) || e.role || "—";
  }
  function viewPayPeriod() {
    var per = currentPeriod();
    var dates = C.datesInRange(per.start, per.end);
    var html = '<div class="card hb-period"><h2>Timesheets</h2>';
    html += '<p class="fine">Pay period · Group by Team member. No wages.</p>';
    html += '<div class="pay-bar">';
    html += '<div class="sch-week">' +
      btn("btn ghost", "‹ Previous payroll period", ' data-act="prevPeriod"') +
      "<span>" + C.esc(C.formatYMD(per.start) + " – " + C.formatYMD(per.end)) + "</span>" +
      btn("btn ghost", "Next ›", ' data-act="nextPeriod"') +
      btn("btn ghost", "Current payroll period", ' data-act="thisPeriod"') +
      "</div>";
    if (canManagePay()) {
      html += btn("btn cyan", "Download PDF", ' data-paypdf="1"');
    }
    html += "</div>";

    var list = activePeople();
    var team = { cards: 0, scheduled: 0, vs: 0, paid: 0, regular: 0, unpaid: 0, overtime: 0, doubleTime: 0 };
    if (!list.length) {
      html += '<p class="muted">No current employees on this roster.</p></div>';
      return html;
    }
    html += '<div class="scroll"><table class="list-table pay-table hb-pp"><thead><tr>' +
      "<th>Date</th><th>Role</th><th>Time card</th><th>Issues</th>" +
      "<th>Scheduled hours</th><th>Actual hours</th><th>Actual vs. scheduled</th>" +
      "<th>Regular hours</th><th>Unpaid breaks</th><th>OT hours</th><th>Double OT</th>" +
      "</tr></thead><tbody>";

    list.forEach(function (e) {
      var rows = [];
      dates.forEach(function (d) {
        var sh = C.shiftsFor(sid(), d, e.id)[0];
        var clocks = (C.displayClocks
          ? C.displayClocks(e.id, d, sid())
          : C.uniqueClocks(C.clocksFor({ employeeId: e.id, stationId: sid(), date: d }))).filter(function (c) {
          return c && c.inAt;
        });
        var sched = daySchedHours(e.id, d);
        var unpaid = unpaidMealHours(e.id, d);
        var split = C.paySplit(e.id, d, sid());
        var paid = C.workedHours(e.id, d, sid());
        if (!sh && !clocks.length && !paid && !sched) return;
        var card = dayTimeCard(clocks);
        var noShow = !clocks.length && sched > 0;
        rows.push({
          date: d,
          card: card.label || (noShow ? "" : "—"),
          labels: card.labels || [],
          missing: card.missing,
          noShow: noShow,
          scheduled: sched,
          paid: paid,
          vs: Math.round((paid - sched) * 100) / 100,
          regular: split.regular,
          overtime: split.overtime,
          doubleTime: split.doubleTime,
          unpaid: unpaid
        });
      });
      var sub = { scheduled: 0, paid: 0, regular: 0, overtime: 0, doubleTime: 0, unpaid: 0 };
      rows.forEach(function (r) {
        sub.scheduled += r.scheduled;
        sub.paid += r.paid;
        sub.regular += r.regular;
        sub.overtime += r.overtime;
        sub.doubleTime += r.doubleTime || 0;
        sub.unpaid += r.unpaid;
      });
      sub.vs = Math.round((sub.paid - sub.scheduled) * 100) / 100;
      team.cards += rows.length;
      team.scheduled += sub.scheduled;
      team.paid += sub.paid;
      team.regular += sub.regular;
      team.overtime += sub.overtime;
      team.doubleTime += sub.doubleTime || 0;
      team.unpaid += sub.unpaid;

      html += '<tr class="hb-group"><td>' + empNameBtn(e) + '</td><td>' + C.esc(empRole(e)) +
        "</td><td>" + rows.length + " Time Cards</td><td></td><td>" + hrs2(sub.scheduled) +
        "</td><td>" + hrs2(sub.paid) + '</td><td class="var-' + varianceCls(sub.paid, sub.scheduled) + '">' +
        signedHrs(sub.vs) + "</td><td>" + hrs2(sub.regular) + "</td><td>" +
        hrs2(sub.unpaid) + "</td><td>" + otCell(sub.overtime) + "</td><td>" + otCell(sub.doubleTime) + "</td></tr>";
      if (!rows.length) {
        html += '<tr><td colspan="11" class="muted">No time cards this period.</td></tr>';
      }
      rows.forEach(function (r) {
        var cardHtml = (r.labels && r.labels.length)
          ? r.labels.map(function (x) { return C.esc(x); }).join("<br>")
          : C.esc(r.card);
        html += "<tr><td>" + C.esc(C.formatYMD(r.date)) + "</td><td>" + C.esc(empRole(e)) +
          "</td><td>" + cardHtml + "</td><td>" + issueCell(r.missing, r.noShow) +
          "</td><td>" + hrs2(r.scheduled) + "</td><td>" + hrs2(r.paid) +
          '</td><td class="var-' + varianceCls(r.paid, r.scheduled) + '">' + signedHrs(r.vs) +
          "</td><td>" + hrs2(r.regular) + "</td><td>" + hrs2(r.unpaid) +
          "</td><td>" + otCell(r.overtime) + "</td><td>" + otCell(r.doubleTime) + "</td></tr>";
      });
    });
    team.vs = Math.round((team.paid - team.scheduled) * 100) / 100;
    html += '<tr class="pay-sum"><td>Totals</td><td></td><td>' + team.cards +
      " Time Cards</td><td></td><td>" + hrs2(team.scheduled) +
      "</td><td>" + hrs2(team.paid) + '</td><td class="var-' +
      varianceCls(team.paid, team.scheduled) + '">' + signedHrs(team.vs) +
      "</td><td>" + hrs2(team.regular) + "</td><td>" + hrs2(team.unpaid) +
      "</td><td>" + otCell(team.overtime) + "</td><td>" + otCell(team.doubleTime) + "</td></tr>";
    html += "</tbody></table></div></div>";
    return html;
  }
  function viewPayDetail(empId) {
    var e = C.employeeById(empId);
    if (!e) return viewPayPeriod();
    var per = currentPeriod();
    var canEdit = canManagePay();
    var range = C.paySplitRange(e.id, per.start, per.end, sid());
    var dates = C.datesInRange(per.start, per.end);
    var html = '<div class="card pay-detail"><div class="pay-bar"><div><h2>' + C.esc(e.name) + "</h2>" +
      '<p class="fine">Pay period ' + C.esc(per.start) + " – " + C.esc(per.end) +
      " · Scheduled " + hrs2(C.hoursForRange(e.id, sid(), per.start, per.end)) +
      " · Actual " + hrs2(range.total) +
      " · Reg " + hrs2(range.regular) + " · OT " + hrs2(range.overtime) +
      " · DT " + hrs2(range.doubleTime) + "</p></div>" +
      btn("btn ghost", "Back to period", ' data-payback="1"') + "</div>";
    var any = false;
    dates.forEach(function (d) {
      var sh = C.shiftsFor(sid(), d, e.id)[0];
      var clocks = C.clocksFor({ employeeId: e.id, stationId: sid(), date: d });
      var brks = C.breaksFor({ employeeId: e.id, stationId: sid(), date: d });
      var off = C.isTimeOff(e.id, sid(), d);
      var worked = C.workedHours(e.id, d, sid());
      if (!sh && !clocks.length && !brks.length && !off && !worked) return;
      any = true;
      html += payDayBlock(e, d, sh, clocks, brks, off, worked, canEdit);
    });
    if (!any) html += '<p class="muted">No punches or shifts in this period.</p>';
    if (canEdit) {
      html += '<div class="pay-add"><h3>Add a missing punch</h3>' +
        '<div class="form-grid">' +
        '<div><label>Date</label><input class="fld" type="date" id="missDate" min="' + per.start +
        '" max="' + per.end + '" value="' + C.esc(per.start) + '"></div>' +
        '<div><label>Clock in</label><input class="fld" type="time" id="missIn"></div>' +
        '<div><label>Clock out</label><input class="fld" type="time" id="missOut"></div>' +
        '<div style="align-self:end">' + btn("btn cyan", "Add punch", ' data-addpunch="' + e.id + '"') +
        "</div></div></div>";
    }
    html += "</div>";
    return html;
  }
  function punchClock(iso) {
    return fmtHomebaseTime(C.laHHmm(iso));
  }
  function minsBetween(a, b) {
    if (!a || !b) return 0;
    var ms = new Date(b) - new Date(a);
    if (ms < 0) return 0;
    return Math.round(ms / 60000);
  }
  function dayTimeline(clocks, brks) {
    var lines = [];
    var pairs = (clocks || []).filter(function (c) { return c && c.inAt; }).slice().sort(function (a, b) {
      return new Date(a.inAt) - new Date(b.inAt);
    });
    var paid = (brks || []).filter(function (b) { return b && b.startAt && b.kind !== "meal30"; });
    pairs.forEach(function (c, i) {
      var start = new Date(c.inAt).getTime();
      var end = c.outAt ? new Date(c.outAt).getTime() : Date.now();
      lines.push({ type: "work", start: start, end: end, open: !c.outAt, hours: C.clockHours(c) });
      paid.forEach(function (b) {
        var bs = new Date(b.startAt).getTime();
        if (bs < start || bs > end) return;
        lines.push({
          type: "paid",
          start: bs,
          end: b.endAt ? new Date(b.endAt).getTime() : bs,
          kind: b.kind,
          mins: minsBetween(b.startAt, b.endAt || b.startAt)
        });
      });
      var next = pairs[i + 1];
      if (c.outAt && next && next.inAt) {
        var gap = new Date(next.inAt) - new Date(c.outAt);
        if (gap >= 5 * 60 * 1000) {
          lines.push({
            type: "unpaid",
            start: new Date(c.outAt).getTime(),
            end: new Date(next.inAt).getTime(),
            mins: Math.round(gap / 60000)
          });
        }
      }
    });
    lines.sort(function (a, b) { return a.start - b.start; });
    return lines;
  }
  function payDayBlock(e, d, sh, clocks, brks, off, worked, canEdit) {
    var split = C.paySplit(e.id, d, sid());
    var sched = off ? "Off" : (sh ? fmtHomebaseTime(sh.start) + " – " + fmtHomebaseTime(sh.end) : "—");
    var html = '<div class="pay-day" data-day="' + d + '"><div class="pay-day-head"><h3>' + C.esc(C.formatYMD(d)) + "</h3>";
    if (canEdit) {
      html += btn("btn ghost", payEditDay === d ? "Close" : "Edit", ' data-editday="' + d + '"');
    }
    html += "</div>";
    var schedH = daySchedHours(e.id, d);
    html += '<div class="muted">Scheduled ' + C.esc(sched) + " · " + hrs2(schedH) +
      " scheduled hours · " + hrs2(worked) + " total paid hours · " +
      hrs2(worked - schedH) + " actual vs. scheduled · Regular " + hrs2(split.regular) +
      " · OT " + hrs2(split.overtime) +
      (split.seventh ? " · 7th consecutive day" : "") + "</div>";
    var showClocks = (C.displayClocks ? C.displayClocks(e.id, d, sid()) : clocks);
    var lines = dayTimeline(showClocks, brks);
    html += '<div class="hb-tl">';
    if (off) html += '<div class="hb-tl-row">Unavailable</div>';
    var works = lines.filter(function (ln) { return ln.type === "work"; });
    var paidNotes = lines.filter(function (ln) { return ln.type === "paid"; });
    var unpaidNotes = lines.filter(function (ln) { return ln.type === "unpaid"; });
    if (!works.length && !off) html += '<div class="hb-tl-row muted">No punches this day.</div>';
    works.forEach(function (ln) {
      var left = punchClock(new Date(ln.start).toISOString());
      var right = punchClock(new Date(ln.end).toISOString());
      html += '<div class="hb-tl-row work"><span>' + C.esc(left + (ln.open ? " – open" : " – " + right)) +
        "</span><span>Clock in–out · " + hrs2(ln.hours || 0) + "h</span></div>";
    });
    if (works.length > 1) {
      html += '<div class="hb-tl-row sum"><span>Actual hours</span><span>' + hrs2(worked) +
        "h = in–out + in–out</span></div>";
    }
    unpaidNotes.forEach(function (ln) {
      var left = punchClock(new Date(ln.start).toISOString());
      var right = punchClock(new Date(ln.end).toISOString());
      html += '<div class="hb-tl-note unpaid">Out for ' + (ln.mins || 30) + " min unpaid · " +
        C.esc(left + " – " + right) + " · not in hours</div>";
    });
    paidNotes.forEach(function (ln) {
      var left = punchClock(new Date(ln.start).toISOString());
      var right = punchClock(new Date(ln.end).toISOString());
      html += '<div class="hb-tl-note paid">Clocked out for ' + (ln.mins || 10) + " min paid · " +
        C.esc(left + " – " + right) + " · included in hours</div>";
    });
    html += "</div>";
    if (!canEdit || payEditDay !== d) return html + "</div>";
    if (!clocks.length) {
      html += '<div class="form-grid pay-edit">' +
        '<div><label>Clock in</label><input class="fld" type="time" data-newin="' + d + '"></div>' +
        '<div><label>Clock out</label><input class="fld" type="time" data-newout="' + d + '"></div></div>';
    }
    clocks.forEach(function (c) {
      html += '<div class="form-grid pay-edit">' +
        '<div><label>Clock in</label><input class="fld" type="time" data-cin="' + c.id + '" value="' +
        C.esc(C.laHHmm(c.inAt)) + '"></div>' +
        '<div><label>Clock out</label><input class="fld" type="time" data-cout="' + c.id + '" value="' +
        C.esc(C.laHHmm(c.outAt)) + '"></div></div>';
      if (c.editedBy) html += '<div class="pay-meta">Manager-edited</div>';
    });
    html += '<div class="form-grid pay-edit">';
    C.BREAK_KINDS.forEach(function (k) {
      var b = (brks || []).filter(function (x) { return x.kind === k; })[0];
      html += '<div><label>' + C.esc(C.BREAK_SHORT[k]) + " start</label>" +
        '<input class="fld" type="time" data-bstart="' + d + '" data-bkind="' + k + '" value="' +
        C.esc(b ? C.laHHmm(b.startAt) : "") + '"></div>';
      html += '<div><label>' + C.esc(C.BREAK_SHORT[k]) + " end</label>" +
        '<input class="fld" type="time" data-bend="' + d + '" data-bkind="' + k + '" value="' +
        C.esc(b ? C.laHHmm(b.endAt) : "") + '"></div>';
    });
    html += "</div>";
    html += '<div style="margin-top:10px">' + btn("btn cyan", "Save day", ' data-saveday="' + e.id + '" data-date="' + d + '"') + "</div>";
    html += "</div>";
    return html;
  }
  function payRows() {
    var per = currentPeriod();
    return activePeople().map(function (e) {
      var sp = C.paySplitRange(e.id, per.start, per.end, sid());
      var scheduled = C.hoursForRange(e.id, sid(), per.start, per.end);
      return {
        name: e.name,
        scheduled: scheduled,
        actual: sp.total,
        diff: Math.round((sp.total - scheduled) * 100) / 100,
        regular: sp.regular,
        overtime: sp.overtime,
        doubleTime: sp.doubleTime,
        total: sp.total
      };
    });
  }
  function openPayPdf() {
    if (!canManagePay()) { flash("Only the store manager can download the pay-period PDF."); return; }
    var per = currentPeriod();
    var rows = payRows();
    var title = "ARCO AM/PM OF DIAMOND · Pay period · " + per.start + " – " + per.end;
    var fname = "diamond-pay-" + per.start + "-" + per.end;
    var body = "";
    body += "<h1>" + C.esc(title) + "</h1>";
    body += '<p class="note">One line per employee for this pay period. No day punches. No wages.</p>';
    body += '<table><thead><tr><th>Employee</th><th class="n">Scheduled</th><th class="n">Actual hours</th>' +
      '<th class="n">Actual vs. scheduled</th><th class="n">Regular</th><th class="n">OT</th>' +
      '<th class="n">Double OT</th></tr></thead><tbody>';
    var tSched = 0, tAct = 0, tReg = 0, tOt = 0, tDt = 0;
    rows.forEach(function (r) {
      tSched += r.scheduled; tAct += r.actual; tReg += r.regular; tOt += r.overtime; tDt += r.doubleTime;
      body += "<tr><td>" + C.esc(r.name) + '</td><td class="n">' + hrs2(r.scheduled) +
        '</td><td class="n">' + hrs2(r.actual) + '</td><td class="n">' +
        signedHrs(r.diff) +
        '</td><td class="n">' + hrs2(r.regular) +
        '</td><td class="n">' + hrs2(r.overtime) + '</td><td class="n">' + hrs2(r.doubleTime) +
        "</td></tr>";
    });
    body += '<tr class="sum"><td>Totals</td><td class="n">' + hrs2(tSched) + '</td><td class="n">' +
      hrs2(tAct) + '</td><td class="n">' + signedHrs(Math.round((tAct - tSched) * 100) / 100) +
      '</td><td class="n">' + hrs2(tReg) + '</td><td class="n">' + hrs2(tOt) +
      '</td><td class="n">' + hrs2(tDt) + "</td></tr>";
    body += "</tbody></table>";
    body += "<footer>Prepared for RachelOberholtzer. No wages.</footer>";

    var doc = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + C.esc(fname) + "</title>" +
      "<style>body{font-family:Georgia,serif;margin:32px;color:#111}h1{font-size:18px;font-weight:700}" +
      "table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border-bottom:1px solid #ccc;padding:8px 6px;text-align:left}" +
      "th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}tr.sum td{font-weight:700;border-top:2px solid #111}h2{font-size:15px;margin:22px 0 6px}.note{font-size:12px;color:#444}footer{margin-top:28px;font-size:12px;color:#444}" +
      "@media print{button{display:none}}</style></head><body>" + body + "</body></html>";
    var w = window.open("", fname);
    if (!w) { flash("Allow pop-ups to print the pay-period PDF."); return; }
    w.document.open();
    w.document.write(doc);
    w.document.close();
    try { w.document.title = fname; } catch (err) {}
    setTimeout(function () { try { w.focus(); w.print(); } catch (e2) {} }, 250);
  }
    function applyLastWeek() {
    var fromMon = C.addDays(weekMon, -7);
    var fromDates = C.weekDates(fromMon);
    var toDates = C.weekDates(weekMon);
    var srcCount = 0;
    activePeople().forEach(function (e) {
      fromDates.forEach(function (d) {
        if (C.shiftsFor(sid(), d, e.id)[0]) srcCount++;
      });
    });
    if (!srcCount) {
      flash("Last week has no shifts to copy.");
      return;
    }
    var destHas = 0;
    activePeople().forEach(function (e) {
      toDates.forEach(function (d) {
        if (C.shiftsFor(sid(), d, e.id)[0]) destHas++;
      });
    });
    var msg = "Apply last week (" + weekRangeLabel(fromDates) + ") to " + weekRangeLabel(toDates) + "?";
    if (destHas) msg += " This replaces shifts already on this week. Time off stays.";
    if (!window.confirm(msg)) return;
    var r = C.copyWeekShifts(sid(), fromMon, weekMon);
    flash("Copied " + r.copied + " shift" + (r.copied === 1 ? "" : "s") +
      (r.skippedOff ? ". Skipped " + r.skippedOff + " time-off day" + (r.skippedOff === 1 ? "" : "s") : "") + ".");
    render();
  }


  function employeeTaskSheetHtml(e, dates, range, loc) {
    var role = C.roleName(e.roleId) || e.role || "";
    var hrs = C.hoursForRange(e.id, sid(), dates[0], dates[6]);
    var html = '<section class="emp"><h1>' + C.esc(e.name) + "</h1>";
    html += '<p class="note">' + C.esc(loc) + " · Your CORE tasks · " + C.esc(range);
    if (role) html += " · " + C.esc(role);
    html += " · " + hrs + " hrs this week</p>";
    dates.forEach(function (d, i) {
      var tasks = empTasks(e.id, d);
      html += "<h3>" + C.DAYS[i] + " " + C.esc(fmtMonthDay(d)) + " · " + C.esc(dayLine(e, d)) + "</h3>";
      if (!tasks.length) {
        html += '<p class="empty">No tasks</p>';
        return;
      }
      html += "<ul>";
      tasks.forEach(function (tk) {
        var src = tk.a.source === "cheatsheet" ? "cheat sheet" : "standing";
        var extra = (tk.a.requiresPhoto ? " · photo required" : "") + (tk.done ? " · done" : "");
        html += "<li>" + C.esc(tk.a.title) + " <span class=\"meta\">(" + src + extra + ")</span></li>";
      });
      html += "</ul>";
    });
    html += "<footer>Hand this sheet to " + C.esc(e.name.split(" ")[0]) +
      ". ARCO AM/PM OF DIAMOND · " + C.esc(range) + "</footer></section>";
    return html;
  }
  function printTaskSheets(people) {
    people = people || [];
    if (!people.length) { flash("No employees to print."); return; }
    var dates = C.weekDates(weekMon || C.weekStartMonday());
    var range = weekRangeLabel(dates);
    var loc = locName();
    var title = people.length === 1
      ? (people[0].name + " · CORE tasks · " + range)
      : (loc + " · CORE tasks · one page per employee · " + range);
    var body = "";
    people.forEach(function (e) { body += employeeTaskSheetHtml(e, dates, range, loc); });
    var doc = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + C.esc(title) + "</title>" +
      "<style>body{font-family:Calibri,Arial,sans-serif;margin:18px;color:#111}" +
      "section.emp{page-break-after:always}section.emp:last-child{page-break-after:auto}" +
      "h1{font-size:32px;margin:0 0 8px}.note{font-size:18px;color:#333;margin:0 0 16px}" +
      "h3{font-size:20px;margin:16px 0 6px}ul{margin:0 0 10px 22px;padding:0;font-size:18px;line-height:1.35}li{margin:5px 0}" +
      ".meta{color:#555;font-size:16px}.empty{font-size:16px;color:#666;margin:0 0 10px}" +
      "footer{margin-top:20px;font-size:14px;color:#444;border-top:1px solid #ccc;padding-top:8px}" +
      "@media print{button{display:none}section.emp{page-break-after:always}section.emp:last-child{page-break-after:auto}}</style></head><body>" +
      body + "</body></html>";
    var w = window.open("", "diamond-tasks-print");
    if (!w) { flash("Allow pop-ups to print tasks."); return; }
    w.document.open();
    w.document.write(doc);
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e2) {} }, 250);
  }
  function openTaskPrintByEmployee() {
    var people = peopleOnWeek();
    if (!people.length) people = activePeople();
    if (!people.length) { flash("No employees to print."); return; }
    var dates = C.weekDates(weekMon || C.weekStartMonday());
    var bg = document.createElement("div");
    bg.className = "modal-bg";
    var html = '<div class="modal"><h3>Print tasks — one sheet per person</h3>';
    html += '<p class="muted">Week of ' + C.esc(weekRangeLabel(dates)) +
      ". Print all (separate pages you can hand out) or print one employee.</p>";
    html += '<div style="margin:10px 0">' + btn("btn cyan", "Print all — separate pages", ' id="ptAll"') + "</div>";
    html += "<ul style='list-style:none;padding:0;margin:0'>";
    people.forEach(function (e) {
      html += '<li style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #eee">';
      html += "<span>" + C.esc(e.name) + "</span>" +
        btn("btn ghost", "Print", ' data-printone="' + C.esc(e.id) + '"');
      html += "</li>";
    });
    html += "</ul>";
    html += '<div style="margin-top:12px">' + btn("btn ghost", "Close", ' id="ptClose"') + "</div></div>";
    bg.innerHTML = html;
    document.body.appendChild(bg);
    $("ptClose").onclick = function () { bg.remove(); };
    $("ptAll").onclick = function () { bg.remove(); printTaskSheets(people); };
    bg.querySelectorAll("[data-printone]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-printone");
        var one = people.filter(function (e) { return e.id === id; })[0];
        if (one) printTaskSheets([one]);
      };
    });
    bg.onclick = function (ev) { if (ev.target === bg) bg.remove(); };
  }
  function openWeekPrint() {
    var dates = C.weekDates(weekMon);
    var list = activePeople();
    var title = locName() + " · Week of " + weekRangeLabel(dates);
    var body = "<h1>" + C.esc(title) + "</h1>";
    body += '<p class="note">★ Leader is the shift leader for that shift. Hang this print so they can see it.</p>';
    body += '<table><thead><tr><th>Team</th>';
    dates.forEach(function (d, i) {
      body += "<th>" + C.DAYS[i] + "<br>" + C.esc(fmtMonthDay(d)) + "</th>";
    });
    body += "<th>Hours</th></tr></thead><tbody>";
    list.forEach(function (e) {
      body += "<tr><td class=\"who\">" + C.esc(e.name) + "</td>";
      dates.forEach(function (d) {
        var off = C.isTimeOff(e.id, sid(), d);
        var sh = C.shiftsFor(sid(), d, e.id)[0];
        if (off) body += '<td class="off">Unavailable</td>';
        else if (sh) {
          body += '<td class="has ' + shiftBand(sh) + (sh.leader ? " lead" : "") + '">' +
            C.esc(fmtHomebaseTime(sh.start) + "–" + fmtHomebaseTime(sh.end));
          if (sh.leader) body += '<div class="sign">★ LEADER</div>';
          body += "</td>";
        } else body += "<td></td>";
      });
      body += '<td class="n">' + C.esc(fmtHrs(C.hoursForRange(e.id, sid(), dates[0], dates[6]))) + "</td></tr>";
    });
    body += "</tbody></table>";
    body += "<footer>ARCO AM/PM OF DIAMOND · Prepared for RachelOberholtzer</footer>";
    var doc = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>" + C.esc(title) + "</title>" +
      "<style>body{font-family:Calibri,Arial,sans-serif;margin:18px;color:#111}h1{font-size:18px;margin:0 0 6px}" +
      ".note{font-size:12px;margin:0 0 12px}table{width:100%;border-collapse:collapse;table-layout:fixed}" +
      "th,td{border:1px solid #333;padding:6px 4px;vertical-align:top;font-size:12px}" +
      "th{background:#f3f3f3}td.who{font-weight:700;width:16%}td.has{font-weight:700}" +
      "td.morning{background:#f6e7a0}td.second{background:#c8edd4}td.night{background:#d0e2f7}td.off{background:#fff4e5}" +
      ".sign{margin-top:5px;display:inline-block;border:2px solid #111;background:#ffd54a;padding:2px 7px;" +
      "font-size:11px;font-weight:800;letter-spacing:.08em}footer{margin-top:16px;font-size:11px}" +
      "@media print{button{display:none}body{margin:8px}}</style></head><body>" + body + "</body></html>";
    var w = window.open("", "diamond-week-print");
    if (!w) { flash("Allow pop-ups to print the week."); return; }
    w.document.open();
    w.document.write(doc);
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e2) {} }, 250);
  }
  function savePayDay(empId, dateYmd) {
    if (!canManagePay()) { flash("Only the store manager can edit punches."); return; }
    var meta = managerMeta();
    var clocks = C.clocksFor({ employeeId: empId, stationId: sid(), date: dateYmd });
    if (!clocks.length) {
      var ni = document.querySelector('[data-newin="' + dateYmd + '"]');
      var no = document.querySelector('[data-newout="' + dateYmd + '"]');
      var inV = ni ? ni.value : "";
      var outV = no ? no.value : "";
      if (inV || outV) C.upsertClock(empId, sid(), dateYmd, inV, outV, meta);
    }
    clocks.forEach(function (c) {
      var cin = document.querySelector('[data-cin="' + c.id + '"]');
      var cout = document.querySelector('[data-cout="' + c.id + '"]');
      C.updateClock(c.id, { inAt: cin ? cin.value : "", outAt: cout ? cout.value : "" }, meta);
    });
    C.BREAK_KINDS.forEach(function (k) {
      var st = document.querySelector('[data-bstart="' + dateYmd + '"][data-bkind="' + k + '"]');
      var en = document.querySelector('[data-bend="' + dateYmd + '"][data-bkind="' + k + '"]');
      C.upsertBreak(empId, sid(), dateYmd, k, st ? st.value : "", en ? en.value : "", meta);
    });
    flash("Saved.");
    render();
  }
  function addMissingPunch(empId) {
    if (!canManagePay()) { flash("Only the store manager can edit punches."); return; }
    var d = $("missDate");
    var inn = $("missIn");
    var out = $("missOut");
    var dateYmd = d ? d.value : "";
    var per = currentPeriod();
    if (!dateYmd || dateYmd < per.start || dateYmd > per.end) { flash("Pick a date in this pay period."); return; }
    if (!inn || !inn.value) { flash("Clock in is required."); return; }
    C.upsertClock(empId, sid(), dateYmd, inn.value, out ? out.value : "", managerMeta());
    flash("Punch added.");
    render();
  }

  function remind(empId, mailto) {
    var e = C.employeeById(empId);
    if (!e) return;
    var left = empTasks(e.id, C.todayYMD()).filter(function (t) { return !t.done; }).map(function (t) { return t.a; });
    var text = C.reminderText(e, left);
    if (mailto) {
      location.href = "mailto:?subject=" + encodeURIComponent("CORE reminder") + "&body=" + encodeURIComponent(text);
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { flash("Reminder copied."); }, function () { window.prompt("Copy reminder", text); });
    } else {
      window.prompt("Copy reminder", text);
    }
  }
  function flash(msg) {
    var n = document.createElement("div");
    n.className = "chip";
    n.textContent = msg;
    n.style.position = "fixed";
    n.style.bottom = "16px";
    n.style.left = "16px";
    n.style.zIndex = "30";
    document.body.appendChild(n);
    setTimeout(function () { n.remove(); }, 2200);
  }

  function taskBlock(empId, date) {
    var tasks = empTasks(empId, date);
    var html = '<div class="hb-tasks"><h4>Tasks this day</h4>';
    if (!tasks.length) {
      html += '<p class="muted">No tasks assigned this day.</p>';
    } else {
      tasks.forEach(function (t) {
        var src = t.a.source === "cheatsheet" ? "Cheat sheet" : "Standing";
        html += '<div class="hb-task"><div><div class="ttl">' + C.esc(t.a.title) + "</div>" +
          '<div class="meta">' + C.esc(src) + (t.a.requiresPhoto ? " · Photo required" : "") + "</div></div>" +
          '<div class="task-acts">' +
          '<span class="chip' + (t.done ? "" : " warn") + '">' + (t.done ? "Done" : "Not done") + "</span> " +
          btn("btn ghost", t.a.requiresPhoto ? "Photo on" : "Photo off", ' data-togphoto="' + t.a.id + '"') +
          reassignSelectHtml(t.a.id, empId) +
          "</div></div>";
      });
    }
    html += addTaskFormHtml(empId, date, "slide");
    html += "</div>";
    return html;
  }


  function punchNoteTime(ms) {
    return punchClock(new Date(ms).toISOString());
  }
  function punchTimelineHtml(empId, dateYmd) {
    var clocks = C.displayClocks ? C.displayClocks(empId, dateYmd, sid()) : [];
    var raw = C.clocksFor({ employeeId: empId, stationId: sid(), date: dateYmd }) || [];
    var brks = C.breaksFor({ employeeId: empId, stationId: sid(), date: dateYmd }) || [];
    var meal = brks.filter(function (b) { return b && b.kind === "meal30" && b.startAt; })[0];
    var paidBrks = brks.filter(function (b) { return b && b.startAt && b.kind !== "meal30"; });
    var lines = dayTimeline(clocks, brks);
    var works = lines.filter(function (ln) { return ln.type === "work"; });
    var unpaid = lines.filter(function (ln) { return ln.type === "unpaid"; });
    var paid = lines.filter(function (ln) { return ln.type === "paid"; });
    var html = '<div class="shift-punches"><h4>Time card this day</h4><div class="hb-tl">';
    if (!raw.length && !brks.length) {
      html += '<div class="hb-tl-row muted">No punches this day.</div></div></div>';
      return html;
    }
    if (!works.length) html += '<div class="hb-tl-row muted">No clock in–out this day.</div>';
    works.forEach(function (ln) {
      var left = punchNoteTime(ln.start);
      var right = punchNoteTime(ln.end);
      html += '<div class="hb-tl-row work"><span>' + C.esc(left + (ln.open ? " – open" : " – " + right)) +
        "</span><span>Clock in–out" + (ln.hours ? " · " + hrs2(ln.hours) + "h" : "") + "</span></div>";
    });
    if (unpaid.length) {
      unpaid.forEach(function (ln) {
        html += '<div class="hb-tl-note unpaid">Clocked out for ' + (ln.mins || 30) + " min unpaid · " +
          C.esc(punchNoteTime(ln.start) + " – " + punchNoteTime(ln.end)) + " · not in hours</div>";
      });
    } else if (meal) {
      html += '<div class="hb-tl-note unpaid">Clocked out for 30 min unpaid · ' +
        C.esc(punchClock(meal.startAt) + (meal.endAt ? " – " + punchClock(meal.endAt) : " – open")) +
        " · not in hours</div>";
    } else {
      html += '<div class="hb-tl-note none">No unpaid 30 taken</div>';
    }
    if (paid.length) {
      paid.forEach(function (ln) {
        html += '<div class="hb-tl-note paid">Clocked out for ' + (ln.mins || 10) + " min paid · " +
          C.esc(punchNoteTime(ln.start) + " – " + punchNoteTime(ln.end)) + " · included in hours</div>";
      });
    } else if (paidBrks.length) {
      paidBrks.forEach(function (b) {
        html += '<div class="hb-tl-note paid">Clocked out for 10 min paid · ' +
          C.esc(punchClock(b.startAt) + (b.endAt ? " – " + punchClock(b.endAt) : " – open")) +
          " · included in hours</div>";
      });
    } else {
      html += '<div class="hb-tl-note none">No paid 10s taken</div>';
    }
    html += "</div></div>";
    return html;
  }
  function openShiftEditor(empId, date) {
    var e = C.employeeById(empId);
    if (!e) return;
    var sh = C.shiftsFor(sid(), date, empId)[0];
    var off = C.isTimeOff(empId, sid(), date);
    var bg = document.createElement("div");
    bg.className = "modal-bg hb-slide-bg";
    bg.innerHTML = '<div class="hb-slide modal"><h3>' + C.esc(e.name) + "</h3>" +
      '<p class="hb-date">' + C.esc(C.formatYMD(date)) + (off ? " · Time off" : "") + "</p>" +
      punchTimelineHtml(empId, date) +
      '<div class="form-grid"><div><label>Start time</label><input class="fld" type="time" id="shStart" value="' +
      C.esc(sh ? sh.start : "09:00") + '"></div>' +
      '<div><label>End time</label><input class="fld" type="time" id="shEnd" value="' +
      C.esc(sh ? sh.end : "17:00") + '"></div></div>' +
      '<label class="hb-leader-check"><input type="checkbox" id="shLeader"' +
      (sh && sh.leader ? " checked" : "") + "> Shift leader for this shift</label>" +
      '<p class="fine">One leader per morning, second, or night that day. A yellow ★ Leader sign shows on the printed week.</p>' +
      '<div class="hb-actions">' +
      btn("btn cyan", sh ? "Save" : "Add shift", ' id="shSave"') +
      btn(sh ? "btn danger" : "btn ghost", "Delete", ' id="shClear"') +
      btn("btn ghost", off ? "Remove time off" : "Mark time off", ' id="shOff"') +
      btn("btn ghost", "Close", ' id="shClose"') +
      "</div>" +
      taskBlock(empId, date) + "</div>";
    document.body.appendChild(bg);
    bg.onclick = function (ev) { if (ev.target === bg) bg.remove(); };
    $("shClose").onclick = function () { bg.remove(); };
    $("shSave").onclick = function () {
      if (C.isTimeOff(empId, sid(), date)) {
        window.alert("This day is Unavailable (approved time off). Remove the time off before adding a shift.");
        return;
      }
      var rec = C.upsertShift(empId, sid(), date, $("shStart").value, $("shEnd").value);
      if (rec) C.setShiftLeader(empId, sid(), date, $("shLeader") && $("shLeader").checked);
      bg.remove();
      render();
    };
    $("shClear").onclick = function () {
      C.upsertShift(empId, sid(), date, "", "");
      bg.remove();
      render();
    };
    $("shOff").onclick = function () {
      if (off) {
        C.timeOffFor(sid(), empId, date).forEach(function (t) { C.removeTimeOff(t.id); });
      } else {
        var reason = window.prompt("Time off reason") || "Time off";
        C.addTimeOff(empId, sid(), date, reason);
      }
      bg.remove();
      render();
    };
    bindTaskControls(bg, function () {
      bg.remove();
      openShiftEditor(empId, date);
    });
  }
  function addDayTask(empId, dateYmd, prefix) {
    if (!canManagePay()) { flash("Only the store manager can add tasks."); return false; }
    prefix = prefix || "day";
    var cat = $(prefix + "Cat");
    var title = $(prefix + "Title");
    var photo = $(prefix + "Photo");
    var rec = C.addAssignment(empId, sid(), {
      catalogId: cat ? cat.value : "",
      title: title ? title.value : "",
      requiresPhoto: photo ? photo.checked : false,
      date: dateYmd
    });
    if (!rec) { flash("Pick a cheat-sheet task or type a title."); return false; }
    flash("Task added.");
    return true;
  }
  function switchTask(asgId, toEmpId, after) {
    if (!canManagePay()) { flash("Only the store manager can switch tasks."); return; }
    var r = C.reassignAssignment(asgId, toEmpId);
    if (!r || !r.ok) { flash((r && r.error) || "Could not switch."); return; }
    flash("Task switched.");
    if (after) after();
    else render();
  }
  function bindTaskControls(root, after) {
    root = root || document;
    var cat = root.querySelector("#slideCat") || root.querySelector("#dayCat") || $("catPick");
    if (cat) cat.onchange = function () {
      var photo = root.querySelector("#slidePhoto") || root.querySelector("#dayPhoto") || $("taskPhoto");
      if (photo) {
        var rec = C.catalogById(cat.value);
        photo.checked = !!(rec && rec.requiresPhoto);
      }
    };
    root.querySelectorAll("[data-adddaytask]").forEach(function (b) {
      b.onclick = function () {
        if (addDayTask(b.getAttribute("data-adddaytask"), b.getAttribute("data-date"), b.getAttribute("data-prefix") || "slide")) {
          if (after) after();
          else render();
        }
      };
    });
    root.querySelectorAll("[data-togphoto]").forEach(function (b) {
      b.onclick = function () {
        if (!canManagePay()) return;
        var id = b.getAttribute("data-togphoto");
        var list = C.assignments(sid());
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === id) {
            C.updateAssignment(id, { requiresPhoto: !list[i].requiresPhoto });
            break;
          }
        }
        if (after) after();
        else render();
      };
    });
    root.querySelectorAll("[data-reassign]").forEach(function (sel) {
      sel.onchange = function () {
        var to = sel.value;
        if (!to) return;
        switchTask(sel.getAttribute("data-reassign"), to, after);
      };
    });
  }
  function openTaskAdd(empId, dateYmd) {
    var e = C.employeeById(empId);
    if (!e || !canManagePay()) return;
    var bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = '<div class="modal"><h3>Add task · ' + C.esc(e.name) + "</h3>" +
      '<p class="muted">' + C.esc(C.formatYMD(dateYmd)) + "</p>" +
      addTaskFormHtml(empId, dateYmd, "day") +
      '<div style="margin-top:12px">' + btn("btn ghost", "Close", ' id="taskClose"') + "</div></div>";
    document.body.appendChild(bg);
    $("taskClose").onclick = function () { bg.remove(); };
    bg.onclick = function (ev) { if (ev.target === bg) bg.remove(); };
    bindTaskControls(bg, function () { bg.remove(); render(); });
  }

  function openPublish() {
    var pack = composePublishEmails();
    markWeekPublished();
    try {
      localStorage.setItem("ss_sched_last_mail", JSON.stringify({
        week: weekMon, station: sid(), pack: pack, at: C.nowISO()
      }));
    } catch (err) {}
    var bg = document.createElement("div");
    bg.className = "modal-bg hb-slide-bg";
    var html = '<div class="hb-slide modal"><h3>Publish</h3>';
    html += '<p class="hb-date">Week marked published. Messages were composed, not sent from this browser.</p>';
    html += '<p class="muted">From ' + C.esc(MAIL_FROM) + ". Manager copy goes to " + C.esc(MANAGER_EMAIL) + ".</p>";
    if (pack.skipped && pack.skipped.length) {
      html += '<p class="muted">No roster email on file (skipped, not invented): ' +
        C.esc(pack.skipped.join(", ")) + "</p>";
    }
    pack.msgs.forEach(function (m) {
      html += "<h4 style='margin:14px 0 4px;font-size:13px'>" +
        C.esc(m.kind === "manager" ? "Manager · RachelOberholtzer" : m.name) + "</h4>";
      html += '<div class="fine">To: ' + C.esc(m.to) + "<br>Subject: " + C.esc(m.subject) + "</div>";
      html += '<div class="hb-mail">' + C.esc(m.body) + "</div>";
    });
    html += '<div class="hb-actions">' + btn("btn cyan", "Close", ' id="pubClose"') + "</div></div>";
    bg.innerHTML = html;
    document.body.appendChild(bg);
    bg.onclick = function (ev) { if (ev.target === bg) bg.remove(); };
    $("pubClose").onclick = function () { bg.remove(); render(); };
    render();
  }

  function openAvailEditor(empId, day) {
    var e = C.employeeById(empId);
    if (!e) return;
    var rec = C.availabilityFor(sid(), empId).filter(function (a) { return a.day === day; })[0];
    var on = !rec || rec.available !== false;
    var bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = '<div class="modal"><h3>' + C.esc(e.name) + " · " + C.DAYS[day] + "</h3>" +
      '<label><input type="checkbox" id="avOn"' + (on ? " checked" : "") + "> Available</label>" +
      '<div class="form-grid" style="margin-top:10px"><div><label>From</label><input class="fld" type="time" id="avStart" value="' +
      C.esc(rec && rec.start ? rec.start : "") + '"></div>' +
      '<div><label>To</label><input class="fld" type="time" id="avEnd" value="' +
      C.esc(rec && rec.end ? rec.end : "") + '"></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' + btn("btn cyan", "Save", ' id="avSave"') +
      btn("btn ghost", "Close", ' id="avClose"') + "</div></div>";
    document.body.appendChild(bg);
    $("avClose").onclick = function () { bg.remove(); };
    $("avSave").onclick = function () {
      C.setAvailability(empId, sid(), day, $("avOn").checked, $("avStart").value, $("avEnd").value);
      bg.remove();
      render();
    };
  }

  function bindView() {
    var show = $("showTerm");
    if (show) show.onchange = function () { showTerm = show.checked; render(); };

    var addEmp = $("addEmp");
    if (addEmp) addEmp.onsubmit = function (ev) {
      ev.preventDefault();
      var name = addEmp.name.value;
      var pass = addEmp.pass ? addEmp.pass.value : "";
      var hired = addEmp.hired ? addEmp.hired.value : "";
      var address = addEmp.address ? addEmp.address.value : "";
      var role = addEmp.role.value;
      var term = addEmp.terminated ? addEmp.terminated.value : "";
      var why = addEmp.termReason ? addEmp.termReason.value : "";
      if (term && !String(why).trim()) { flash("Terminated date needs a reason."); return; }
      if (addEmp.pass) addEmp.pass.value = "";
      C.addEmployee(name, "", sid(), hired, address, {
        clockPass: pass,
        roleId: role,
        phone: addEmp.phone ? addEmp.phone.value : "",
        email: addEmp.email ? addEmp.email.value : "",
        hourlyRate: addEmp.rate ? addEmp.rate.value : "",
        terminatedAt: term,
        terminateReason: why
      }).then(function (rec) {
        selectedEmp = rec.id;
        render();
      }).catch(function (err) {
        flash((err && err.message) || "Could not add. Check name, time clock pass, and date hired.");
      });
    };

    document.querySelectorAll("[data-open]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-open");
        selectedEmp = selectedEmp === id ? "" : id;
        render();
      };
    });
    document.querySelectorAll("[data-saveemp]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-saveemp");
        var term = $("empTermDate") ? $("empTermDate").value : "";
        var why = $("empTermReason") ? $("empTermReason").value : "";
        var patch = {
          name: $("empName") ? $("empName").value : undefined,
          roleId: $("empRole") ? $("empRole").value : "",
          hiredOn: $("empHired") ? $("empHired").value : undefined,
          address: $("empAddr") ? $("empAddr").value : undefined,
          phone: $("empPhone") ? $("empPhone").value : undefined,
          email: $("empEmail") ? $("empEmail").value : undefined,
          hourlyRate: $("empRate") ? $("empRate").value : undefined,
          terminatedAt: term,
          terminateReason: why
        };
        var pass = $("empPass") ? $("empPass").value : "";
        if (pass) patch.clockPass = pass;
        if ($("empPass")) $("empPass").value = "";
        if (term && String(why).trim()) patch.status = "terminated";
        if (!term) { patch.status = "active"; patch.terminatedAt = ""; }
        C.updateEmployee(id, patch).then(function () { render(); });
      };
    });
    document.querySelectorAll("[data-addtask]").forEach(function (b) {
      b.onclick = function () {
        if (!canManagePay()) { flash("Only the store manager can add tasks."); return; }
        var cat = $("catPick");
        var title = $("taskTitle");
        var photo = $("taskPhoto");
        C.addAssignment(b.getAttribute("data-addtask"), sid(), {
          catalogId: cat ? cat.value : "",
          title: title ? title.value : "",
          requiresPhoto: photo ? photo.checked : false
        });
        render();
      };
    });
    document.querySelectorAll("[data-reassign]").forEach(function (sel) {
      sel.onchange = function () {
        var to = sel.value;
        if (!to) return;
        switchTask(sel.getAttribute("data-reassign"), to);
      };
    });
    document.querySelectorAll("[data-opentask]").forEach(function (b) {
      b.onclick = function () {
        openTaskAdd(b.getAttribute("data-opentask"), b.getAttribute("data-date") || C.todayYMD());
      };
    });
    var catPick = $("catPick");
    if (catPick) catPick.onchange = function () {
      var opt = catPick.options[catPick.selectedIndex];
      var photo = $("taskPhoto");
      if (photo && opt) {
        var rec = C.catalogById(catPick.value);
        photo.checked = !!(rec && rec.requiresPhoto);
      }
    };
    document.querySelectorAll("[data-togphoto]").forEach(function (b) {
      b.onclick = function () {
        if (!canManagePay()) { flash("Only the store manager can change photo-required."); return; }
        var id = b.getAttribute("data-togphoto");
        var list = C.assignments(sid());
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === id) { C.updateAssignment(id, { requiresPhoto: !list[i].requiresPhoto }); break; }
        }
        render();
      };
    });
    document.querySelectorAll("[data-deltask]").forEach(function (b) {
      b.onclick = function () {
        if (!canManagePay()) return;
        C.removeAssignment(b.getAttribute("data-deltask"));
        render();
      };
    });
    document.querySelectorAll("[data-remind]").forEach(function (b) {
      b.onclick = function () { remind(b.getAttribute("data-remind"), false); };
    });
    document.querySelectorAll("[data-mailto]").forEach(function (b) {
      b.onclick = function () { remind(b.getAttribute("data-mailto"), true); };
    });
    document.querySelectorAll("[data-term]").forEach(function (b) {
      b.onclick = function () {
        var d = $("termDate");
        var r = $("termReason");
        if (!d || !d.value || !r || !String(r.value).trim()) { flash("Last day and reason are required."); return; }
        C.terminateEmployee(b.getAttribute("data-term"), r.value, d.value);
        render();
      };
    });
    document.querySelectorAll("[data-restore]").forEach(function (b) {
      b.onclick = function () { C.restoreEmployee(b.getAttribute("data-restore")); render(); };
    });

    var addRole = $("addRole");
    if (addRole) addRole.onsubmit = function (ev) {
      ev.preventDefault();
      C.addRole(sid(), addRole.name.value);
      render();
    };
    document.querySelectorAll("[data-delrole]").forEach(function (b) {
      b.onclick = function () { C.removeRole(b.getAttribute("data-delrole")); render(); };
    });

    var search = $("shiftSearch");
    if (search) {
      search.oninput = function () { searchQ = search.value; };
      search.onchange = function () { searchQ = search.value; render(); };
      search.onkeydown = function (ev) { if (ev.key === "Enter") { ev.preventDefault(); searchQ = search.value; render(); } };
    }
    document.querySelectorAll("[data-edit]").forEach(function (el) {
      el.onclick = function () { openShiftEditor(el.getAttribute("data-edit"), el.getAttribute("data-date")); };
    });

    var addOff = $("addOff");
    if (addOff) addOff.onsubmit = function (ev) {
      ev.preventDefault();
      C.addTimeOff(addOff.emp.value, sid(), addOff.date.value, addOff.reason.value);
      render();
    };
    document.querySelectorAll("[data-deloff]").forEach(function (b) {
      b.onclick = function () { C.removeTimeOff(b.getAttribute("data-deloff")); render(); };
    });
    document.querySelectorAll("[data-approveto]").forEach(function (b) {
      b.onclick = function () {
        if (!canDecideTimeOff()) return;
        C.approveTimeOffRequest(b.getAttribute("data-approveto"), managerActor());
        render();
      };
    });
    document.querySelectorAll("[data-denyto]").forEach(function (b) {
      b.onclick = function () {
        if (!canDecideTimeOff()) return;
        C.denyTimeOffRequest(b.getAttribute("data-denyto"), managerActor());
        render();
      };
    });
    document.querySelectorAll("[data-approvecp]").forEach(function (b) {
      b.onclick = function () {
        if (!canDecideTimeOff()) return;
        C.approveClockPermit(b.getAttribute("data-approvecp"), managerActor());
        render();
      };
    });
    document.querySelectorAll("[data-denycp]").forEach(function (b) {
      b.onclick = function () {
        if (!canDecideTimeOff()) return;
        C.denyClockPermit(b.getAttribute("data-denycp"), managerActor());
        render();
      };
    });
    document.querySelectorAll("[data-av]").forEach(function (el) {
      el.onclick = function () { openAvailEditor(el.getAttribute("data-av"), Number(el.getAttribute("data-day"))); };
    });

    var barDay = $("barDay");
    if (barDay) barDay.onchange = function () { dayYmd = barDay.value; render(); };
    document.querySelectorAll("[data-barstep]").forEach(function (b) {
      b.onclick = function () {
        dayYmd = C.addDays(dayYmd || C.todayYMD(), Number(b.getAttribute("data-barstep")));
        render();
      };
    });
    document.querySelectorAll("[data-bartoday]").forEach(function (b) {
      b.onclick = function () { dayYmd = C.todayYMD(); render(); };
    });
    var tsDay = $("tsDay");
    if (tsDay) tsDay.onchange = function () { dayYmd = tsDay.value; render(); };
    document.querySelectorAll("[data-editday]").forEach(function (b) {
      b.onclick = function () {
        var d = b.getAttribute("data-editday");
        payEditDay = payEditDay === d ? "" : d;
        render();
      };
    });
    document.querySelectorAll("[data-payemp]").forEach(function (b) {
      b.onclick = function () {
        selectedEmp = b.getAttribute("data-payemp");
        payEditDay = "";
        if (sub === "day") {
          payStart = C.payPeriodOf(dayYmd || C.todayYMD()).start;
          sub = "period";
        }
        render();
      };
    });
    document.querySelectorAll("[data-payback]").forEach(function (b) {
      b.onclick = function () { selectedEmp = ""; payEditDay = ""; render(); };
    });
    document.querySelectorAll("[data-paypdf]").forEach(function (b) {
      b.onclick = function () { openPayPdf(); };
    });
    document.querySelectorAll("[data-saveday]").forEach(function (b) {
      b.onclick = function () { savePayDay(b.getAttribute("data-saveday"), b.getAttribute("data-date")); };
    });
    document.querySelectorAll("[data-addpunch]").forEach(function (b) {
      b.onclick = function () { addMissingPunch(b.getAttribute("data-addpunch")); };
    });

    document.querySelectorAll("[data-splitweek]").forEach(function (b) {
      b.onclick = function () { splitSheet(); };
    });
    document.querySelectorAll("[data-assignsheet]").forEach(function (b) {
      b.onclick = function () { toolsOpen = false; openAssignSheet(); };
    });
    document.querySelectorAll("[data-emailweek]").forEach(function (b) {
      b.onclick = function () { toolsOpen = false; emailMeWeekTasks(); };
    });
    document.querySelectorAll("[data-printweek]").forEach(function (b) {
      b.onclick = function () { toolsOpen = false; openWeekPrint(); };
    });
    document.querySelectorAll("[data-printtasks]").forEach(function (b) {
      b.onclick = function () { toolsOpen = false; openTaskPrintByEmployee(); };
    });
    document.querySelectorAll("[data-printone]").forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        var id = b.getAttribute("data-printone");
        var pool = peopleOnWeek().concat(activePeople());
        var one = pool.filter(function (e) { return e.id === id; })[0];
        if (one) printTaskSheets([one]);
        else flash("No employee to print.");
      };
    });
    document.querySelectorAll("[data-copyweek]").forEach(function (b) {
      b.onclick = function () { toolsOpen = false; applyLastWeek(); };
    });
    document.querySelectorAll("[data-publish]").forEach(function (b) {
      b.onclick = function () { filtersOpen = false; toolsOpen = false; openPublish(); };
    });
    var hbGroup = $("hbGroup");
    if (hbGroup) hbGroup.onchange = function () { groupBy = hbGroup.value || "custom"; render(); };
    document.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.onclick = function (ev) {
        ev.stopPropagation();
        var k = b.getAttribute("data-toggle");
        if (k === "filters") { filtersOpen = !filtersOpen; toolsOpen = false; }
        if (k === "tools") { toolsOpen = !toolsOpen; filtersOpen = false; }
        render();
      };
    });
    var fltE = $("fltEvents");
    if (fltE) fltE.onchange = function () { showEvents = fltE.checked; render(); };
    var fltO = $("fltOpen");
    if (fltO) fltO.onchange = function () { showOpen = fltO.checked; render(); };
    var fltS = $("fltSched");
    if (fltS) fltS.onchange = function () { scheduledOnly = fltS.checked; render(); };
  }

  function boot() {
    if (isMgrSchedulePage() && !isMgrScheduleLive()) return;
    lockMgrArco();
    readHash();
    C = wSS();
    // This page is the manager's schedule/task editor. Only enable writing the
    // shared store (which every employee device reads) for an actual manager —
    // same signals the pay/time-off controls already gate on. A regular employee
    // who lands here stays read-only, exactly as with the rest of this page.
    if (C.enableRosterWrite && isManagerHere()) C.enableRosterWrite("manager", managerActor());
    weekMon = C.weekStartMonday();
    dayYmd = C.todayYMD();
    payStart = C.payPeriodOf(dayYmd).start;
    // Open on the current week, ready to fill, rather than rewinding to the last
    // week that has shifts. A manager's job here is to build the upcoming
    // schedule, so "this week" is what they should land on. The week arrows and
    // "Apply last week to this week" reach any other week.
    var pick = $("stationPick");
    if (pick) pick.addEventListener("change", function () { render(); });
    render();
  }
  function wSS() { return window.SSCore; }

  function start() {
    if (!window.SSCore) return;
    window.SSCore.ready.then(boot);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
