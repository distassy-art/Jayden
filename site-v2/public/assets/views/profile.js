/*
 * Profiles.
 *
 * Everyone gets one: a photo, a first and last name, a date of birth and an
 * address. The username is shown but never editable — it is the handle other
 * things key off. The password can be changed only where we actually hold it:
 * an employee's PIN and an accountant's password live on-device, so those change
 * for real; the admin/owner/manager console logins are managed upstream, so the
 * field explains that rather than pretending.
 *
 * One card, two mounts: the console page (the signed-in site user) and the phone
 * app (the employee on the device, or the manager).
 */

import { esc, icon, initials, toast } from "../ui.js";
import { isAccountant, isAdmin } from "../data.js";
import {
  activeEmployeeId, getEmployee, getProfile, setProfile, updateAccountant, updateEmployee,
} from "../appstore.js";
import { capturePhoto } from "../camera.js";

/* -------------------------------------------------------------------------
   Who the profile is for
   ------------------------------------------------------------------------- */

function siteSubject(user) {
  const email = String(user?.email || "");
  const role = isAdmin(user) ? "admin" : (user?.role === "manager" ? "manager" : "owner");
  return {
    kind: "site",
    key: `user:${email.toLowerCase()}`,
    username: email,
    display: user?.client || email,
    role,
    canPassword: false,
    passwordNote: "Console passwords (admin, owner, manager) are managed by Smart Solutions. "
      + "Ask us to change yours — it can't be reset from here.",
  };
}

function accountantSubject(user) {
  return {
    kind: "accountant",
    key: `acct:${user?.accountantId || "default"}`,
    id: user?.accountantId || "default",
    username: user?.email || "accountant",
    display: user?.client || "Payroll Accountant",
    role: "accountant",
    canPassword: true,
  };
}

function employeeSubject(employee) {
  return {
    kind: "employee",
    key: `emp:${employee.id}`,
    id: employee.id,
    username: employee.username || "",
    display: employee.name,
    role: "employee",
    canPassword: true,
    passwordLabel: "PIN / password",
  };
}

function consoleSubject(ctx) {
  return isAccountant(ctx.user) ? accountantSubject(ctx.user) : siteSubject(ctx.user);
}

/* -------------------------------------------------------------------------
   The card (shared by console and app)
   ------------------------------------------------------------------------- */

function photoBlock(subject, profile) {
  const inner = profile?.photo
    ? `<img class="profile-photo" src="${esc(profile.photo)}" alt="${esc(subject.display)}">`
    : `<span class="profile-avatar">${esc(initials(subject.display))}</span>`;
  return `<div class="profile-photo-row">
    <div class="profile-photo-wrap">${inner}</div>
    <div class="profile-photo-actions">
      <button class="app-btn" data-prof="photo">${icon("camera")} ${profile?.photo ? "Change photo" : "Add photo"}</button>
      ${profile?.photo ? `<button class="app-btn ghost" data-prof="photo-remove">${icon("close")} Remove</button>` : ""}
    </div>
  </div>`;
}

export function renderProfileCard(subject, profile) {
  const p = profile || {};
  const pwLabel = subject.passwordLabel || "New password";
  const password = subject.canPassword
    ? `<div class="app-card">
        <div class="app-card-head"><h3>Password</h3></div>
        <div class="app-card-body">
          <div class="app-grid-2">
            <label class="app-field"><span>${esc(pwLabel)}</span>
              <input class="app-input" type="password" id="prof-pw1" autocomplete="new-password" placeholder="Leave blank to keep"></label>
            <label class="app-field"><span>Confirm</span>
              <input class="app-input" type="password" id="prof-pw2" autocomplete="new-password" placeholder="Repeat it"></label>
          </div>
          <button class="app-btn primary" data-prof="password">${icon("check")} Change password</button>
        </div>
      </div>`
    : `<div class="app-card">
        <div class="app-card-head"><h3>Password</h3></div>
        <div class="app-card-body"><div class="geo-note warn" style="margin:0">${icon("alert")} ${esc(subject.passwordNote || "")}</div></div>
      </div>`;

  return `<div class="app-card">
    <div class="app-card-head"><h3>Profile</h3><span class="hint">${esc(subject.display)}</span></div>
    <div class="app-card-body">
      ${photoBlock(subject, p)}
      <div class="app-grid-2">
        <label class="app-field"><span>First name</span>
          <input class="app-input" id="prof-first" value="${esc(p.firstName || "")}" placeholder="First name"></label>
        <label class="app-field"><span>Last name</span>
          <input class="app-input" id="prof-last" value="${esc(p.lastName || "")}" placeholder="Last name"></label>
      </div>
      <label class="app-field"><span>Date of birth</span>
        <input class="app-input" type="date" id="prof-dob" value="${esc(p.dob || "")}"></label>
      <label class="app-field"><span>Address</span>
        <textarea class="app-input" id="prof-address" rows="2" placeholder="Street, city, state, ZIP">${esc(p.address || "")}</textarea></label>
      <label class="app-field"><span>Username</span>
        <input class="app-input" value="${esc(subject.username)}" readonly disabled>
        <small class="app-hint">Your username can't be changed.</small></label>
      <button class="app-btn primary" data-prof="save">${icon("check")} Save profile</button>
    </div>
  </div>
  ${password}`;
}

/* Wire one card. `redraw` repaints after a photo or save so the new state shows. */
export async function bindProfileCard(root, subject, redraw) {
  root.querySelector('[data-prof="photo"]')?.addEventListener("click", async () => {
    try {
      const photo = await capturePhoto();
      if (!photo) return;
      await setProfile(subject.key, { photo });
      toast("Photo saved", "ok");
      redraw?.();
    } catch (err) {
      toast(err.message || "Could not capture a photo", "warn");
    }
  });

  root.querySelector('[data-prof="photo-remove"]')?.addEventListener("click", async () => {
    await setProfile(subject.key, { photo: null });
    toast("Photo removed");
    redraw?.();
  });

  root.querySelector('[data-prof="save"]')?.addEventListener("click", async () => {
    const val = (id) => root.querySelector(`#${id}`)?.value.trim() || "";
    await setProfile(subject.key, {
      firstName: val("prof-first"),
      lastName: val("prof-last"),
      dob: val("prof-dob"),
      address: val("prof-address"),
    });
    toast("Profile saved", "ok");
    redraw?.();
  });

  root.querySelector('[data-prof="password"]')?.addEventListener("click", async () => {
    const pw1 = root.querySelector("#prof-pw1")?.value || "";
    const pw2 = root.querySelector("#prof-pw2")?.value || "";
    if (!pw1) { toast("Enter a new password", "warn"); return; }
    if (pw1 !== pw2) { toast("The two passwords don't match", "warn"); return; }
    if (subject.kind === "employee") {
      await updateEmployee(subject.id, { password: pw1, pin: pw1 });
    } else if (subject.kind === "accountant") {
      await updateAccountant(subject.id, { password: pw1 });
    }
    toast("Password changed", "ok");
    redraw?.();
  });
}

/* -------------------------------------------------------------------------
   Console mount (the signed-in site user or accountant)
   ------------------------------------------------------------------------- */

export function renderProfile(ctx) {
  return `<div class="page-head">
      <h2>Profile</h2>
      <p>Your photo, name, date of birth and address. Your username is fixed; your password
        can be changed where Smart Solutions doesn't manage it for you.</p>
    </div>
    <div class="app-embed" id="profile-body" style="max-width:600px"></div>`;
}

export async function bindProfile(root, ctx) {
  const body = root.querySelector("#profile-body");
  if (!body) return;
  const subject = consoleSubject(ctx);
  const draw = () => {
    body.innerHTML = renderProfileCard(subject, getProfile(subject.key));
    bindProfileCard(body, subject, draw);
  };
  draw();
}

/* -------------------------------------------------------------------------
   App mount (the employee on the device, else the manager)
   ------------------------------------------------------------------------- */

export function renderAppProfile(ctx) {
  return `<div id="profile-body"></div>`;
}

export async function bindAppProfile(root, ctx) {
  const body = root.querySelector("#profile-body");
  if (!body) return;
  const empId = activeEmployeeId();
  const employee = empId ? await getEmployee(empId) : null;
  const subject = employee && employee.active !== false
    ? employeeSubject(employee)
    : consoleSubject(ctx);
  const draw = () => {
    body.innerHTML = renderProfileCard(subject, getProfile(subject.key));
    bindProfileCard(body, subject, draw);
  };
  draw();
}
