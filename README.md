# Merge Mystery: The Missing Festival

A browser game for Primary 4–6 EFL pupils in Thailand. Each pupil plays on their
own phone. The teacher runs the lesson from a dashboard on a smart TV or laptop.

The town's festival supplies were delivered to the wrong places. Every pupil is a
detective: they answer two English questions, play a short merge puzzle to help a
townsperson, and earn a clue card. Five clue cards tell them where the missing
festival chest is hidden.

- **Pupils** open a link, type a nickname, and play. No accounts, no app, no email.
- **Teacher** signs in with one password, creates a room, and presses Start.
- **Cost** is zero on Render's free plan. No database, no advertising, no paid AI.

This is a **separate project** from any other game you may have. It has its own
repository and its own deployment, and it does not touch anything else.

---

## Contents

1. [What a lesson looks like](#what-a-lesson-looks-like)
2. [Deploying it (exact settings)](#deploying-it-exact-settings)
3. [Environment variables](#environment-variables)
4. [Free hosting limits](#free-hosting-limits)
5. [What survives what](#what-survives-what)
6. [The QR code](#the-qr-code)
7. [The game](#the-game)
8. [The English questions](#the-english-questions)
9. [Accessibility and phones](#accessibility-and-phones)
10. [Security](#security)
11. [Running it on your own computer](#running-it-on-your-own-computer)
12. [Tests](#tests)
13. [How the code is arranged](#how-the-code-is-arranged)

---

## What a lesson looks like

The default cycle, repeated until the teacher ends the lesson:

1. Answer **two English questions**. A wrong answer gets one retry and a hint.
2. Read the **feedback**, including the correct answer and a short explanation.
3. Play a **60-second merge round**.
4. Back to English.

The merge timer does not run while questions are on screen. Every pupil gets a
merge round after finishing the learning step, **including pupils who needed
corrections**, and they receive exactly the same game resources as everyone
else. English results and game results are counted, shown and exported
separately.

The teacher can set rounds to **30, 45, 60 or 90 seconds**, set the lesson
length, pause and resume safely, and switch any individual pupil into a
simplified merge mode or an English-only mode.

---

## Deploying it (exact settings)

Render's free plan is the cheapest sensible option and needs no card. Any host
that runs Node 20+ will work; the settings below are for Render.

### Create the service

In the Render dashboard choose **New → Web Service**, connect this repository,
and use these settings:

| Setting | Value |
| --- | --- |
| Language / Runtime | `Node` |
| Region | `Singapore` (closest to Thailand) |
| Branch | `main` |
| **Root Directory** | *leave blank* (the project is at the repository root) |
| **Build Command** | `npm install` |
| **Start Command** | `node server/index.js` |
| Instance Type | `Free` |
| Health Check Path | `/healthz` |

There are no dependencies to install, so the build takes a few seconds.

### Add the environment variables

Before the first deploy finishes, open the **Environment** tab and add:

| Name | Value |
| --- | --- |
| `TEACHER_PASSWORD` | your own long password, typed into Render's private field |
| `NODE_ENV` | `production` |

Leave `PUBLIC_BASE_URL` out for now, because you do not know the address yet.

> Never paste your password into a chat message, an email, or any file in this
> repository. Type it only into Render's own environment-variable box, which
> hides it.

### Set the public address, then redeploy

When the first deploy succeeds, Render shows the service URL, something like
`https://merge-mystery-festival.onrender.com`.

Add one more environment variable:

| Name | Value |
| --- | --- |
| `PUBLIC_BASE_URL` | that exact address, with **no trailing slash** |

Render redeploys automatically. This step matters: **QR codes are built from
`PUBLIC_BASE_URL`**. If it is missing or wrong, the QR code can point somewhere
a phone cannot reach. The dashboard warns you on screen if it detects a
localhost address.

### The two addresses you will use

| Who | Address |
| --- | --- |
| Pupils | `https://YOUR-SERVICE.onrender.com/` |
| Teacher | `https://YOUR-SERVICE.onrender.com/teacher` |

Replace `YOUR-SERVICE` with your real service name. A room's join link looks
like `https://YOUR-SERVICE.onrender.com/j/ABC123`.

---

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `TEACHER_PASSWORD` | yes | Password for the dashboard. Minimum 8 characters. Hashed with scrypt in memory at start-up; never logged, never sent to a browser. |
| `TEACHER_PASSWORD_HASH` | no | Use instead of `TEACHER_PASSWORD` if you prefer not to store the plain password with your host. Generate with `npm run hash-password`. Takes priority if both are set. |
| `PUBLIC_BASE_URL` | yes in production | Public address, no trailing slash. Used to build join links and QR codes. |
| `PORT` | no | Render sets this. Defaults to `3000` locally. |
| `NODE_ENV` | no | Set to `production` on your host so session cookies are always marked `Secure`. |

If `TEACHER_PASSWORD` is missing, the dashboard refuses every sign-in and says
so plainly. If `PUBLIC_BASE_URL` is missing, the server falls back to the
address the browser used and prints a warning in the logs.

---

## Free hosting limits

These are Render free-plan behaviours, not bugs in the game:

- **It sleeps.** After about 15 minutes with no traffic the service stops.
- **The first visit after sleeping is slow.** Expect roughly **30–60 seconds**
  for the first page to load while the service wakes up. Open the teacher
  dashboard a few minutes before your lesson so it is awake before pupils
  arrive.
- **Sleeping clears everything.** Rooms, pupils and results live in memory, so
  they are lost when the service sleeps, restarts or redeploys.
- **Monthly hours are limited.** Free instance hours are shared across your
  account. Because the service sleeps when idle, normal classroom use is
  comfortably inside the allowance.

Nothing in this project costs money. There is no database, no paid API and no
AI service. **If you ever want results to survive a restart, that needs a paid
database or a paid persistent disk, and I will explain the options and the cost
before anything is set up.** Until then, CSV export is the durable record.

---

## What survives what

| Situation | What happens |
| --- | --- |
| **Pupil refreshes the page** | Everything comes back: same nickname, same board, same chapter, same clue cards. A private rejoin token is stored on their own phone, so they return as the same pupil rather than a duplicate. |
| **Short Wi-Fi drop** (seconds to a minute) | Everything comes back. The page reconnects by itself. The teacher briefly sees them as "Offline", then "Online" again. Their merge round keeps its remaining time. |
| **Server restart, redeploy, or sleep** | **Nothing survives.** All rooms and results are gone, and pupils must join a new room. Export CSV before you finish. |
| **A later lesson** | Nothing carries over by design. Create a fresh room. Pupils start the story again. |

The dashboard says this on screen too, so you are never guessing.

---

## The QR code

Your previous game had scanning problems, so this one is built carefully:

- The QR code is generated on the server from the **full HTTPS join URL**, built
  from `PUBLIC_BASE_URL` — never `localhost`.
- The encoder is written from the ISO/IEC 18004 specification with no external
  library, at error-correction level **M**, with the specification's **4-module
  quiet zone** plus extra white padding in the panel around it.
- After generating it, the server **decodes its own QR code with a separate
  decoder** and checks that the text read back is character-for-character the
  join URL. The dashboard shows the result, and the **Check this QR code**
  button re-runs it and shows you both strings.
- **TV view** makes the code and the room code very large with strong contrast.
- **Copy join link** and **QR as image** are there for sharing another way.
- Pupils can always **type the 6-character room code** instead. The alphabet
  leaves out every look-alike character (no `O`/`0`, `I`/`1`, `S`/`5`, `Z`/`2`,
  `B`/`8`), and codes are accepted in lower case.

### The check only you can do

Software verification proves the picture contains the right text. It cannot
prove a particular phone camera will read it off your particular TV. **After
deploying, please do this once:**

1. Open the teacher dashboard, create a room, press **TV view**.
2. Point a real pupil phone's camera at the screen.
3. Confirm it offers the link, that the link matches the one shown, and that
   tapping it opens the join screen with the room code already filled in.
4. Try it from the back of the classroom too.

This physical check has **not** been performed. Nothing in this project claims
it has.

---

## The game

### The merge board

- **5 columns × 6 rows = 30 cells**, sized for a portrait phone.
- **Two identical items** of the same family and the same level join into one
  item of the next level. Different items never join; the tile shakes and a
  plain-English message explains why.
- Every tile shows its **picture, its name and its level number**, so nothing
  depends on telling colours apart.
- **Both** input styles work: drag a tile onto another, or tap one tile and then
  tap its match. Selection is marked with a thick border, a yellow ring **and** a
  tick.
- Five cells start **locked** and open as town requests are completed.

### Item families

Four families of five levels. These are game upgrades, not real recipes, and the
full chains are shown in the in-game **Item guide**.

| Family | Level 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| Paper decorations | Paper Shape | Paper Chain | Bunting | Festival Banner | Entrance Decoration |
| Flowers | Flower | Small Bunch | Bouquet | Flower Basket | Festival Flower Display |
| Gifts | Ribbon | Bow | Gift Bag | Gift Box | Festival Gift Chest |
| Lights | Candle | Small Lantern | Paper Lantern | Lantern String | Festival Light Arch |

Families arrive gradually: paper in chapter 1, flowers in chapter 2, gifts in
chapter 3, lights in chapter 4.

### Supply taps, the only limited resource

- Each supply source makes **one predictable family**, so planning matters.
- Tapping a source spends one **supply tap**. A round grants **8** taps, and
  unused taps **carry forward up to a visible cap of 24**.
- **Moving and merging are always free.** They never spend taps.
- Taps refill every round. There is **never** a payment, an advert or a
  real-time wait. If taps run out early, coins buy more at 5 coins each.

### Nobody gets stuck

- A **storage tray** with 3 slots parks awkward items.
- **Recycle** removes an unwanted item for coins, after a confirmation screen
  showing exactly what will be removed.
- **Hint** always suggests a genuinely useful next step, and highlights the
  tiles involved.
- If a pupil ever has no merge, no delivery, no taps and no coins, a
  **Helping hand** button appears. It clears the smallest item and grants 3
  taps, free.
- Boards, requests, coins and story progress persist between English rounds.
- The engine detects a blocked board itself, so this is not left to chance.

### Requests and choices

Three town requests are offered at a time, and the pupil chooses the order:

- **Quick** jobs (level 1–2) pay a little. **Longer** jobs (level 3–4) pay much
  more. The three on offer are always three *different* jobs.
- Requests only ever ask for a family that is already unlocked and an item that
  one full tap allowance can build.
- Delivering removes the item from the board and pays coins, town improvement,
  and progress towards the chapter's clue card.
- At each chapter's end the pupil **chooses between two decorations**, which
  then appear in the town's "after" picture.
- After the mystery is solved, **bonus festival orders** open so early finishers
  keep playing until the teacher ends the lesson.

### The five chapters

1. **Welcome Square** — Mayor Ploy needs decorations for the gate.
2. **Rainbow Café** — Mr Anan lost his flower boxes.
3. **Hobby Garden** — Miss Nin needs gift bags for the hobby show.
4. **Riverside Market** — Grandma Dao needs lanterns along the river.
5. **Festival Stage** — the whole town is waiting.

Each chapter awards one clue card of one or two short English sentences, then
asks a short comprehension question about it, with an explanation and a retry.
The five clues together point to exactly one place, and the three wrong final
answers are each wrong because of a specific clue the pupil already holds.

### How long it takes

The story needs 44 deliveries across the five chapters. Simulating efficient
play against the real engine gives roughly **8–10 merge rounds**, which is about
**15–18 minutes** of lesson time at 60-second rounds. Real pupils are slower
than a simulation, so expect **25–35 minutes** in practice, with bonus orders
filling whatever is left. Shorten it with 30-second rounds, or stretch it with
90-second rounds. Run `node tools/pacing.js` to see the estimates yourself.

---

## The English questions

**97 original questions**, one shared bank for all grades, running from easy
recognition to short reading and writing.

- **Topics:** greetings, feelings, introductions, polite requests, daily
  routines, food, hobbies, short everyday conversations.
- **Types:** multiple choice, sentence ordering with large tap controls,
  fill-in-the-blank with a typed answer, reading a 2–4 line conversation and
  answering a question, and short guided writing.
- **Difficulty 1 to 5.** Each pupil works up the ladder, shuffled within each
  band so neighbours do not see the same screen. Progress depends only on how
  many questions they have answered — **never** on how well they play the merge
  game.
- A question cannot reappear until twelve others have been seen.

Each question stores a unique id, topic, difficulty, type, prompt, any reading
passage, options, the correct answer, explicitly listed accepted alternatives,
and a short friendly explanation.

### Marking typed answers

- Leading and trailing spaces, repeated spaces and capitalisation are ignored.
- Straight and curly apostrophes are treated as the same character, and ordinary
  sentence punctuation is ignored.
- Only **explicitly listed** alternatives are accepted. There is no fuzzy or
  edit-distance matching, so a wrong meaning is never marked right: `tooth`,
  `teath` and `teet` are all wrong for `teeth`.
- Guided writing is marked on the **sentence frame only**. `I like ___` accepts
  any hobby the pupil chooses but rejects `I likes swimming`. Unrestricted
  creative writing is never auto-graded right or wrong.
- Two attempts per question. The first attempt being correct is recorded
  separately from being correct after a retry, and both are reported and
  exported separately.
- The model answer appears only once the retry is used up, never before.
- A finished question cannot be resubmitted for extra credit.

Answer keys, accepted lists, patterns and explanations are **never** sent to a
pupil's browser before they answer. Automated tests check every question for
this, including that a blank's answer does not appear in the prompt they read.

### Editing questions

The dashboard's **Question bank** tab lets you edit prompts, passages, choices,
correct answers, accepted alternatives and explanations. Every save is
validated, and is **refused** if it would make the correct answer fail, make a
wrong choice pass, empty the prompt, or break a pattern. There is also a
**Test** box to try a pupil answer and see exactly how the server reads it.

Edits live in memory, so they are lost on restart. Use **Download bank (JSON)**
to keep a copy.

---

## Accessibility and phones

- Portrait-first, with a landscape fallback. Safe-area insets respected on
  notched phones; tested CSS paths for small Android screens (360 px) and for
  short viewports when the on-screen keyboard appears.
- Minimum touch target 48 px. No double-tap zoom delay.
- The board uses `touch-action: none` so dragging a tile never scrolls the page,
  while **everything outside the board scrolls normally**.
- **No hover-only controls and no essential keyboard shortcuts.** Enter is a
  convenience next to a visible button.
- **Meaning never depends on colour alone.** Status chips carry a tick, cross or
  triangle; selection adds a tick; progress bars have a diagonal texture; tiles
  print their name and level as text.
- Large text and strong contrast throughout. The dashboard has a TV view with
  very large type.
- Optional sound effects, a mute toggle, and a reduced-motion toggle that also
  honours the phone's own "reduce motion" setting. **Audio is created only after
  the pupil's first tap**, so no browser blocks it and nothing plays unasked.
- A screen-reader live region announces merges, feedback and hints.

### Lightweight on purpose

The whole pupil app is **about 28 KB compressed** (110 KB uncompressed) with
**no images, no fonts and no third-party scripts**. All artwork is original SVG
drawn in the browser. Text responses are served with brotli or gzip.

---

## Security

- The teacher password is supplied privately through an environment variable,
  hashed with **scrypt** and compared in constant time. It is never logged,
  never written to a file, and never sent to a browser.
- Teacher sessions are random 32-byte tokens in `HttpOnly`, `SameSite=Lax`
  cookies, marked `Secure` in production, expiring after 8 hours.
- The correct password is checked **before** any lockout, on purpose: a whole
  school usually shares one public IP address, so a pupil guessing at the login
  form must not be able to lock the teacher out of their own dashboard. Guessing
  is slowed by the rate limiter and by scrypt instead.
- Every teacher endpoint rejects pupils and anonymous callers. Pupils cannot
  read another pupil's answers, the answer key, or anything teacher-only.
- Every game action is re-validated on the server, which owns the board. Each
  action carries a nonce, so a double-tap or a retried request cannot merge
  twice or pay a reward twice.
- A strict Content-Security-Policy with no inline scripts; all dynamic text is
  escaped.
- Nicknames are validated (Thai, Latin, digits, spaces and `. _ -` only; no
  markup, no links), length-capped, and the teacher can remove any nickname.
  Duplicates become `Mali`, `Mali (2)`, `Mali (3)`.
- CSV exports neutralise spreadsheet formula injection: any cell beginning
  `= + - @ |`, a tab or a return is prefixed with an apostrophe.
- A public leaderboard exists but is **off by default**, and when on it shows
  only game progress — never English marks.

---

## Running it on your own computer

Node 20 or newer. No dependencies to install.

```bash
git clone https://github.com/YOUR-USERNAME/merge-mystery-festival.git
cd merge-mystery-festival

TEACHER_PASSWORD='a-long-local-password' \
PUBLIC_BASE_URL='http://localhost:3000' \
npm start
```

Then open <http://localhost:3000/teacher>.

A QR code made with a `localhost` address cannot be scanned by a phone, and the
dashboard warns you about exactly that. For a local trial, use **Copy join
link** or the room code on devices on the same network, using your computer's
LAN address as `PUBLIC_BASE_URL`.

---

## Tests

```bash
npm test             # 203 automated tests
npm run test:load    # 45 simulated simultaneous pupils
node tools/pacing.js # lesson-length estimate
bash tools/smoke.sh  # end-to-end check against a running server
```

See [docs/TESTING.md](docs/TESTING.md) for exactly what was tested, what failed
and was fixed, and what still needs your own classroom check.

---

## How the code is arranged

Plain Node.js and plain browser JavaScript. **No dependencies at all**, so there
is no build step, no lockfile to rot, no supply-chain risk, and a cold start of
well under a second.

Server-Sent Events are used instead of WebSockets: the browser reconnects by
itself after the short drops that classroom Wi-Fi produces, and it needs no
extra library.

```
server/
  index.js         HTTP routing, all endpoints, timers, entry point
  rooms.js         rooms, pupils, the learning/merge cycle, server timers
  merge.js         board, items, missions, economy, chapters, clues, ending
  questions.js     the 97-question bank and its validator
  marking.js       answer normalisation and marking
  questionStore.js the editable bank, with validation on every save
  auth.js          scrypt password handling and teacher sessions
  csv.js           CSV export with formula-injection protection
  qr.js            QR encoder, written from the specification
  qrdecode.js      separate QR decoder, used to verify the encoder
  http.js          body parsing, cookies, static files, compression, SSE
public/
  index.html       pupil app
  teacher.html     teacher dashboard
  js/art.js        all original artwork, drawn as SVG in the browser
  js/pupil.js      pupil logic, board gestures, animations
  js/teacher.js    dashboard logic
  css/             design tokens, pupil styles, dashboard styles
tests/             203 automated tests, plus the load test
tools/             password hasher, pacing simulator, smoke test
docs/              teacher guide, testing report
```
