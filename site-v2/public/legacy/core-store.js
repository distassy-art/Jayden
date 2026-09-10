/* Shared Core data layer for Schedule + employee app.
   Persists to localStorage ss_core_v1, merged over /data/core.json.
   Photos live in IndexedDB. Identity hash is SHA-256 of normalized
   name + newline + the date field; the date field is never written.
   Name, address, and hiredOn (YYYY-MM-DD) may be stored. Roster import
   (Homebase / OneDrive Schedule Excel) hashes DOB immediately. */
(function (w) {
  var LS_KEY = "ss_core_v1";
  var IDB_NAME = "ss_core_photos_v1";
  var IDB_STORE = "photos";
  var PHOTO_CAP = 40;
  var TZ = "America/Los_Angeles";
  var FIRST_LOCATION = "ARCO AM/PM OF DIAMOND";
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  var state = null;
  var readyResolve;
  var ready = new Promise(function (res) { readyResolve = res; });

  function hex(buf) {
    return Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("");
  }

  var DIAMOND_IDS = { diamond: 1, "42352": 1 };
  var CLOCK_RADIUS_FEET = 20;
  var STATION_GEO = {
    diamond: { lat: 33.9675725, lng: -117.8481447, address: "3302 S Diamond Bar Blvd, Diamond Bar, CA 91765" },
    "42352": { lat: 33.9675725, lng: -117.8481447, address: "3302 S Diamond Bar Blvd, Diamond Bar, CA 91765" }
  };
  function sameStation(a, b) {
    a = String(a || "");
    b = String(b || "");
    if (a === b) return true;
    return !!(DIAMOND_IDS[a] && DIAMOND_IDS[b]);
  }
  function isManagerEmployee(e) {
    if (!e) return false;
    if (String(e.role || "") === "Manager") return true;
    if (String(e.name || "") === "RachelOberholtzer") return true;
    return false;
  }
  function grantManagerSession(e) {
    if (!isManagerEmployee(e)) return false;
    try {
      sessionStorage.removeItem("ss_ok");
      sessionStorage.setItem("ss_mgr", "1");
      sessionStorage.setItem("ss_role", "manager");
      sessionStorage.setItem("ss_email", "racheloberholtzer");
      sessionStorage.setItem("ss_station", "42352");
      if (e && e.id) sessionStorage.setItem("ss_core_emp", String(e.id));
    } catch (err) {}
    return true;
  }
  function clearManagerSession() {
    try {
      sessionStorage.removeItem("ss_mgr");
      sessionStorage.removeItem("ss_role");
      sessionStorage.removeItem("ss_email");
      sessionStorage.removeItem("ss_station");
    } catch (err) {}
  }
  function squeezeName(name) {
    return String(name || "").replace(/\s+/g, "");
  }
  function normName(name) {
    return squeezeName(name).toLowerCase();
  }
  function normDateField(dateField) {
    var s = String(dateField || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      var mm = m[1].length === 1 ? "0" + m[1] : m[1];
      var dd = m[2].length === 1 ? "0" + m[2] : m[2];
      return m[3] + "-" + mm + "-" + dd;
    }
    return s;
  }
  function hashIdentity(name, dateField) {
    var s = normName(name) + "\n" + normDateField(dateField);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(hex);
  }
  function firstNameOf(name) {
    var s = String(name || "").replace(/\s+/g, "");
    var m = s.match(/^([A-Za-z][a-z]+)/);
    return m ? m[1].toLowerCase() : normName(s);
  }
  function normPass(pass) {
    return String(pass || "").replace(/\s+/g, "");
  }
  function hashClockPass(firstName, pass) {
    var s = firstNameOf(firstName) + "\n" + normPass(pass);
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(hex);
  }
  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function asDate(d) {
    if (d == null || d === "") return new Date();
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      var p = d.split("-");
      return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 20, 0, 0));
    }
    return d instanceof Date ? d : new Date(d);
  }
  function laParts(d) {
    d = asDate(d);
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit",
      hour12: false
    });
    var parts = { year: "0", month: "01", day: "01", weekday: "Mon", hour: "00", minute: "00" };
    fmt.formatToParts(d).forEach(function (p) {
      if (p.type !== "literal") parts[p.type] = p.value;
    });
    return parts;
  }
  function todayYMD(d) {
    var p = laParts(d);
    return p.year + "-" + p.month + "-" + p.day;
  }
  function weekdayIndex(d) {
    var p = laParts(d);
    var map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    return map[p.weekday] != null ? map[p.weekday] : 0;
  }
  function weekStartMonday(d) {
    var ymd = todayYMD(d);
    var idx = weekdayIndex(d);
    return addDays(ymd, -idx);
  }
  function addDays(ymd, n) {
    var p = String(ymd).split("-");
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
    var y = dt.getUTCFullYear();
    var m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    var day = String(dt.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function weekDates(monday) {
    var out = [];
    for (var i = 0; i < 7; i++) out.push(addDays(monday, i));
    return out;
  }
  function addMonths(ymd, n) {
    var p = String(ymd || todayYMD()).split("-");
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1 + Number(n || 0), 1));
    var last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    var day = Math.min(Number(p[2]) || 1, last);
    dt.setUTCDate(day);
    var y = dt.getUTCFullYear();
    var m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    var d = String(dt.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function addYears(ymd, n) {
    var p = String(ymd || todayYMD()).split("-");
    var y = Number(p[0]) + Number(n || 0);
    var m = Number(p[1]);
    var d = Number(p[2]);
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > last) d = last;
    return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  }
  function hiredYmd(emp) {
    if (!emp) return "";
    var h = String(emp.hiredOn || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(h) ? h : "";
  }
  function anniversaryMd(hiredOn, year) {
    var p = String(hiredOn || "").split("-");
    if (p.length < 3) return { month: 0, day: 0, ymd: "" };
    var m = Number(p[1]);
    var d = Number(p[2]);
    var last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    if (d > last) d = last;
    return {
      month: m,
      day: d,
      ymd: year + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0")
    };
  }
  function tenureYears(emp, asOf) {
    var hired = hiredYmd(emp);
    if (!hired) return 0;
    asOf = asOf || todayYMD();
    if (asOf < hired) return 0;
    var years = Number(asOf.slice(0, 4)) - Number(hired.slice(0, 4));
    var observed = anniversaryMd(hired, Number(asOf.slice(0, 4))).ymd;
    if (asOf < observed) years -= 1;
    return years < 0 ? 0 : years;
  }
  function tenureParts(emp, asOf) {
    var hired = hiredYmd(emp);
    if (!hired) return null;
    asOf = asOf || todayYMD();
    if (asOf < hired) return { years: 0, months: 0 };
    var a = hired.split("-").map(Number);
    var b = asOf.split("-").map(Number);
    var years = b[0] - a[0];
    var months = b[1] - a[1];
    var dayA = a[2];
    var lastB = new Date(Date.UTC(b[0], b[1], 0)).getUTCDate();
    if (dayA > lastB) dayA = lastB;
    if (b[2] < dayA) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years < 0) return { years: 0, months: 0 };
    return { years: years, months: months };
  }
  function formatTenure(emp, asOf) {
    var p = tenureParts(emp, asOf);
    if (!p) return "";
    var bits = [];
    if (p.years) bits.push(p.years + (p.years === 1 ? " year" : " years"));
    if (p.months) bits.push(p.months + (p.months === 1 ? " month" : " months"));
    if (!bits.length) return "less than a month";
    return bits.join(" ");
  }
  function anniversaryYear(emp, asOf) {
    return tenureYears(emp, asOf);
  }
  function isAnniversaryOn(emp, ymd) {
    var hired = hiredYmd(emp);
    if (!hired) return false;
    ymd = ymd || todayYMD();
    if (ymd <= hired) return false;
    var md = anniversaryMd(hired, Number(ymd.slice(0, 4)));
    return ymd.slice(5) === md.ymd.slice(5);
  }
  function isAnniversaryToday(emp) {
    return isAnniversaryOn(emp, todayYMD());
  }
  function timesheetStartYmd(emp) {
    var today = todayYMD();
    var twoYears = addYears(today, -2);
    var hired = hiredYmd(emp);
    var start = (hired && tenureYears(emp, today) < 2) ? hired : twoYears;
    if (hired && start < hired) start = hired;
    return start;
  }
  function nextAnniversaryYmd(emp, asOf) {
    var hired = hiredYmd(emp);
    if (!hired) return "";
    asOf = asOf || todayYMD();
    var y = Number(asOf.slice(0, 4));
    var thisYear = anniversaryMd(hired, y).ymd;
    if (thisYear > asOf) return thisYear;
    return anniversaryMd(hired, y + 1).ymd;
  }
  function anniversarySoon(emp, asOf, withinDays) {
    asOf = asOf || todayYMD();
    withinDays = withinDays == null ? 14 : withinDays;
    if (!hiredYmd(emp) || isAnniversaryOn(emp, asOf)) return null;
    var next = nextAnniversaryYmd(emp, asOf);
    if (!next) return null;
    var days = 0;
    var d = asOf;
    while (d < next && days <= withinDays) {
      d = addDays(d, 1);
      days += 1;
    }
    if (days <= 0 || days > withinDays) return null;
    return { ymd: next, year: tenureYears(emp, next), days: days };
  }
  function ordinal(n) {
    n = Math.abs(Number(n) || 0);
    var mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return n + "th";
    var mod10 = n % 10;
    if (mod10 === 1) return n + "st";
    if (mod10 === 2) return n + "nd";
    if (mod10 === 3) return n + "rd";
    return n + "th";
  }
  function monthStart(ymd) {
    var p = String(ymd || todayYMD()).split("-");
    return p[0] + "-" + p[1] + "-01";
  }
  function monthEnd(ymd) {
    var p = String(ymd || todayYMD()).split("-");
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]), 0));
    return dt.getUTCFullYear() + "-" + String(dt.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(dt.getUTCDate()).padStart(2, "0");
  }
  function datesInRange(startYmd, endYmd) {
    var out = [];
    if (!startYmd || !endYmd || startYmd > endYmd) return out;
    var d = startYmd;
    while (d <= endYmd) {
      out.push(d);
      d = addDays(d, 1);
      if (out.length > 800) break;
    }
    return out;
  }
  function payPeriodOf(ymd) {
    ymd = ymd || todayYMD();
    var p = String(ymd).split("-");
    var y = p[0];
    var m = p[1];
    var d = Number(p[2]);
    if (d <= 15) return { start: y + "-" + m + "-01", end: y + "-" + m + "-15" };
    return { start: y + "-" + m + "-16", end: monthEnd(ymd) };
  }
  function payPeriodShift(ymd, delta) {
    var per = payPeriodOf(ymd);
    if (Number(delta) < 0) return payPeriodOf(addDays(per.start, -1));
    if (Number(delta) > 0) return payPeriodOf(addDays(per.end, 1));
    return per;
  }
  function r2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }
  function formatMonth(ymd) {
    if (!ymd) return "";
    var p = String(ymd).split("-");
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, 1));
    return dt.toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  }
  function formatLA(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("en-US", {
        timeZone: TZ, month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit"
      });
    } catch (e) { return String(iso); }
  }
  function formatYMD(ymd) {
    if (!ymd) return "";
    var p = String(ymd).split("-");
    var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    return dt.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  }
  function hoursBetween(start, end) {
    if (!start || !end) return 0;
    var a = String(start).split(":");
    var b = String(end).split(":");
    var m0 = Number(a[0]) * 60 + Number(a[1] || 0);
    var m1 = Number(b[0]) * 60 + Number(b[1] || 0);
    if (isNaN(m0) || isNaN(m1)) return 0;
    if (m1 < m0) m1 += 24 * 60;
    return Math.round(((m1 - m0) / 60) * 100) / 100;
  }
  function fmtTime(hhmm) {
    if (!hhmm) return "";
    var p = String(hhmm).split(":");
    var h = Number(p[0]), m = p[1] || "00";
    if (isNaN(h)) return hhmm;
    var ap = h >= 12 ? "p" : "a";
    var h12 = h % 12;
    if (!h12) h12 = 12;
    return m === "00" ? h12 + ap : h12 + ":" + m + ap;
  }
  function nowISO() {
    return new Date().toISOString();
  }

  function emptyState() {
    return {
      version: 1,
      locationName: FIRST_LOCATION,
      taskCatalog: [],
      employees: [],
      roles: [],
      shifts: [],
      timeOff: [],
      availability: [],
      assignments: [],
      completions: [],
      clocks: [],
      breaks: [],
      reminderSkips: [],
      timeOffRequests: [],
      clockPermits: [],
      locationLabels: {},
      publishedWeeks: {}
    };
  }
  function merge(seed, local) {
    var s = emptyState();
    seed = seed || {};
    local = local || {};
    s.locationName = local.locationName || seed.locationName || FIRST_LOCATION;
    var map = {};
    (seed.taskCatalog || []).forEach(function (t) { map[t.id] = t; });
    (local.taskCatalog || []).forEach(function (t) { if (t && t.id && !map[t.id]) map[t.id] = t; });
    s.taskCatalog = Object.keys(map).map(function (k) { return map[k]; });
    function byId(seedArr, localArr) {
      var map = {};
      (seedArr || []).forEach(function (x) { if (x && x.id) map[x.id] = x; });
      (localArr || []).forEach(function (x) {
        if (!x || !x.id) return;
        var base = map[x.id] || {};
        var merged = Object.assign({}, base, x);
        ["email", "phone", "address", "hiredOn", "photo", "clockPassHash"].forEach(function (f) {
          if (!merged[f] && base[f]) merged[f] = base[f];
        });
        map[x.id] = merged;
      });
      var keys = Object.keys(map);
      if (!keys.length) return Array.isArray(localArr) && localArr.length ? localArr : (seedArr || []);
      return keys.map(function (k) { return map[k]; });
    }
    ["employees", "roles", "shifts", "timeOff", "timeOffRequests", "clockPermits", "availability", "assignments", "completions", "clocks", "breaks", "reminderSkips"].forEach(function (k) {
      s[k] = byId(seed[k], local[k]);
    });
    (seed.clocks || []).forEach(function (sc) {
      if (!sc || !sc.id || !sc.outAt) return;
      s.clocks.forEach(function (c) {
        if (c && c.id === sc.id && !c.outAt) {
          c.outAt = sc.outAt;
          if (sc.hours != null) c.hours = sc.hours;
          if (sc.autoOut) { c.autoOut = true; c.autoOutReason = sc.autoOutReason || "scheduled"; }
        }
      });
    });
    s.locationLabels = local.locationLabels && typeof local.locationLabels === "object" ? local.locationLabels : {};
    s.publishedWeeks = (local.publishedWeeks && typeof local.publishedWeeks === "object")
      ? local.publishedWeeks
      : ((seed.publishedWeeks && typeof seed.publishedWeeks === "object") ? seed.publishedWeeks : {});
    return s;
  }
  function persist() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {}
  }
  function loadLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function boot() {
    function loadJson(url, fallback) {
      return fetch(url)
        .then(function (r) { return r.ok ? r.json() : fallback; })
        .catch(function () { return fallback; });
    }
    return Promise.all([
      loadJson("core.json?v=r2", emptyState()),
      loadJson("core-clocks.json", { clocks: [] })
    ]).then(function (pair) {
      var seed = pair[0] || emptyState();
      var extra = pair[1] || {};
      var clocks = Array.isArray(extra) ? extra : (extra.clocks || []);
      if (clocks.length && !(seed.clocks && seed.clocks.length)) {
        seed.clocks = clocks;
      }
      state = merge(seed, loadLocal());
      autoCloseOverdueClocks();
      persist();
      readyResolve(state);
      return state;
    });
  }

  function getState() { return state; }
  function catalog() { return (state && state.taskCatalog) || []; }
  function catalogById(id) {
    var list = catalog();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function locationLabel(stationId) {
    if (!state) return FIRST_LOCATION;
    var id = String(stationId || "");
    if (id === "42352") id = "diamond";
    if (id && state.locationLabels && state.locationLabels[id]) {
      return state.locationLabels[id];
    }
    if (id === "diamond") return state.locationName || FIRST_LOCATION;
    return state.locationName || FIRST_LOCATION;
  }
  function setLocationLabel(stationId, name) {
    if (!state || !stationId) return;
    state.locationLabels[stationId] = String(name || FIRST_LOCATION).trim() || FIRST_LOCATION;
    persist();
  }

  function employees(stationId, opts) {
    opts = opts || {};
    var list = (state && state.employees) || [];
    return list.filter(function (e) {
      if (stationId && !sameStation(e.stationId, stationId)) return false;
      if (opts.includeTerminated) return true;
      return e.status !== "terminated";
    });
  }
  function employeeById(id) {
    var list = (state && state.employees) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function normalizeHiredOn(hiredOn) {
    var s = String(hiredOn || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return todayYMD();
  }
  function cleanRate(v) {
    if (v == null || v === "") return "";
    var n = Number(v);
    if (isNaN(n) || n < 0) return "";
    return Math.round(n * 100) / 100;
  }
  function addEmployee(name, dateField, stationId, hiredOn, address, extra) {
    name = squeezeName(name);
    extra = extra || {};
    if (!name) return Promise.reject(new Error("Name is required."));
    if (!extra.clockPass && !dateField) return Promise.reject(new Error("Time clock pass is required."));
    if (!hiredOn || !/^\d{4}-\d{2}-\d{2}$/.test(String(hiredOn).trim())) {
      return Promise.reject(new Error("Date hired is required."));
    }
    var rec = {
        id: uid("e"),
        name: name,
        dobHash: "",
        clockPassHash: "",
        stationId: String(stationId || ""),
        roleId: String(extra.roleId || ""),
        hiredOn: normalizeHiredOn(hiredOn),
        address: String(address || extra.address || "").trim(),
        phone: String(extra.phone || "").trim(),
        email: String(extra.email || "").trim(),
        hourlyRate: cleanRate(extra.hourlyRate),
        photo: String(extra.photo || "").trim(),
        status: "active",
        terminatedAt: "",
        terminateReason: "",
        createdAt: nowISO()
    };
    var jobs = [];
    if (dateField) jobs.push(hashIdentity(name, dateField).then(function (h) { rec.dobHash = h; }));
    if (extra.clockPass) jobs.push(hashClockPass(name, extra.clockPass).then(function (h) { rec.clockPassHash = h; }));
    return Promise.all(jobs).then(function () {
      var term = String(extra.terminatedAt || "").trim();
      var why = String(extra.terminateReason || "").trim();
      if (term && why) {
        rec.status = "terminated";
        rec.terminatedAt = term;
        rec.terminateReason = why;
      }
      state.employees.push(rec);
      persist();
      return rec;
    });
  }
  function updateEmployee(id, patch) {
    var e = employeeById(id);
    if (!e) return Promise.resolve(null);
    patch = patch || {};
    var p = Promise.resolve();
    if (patch.name != null) e.name = squeezeName(patch.name);
    if (patch.roleId != null) e.roleId = String(patch.roleId || "");
    if (patch.hiredOn != null) {
      var h = String(patch.hiredOn).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(h)) e.hiredOn = h;
    }
    if (patch.address != null) e.address = String(patch.address).trim();
    if (patch.phone != null) e.phone = String(patch.phone).trim();
    if (patch.email != null) e.email = String(patch.email).trim();
    if (patch.hourlyRate != null) e.hourlyRate = cleanRate(patch.hourlyRate);
    if (patch.photo != null) e.photo = String(patch.photo).trim();
    if (patch.terminatedAt != null) {
      var t = String(patch.terminatedAt).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(t) || t === "") e.terminatedAt = t;
    }
    if (patch.terminateReason != null) e.terminateReason = String(patch.terminateReason).trim();
    if (patch.status === "terminated" && e.terminatedAt) e.status = "terminated";
    if (patch.status === "active") {
      e.status = "active";
      if (patch.terminatedAt === "") e.terminatedAt = "";
    }
    if (patch.dateField) {
      p = hashIdentity(e.name, patch.dateField).then(function (h) { e.dobHash = h; });
    }
    if (patch.clockPass) {
      p = p.then(function () { return hashClockPass(e.name, patch.clockPass); }).then(function (h) { e.clockPassHash = h; });
    }
    return p.then(function () { persist(); return e; });
  }
  function terminateEmployee(id, reason, dateYmd) {
    var e = employeeById(id);
    if (!e) return null;
    reason = String(reason || "").trim();
    dateYmd = String(dateYmd || "").trim();
    if (!reason || !dateYmd) return null;
    e.status = "terminated";
    e.terminateReason = reason;
    e.terminatedAt = dateYmd;
    persist();
    return e;
  }
  function restoreEmployee(id) {
    var e = employeeById(id);
    if (!e) return null;
    e.status = "active";
    e.terminateReason = "";
    e.terminatedAt = "";
    persist();
    return e;
  }

  function roles(stationId) {
    return ((state && state.roles) || []).filter(function (r) {
      return !stationId || sameStation(r.stationId, stationId);
    });
  }
  function addRole(stationId, name) {
    name = String(name || "").trim();
    if (!name) return null;
    var rec = { id: uid("r"), stationId: String(stationId || ""), name: name };
    state.roles.push(rec);
    persist();
    return rec;
  }
  function removeRole(id) {
    state.roles = (state.roles || []).filter(function (r) { return r.id !== id; });
    (state.employees || []).forEach(function (e) {
      if (e.roleId === id) e.roleId = "";
    });
    persist();
  }
  function roleName(id) {
    var list = (state && state.roles) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return "";
  }

  function shiftsFor(stationId, dateYmd, employeeId) {
    return ((state && state.shifts) || []).filter(function (s) {
      if (stationId && !sameStation(s.stationId, stationId)) return false;
      if (dateYmd && s.date !== dateYmd) return false;
      if (employeeId && s.employeeId !== employeeId) return false;
      return true;
    });
  }
  function upsertShift(employeeId, stationId, dateYmd, start, end) {
    if ((start || end) && isTimeOff(employeeId, stationId, dateYmd)) return null;
    var list = state.shifts || [];
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].employeeId === employeeId && list[i].date === dateYmd && String(list[i].stationId) === String(stationId)) {
        found = list[i];
        break;
      }
    }
    if (!start && !end) {
      if (found) state.shifts = list.filter(function (s) { return s !== found; });
      persist();
      return null;
    }
    if (!found) {
      found = { id: uid("sh"), employeeId: employeeId, stationId: String(stationId || ""), date: dateYmd };
      state.shifts.push(found);
    }
    found.start = start || "";
    found.end = end || "";
    persist();
    return found;
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
  function isShiftLeader(sh) {
    return !!(sh && sh.leader);
  }
  function setShiftLeader(employeeId, stationId, dateYmd, on) {
    var list = state.shifts || [];
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].employeeId === employeeId && list[i].date === dateYmd && sameStation(list[i].stationId, stationId)) {
        found = list[i];
        break;
      }
    }
    if (!found) return null;
    if (on) {
      var band = shiftBand(found);
      list.forEach(function (s) {
        if (s === found) return;
        if (s.date !== dateYmd) return;
        if (!sameStation(s.stationId, stationId)) return;
        if (shiftBand(s) === band) s.leader = false;
      });
      found.leader = true;
    } else {
      found.leader = false;
    }
    persist();
    return found;
  }
  function copyWeekShifts(stationId, fromMonday, toMonday) {
    if (!fromMonday || !toMonday || fromMonday === toMonday) {
      return { copied: 0, cleared: 0, skippedOff: 0 };
    }
    var fromDates = weekDates(fromMonday);
    var toDates = weekDates(toMonday);
    var copied = 0, cleared = 0, skippedOff = 0;
    employees(stationId).forEach(function (e) {
      if (e.status === "terminated") return;
      for (var i = 0; i < 7; i++) {
        var dst = toDates[i];
        if (isTimeOff(e.id, stationId, dst)) { skippedOff++; continue; }
        var sh = shiftsFor(stationId, fromDates[i], e.id)[0];
        if (sh && (sh.start || sh.end)) {
          var rec = upsertShift(e.id, stationId, dst, sh.start, sh.end);
          if (rec) {
            rec.leader = !!sh.leader;
            persist();
            copied++;
          }
        } else if (shiftsFor(stationId, dst, e.id)[0]) {
          upsertShift(e.id, stationId, dst, "", "");
          cleared++;
        }
      }
    });
    return { copied: copied, cleared: cleared, skippedOff: skippedOff };
  }
  function hoursForRange(employeeId, stationId, startYmd, endYmd) {
    var total = 0;
    ((state && state.shifts) || []).forEach(function (s) {
      if (s.employeeId !== employeeId) return;
      if (stationId && !sameStation(s.stationId, stationId)) return;
      if (s.date < startYmd || s.date > endYmd) return;
      if (isTimeOff(employeeId, stationId, s.date)) return;
      total += hoursBetween(s.start, s.end);
    });
    return Math.round(total * 100) / 100;
  }

  function timeOffFor(stationId, employeeId, dateYmd) {
    return ((state && state.timeOff) || []).filter(function (t) {
      if (stationId && !sameStation(t.stationId, stationId)) return false;
      if (employeeId && t.employeeId !== employeeId) return false;
      if (dateYmd && t.date !== dateYmd) return false;
      return true;
    });
  }
  function isTimeOff(employeeId, stationId, dateYmd) {
    return timeOffFor(stationId, employeeId, dateYmd).length > 0;
  }
  function addTimeOff(employeeId, stationId, dateYmd, reason) {
    reason = String(reason || "").trim();
    if (!employeeId || !dateYmd) return null;
    var rec = {
      id: uid("to"),
      employeeId: employeeId,
      stationId: String(stationId || ""),
      date: dateYmd,
      reason: reason || "Time off",
      createdAt: nowISO()
    };
    state.timeOff.push(rec);
    persist();
    return rec;
  }
  function removeTimeOff(id) {
    state.timeOff = (state.timeOff || []).filter(function (t) { return t.id !== id; });
    persist();
  }
  function requestById(id) {
    var list = (state && state.timeOffRequests) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function requestTimeOff(employeeId, stationId, start, end, reason) {
    var e = employeeById(employeeId);
    if (!e || e.status === "terminated") {
      return { ok: false, error: "Terminated employees cannot request time off." };
    }
    start = String(start || "").trim();
    end = String(end || "").trim() || start;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return { ok: false, error: "Pick a start date and, if needed, an end date." };
    }
    if (end < start) return { ok: false, error: "End date must be on or after the start date." };
    if (!state.timeOffRequests) state.timeOffRequests = [];
    var rec = {
      id: uid("tor"),
      employeeId: employeeId,
      stationId: String(stationId || e.stationId || ""),
      start: start,
      end: end,
      reason: String(reason || "").trim(),
      status: "pending",
      createdAt: nowISO(),
      decidedAt: "",
      decidedBy: ""
    };
    state.timeOffRequests.push(rec);
    persist();
    return { ok: true, request: rec };
  }
  function listRequests(opts) {
    opts = opts || {};
    return ((state && state.timeOffRequests) || []).filter(function (r) {
      if (!r) return false;
      if (opts.employeeId && r.employeeId !== opts.employeeId) return false;
      if (opts.stationId && !sameStation(r.stationId, opts.stationId)) return false;
      if (opts.status && r.status !== opts.status) return false;
      return true;
    });
  }
  function approveTimeOffRequest(id, decidedBy) {
    var rec = requestById(id);
    if (!rec) return { ok: false, error: "Request not found." };
    if (rec.status !== "pending") return { ok: false, error: "This request is already decided." };
    var dates = datesInRange(rec.start, rec.end);
    dates.forEach(function (d) {
      if (!isTimeOff(rec.employeeId, rec.stationId, d)) {
        addTimeOff(rec.employeeId, rec.stationId, d, rec.reason || "Time off");
      }
    });
    rec.status = "approved";
    rec.decidedAt = nowISO();
    rec.decidedBy = String(decidedBy || "");
    persist();
    return { ok: true, request: rec };
  }
  function denyTimeOffRequest(id, decidedBy) {
    var rec = requestById(id);
    if (!rec) return { ok: false, error: "Request not found." };
    if (rec.status !== "pending") return { ok: false, error: "This request is already decided." };
    rec.status = "denied";
    rec.decidedAt = nowISO();
    rec.decidedBy = String(decidedBy || "");
    persist();
    return { ok: true, request: rec };
  }

  function availabilityFor(stationId, employeeId) {
    return ((state && state.availability) || []).filter(function (a) {
      if (stationId && !sameStation(a.stationId, stationId)) return false;
      if (employeeId && a.employeeId !== employeeId) return false;
      return true;
    });
  }
  function setAvailability(employeeId, stationId, day, avail, start, end) {
    var list = state.availability || [];
    var found = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].employeeId === employeeId && list[i].day === day && String(list[i].stationId) === String(stationId)) {
        found = list[i];
        break;
      }
    }
    if (!found) {
      found = { id: uid("av"), employeeId: employeeId, stationId: String(stationId || ""), day: day };
      state.availability.push(found);
    }
    found.available = avail !== false;
    found.start = start || "";
    found.end = end || "";
    persist();
    return found;
  }

  function assignments(stationId, employeeId, dateYmd) {
    if (stationId) ensureLiveCheatSheet(stationId, dateYmd || todayYMD());
    return ((state && state.assignments) || []).filter(function (a) {
      if (stationId && !sameStation(a.stationId, stationId)) return false;
      if (employeeId && a.employeeId !== employeeId) return false;
      if (dateYmd && a.date !== dateYmd) return false;
      return true;
    });
  }
  function assignmentsForDay(stationId, employeeId, dateYmd) {
    if (stationId) ensureLiveCheatSheet(stationId, dateYmd || todayYMD());
    return ((state && state.assignments) || []).filter(function (a) {
      if (stationId && !sameStation(a.stationId, stationId)) return false;
      if (employeeId && a.employeeId !== employeeId) return false;
      if (!a.date) return true;
      return a.date === dateYmd;
    });
  }
  function addAssignment(employeeId, stationId, opts) {
    opts = opts || {};
    var title = String(opts.title || "").trim();
    var cat = opts.catalogId ? catalogById(opts.catalogId) : null;
    if (cat) {
      title = title || cat.title;
    }
    if (!title || !employeeId) return null;
    var rec = {
      id: uid("a"),
      employeeId: employeeId,
      stationId: String(stationId || ""),
      catalogId: cat ? cat.id : (opts.catalogId || ""),
      title: title,
      requiresPhoto: opts.requiresPhoto != null ? !!opts.requiresPhoto : !!(cat && cat.requiresPhoto),
      createdAt: nowISO()
    };
    if (opts.date) rec.date = String(opts.date);
    if (opts.source) rec.source = String(opts.source);
    if (opts.weekStart) rec.weekStart = String(opts.weekStart);
    state.assignments.push(rec);
    persist();
    return rec;
  }
  var liveCheatBusy = false;
  function cheatSheetWeekSlots(stationId, mondayYmd) {
    mondayYmd = mondayYmd || weekStartMonday();
    stationId = String(stationId || "");
    var dates = weekDates(mondayYmd);
    var people = employees(stationId);
    var slots = [];
    var daysUsed = [];
    dates.forEach(function (d) {
      var daySlots = [];
      people.forEach(function (e) {
        if (isTimeOff(e.id, stationId, d)) return;
        if (!shiftsFor(stationId, d, e.id).length) return;
        daySlots.push({ employeeId: e.id, date: d });
      });
      if (!daySlots.length) return;
      daysUsed.push(d);
      daySlots.forEach(function (sl) { slots.push(sl); });
    });
    return { mondayYmd: mondayYmd, dates: dates, slots: slots, daysUsed: daysUsed, weekEnd: dates[6] };
  }
  function weekCheatSheetAssignments(stationId, mondayYmd) {
    var dates = weekDates(mondayYmd);
    var weekEnd = dates[6];
    return ((state && state.assignments) || []).filter(function (a) {
      if (!sameStation(a.stationId, stationId)) return false;
      if (a.source !== "cheatsheet") return false;
      if (!a.date || a.date < dates[0] || a.date > weekEnd) return false;
      return true;
    });
  }
  function cheatSheetAssignmentId(dateYmd, catalogId) {
    return "a-cs-" + dateYmd + "-" + catalogId;
  }
  function splitCheatSheetWeek(stationId, mondayYmd) {
    mondayYmd = mondayYmd || weekStartMonday();
    stationId = String(stationId || "");
    var info = cheatSheetWeekSlots(stationId, mondayYmd);
    if (!info.slots.length) {
      return { ok: false, error: "Paint the week first. Split goes to people who have a shift." };
    }
    var dates = info.dates;
    var weekEnd = info.weekEnd;
    state.assignments = (state.assignments || []).filter(function (a) {
      if (String(a.stationId) !== stationId) return true;
      if (a.source !== "cheatsheet") return true;
      if (!a.date || a.date < dates[0] || a.date > weekEnd) return true;
      return false;
    });
    var cat = catalog();
    var seen = {};
    for (var i = 0; i < cat.length; i++) {
      var slot = info.slots[i % info.slots.length];
      var t = cat[i];
      state.assignments.push({
        id: uid("a"),
        employeeId: slot.employeeId,
        stationId: stationId,
        catalogId: t.id,
        title: t.title,
        requiresPhoto: !!t.requiresPhoto,
        date: slot.date,
        source: "cheatsheet",
        weekStart: mondayYmd,
        createdAt: nowISO()
      });
      seen[slot.employeeId] = true;
    }
    persist();
    return {
      ok: true,
      assigned: cat.length,
      people: Object.keys(seen).length,
      days: info.daysUsed.length
    };
  }
  function ensureLiveCheatSheet(stationId, dateYmd) {
    if (state && state.cheatSheetManual) return { ok: true, skipped: true, manual: true };
    if (liveCheatBusy || !state) return { ok: false, skipped: true };
    stationId = String(stationId || "");
    if (!stationId) return { ok: false };
    dateYmd = dateYmd || todayYMD();
    var mondayYmd = weekStartMonday(dateYmd);
    if (weekCheatSheetAssignments(stationId, mondayYmd).length) {
      return { ok: true, assigned: 0, skipped: true };
    }
    var info = cheatSheetWeekSlots(stationId, mondayYmd);
    if (!info.slots.length) {
      return { ok: false, error: "No shifts this week." };
    }
    liveCheatBusy = true;
    var cat = catalog();
    var have = {};
    (state.assignments || []).forEach(function (a) { if (a && a.id) have[a.id] = true; });
    var seen = {};
    var added = 0;
    for (var i = 0; i < cat.length; i++) {
      var slot = info.slots[i % info.slots.length];
      var t = cat[i];
      var id = cheatSheetAssignmentId(slot.date, t.id);
      if (have[id]) continue;
      state.assignments.push({
        id: id,
        employeeId: slot.employeeId,
        stationId: stationId,
        catalogId: t.id,
        title: t.title,
        requiresPhoto: !!t.requiresPhoto,
        date: slot.date,
        source: "cheatsheet",
        weekStart: mondayYmd,
        createdAt: nowISO()
      });
      have[id] = true;
      seen[slot.employeeId] = true;
      added += 1;
    }
    if (added) persist();
    liveCheatBusy = false;
    return {
      ok: true,
      assigned: added,
      people: Object.keys(seen).length,
      days: info.daysUsed.length
    };
  }

  function setCheatSheetManual(on) {
    if (!state) return;
    state.cheatSheetManual = !!on;
    persist();
  }
  function assignCheatSheetToEmployee(stationId, employeeId, dateYmd, catalogIds) {
    if (!state || !employeeId || !dateYmd) return { ok: false, error: "Pick an employee and a day." };
    stationId = String(stationId || "");
    catalogIds = catalogIds || [];
    var dest = employeeById(employeeId);
    if (!dest || dest.status === "terminated") return { ok: false, error: "Pick a current employee." };
    if (isTimeOff(employeeId, stationId, dateYmd) || !shiftsFor(stationId, dateYmd, employeeId).length) {
      return { ok: false, error: "That person has no shift that day." };
    }
    state.cheatSheetManual = true;
    var monday = weekStartMonday(dateYmd);
    var dates = weekDates(monday);
    var weekEnd = dates[6];
    var want = {};
    catalogIds.forEach(function (id) { if (id) want[String(id)] = true; });
    state.assignments = (state.assignments || []).filter(function (a) {
      if (!sameStation(a.stationId, stationId)) return true;
      if (a.source !== "cheatsheet") return true;
      if (!a.date || a.date < dates[0] || a.date > weekEnd) return true;
      if (a.employeeId === employeeId && a.date === dateYmd) return false;
      if (want[a.catalogId]) return false;
      return true;
    });
    catalog().forEach(function (t) {
      if (!want[t.id]) return;
      state.assignments.push({
        id: uid("a"),
        employeeId: employeeId,
        stationId: stationId,
        catalogId: t.id,
        title: t.title,
        requiresPhoto: !!t.requiresPhoto,
        date: dateYmd,
        source: "cheatsheet",
        weekStart: monday,
        createdAt: nowISO()
      });
    });
    persist();
    return { ok: true, assigned: catalogIds.length, employeeId: employeeId, date: dateYmd };
  }
  function updateAssignment(id, patch) {
    var list = state.assignments || [];
    patch = patch || {};
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        if (patch.title != null) list[i].title = String(patch.title);
        if (patch.requiresPhoto != null) list[i].requiresPhoto = !!patch.requiresPhoto;
        if (patch.date != null) list[i].date = String(patch.date || "");
        persist();
        return list[i];
      }
    }
    return null;
  }
  function reassignAssignment(id, toEmployeeId) {
    var dest = employeeById(toEmployeeId);
    if (!dest || dest.status === "terminated") return { ok: false, error: "Pick a current employee." };
    var list = state.assignments || [];
    var rec = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { rec = list[i]; break; }
    }
    if (!rec) return { ok: false, error: "Task not found." };
    if (rec.employeeId === dest.id) return { ok: true, assignment: rec };
    rec.employeeId = dest.id;
    persist();
    return { ok: true, assignment: rec };
  }
  function removeAssignment(id) {
    state.assignments = (state.assignments || []).filter(function (a) { return a.id !== id; });
    persist();
  }

  function completionsFor(opts) {
    opts = opts || {};
    return ((state && state.completions) || []).filter(function (c) {
      if (opts.stationId && !sameStation(c.stationId, opts.stationId)) return false;
      if (opts.employeeId && c.employeeId !== opts.employeeId) return false;
      if (opts.assignmentId && c.assignmentId !== opts.assignmentId) return false;
      if (opts.date && c.date !== opts.date) return false;
      if (opts.start && c.date < opts.start) return false;
      if (opts.end && c.date > opts.end) return false;
      return true;
    });
  }
  function isDoneToday(assignmentId, dateYmd) {
    dateYmd = dateYmd || todayYMD();
    var list = completionsFor({ assignmentId: assignmentId, date: dateYmd });
    return list[0] || null;
  }
  function markDone(assignmentId, employeeId, stationId, photoIds) {
    var a = null;
    ((state && state.assignments) || []).forEach(function (x) { if (x.id === assignmentId) a = x; });
    if (!a) return Promise.reject(new Error("Task not found."));
    if (a.requiresPhoto && (!photoIds || !photoIds.length)) {
      return Promise.reject(new Error("A photo is required for this task."));
    }
    var day = todayYMD();
    var existing = isDoneToday(assignmentId, day);
    if (existing) {
      existing.doneAt = nowISO();
      existing.photoIds = photoIds || existing.photoIds || [];
      persist();
      return Promise.resolve(existing);
    }
    var rec = {
      id: uid("c"),
      assignmentId: assignmentId,
      employeeId: employeeId,
      stationId: String(stationId || a.stationId || ""),
      date: day,
      doneAt: nowISO(),
      photoIds: photoIds || []
    };
    state.completions.push(rec);
    persist();
    return Promise.resolve(rec);
  }
  function undoDone(completionId) {
    var rec = null;
    (state.completions || []).forEach(function (c) { if (c.id === completionId) rec = c; });
    state.completions = (state.completions || []).filter(function (c) { return c.id !== completionId; });
    persist();
    return rec;
  }

  function clocksFor(opts) {
    opts = opts || {};
    return ((state && state.clocks) || []).filter(function (c) {
      if (opts.stationId && !sameStation(c.stationId, opts.stationId)) return false;
      if (opts.employeeId && c.employeeId !== opts.employeeId) return false;
      if (opts.date && c.date !== opts.date) return false;
      if (opts.start && c.date < opts.start) return false;
      if (opts.end && c.date > opts.end) return false;
      return true;
    });
  }
  function clocksForRange(employeeId, stationId, startYmd, endYmd) {
    return clocksFor({
      employeeId: employeeId,
      stationId: stationId,
      start: startYmd,
      end: endYmd
    });
  }
  function openClock(employeeId, stationId, geo) {
    var day = todayYMD();
    employeeId = empIdOf(employeeId);
    stationId = assignedStation(employeeId, stationId);
    var open = openClockAny(employeeId);
    if (open) return open;
    var rec = {
      id: uid("ck"),
      employeeId: employeeId,
      stationId: String(stationId || ""),
      locationName: locationLabel(stationId),
      date: day,
      inAt: nowISO(),
      outAt: "",
      inGeo: normalizeGeo(geo)
    };
    state.clocks.push(rec);
    persist();
    return rec;
  }
  function closeClock(employeeId, geo) {
    employeeId = empIdOf(employeeId);
    var open = openClockAny(employeeId);
    if (!open) return null;
    open.outAt = nowISO();
    open.outGeo = normalizeGeo(geo);
    if (!open.locationName) open.locationName = locationLabel(open.stationId);
    persist();
    return open;
  }
  function addClock(employeeId, stationId, dateYmd, inAt, outAt) {
    var rec = {
      id: uid("ck"),
      employeeId: employeeId,
      stationId: String(stationId || ""),
      locationName: locationLabel(stationId),
      date: dateYmd,
      inAt: inAt || "",
      outAt: outAt || ""
    };
    state.clocks.push(rec);
    persist();
    return rec;
  }
  function laHHmm(iso) {
    if (!iso) return "";
    var p = laParts(iso);
    var h = String(p.hour);
    if (h === "24") h = "00";
    if (h.length === 1) h = "0" + h;
    return h + ":" + p.minute;
  }
  function clockStamp(dateYmd, value, afterIso) {
    if (!value) return "";
    var v = String(value).trim();
    if (/^\d{1,2}:\d{2}$/.test(v)) {
      var bits = v.split(":");
      if (bits[0].length === 1) v = "0" + v;
      var iso = laDateTime(dateYmd, v).toISOString();
      if (afterIso && new Date(iso) <= new Date(afterIso)) {
        iso = laDateTime(addDays(dateYmd, 1), v).toISOString();
      }
      return iso;
    }
    return v;
  }
  function stampEdit(rec, meta) {
    if (!rec || !meta) return rec;
    if (meta.editedBy) rec.editedBy = String(meta.editedBy);
    rec.editedAt = meta.editedAt || nowISO();
    return rec;
  }
  function upsertClock(employeeId, stationId, dateYmd, inAt, outAt, meta) {
    employeeId = empIdOf(employeeId);
    stationId = String(stationId || "");
    dateYmd = String(dateYmd || "");
    if (!employeeId || !dateYmd) return null;
    var list = clocksFor({ employeeId: employeeId, date: dateYmd, stationId: stationId });
    var rec = list[0] || null;
    if (!inAt && !outAt) {
      if (rec) {
        state.clocks = (state.clocks || []).filter(function (c) { return c !== rec; });
        persist();
      }
      return null;
    }
    if (!rec) {
      rec = {
        id: uid("ck"),
        employeeId: employeeId,
        stationId: stationId,
        locationName: locationLabel(stationId),
        date: dateYmd
      };
      state.clocks.push(rec);
    }
    rec.inAt = clockStamp(dateYmd, inAt);
    rec.outAt = clockStamp(dateYmd, outAt, rec.inAt);
    if (!rec.locationName) rec.locationName = locationLabel(stationId);
    stampEdit(rec, meta);
    persist();
    return rec;
  }
  function updateClock(clockId, patch, meta) {
    var list = state.clocks || [];
    patch = patch || {};
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== clockId) continue;
      var rec = list[i];
      if (patch.inAt != null) rec.inAt = clockStamp(rec.date, patch.inAt);
      if (patch.outAt != null) rec.outAt = clockStamp(rec.date, patch.outAt, rec.inAt);
      stampEdit(rec, meta);
      persist();
      return rec;
    }
    return null;
  }
  function upsertBreak(employeeId, stationId, dateYmd, kind, startAt, endAt, meta) {
    employeeId = empIdOf(employeeId);
    kind = String(kind || "");
    dateYmd = String(dateYmd || "");
    if (!employeeId || !dateYmd || BREAK_KINDS.indexOf(kind) === -1) return null;
    var rec = breaksFor({ employeeId: employeeId, date: dateYmd, kind: kind })[0] || null;
    if (!startAt && !endAt) {
      if (rec) {
        state.breaks = (state.breaks || []).filter(function (b) { return b !== rec; });
        persist();
      }
      return null;
    }
    if (!rec) {
      rec = {
        id: uid("br"),
        employeeId: employeeId,
        stationId: String(stationId || ""),
        locationName: locationLabel(stationId),
        date: dateYmd,
        kind: kind,
        paid: kind !== "meal30"
      };
      state.breaks = state.breaks || [];
      state.breaks.push(rec);
    }
    rec.startAt = clockStamp(dateYmd, startAt);
    rec.endAt = clockStamp(dateYmd, endAt, rec.startAt);
    stampEdit(rec, meta);
    persist();
    return rec;
  }
  function clockKey(rec) {
    return (rec.employeeId || "") + "|" + (rec.date || "") + "|" + (rec.inAt || "");
  }
  function uniqueClocks(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (c) {
      if (!c) return;
      var k = clockKey(c);
      var prev = seen[k];
      if (!prev) { seen[k] = c; out.push(c); return; }
      var better = false;
      if (!prev.outAt && c.outAt) better = true;
      else if (Number(c.hours || 0) > Number(prev.hours || 0)) better = true;
      if (better) {
        out[out.indexOf(prev)] = c;
        seen[k] = c;
      }
    });
    return out;
  }
  function clockHours(rec) {
    if (!rec) return 0;
    var stored = rec.hours;
    var hasStored = stored != null && stored !== "" && !isNaN(Number(stored));
    if (hasStored && (rec.outAt || Number(stored) > 0)) return r2(Number(stored));
    if (!rec.inAt) return 0;
    if (!rec.outAt) {
      if (rec.date && rec.date !== todayYMD()) return 0;
      var live = new Date() - new Date(rec.inAt);
      if (live < 0) return 0;
      return r2(live / 3600000);
    }
    var ms = new Date(rec.outAt) - new Date(rec.inAt);
    if (ms < 0) return 0;
    return r2(ms / 3600000);
  }


  var BREAK_KINDS = ["break10a", "meal30", "break10b"];
  var BREAK_LABELS = {
    break10a: "First 10-minute paid break",
    meal30: "30-minute unpaid meal",
    break10b: "Last 10-minute paid break"
  };
  var BREAK_SHORT = {
    break10a: "First 10 (paid)",
    meal30: "30-min meal (unpaid)",
    break10b: "Last 10 (paid)"
  };

  function empIdOf(emp) {
    if (!emp) return "";
    return typeof emp === "string" ? emp : (emp.id || "");
  }
  function assignedStation(emp, fallback) {
    var e = typeof emp === "string" ? employeeById(emp) : emp;
    if (e && e.stationId) return String(e.stationId);
    return String(fallback || "");
  }
  function normalizeGeo(geo) {
    if (!geo || geo.geo === false) return { geo: false };
    if (geo.lat != null && geo.lng != null) {
      return {
        lat: Number(geo.lat),
        lng: Number(geo.lng),
        accuracy: geo.accuracy != null ? Number(geo.accuracy) : null
      };
    }
    return { geo: false };
  }
  function stationGeo(stationId) {
    var id = String(stationId || "diamond");
    if (id === "42352") id = "diamond";
    return STATION_GEO[id] || STATION_GEO.diamond;
  }
  function haversineFeet(lat1, lng1, lat2, lng2) {
    var R = 20902231;
    function toRad(d) { return d * Math.PI / 180; }
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  function geoAtStore(stationId, geo) {
    var pin = stationGeo(stationId);
    if (!geo || geo.geo === false || geo.lat == null || geo.lng == null || isNaN(Number(geo.lat))) {
      return { ok: false, reason: "nogeo", message: "Turn on location to clock in. You have to be at the store." };
    }
    var feet = haversineFeet(Number(geo.lat), Number(geo.lng), pin.lat, pin.lng);
    var accM = Number(geo.accuracy);
    var accFeet = isNaN(accM) ? 0 : accM * 3.28084;
    var credit = Math.min(Math.max(accFeet, 0), 25);
    var closest = Math.max(0, feet - credit);
    if (closest > CLOCK_RADIUS_FEET) {
      return {
        ok: false,
        reason: "away",
        feet: Math.round(feet),
        message: "You have to be at the store (within 20 feet) to clock in."
      };
    }
    return { ok: true, feet: feet };
  }
  function requestGeo() {
    return new Promise(function (resolve) {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve({ geo: false });
        return;
      }
      var done = false;
      function finish(v) { if (done) return; done = true; resolve(normalizeGeo(v)); }
      try {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            finish({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            });
          },
          function () { finish({ geo: false }); },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      } catch (e) {
        finish({ geo: false });
      }
    });
  }
  function laDateTime(ymd, hhmm) {
    var p = String(ymd || "").split("-");
    var t = String(hhmm || "00:00").split(":");
    var wantH = Number(t[0]) || 0;
    var wantM = Number(t[1]) || 0;
    if (p.length < 3) return new Date();
    var ms = Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
    function hm(d) {
      var x = laParts(d);
      var h = Number(x.hour);
      if (h === 24) h = 0;
      return h * 60 + Number(x.minute);
    }
    var want = wantH * 60 + wantM;
    var got = hm(new Date(ms));
    ms += (want - got) * 60000;
    var ymdGot = todayYMD(new Date(ms));
    if (ymdGot !== ymd) {
      if (ymdGot < ymd) ms += 86400000;
      else ms -= 86400000;
      got = hm(new Date(ms));
      ms += (want - got) * 60000;
    }
    return new Date(ms);
  }
  function formatLATime(ms) {
    if (!ms) return "";
    try {
      return new Date(ms).toLocaleString("en-US", {
        timeZone: TZ, hour: "numeric", minute: "2-digit"
      });
    } catch (e) { return ""; }
  }
  function shiftAnchorMs(employeeId, dateYmd, stationId) {
    dateYmd = dateYmd || todayYMD();
    var e = employeeById(employeeId);
    stationId = stationId || (e && e.stationId) || "";
    var sh = shiftsFor(stationId, dateYmd, employeeId)[0];
    if (sh && sh.start) return laDateTime(dateYmd, sh.start).getTime();
    var list = clocksFor({ employeeId: employeeId, date: dateYmd });
    for (var i = 0; i < list.length; i++) {
      if (list[i].inAt) return new Date(list[i].inAt).getTime();
    }
    return 0;
  }
  function breaksFor(opts) {
    opts = opts || {};
    return ((state && state.breaks) || []).filter(function (b) {
      if (opts.stationId && !sameStation(b.stationId, opts.stationId)) return false;
      if (opts.employeeId && b.employeeId !== opts.employeeId) return false;
      if (opts.date && b.date !== opts.date) return false;
      if (opts.kind && b.kind !== opts.kind) return false;
      return true;
    });
  }
  function autoEndStaleBreaks(employeeId, dateYmd) {
    dateYmd = dateYmd || todayYMD();
    var list = breaksFor({ employeeId: employeeId, date: dateYmd });
    var now = Date.now();
    var changed = false;
    list.forEach(function (b) {
      if (b.endAt) return;
      if (b.kind === "meal30") return;
      if (!b.startAt) return;
      var start = new Date(b.startAt).getTime();
      if (now - start >= 10 * 60 * 1000) {
        b.endAt = new Date(start + 10 * 60 * 1000).toISOString();
        b.autoEnded = true;
        changed = true;
      }
    });
    if (changed) persist();
  }
  function skipReminder(employeeId, kind, dateYmd) {
    employeeId = empIdOf(employeeId);
    dateYmd = dateYmd || todayYMD();
    if (!employeeId || BREAK_KINDS.indexOf(kind) === -1) return null;
    state.reminderSkips = state.reminderSkips || [];
    var list = state.reminderSkips;
    for (var i = 0; i < list.length; i++) {
      if (list[i].employeeId === employeeId && list[i].date === dateYmd && list[i].kind === kind) {
        return list[i];
      }
    }
    var rec = { employeeId: employeeId, date: dateYmd, kind: kind, at: nowISO() };
    state.reminderSkips.push(rec);
    persist();
    return rec;
  }
  function reminderSkipped(employeeId, kind, dateYmd) {
    employeeId = empIdOf(employeeId);
    dateYmd = dateYmd || todayYMD();
    return ((state && state.reminderSkips) || []).some(function (s) {
      return s.employeeId === employeeId && s.date === dateYmd && s.kind === kind;
    });
  }
  function reminderTimes(employeeId, dateYmd) {
    employeeId = empIdOf(employeeId);
    dateYmd = dateYmd || todayYMD();
    autoEndStaleBreaks(employeeId, dateYmd);
    var anchor = shiftAnchorMs(employeeId, dateYmd);
    var clocks = clocksFor({ employeeId: employeeId, date: dateYmd });
    var firstIn = 0;
    clocks.forEach(function (c) {
      if (c && c.inAt) {
        var ms = new Date(c.inAt).getTime();
        if (!firstIn || ms < firstIn) firstIn = ms;
      }
    });
    var start = firstIn || anchor;
    var meal = breaksFor({ employeeId: employeeId, date: dateYmd, kind: "meal30" })[0];
    var mealEnd = meal && meal.endAt ? new Date(meal.endAt).getTime() : 0;
    var t10a = start ? start + 1.5 * 3600000 : 0;
    var tmeal = start ? start + 3.5 * 3600000 : 0;
    var t10b = mealEnd ? mealEnd + 1.5 * 3600000 : 0;
    return { anchor: start, break10a: t10a, meal30: tmeal, break10b: t10b };
  }
  function breakState(emp, dateYmd) {
    var employeeId = empIdOf(emp);
    dateYmd = dateYmd || todayYMD();
    autoEndStaleBreaks(employeeId, dateYmd);
    var clocks = clocksFor({ employeeId: employeeId, date: dateYmd });
    var open = clocks.filter(function (c) { return c.inAt && !c.outAt; })[0] || openClockAny(employeeId);
    var first = clocks.filter(function (c) { return c.inAt; })[0];
    var lastOut = "";
    clocks.forEach(function (c) { if (c.outAt) lastOut = c.outAt; });
    var times = reminderTimes(employeeId, dateYmd);
    var now = Date.now();
    var segs = {};
    BREAK_KINDS.forEach(function (k) {
      var b = breaksFor({ employeeId: employeeId, date: dateYmd, kind: k })[0];
      segs[k] = {
        startAt: b && b.startAt || "",
        endAt: b && b.endAt || "",
        started: !!(b && b.startAt),
        ended: !!(b && b.endAt),
        autoEnded: !!(b && b.autoEnded),
        rec: b || null
      };
    });
    function offered(k) {
      if (segs[k].started || segs[k].ended) return true;
      if (times[k] && now >= times[k]) return true;
      return false;
    }
    var off = {
      break10a: offered("break10a"),
      meal30: offered("meal30"),
      break10b: offered("break10b")
    };
    var openBreak = null;
    BREAK_KINDS.forEach(function (k) {
      if (segs[k].started && !segs[k].ended) openBreak = k;
    });
    var clockedIn = !!open;
    var mealReady = off.meal30 || segs.meal30.ended || reminderSkipped(employeeId, "meal30", dateYmd);
    var canStart = {
      break10a: clockedIn && !openBreak && !segs.break10a.started,
      meal30: clockedIn && !openBreak && !segs.meal30.started && off.break10a,
      break10b: clockedIn && !openBreak && !segs.break10b.started && mealReady
    };
    var canEnd = {
      break10a: segs.break10a.started && !segs.break10a.ended,
      meal30: segs.meal30.started && !segs.meal30.ended,
      break10b: segs.break10b.started && !segs.break10b.ended
    };
    return {
      date: dateYmd,
      clockedIn: clockedIn,
      clockedOut: !clockedIn && !!first,
      inAt: first && first.inAt || "",
      outAt: lastOut,
      openClock: open || null,
      clocks: clocks,
      break10a: segs.break10a,
      meal30: segs.meal30,
      break10b: segs.break10b,
      openBreak: openBreak,
      offered: off,
      canStart: canStart,
      canEnd: canEnd,
      times: times
    };
  }
  function reminderDue(emp, dateYmd) {
    var employeeId = empIdOf(emp);
    dateYmd = dateYmd || todayYMD();
    var cout = clockOutStatus(employeeId);
    if (cout && cout.phase === "remind") {
      return { kind: "clockout", label: "clock out", dueAt: cout.endAt, skipped: false, phase: "remind", shift: cout.shift };
    }
    var st = breakState(employeeId, dateYmd);
    if (st.canEnd.meal30) {
      return { kind: "meal30", label: BREAK_LABELS.meal30, dueAt: st.meal30.startAt, skipped: false, phase: "end" };
    }
    if (!st.clockedIn) return null;
    var now = Date.now();
    for (var i = 0; i < BREAK_KINDS.length; i++) {
      var k = BREAK_KINDS[i];
      if (st[k].started || st[k].ended) continue;
      if (st.times[k] && now >= st.times[k]) {
        return {
          kind: k,
          label: BREAK_LABELS[k],
          dueAt: st.times[k],
          skipped: reminderSkipped(employeeId, k, dateYmd)
        };
      }
    }
    return null;
  }
  function storeDueNotices(stationId) {
    autoCloseOverdueClocks();
    var list = employees(stationId);
    var out = [];
    var now = Date.now();
    list.forEach(function (e) {
      if (!e || e.status === "terminated") return;
      var due = reminderDue(e);
      if (due) {
        var line = due.kind === "clockout"
          ? "Clock out — your shift ended"
          : (due.phase === "end" ? "Clock back in from your " + (due.kind === "meal30" ? "30" : "10")
            : "Take your " + (due.kind === "meal30" ? "30-minute meal" : "10-minute break"));
        out.push({
          employeeId: e.id,
          name: e.name,
          kind: due.kind,
          phase: due.phase || "start",
          label: due.label,
          text: line
        });
        return;
      }
      var st = breakState(e);
      if (st.canEnd.break10a || st.canEnd.break10b) {
        var k = st.canEnd.break10a ? "break10a" : "break10b";
        out.push({
          employeeId: e.id,
          name: e.name,
          kind: k,
          phase: "end",
          label: BREAK_SHORT[k],
          text: "End your 10-minute break"
        });
        return;
      }
      var sh = scheduledShiftFor(e.id, todayYMD(), e.stationId);
      if (sh && !st.clockedIn && !st.inAt) {
        var start = laDateTime(todayYMD(), sh.start);
        if (start && now >= start.getTime()) {
          out.push({
            employeeId: e.id,
            name: e.name,
            kind: "clockin",
            phase: "start",
            label: "Clock in",
            text: "Clock in — your shift started"
          });
        }
      }
    });
    return out;
  }
  function startBreak(emp, station, kind, geo) {
    var employeeId = empIdOf(emp);
    kind = String(kind || "");
    if (BREAK_KINDS.indexOf(kind) === -1) return null;
    var stationId = assignedStation(employeeId, station);
    autoEndStaleBreaks(employeeId);
    var st = breakState(employeeId);
    if (!st.canStart[kind]) return null;
    var rec = {
      id: uid("br"),
      employeeId: employeeId,
      stationId: String(stationId || ""),
      locationName: locationLabel(stationId),
      date: todayYMD(),
      kind: kind,
      paid: kind !== "meal30",
      startAt: nowISO(),
      endAt: "",
      startGeo: normalizeGeo(geo)
    };
    state.breaks = state.breaks || [];
    state.breaks.push(rec);
    persist();
    if (kind === "meal30") closeClock(employeeId, geo);
    return rec;
  }
  function endBreak(emp, station, kind, geo) {
    var employeeId = empIdOf(emp);
    kind = String(kind || "");
    autoEndStaleBreaks(employeeId);
    var st = breakState(employeeId);
    if (!st.canEnd[kind]) {
      var existing = breaksFor({ employeeId: employeeId, date: todayYMD(), kind: kind })[0];
      return existing && existing.endAt ? existing : null;
    }
    var rec = st[kind] && st[kind].rec;
    if (!rec) return null;
    rec.endAt = nowISO();
    rec.endGeo = normalizeGeo(geo);
    persist();
    if (kind === "meal30" && !openClockAny(employeeId)) {
      openClock(employeeId, station, geo);
    }
    return rec;
  }
  function mealMs(employeeId, dateYmd) {
    var b = breaksFor({ employeeId: empIdOf(employeeId), date: dateYmd, kind: "meal30" })[0];
    if (!b || !b.startAt) return 0;
    var end = b.endAt ? new Date(b.endAt) : new Date();
    var ms = end - new Date(b.startAt);
    return ms > 0 ? ms : 0;
  }
  function displayClocks(employeeId, dateYmd, stationId) {
    employeeId = empIdOf(employeeId);
    dateYmd = dateYmd || todayYMD();
    var clocks = uniqueClocks(clocksFor({ employeeId: employeeId, date: dateYmd, stationId: stationId })).filter(function (c) {
      return c && c.inAt;
    }).slice().sort(function (a, b) { return new Date(a.inAt) - new Date(b.inAt); });
    var meal = breaksFor({ employeeId: employeeId, date: dateYmd, kind: "meal30" })[0];
    if (!meal || !meal.startAt) return clocks;
    var ms = new Date(meal.startAt).getTime();
    var me = meal.endAt ? new Date(meal.endAt).getTime() : 0;
    var out = [];
    clocks.forEach(function (c) {
      var start = new Date(c.inAt).getTime();
      var end = c.outAt ? new Date(c.outAt).getTime() : Date.now();
      if (ms > start && ms < end) {
        out.push({
          id: c.id + "_a",
          employeeId: c.employeeId,
          stationId: c.stationId,
          date: c.date,
          inAt: c.inAt,
          outAt: meal.startAt,
          hours: null,
          splitFrom: c.id
        });
        if (me && me >= ms) {
          out.push({
            id: c.id + "_b",
            employeeId: c.employeeId,
            stationId: c.stationId,
            date: c.date,
            inAt: meal.endAt,
            outAt: c.outAt || "",
            hours: null,
            splitFrom: c.id
          });
        }
      } else {
        out.push(c);
      }
    });
    return out;
  }
  function workedHours(employeeId, dateYmd, stationId) {
    employeeId = empIdOf(employeeId);
    dateYmd = dateYmd || todayYMD();
    autoEndStaleBreaks(employeeId, dateYmd);
    var clocks = displayClocks(employeeId, dateYmd, stationId);
    var raw = 0;
    clocks.forEach(function (c) { raw += clockHours(c); });
    if (raw < 0) raw = 0;
    return Math.round(raw * 100) / 100;
  }
  function punchLines(employeeId, dateYmd, stationId) {
    employeeId = empIdOf(employeeId);
    dateYmd = dateYmd || todayYMD();
    autoEndStaleBreaks(employeeId, dateYmd);
    var lines = [];
    uniqueClocks(clocksFor({ employeeId: employeeId, date: dateYmd, stationId: stationId })).forEach(function (c) {
      lines.push({
        kind: "shift",
        label: "Shift",
        text: formatLA(c.inAt) + (c.outAt ? " – " + formatLA(c.outAt) : " · in"),
        hours: clockHours(c),
        locationName: c.locationName || locationLabel(c.stationId),
        geo: c.inGeo || null
      });
    });
    BREAK_KINDS.forEach(function (k) {
      var b = breaksFor({ employeeId: employeeId, date: dateYmd, kind: k })[0];
      if (!b) return;
      var extra = k === "meal30" ? " · unpaid" : " · paid";
      var ms = 0;
      if (b.startAt) {
        ms = (b.endAt ? new Date(b.endAt) : new Date()) - new Date(b.startAt);
        if (ms < 0) ms = 0;
      }
      lines.push({
        kind: k,
        label: BREAK_SHORT[k],
        text: (b.startAt ? formatLA(b.startAt) : "") + (b.endAt ? " – " + formatLA(b.endAt) : " · open") + extra,
        hours: Math.round((ms / 3600000) * 100) / 100,
        locationName: b.locationName || locationLabel(b.stationId)
      });
    });
    return lines;
  }
  function splitDailyHours(hours, seventh) {
    hours = r2(hours);
    if (hours <= 0) {
      return { regular: 0, overtime: 0, doubleTime: 0, total: 0, seventh: false };
    }
    if (seventh) {
      return {
        regular: 0,
        overtime: r2(Math.min(hours, 8)),
        doubleTime: r2(Math.max(hours - 8, 0)),
        total: hours,
        seventh: true
      };
    }
    return {
      regular: r2(Math.min(hours, 8)),
      overtime: r2(Math.min(Math.max(hours - 8, 0), 4)),
      doubleTime: r2(Math.max(hours - 12, 0)),
      total: hours,
      seventh: false
    };
  }
  function seventhConsecutive(employeeId, dateYmd, stationId) {
    employeeId = empIdOf(employeeId);
    dateYmd = dateYmd || todayYMD();
    var dates = weekDates(weekStartMonday(dateYmd));
    var streak = 0;
    for (var i = 0; i < dates.length; i++) {
      if (workedHours(employeeId, dates[i], stationId) > 0) streak += 1;
      else streak = 0;
      if (dates[i] === dateYmd) return streak >= 7;
    }
    return false;
  }
  function paySplit(empId, dateYmd, stationId) {
    var hours = workedHours(empId, dateYmd, stationId);
    return splitDailyHours(hours, hours > 0 && seventhConsecutive(empId, dateYmd, stationId));
  }
  function paySplitRange(empId, startYmd, endYmd, stationId) {
    var dates = datesInRange(startYmd, endYmd);
    var acc = { regular: 0, overtime: 0, doubleTime: 0, total: 0, days: [] };
    dates.forEach(function (d) {
      var s = paySplit(empId, d, stationId);
      acc.regular += s.regular;
      acc.overtime += s.overtime;
      acc.doubleTime += s.doubleTime;
      acc.total += s.total;
      if (s.total > 0) acc.days.push({ date: d, regular: s.regular, overtime: s.overtime, doubleTime: s.doubleTime, total: s.total, seventh: s.seventh });
    });
    acc.regular = r2(acc.regular);
    acc.overtime = r2(acc.overtime);
    acc.doubleTime = r2(acc.doubleTime);
    acc.total = r2(acc.total);
    return acc;
  }

  function isOvernightShift(sh) {
    if (!sh || !sh.start || !sh.end) return false;
    return String(sh.end) < String(sh.start);
  }
  function scheduledShiftFor(employeeId, dateYmd, stationId) {
    employeeId = empIdOf(employeeId);
    dateYmd = dateYmd || todayYMD();
    var e = employeeById(employeeId);
    stationId = stationId || (e && e.stationId) || "";
    var today = shiftsFor(stationId, dateYmd, employeeId)[0];
    if (today && (today.start || today.end)) return today;
    var prev = shiftsFor(stationId, addDays(dateYmd, -1), employeeId)[0];
    if (prev && isOvernightShift(prev)) return prev;
    return null;
  }
  function shiftEndDate(sh) {
    if (!sh || !sh.end) return null;
    var endDay = isOvernightShift(sh) ? addDays(sh.date, 1) : sh.date;
    return laDateTime(endDay, sh.end);
  }
  function openClockAny(employeeId) {
    employeeId = empIdOf(employeeId);
    var list = (state && state.clocks) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].employeeId === employeeId && list[i].inAt && !list[i].outAt) return list[i];
    }
    return null;
  }
  function approvedClockPermit(employeeId, dateYmd, stationId) {
    employeeId = empIdOf(employeeId);
    dateYmd = dateYmd || todayYMD();
    return ((state && state.clockPermits) || []).some(function (p) {
      if (!p || p.status !== "approved") return false;
      if (p.employeeId !== employeeId) return false;
      if (stationId && !sameStation(p.stationId, stationId)) return false;
      var start = p.date || p.start;
      var end = p.end || start;
      return dateYmd >= start && dateYmd <= end;
    });
  }
  function pendingClockPermit(employeeId, dateYmd, stationId) {
    employeeId = empIdOf(employeeId);
    dateYmd = dateYmd || todayYMD();
    var list = (state && state.clockPermits) || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || p.status !== "pending") continue;
      if (p.employeeId !== employeeId) continue;
      if (stationId && !sameStation(p.stationId, stationId)) continue;
      if ((p.date || p.start) === dateYmd) return p;
    }
    return null;
  }
  function canClockIn(employeeId, stationId, dateYmd) {
    employeeId = empIdOf(employeeId);
    dateYmd = dateYmd || todayYMD();
    var e = employeeById(employeeId);
    stationId = assignedStation(employeeId, stationId);
    if (isManagerEmployee(e)) return { ok: true, reason: "manager" };
    if (isTimeOff(employeeId, stationId, dateYmd)) {
      return { ok: false, reason: "timeoff", message: "You are off today. Ask Rachel if you need to work." };
    }
    if (scheduledShiftFor(employeeId, dateYmd, stationId)) return { ok: true, reason: "scheduled" };
    if (approvedClockPermit(employeeId, dateYmd, stationId)) return { ok: true, reason: "permit" };
    return { ok: false, reason: "unscheduled", message: "Not scheduled today. Ask Rachel to clock in." };
  }
  function requestClockPermit(employeeId, stationId, dateYmd, reason) {
    var e = employeeById(employeeId);
    if (!e || e.status === "terminated") {
      return { ok: false, error: "Terminated employees cannot request a clock-in." };
    }
    dateYmd = String(dateYmd || todayYMD()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return { ok: false, error: "Pick a date." };
    var pending = pendingClockPermit(employeeId, dateYmd, stationId);
    if (pending) return { ok: true, request: pending, already: true };
    if (!state.clockPermits) state.clockPermits = [];
    var rec = {
      id: uid("cp"),
      employeeId: employeeId,
      stationId: String(stationId || e.stationId || ""),
      date: dateYmd,
      reason: String(reason || "").trim(),
      status: "pending",
      createdAt: nowISO(),
      decidedAt: "",
      decidedBy: ""
    };
    state.clockPermits.push(rec);
    persist();
    return { ok: true, request: rec };
  }
  function clockPermitById(id) {
    var list = (state && state.clockPermits) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function listClockPermits(opts) {
    opts = opts || {};
    return ((state && state.clockPermits) || []).filter(function (r) {
      if (!r) return false;
      if (opts.employeeId && r.employeeId !== opts.employeeId) return false;
      if (opts.stationId && !sameStation(r.stationId, opts.stationId)) return false;
      if (opts.status && r.status !== opts.status) return false;
      return true;
    });
  }
  function approveClockPermit(id, decidedBy) {
    var rec = clockPermitById(id);
    if (!rec) return { ok: false, error: "Request not found." };
    if (rec.status !== "pending") return { ok: false, error: "This request is already decided." };
    rec.status = "approved";
    rec.decidedAt = nowISO();
    rec.decidedBy = String(decidedBy || "");
    persist();
    return { ok: true, request: rec };
  }
  function denyClockPermit(id, decidedBy) {
    var rec = clockPermitById(id);
    if (!rec) return { ok: false, error: "Request not found." };
    if (rec.status !== "pending") return { ok: false, error: "This request is already decided." };
    rec.status = "denied";
    rec.decidedAt = nowISO();
    rec.decidedBy = String(decidedBy || "");
    persist();
    return { ok: true, request: rec };
  }
  function closeClockAtScheduled(rec) {
    if (!rec || !rec.inAt || rec.outAt) return false;
    var sh = scheduledShiftFor(rec.employeeId, rec.date, rec.stationId);
    if (!sh) return false;
    var end = shiftEndDate(sh);
    if (!end) return false;
    rec.outAt = end.toISOString();
    rec.autoOut = true;
    rec.autoOutReason = "scheduled";
    var ms = end.getTime() - new Date(rec.inAt).getTime();
    rec.hours = r2(ms > 0 ? ms / 3600000 : 0);
    return true;
  }
  function autoCloseOverdueClocks() {
    if (!state || !state.clocks) return 0;
    var now = Date.now();
    var n = 0;
    state.clocks.forEach(function (c) {
      if (!c || !c.inAt || c.outAt) return;
      var sh = scheduledShiftFor(c.employeeId, c.date, c.stationId);
      if (sh) {
        var end = shiftEndDate(sh);
        if (!end) return;
        if (now >= end.getTime() + 10 * 60 * 1000) {
          if (closeClockAtScheduled(c)) n++;
        }
        return;
      }
      if (c.date && c.date < todayYMD()) {
        var stored = Number(c.hours);
        if (!isNaN(stored) && stored > 0) {
          c.outAt = new Date(new Date(c.inAt).getTime() + stored * 3600000).toISOString();
          c.autoOut = true;
          c.autoOutReason = "hours";
        } else {
          c.outAt = c.inAt;
          c.hours = 0;
          c.autoOut = true;
          c.autoOutReason = "orphan";
        }
        n++;
      }
    });
    if (n) persist();
    return n;
  }
  function clockOutStatus(emp) {
    var employeeId = empIdOf(emp);
    autoCloseOverdueClocks();
    var open = openClockAny(employeeId);
    if (!open) return null;
    var sh = scheduledShiftFor(employeeId, open.date, open.stationId);
    if (!sh) return { phase: "open", open: open, shift: null, endAt: 0 };
    var end = shiftEndDate(sh);
    var endMs = end ? end.getTime() : 0;
    var now = Date.now();
    if (endMs && now >= endMs + 10 * 60 * 1000) return { phase: "auto", open: open, shift: sh, endAt: endMs };
    if (endMs && now >= endMs) return { phase: "remind", open: open, shift: sh, endAt: endMs };
    return { phase: "working", open: open, shift: sh, endAt: endMs };
  }

  function applyPunch(employeeId, stationId, action, geo) {
    employeeId = empIdOf(employeeId);
    stationId = assignedStation(employeeId, stationId);
    autoCloseOverdueClocks();
    autoEndStaleBreaks(employeeId);
    var st = breakState(employeeId);
    if (action === "in") {
      if (st.canEnd.meal30) {
        var back = endBreak(employeeId, stationId, "meal30", geo);
        return { ok: !!back, message: back ? "Clocked in from meal" : "Could not clock in from meal.", record: back };
      }
      if (st.clockedIn) return { ok: false, message: "Already clocked in.", record: st.openClock };
      var gate = canClockIn(employeeId, stationId);
      if (!gate.ok) {
        return { ok: false, needsPermit: true, message: gate.message, record: null };
      }
      var here = geoAtStore(stationId, geo);
      if (geo && geo.requireFence && !here.ok) {
        return { ok: false, reason: here.reason, message: here.message, record: null };
      }
      var recIn = openClock(employeeId, stationId, geo);
      return { ok: !!recIn, message: recIn ? "Clocked in" : "Could not clock in.", record: recIn };
    }
    if (action === "out") {
      if (!st.clockedIn) return { ok: false, message: "Not clocked in.", record: null };
      if (st.openBreak) endBreak(employeeId, stationId, st.openBreak);
      var recOut = closeClock(employeeId, geo);
      return { ok: !!recOut, message: recOut ? "Clocked out" : "Could not clock out.", record: recOut };
    }
    var m = String(action || "").match(/^(start|end)-(break10a|meal30|break10b)$/);
    if (!m) return { ok: false, message: "Unknown action.", record: null };
    var recBr = m[1] === "start"
      ? startBreak(employeeId, stationId, m[2], geo)
      : endBreak(employeeId, stationId, m[2], geo);
    if (!recBr) {
      var why = "Cannot do that yet.";
      if (m[1] === "start" && !st.canStart[m[2]]) {
        if (m[2] === "meal30") why = "The first 10-minute break is offered first.";
        else if (m[2] === "break10b") why = "The meal break comes first.";
        else why = "Clock in to start a break.";
      }
      return { ok: false, message: why, record: null };
    }
    return { ok: true, message: BREAK_SHORT[m[2]] + (m[1] === "start" ? " started" : " ended"), record: recBr };
  }

  function loginEmployee(name, secret) {
    var first = firstNameOf(name);
    var sec = normPass(secret);
    var list = (state && state.employees) || [];
    return hashClockPass(first, sec).then(function (h) {
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (e.status === "terminated") continue;
        if (firstNameOf(e.name) === first && e.clockPassHash && e.clockPassHash === h) return e;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(sec) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(sec)) {
        return hashIdentity(name, secret).then(function (dh) {
          for (var j = 0; j < list.length; j++) {
            var e2 = list[j];
            if (e2.status === "terminated") continue;
            if (normName(e2.name) === normName(name) && e2.dobHash === dh) return e2;
          }
          return null;
        });
      }
      return null;
    });
  }

  /* IndexedDB photos */
  function idb() {
    return new Promise(function (resolve, reject) {
      if (!w.indexedDB) { reject(new Error("No IndexedDB")); return; }
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: "id" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function savePhoto(id, blob) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        var store = tx.objectStore(IDB_STORE);
        store.put({ id: id, blob: blob, at: Date.now() });
        tx.oncomplete = function () {
          capPhotos(db).then(function () { resolve(id); }).catch(function () { resolve(id); });
        };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function getPhoto(id) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readonly");
        var req = tx.objectStore(IDB_STORE).get(id);
        req.onsuccess = function () { resolve(req.result ? req.result.blob : null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function capPhotos(db) {
    return new Promise(function (resolve) {
      var tx = db.transaction(IDB_STORE, "readwrite");
      var store = tx.objectStore(IDB_STORE);
      var req = store.getAll();
      req.onsuccess = function () {
        var rows = req.result || [];
        if (rows.length <= PHOTO_CAP) { resolve(); return; }
        rows.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
        var extra = rows.length - PHOTO_CAP;
        for (var i = 0; i < extra; i++) store.delete(rows[i].id);
        tx.oncomplete = function () { resolve(); };
      };
      req.onerror = function () { resolve(); };
    });
  }
  function compressImage(file, maxEdge) {
    maxEdge = maxEdge || 1280;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        var scale = Math.min(1, maxEdge / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        if (c.toBlob) {
          c.toBlob(function (blob) {
            if (!blob) { reject(new Error("compress")); return; }
            resolve(blob);
          }, "image/jpeg", 0.82);
        } else {
          try {
            var data = c.toDataURL("image/jpeg", 0.82);
            var arr = data.split(","), bstr = atob(arr[1]);
            var u8 = new Uint8Array(bstr.length);
            for (var i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
            resolve(new Blob([u8], { type: "image/jpeg" }));
          } catch (e) { reject(e); }
        }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("image")); };
      img.src = url;
    });
  }

  function catalogSectionOf(a) {
    if (!a) return "Other";
    var rec = a.catalogId ? catalogById(a.catalogId) : null;
    if (rec && rec.section) return rec.section;
    if (a.section) return a.section;
    return "Other";
  }
  function catalogSectionOrder() {
    var seen = {};
    var out = [];
    catalog().forEach(function (t) {
      var sec = t.section || "Other";
      if (!seen[sec]) { seen[sec] = true; out.push(sec); }
    });
    if (!seen.Other) out.push("Other");
    return out;
  }
  function groupAssignmentsBySection(list) {
    var order = catalogSectionOrder();
    var map = {};
    (list || []).forEach(function (a) {
      var sec = catalogSectionOf(a);
      if (!map[sec]) map[sec] = [];
      map[sec].push(a);
    });
    var groups = [];
    order.forEach(function (sec) {
      if (map[sec] && map[sec].length) groups.push({ section: sec, items: map[sec] });
    });
    Object.keys(map).forEach(function (sec) {
      if (order.indexOf(sec) === -1 && map[sec].length) groups.push({ section: sec, items: map[sec] });
    });
    return groups;
  }
  function assignmentTaskHtml(a, dateYmd, opts) {
    opts = opts || {};
    var done = isDoneToday(a.id, dateYmd);
    var html = '<div class="task' + (done ? " is-done" : (opts.readonly ? "" : " is-open")) + '">';
    html += "<div><b>" + esc(a.title) + "</b>";
    if (a.requiresPhoto) html += ' <span class="chip">' + esc(opts.photoLabel || "Photo") + "</span>";
    html += "</div>";
    if (done) {
      html += '<div class="done">Done \u00b7 ' + esc(formatLA(done.doneAt)) + "</div>";
    } else if (!opts.readonly) {
      if (a.requiresPhoto) {
        html += '<input type="file" accept="image/*" capture="environment" data-file="' + a.id + '">';
        html += '<div class="preview" data-pv="' + a.id + '"></div>';
      }
      html += '<button type="button" class="cyan" data-done="' + a.id + '">Mark done</button>';
    }
    html += "</div>";
    return html;
  }
  function cheatSheetTasksHtml(stationId, employeeId, dateYmd, opts) {
    opts = opts || {};
    dateYmd = dateYmd || todayYMD();
    ensureLiveCheatSheet(stationId, dateYmd);
    var todayAsg = ((state && state.assignments) || []).filter(function (a) {
      if (stationId && !sameStation(a.stationId, stationId)) return false;
      if (employeeId && a.employeeId !== employeeId) return false;
      if (!a.date) return true;
      return a.date === dateYmd;
    });
    var monday = weekStartMonday(dateYmd);
    var dates = weekDates(monday);
    var html = "";
    if (!opts.hideHeading) html += "<h3>Today\u2019s cheat sheet</h3>";
    var prog = { total: todayAsg.length, done: 0, left: 0 };
    todayAsg.forEach(function (a) { if (isDoneToday(a.id, dateYmd)) prog.done += 1; });
    prog.left = prog.total - prog.done;
    html += taskBarHtml(prog, { size: opts.size || "lg" });
    if (!todayAsg.length) {
      html += '<p class="lead mut">No cheat-sheet tasks for this shift.</p>';
    } else {
      groupAssignmentsBySection(todayAsg).forEach(function (g) {
        html += '<div class="cs-sec"><h4 class="cs-sec-h">' + esc(g.section) + "</h4>";
        g.items.forEach(function (a) {
          html += assignmentTaskHtml(a, dateYmd, { photoLabel: opts.photoLabel, readonly: false });
        });
        html += "</div>";
      });
    }
    var weekDays = [];
    dates.forEach(function (d) {
      if (d <= dateYmd) return;
      var dayList = ((state && state.assignments) || []).filter(function (a) {
        if (stationId && !sameStation(a.stationId, stationId)) return false;
        if (employeeId && a.employeeId !== employeeId) return false;
        return a.date === d;
      });
      if (dayList.length) weekDays.push({ date: d, items: dayList });
    });
    if (weekDays.length) {
      html += '<div class="cs-week"><h3>This week</h3>';
      weekDays.forEach(function (day) {
        html += '<div class="cs-day"><div class="cs-day-h">' + esc(formatYMD(day.date)) + "</div>";
        groupAssignmentsBySection(day.items).forEach(function (g) {
          html += '<div class="cs-sec"><h4 class="cs-sec-h">' + esc(g.section) + "</h4>";
          g.items.forEach(function (a) {
            html += assignmentTaskHtml(a, day.date, { readonly: true, photoLabel: opts.photoLabel });
          });
        });
        html += "</div>";
      });
      html += "</div>";
    }
    return html;
  }

  function taskProgress(stationId, employeeId, dateYmd) {
    dateYmd = dateYmd || todayYMD();
    var asg = assignmentsForDay(stationId, employeeId, dateYmd);
    var done = 0;
    asg.forEach(function (a) {
      if (isDoneToday(a.id, dateYmd)) done += 1;
    });
    return { total: asg.length, done: done, left: asg.length - done };
  }
  function taskBarHtml(prog, opts) {
    opts = opts || {};
    prog = prog || { total: 0, done: 0, left: 0 };
    var all = prog.total > 0 && prog.done === prog.total;
    var none = !prog.total;
    var cls = "tbar" + (all ? " tbar-all" : "") + (none ? " tbar-none" : "") + (opts.size === "lg" ? " tbar-lg" : "");
    var lab = none ? "No tasks this shift" : (all ? "All done" : (prog.done + " of " + prog.total + " done"));
    var html = '<div class="' + cls + '" role="img" aria-label="' + esc(lab) + '">';
    html += '<div class="tbar-track">';
    if (none) {
      html += '<span class="tbar-seg empty"></span>';
    } else {
      for (var i = 0; i < prog.total; i++) {
        html += '<span class="tbar-seg' + (i < prog.done ? " on" : "") + '"></span>';
      }
    }
    html += "</div>";
    if (!opts.hideLabel) html += '<div class="tbar-lab">' + esc(lab) + "</div>";
    html += "</div>";
    return html;
  }

  function reminderText(emp, unfinished) {
    var titles = (unfinished || []).map(function (t) { return t.title; }).slice(0, 8);
    var more = unfinished.length > 8 ? " +" + (unfinished.length - 8) + " more" : "";
    return "Hi " + (emp && emp.name || "there") +
      ", you have " + unfinished.length + " CORE task" + (unfinished.length === 1 ? "" : "s") +
      " left today" + (titles.length ? ": " + titles.join("; ") + more : ".") +
      " Finish them and attach a photo where required.";
  }

  w.SSCore = {
    ready: ready,
    DAYS: DAYS,
    FIRST_LOCATION: FIRST_LOCATION,
    TZ: TZ,
    hashIdentity: hashIdentity,
    hashClockPass: hashClockPass,
    firstNameOf: firstNameOf,
    normName: normName,
    squeezeName: squeezeName,
    uid: uid,
    esc: esc,
    todayYMD: todayYMD,
    weekdayIndex: weekdayIndex,
    weekStartMonday: weekStartMonday,
    addDays: addDays,
    addMonths: addMonths,
    addYears: addYears,
    hiredYmd: hiredYmd,
    tenureYears: tenureYears,
    tenureParts: tenureParts,
    formatTenure: formatTenure,
    timesheetStartYmd: timesheetStartYmd,
    anniversaryYear: anniversaryYear,
    anniversaryMd: anniversaryMd,
    isAnniversaryOn: isAnniversaryOn,
    isAnniversaryToday: isAnniversaryToday,
    nextAnniversaryYmd: nextAnniversaryYmd,
    anniversarySoon: anniversarySoon,
    ordinal: ordinal,
    monthStart: monthStart,
    monthEnd: monthEnd,
    datesInRange: datesInRange,
    payPeriodOf: payPeriodOf,
    payPeriodShift: payPeriodShift,
    weekDates: weekDates,
    formatLA: formatLA,
    formatYMD: formatYMD,
    formatMonth: formatMonth,
    hoursBetween: hoursBetween,
    fmtTime: fmtTime,
    nowISO: nowISO,
    getState: getState,
    persist: persist,
    catalog: catalog,
    catalogById: catalogById,
    locationLabel: locationLabel,
    setLocationLabel: setLocationLabel,
    employees: employees,
    employeeById: employeeById,
    addEmployee: addEmployee,
    updateEmployee: updateEmployee,
    terminateEmployee: terminateEmployee,
    restoreEmployee: restoreEmployee,
    roles: roles,
    addRole: addRole,
    removeRole: removeRole,
    roleName: roleName,
    shiftsFor: shiftsFor,
    upsertShift: upsertShift,
    shiftBand: shiftBand,
    isShiftLeader: isShiftLeader,
    setShiftLeader: setShiftLeader,
    copyWeekShifts: copyWeekShifts,
    hoursForRange: hoursForRange,
    timeOffFor: timeOffFor,
    isTimeOff: isTimeOff,
    addTimeOff: addTimeOff,
    removeTimeOff: removeTimeOff,
    requestTimeOff: requestTimeOff,
    listRequests: listRequests,
    approveTimeOffRequest: approveTimeOffRequest,
    denyTimeOffRequest: denyTimeOffRequest,
    scheduledShiftFor: scheduledShiftFor,
    shiftEndDate: shiftEndDate,
    canClockIn: canClockIn,
    requestClockPermit: requestClockPermit,
    listClockPermits: listClockPermits,
    approveClockPermit: approveClockPermit,
    denyClockPermit: denyClockPermit,
    pendingClockPermit: pendingClockPermit,
    autoCloseOverdueClocks: autoCloseOverdueClocks,
    clockOutStatus: clockOutStatus,
    availabilityFor: availabilityFor,
    setAvailability: setAvailability,
    assignments: assignments,
    assignmentsForDay: assignmentsForDay,
    addAssignment: addAssignment,
    updateAssignment: updateAssignment,
    reassignAssignment: reassignAssignment,
    removeAssignment: removeAssignment,
    catalog: catalog,
    catalogById: catalogById,
    catalogSectionOrder: catalogSectionOrder,
    setCheatSheetManual: setCheatSheetManual,
    assignCheatSheetToEmployee: assignCheatSheetToEmployee,
    weekCheatSheetAssignments: weekCheatSheetAssignments,
    splitCheatSheetWeek: splitCheatSheetWeek,
    ensureLiveCheatSheet: ensureLiveCheatSheet,
    cheatSheetTasksHtml: cheatSheetTasksHtml,
    groupAssignmentsBySection: groupAssignmentsBySection,
    completionsFor: completionsFor,
    isDoneToday: isDoneToday,
    markDone: markDone,
    undoDone: undoDone,
    clocksFor: clocksFor,
    uniqueClocks: uniqueClocks,
    displayClocks: displayClocks,
    clockHours: clockHours,
    clocksForRange: clocksForRange,
    openClock: openClock,
    closeClock: closeClock,
    addClock: addClock,
    upsertClock: upsertClock,
    updateClock: updateClock,
    upsertBreak: upsertBreak,
    laHHmm: laHHmm,
    clockHours: clockHours,
    BREAK_KINDS: BREAK_KINDS,
    BREAK_LABELS: BREAK_LABELS,
    BREAK_SHORT: BREAK_SHORT,
    requestGeo: requestGeo,
    geoAtStore: geoAtStore,
    CLOCK_RADIUS_FEET: CLOCK_RADIUS_FEET,
    laDateTime: laDateTime,
    formatLATime: formatLATime,
    shiftAnchorMs: shiftAnchorMs,
    breaksFor: breaksFor,
    skipReminder: skipReminder,
    reminderSkipped: reminderSkipped,
    reminderTimes: reminderTimes,
    breakState: breakState,
    reminderDue: reminderDue,
    storeDueNotices: storeDueNotices,
    startBreak: startBreak,
    endBreak: endBreak,
    workedHours: workedHours,
    punchLines: punchLines,
    paySplit: paySplit,
    paySplitRange: paySplitRange,
    applyPunch: applyPunch,
    loginEmployee: loginEmployee,
    sameStation: sameStation,
    isManagerEmployee: isManagerEmployee,
    grantManagerSession: grantManagerSession,
    clearManagerSession: clearManagerSession,
    savePhoto: savePhoto,
    getPhoto: getPhoto,
    compressImage: compressImage,
    reminderText: reminderText,
    taskProgress: taskProgress,
    taskBarHtml: taskBarHtml
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
