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
      <img src="assets/logo-wordmark-dark.png"
        srcset="assets/logo-wordmark-dark.png 1x, assets/logo-wordmark-dark@2x.png 2x"
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
        <img src="assets/logo-wordmark-dark.png" alt="Smart Solutions AI" width="164">
        <p>An AI store manager for fuel and convenience sites.</p>
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
   -------------------------------------------------------------------------
   One long page, because an owner who has never heard of us needs the whole
   model in one read: what the thing is, what it does each day, why buying is
   the lever, what it costs, and what it does not touch.
   ------------------------------------------------------------------------- */

/** The job description. This is the heart of the pitch, so it leads. */
const DUTIES = [
  {
    icon: "calendar",
    title: "Closes the day",
    body: "Every night it takes the register, the fuel system and the invoices and finishes the "
      + "day: gallons, fuel profit, store sales, what was bought, what was kept. By the time the "
      + "month ends, the month is already done.",
  },
  {
    icon: "pricing",
    title: "Sets the buy",
    body: "It gives every department a purchase budget worked out from that department's own "
      + "sales, then tracks what is left. Your manager stops guessing what an order should be "
      + "and starts working to a number.",
  },
  {
    icon: "orders",
    title: "Drafts the order",
    body: "When a vendor is due, it builds the order from what actually moved since the last "
      + "delivery — not from the salesman's suggestion sheet. You approve it, change it or "
      + "reject it. Nothing is sent behind you.",
  },
  {
    icon: "departments",
    title: "Watches every department",
    body: "Beer, cigarettes, energy, packaged beverages, food. Each one carries a target margin, "
      + "and each one is checked against it. A department that quietly turns negative gets "
      + "named, in the week it happens.",
  },
  {
    icon: "alert",
    title: "Writes the weekly alert",
    body: "A short note to the store, in plain English: where the margin sits against target, "
      + "purchases against the paced budget, and where the month is heading versus the same "
      + "month last year.",
  },
  {
    icon: "profit",
    title: "Reports to you",
    body: "One console for everything you own. Start at all your stores, drop into one, and "
      + "compare any month against the same month last year on fuel, sales, buying and profit.",
  },
];

/** Day / week / month / year — the operating rhythm. */
const RHYTHM = [
  ["Every day", "The day is closed and filed for every store. Gallons and fuel profit on one "
    + "side, store sales and purchases on the other."],
  ["Every week", "Each store gets a purchase ceiling for the week and a written alert saying "
    + "whether it came in under or over, and by how much."],
  ["Every month", "The month is closed and set against the same month a year ago — sales, "
    + "buying, store profit, fuel profit, cents per gallon."],
  ["Every year", "Department by department, this year against last, so you can see which "
    + "categories actually earned their shelf."],
];

/** Illustrative only — real client figures never appear on a public page. */
const BUDGET_DEMO = [
  ["Beer", 3817, 11810],
  ["Cigarettes", 6240, 10882],
  ["Energy drinks", 1534, 8107],
  ["Packaged beverages", 4980, 9455],
  ["Snacks and candy", 2110, 6320],
];

const dollars = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

const ROLES = [
  ["Owner", "owners", "Everything you own, at any depth: the whole portfolio, one owner group, "
    + "or a single site. Billing and month-end sit here too."],
  ["Store manager", "stores", "Their store only. The week's purchase ceiling, what is left in "
    + "each department, the orders waiting to go out, and the day to file."],
  ["Employee", "clock", "Schedule, clock in and out, breaks and tasks. No financial figures of "
    + "any kind."],
  ["Our office", "health", "We do the filing and the invoice entry, so we can see across the "
    + "clients we keep books for. No client can ever see another."],
];

const FAQ = [
  ["Do I have to change my POS or my vendors?",
    "No. It reads what your register and fuel system already produce, and you keep the same "
    + "vendors and the same reps. The only piece of hardware involved is a scanner for invoices."],
  ["Does it order without asking me?",
    "No. It drafts. Every order waits for a person to approve it, and you can change any line "
    + "before it goes."],
  ["What if I only have one store?",
    "That is the common case, and it is the case that benefits most — a single site rarely "
    + "justifies a full-time general manager, which is exactly the gap this fills."],
  ["How far back do you go when you start?",
    "We rebuild your history through the prior year during setup, so you have a real "
    + "year-over-year comparison from the first month rather than waiting twelve months for one."],
  ["Who can see my numbers?",
    "You, whoever you give access to, and our office. Clients are partitioned from each other. "
    + "Where a figure is inferred rather than reported, the console labels it instead of "
    + "presenting it as fact."],
];

export function renderHome() {
  const budgetRows = BUDGET_DEMO.map(([name, spent, budget]) => {
    const left = budget - spent;
    const pctUsed = Math.round((spent / budget) * 100);
    return `<tr>
      <th scope="row">${esc(name)}</th>
      <td class="num">${esc(dollars(spent))}</td>
      <td class="num">${esc(dollars(budget))}</td>
      <td>
        <span class="demo-track"><span class="demo-fill" style="width:${pctUsed}%"></span></span>
      </td>
      <td class="num demo-left">${esc(dollars(left))}</td>
    </tr>`;
  }).join("");

  return page("/", `
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">For fuel and convenience retailers</span>
        <h1>An AI store manager<br>for <span class="hero-accent">every site you own.</span></h1>
        <p class="hero-lead">It closes the books every day, holds each department's buying to what
          that department actually sold, drafts the vendor orders, and tells you every week where
          the profit went. One of them per store, for a fraction of one salary.</p>
        <div class="hero-actions">
          <a class="btn btn-accent btn-lg" href="#/contact">Talk to us</a>
          <a class="btn btn-lg" href="#/login">Client log in ${icon("chevron")}</a>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="hero-card">
          <div class="hero-card-head"><span class="dot pos"></span>Store profit, month by month</div>
          <div class="hero-bars">
            ${[42, 55, 48, 63, 71, 66, 78, 86].map((h, i) => `<span style="height:${h}%;opacity:${0.45 + i * 0.07}"></span>`).join("")}
          </div>
          <div class="hero-card-foot"><b>Buying held</b><span>margin rose as sales grew</span></div>
        </div>
        <div class="hero-card hero-card-2">
          <div class="hero-card-head"><span class="dot warn"></span>This week at your stores</div>
          <ul>
            <li><b>Beer</b> bought past its budget</li>
            <li><b>2</b> orders drafted, waiting on you</li>
            <li><b>3</b> invoices never reached the books</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="site-section">
      <h2 class="section-title">What it actually does</h2>
      <p class="section-sub">A good store manager does about six things well. Most sites cannot
        justify one at every location, and the one you have is busy running the shift. These are
        the six, done every day, at every store, without being reminded.</p>
      <div class="pillars pillars-6">
        ${DUTIES.map((duty) => `<article class="pillar">
          <span class="pillar-icon">${icon(duty.icon)}</span>
          <h3>${esc(duty.title)}</h3>
          <p>${esc(duty.body)}</p>
        </article>`).join("")}
      </div>
    </section>

    <section class="site-section site-band">
      <div class="band-inner">
        <span class="eyebrow">The whole idea in one number</span>
        <h2>Purchases as a share of sales</h2>
        <p>Fuel margin is set by the street; you can do very little about it. The store is where
          the profit is made or lost, and inside the store there is really only one number you
          control: what you paid for the goods, against what they sold for.</p>
        <p>It moves quietly. Nobody decides to overbuy. It happens one order at a time, in one
          department, because the rep came on Tuesday and the order got written the way it always
          gets written. Four points of drift at a store selling $70,000 a month inside the shop
          costs about <b>$2,800 of profit a month</b> — near enough $34,000 a year, on sales that
          never changed.</p>
        <p>An owner usually finds out at month end, three weeks late, as one number with no name
          on it. The point of an AI store manager is to catch it in the week it starts, and to
          say which department did it.</p>
      </div>
    </section>

    <section class="site-section">
      <h2 class="section-title">How it holds the buy</h2>
      <p class="section-sub">Every department gets a monthly purchase budget worked back from its
        own sales and target margin. As invoices land, the budget draws down, and what is left is
        stated in dollars — so an order is written against a number instead of a feeling.</p>
      <div class="demo-card">
        <div class="demo-head">
          <b>Department budget</b>
          <span>Illustration · your figures replace these</span>
        </div>
        <table class="demo-table">
          <thead><tr>
            <th>Department</th><th class="num">Bought</th><th class="num">Budget</th>
            <th>Used</th><th class="num">Left to spend</th>
          </tr></thead>
          <tbody>${budgetRows}</tbody>
        </table>
        <div class="demo-foot">${icon("check")} The manager sees this before writing the order.
          You see it, and the week's alert, without asking anyone.</div>
      </div>
    </section>

    <section class="site-section">
      <h2 class="section-title">The rhythm</h2>
      <ol class="steps steps-lg">
        ${RHYTHM.map(([title, body], i) => `<li>
          <span class="step-n">${i + 1}</span>
          <div><b>${esc(title)}</b><p>${esc(body)}</p></div>
        </li>`).join("")}
      </ol>
    </section>

    <section class="site-section site-band">
      <div class="band-inner band-wide">
        <h2>Everyone gets their own view</h2>
        <p>One log-in. What you see is decided by who you are, and nothing leaks across it.</p>
        <div class="role-grid">
          ${ROLES.map(([title, ico, body]) => `<article class="role">
            <span class="role-icon">${icon(ico)}</span>
            <div><b>${esc(title)}</b><p>${esc(body)}</p></div>
          </article>`).join("")}
        </div>
      </div>
    </section>

    <section class="site-section">
      <div class="site-split">
        <div class="prose">
          <h2>What does not change</h2>
          <p>This sits on top of how you already run the store. It does not ask you to move to a
            new register, retrain your staff, or drop the vendors and reps you have relationships
            with.</p>
          <ul>
            <li>Keep your POS and your fuel system.</li>
            <li>Keep your vendors, your reps and your delivery days.</li>
            <li>Keep your people — this replaces the paperwork, not the person behind the counter.</li>
            <li>No order is ever sent without someone approving it.</li>
          </ul>
          <h2>Common questions</h2>
          ${FAQ.map(([q, a]) => `<details class="faq">
            <summary>${esc(q)}</summary>
            <p>${esc(a)}</p>
          </details>`).join("")}
        </div>
        <aside class="side-card">
          <h3>See it on your own numbers</h3>
          <p>Send us one month of your figures. We will close it, rebuild the year before it, and
            show you what your buy ratio looks like — before you commit to anything.</p>
          <a class="btn btn-accent" style="width:100%;justify-content:center" href="#/contact">Talk to us</a>
          <hr>
          <h3>Already a client?</h3>
          <p>Owners, store managers and our own team all sign in at the same place.</p>
          <a class="btn" style="width:100%;justify-content:center" href="#/login">Log in</a>
        </aside>
      </div>
    </section>

    <section class="site-cta">
      <div>
        <h2>Put one in every store</h2>
        <p>Tell us how many sites you run and who you order from. We will come back with what your
          buying looks like against comparable stores.</p>
      </div>
      <a class="btn btn-accent btn-lg" href="#/contact">Talk to us</a>
    </section>`);
}

/* -------------------------------------------------------------------------
   About, How, Contact, Employee, Get the app
   ------------------------------------------------------------------------- */

export function renderAbout() {
  return page("/about", `
    <div class="site-head">
      <h1>About us</h1>
      <p class="site-lead">We build an AI store manager for fuel and convenience sites — one that
        keeps the books, holds the buying to what sold, and reports to the owner every week.</p>
    </div>
    <div class="prose">
      <h2>Where this came from</h2>
      <p>Station owners kept describing the same problem to us. Sales were fine. Fuel was fine.
        Store profit was not, and nobody could say precisely why until the month was over and it
        was too late to do anything about it.</p>
      <p>Every time we went looking, the answer was in the buying — and it was never one dramatic
        mistake. It was a few hundred dollars a week in one department, ordered the way it had
        always been ordered, for months.</p>

      <h2>Why an AI manager, and not a report</h2>
      <p>The industry does not have a shortage of reports. It has a shortage of somebody with the
        time to read them on the day they matter and to act on them before the next order goes
        out. That is a job, not a document.</p>
      <p>So we built the job. It closes the day, sets and tracks a purchase budget for every
        department, drafts each vendor order from what actually moved, and writes the store a
        short weekly note about where the margin sits. A district manager doing this properly
        across a handful of sites is a salary most single-site owners cannot justify. This is the
        same work, at every store, at a fraction of it.</p>

      <h2>What we are not</h2>
      <p>We are not a POS company and we are not trying to replace your register or your vendors.
        We do not send an order without a person approving it, and we do not make decisions about
        your store on your behalf. The AI does the watching and the arithmetic; you keep the
        judgement.</p>

      <h2>How we handle your figures</h2>
      <p>Each client sees their own stores and nothing else. Our office can see across the clients
        we keep books for, because doing the filing requires it; no client can. Where a delivery
        day or a figure is inferred rather than reported, the console labels it rather than
        presenting it as fact.</p>

      <h2>How we get paid</h2>
      <p>Mostly out of the improvement. There is a setup fee per store and small per-use charges
        for invoice entry, ordering, scheduling and tasks, but the main line is a share of the
        increase in your store profit against the same month a year earlier. If it does not go up,
        that line is zero. We would rather be judged on that than on a subscription.</p>
    </div>`);
}

/** Getting started, from the first conversation to the first held month. */
const ONBOARDING = [
  ["We take your history",
    "You send us what you already have — register exports, fuel reports, and a year or so of "
    + "invoices. We rebuild the prior year so your very first month has something honest to be "
    + "measured against."],
  ["We set the budgets",
    "Each department gets a target margin and a monthly purchase budget worked back from its own "
    + "sales. We go through these with you before anything is switched on; they are your numbers, "
    + "not a template."],
  ["The scanner goes in",
    "Invoices get scanned at the store and entered against the right department, so the budget "
    + "draws down as goods actually arrive rather than at month end."],
  ["The first month runs",
    "The day closes nightly. Your manager sees what is left to spend before writing each order. "
    + "You get the weekly alert. Nothing about the shift changes."],
  ["You start comparing",
    "From the second month, every figure carries last year beside it, and the buy ratio becomes "
    + "something you can steer instead of something you discover."],
];

export function renderHow() {
  return page("/how", `
    <div class="site-head">
      <h1>How it works</h1>
      <p class="site-lead">What happens between the first conversation and the first month where
        the buying is actually under control.</p>
    </div>
    <ol class="steps steps-lg">
      ${ONBOARDING.map(([title, body], i) => `<li>
        <span class="step-n">${i + 1}</span>
        <div><b>${esc(title)}</b><p>${esc(body)}</p></div>
      </li>`).join("")}
    </ol>
    <div class="prose">
      <h2>What you get to look at</h2>
      <p>A console organised the way the questions actually come up. Start at all your stores,
        narrow to one owner group or one site, and every page — profit, fuel, purchases,
        departments — follows you down without being asked twice.</p>
      <ul>
        <li><b>Command centre.</b> What needs attention today, worst first, each item linking to
          the page that resolves it.</li>
        <li><b>Daily sales.</b> The day, the week, the month or the year, from the same figures.</li>
        <li><b>Purchases.</b> Bought against sold, by month and by department.</li>
        <li><b>Departments.</b> Each category against its target margin, this year and last.</li>
        <li><b>Fuel.</b> Gallons and cents per gallon, weighted properly across stores.</li>
        <li><b>Delivery calendar.</b> When each vendor is due, and which of those days we are
          confident about.</li>
        <li><b>Billing.</b> Every charge itemised, with the invoice behind it.</li>
      </ul>

      <h2>Where the figures come from</h2>
      <p>Nothing here is typed in twice. The day comes from your register and fuel system, the
        purchases come from scanned invoices, and the departments come from your own category
        structure. Where something has to be inferred — a delivery day we have worked out from a
        pattern rather than been told — the console says so on the page instead of quietly
        presenting it as fact.</p>
    </div>
    <div class="site-cta">
      <div><h2>Want to see it on your own numbers?</h2>
        <p>We will close one month for you and show you the difference.</p></div>
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
        <img src="assets/logo-mark.png" alt="" width="104">
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
