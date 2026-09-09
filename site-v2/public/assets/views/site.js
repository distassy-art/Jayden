/*
 * The public site: what Smart Solutions does, and the one way in.
 *
 * The live site has three separate sign-in surfaces — a panel on the home page,
 * a second grey "Admin" box hidden in the footer, and portal.html — which is
 * why people end up at the wrong one. There is a single form here; the account
 * decides where you land.
 */

import { esc, icon } from "../ui.js";

const NAV = [
  { path: "/", label: "Home" },
  { path: "/about", label: "About" },
  { path: "/how", label: "How it works" },
  { path: "/employee", label: "Employees" },
  { path: "/contact", label: "Contact" },
];

function header(active) {
  return `<header class="site-top">
    <a class="site-brand" href="#/">
      <img src="/assets/logo-wordmark-light.png"
        srcset="/assets/logo-wordmark-light.png 1x, /assets/logo-wordmark-light@2x.png 2x"
        alt="Smart Solutions AI" width="190">
    </a>
    <nav class="site-nav">
      ${NAV.map((item) => `<a href="#${esc(item.path)}"${item.path === active ? ' class="is-active"' : ""}>${esc(item.label)}</a>`).join("")}
    </nav>
    <a class="btn btn-accent btn-sm" href="#/login">Log in</a>
    <button class="btn btn-icon btn-ghost site-burger" id="siteBurger" aria-label="Menu">${icon("menu")}</button>
  </header>`;
}

function footer() {
  return `<footer class="site-foot">
    <div class="site-foot-inner">
      <div>
        <img src="/assets/logo-wordmark-light.png" alt="Smart Solutions AI" width="164">
        <p>Controlling your store got easier with AI.</p>
      </div>
      <nav>
        <b>Site</b>
        ${NAV.map((item) => `<a href="#${esc(item.path)}">${esc(item.label)}</a>`).join("")}
      </nav>
      <nav>
        <b>Access</b>
        <a href="#/login">Owner and manager log in</a>
        <a href="#/employee">Employee</a>
        <a href="#/get-app">Get the app</a>
      </nav>
      <nav>
        <b>Contact</b>
        <a href="#/contact">Talk to our team</a>
        <a href="#/ask">Ask a question</a>
      </nav>
    </div>
    <div class="site-foot-legal">
      <span>© ${new Date().getFullYear()} Smart Solutions AI</span>
      <span>Figures shown to clients are their own. Nothing is shared between clients.</span>
    </div>
  </footer>`;
}

/** Wrap page content in the public chrome. */
function page(active, body, { wide = false } = {}) {
  return `<div class="site">
    ${header(active)}
    <main class="site-main${wide ? " is-wide" : ""}">${body}</main>
    ${footer()}
  </div>`;
}

/* -------------------------------------------------------------------------
   Home
   ------------------------------------------------------------------------- */

const PILLARS = [
  {
    icon: "calendar",
    title: "See the day, every day",
    body: "Sales, purchases, waste and loss for every store, closed daily rather than "
      + "discovered in a month-end statement.",
  },
  {
    icon: "orders",
    title: "Buy to what sold",
    body: "Orders are drafted from the last two weeks of movement, not from habit. "
      + "The buy follows the sale instead of leading it.",
  },
  {
    icon: "profit",
    title: "Keep more of the sale",
    body: "When buying stops outrunning sales, margin recovers on its own. "
      + "That gap is the whole business.",
  },
];

const STEPS = [
  ["Connect", "Your registers, fuel and invoices feed in. Nothing changes about how you run the store."],
  ["Close the day", "Every store's day is reconciled and filed, so the month is already finished when it ends."],
  ["Draft the order", "We build each vendor order from what actually moved, and send it for your review."],
  ["Hold the buy", "Purchases are checked against sales, department by department. Drift gets flagged, not buried."],
];

export function renderHome() {
  return page("/", `
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Fuel and convenience retail</span>
        <h1>Better profit by<br><span class="hero-accent">controlling the buy.</span></h1>
        <p class="hero-lead">We show owners the day — what sold, what was bought, what walked out.
          Then we hold the buy to what sold, so more of the sale stays as profit.</p>
        <div class="hero-actions">
          <a class="btn btn-accent btn-lg" href="#/login">Log in</a>
          <a class="btn btn-lg" href="#/how">See how it works ${icon("chevron")}</a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="hero-card">
          <div class="hero-card-head"><span class="dot pos"></span>Store profit, this month</div>
          <div class="hero-bars">
            ${[42, 55, 48, 63, 71, 66, 78, 86].map((h, i) => `<span style="height:${h}%;opacity:${0.45 + i * 0.07}"></span>`).join("")}
          </div>
          <div class="hero-card-foot"><b>Buying held</b><span>margin up as sales grew</span></div>
        </div>
        <div class="hero-card hero-card-2">
          <div class="hero-card-head"><span class="dot warn"></span>Needs attention</div>
          <ul>
            <li><b>3</b> invoices never reached S2K</li>
            <li><b>1</b> store buying ahead of sales</li>
            <li><b>2</b> manager questions waiting</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="site-section">
      <div class="pillars">
        ${PILLARS.map((pillar) => `<article class="pillar">
          <span class="pillar-icon">${icon(pillar.icon)}</span>
          <h3>${esc(pillar.title)}</h3>
          <p>${esc(pillar.body)}</p>
        </article>`).join("")}
      </div>
    </section>

    <section class="site-section site-band">
      <div class="band-inner">
        <h2>The number that decides the month</h2>
        <p>Purchases as a share of sales. When it drifts up two points, store profit falls with it —
          and it usually drifts quietly, one order at a time, in one department.
          Every page in the console is built to surface that early.</p>
        <a class="btn btn-accent" href="#/how">How we hold it ${icon("chevron")}</a>
      </div>
    </section>

    <section class="site-section">
      <h2 class="section-title">How it works</h2>
      <ol class="steps">
        ${STEPS.map(([title, body], i) => `<li>
          <span class="step-n">${i + 1}</span>
          <div><b>${esc(title)}</b><p>${esc(body)}</p></div>
        </li>`).join("")}
      </ol>
    </section>

    <section class="site-cta">
      <div>
        <h2>Already a client?</h2>
        <p>Owners, managers and our own team all sign in here with the same details as before.</p>
      </div>
      <a class="btn btn-accent btn-lg" href="#/login">Log in</a>
    </section>`);
}

/* -------------------------------------------------------------------------
   About, How, Contact, Employee, Get the app
   ------------------------------------------------------------------------- */

export function renderAbout() {
  return page("/about", `
    <div class="site-head">
      <h1>About us</h1>
      <p class="site-lead">Smart Solutions AI keeps the books for fuel and convenience operators,
        and uses them to control the one cost most stores never get on top of: the buy.</p>
    </div>
    <div class="prose">
      <h2>What we actually do</h2>
      <p>We close every store's day, file the month, and reconcile invoices against what was
        ordered and what arrived. That is bookkeeping, and it is the part nobody wants to do.</p>
      <p>The reason we do it is what it makes possible. Once the day is closed accurately you can
        see purchases against sales at department level, which is the only place overbuying is
        visible before it turns into dead stock and a bad month.</p>

      <h2>Why buying, and not sales</h2>
      <p>Most retail advice is about selling more. In a convenience store with fuel out front, the
        faster lever is usually the buy. A store can grow sales all year and still lose store
        profit if purchases grow faster — and that is common, because ordering is a habit built
        around a salesman's visit rather than around what moved.</p>
      <p>We draft each vendor order from the last two weeks of actual movement and send it for
        review. The owner still decides. The order just stops being a guess.</p>

      <h2>How we handle your figures</h2>
      <p>Each client sees their own stores and nothing else. Our team can see across clients
        because we do the filing; no client can. Where a delivery day or a figure is inferred
        rather than reported, the console says so rather than presenting it as fact.</p>
    </div>`);
}

export function renderHow() {
  return page("/how", `
    <div class="site-head">
      <h1>How it works</h1>
      <p class="site-lead">Four things happen every week. None of them change how you run the store.</p>
    </div>
    <ol class="steps steps-lg">
      ${STEPS.map(([title, body], i) => `<li>
        <span class="step-n">${i + 1}</span>
        <div><b>${esc(title)}</b><p>${esc(body)}</p></div>
      </li>`).join("")}
    </ol>
    <div class="prose">
      <h2>What you get to look at</h2>
      <p>A console organised the way the questions actually come up. Start at all your stores,
        narrow to one, and every page — profit, fuel, purchases, departments — follows you down
        without being asked twice.</p>
      <ul>
        <li><b>Command centre.</b> What needs attention today, worst first, each item linking to
          the page that resolves it.</li>
        <li><b>Daily close.</b> The day, the week, the month or the year, from the same figures.</li>
        <li><b>Purchases.</b> Bought against sold, by month and by department.</li>
        <li><b>Fuel.</b> Gallons and cents per gallon, weighted properly across stores.</li>
        <li><b>Profit and loss.</b> The statement, month by month, against last year.</li>
        <li><b>Delivery calendar.</b> When each vendor is due, and which of those days we are
          confident about.</li>
      </ul>
    </div>
    <div class="site-cta">
      <div><h2>Want to see it on your own numbers?</h2>
        <p>We will file one month for you and show you the difference.</p></div>
      <a class="btn btn-accent btn-lg" href="#/contact">Talk to us</a>
    </div>`);
}

export function renderEmployee() {
  return page("/employee", `
    <div class="site-head">
      <h1>For store employees</h1>
      <p class="site-lead">If you work at one of our client stores, this is where you check your
        schedule and send us a question.</p>
    </div>
    <div class="site-split">
      <div class="prose">
        <h2>Signing in</h2>
        <p>Use the username and password your store manager gave you. It is the same log-in as
          before — nothing has been reissued.</p>
        <p>If you do not have one yet, ask your manager to request it. We do not create employee
          log-ins directly.</p>
        <h2>What you can do</h2>
        <ul>
          <li>See your schedule for the week.</li>
          <li>Send a question to the Smart Solutions team.</li>
          <li>Check announcements your manager has posted.</li>
        </ul>
        <p class="tiny muted">Employees do not see store financials.</p>
      </div>
      <aside class="side-card">
        <h3>Employee log in</h3>
        <p>Same details as always.</p>
        <a class="btn btn-accent" style="width:100%;justify-content:center" href="#/login">Log in</a>
        <hr>
        <h3>No log-in yet?</h3>
        <p>Your manager can request one for you.</p>
        <a class="btn" style="width:100%;justify-content:center" href="#/contact">Contact us</a>
      </aside>
    </div>`);
}

export function renderContact() {
  return page("/contact", `
    <div class="site-head">
      <h1>Contact us</h1>
      <p class="site-lead">Whether you are already a client or looking at us for the first time.</p>
    </div>
    <div class="site-split">
      <div class="prose">
        <h2>Already a client</h2>
        <p>The fastest route is a ticket from inside the console — it arrives attached to your
          store and your month, so we are not guessing which figures you mean. Sign in and use
          <b>Tickets</b>.</p>
        <h2>Not a client yet</h2>
        <p>Tell us how many stores you run and which vendors you order from. We will come back
          with what your buy ratio looks like against comparable sites.</p>
      </div>
      <aside class="side-card">
        <h3>Email</h3>
        <p><a href="mailto:orders@smartsolutionsai.us">orders@smartsolutionsai.us</a></p>
        <hr>
        <h3>Already signed up?</h3>
        <p>Open a ticket from the console so it reaches the right person with your figures
          attached.</p>
        <a class="btn btn-accent" style="width:100%;justify-content:center" href="#/login">Log in</a>
      </aside>
    </div>`);
}

export function renderGetApp() {
  return page("/get-app", `
    <div class="site-head">
      <h1>Get the app</h1>
      <p class="site-lead">The console installs to your home screen and works like an app.
        There is nothing to download from a store.</p>
    </div>
    <div class="site-split">
      <div class="prose">
        <h2>iPhone and iPad</h2>
        <ol>
          <li>Open this site in Safari.</li>
          <li>Tap the share button.</li>
          <li>Choose <b>Add to Home Screen</b>.</li>
        </ol>
        <h2>Android</h2>
        <ol>
          <li>Open this site in Chrome.</li>
          <li>Open the menu.</li>
          <li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li>
        </ol>
        <h2>Desktop</h2>
        <p>Chrome and Edge show an install icon in the address bar. The console also runs fine as
          an ordinary tab — the app version just opens without browser chrome.</p>
      </div>
      <aside class="side-card">
        <h3>Works offline?</h3>
        <p>Partly. The console keeps the last figures it loaded so it opens instantly, then
          refreshes. It cannot load new figures without a connection.</p>
        <hr>
        <h3>Ready?</h3>
        <a class="btn btn-accent" style="width:100%;justify-content:center" href="#/login">Log in</a>
      </aside>
    </div>`);
}

export function renderAsk() {
  return page("/contact", `
    <div class="site-head">
      <h1>Ask our team</h1>
      <p class="site-lead">Questions about your figures are best raised from inside the console,
        where they arrive attached to the store and month you are looking at.</p>
    </div>
    <div class="site-split">
      <div class="prose">
        <h2>From the console</h2>
        <p>Sign in and open <b>Tickets</b>. A ticket carries your store, the period on screen and
          who raised it, so nobody has to ask which numbers you mean.</p>
        <h2>By email</h2>
        <p>If you cannot sign in, email <a href="mailto:orders@smartsolutionsai.us">orders@smartsolutionsai.us</a>
          and mention your store number.</p>
      </div>
      <aside class="side-card">
        <h3>Open a ticket</h3>
        <p>Attached to your store and month automatically.</p>
        <a class="btn btn-accent" style="width:100%;justify-content:center" href="#/login">Log in</a>
      </aside>
    </div>`);
}

/* -------------------------------------------------------------------------
   Sign in
   ------------------------------------------------------------------------- */

export function renderLogin(message = "") {
  return `<div class="site site-auth">
    ${header("/login")}
    <main class="auth-main">
      <div class="auth-panel">
        <h1>Log in</h1>
        <p class="auth-sub">Owners, store managers and the Smart Solutions team all sign in here.
          Use the same username and password as always — where you land is decided by your account.</p>
        <form id="signInForm" novalidate>
          <div class="field">
            <label for="email">Username</label>
            <input class="input" id="email" name="username" autocomplete="username"
              autocapitalize="none" spellcheck="false" required>
          </div>
          <div class="field" style="margin-top:12px">
            <label for="password">Password</label>
            <input class="input" id="password" name="password" type="password"
              autocomplete="current-password" required>
          </div>
          <div class="auth-error" id="authError" role="alert">${esc(message)}</div>
          <button class="btn btn-accent auth-submit" type="submit" id="signInBtn">Log in</button>
        </form>
        <p class="auth-note">${icon("alert")} This is a preview build. It reads live figures and
          cannot change anything.</p>
      </div>
      <aside class="auth-art" aria-hidden="true">
        <img src="/assets/logo-mark.png" alt="" width="104">
        <blockquote>Better profit by controlling the buy.</blockquote>
        <p>Every store, every day — what sold, what was bought, and what it left behind.</p>
      </aside>
    </main>
  </div>`;
}

export const PUBLIC_ROUTES = [
  { path: "/", render: renderHome },
  { path: "/about", render: renderAbout },
  { path: "/how", render: renderHow },
  { path: "/employee", render: renderEmployee },
  { path: "/contact", render: renderContact },
  { path: "/get-app", render: renderGetApp },
  { path: "/ask", render: renderAsk },
];
