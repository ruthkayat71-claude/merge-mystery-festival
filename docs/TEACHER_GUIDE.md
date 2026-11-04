# Teacher Guide

**Merge Mystery: The Missing Festival**
English Communication · Primary 4–6 · reading and writing

Everything here is also in the dashboard's **Help** tab.

---

## Before the lesson (5 minutes)

1. **Wake the site up.** On the free hosting plan the site goes to sleep when
   nobody is using it. Open your teacher address a few minutes early and wait
   for it to load. The first load can take up to a minute. After that it is fast.

2. **Sign in.** Go to `https://YOUR-SERVICE.onrender.com/teacher` and enter your
   password.

3. **Create a room.** Press **Create a room**. You now have a 6-letter code, a
   join link, and a QR code.

4. **Put it on the TV.** Press **TV view**. The code and QR code fill the screen.

---

## Running the lesson

### 1. Pupils join

They can do any one of these. All three do the same thing.

- Point their phone camera at the QR code on the TV.
- Open the join link you shared.
- Go to `https://YOUR-SERVICE.onrender.com` and type the room code.

Then they type a nickname. Ask them to use first names or made-up detective
names, not full real names. If two pupils pick "Mali", the second becomes
"Mali (2)", so you can still tell them apart.

Watch the **Joined** and **Connected** counters. When everyone is in, press
**Exit TV view**.

### 2. Press Start

Each pupil then repeats this cycle on their own, at their own speed:

1. Two English questions. A wrong answer gets **one retry** and a hint.
2. A feedback screen with the correct answer and a short explanation.
3. A 60-second merge round.
4. Back to English.

Timers only run during merge rounds, never while a question is on screen.

> **Important:** every pupil gets a merge round after finishing the questions,
> whether their answers were right or wrong, and they all receive the same game
> resources. Doing badly at English never reduces anyone's playing time, and
> doing well at merging never makes the English easier or harder.

### 3. Watch the Pupils tab

The table is split into two halves on purpose:

- **English results** — questions attempted, right first try, right after a
  retry, number of retries, first-try accuracy.
- **Game results** — chapter, requests finished, clue cards, mystery solved.

Also shown: whether each pupil is online, and what they are doing right now
("English question", "Merge round", "Reading feedback").

Press **Answers** next to a pupil to read every answer they typed, in order,
with what the correct answer was.

### 4. Pause when you need the class's attention

**Pause** freezes every pupil's board and stops every timer. **Resume** gives
back exactly the time that was left. Nothing is lost.

### 5. Before you finish: export the results

> Results are kept in the server's memory only. They are **lost** if the service
> restarts, redeploys or goes to sleep. **Export before you end the lesson.**

In the **Pupils** tab:

- **English results (CSV)** — one row per pupil.
- **Every answer (CSV)** — one row per attempt.
- **Game results (CSV)** — the merge game, kept separate.

The files open correctly in Excel and Google Sheets, including Thai names.

### 6. End the lesson

Press **End lesson** and confirm. Every pupil sees a finish screen with their own
summary.

---

## Changing the pace

All in the **Lesson control** tab.

| Setting | What it does | When to change it |
| --- | --- | --- |
| **Merge round length** | 30, 45, 60 or 90 seconds | 30s for a short lesson or a restless class; 90s for a calm class that likes planning |
| **Lesson length** | minutes before the lesson ends itself | Match your period |
| **Supply taps per round** | 4 to 24 | Fewer makes the game slower and more thoughtful; more makes it faster |

The five-chapter story takes most pupils about 25–35 minutes at 60-second
rounds. Shorten it with 30-second rounds. Pupils who finish early get **bonus
festival orders** and keep playing until you end the lesson.

---

## Helping a pupil who is struggling

### With the merge game

In the **Pupils** tab, next to that pupil:

- **Simple** — simplified merge mode. Every item that has a matching partner is
  highlighted automatically, and the hint button gives step-by-step guidance.
- **Eng only** — English-only mode. That pupil skips merge rounds and goes
  straight from one set of questions to the next.

Pupils can also help themselves at any time:

- **Hint** — always suggests a genuinely useful next step and highlights the
  tiles.
- **Recycle** — removes an unwanted item for a few coins, after confirming.
- **Helping hand** — appears only if they truly have no moves left. Clears the
  smallest item and gives free supply taps.

Nobody can get permanently stuck. The game checks for a blocked board itself.

### With English

Everyone sees the same bank, starting at the easiest questions. A pupil who
finds it hard simply moves up the ladder more slowly. You can also edit any
question in the **Question bank** tab, or add more accepted answers.

---

## If a nickname is inappropriate

In the **Pupils** tab press **Remove** next to that pupil. They are signed out
and must join again with a new nickname. Their answers stay in your results and
in the CSV export.

---

## If the QR code will not scan

Please check this once yourself before relying on it in class — point a real
phone at the TV and confirm the game opens.

If a phone will not read it:

1. Press **Copy join link** and send the link by any means you normally use.
2. Or ask pupils to type the room code at your site address. Codes work in
   lower case, and every confusing character (`O`/`0`, `I`/`1`, `S`/`5`) has been
   left out of the alphabet.
3. Check the dashboard for a red warning about `localhost`. If you see one, the
   `PUBLIC_BASE_URL` setting needs fixing — see the README.
4. Press **Check this QR code** to see the exact link encoded and the exact text
   decoded back out of the picture.

Practical things that help: turn the room lights down a little, make sure the TV
is not reflecting a window, and ask pupils to hold the phone still about a metre
from a large QR code.

---

## If a pupil's phone loses connection

Nothing to do. The page reconnects by itself and comes back to the same board
with the same remaining time. You will briefly see **Offline** next to their
name.

If a pupil refreshes or accidentally closes the tab, they reopen the link and
return as the same pupil — not as a duplicate.

---

## What is kept, and what is not

| Situation | Kept? |
| --- | --- |
| Pupil refreshes their phone | **Yes** — same pupil, same board, same clues |
| Short Wi-Fi drop | **Yes** — reconnects by itself |
| Site restarts, redeploys or sleeps | **No** — export CSV first |
| A later lesson | **No** — make a new room; the story starts again |

---

## The story, so you can help

The festival supplies went to the wrong places. Pupils help five townspeople and
earn one clue card each time:

| Chapter | Place | Who | Clue |
| --- | --- | --- | --- |
| 1 | Welcome Square | Mayor Ploy | The chest is not inside a building. It is outside, under the open sky. |
| 2 | Rainbow Café | Mr Anan | You can hear water from the chest. It is near the river. |
| 3 | Hobby Garden | Miss Nin | A lantern hangs above the chest. It gives light at night. |
| 4 | Riverside Market | Grandma Dao | A small blue boat is beside the chest. |
| 5 | Festival Stage | Mayor Ploy | Look under the old wooden bridge. The blue boat is tied there. |

**The answer is: under the old wooden bridge, beside the blue boat.** It is the
only choice that fits all five clues. Each wrong choice is wrong because of a
clue the pupil already has, and the game explains which one and lets them try
again.

There is nothing frightening, no violence, and nobody is ever accused of
anything.

---

## Pupil tutorial

Pupils see three screens the first time they play. You can show them again from
the pupil **Settings** menu.

1. **Answer two questions.** Read the English question and choose or type your
   answer. If it is wrong, you get one more try and a hint.
2. **Join two the same.** Tap a supply box to make an item. Tap one item, then
   tap another that looks the same. They join and grow bigger.
3. **Help the town, find the chest.** Deliver the items people ask for. Each
   place you fix gives you a clue card. Five clues tell you where the festival
   chest is hidden.

---

## Pupil settings

Pupils have a **⚙** button with:

- **Sound** on or off.
- **Less movement** — reduces animations, for pupils who find them distracting
  or who feel travel-sick. It also follows the phone's own setting automatically.
- **Show how to play again**.

And three reference screens:

- **Map** — the five places, with before-and-after pictures.
- **Notes** — the detective notebook with every clue card collected.
- **Items** — the full upgrade chain for every item family.
