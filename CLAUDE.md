# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Factory management SPA for Maniram Industries, a corrugated-box manufacturer in Jhansi. Vanilla JS — no framework, no bundler, no npm, no test suite. Deployed via GitHub Pages from `main` (squash-merge PRs to release). UI copy must be plain English — no Hindi/Hinglish in labels, messages, or placeholders (this was changed from an earlier Hinglish style; don't reintroduce it).

## Running locally

```bash
python3 -m http.server 8899        # serve from repo root, open /index.html
node --check js/<file>.js          # only syntax gate available
```

There is no automated test suite. Verification is done by driving headless Chromium (playwright-core + system Chromium) against the local server. To bypass the login overlay in automation, seed localStorage before page scripts run:

```js
localStorage.setItem('mi_auth_session_v1', JSON.stringify({ ok: true, expires: Date.now() + 86400000 }));
```

Login is a single fixed user: `js/auth.js` checks `authHash(username + '::' + password)` against the baked-in `AUTH_CRED_HASH`. There is no setup, change-password, or recovery flow — to rotate credentials, compute a new hash with `authHash()` in the console and replace the constant.

## Architecture

**Three entry pages**, all standalone HTML with inline or `js/` scripts:
- `index.html` — the main app (password-gated by `js/auth.js`, pure client-side)
- `staff.html` — simplified staff portal (PIN-gated, `js/staff-app.js`)
- `supervisor.html` — standalone supervisor entry page (largely superseded: the supervisor now enters data via a Google Form; the app reads its responses sheet)

**No modules.** Every `js/*.js` file is a plain script sharing global scope, loaded in order by `<script>` tags at the bottom of `index.html`. `config.js` must load first (constants), `auth.js` before app scripts. New pages need: a `js/` file, a `<script>` tag, a nav item, a `#page-<id>` div, entries in `pageTitles` and `showPage()` in `js/app.js`, and an entry in the `sw.js` SHELL list.

**Data layer (the big picture):**
- **Reads** go straight from the browser to the Google Sheets API v4 using the public `API_KEY` in `js/config.js`. Every sheet that the app reads must be shared "Anyone with link → Viewer".
- **Writes** POST to a Google Apps Script web app (`APPS_SCRIPT_URL`) with `{ action: '...', ...payload }`, always `mode: 'no-cors'` fire-and-forget (response is opaque; failures are silent by design).
- **localStorage** is the offline cache / fallback for most features (`mirrorToSheet()` pattern in `config.js`: localStorage is the live store, sheet writes are mirrors).

**The backend is `apps-script/Code.gs`** — a single `doPost` action dispatcher. It is deployed manually by the owner in the Apps Script editor; **changing Code.gs in the repo does nothing until the owner redeploys** (Deploy → Manage deployments → Edit → New version). Spreadsheet IDs are duplicated at the top of `Code.gs` and in `js/config.js` — keep them in sync. `apps-script/registers-prodlog.gs` is deprecated; never tell the user to deploy it.

**Spreadsheets:** the Orders spreadsheet (`ORDERS_SHEET_ID`) is multi-tab (Orders, Purchases, Overheads, TallySync, ProdLog, GSMeta, SupvProdLog, WeightLog, ReadyStock, ProcessLog — tabs auto-create on first write). Customers, Products, Dispatch, StaffLog, ProdPerf, and Reel Stock are separate single-tab spreadsheets. `SUPERVISOR_SHEET_ID` is the supervisor's Google Form responses sheet ("Maniram — Register Responses", tabs Production/Dispatch) — read-only from the app; its column order is fixed by the form's question order. There are two separate source Forms (one per tab). When adding a question to a Form, Google Forms appends it as a **new column at the end** of the response sheet, not inline — `js/supervisor-log.js` reads the Dispatch tab's optional column G ("Product Name") this way, falling back to fuzzy-matching column C ("Party / Item") for rows from before that question existed.

**Page navigation:** pages are `#page-<id>` divs toggled by the `.active` class via `showPage()` in `js/app.js`. Never put inline `display:none` on a page div — inline styles beat the `.page.active` CSS rule and the page will never open (this was a real bug).

**Order dispatch tracking:** there are two independent ways to log boxes leaving the factory — Delivery Challans (`js/challan.js`, `challanList`) and the older Record Dispatch modal (`js/dispatch.js`, `_dispatchCache`, opened from Calendar/Production Plan). Both files define a global `getDispatchedQty(orderId)`; since `challan.js` loads after `dispatch.js`, its version wins everywhere and deliberately sums *both* stores so neither entry point is invisible to the other. An order auto-completes (`checkOrderFullyDispatched()` in `js/orders.js`) the moment this combined total reaches the ordered quantity, called from both `saveAndPrintChallan()` and `confirmDispatch()`.

Challans also get created a **third** way, automatically: the Dispatch Google Form has an "Order ID" question (column H, appended after the existing "Product Name" question — same append-only-at-the-end behavior as every other Form question). `_svAutoCreateChallans()` in `js/supervisor-log.js` runs on every `fetchSupervisorLog()` (on load and every 5 min, `js/app.js`) and turns any dispatch entry whose Order ID matches a real order into a challan, stamping the form response's own timestamp onto the record as `svTs` so re-fetching never double-creates one. An Order ID that matches no order is left alone and flagged red in the Supervisor Register's Dispatch table rather than silently dropped.

The "Order ID" question is a **Dropdown**, not free text — Google Forms has no native way to make a dropdown pull live from a sheet, so `Code.gs`'s `refreshOrderIdDropdown()` rebuilds its choice list from every non-Delivered/Dispatched/Cancelled order on a 15-minute trigger (installed once via `installOrderIdDropdownTrigger()`, same manual-run-once pattern as `formatAllSheets()`). Choices are formatted `"<OrderID> — <Customer> — <Product>"` so the supervisor can recognise the right order; the app strips everything after the first `—` when reading the response. This needs `SUPERVISOR_FORM_ID` (the Form's own editable ID, not the public viewform link) set at the top of `Code.gs` — it's separate from `SUPERVISOR_SHEET_ID`, which is the response spreadsheet the Form writes into.

**Process costing:** the Staff Portal's ⚗️ Process Log tab (`js/staff-app.js`) is where the supervisor logs a process batch (Gum by default; any process) as two numbers — raw material used (kg) and approximate output produced — written via the `processLogAppend` action to the auto-created `ProcessLog` tab in the Orders spreadsheet. The office-side ⚗️ Process Costing page (`js/process-costing.js`) reads that tab and multiplies raw material kg by a ₹/kg rate the owner sets per process; like Job Costing's paper/conversion rates, that rate is a sticky localStorage assumption only, never written to a sheet, so it has to be re-entered per browser/device. This is separate from the "Gum / Stitching / Consumables" Expenses category (`js/expenses.js`), which tracks total cash spent, not per-batch unit cost.

**Reel stock snapshots:** `js/reels.js` keeps two separate snapshot mechanisms — don't confuse them. A localStorage cache (`LS_REEL_SNAPS`, one entry per calendar date, pruned after `SNAP_KEEP_DAYS`) powers the quick "last 7 days" tabs on the Reels page; it's per-browser and disposable. A durable, never-pruned log in the separate `SNAPSHOT_SHEET_ID` spreadsheet ("Reel Snapshot Log", `Snapshots` tab, auto-creates) powers the 📅 Monthly view — one upserted row per date holding total kg plus the full per-size breakdown as a JSON blob (`saveReelSnapshot` in `Code.gs`), so it survives across devices, browsers, and beyond 30 days. Both are written on every `fetchReelStock()` call (page load, the 10-minute poll, and the manual ⟳ Refresh); the 📸 Snapshot Now button is just an explicit re-fetch for deliberate month-end counting. `SNAPSHOT_SHEET_ID` had been reserved in `js/config.js` since early on but was dead/unused until this wiring — don't assume every constant in that file is actually live without checking.

**Service worker (`sw.js`):** bump the `CACHE` version string on every release that changes shell files, and add any new HTML/JS/asset to the SHELL list. Install tolerates missing files, but a stale cache version means clients keep old code.

## Domain math

`skills/rate-calculator.md` is the canonical reference for box weight/rate math (sheet size formula, two-part/pasting rule, GST). Key formula used in several places (`js/registers.js`, rate calculator, deckle optimizer):

```
Sheet Length = (L + W) × 2 + 2      Sheet Width = W + H (+ 0.5" margin)
Area (sqm) = (SheetL × SheetW) / 1550
```

Box `weight` fields throughout the app are **grams per box**. Reel sizes are inches of width.

## Tally sync

`scripts/fetch-tally.js` runs on the factory's Windows PC against a local TallyPrime instance and POSTs Sales vouchers to the Apps Script (`syncTally` action), which dedupes, fuzzy-matches parties to orders, and advances matched orders to Dispatched.
