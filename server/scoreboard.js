'use strict';
/**
 * Live scoreboards.
 *
 * Two completely separate rankings, computed from two separate sources:
 *
 *   English Stars      10 points for every answer correct on the FIRST attempt.
 *                      Retries stay available and still teach, but a question
 *                      answered correctly after a retry scores 0 points. No
 *                      question can ever score twice.
 *
 *   Festival Champions festival orders delivered, with game coins as the only
 *                      tie-break. Nothing from the English side is used.
 *
 * Ranking rules, applied to both boards:
 *   - Equal scores always get the equal rank ("standard competition ranking",
 *     so 1, 2, 2, 4 rather than 1, 2, 2, 3).
 *   - Answer speed is never used, for English or for the game. Nobody is
 *     rewarded for rushing, and a slower reader is never pushed down.
 *   - Within one shared rank, names are listed alphabetically purely so the
 *     screen does not jump about. That order carries no meaning.
 */

const POINTS_PER_FIRST_ATTEMPT = 10;

/**
 * Attach ranks to an already-sorted list.
 *
 * @param {Array} rows sorted best-first
 * @param {(row: object) => string} scoreKey everything that counts towards the
 *        rank, as a single comparable string. Rows sharing a key share a rank.
 */
function assignRanks(rows, scoreKey) {
  let lastKey = null;
  let lastRank = 0;
  rows.forEach((row, index) => {
    const key = scoreKey(row);
    if (key === lastKey) {
      row.rank = lastRank;
      row.tied = true;
    } else {
      row.rank = index + 1;
      lastRank = row.rank;
      lastKey = key;
      row.tied = false;
    }
  });
  // Mark every member of a shared rank, not just the second one onwards.
  const counts = new Map();
  for (const row of rows) counts.set(row.rank, (counts.get(row.rank) || 0) + 1);
  for (const row of rows) row.tied = counts.get(row.rank) > 1;
  return rows;
}

/** Case- and accent-insensitive name sort, used only to steady the display. */
function byName(a, b) {
  return String(a.displayName).localeCompare(String(b.displayName), undefined, {
    sensitivity: 'base',
    numeric: true,
  });
}

/**
 * English Stars.
 *
 * `attempted` travels with every row because pupils move at different speeds:
 * 30 points from 3 questions is not the same achievement as 30 points from 12,
 * and the screen must make that visible rather than hide it behind a rank.
 */
function englishBoard(pupils) {
  const rows = pupils.map((pupil) => {
    const summary = pupil.learningSummary();
    return {
      pupilId: pupil.id,
      displayName: pupil.displayName,
      connected: pupil.connected,
      points: summary.firstAttemptCorrect * POINTS_PER_FIRST_ATTEMPT,
      firstAttemptCorrect: summary.firstAttemptCorrect,
      correctAfterRetry: summary.correctAfterRetry,
      attempted: summary.attempted,
      retries: summary.retries,
      firstAttemptAccuracy: summary.firstAttemptAccuracy,
    };
  });

  rows.sort((a, b) => b.points - a.points || byName(a, b));
  return assignRanks(rows, (row) => `p${row.points}`);
}

/**
 * Festival Champions. Game progress only.
 */
function gameBoard(pupils) {
  const rows = pupils
    .filter((pupil) => pupil.game)
    .map((pupil) => {
      const summary = pupil.gameSummary();
      return {
        pupilId: pupil.id,
        displayName: pupil.displayName,
        connected: pupil.connected,
        missions: summary.requestsCompleted,
        coins: summary.coins,
        chapterId: summary.chapterId,
        chapterName: summary.chapterName,
        cluesFound: summary.cluesFound,
        mysterySolved: summary.mysterySolved,
      };
    });

  rows.sort((a, b) => b.missions - a.missions || b.coins - a.coins || byName(a, b));
  return assignRanks(rows, (row) => `m${row.missions}c${row.coins}`);
}

/** Everyone sharing rank 1. A tie means more than one winner, which is fine. */
function winnersOf(rows) {
  return rows.filter((row) => row.rank === 1);
}

/**
 * One pupil's own standing, for the compact panel on their phone.
 * Contains their own numbers and their own rank, and nobody else's.
 */
function personalStanding(pupilId, english, game) {
  const englishRow = english.find((row) => row.pupilId === pupilId) || null;
  const gameRow = game.find((row) => row.pupilId === pupilId) || null;
  return {
    english: englishRow
      ? {
          points: englishRow.points,
          rank: englishRow.rank,
          tied: englishRow.tied,
          attempted: englishRow.attempted,
          firstAttemptCorrect: englishRow.firstAttemptCorrect,
          correctAfterRetry: englishRow.correctAfterRetry,
        }
      : null,
    game: gameRow
      ? {
          missions: gameRow.missions,
          coins: gameRow.coins,
          rank: gameRow.rank,
          tied: gameRow.tied,
        }
      : null,
  };
}

/** Plain-English explanations, shown next to each board rather than hidden. */
const EXPLANATIONS = {
  english:
    'English Stars: 10 points for every answer you get right on your first try. ' +
    'Getting it right after a retry still counts as learning, but it does not add points. ' +
    'Answer speed is never used. Same points means the same rank.',
  game:
    'Festival Champions: ranked by festival orders delivered. If two detectives have ' +
    'delivered the same number, the one with more coins is higher. Same orders and ' +
    'same coins means the same rank. English answers never change this board.',
};

const LABELS = { english: 'English Stars', game: 'Festival Champions' };

/**
 * Build both boards plus the end-of-lesson winners.
 * @param {Array} pupils live pupils
 */
function build(pupils) {
  const english = englishBoard(pupils);
  const game = gameBoard(pupils);
  return {
    pointsPerFirstAttempt: POINTS_PER_FIRST_ATTEMPT,
    labels: LABELS,
    explanations: EXPLANATIONS,
    english,
    game,
    winners: {
      english: winnersOf(english).map((row) => ({
        displayName: row.displayName,
        points: row.points,
        attempted: row.attempted,
      })),
      game: winnersOf(game).map((row) => ({
        displayName: row.displayName,
        missions: row.missions,
        coins: row.coins,
      })),
    },
  };
}

/**
 * The version a pupil's phone receives.
 *
 * Their own standing is always included: it is their own data. The full list of
 * everyone is included only when the teacher has switched the public scoreboard
 * on, which is off by default.
 */
function forPupil(board, pupilId, publicScoreboard) {
  const payload = {
    pointsPerFirstAttempt: board.pointsPerFirstAttempt,
    labels: board.labels,
    explanations: board.explanations,
    me: personalStanding(pupilId, board.english, board.game),
    // How many detectives are playing, so a rank reads as "2 of 38".
    outOf: board.english.length,
    publicScoreboard: Boolean(publicScoreboard),
    english: null,
    game: null,
  };
  if (publicScoreboard) {
    // Names and scores only. No answers, no connection detail, no pupil ids.
    payload.english = board.english.map((row) => ({
      displayName: row.displayName,
      points: row.points,
      attempted: row.attempted,
      rank: row.rank,
      tied: row.tied,
      isMe: row.pupilId === pupilId,
    }));
    payload.game = board.game.map((row) => ({
      displayName: row.displayName,
      missions: row.missions,
      coins: row.coins,
      rank: row.rank,
      tied: row.tied,
      isMe: row.pupilId === pupilId,
    }));
  }
  return payload;
}

module.exports = {
  POINTS_PER_FIRST_ATTEMPT,
  EXPLANATIONS,
  LABELS,
  assignRanks,
  englishBoard,
  gameBoard,
  winnersOf,
  personalStanding,
  build,
  forPupil,
};
