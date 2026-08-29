# Maniram Factory OS

A factory management web app built for **Maniram Industries**, a corrugated-box manufacturer in Jhansi. It runs orders, production, dispatch, and finance for the whole shop from one screen — plain HTML/CSS/JS, no build step, no server of its own. Deployed as a static site on GitHub Pages, with Google Sheets as the database and a small Google Apps Script as the write API.

## What it does

**Main**
- Dashboard — today's due/overdue orders, revenue, active pipeline at a glance

**Finance**
- Invoicing, Receivables, and a per-party **Ledger** (running debit/credit statement built from the two)
- Expense tracker and Purchase Register (reel purchases, payment status)
- **Production Register** — machine-stage entry (sheeter → top paper → printing → pasting → rotary → stitching) with per-order phase tracking
- **Daily Report** — a single-page end-of-day summary: dispatch output plus production split into Part 1 (corrugation/board-making) and Part 2 (converting/finishing)
- Job Costing — per-order cost and margin from paper rate, conversion cost, and printing cost
- Tally Sync — pulls Sales vouchers from a Windows PC running Tally and matches them to orders

**Operations**
- Orders — create, edit, delete, print job cards, issue delivery challans, and mark complete (in full or short of the ordered quantity)
- Calendar and Pipeline Board (kanban) views of the order pipeline
- Production Plan — day-by-day scheduling against reel stock availability
- Supervisor Log — live read-only view of the factory supervisor's Google Form entries (production + dispatch, filled from their phone)
- Reel Stock — live inventory pulled from a Google Sheet, with critical-size warnings
- Deckle Optimizer — best reel width for a given box size, ranked by trim waste %
- Clients & Product Master — customer/product records, print specs, and reference photos for the print shop

**Tools**
- Rate Calculator — box weight/rate from size, ply, and GSM (see [`skills/rate-calculator.md`](skills/rate-calculator.md) for the underlying formulas)
- Analytics — revenue and box-count trends
- Reminders — repeat-order nudges based on delivery history

**Other entry points**
- `staff.html` — a simplified, PIN-gated staff portal (order status + reel stock only)
- `supervisor.html` — a standalone mobile page for supervisor data entry (largely superseded by the Google Form the Supervisor Log page reads from)
- `review.html` — public, no login, reached via a printable QR code (Tools → Customer Reviews in the main app). Customers rate 1-5 stars; 4-5 stars get ready-made comments to copy and post to Google, 1-3 stars go to a private feedback form only the owner sees.

## Architecture

- **No framework, no bundler, no npm.** Every file in `js/` is a plain script sharing global scope, loaded in order by `<script>` tags at the bottom of `index.html`.
- **Reads** go straight from the browser to the Google Sheets API v4 using a public API key. Every sheet the app reads must be shared "Anyone with link → Viewer".
- **Writes** POST to a Google Apps Script web app (`apps-script/Code.gs`) as fire-and-forget requests — the response is opaque by design (`mode: 'no-cors'`).
- **localStorage** is the live store for most features; sheet writes are a mirror/backup, not the source of truth for the current session.
- A **service worker** (`sw.js`) caches the app shell for offline use and installs as a PWA (`manifest.json` + `icons/`).

Full architectural notes — data flow, spreadsheet layout, known gotchas — are kept in [`CLAUDE.md`](CLAUDE.md).

## Running locally

```bash
python3 -m http.server 8899   # serve from repo root
# open http://localhost:8899/index.html
```

There's no test suite. `node --check js/<file>.js` is the only automated gate (syntax only). Changes are normally verified by driving headless Chromium against the local server.

## Deployment

- **Frontend:** GitHub Pages, deployed from `main`. Merge a PR (squash) and it's live.
- **Backend:** `apps-script/Code.gs` is deployed manually — paste it into the Apps Script editor bound to the Orders spreadsheet, then **Deploy → Manage deployments → Edit → New version**. Editing the file in this repo does nothing on its own until that step happens. `apps-script/registers-prodlog.gs` is deprecated — don't deploy it.

## Login

Single fixed admin account (`js/auth.js`), no self-signup. To change the username or password, run `authHash('newuser::newpassword')` in the browser console and paste the result into `AUTH_CRED_HASH` in `js/auth.js`.

## Data

All spreadsheet IDs live in `js/config.js` (frontend) and are duplicated at the top of `apps-script/Code.gs` (backend) — keep both in sync when a sheet changes. The Orders spreadsheet is multi-tab (Orders, Purchases, Overheads, TallySync, ProdLog, GSMeta, SupvProdLog, WeightLog, ReadyStock); Customers, Products, Dispatch, StaffLog, ProdPerf, and Reel Stock are each their own spreadsheet. The Supervisor Log reads a separate Google Form responses sheet, fed by two forms (Production and Dispatch) the supervisor fills from their phone.

## Tally sync

`scripts/fetch-tally.js` runs on the factory's Windows PC against a local TallyPrime instance and pushes Sales vouchers to the Apps Script, which dedupes them, fuzzy-matches parties to open orders, and advances matched orders to Dispatched.
