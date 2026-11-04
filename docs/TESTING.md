# Testing report

What was actually run, what failed and was fixed, and what still needs a human.

Reproduce with:

```bash
npm test             # 203 automated tests
npm run test:load    # simulated simultaneous pupils
node tools/pacing.js # lesson-length estimate
bash tools/smoke.sh  # end-to-end against a running server
```

---

## Summary

| Suite | Tests | Result |
| --- | --- | --- |
| `qr.test.js` — QR encoder and decoder | 11 | pass |
| `questions.test.js` — question bank and marking | 21 | pass |
| `merge.test.js` — merge engine, missions, story, pacing | 62 | pass |
| `server.test.js` — HTTP API, auth, timers, CSV, SSE | 58 | pass |
| `csv-auth.test.js` — CSV safety, passwords, nicknames, rooms | 21 | pass |
| `client.test.js` — browser code wiring, artwork, phone rules | 30 | pass |
| **Total** | **203** | **all passing** |

Plus a load test at 45, 50 and 80 simulated pupils, and an end-to-end smoke test
against a real running server process.

---

## What was tested

### Valid and invalid merges

Two identical items join into the next level and the source cell empties.
Refused, with the board left untouched and a plain-English message: different
families, different levels, an item merged with itself, an empty cell, a
level-5 item, and malformed or out-of-range board references. A full
level-1-to-level-5 chain was built through the real action API.

### Board limits, storage, recycling, recovery

The storage tray accepts and returns items, and a tray item can merge with a
board item. Moving onto an occupied or locked cell is refused. Recycling needs
an explicit confirmation and pays a level-scaled refund.

A genuinely dead board was constructed — every cell and tray slot full of
unmergeable level-5 items, zero taps, zero coins, no matching request — and the
engine detected it as blocked. The **Helping hand** recovered it for free, and
is refused while the pupil can still play. Coins buying extra taps was verified
as an alternative recovery route.

### Missions, delivery, rewards, clues, ending

Exactly three requests at a time, always including a quick one and a longer one,
with the longer one paying more and costing more. Across all five chapters and
many regenerations, requests never asked for a locked family, never exceeded the
chapter's level ceiling, and never cost more than one full tap allowance. The
three on offer are always three different jobs.

Delivering removes the item from the board, pays the reward, retires the request
and replaces it. Delivering the wrong item is refused by name. Locked cells open
as requests complete.

**A complete five-chapter story was played to the end using only legal
actions** — tap a source, merge pairs, deliver, answer each clue, choose each
decoration, solve the mystery. All five clue cards were collected, all five
locations reached 100% restored, a decoration was chosen for each, and bonus
festival orders opened afterwards.

The finale has exactly one correct option; each wrong option's explanation cites
the specific clue it contradicts; the ending text is consistent with all five
clues. The finale is locked until all five clues are held, a wrong answer
explains and allows a retry, and clue cards cannot be answered before they are
found.

### Question marking, alternatives, retries, score separation

All 97 questions pass structural validation. Every stored answer marks itself
correct; every listed alternative marks correct; every multiple-choice
distractor marks wrong.

Normalisation verified for case, leading and trailing spaces, repeated spaces,
straight versus curly apostrophes, and ordinary punctuation. Verified that wrong
meanings are still rejected — `tooth`, `teath`, `teet` for `teeth`; `I am Mali`
for `My name is Mali`; `could you close the window please` for an "open"
request — so matching is precise rather than fuzzy. Guided writing accepts the
pupil's own hobby, name or age but rejects a broken sentence frame.

First-attempt success is recorded separately from success after a retry, through
the engine and over HTTP, and both appear separately on the dashboard and in the
CSV. A finished question cannot be resubmitted for credit. The model answer is
withheld while a retry remains and shown once attempts are used up. Answering
out of turn is refused.

Across six consecutive cycles over HTTP, **no question repeated**. The first
question served is always from the easiest band. Game progress never affects
which questions are served.

### Teacher authentication and pupil access restrictions

Wrong password refused; right password accepted; the real password never appears
in any response. The session cookie is `HttpOnly` and `SameSite=Lax` and
contains nothing derived from the password. Sessions expire and can be signed
out; forged tokens are always invalid; malformed stored hashes are rejected
rather than throwing. A server with no password configured refuses every
sign-in and names the missing variable.

**Fourteen teacher endpoints** were each called with no session and with a
pupil's session; all returned 401. A pupil's state payload contains no other
pupil's name and no other pupil's rejoin token.

Every pupil-facing question payload was checked for leaked answer keys,
accepted lists, patterns, explanations and example answers, including that a
fill-in-the-blank answer does not appear as a whole word in the prompt. The
optional leaderboard is off by default and carries no English marks when on.

### Join links, manual codes, QR decoding

Room codes are six characters, unique across 400 generations, and contain no
look-alike characters. Codes are accepted in lower case and with stray spaces.
Wrong codes are refused with a helpful message. The `/j/CODE` path serves the
pupil app.

The QR encoder was verified against the **published ISO/IEC 18004 format-
information table for all 32 error-correction and mask combinations**, and its
block tables against the published total-codeword counts for every version and
level. Encode-then-decode round-trips pass for realistic join URLs, for
**every version 1–10 at every level L/M/Q/H filled to exact capacity**, and for
non-ASCII text including Thai. The delivered SVG decodes back to the join URL
and carries a 4-module quiet zone. A deliberately corrupted symbol is rejected
rather than decoded wrongly. PNG output is a well-formed greyscale PNG.

The decoder is a separate implementation with its own re-typed specification
tables, which reads the format information out of the symbol the way a scanner
does and checks every Reed-Solomon syndrome — so agreement between encoder and
decoder is evidence, not a tautology.

End to end: the QR code contains the configured public HTTPS address, and a
`localhost` base URL is reported as a problem on the dashboard rather than
hidden.

### Start, pause, resume, end, timers

Round length can be set to 30, 45, 60 or 90 seconds and nothing else; 15, 61,
600, 0, −30 and `"sixty"` are all refused. A 30-second setting really produces a
30-second server-side round.

Pause freezes the remaining time; **the clock was confirmed stopped** by waiting
1.2 s and re-reading the identical value; gameplay is refused while paused;
resume restores the remaining time to within 500 ms. A pupil paused on the
question screen returns to the same question. Ending stops everyone, cannot be
undone, and prevents new joins. An expired round sends the pupil back to fresh
questions.

### Rejoining, refreshing, brief disconnections

A refresh with a lost cookie, using the private rejoin token, returned the
**same pupil id, nickname, board, taps and English totals**, with no duplicate
on the dashboard. A forged rejoin token is refused. A removed pupil's session
and token both stop working immediately.

A Wi-Fi drop was simulated past the grace period: the pupil showed as offline,
then a single heartbeat brought them back, still as one pupil.

In the load test, **17 of 50 pupils refreshed simultaneously** and all 17 were
restored with byte-identical boards.

### CSV export and question editing

English results, every answer, and game results are three separate files.
Verified that the English file contains no game columns and the game file no
English columns. Headers include `Content-Disposition` and a UTF-8 BOM so Thai
names open correctly in Excel.

Formula injection was tested with `=1+1`, `=cmd|' /C calc'!A0`, `+1-1`, `-2+3`,
`@SUM(A1:A9)`, `|echo hi`, and leading tab and return — all neutralised with a
leading apostrophe. A nickname set to a `=HYPERLINK(...)` payload appears
quoted and prefixed in the real export. Newlines inside an answer cannot break
the row structure. Download filenames cannot carry path or traversal
characters.

Question editing: adding an accepted alternative makes it mark correct
immediately, including with different capitals and punctuation. Refused with a
readable reason: an answer that is not one of the choices, an empty prompt, an
unanchored pattern, an alternative that would make a wrong choice correct, and
an attempt to edit a protected field. After every refusal the question was
confirmed still intact.

### Simultaneous pupils

| Pupils | Cycles | Requests | Throughput | Latency p50 / p95 / p99 | Errors | Memory |
| --- | --- | --- | --- | --- | --- | --- |
| 45 | 3 | 2,237 | 1,835 req/s | 16 / 32 / 225 ms | 0 | 168 MB |
| 50 | 3 | 2,689 | 1,441 req/s | 17 / 25 / 157 ms | 0 | 180 MB |
| 80 | 2 | 2,699 | 1,409 req/s | 22 / 118 / 368 ms | 0 | 242 MB |

Each simulated pupil joined, held a live event stream open, answered questions
including deliberate wrong answers and retries, generated items, merged them and
delivered requests. Every run passed the integrity checks: no duplicated
pupils, no double-counted answers, every refresh restored, every event stream
opened. The dashboard built in under 2 ms and all three CSV exports together
took about 6 ms, while the class was still live.

### Phone layout and touch controls

Checked by static analysis of the real markup, stylesheets and scripts, not in a
browser — see the limitation below. Confirmed present: `width=device-width` with
`viewport-fit=cover` on both pages; `env(safe-area-inset-*)`; a 48 px minimum
touch target applied to every button; `touch-action: manipulation` to remove the
double-tap delay; `touch-action: none` on the board **only**, with the page
itself left scrollable; `overscroll-behavior-y: none`; media queries for 360 px
wide and 560 px tall viewports; `100dvh`.

Both input styles are implemented: pointer-event dragging with pointer capture,
`elementFromPoint` drop resolution and `pointercancel` cleanup, plus a separate
tap-then-tap path. **Zero `:hover` rules exist**, and no single-letter keyboard
shortcuts.

Also verified: all 20 item pictures plus every character, scene, pin and icon
are well-formed SVG and visually distinct per level and per character; each
location's before and after pictures differ, and the two decoration choices
differ from each other; out-of-range item levels are clamped instead of
crashing.

Wiring: all 64 element ids `pupil.js` looks up exist in `index.html`, the same
for the dashboard, every screen in the router exists, every phase the server can
report is handled, and every CSS class used by the markup or attached by the
scripts is defined. No inline scripts or inline event handlers, so the strict
Content-Security-Policy holds. The escaper was extracted and tested directly.

**These wiring tests were themselves verified.** Three faults were deliberately
injected into `index.html` — a renamed id, an undefined class and an inline
`onclick` — and exactly the three relevant tests failed; restoring the file made
them pass again.

### Other

Path traversal attempts (`/../server/index.js`, `/..%2fserver%2findex.js`,
`/css/../../server/auth.js`, `/%2e%2e/%2e%2e/package.json`) all refused with no
source leaked. Oversized bodies, malformed JSON and non-object JSON all refused
without killing the connection. Security headers and the CSP confirmed on
responses. A live SSE stream delivered the first state frame and then a pushed
phase change when the lesson started; the stream refuses a caller with no
session. Text assets are compressed (the pupil app is **28 KB** over the wire
versus 110 KB raw), CSV downloads deliberately are not, and `HEAD` reports the
same headers as `GET`.

---

## What failed during development, and was fixed

These were real defects found by the tests, not hypotheticals.

1. **A class of 40 could not have joined.** The join rate limiter allowed 30
   requests per minute per IP address. A whole school shares one public IP, so
   the load test showed **pupils 31 to 45 refused with HTTP 429**. Limits keyed
   by client address were raised to classroom scale, and a test now joins 45
   pupils from one address.

2. **A pupil could have locked the teacher out.** Login lockout was applied
   before the password was checked, so on a shared school IP a pupil guessing at
   the login form would have locked out the teacher's correct password. The
   password is now checked first; guessing is slowed by the rate limiter and by
   scrypt instead. A test makes 25 wrong guesses and then confirms the teacher
   can still sign in.

3. **Clue 5 and a decoration could be awarded twice.** After the story
   completed, a leftover regular request pushed chapter 5 past its target again,
   re-running chapter completion. Guarded both by chapter and by story state;
   remaining requests now convert to bonus orders.

4. **Fill-in-the-blank questions leaked their answers.** The `example` field,
   which for a one-word blank *is* the answer, was being sent to pupils before
   they answered. Examples now appear only in feedback, replaced up-front by a
   neutral input hint.

5. **Two questions showed their own answer in the prompt.** `g-006` asked the
   pupil to supply "hello" in a prompt that already said "Hello!", and `h-009`
   asked for "paint" in a prompt containing "painting". Both rewritten. The test
   that caught this uses whole-word matching, after substring matching produced
   false alarms (`at` inside "eat", `is` inside "missing").

6. **Thai nicknames were rejected.** The validator allowed `\p{L}` but not
   `\p{M}`, so Thai vowel and tone marks failed. A name like มาลี could not
   join. Fixed and tested, including end to end.

7. **Oversized uploads produced a network error instead of a message.** The body
   reader destroyed the socket mid-upload, so the client saw `fetch failed`
   rather than an explanation. Oversized bodies are now drained and answered
   with HTTP 413.

8. **The story was badly paced, twice.** First it needed 27 rounds (about 50
   minutes, too long). After tuning it needed 3 to 5 rounds (about 9 minutes,
   trivially short). Measured with `tools/pacing.js` and settled at 8 supply
   taps per round and 44 deliveries, giving 8–10 rounds for efficient play.
   Tests now assert the story is neither trivially short nor impossible, and
   that it still completes on the lowest teacher-set allowance.

9. **The three town requests could be identical.** Chapter 1 offered "Festival
   Banner" twice, which is not a meaningful choice. Replaced best-effort retries
   with an exhaustive candidate search, so the three offers are always distinct
   where distinct options exist.

10. **`safeFilename` kept `..` sequences.** Harmless in context but fixed to
    collapse dot runs and never start with a dot or dash.

11. **`HEAD` advertised the wrong content length** once compression was added.
    `HEAD` now goes through the same path as `GET`.

---

## What was NOT tested, and needs you

Please treat this section as the honest limit of what has been verified.

### 1. No real browser was ever opened

**No part of this was run in a browser.** The sandbox that built it has no
browser it can reach: one browser is network-isolated from the server, and the
local one could not launch under the sandbox's process restrictions.

So the following are **unverified** and need your eyes:

- How anything actually looks. Colours, spacing, whether the 5×6 board fits
  comfortably on a real phone, whether text wraps badly anywhere.
- Whether dragging a tile feels right, and whether the page stays still while
  dragging on a real iOS or Android browser.
- Whether animations, sparkles and confetti look pleasant rather than
  distracting.
- Whether the dashboard is genuinely readable from the back of your classroom.
- Whether the on-screen keyboard covers the answer box on any particular phone.

The static checks prove the client is **wired** correctly — every element
exists, every class is styled, every SVG is valid, the phone-specific CSS rules
are present. They cannot prove it **looks** right.

### 2. The physical QR scan

The server encodes the join URL and decodes its own picture back to confirm the
bytes are right. **A phone camera was never pointed at a screen.** Please do the
check in the README's "The check only you can do" section before your first
lesson. Nothing here claims this passed.

### 3. Classroom Wi-Fi

The load test ran clients and server **on one machine with no network between
them**. It proves the server's logic and timers cope with a full class without
errors, duplicated pupils or double rewards. It says **nothing** about how your
school's Wi-Fi will behave with 40 phones in one room. Access-point client
limits, radio contention and school firewalls are real and were not tested.
Please trial it with a handful of phones, then a full class.

### 4. Render itself

Nothing has been deployed. Cold-start times, the 15-minute sleep behaviour and
free instance-hour limits are from Render's documented behaviour, not measured
here. The first real deployment is the test of the deployment settings.

### 5. Real pupils

The pacing numbers come from a simulation that plays optimally and instantly.
Real Primary 4–6 pupils will be slower, so the 15–18 minute estimate is a
**floor**, and 25–35 minutes is the realistic expectation. Only a real lesson
will tell you whether the round length and tap allowance suit your class. Both
are adjustable mid-lesson.

### 6. Durability

Results are in memory and are lost on restart, redeploy or sleep. This is
stated on the dashboard, in the teacher guide and here. **No promise of
permanent saved progress is made.** CSV export is the durable record.
