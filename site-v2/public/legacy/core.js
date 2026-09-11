(function () {
  var C = window.SSCore;
  var emp = null;
  var pendingPhoto = {};
  var tab = "clock";
  var clockTick = null;
  var tsKind = "week";
  var tsWeekMon = "";
  var tsMonth = "";
  var remindTimers = [];
  var pollTimer = null;
  var autoEndTimer = null;
  var lastClockSig = "";

  function $(id) { return document.getElementById(id); }
  function sessionId() { return sessionStorage.getItem("ss_core_emp") || ""; }
  function setSession(id) {
    if (id) sessionStorage.setItem("ss_core_emp", id);
    else sessionStorage.removeItem("ss_core_emp");
  }

  // The roster stores names run together ("RachelOberholtzer"); split the camel
  // case so a person reads their own name the way they wrote it.
  function prettyName(name) {
    return String(name || "").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  }
  function initials(name) {
    var parts = prettyName(name).split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    var first = parts[0].charAt(0);
    var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
    return (first + last).toUpperCase();
  }

  // ---- PIN keypad ----------------------------------------------------------
  function pinValue() {
    var el = $("pin");
    return el ? el.value : "";
  }
  function setPin(v) {
    var el = $("pin");
    if (el) el.value = v;
    renderPinDots();
  }
  function renderPinDots() {
    var box = $("pinDots");
    if (!box) return;
    var n = pinValue().length;
    var slots = Math.max(4, n);
    var html = "";
    for (var i = 0; i < slots; i++) {
      html += '<i' + (i < n ? ' class="on"' : "") + "></i>";
    }
    box.innerHTML = html;
  }
  function failPin(msg) {
    var err = $("err");
    if (err) err.textContent = msg || "That PIN was not recognised.";
    var dots = $("pinDots");
    if (dots) {
      dots.classList.remove("shake");
      void dots.offsetWidth;
      dots.classList.add("shake");
    }
    setPin("");
  }
  function pressKey(k) {
    if ($("err")) $("err").textContent = "";
    if (k === "clear") { setPin(""); return; }
    if (k === "back") { setPin(pinValue().slice(0, -1)); return; }
    if (!/^[0-9]$/.test(k)) return;
    if (pinValue().length >= 8) return;
    setPin(pinValue() + k);
    if (pinValue().length === 4) signin();
  }

  // ---- Live clock in the header -------------------------------------------
  function tickClock() {
    var el = $("liveClock");
    if (!el) return;
    var now = new Date();
    var time = now.toLocaleTimeString("en-US", {
      timeZone: C.TZ, hour: "numeric", minute: "2-digit"
    });
    var day = now.toLocaleDateString("en-US", {
      timeZone: C.TZ, weekday: "short", month: "short", day: "numeric"
    });
    el.innerHTML = C.esc(time) + "<small>" + C.esc(day) + "</small>";
  }

  function showLogin() {
    $("loginView").hidden = false;
    $("appView").hidden = true;
  }
  function isMgrEmp() {
    return !!(emp && C.isManagerEmployee && C.isManagerEmployee(emp));
  }
  function applyEmployeeSession(found) {
    setSession(found && found.id);
    if (found && C.isManagerEmployee && C.isManagerEmployee(found)) {
      C.grantManagerSession(found);
    } else if (C.clearManagerSession) {
      C.clearManagerSession();
      if (found && found.id) setSession(found.id);
    }
  }
  function syncMgrTab() {
    var b = $("mgrTab");
    if (b) b.hidden = !isMgrEmp();
    var panel = $("tabManager");
    if (panel && !isMgrEmp()) panel.hidden = true;
  }
  function showApp() {
    $("loginView").hidden = true;
    $("appView").hidden = false;
    $("hello").textContent = "Hi, " + prettyName(emp.name);
    var av = $("avatar");
    if (av) av.textContent = initials(emp.name);
    renderAnnivBanner();
    syncMgrTab();
    if (tab === "manager" && !isMgrEmp()) tab = "clock";
    showTab(tab || "clock");
    notifyToday();
  }

  function showTab(id) {
    tab = id || "clock";
    if (tab === "manager" && !isMgrEmp()) tab = "clock";
    var map = { schedule: "tabSchedule", clock: "tabClock", timesheet: "tabTimesheet", timeoff: "tabTimeoff", info: "tabInfo", manager: "tabManager" };
    Object.keys(map).forEach(function (k) {
      var el = $(map[k]);
      if (el) el.hidden = k !== tab;
    });
    document.querySelectorAll("#empTabs [data-tab]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-tab") === tab);
    });
    if (tab === "schedule") {
      renderWeek();
      renderClock();
      renderTasks();
    } else if (tab === "clock") {
      renderClock();
    } else if (tab === "timesheet") {
      renderTimesheet();
    } else if (tab === "timeoff") {
      renderTimeOff();
    } else if (tab === "manager") {
      /* links in HTML */
    } else {
      renderInfo();
    }
  }

  function trySession() {
    var id = sessionId();
    if (!id) { showLogin(); return; }
    emp = C.employeeById(id);
    if (!emp || emp.status === "terminated") { setSession(""); showLogin(); return; }
    applyEmployeeSession(emp);
    startClockPoll();
    showApp();
  }

  function signin() {
    var pin = pinValue();
    if ($("err")) $("err").textContent = "";
    if (pin.length < 4) { failPin("Enter your four-digit PIN."); return; }
    C.loginEmployeeByPin(pin).then(function (found) {
      if (!found) {
        failPin("That PIN was not recognised.");
        return;
      }
      setPin("");
      emp = found;
      applyEmployeeSession(found);
      tab = "clock";
      startClockPoll();
      showApp();
    }).catch(function () {
      failPin("That PIN was not recognised.");
    });
  }

  function renderWeek() {
    var mon = C.weekStartMonday();
    var dates = C.weekDates(mon);
    var today = C.todayYMD();
    var html = "";
    dates.forEach(function (d, i) {
      var on = d === today;
      var off = C.isTimeOff(emp.id, emp.stationId, d);
      var sh = C.shiftsFor(emp.stationId, d, emp.id)[0];
      var label = off ? "Off" : (sh ? C.fmtTime(sh.start) + " – " + C.fmtTime(sh.end) : "Not scheduled");
      var dayTasks = C.assignments(emp.stationId, emp.id, d);
      html += '<div class="day' + (on ? " on" : "") + (sh && sh.leader ? " lead" : "") + '"><div class="day-top"><div><b>' + C.DAYS[i] + "</b> " +
        '<span class="mut">' + C.esc(C.formatYMD(d)) + '</span></div><div>' + C.esc(label) +
        (sh && sh.leader && !off ? ' <span class="leader-sign">★ Leader</span>' : "") + "</div></div>";
      if (dayTasks.length) {
        html += C.taskBarHtml(C.taskProgress(emp.stationId, emp.id, d), { size: on ? "lg" : "" });
        html += '<ul class="day-tasks">';
        dayTasks.forEach(function (a) {
          var done = C.isDoneToday(a.id, d);
          html += "<li>" + C.esc(a.title) +
            (a.requiresPhoto ? ' <span class="chip">Photo</span>' : "") +
            (done ? ' <span class="done">Done</span>' : "") + "</li>";
        });
        html += "</ul>";
      }
      html += "</div>";
    });
    $("weekBox").innerHTML = html;
  }

  function locName() {
    return C.locationLabel(emp.stationId) || C.FIRST_LOCATION;
  }
  function clockSig() {
    var st = C.breakState(emp);
    var due = C.reminderDue(emp);
    return [st.clockedIn, st.inAt, st.outAt, st.openBreak,
      st.break10a.startAt, st.break10a.endAt,
      st.meal30.startAt, st.meal30.endAt,
      st.break10b.startAt, st.break10b.endAt,
      due && due.kind, due && due.skipped].join("|");
  }
  function nagKey(kind) {
    return "ss_core_break_nag_" + emp.id + "_" + C.todayYMD() + "_" + kind;
  }
  function alreadyNagged(kind) {
    try { return sessionStorage.getItem(nagKey(kind)) === "1"; } catch (e) { return false; }
  }
  function markNagged(kind) {
    try { sessionStorage.setItem(nagKey(kind), "1"); } catch (e) {}
  }
  function fireBreakNotice(kind) {
    if (!emp || alreadyNagged(kind)) return;
    var due = C.reminderDue(emp);
    if (!due || due.kind !== kind || due.skipped) return;
    markNagged(kind);
    var body = due.label + " · " + locName();
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "remind", title: "Smart Time Clock", body: body });
    } else {
      try { new Notification("Smart Time Clock", { body: body, icon: "../assets/icon-192.png" }); } catch (e) {}
    }
  }
  function clearRemindTimers() {
    remindTimers.forEach(function (id) { clearTimeout(id); });
    remindTimers = [];
    if (autoEndTimer) { clearTimeout(autoEndTimer); autoEndTimer = null; }
  }
  function scheduleBreakReminders() {
    clearRemindTimers();
    if (!emp) return;
    var times = C.reminderTimes(emp.id);
    var now = Date.now();
    C.BREAK_KINDS.forEach(function (k) {
      var t = times[k];
      if (!t) return;
      if (t <= now) {
        fireBreakNotice(k);
        return;
      }
      remindTimers.push(setTimeout(function () {
        fireBreakNotice(k);
        renderClock();
      }, t - now));
    });
    var st = C.breakState(emp);
    if (st.openBreak && st.openBreak !== "meal30") {
      var startMs = st[st.openBreak].startAt ? new Date(st[st.openBreak].startAt).getTime() : 0;
      var left = startMs ? (startMs + 10 * 60 * 1000) - now : 0;
      if (left < 0) left = 0;
      autoEndTimer = setTimeout(function () {
        C.endBreak(emp.id, emp.stationId, st.openBreak);
        renderClock();
        scheduleBreakReminders();
      }, left + 250);
    }
  }
  function startClockPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (!emp) return;
      if (C.autoCloseOverdueClocks) C.autoCloseOverdueClocks();
      var due = C.reminderDue(emp);
      if (due && !due.skipped) fireBreakNotice(due.kind);
      if (clockSig() !== lastClockSig) renderClock();
    }, 15000);
  }
  function signOut() {
    emp = null;
    if (typeof renderAnnivBanner === "function") renderAnnivBanner();
    if (C.clearManagerSession) C.clearManagerSession();
    setSession("");
    setPin("");
    tab = "clock";
    syncMgrTab();
    tsKind = "week";
    tsWeekMon = "";
    tsMonth = "";
    clearRemindTimers();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    showLogin();
  }
  function doPunch(action) {
    var needGeo = action === "in" || action === "out" || action.indexOf("start-") === 0;
    var run = needGeo ? C.requestGeo() : Promise.resolve({ geo: false });
    return run.then(function (geo) {
      geo = geo || { geo: false };
      if (action === "in") geo.requireFence = true;
      return C.applyPunch(emp.id, emp.stationId, action, geo);
    }).then(function (res) {
      if (res && !res.ok && res.message) alert(res.message);
      renderClock();
      scheduleBreakReminders();
      return res;
    });
  }
  function clockPanelHtml() {
    var loc = locName();
    var st = C.breakState(emp);
    var due = C.reminderDue(emp);
    var html = "<h2>" + C.esc(loc) + "</h2>";
    if (due && due.kind === "clockout") {
      html += '<div class="remind-card">';
      html += "<b>Clock out — your shift ended</b>";
      if (due.dueAt) html += '<p class="mut">Scheduled end ' + C.esc(C.formatLATime(due.dueAt)) + ". We clock you out at that time if you do not.</p>";
      html += '<div class="rowbtns">';
      html += '<button type="button" class="cyan" data-punch="out">Clock out now</button>';
      html += "</div></div>";
    } else if (due && !due.skipped) {
      html += '<div class="remind-card">';
      html += "<b>Time for your " + C.esc(due.label) + "</b>";
      if (due.dueAt) html += '<p class="mut">Due from ' + C.esc(C.formatLATime(due.dueAt)) + "</p>";
      html += '<div class="rowbtns">';
      html += '<button type="button" class="cyan" data-punch="start-' + due.kind + '">Start</button>';
      html += '<button type="button" class="ghost" data-skip="' + due.kind + '">Skip — I\'ll take it</button>';
      html += "</div></div>";
    }
    if (C.autoCloseOverdueClocks) C.autoCloseOverdueClocks();
    var gate = C.canClockIn ? C.canClockIn(emp.id, emp.stationId) : { ok: true };
    var pending = C.pendingClockPermit ? C.pendingClockPermit(emp.id, C.todayYMD(), emp.stationId) : null;
    if (st.clockedIn) {
      html += '<p class="mut">In since ' + C.esc(C.formatLA(st.inAt)) +
        " · " + C.workedHours(emp.id, st.date, emp.stationId) + "h worked (unpaid meal deducted)</p>";
    } else if (st.inAt) {
      html += '<p class="mut">Clocked out · ' + C.workedHours(emp.id, st.date, emp.stationId) + "h worked</p>";
    } else {
      html += '<p class="mut">Clock in only at the store, within 20 feet. Location must be on.</p>';
    }
    if (st.openBreak) {
      html += '<p class="onbreak">On ' + C.esc(C.BREAK_SHORT[st.openBreak]);
      if (st.openBreak !== "meal30" && st[st.openBreak].startAt) {
        var remain = Math.max(0, 10 * 60 - Math.round((Date.now() - new Date(st[st.openBreak].startAt).getTime()) / 1000));
        html += " · auto-end in " + Math.floor(remain / 60) + ":" + String(remain % 60).padStart(2, "0");
      }
      html += "</p>";
    }
    html += '<div class="rowbtns">';
    html += '<button type="button" data-punch="in"' + (st.clockedIn || !gate.ok ? " disabled" : "") + ">Clock in</button>";
    html += '<button type="button" class="cyan" data-punch="out"' + (st.clockedIn ? "" : " disabled") + ">Clock out</button>";
    html += "</div>";
    if (!st.clockedIn && !gate.ok) {
      html += '<p class="mut">' + C.esc(gate.message || "Not scheduled today.") + "</p>";
      if (pending) html += '<p class="mut">Waiting for Rachel to approve your clock-in.</p>';
      else html += '<div class="rowbtns"><button type="button" class="cyan" data-askclock="1">Ask Rachel to clock in</button></div>';
    }
    function pair(kind, title) {
      var block = '<div class="brk-block"><div class="brk-k">' + title + "</div><div class=\"rowbtns\">";
      block += '<button type="button" data-punch="start-' + kind + '"' +
        (st.canStart[kind] ? "" : " disabled") + ">Start</button>";
      block += '<button type="button" class="cyan" data-punch="end-' + kind + '"' +
        (st.canEnd[kind] ? "" : " disabled") + ">End</button>";
      var seg = st[kind];
      if (seg.startAt) {
        block += '</div><div class="mut">' + C.esc(C.formatLA(seg.startAt)) +
          (seg.endAt ? " – " + C.esc(C.formatLA(seg.endAt)) : " · open") + "</div>";
      } else {
        block += "</div>";
      }
      return block + "</div>";
    }
    html += pair("break10a", "First 10 minutes · paid");
    html += pair("meal30", "30-minute meal · unpaid");
    html += pair("break10b", "Last 10 minutes · paid");
    var lines = C.punchLines(emp.id, C.todayYMD(), emp.stationId);
    html += '<div class="punch-log">';
    if (!lines.length) html += '<p class="mut">No punches yet today.</p>';
    lines.forEach(function (ln) {
      html += '<div class="mut">' + C.esc(ln.label) + " · " + C.esc(ln.text);
      if (ln.kind === "shift") html += " · " + ln.hours + "h span";
      if (ln.locationName) html += " · " + C.esc(ln.locationName);
      html += "</div>";
    });
    html += "</div>";
    if (C.cheatSheetTasksHtml) {
      html += '<div class="cs-clock">' + C.cheatSheetTasksHtml(emp.stationId, emp.id, C.todayYMD(), {
        size: "lg",
        photoLabel: "Photo required"
      }) + "</div>";
    }
    return html;
  }
  function bindClock(el) {
    if (!el) return;
    el.querySelectorAll("[data-punch]").forEach(function (b) {
      b.onclick = function () {
        if (b.disabled) return;
        doPunch(b.getAttribute("data-punch"));
      };
    });
    el.querySelectorAll("[data-skip]").forEach(function (b) {
      b.onclick = function () {
        C.skipReminder(emp.id, b.getAttribute("data-skip"));
        renderClock();
      };
    });
    el.querySelectorAll("[data-askclock]").forEach(function (b) {
      b.onclick = function () {
        var res = C.requestClockPermit(emp.id, emp.stationId, C.todayYMD(), "Not scheduled");
        alert(res && res.ok ? "Asked Rachel. Clock in after she approves." : ((res && res.error) || "Could not send the request."));
        renderClock();
      };
    });
    bindTaskUi(el);
  }
  function renderClock() {
    if (!emp) return;
    lastClockSig = clockSig();
    var html = clockPanelHtml();
    var clockedIn = !!C.breakState(emp).clockedIn;
    ["clockBox", "clockTabBox"].forEach(function (id) {
      var el = $(id);
      if (el) {
        el.innerHTML = html;
        el.classList.toggle("is-in", clockedIn);
        bindClock(el);
      }
    });
    scheduleBreakReminders();
  }

  function bindTaskUi(box) {
    if (!box) return;
    box.querySelectorAll("[data-file]").forEach(function (inp) {
      inp.onchange = function () {
        var file = inp.files && inp.files[0];
        if (!file) return;
        var id = inp.getAttribute("data-file");
        C.compressImage(file, 1280).then(function (blob) {
          pendingPhoto[id] = blob;
          var url = URL.createObjectURL(blob);
          var pv = box.querySelector('[data-pv="' + id + '"]');
          if (pv) pv.innerHTML = '<img class="thumb" alt="Attached" src="' + url + '">';
        }).catch(function () {
          pendingPhoto[id] = file;
        });
      };
    });
    box.querySelectorAll("[data-done]").forEach(function (b) {
      b.onclick = function () { finish(b.getAttribute("data-done")); };
    });
    box.querySelectorAll("[data-photo]").forEach(function (img) {
      C.getPhoto(img.getAttribute("data-photo")).then(function (blob) {
        if (blob) img.src = URL.createObjectURL(blob);
      }).catch(function () {});
    });
  }
  function renderTasks() {
    var today = C.todayYMD();
    var box = $("taskBox");
    if (!box || !emp) return;
    var card = box.closest ? box.closest(".card") : null;
    if (card) card.classList.add("task-card");
    var html = C.cheatSheetTasksHtml
      ? C.cheatSheetTasksHtml(emp.stationId, emp.id, today, { size: "lg", photoLabel: "Photo required" })
      : '<p class="mut">No cheat-sheet tasks for this shift.</p>';
    box.innerHTML = html;
    bindTaskUi(box);
  }

  function finish(assignmentId) {
    var a = null;
    C.assignments(emp.stationId, emp.id).forEach(function (x) { if (x.id === assignmentId) a = x; });
    if (!a) return;
    var photos = [];
    var run = Promise.resolve();
    if (a.requiresPhoto) {
      var blob = pendingPhoto[assignmentId];
      if (!blob) {
        alert("Attach a photo before marking this done.");
        return;
      }
      var pid = C.uid("p");
      run = C.savePhoto(pid, blob).then(function () { photos = [pid]; });
    }
    run.then(function () {
      return C.markDone(assignmentId, emp.id, emp.stationId, photos);
    }).then(function () {
      delete pendingPhoto[assignmentId];
      renderTasks();
      renderWeek();
      renderClock();
    }).catch(function (err) {
      alert((err && err.message) || "Could not mark done.");
    });
  }

  function fmtYMDYear(ymd) {
    if (!ymd) return "";
    var p = String(ymd).split("-");
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    return dt.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  }
  function historyFloor() {
    return C.timesheetStartYmd(emp);
  }
  function historyNote() {
    var start = historyFloor();
    var hired = C.hiredYmd(emp);
    if (hired && start === hired) return "History since you started " + fmtYMDYear(hired) + ".";
    return "History from " + fmtYMDYear(start) + ".";
  }
  function renderAnnivBanner() {
    var box = $("annivBanner");
    if (!box) return;
    if (emp && C.isAnniversaryToday(emp)) {
      box.hidden = false;
      box.textContent = "Happy " + C.ordinal(C.anniversaryYear(emp)) + " anniversary";
    } else {
      box.hidden = true;
      box.textContent = "";
    }
  }
  function ensureTsAnchors() {
    var today = C.todayYMD();
    var floor = historyFloor();
    var thisMon = C.weekStartMonday(today);
    var floorMon = C.weekStartMonday(floor);
    var thisMo = C.monthStart(today);
    var floorMo = C.monthStart(floor);
    if (!tsWeekMon) tsWeekMon = thisMon;
    if (!tsMonth) tsMonth = thisMo;
    if (tsWeekMon > thisMon) tsWeekMon = thisMon;
    if (tsWeekMon < floorMon) tsWeekMon = floorMon;
    if (tsMonth > thisMo) tsMonth = thisMo;
    if (tsMonth < floorMo) tsMonth = floorMo;
  }
  function tsDates() {
    var floor = historyFloor();
    var today = C.todayYMD();
    var dates = tsKind === "month"
      ? C.datesInRange(C.monthStart(tsMonth), C.monthEnd(tsMonth))
      : C.weekDates(tsWeekMon);
    return dates.filter(function (d) { return d >= floor && d <= today; });
  }
  function fillTsJumps() {
    var floor = historyFloor();
    var today = C.todayYMD();
    var wsel = $("tsWeekJump");
    if (wsel && wsel.getAttribute("data-floor") !== floor) {
      wsel.innerHTML = "";
      var mon = C.weekStartMonday(floor);
      var last = C.weekStartMonday(today);
      for (var m = mon; m <= last; m = C.addDays(m, 7)) {
        var wd = C.weekDates(m);
        var opt = document.createElement("option");
        opt.value = m;
        opt.textContent = fmtYMDYear(wd[0]) + " – " + fmtYMDYear(wd[6]);
        wsel.appendChild(opt);
      }
      wsel.setAttribute("data-floor", floor);
    }
    if (wsel) wsel.value = tsWeekMon;
    var msel = $("tsMonthJump");
    if (msel && msel.getAttribute("data-floor") !== floor) {
      msel.innerHTML = "";
      var mo = C.monthStart(floor);
      var lastMo = C.monthStart(today);
      for (var x = mo; x <= lastMo; x = C.monthStart(C.addMonths(x, 1))) {
        var o = document.createElement("option");
        o.value = x;
        o.textContent = C.formatMonth(x);
        msel.appendChild(o);
      }
      msel.setAttribute("data-floor", floor);
    }
    if (msel) msel.value = tsMonth;
    var thisMon = C.weekStartMonday(today);
    var floorMon = C.weekStartMonday(floor);
    var thisMo = C.monthStart(today);
    var floorMo = C.monthStart(floor);
    var pw = $("tsPrevWeek"), nw = $("tsNextWeek");
    var pm = $("tsPrevMonth"), nm = $("tsNextMonth");
    if (pw) pw.disabled = tsWeekMon <= floorMon;
    if (nw) nw.disabled = tsWeekMon >= thisMon;
    if (pm) pm.disabled = tsMonth <= floorMo;
    if (nm) nm.disabled = tsMonth >= thisMo;
    var tw = $("tsThisWeek"), tp = $("tsThisPay");
    if (tw) tw.classList.toggle("on", tsKind === "week" && tsWeekMon === thisMon);
    if (tp) tp.classList.toggle("on", tsKind === "pay" && tsWeekMon === thisMon);
    var wr = $("tsWeekRow"), mr = $("tsMonthRow");
    if (wr) wr.classList.toggle("on", tsKind !== "month");
    if (mr) mr.classList.toggle("on", tsKind === "month");
  }
  function groupByDate(rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.date) return;
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });
    return map;
  }
  function assignmentTitle(id) {
    var list = (C.getState() && C.getState().assignments) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].title || "";
    return "";
  }
  function stepTsWeek(delta) {
    ensureTsAnchors();
    tsKind = "week";
    tsWeekMon = C.addDays(tsWeekMon, delta);
    renderTimesheet();
  }
  function stepTsMonth(delta) {
    ensureTsAnchors();
    tsKind = "month";
    tsMonth = C.monthStart(C.addMonths(tsMonth, delta));
    renderTimesheet();
  }
  function renderTimesheet() {
    ensureTsAnchors();
    fillTsJumps();
    var dates = tsDates();
    var today = C.todayYMD();
    var floor = historyFloor();
    var clocksMap = groupByDate(C.clocksForRange(emp.id, emp.stationId, floor, today));
    var compsMap = groupByDate(C.completionsFor({
      employeeId: emp.id,
      stationId: emp.stationId,
      start: floor,
      end: today
    }));
    var heading;
    var span = dates.length ? fmtYMDYear(dates[0]) + " – " + fmtYMDYear(dates[dates.length - 1]) : historyNote();
    if (tsKind === "month") {
      heading = C.formatMonth(tsMonth) + ". Read-only. " + historyNote();
    } else if (tsKind === "pay") {
      heading = "This pay period · " + span + ". Read-only.";
    } else {
      var thisMon = C.weekStartMonday(today);
      heading = (tsWeekMon === thisMon ? "This week" : "Week") + " · " + span + ". Read-only.";
    }
    var html = '<p class="mut">' + C.esc(heading) + "</p>";
    var weekSched = 0, weekClock = 0;
    dates.forEach(function (d) {
      var i = C.weekdayIndex(d);
      var off = C.isTimeOff(emp.id, emp.stationId, d);
      var sh = C.shiftsFor(emp.stationId, d, emp.id)[0];
      var clocks = clocksMap[d] || [];
      var comps = compsMap[d] || [];
      var schedH = off ? 0 : (sh ? C.hoursBetween(sh.start, sh.end) : 0);
      var clockH = C.workedHours(emp.id, d, emp.stationId);
      weekSched += schedH;
      weekClock += clockH;
      html += '<div class="ts-day' + (d === today ? " on" : "") + '">';
      html += '<div class="day-top"><b>' + C.DAYS[i] + "</b> <span class=\"mut\">" +
        C.esc(C.formatYMD(d)) + "</span>";
      if (clockH) html += '<span class="mut">' + (Math.round(clockH * 100) / 100) + "h worked</span>";
      html += "</div>";
      if (off) html += '<div class="mut">Time off</div>';
      else if (sh) html += '<div class="mut">Shift ' + C.esc(C.fmtTime(sh.start) + " – " + C.fmtTime(sh.end)) +
        " · " + schedH + "h scheduled" + (sh.leader ? ' · <span class="leader-sign">★ Leader</span>' : "") + "</div>";
      else html += '<div class="mut">Not scheduled</div>';
      var lines = C.punchLines(emp.id, d, emp.stationId);
      if (lines.length) {
        lines.forEach(function (ln) {
          html += '<div class="mut">' + C.esc(ln.label) + " · " + C.esc(ln.text);
          if (ln.kind === "meal30" && ln.hours) html += " · −" + ln.hours + "h";
          html += "</div>";
        });
        if (clockH) html += '<div class="mut">Worked ' + clockH + "h after unpaid meal</div>";
      } else {
        html += '<div class="mut">No punches</div>';
      }
      if (comps.length) {
        comps.forEach(function (c) {
          var title = assignmentTitle(c.assignmentId);
          html += '<div class="mut">Done' + (title ? " " + C.esc(title) : "") +
            " · " + C.esc(C.formatLA(c.doneAt)) + "</div>";
        });
      }
      html += "</div>";
    });
    var scope = tsKind === "month" ? ("in " + C.formatMonth(tsMonth)) : "(Mon–Sun)";
    html += '<p class="ts-total">' + (Math.round(weekSched * 100) / 100) + "h scheduled · " +
      (Math.round(weekClock * 100) / 100) + "h clocked " + C.esc(scope) + ".</p>";
    $("tsBox").innerHTML = html;
  }

  function reqRange(r) {
    if (!r || !r.start) return "";
    if (!r.end || r.end === r.start) return C.formatYMD(r.start);
    return C.formatYMD(r.start) + " – " + C.formatYMD(r.end);
  }
  function reqStatusLabel(st) {
    if (st === "approved") return "Approved";
    if (st === "denied") return "Denied";
    return "Pending";
  }
  function renderTimeOff() {
    if (!emp) return;
    var err = $("toErr");
    if (err && !err.getAttribute("data-keep")) err.textContent = "";
    if (err) err.removeAttribute("data-keep");
    var list = (C.listRequests({ employeeId: emp.id }) || []).slice().sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    var box = $("toList");
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<p class="mut">No requests yet.</p>';
      return;
    }
    var html = "";
    list.forEach(function (r) {
      var st = r.status || "pending";
      var chip = st === "approved" ? "ok" : (st === "denied" ? "bad" : "wait");
      html += '<div class="to-row"><div><b>' + C.esc(reqRange(r)) + "</b>";
      html += '<div class="mut">' + (r.reason ? C.esc(r.reason) : "No reason") + "</div>";
      if (r.decidedAt && st !== "pending") {
        html += '<div class="mut">' + C.esc(reqStatusLabel(st)) + " · " + C.esc(C.formatLA(r.decidedAt)) + "</div>";
      }
      html += '</div><span class="chip ' + chip + '">' + C.esc(reqStatusLabel(st)) + "</span></div>";
    });
    box.innerHTML = html;
  }
  function submitTimeOff(ev) {
    if (ev) ev.preventDefault();
    var err = $("toErr");
    if (err) { err.textContent = ""; err.classList.remove("okmsg"); }
    if (!emp || emp.status === "terminated") {
      if (err) err.textContent = "Terminated employees cannot request time off.";
      return;
    }
    var start = $("toStart") && $("toStart").value;
    var end = $("toEnd") && $("toEnd").value;
    var reason = $("toReason") && $("toReason").value;
    var res = C.requestTimeOff(emp.id, emp.stationId, start, end, reason);
    if (!res || !res.ok) {
      if (err) err.textContent = (res && res.error) || "Could not submit request.";
      return;
    }
    if ($("toStart")) $("toStart").value = "";
    if ($("toEnd")) $("toEnd").value = "";
    if ($("toReason")) $("toReason").value = "";
    if (err) {
      err.textContent = "Request sent. Waiting for your manager.";
      err.setAttribute("data-keep", "1");
      err.classList.add("okmsg");
    }
    renderTimeOff();
  }

  function infoRow(label, value) {
    return '<div class="info-row"><div class="k">' + C.esc(label) + '</div><div class="v">' +
      C.esc(value || "—") + "</div></div>";
  }

  function renderInfo() {
    var role = C.roleName(emp.roleId);
    var loc = C.locationLabel(emp.stationId) || C.FIRST_LOCATION;
    var html = "";
    if (C.isAnniversaryToday(emp)) {
      html += '<div class="anniv-banner">Happy ' + C.esc(C.ordinal(C.anniversaryYear(emp))) + " anniversary</div>";
    }
    var hired = "—";
    if (C.hiredYmd(emp)) {
      hired = "Hired " + fmtYMDYear(emp.hiredOn) + ". Here " + C.formatTenure(emp) + ".";
    }
    html +=
      infoRow("Name", emp.name) +
      infoRow("Role", role) +
      infoRow("Location", loc) +
      infoRow("Date hired", hired) +
      infoRow("Address", emp.address) +
      infoRow("Phone", emp.phone) +
      infoRow("Email", emp.email);
    if (!C.isAnniversaryToday(emp)) {
      var soon = C.anniversarySoon(emp);
      if (soon) {
        html += '<p class="anniv-soon">Anniversary on ' + C.esc(C.formatYMD(soon.ymd)) +
          " — " + C.esc(C.ordinal(soon.year)) + " year</p>";
      }
    }
    $("infoBox").innerHTML = html;
  }

  function notifyToday() {
    if (!("Notification" in window)) return;
    var asg = C.assignmentsForDay(emp.stationId, emp.id, C.todayYMD());
    var left = asg.filter(function (a) { return !C.isDoneToday(a.id); }).length;
    function ping() {
      if (!left) return;
      var body = left + " unfinished task" + (left === 1 ? "" : "s") + " today.";
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "remind", title: "Smart Time Clock", body: body });
      } else if (Notification.permission === "granted") {
        try { new Notification("Smart Time Clock", { body: body, icon: "../assets/icon-192.png" }); } catch (e) {}
      }
    }
    if (Notification.permission === "granted") ping();
    else if (Notification.permission === "default") {
      Notification.requestPermission().then(function (p) { if (p === "granted") ping(); }).catch(function () {});
    }
  }

  function registerSW() {
    // Register this app's own worker, scoped to its folder (never the console
    // at the site root). It relays the break/meal/clock-out reminders so they
    // still show when the app is in the background, and caches the shell.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function () {});
    }
    window.addEventListener("focus", function () {
      if (emp) {
        notifyToday();
        renderClock();
        scheduleBreakReminders();
      }
    });
  }

  function boot() {
    registerSW();
    $("go").onclick = signin;
    renderPinDots();
    var keypad = $("keypad");
    if (keypad) {
      keypad.querySelectorAll("[data-key]").forEach(function (b) {
        b.onclick = function () { pressKey(b.getAttribute("data-key")); };
      });
    }
    // Physical keyboard support for kiosks with a real number pad.
    document.addEventListener("keydown", function (ev) {
      if ($("loginView").hidden) return;
      if (/^[0-9]$/.test(ev.key)) { pressKey(ev.key); ev.preventDefault(); }
      else if (ev.key === "Backspace") { pressKey("back"); ev.preventDefault(); }
      else if (ev.key === "Enter") { signin(); ev.preventDefault(); }
    });
    $("out").onclick = signOut;
    tickClock();
    if (!clockTick) clockTick = setInterval(tickClock, 15000);
    document.querySelectorAll("#empTabs [data-tab]").forEach(function (b) {
      b.onclick = function () { showTab(b.getAttribute("data-tab")); };
    });
    var toForm = $("toForm");
    if (toForm) toForm.onsubmit = submitTimeOff;
    var tw = $("tsThisWeek"), tp = $("tsThisPay");
    if (tw) tw.onclick = function () {
      tsKind = "week";
      tsWeekMon = C.weekStartMonday();
      renderTimesheet();
    };
    if (tp) tp.onclick = function () {
      tsKind = "pay";
      tsWeekMon = C.weekStartMonday();
      renderTimesheet();
    };
    var pw = $("tsPrevWeek"), nw = $("tsNextWeek");
    if (pw) pw.onclick = function () { stepTsWeek(-7); };
    if (nw) nw.onclick = function () { stepTsWeek(7); };
    var pm = $("tsPrevMonth"), nm = $("tsNextMonth");
    if (pm) pm.onclick = function () { stepTsMonth(-1); };
    if (nm) nm.onclick = function () { stepTsMonth(1); };
    var wj = $("tsWeekJump"), mj = $("tsMonthJump");
    if (wj) wj.onchange = function () {
      tsKind = "week";
      tsWeekMon = wj.value;
      renderTimesheet();
    };
    if (mj) mj.onchange = function () {
      tsKind = "month";
      tsMonth = mj.value;
      renderTimesheet();
    };
    trySession();
  }

  if (!C) return;
  C.ready.then(boot);
})();
