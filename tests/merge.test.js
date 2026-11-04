'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../server/merge');

const PLAY = { playing: true };
let nonceSeq = 0;
const n = () => `t${++nonceSeq}`;

function act(game, action) {
  return M.applyAction(game, { nonce: n(), ...action }, PLAY);
}

function board(index) {
  return { zone: 'board', index };
}
function tray(index) {
  return { zone: 'tray', index };
}

/** Put a specific item straight onto the board, bypassing the economy. */
function place(game, index, family, level) {
  game.board[index] = { uid: `fixed${index}-${family}-${level}`, family, level };
  return game.board[index];
}

// ---------------------------------------------------------------------------
// Board geometry and item families
// ---------------------------------------------------------------------------

test('board is 5 columns by 6 rows with a few locked cells', () => {
  assert.strictEqual(M.COLUMNS, 5);
  assert.strictEqual(M.ROWS, 6);
  assert.strictEqual(M.CELL_COUNT, 30);
  const game = M.createGame('p1');
  assert.ok(game.locked.length > 0 && game.locked.length < 10, 'a few cells start locked');
  assert.strictEqual(M.emptyCells(game).length, 30 - game.locked.length);
});

test('at least three item families each have five named levels', () => {
  const keys = Object.keys(M.FAMILIES);
  assert.ok(keys.length >= 3, `expected >= 3 families, found ${keys.length}`);
  for (const key of keys) {
    const family = M.FAMILIES[key];
    assert.strictEqual(family.levels.length, 5, `${key} must have five levels`);
    const names = family.levels.map((l) => l.name);
    assert.strictEqual(new Set(names).size, 5, `${key} has duplicate level names`);
    for (const name of names) assert.ok(name.trim().length > 0);
    assert.ok(family.source, `${key} needs a supply source name`);
  }
});

test('upgrade chains match the requested wording', () => {
  assert.deepStrictEqual(
    M.FAMILIES.paper.levels.map((l) => l.name),
    ['Paper Shape', 'Paper Chain', 'Bunting', 'Festival Banner', 'Entrance Decoration']
  );
  assert.deepStrictEqual(
    M.FAMILIES.flower.levels.map((l) => l.name),
    ['Flower', 'Small Bunch', 'Bouquet', 'Flower Basket', 'Festival Flower Display']
  );
  assert.deepStrictEqual(
    M.FAMILIES.ribbon.levels.map((l) => l.name),
    ['Ribbon', 'Bow', 'Gift Bag', 'Gift Box', 'Festival Gift Chest']
  );
});

// ---------------------------------------------------------------------------
// Generation allowance
// ---------------------------------------------------------------------------

test('tapping a supply source spends one tap and makes a level-1 item', () => {
  const game = M.createGame('p1');
  const before = game.charges;
  const result = act(game, { type: 'generate', family: 'paper' });
  assert.ok(result.ok);
  assert.strictEqual(game.charges, before - 1);
  const spawn = result.events.find((e) => e.type === 'spawn');
  assert.strictEqual(spawn.item.family, 'paper');
  assert.strictEqual(spawn.item.level, 1);
});

test('supply sources produce one predictable family each', () => {
  const game = M.createGame('p1');
  game.chapterIndex = 4; // all families unlocked
  for (const family of M.FAMILY_KEYS) {
    game.charges = 5;
    const result = act(game, { type: 'generate', family });
    assert.ok(result.ok, `generating ${family} failed`);
    assert.strictEqual(result.events[0].item.family, family);
  }
});

test('moving and merging never consume the generation allowance', () => {
  const game = M.createGame('p1');
  place(game, 0, 'paper', 1);
  place(game, 1, 'paper', 1);
  const before = game.charges;

  assert.ok(act(game, { type: 'move', from: board(1), to: board(7) }).ok);
  assert.strictEqual(game.charges, before, 'move must be free');

  assert.ok(act(game, { type: 'merge', from: board(7), to: board(0) }).ok);
  assert.strictEqual(game.charges, before, 'merge must be free');
});

test('unused taps carry forward up to the visible cap', () => {
  const game = M.createGame('p1');
  game.charges = 0;
  const first = M.startRound(game, 12);
  assert.strictEqual(first.charges, 12);

  const second = M.startRound(game, 12);
  assert.strictEqual(second.carriedIn, 12, 'previous taps carried in');
  assert.strictEqual(second.charges, 24, 'carried forward to the cap');

  const third = M.startRound(game, 12);
  assert.strictEqual(third.charges, M.CHARGE_CAP, 'never exceeds the cap');
  assert.strictEqual(third.granted, 0);
});

test('generation is refused with no taps left, and the message explains why', () => {
  const game = M.createGame('p1');
  game.charges = 0;
  const result = act(game, { type: 'generate', family: 'paper' });
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'no-charges');
  assert.match(result.message, /Merge, deliver, or recycle/);
});

test('a locked supply source cannot be used', () => {
  const game = M.createGame('p1'); // chapter 1 unlocks paper only
  const result = act(game, { type: 'generate', family: 'lantern' });
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'locked-family');
});

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

test('two identical items merge into one of the next level', () => {
  const game = M.createGame('p1');
  place(game, 0, 'paper', 2);
  place(game, 1, 'paper', 2);
  const result = act(game, { type: 'merge', from: board(0), to: board(1) });
  assert.ok(result.ok);
  assert.strictEqual(game.board[0], null, 'source cell is emptied');
  assert.strictEqual(game.board[1].level, 3);
  assert.strictEqual(game.board[1].family, 'paper');
  assert.strictEqual(result.events[0].newName, 'Bunting');
});

test('different families refuse to merge with a gentle explanation', () => {
  const game = M.createGame('p1');
  place(game, 0, 'paper', 1);
  place(game, 1, 'flower', 1);
  const result = act(game, { type: 'merge', from: board(0), to: board(1) });
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'different-family');
  assert.match(result.message, /different things/);
  assert.match(result.message, /same picture/);
  assert.ok(game.board[0] && game.board[1], 'nothing was destroyed');
});

test('different levels refuse to merge and name both levels', () => {
  const game = M.createGame('p1');
  place(game, 0, 'paper', 1);
  place(game, 1, 'paper', 2);
  const result = act(game, { type: 'merge', from: board(0), to: board(1) });
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'different-level');
  assert.match(result.message, /Level 1 and level 2/);
  assert.strictEqual(game.board[0].level, 1);
  assert.strictEqual(game.board[1].level, 2);
});

test('top-level items cannot merge further', () => {
  const game = M.createGame('p1');
  place(game, 0, 'paper', 5);
  place(game, 1, 'paper', 5);
  const result = act(game, { type: 'merge', from: board(0), to: board(1) });
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'max-level');
  assert.match(result.message, /biggest one/);
});

test('merging an item with itself is rejected', () => {
  const game = M.createGame('p1');
  place(game, 3, 'paper', 1);
  const result = act(game, { type: 'merge', from: board(3), to: board(3) });
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'same-slot');
});

test('merging an empty cell is rejected', () => {
  const game = M.createGame('p1');
  place(game, 0, 'paper', 1);
  assert.strictEqual(act(game, { type: 'merge', from: board(0), to: board(4) }).reason, 'empty-slot');
  assert.strictEqual(act(game, { type: 'merge', from: board(9), to: board(0) }).reason, 'empty-slot');
});

test('out-of-range and malformed slots are rejected', () => {
  const game = M.createGame('p1');
  place(game, 0, 'paper', 1);
  for (const badRef of [board(-1), board(999), { zone: 'nowhere', index: 0 }, { zone: 'board' }, null]) {
    const result = act(game, { type: 'merge', from: board(0), to: badRef });
    assert.ok(!result.ok, `ref ${JSON.stringify(badRef)} should be rejected`);
  }
});

test('a full five-level chain can be built from level-1 items', () => {
  const game = M.createGame('p1');
  game.charges = 40;
  game.locked = [];
  // 16 level-1 items -> one level-5 item.
  for (let i = 0; i < 16; i++) {
    assert.ok(act(game, { type: 'generate', family: 'paper' }).ok, `generate ${i}`);
  }
  for (let level = 1; level < 5; level++) {
    const slots = [];
    game.board.forEach((item, index) => {
      if (item && item.level === level) slots.push(index);
    });
    for (let i = 0; i + 1 < slots.length; i += 2) {
      assert.ok(act(game, { type: 'merge', from: board(slots[i]), to: board(slots[i + 1]) }).ok);
    }
  }
  const top = game.board.filter((item) => item && item.level === 5);
  assert.strictEqual(top.length, 1, 'exactly one level-5 item');
  assert.strictEqual(M.itemName(top[0].family, 5), 'Entrance Decoration');
});

// ---------------------------------------------------------------------------
// Moving, tray, recycling
// ---------------------------------------------------------------------------

test('items move to empty cells and into the storage tray', () => {
  const game = M.createGame('p1');
  place(game, 0, 'flower', 2);
  assert.ok(act(game, { type: 'move', from: board(0), to: tray(0) }).ok);
  assert.strictEqual(game.board[0], null);
  assert.strictEqual(game.tray[0].family, 'flower');

  assert.ok(act(game, { type: 'move', from: tray(0), to: board(12) }).ok);
  assert.strictEqual(game.tray[0], null);
  assert.strictEqual(game.board[12].family, 'flower');
});

test('an item in the tray can merge with one on the board', () => {
  const game = M.createGame('p1');
  place(game, 0, 'flower', 1);
  game.tray[1] = { uid: 'x', family: 'flower', level: 1 };
  const result = act(game, { type: 'merge', from: tray(1), to: board(0) });
  assert.ok(result.ok);
  assert.strictEqual(game.tray[1], null);
  assert.strictEqual(game.board[0].level, 2);
});

test('moving onto an occupied or locked cell is refused', () => {
  const game = M.createGame('p1');
  place(game, 0, 'paper', 1);
  place(game, 1, 'flower', 1);
  assert.strictEqual(act(game, { type: 'move', from: board(0), to: board(1) }).reason, 'occupied');

  const lockedIndex = game.locked[0];
  const result = act(game, { type: 'move', from: board(0), to: board(lockedIndex) });
  assert.strictEqual(result.reason, 'cell-locked');
  assert.match(result.message, /locked/);
});

test('recycling needs an explicit confirmation and pays coins', () => {
  const game = M.createGame('p1');
  place(game, 0, 'ribbon', 3);

  const unconfirmed = act(game, { type: 'recycle', from: board(0) });
  assert.ok(!unconfirmed.ok);
  assert.strictEqual(unconfirmed.reason, 'needs-confirm');
  assert.ok(game.board[0], 'item survives an unconfirmed recycle');

  const coinsBefore = game.coins;
  const confirmed = act(game, { type: 'recycle', from: board(0), confirmed: true });
  assert.ok(confirmed.ok);
  assert.strictEqual(game.board[0], null);
  assert.strictEqual(game.coins, coinsBefore + 6, 'refund scales with level');
});

// ---------------------------------------------------------------------------
// Dead-end prevention
// ---------------------------------------------------------------------------

test('a full board with no pair and no taps is detected as blocked', () => {
  const game = M.createGame('p1');
  game.locked = [];
  game.charges = 0;
  game.coins = 0;
  // Fill every cell and tray slot with level-5 items of different families so
  // nothing can merge and nothing matches a request.
  for (let i = 0; i < M.CELL_COUNT; i++) {
    place(game, i, M.FAMILY_KEYS[i % M.FAMILY_KEYS.length], 5);
  }
  for (let i = 0; i < M.TRAY_SLOTS; i++) {
    game.tray[i] = { uid: `tr${i}`, family: M.FAMILY_KEYS[i], level: 5 };
  }
  game.missions = [];

  const state = M.analyse(game);
  assert.ok(state.boardFull);
  assert.ok(!state.hasMergePair);
  assert.ok(state.blocked, 'engine recognises the dead end');
});

test('the helping hand recovers a blocked board and is free', () => {
  const game = M.createGame('p1');
  game.locked = [];
  game.charges = 0;
  game.coins = 0;
  game.missions = [];
  for (let i = 0; i < M.CELL_COUNT; i++) {
    place(game, i, M.FAMILY_KEYS[i % M.FAMILY_KEYS.length], 5);
  }
  for (let i = 0; i < M.TRAY_SLOTS; i++) {
    game.tray[i] = { uid: `tr${i}`, family: M.FAMILY_KEYS[i], level: 5 };
  }
  assert.ok(M.analyse(game).blocked);

  const rescue = act(game, { type: 'rescue' });
  assert.ok(rescue.ok);
  assert.strictEqual(game.coins, 0, 'rescue costs nothing');
  assert.ok(game.charges >= 3, 'taps topped up');
  assert.ok(M.emptyCells(game).length >= 1, 'space was made');
  assert.ok(!M.analyse(game).blocked, 'no longer blocked');
});

test('the helping hand is refused while the pupil can still play', () => {
  const game = M.createGame('p1');
  const result = act(game, { type: 'rescue' });
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'not-blocked');
});

test('coins buy extra supply taps, so resources never need waiting or payment', () => {
  const game = M.createGame('p1');
  game.charges = 0;
  game.coins = 12;
  assert.ok(act(game, { type: 'buy-charge' }).ok);
  assert.strictEqual(game.charges, 1);
  assert.strictEqual(game.coins, 12 - M.COINS_PER_CHARGE);

  game.coins = 1;
  assert.strictEqual(act(game, { type: 'buy-charge' }).reason, 'no-coins');
});

test('hints always propose a useful next step', () => {
  const game = M.createGame('p1');
  const fresh = M.hint(game);
  assert.strictEqual(fresh.kind, 'generate', 'with an empty board, make an item');

  // Pin the requests to level 4 so a level-1 pair cannot also be deliverable.
  game.missions = game.missions.map((m) => ({ ...m, level: 4, name: M.itemName(m.family, 4), cost: 8 }));
  place(game, 0, 'paper', 1);
  place(game, 1, 'paper', 1);
  const pair = M.hint(game);
  assert.strictEqual(pair.kind, 'merge');
  assert.strictEqual(pair.highlight.length, 2);
  assert.match(pair.message, /Paper Shape/);
  assert.match(pair.message, /Paper Chain/, 'the hint names what the merge produces');

  // Delivering outranks merging once the pupil holds a requested item.
  const mission = game.missions[0];
  place(game, 2, mission.family, mission.level);
  const deliver = M.hint(game);
  assert.strictEqual(deliver.kind, 'deliver');
  assert.strictEqual(deliver.missionId, mission.id);
  assert.match(deliver.message, /Deliver/);
});

test('delivering after the story ends never re-awards a clue or decoration', () => {
  const game = M.createGame('p1');
  game.storyComplete = true;
  game.chapterIndex = M.CHAPTERS.length - 1;
  game.chapterRequestsDone = M.CHAPTERS[4].requestsNeeded;
  game.clues = M.CHAPTERS.map((c) => c.clue.id);
  game.decorationChoice = null;

  const mission = game.missions[0];
  place(game, 0, mission.family, mission.level);
  const result = act(game, { type: 'deliver', missionId: mission.id, from: board(0) });
  assert.ok(result.ok);
  assert.strictEqual(game.clues.length, 5, 'no sixth clue card');
  assert.strictEqual(game.decorationChoice, null, 'no extra decoration choice');
  assert.ok(!result.events.some((e) => e.type === 'chapter-complete'), 'chapter not completed again');
});

test('the guided mission spells out every step for a struggling pupil', () => {
  const game = M.createGame('p1');
  const guided = M.guidedMission(game);
  assert.ok(guided.missionId);
  assert.ok(guided.steps.length >= 3);
  assert.match(guided.steps[0], /Tap the/);
  assert.match(guided.steps[2], /Deliver/);
});

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

test('exactly three requests are offered, mixing quick and longer jobs', () => {
  const game = M.createGame('p1');
  assert.strictEqual(game.missions.length, 3);
  const kinds = new Set(game.missions.map((m) => m.kind));
  assert.ok(kinds.has('quick'), 'at least one quick request');
  assert.ok(kinds.has('long'), 'at least one longer request');

  const quick = game.missions.find((m) => m.kind === 'quick');
  const long = game.missions.find((m) => m.kind === 'long');
  assert.ok(long.coins > quick.coins, 'longer requests reward more');
  assert.ok(long.cost > quick.cost, 'longer requests need more items');
});

test('requests never ask for an unavailable family or an unaffordable item', () => {
  for (let chapterIndex = 0; chapterIndex < M.CHAPTERS.length; chapterIndex++) {
    const game = M.createGame(`seed-${chapterIndex}`);
    game.chapterIndex = chapterIndex;
    game.missions = [];
    M.refillMissions(game);
    const allowed = M.unlockedFamilies(game);
    for (let i = 0; i < 60; i++) {
      for (const mission of game.missions) {
        assert.ok(allowed.includes(mission.family), `chapter ${chapterIndex + 1} asked for locked ${mission.family}`);
        assert.ok(mission.level >= 1 && mission.level <= 5);
        assert.ok(
          mission.cost <= game.chargeCap,
          `request needs ${mission.cost} items but the tap cap is ${game.chargeCap}`
        );
      }
      game.missions.shift();
      M.refillMissions(game);
    }
  }
});

test('delivering removes the item from the board and pays the reward', () => {
  const game = M.createGame('p1');
  const mission = game.missions[0];
  place(game, 5, mission.family, mission.level);
  const coinsBefore = game.coins;

  const result = act(game, { type: 'deliver', missionId: mission.id, from: board(5) });
  assert.ok(result.ok);
  assert.strictEqual(game.board[5], null, 'delivered item leaves the board');
  assert.strictEqual(game.coins, coinsBefore + mission.coins);
  assert.ok(!game.missions.some((m) => m.id === mission.id), 'request is retired');
  assert.strictEqual(game.missions.length, 3, 'a new request replaces it');
});

test('delivering the wrong item is refused and names what was wanted', () => {
  const game = M.createGame('p1');
  const mission = game.missions.find((m) => m.level > 1) || game.missions[0];
  place(game, 5, mission.family, mission.level === 1 ? 2 : 1);
  const result = act(game, { type: 'deliver', missionId: mission.id, from: board(5) });
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'wrong-item');
  assert.match(result.message, new RegExp(mission.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(game.board[5], 'the item stays on the board');
});

test('completing requests opens locked cells', () => {
  const game = M.createGame('p1');
  const lockedBefore = game.locked.length;
  let delivered = 0;
  for (let i = 0; i < 4 && game.missions.length > 0; i++) {
    const mission = game.missions[0];
    place(game, 10, mission.family, mission.level);
    assert.ok(act(game, { type: 'deliver', missionId: mission.id, from: board(10) }).ok);
    delivered++;
  }
  assert.ok(delivered >= 2);
  assert.ok(game.locked.length < lockedBefore, 'at least one cell was opened');
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('replaying the same action nonce never applies it twice', () => {
  const game = M.createGame('p1');
  place(game, 0, 'paper', 1);
  place(game, 1, 'paper', 1);
  const action = { nonce: 'fixed-nonce', type: 'merge', from: board(0), to: board(1) };

  const first = M.applyAction(game, action, PLAY);
  assert.ok(first.ok && !first.duplicate);
  assert.strictEqual(game.board[1].level, 2);

  const second = M.applyAction(game, action, PLAY);
  assert.ok(second.ok);
  assert.ok(second.duplicate, 'second application flagged as duplicate');
  assert.strictEqual(game.board[1].level, 2, 'board unchanged');
  assert.strictEqual(game.board[0], null);
});

test('a replayed delivery cannot pay the reward twice', () => {
  const game = M.createGame('p1');
  const mission = game.missions[0];
  place(game, 5, mission.family, mission.level);
  const action = { nonce: 'pay-once', type: 'deliver', missionId: mission.id, from: board(5) };

  M.applyAction(game, action, PLAY);
  const coinsAfterFirst = game.coins;
  const requestsAfterFirst = game.requestsCompleted;

  M.applyAction(game, action, PLAY);
  assert.strictEqual(game.coins, coinsAfterFirst, 'no double payment');
  assert.strictEqual(game.requestsCompleted, requestsAfterFirst, 'no double progress');
});

test('a replayed generate cannot spend two taps', () => {
  const game = M.createGame('p1');
  const action = { nonce: 'gen-once', type: 'generate', family: 'paper' };
  const before = game.charges;
  M.applyAction(game, action, PLAY);
  M.applyAction(game, action, PLAY);
  M.applyAction(game, action, PLAY);
  assert.strictEqual(game.charges, before - 1);
  assert.strictEqual(game.board.filter(Boolean).length, 1);
});

test('failed actions do not consume their nonce', () => {
  const game = M.createGame('p1');
  game.charges = 0;
  const action = { nonce: 'retry-me', type: 'generate', family: 'paper' };
  assert.ok(!M.applyAction(game, action, PLAY).ok);
  game.charges = 1;
  const retried = M.applyAction(game, action, PLAY);
  assert.ok(retried.ok, 'the same nonce works once the problem is fixed');
  assert.ok(!retried.duplicate);
});

test('gameplay actions are refused while the round is not running', () => {
  const game = M.createGame('p1');
  place(game, 0, 'paper', 1);
  place(game, 1, 'paper', 1);
  for (const type of ['generate', 'merge', 'move', 'deliver', 'recycle', 'rescue', 'buy-charge']) {
    const result = M.applyAction(
      game,
      { nonce: n(), type, family: 'paper', from: board(0), to: board(1), confirmed: true, missionId: 'x' },
      { playing: false }
    );
    assert.ok(!result.ok, `${type} should be blocked`);
    assert.strictEqual(result.reason, 'not-playing');
  }
  assert.strictEqual(game.board[0].level, 1, 'board untouched while paused');
});

// ---------------------------------------------------------------------------
// Story, clues and ending
// ---------------------------------------------------------------------------

test('there are exactly five chapters with the requested names', () => {
  assert.deepStrictEqual(
    M.CHAPTERS.map((c) => c.name),
    ['Welcome Square', 'Rainbow Caf\u00e9', 'Hobby Garden', 'Riverside Market', 'Festival Stage']
  );
});

test('each chapter offers two decorations and one clue card of one or two sentences', () => {
  for (const chapter of M.CHAPTERS) {
    assert.strictEqual(chapter.decorations.length, 2, `${chapter.name} needs two decoration choices`);
    const sentences = chapter.clue.sentences;
    assert.ok(sentences.length >= 1 && sentences.length <= 2, `${chapter.name} clue length`);
    for (const sentence of sentences) {
      assert.ok(sentence.length < 70, `clue sentence too long: ${sentence}`);
      assert.match(sentence, /[.!?]$/, 'clue sentences end with punctuation');
    }
    assert.ok(chapter.clue.check.options.includes(chapter.clue.check.answer));
    assert.ok(chapter.clue.check.explanation.length > 0);
  }
});

test('families are introduced gradually across the chapters', () => {
  const counts = M.CHAPTERS.map((c) => c.families.length);
  for (let i = 1; i < counts.length; i++) {
    assert.ok(counts[i] >= counts[i - 1], 'family count never shrinks');
  }
  assert.strictEqual(counts[0], 1, 'chapter 1 starts with one family');
  assert.ok(counts[counts.length - 1] >= 3, 'later chapters offer at least three');
});

test('clue checks accept the right answer, explain, and allow a retry', () => {
  const game = M.createGame('p1');
  const chapter = M.CHAPTERS[0];
  game.clues.push(chapter.clue.id);

  const wrongIndex = chapter.clue.check.options.findIndex((o) => o !== chapter.clue.check.answer);
  const wrong = act(game, { type: 'clue-answer', clueId: chapter.clue.id, optionIndex: wrongIndex });
  assert.ok(wrong.ok);
  assert.ok(!wrong.clue.correct);
  assert.ok(wrong.clue.canRetry, 'pupil may try again');
  assert.ok(wrong.clue.explanation.length > 0, 'explanation is given either way');

  const rightIndex = chapter.clue.check.options.indexOf(chapter.clue.check.answer);
  const right = act(game, { type: 'clue-answer', clueId: chapter.clue.id, optionIndex: rightIndex });
  assert.ok(right.clue.correct);
  assert.strictEqual(game.clueAttempts[chapter.clue.id].attempts, 2);
});

test('a clue card cannot be answered before it is found', () => {
  const game = M.createGame('p1');
  const result = act(game, { type: 'clue-answer', clueId: 'clue-3', optionIndex: 0 });
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'clue-locked');
});

test('exactly one finale option is correct and the wrong ones cite a clue', () => {
  const correct = M.FINALE.options.filter((o) => o.correct);
  assert.strictEqual(correct.length, 1);
  assert.match(correct[0].label, /bridge/i);
  for (const option of M.FINALE.options) {
    assert.ok(option.explanation.length > 20, `${option.id} needs an explanation`);
    if (!option.correct) {
      assert.match(option.explanation, /[Cc]lue \d/, `${option.id} should name the clue it fails`);
    }
  }
});

test('the ending matches the clues it was built from', () => {
  const ending = M.FINALE.ending.toLowerCase();
  for (const word of ['bridge', 'boat', 'lantern', 'water']) {
    assert.ok(ending.includes(word), `ending should mention "${word}"`);
  }
  // Every clue's key noun appears somewhere in the clue set that points there.
  const allClues = M.CHAPTERS.map((c) => c.clue.sentences.join(' ')).join(' ').toLowerCase();
  for (const word of ['outside', 'river', 'lantern', 'blue boat', 'wooden bridge']) {
    assert.ok(allClues.includes(word), `clues should establish "${word}"`);
  }
});

test('the finale is locked until all five clue cards are collected', () => {
  const game = M.createGame('p1');
  const result = act(game, { type: 'finale', optionId: 'bridge' });
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'story-locked');
});

test('a wrong finale answer explains and allows a retry', () => {
  const game = M.createGame('p1');
  game.storyComplete = true;
  const wrong = act(game, { type: 'finale', optionId: 'garden-shed' });
  assert.ok(wrong.ok);
  assert.ok(!wrong.finale.correct);
  assert.ok(wrong.finale.canRetry);
  assert.match(wrong.finale.explanation, /Clue 1/);
  assert.ok(!game.finaleSolved);

  const right = act(game, { type: 'finale', optionId: 'bridge' });
  assert.ok(right.finale.correct);
  assert.ok(game.finaleSolved);
  assert.ok(right.finale.ending.length > 50);
});

test('finishing the story unlocks bonus festival orders', () => {
  const game = M.createGame('p1');
  game.storyComplete = true;
  game.missions = [];
  M.refillMissions(game);
  assert.strictEqual(game.missions.length, 3);
  for (const mission of game.missions) {
    assert.ok(mission.bonus, 'post-story requests are bonus orders');
    assert.ok(mission.label, 'bonus orders carry a readable label');
  }
});

test('milestone decoration choice offers two options and records the pick', () => {
  const game = M.createGame('p1');
  const chapter = M.CHAPTERS[0];
  const events = [];
  // Drive the chapter to completion through the real reward path.
  game.chapterRequestsDone = chapter.requestsNeeded - 1;
  const mission = game.missions[0];
  place(game, 0, mission.family, mission.level);
  act(game, { type: 'deliver', missionId: mission.id, from: board(0) });
  void events;

  assert.ok(game.decorationChoice, 'a decoration choice is offered');
  assert.strictEqual(game.decorationChoice.options.length, 2);
  assert.strictEqual(game.improvements.welcome, 100, 'location is fully restored');
  assert.ok(game.clues.includes(chapter.clue.id), 'clue card awarded');

  const pick = game.decorationChoice.options[1].id;
  assert.ok(act(game, { type: 'choose-decoration', optionId: pick }).ok);
  assert.strictEqual(game.decorations.welcome, pick);
  assert.strictEqual(game.decorationChoice, null);
});

test('improvement percentage rises before and after a restoration', () => {
  const game = M.createGame('p1');
  assert.strictEqual(game.improvements.welcome, 0, 'before: nothing restored');
  const mission = game.missions[0];
  place(game, 0, mission.family, mission.level);
  act(game, { type: 'deliver', missionId: mission.id, from: board(0) });
  assert.ok(game.improvements.welcome > 0 && game.improvements.welcome < 100, 'partway through');
});

/**
 * Full playthrough driven only by legal actions, the way a pupil plays:
 * tap sources, merge pairs, deliver to requests, answer each clue, finish.
 */
test('a complete five-chapter story can be finished with legal actions only', () => {
  const game = M.createGame('playthrough');
  let rounds = 0;
  const maxRounds = 400;

  while (!game.finaleSolved && rounds < maxRounds) {
    rounds++;
    M.startRound(game, 12);

    // Answer any clue card that is waiting.
    for (const clue of game.clues) {
      const record = game.clueAttempts[clue];
      if (record && record.solved) continue;
      const chapter = M.CHAPTERS.find((c) => c.clue.id === clue);
      const index = chapter.clue.check.options.indexOf(chapter.clue.check.answer);
      act(game, { type: 'clue-answer', clueId: clue, optionIndex: index });
    }
    // Take any offered decoration.
    if (game.decorationChoice) {
      act(game, { type: 'choose-decoration', optionId: game.decorationChoice.options[0].id });
    }
    // Solve the mystery once all clues are in.
    if (game.storyComplete && !game.finaleSolved) {
      const result = act(game, { type: 'finale', optionId: 'bridge' });
      assert.ok(result.finale.correct);
      break;
    }

    // Work the cheapest request: generate, merge up, deliver.
    const target = game.missions.slice().sort((a, b) => a.cost - b.cost)[0];
    for (let i = 0; i < target.cost && game.charges > 0; i++) {
      if (M.emptyCells(game).length === 0) break;
      act(game, { type: 'generate', family: target.family });
    }
    for (let level = 1; level < 5; level++) {
      let pair = true;
      while (pair) {
        const slots = [];
        game.board.forEach((item, index) => {
          if (item && item.family === target.family && item.level === level) slots.push(index);
        });
        if (slots.length < 2) {
          pair = false;
          break;
        }
        act(game, { type: 'merge', from: board(slots[0]), to: board(slots[1]) });
      }
    }
    const ready = M.findDeliverable(game);
    if (ready) act(game, { type: 'deliver', missionId: ready.missionId, from: ready.ref });

    // Keep the board healthy, exactly as the UI would prompt.
    const state = M.analyse(game);
    if (state.blocked) act(game, { type: 'rescue' });
    else if (state.freeCells === 0) {
      const lowest = M.allItems(game).sort((a, b) => a.item.level - b.item.level)[0];
      if (lowest) act(game, { type: 'recycle', from: lowest.ref, confirmed: true });
    }
  }

  assert.ok(game.finaleSolved, `story not finished within ${maxRounds} rounds`);
  assert.strictEqual(game.clues.length, 5, 'all five clue cards collected');
  assert.strictEqual(Object.keys(game.decorations).length, 5, 'a decoration chosen per chapter');
  for (const chapter of M.CHAPTERS) {
    assert.strictEqual(game.improvements[chapter.key], 100, `${chapter.name} fully restored`);
  }
  assert.ok(rounds < maxRounds, 'finished with rounds to spare');

  // Early finishers keep playing.
  assert.strictEqual(game.missions.length, 3);
  assert.ok(game.missions.every((m) => m.bonus));
});

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

test('pupil state never includes clue answers or finale answers', () => {
  const game = M.createGame('p1');
  game.clues = M.CHAPTERS.map((c) => c.clue.id);
  game.storyComplete = true;
  const state = M.publicState(game);
  const json = JSON.stringify(state);

  for (const chapter of M.CHAPTERS) {
    assert.ok(!('answer' in state.clues.find((c) => c.id === chapter.clue.id).check));
  }
  for (const option of M.FINALE.options) {
    assert.ok(!json.includes(option.explanation), 'finale explanations are withheld until answered');
  }
  assert.ok(!json.includes('"correct":true'), 'no correctness flags leak');
});

test('pupil state exposes each item name, level and the visible tap cap', () => {
  const game = M.createGame('p1');
  place(game, 0, 'ribbon', 3);
  const state = M.publicState(game);
  assert.strictEqual(state.board[0].name, 'Gift Bag');
  assert.strictEqual(state.board[0].level, 3);
  assert.strictEqual(state.chargeCap, M.CHARGE_CAP);
  assert.strictEqual(state.columns, 5);
  assert.strictEqual(state.rows, 6);
  assert.ok(state.sources.length >= 1);
  assert.ok(state.sources.every((s) => s.makes && s.label));
});

test('a game survives a snapshot round-trip', () => {
  const game = M.createGame('p1');
  game.charges = 7;
  place(game, 3, 'flower', 2);
  act(game, { type: 'generate', family: 'paper' });

  const restored = M.fromSnapshot(JSON.parse(JSON.stringify(M.toSnapshot(game))), 'p1');
  assert.strictEqual(restored.charges, game.charges);
  assert.deepStrictEqual(restored.board, game.board);
  assert.strictEqual(typeof restored.random, 'function', 'RNG is rebuilt');

  // The restored game must still accept actions.
  place(restored, 4, 'flower', 2);
  assert.ok(M.applyAction(restored, { nonce: 'after-restore', type: 'merge', from: board(3), to: board(4) }, PLAY).ok);
  assert.strictEqual(restored.board[4].level, 3);
});

test('teacher summary separates story progress from game counters', () => {
  const game = M.createGame('p1');
  const summary = M.teacherSummary(game);
  for (const key of ['chapterName', 'chapterProgress', 'cluesFound', 'merges', 'deliveries', 'coins']) {
    assert.ok(key in summary, `summary missing ${key}`);
  }
  assert.ok(!('answers' in summary), 'no English answers in the game summary');
});

// ---------------------------------------------------------------------------
// Request quality: distinct choices, gentle early chapters
// ---------------------------------------------------------------------------

test('the three active requests are distinct jobs, not the same one twice', () => {
  for (let seed = 0; seed < 25; seed++) {
    for (let chapterIndex = 0; chapterIndex < M.CHAPTERS.length; chapterIndex++) {
      const game = M.createGame(`distinct-${seed}-${chapterIndex}`);
      game.chapterIndex = chapterIndex;
      game.missions = [];
      M.refillMissions(game);

      const keys = game.missions.map((m) => `${m.family}:${m.level}`);
      const families = M.unlockedFamilies(game);
      const ceiling = M.CHAPTERS[chapterIndex].maxRequestLevel;
      // Only demand uniqueness when enough distinct jobs actually exist.
      if (families.length * ceiling >= 3) {
        assert.strictEqual(
          new Set(keys).size,
          keys.length,
          `chapter ${chapterIndex + 1} offered duplicate requests: ${keys.join(', ')}`
        );
      }
    }
  }
});

test('early chapters never ask for an item above their level ceiling', () => {
  for (let chapterIndex = 0; chapterIndex < M.CHAPTERS.length; chapterIndex++) {
    const chapter = M.CHAPTERS[chapterIndex];
    assert.ok(chapter.maxRequestLevel >= 1 && chapter.maxRequestLevel <= 5);
    const game = M.createGame(`ceiling-${chapterIndex}`);
    game.chapterIndex = chapterIndex;
    game.missions = [];
    M.refillMissions(game);
    for (let i = 0; i < 80; i++) {
      for (const mission of game.missions) {
        assert.ok(
          mission.level <= chapter.maxRequestLevel,
          `${chapter.name} asked for level ${mission.level}, ceiling is ${chapter.maxRequestLevel}`
        );
      }
      game.missions.shift();
      M.refillMissions(game);
    }
  }
});

test('the request ceiling rises across the five chapters', () => {
  const ceilings = M.CHAPTERS.map((c) => c.maxRequestLevel);
  for (let i = 1; i < ceilings.length; i++) {
    assert.ok(ceilings[i] >= ceilings[i - 1], 'the ceiling never drops');
  }
  assert.strictEqual(ceilings[0], 3, 'chapter 1 stays gentle');
  assert.strictEqual(ceilings[ceilings.length - 1], 5, 'the last chapter allows the biggest items');
});

test('a chapter-1 request is affordable inside a single round allowance', () => {
  const game = M.createGame('affordable');
  for (const mission of game.missions) {
    assert.ok(
      mission.cost <= M.DEFAULT_ROUND_ALLOWANCE,
      `chapter 1 request "${mission.name}" needs ${mission.cost} taps but a round grants ${M.DEFAULT_ROUND_ALLOWANCE}`
    );
  }
});

// ---------------------------------------------------------------------------
// Lesson pacing
// ---------------------------------------------------------------------------

test('the story is neither trivially short nor impossible in one lesson', () => {
  const { averageRounds, lessonMinutes } = require('../tools/pacing');

  // A fast, efficient player. Real pupils are slower than this, so treat the
  // figure as the floor on how long the story takes.
  const fast = averageRounds(M.DEFAULT_ROUND_ALLOWANCE, 60, 4);
  assert.ok(fast.solvedAll, 'a fast player must be able to finish the story');
  assert.ok(
    fast.rounds >= 6,
    `a fast player finished in ${fast.rounds} rounds, which is too quick to feel like five chapters`
  );
  assert.ok(
    lessonMinutes(fast.rounds, 60) <= 45,
    `at 60 second rounds the story takes ${lessonMinutes(fast.rounds, 60)} minutes, too long for one lesson`
  );

  // A careful player must still finish inside a long lesson.
  const careful = averageRounds(M.DEFAULT_ROUND_ALLOWANCE, 14, 4);
  assert.ok(careful.solvedAll, 'a careful player must still be able to finish');
  assert.ok(
    lessonMinutes(careful.rounds, 30) <= 50,
    `a careful player needs ${lessonMinutes(careful.rounds, 30)} minutes even at 30 second rounds`
  );
});

test('a smaller teacher-set allowance still lets the story finish', () => {
  const { averageRounds } = require('../tools/pacing');
  // The dashboard allows 4 taps per round as the slowest setting.
  const slow = averageRounds(4, 40, 2);
  assert.ok(slow.solvedAll, 'the story must still be completable on the lowest allowance');
});

test('the request total is split so the first clue card arrives early', () => {
  const counts = M.CHAPTERS.map((c) => c.requestsNeeded);
  assert.ok(counts[0] <= counts[counts.length - 1], 'chapter 1 is not the longest');
  for (let i = 1; i < counts.length; i++) {
    assert.ok(counts[i] >= counts[i - 1], 'chapters never get shorter as the story goes on');
  }
  const total = counts.reduce((a, b) => a + b, 0);
  assert.ok(total >= 30 && total <= 60, `${total} requests in total is outside the tuned range`);
});
