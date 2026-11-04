'use strict';
/**
 * Pacing simulator.
 *
 * Drives the real game engine with three player strategies to estimate how
 * many merge rounds a pupil needs to finish the five-chapter story, and what
 * that means in lesson minutes. Used to tune the economy; not part of the
 * automated test suite, which asserts the resulting bounds instead.
 *
 *   node tools/pacing.js             estimate the shipped balance
 *   node tools/pacing.js --sweep     compare parameter choices
 */

const M = require('../server/merge');

const board = (index) => ({ zone: 'board', index });
let nonce = 0;
const act = (game, action) => M.applyAction(game, { nonce: `sim${++nonce}`, ...action }, { playing: true });

/**
 * One merge round. `budget` caps how many taps and drags the pupil manages in
 * the time available, which is what separates a careful player from a fast one.
 */
function playRound(game, budget) {
  let actions = 0;
  for (;;) {
    if (game.charges <= 0 || actions >= budget) break;

    let ready = M.findDeliverable(game);
    while (ready && actions < budget) {
      act(game, { type: 'deliver', missionId: ready.missionId, from: ready.ref });
      actions++;
      ready = M.findDeliverable(game);
    }

    const target = game.missions.slice().sort((a, b) => a.cost - b.cost)[0];
    if (!target || target.cost > game.charges) break;

    let made = 0;
    for (let i = 0; i < target.cost && game.charges > 0 && actions < budget; i++) {
      if (M.emptyCells(game).length === 0) break;
      if (act(game, { type: 'generate', family: target.family }).ok) {
        made++;
        actions++;
      }
    }
    if (made === 0) break;

    for (let level = 1; level < 5; level++) {
      for (;;) {
        const slots = [];
        game.board.forEach((item, index) => {
          if (item && item.family === target.family && item.level === level) slots.push(index);
        });
        if (slots.length < 2) break;
        act(game, { type: 'merge', from: board(slots[0]), to: board(slots[1]) });
        actions++;
      }
    }

    const deliverable = M.findDeliverable(game);
    if (deliverable) {
      act(game, { type: 'deliver', missionId: deliverable.missionId, from: deliverable.ref });
      actions++;
    } else {
      break;
    }
  }
  return actions;
}

/** Run a whole story and report how many rounds it took. */
function runStory({ allowance, budget, seed }) {
  const game = M.createGame(`pace-${seed}`, { roundAllowance: allowance });
  let rounds = 0;

  while (!game.finaleSolved && rounds < 400) {
    rounds++;
    M.startRound(game, allowance);

    for (const clueId of game.clues) {
      const record = game.clueAttempts[clueId];
      if (record && record.solved) continue;
      const chapter = M.CHAPTERS.find((c) => c.clue.id === clueId);
      act(game, {
        type: 'clue-answer',
        clueId,
        optionIndex: chapter.clue.check.options.indexOf(chapter.clue.check.answer),
      });
    }
    if (game.decorationChoice) {
      act(game, { type: 'choose-decoration', optionId: game.decorationChoice.options[0].id });
    }
    if (game.storyComplete && !game.finaleSolved) {
      act(game, { type: 'finale', optionId: 'bridge' });
      break;
    }

    playRound(game, budget);

    const state = M.analyse(game);
    if (state.blocked) {
      act(game, { type: 'rescue' });
    } else if (state.freeCells === 0) {
      const lowest = M.allItems(game).sort((a, b) => a.item.level - b.item.level)[0];
      if (lowest) act(game, { type: 'recycle', from: lowest.ref, confirmed: true });
    }
  }
  return { rounds, solved: game.finaleSolved, requests: game.requestsCompleted };
}

/** Lesson minutes for a round count: one round plus its English step. */
function lessonMinutes(rounds, roundSeconds, englishSeconds = 50) {
  return Math.round((rounds * (roundSeconds + englishSeconds)) / 60);
}

const STRATEGIES = [
  { name: 'fast player', budget: 60 },
  { name: 'typical player', budget: 28 },
  { name: 'careful player', budget: 14 },
];

function averageRounds(allowance, budget, seeds = 5) {
  let total = 0;
  let solvedAll = true;
  for (let seed = 0; seed < seeds; seed++) {
    const result = runStory({ allowance, budget, seed });
    total += result.rounds;
    if (!result.solved) solvedAll = false;
  }
  return { rounds: Math.round(total / seeds), solvedAll };
}

function report() {
  const allowance = M.DEFAULT_ROUND_ALLOWANCE;
  const needed = M.CHAPTERS.reduce((sum, c) => sum + c.requestsNeeded, 0);

  console.log('Merge Mystery pacing estimate');
  console.log(`  supply taps per round : ${allowance} (carry forward cap ${M.CHARGE_CAP})`);
  console.log(`  requests to finish    : ${needed} across 5 chapters ` +
    `(${M.CHAPTERS.map((c) => c.requestsNeeded).join(' + ')})`);
  console.log(`  request level ceiling : ${M.CHAPTERS.map((c) => c.maxRequestLevel).join(' -> ')}`);
  console.log('');
  console.log('  strategy          rounds   @30s round   @60s round   @90s round');
  for (const strategy of STRATEGIES) {
    const { rounds, solvedAll } = averageRounds(allowance, strategy.budget);
    console.log(
      `  ${strategy.name.padEnd(16)}  ${String(rounds).padStart(5)}   ` +
      `${String(lessonMinutes(rounds, 30) + ' min').padStart(10)}   ` +
      `${String(lessonMinutes(rounds, 60) + ' min').padStart(10)}   ` +
      `${String(lessonMinutes(rounds, 90) + ' min').padStart(10)}` +
      (solvedAll ? '' : '   (DID NOT FINISH)')
    );
  }
  console.log('');
  console.log('  Minutes assume about 50 seconds for the two English questions and feedback.');
  console.log('  A teacher who wants a shorter first run can set 30 second rounds.');
}

function sweep() {
  const original = M.CHAPTERS.map((c) => c.requestsNeeded);
  console.log('allowance | requests per chapter | fast | typical | careful | typical @60s');
  for (const allowance of [6, 8, 10, 12]) {
    for (const needed of [[4, 5, 5, 6, 6], [6, 6, 7, 7, 8], [7, 8, 8, 9, 10]]) {
      M.CHAPTERS.forEach((c, i) => { c.requestsNeeded = needed[i]; });
      const results = STRATEGIES.map((s) => averageRounds(allowance, s.budget, 3).rounds);
      console.log(
        `${String(allowance).padStart(9)} | ${JSON.stringify(needed).padEnd(20)} | ` +
        `${String(results[0]).padStart(4)} | ${String(results[1]).padStart(7)} | ` +
        `${String(results[2]).padStart(7)} | ${lessonMinutes(results[1], 60)} min`
      );
    }
  }
  M.CHAPTERS.forEach((c, i) => { c.requestsNeeded = original[i]; });
}

if (process.argv.includes('--sweep')) sweep();
else report();

module.exports = { runStory, averageRounds, lessonMinutes };
