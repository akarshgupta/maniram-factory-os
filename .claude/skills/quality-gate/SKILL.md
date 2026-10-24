---
name: quality-gate
description: Mandatory workflow for every change to Maniram Factory OS — test-driven development (failing test first), unit tests, integration tests through both portals, an adversarial security pass ("break in"), and a scope-of-improvement report. Use for every feature, fix, refactor or UI change in this repo, before opening or updating a PR.
---

# Quality gate — TDD, tests, security, improvement

The owner asked for this on **every** change, without being reminded. A PR
is not ready until each step below is done and its result is in the PR body
and in the reply to the owner.

## 1. TDD — write the failing test first

1. Turn the request into concrete expected behaviour (inputs → outputs, or
   "user does X in the staff portal → this write is posted / this is shown").
2. Write the test(s) **before** touching app code:
   - pure logic → a unit test in `tests/unit/<area>.test.js`
   - anything a person clicks, or that crosses portals / the sheets → an
     integration test in `tests/integration/*.test.js`
3. Run it and **see it fail for the right reason** (`node tests/run.js unit`
   or `… integration`). A test that passes before the change proves nothing
   — fix the test.
4. Write the smallest app change that makes it pass. Refactor with the
   tests green.
5. Bugs: first write a test that reproduces the bug (red), then fix (green).
   It stays as a regression test.

## 2. Unit tests — every piece of logic

- Load real files with `loadScripts([...])` from `tests/unit/load.js`; never
  copy app code into a test.
- Cover the normal case, edge cases (empty, zero, missing fields, odd date
  formats, spaced/misspelt party names, sizes written `20×14×28` vs
  `20*14*28`) and the business rules (oldest order first, two-part box,
  weights typed in kg, no rate shown to staff …).
- Compare sandbox values with `plain(...)`.

## 3. Integration tests — every user flow touched

- Use `tests/integration/harness.js` (`startSuite`, `newPage`): real
  Chromium, both portals, sheets answered from `tests/fixtures/sheets.js`,
  writes captured in `writes`, outside world blocked.
- Assert what the person sees **and** the exact Apps Script payload posted.
- Always also assert `errors` is empty (no page errors).
- Check phone width (390 px) for anything in the staff portal.
- Extend the fixtures with made-up data only — the repo is **public**; never
  commit real customer names, rates, phone numbers or sheet contents.

## 4. Security pass — break in

Act as an attacker against what changed, then against the whole tool when
time allows. Write a failing test for every hole found before fixing it.
Check at least:

- **Injection:** any new text shown with `innerHTML` — can a sheet value,
  form field, URL or localStorage value inject HTML/script? Add the field to
  the hostile fixture (`XSS` in `tests/fixtures/sheets.js`). Sheet reads are
  cleaned centrally (`cleanSheetText` in `js/config.js`); text that does
  not come from a sheet read must be escaped where it is rendered.
- **Data exposure:** does the change show rates, phone numbers or customer
  data somewhere it shouldn't (staff portal)? Is anything sensitive written
  into the public repo, a URL, or a sheet anyone can read?
- **Writes:** can the new Apps Script action be abused (it has no auth —
  anyone with the URL can call it)? Can it delete or overwrite other rows?
  Does it validate its input?
- **Integrity:** double-submit, two people at once (order numbers), partial
  failure of fire-and-forget writes, stale cached scripts (`?v=` bumped?).
- **Secrets:** API keys, PINs, passwords — never logged, never in the repo.

## 5. Report — every time

In the PR body and in the reply to the owner, plainly:

- **Tests:** what was added (unit / integration), and the red → green result
  (e.g. "2 new tests failed before the fix, 31/31 pass after").
- **Security:** what was tried, what was found, what was fixed, what is left
  (with severity: high / medium / low).
- **Scope of improvement:** 2–5 concrete next steps, most valuable first.
  While the repo is **public**, do not commit a list of open holes or attack
  steps anywhere in it (code comments, docs, tests) — give those to the owner
  in the reply only. Fixed issues can be described in the PR.

## Release checklist (with the tests green)

- `node tests/run.js` — all pass.
- `node --check` on changed JS files.
- Bump `sw.js` CACHE and every `?v=` in `index.html` and `staff.html`.
- `Code.gs` changed → tell the owner to redeploy (paste + New version).
- Never merge without the owner saying "merge".
