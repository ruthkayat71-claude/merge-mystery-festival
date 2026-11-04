'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../server/scoreboard');

/** A stand-in pupil with just the two methods the scoreboard reads. */
function fakePupil(id, name, english, game) {
  return {
    id,
    displayName: name,
    connected: true,
    game: game ? {} : null,
    learningSummary: () => ({
      attempted: 0,
      firstAttemptCorrect: 0,
      correctAfterRetry: 0,
      incorrect: 0,
      retries: 0,
      firstAttemptAccuracy: null,
      ...english,
    }),
    gameSummary: () =>
      game
        ? {
            requestsCompleted: 0,
            coins: 0,
            chapterId: 1,
            chapterName: 'Welcome Square',
            cluesFound: 0,
            mysterySolved: false,
            ...game,
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// English Stars scoring
// ---------------------------------------------------------------------------

test('each first-attempt correct answer is worth exactly 10 points', () => {
  assert.strictEqual(S.POINTS_PER_FIRST_ATTEMPT, 10);
  const board = S.englishBoard([
    fakePupil('a', 'Mali', { attempted: 5, firstAttemptCorrect: 5 }, {}),
    fakePupil('b', 'Nok', { attempted: 5, firstAttemptCorrect: 3 }, {}),
    fakePupil('c', 'Dao', { attempted: 5, firstAttemptCorrect: 0 }, {}),
  ]);
  assert.strictEqual(board[0].points, 50);
  assert.strictEqual(board[1].points, 30);
  assert.strictEqual(board[2].points, 0);
});

test('a correct answer after a retry earns no leaderboard points', () => {
  const board = S.englishBoard([
    fakePupil('a', 'Mali', { attempted: 4, firstAttemptCorrect: 1, correctAfterRetry: 3 }, {}),
  ]);
  assert.strictEqual(board[0].points, 10, 'only the first-attempt answer scores');
  assert.strictEqual(board[0].correctAfterRetry, 3, 'but retries are still counted and shown');
});

test('repeated attempts can never add points', () => {
  // Two pupils answered the same number of questions. One got three right
  // first time; the other got one right first time and two after retries.
  const board = S.englishBoard([
    fakePupil('a', 'Mali', { attempted: 3, firstAttemptCorrect: 3, retries: 0 }, {}),
    fakePupil('b', 'Nok', { attempted: 3, firstAttemptCorrect: 1, correctAfterRetry: 2, retries: 2 }, {}),
  ]);
  assert.strictEqual(board.find((r) => r.displayName === 'Mali').points, 30);
  assert.strictEqual(board.find((r) => r.displayName === 'Nok').points, 10);
});

test('questions attempted travels with every row, because pupils differ in speed', () => {
  const board = S.englishBoard([
    fakePupil('a', 'Fast', { attempted: 12, firstAttemptCorrect: 3 }, {}),
    fakePupil('b', 'Careful', { attempted: 3, firstAttemptCorrect: 3 }, {}),
  ]);
  const fast = board.find((r) => r.displayName === 'Fast');
  const careful = board.find((r) => r.displayName === 'Careful');
  assert.strictEqual(fast.points, careful.points, 'same points');
  assert.strictEqual(fast.rank, careful.rank, 'and therefore the same rank');
  assert.strictEqual(fast.attempted, 12);
  assert.strictEqual(careful.attempted, 3);
  for (const row of board) assert.ok('attempted' in row, 'every row carries the count');
});

// ---------------------------------------------------------------------------
// Ranking rules
// ---------------------------------------------------------------------------

test('equal scores get equal ranks, and the next rank skips accordingly', () => {
  const board = S.englishBoard([
    fakePupil('a', 'Ann', { attempted: 9, firstAttemptCorrect: 9 }, {}),
    fakePupil('b', 'Ben', { attempted: 9, firstAttemptCorrect: 5 }, {}),
    fakePupil('c', 'Cat', { attempted: 9, firstAttemptCorrect: 5 }, {}),
    fakePupil('d', 'Dan', { attempted: 9, firstAttemptCorrect: 1 }, {}),
  ]);
  assert.deepStrictEqual(
    board.map((r) => [r.displayName, r.points, r.rank]),
    [['Ann', 90, 1], ['Ben', 50, 2], ['Cat', 50, 2], ['Dan', 10, 4]],
    'standard competition ranking: 1, 2, 2, 4'
  );
});

test('every member of a shared rank is flagged as tied', () => {
  const board = S.englishBoard([
    fakePupil('a', 'Ann', { firstAttemptCorrect: 5 }, {}),
    fakePupil('b', 'Ben', { firstAttemptCorrect: 5 }, {}),
    fakePupil('c', 'Cat', { firstAttemptCorrect: 1 }, {}),
  ]);
  assert.strictEqual(board[0].tied, true, 'the first of a tie is flagged too');
  assert.strictEqual(board[1].tied, true);
  assert.strictEqual(board[2].tied, false);
});

test('everyone on zero points shares rank 1', () => {
  const board = S.englishBoard([
    fakePupil('a', 'Ann', {}, {}),
    fakePupil('b', 'Ben', {}, {}),
    fakePupil('c', 'Cat', {}, {}),
  ]);
  for (const row of board) {
    assert.strictEqual(row.rank, 1);
    assert.strictEqual(row.tied, true);
  }
});

test('answer speed is never part of the English ranking', () => {
  // The scoreboard is given no timing data at all, so it cannot use any.
  const rows = S.englishBoard([fakePupil('a', 'Mali', { attempted: 3, firstAttemptCorrect: 2 }, {})]);
  // The row shape is asserted exactly. There is no timing field of any kind on
  // it, so the ranking cannot be influenced by how fast anyone answered.
  assert.deepStrictEqual(
    Object.keys(rows[0]).sort(),
    ['attempted', 'connected', 'correctAfterRetry', 'displayName', 'firstAttemptAccuracy',
      'firstAttemptCorrect', 'points', 'pupilId', 'rank', 'retries', 'tied'],
    'unexpected field on an English scoreboard row'
  );
  // And the whole module never reads a timestamp.
  const source = require('node:fs').readFileSync(require.resolve('../server/scoreboard'), 'utf8');
  for (const forbidden of ['Date.now', 'hrtime', '.at ', 'elapsed', 'duration', 'answeredAt']) {
    assert.ok(!source.includes(forbidden), `scoreboard.js references "${forbidden}"`);
  }
});

test('a tie is broken only by name, purely to steady the display', () => {
  const board = S.englishBoard([
    fakePupil('a', 'Zara', { firstAttemptCorrect: 5 }, {}),
    fakePupil('b', 'Anan', { firstAttemptCorrect: 5 }, {}),
  ]);
  assert.strictEqual(board[0].displayName, 'Anan', 'alphabetical within a shared rank');
  assert.strictEqual(board[0].rank, board[1].rank, 'but the rank is still shared');
});

// ---------------------------------------------------------------------------
// Festival Champions
// ---------------------------------------------------------------------------

test('the game board ranks by orders delivered, then coins', () => {
  const board = S.gameBoard([
    fakePupil('a', 'Ann', {}, { requestsCompleted: 4, coins: 10 }),
    fakePupil('b', 'Ben', {}, { requestsCompleted: 7, coins: 5 }),
    fakePupil('c', 'Cat', {}, { requestsCompleted: 4, coins: 90 }),
  ]);
  assert.deepStrictEqual(
    board.map((r) => [r.displayName, r.rank]),
    [['Ben', 1], ['Cat', 2], ['Ann', 3]],
    'more orders wins; coins only separate an equal number of orders'
  );
});

test('identical orders and coins share a rank on the game board', () => {
  const board = S.gameBoard([
    fakePupil('a', 'Ann', {}, { requestsCompleted: 3, coins: 30 }),
    fakePupil('b', 'Ben', {}, { requestsCompleted: 3, coins: 30 }),
  ]);
  assert.strictEqual(board[0].rank, 1);
  assert.strictEqual(board[1].rank, 1);
  assert.ok(board[0].tied && board[1].tied);
});

test('the game board shows coins and orders separately and carries no English data', () => {
  const board = S.gameBoard([
    fakePupil('a', 'Ann', { attempted: 9, firstAttemptCorrect: 9 }, { requestsCompleted: 2, coins: 40 }),
  ]);
  const row = board[0];
  assert.strictEqual(row.missions, 2);
  assert.strictEqual(row.coins, 40);
  for (const forbidden of ['points', 'firstAttemptCorrect', 'attempted', 'retries', 'correctAfterRetry']) {
    assert.ok(!(forbidden in row), `the game board must not carry "${forbidden}"`);
  }
});

test('English points never influence the game board, and vice versa', () => {
  const pupils = [
    fakePupil('a', 'Strong English', { attempted: 20, firstAttemptCorrect: 20 }, { requestsCompleted: 1, coins: 2 }),
    fakePupil('b', 'Strong Game', { attempted: 2, firstAttemptCorrect: 0 }, { requestsCompleted: 9, coins: 200 }),
  ];
  const board = S.build(pupils);
  assert.strictEqual(board.english[0].displayName, 'Strong English');
  assert.strictEqual(board.game[0].displayName, 'Strong Game');
  assert.strictEqual(board.english.find((r) => r.displayName === 'Strong Game').rank, 2);
  assert.strictEqual(board.game.find((r) => r.displayName === 'Strong English').rank, 2);
});

test('pupils in English-only mode appear on the English board but not the game board', () => {
  const board = S.build([
    fakePupil('a', 'Mali', { attempted: 4, firstAttemptCorrect: 4 }, null),
    fakePupil('b', 'Nok', { attempted: 4, firstAttemptCorrect: 2 }, { requestsCompleted: 1 }),
  ]);
  assert.strictEqual(board.english.length, 2);
  assert.strictEqual(board.game.length, 1);
  assert.strictEqual(board.game[0].displayName, 'Nok');
});

// ---------------------------------------------------------------------------
// Winners and explanations
// ---------------------------------------------------------------------------

test('winners are separate for English and the game, and a tie means two winners', () => {
  const board = S.build([
    fakePupil('a', 'Ann', { attempted: 5, firstAttemptCorrect: 5 }, { requestsCompleted: 1, coins: 1 }),
    fakePupil('b', 'Ben', { attempted: 5, firstAttemptCorrect: 5 }, { requestsCompleted: 4, coins: 9 }),
    fakePupil('c', 'Cat', { attempted: 5, firstAttemptCorrect: 1 }, { requestsCompleted: 4, coins: 9 }),
  ]);
  assert.deepStrictEqual(board.winners.english.map((w) => w.displayName).sort(), ['Ann', 'Ben']);
  assert.deepStrictEqual(board.winners.game.map((w) => w.displayName).sort(), ['Ben', 'Cat']);
  assert.strictEqual(board.winners.english[0].points, 50);
  assert.ok('attempted' in board.winners.english[0], 'the winner card shows how many were asked');
});

test('both boards carry a plain-English explanation of how they work', () => {
  const board = S.build([]);
  assert.match(board.explanations.english, /10 points/);
  assert.match(board.explanations.english, /first try/);
  assert.match(board.explanations.english, /does not add points/);
  assert.match(board.explanations.english, /speed is never used/i);
  assert.match(board.explanations.english, /[Ss]ame rank/);

  assert.match(board.explanations.game, /orders delivered/);
  assert.match(board.explanations.game, /coins/);
  assert.match(board.explanations.game, /[Ss]ame rank/);
  assert.match(board.explanations.game, /English answers never change this board/);

  assert.strictEqual(board.labels.english, 'English Stars');
  assert.strictEqual(board.labels.game, 'Festival Champions');
});

// ---------------------------------------------------------------------------
// What reaches a pupil's phone
// ---------------------------------------------------------------------------

test('a pupil always sees their own score and rank, even with the board switched off', () => {
  const pupils = [
    fakePupil('a', 'Mali', { attempted: 6, firstAttemptCorrect: 4 }, { requestsCompleted: 3, coins: 20 }),
    fakePupil('b', 'Nok', { attempted: 6, firstAttemptCorrect: 6 }, { requestsCompleted: 5, coins: 60 }),
  ];
  const board = S.build(pupils);
  const mine = S.forPupil(board, 'a', false);

  assert.strictEqual(mine.me.english.points, 40);
  assert.strictEqual(mine.me.english.rank, 2);
  assert.strictEqual(mine.me.english.attempted, 6);
  assert.strictEqual(mine.me.game.missions, 3);
  assert.strictEqual(mine.me.game.rank, 2);
  assert.strictEqual(mine.outOf, 2, 'they can see how many are playing');

  assert.strictEqual(mine.english, null, 'the full list is withheld');
  assert.strictEqual(mine.game, null);
  assert.strictEqual(mine.publicScoreboard, false);
  assert.ok(!JSON.stringify(mine).includes('Nok'), 'no other pupil is named');
});

test('switching the public scoreboard on sends names and scores but nothing private', () => {
  const pupils = [
    fakePupil('a', 'Mali', { attempted: 6, firstAttemptCorrect: 4 }, { requestsCompleted: 3, coins: 20 }),
    fakePupil('b', 'Nok', { attempted: 6, firstAttemptCorrect: 6 }, { requestsCompleted: 5, coins: 60 }),
  ];
  const board = S.build(pupils);
  const mine = S.forPupil(board, 'a', true);

  assert.strictEqual(mine.publicScoreboard, true);
  assert.strictEqual(mine.english.length, 2);
  assert.strictEqual(mine.game.length, 2);
  assert.strictEqual(mine.english.find((r) => r.isMe).displayName, 'Mali');

  for (const row of mine.english.concat(mine.game)) {
    assert.ok(!('pupilId' in row), 'pupil ids are not shared with other pupils');
    assert.ok(!('connected' in row), 'connection detail is teacher-only');
    assert.ok(!('retries' in row), 'retry counts are not published');
    assert.ok(!('firstAttemptAccuracy' in row), 'accuracy is not published');
  }
  // The published English rows carry points and the attempt count, nothing more.
  assert.deepStrictEqual(
    Object.keys(mine.english[0]).sort(),
    ['attempted', 'displayName', 'isMe', 'points', 'rank', 'tied']
  );
  assert.deepStrictEqual(
    Object.keys(mine.game[0]).sort(),
    ['coins', 'displayName', 'isMe', 'missions', 'rank', 'tied']
  );
});

test('an empty room produces empty boards rather than an error', () => {
  const board = S.build([]);
  assert.deepStrictEqual(board.english, []);
  assert.deepStrictEqual(board.game, []);
  assert.deepStrictEqual(board.winners.english, []);
  assert.deepStrictEqual(board.winners.game, []);
  const mine = S.forPupil(board, 'nobody', true);
  assert.strictEqual(mine.me.english, null);
  assert.strictEqual(mine.me.game, null);
});

test('ranking 60 pupils is correct and stable', () => {
  const pupils = [];
  for (let i = 0; i < 60; i++) {
    pupils.push(fakePupil(`p${i}`, `Pupil${String(i).padStart(2, '0')}`, {
      attempted: 10,
      firstAttemptCorrect: i % 5, // deliberately lots of ties
    }, { requestsCompleted: i % 3, coins: i % 7 }));
  }
  const board = S.build(pupils);
  assert.strictEqual(board.english.length, 60);

  // Points must never increase as we walk down the list.
  for (let i = 1; i < board.english.length; i++) {
    assert.ok(board.english[i].points <= board.english[i - 1].points, 'sorted best first');
    if (board.english[i].points === board.english[i - 1].points) {
      assert.strictEqual(board.english[i].rank, board.english[i - 1].rank, 'equal points, equal rank');
    } else {
      assert.ok(board.english[i].rank > board.english[i - 1].rank);
    }
  }
  // Running it again gives exactly the same order.
  assert.deepStrictEqual(S.build(pupils).english, board.english);
});
