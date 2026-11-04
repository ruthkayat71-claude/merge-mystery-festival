'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { QUESTIONS, TOPICS, TYPES, validateBank, forPupil } = require('../server/questions');
const { normalise, mark, recordAttempt, summariseLearning } = require('../server/marking');

test('bank holds at least 80 structurally valid questions', () => {
  const problems = validateBank(QUESTIONS);
  assert.deepStrictEqual(problems, [], `bank problems:\n${problems.join('\n')}`);
  assert.ok(QUESTIONS.length >= 80, `expected >= 80 questions, found ${QUESTIONS.length}`);
});

test('every required topic and question type appears', () => {
  for (const topic of TOPICS) {
    assert.ok(
      QUESTIONS.some((q) => q.topic === topic),
      `topic "${topic}" has no questions`
    );
  }
  for (const type of TYPES) {
    const count = QUESTIONS.filter((q) => q.type === type).length;
    assert.ok(count >= 3, `type "${type}" only has ${count} questions`);
  }
});

test('difficulty ladder covers 1 through 5 with a usable spread', () => {
  for (let d = 1; d <= 5; d++) {
    const count = QUESTIONS.filter((q) => q.difficulty === d).length;
    assert.ok(count >= 8, `difficulty ${d} only has ${count} questions`);
  }
});

test('every stored answer marks itself correct', () => {
  for (const q of QUESTIONS) {
    const result = mark(q, q.answer);
    assert.ok(result.correct, `question ${q.id}: its own answer "${q.answer}" was marked wrong`);
  }
});

test('every listed alternative marks correct', () => {
  for (const q of QUESTIONS) {
    for (const alt of q.accepted || []) {
      assert.ok(mark(q, alt).correct, `question ${q.id}: alternative "${alt}" was marked wrong`);
    }
  }
});

test('multiple-choice distractors are all marked wrong', () => {
  for (const q of QUESTIONS) {
    if (q.type !== 'mc' && q.type !== 'reading') continue;
    for (const option of q.options) {
      if (option === q.answer) continue;
      assert.ok(
        !mark(q, option).correct,
        `question ${q.id}: distractor "${option}" was accepted as correct`
      );
    }
  }
});

test('pupil-facing payloads never leak the answer key', () => {
  for (const q of QUESTIONS) {
    const safe = forPupil(q);
    const serialised = JSON.stringify(safe);
    assert.strictEqual(safe.answer, undefined, `${q.id} leaked answer`);
    assert.strictEqual(safe.accepted, undefined, `${q.id} leaked accepted list`);
    assert.strictEqual(safe.acceptedPatterns, undefined, `${q.id} leaked patterns`);
    assert.strictEqual(safe.explanation, undefined, `${q.id} leaked explanation`);
    assert.strictEqual(safe.example, undefined, `${q.id} leaked the example answer`);

    // A typed question must not print its own answer as a whole word in the
    // text the pupil reads. Whole-word matching avoids false alarms such as
    // the answer "at" appearing inside "eat".
    if (q.type === 'blank' || q.type === 'writing') {
      const visible = `${safe.prompt} ${safe.passage || ''}`.toLowerCase();
      const needle = q.answer.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wholeWord = new RegExp(`(^|[^a-z'])${needle}($|[^a-z'])`);
      assert.ok(
        !wholeWord.test(visible),
        `${q.id} shows its own answer "${q.answer}" in the prompt the pupil reads`
      );
    }
    void serialised;
    // Typed questions still need to tell the pupil what shape of answer to give.
    if (q.type === 'blank' || q.type === 'writing') {
      assert.ok(safe.inputHint, `${q.id} needs an inputHint for its text box`);
    }
  }
});

test('order questions are shuffled away from the correct sequence', () => {
  for (const q of QUESTIONS) {
    if (q.type !== 'order') continue;
    const safe = forPupil(q);
    assert.strictEqual(safe.shuffled.length, q.tokens.length, `${q.id} token count changed`);
    assert.notStrictEqual(
      safe.shuffled.join(' '),
      q.tokens.join(' '),
      `${q.id} was displayed already in order`
    );
    assert.deepStrictEqual(
      safe.shuffled.slice().sort(),
      q.tokens.slice().sort(),
      `${q.id} shuffle changed the token multiset`
    );
  }
});

test('shuffling an order question is stable across refreshes', () => {
  const ordered = QUESTIONS.find((q) => q.type === 'order');
  assert.deepStrictEqual(forPupil(ordered).shuffled, forPupil(ordered).shuffled);
});

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

test('normalisation ignores case, outer space and repeated space', () => {
  assert.strictEqual(normalise('   I am   FINE,  thank  you.  '), 'i am fine thank you');
  assert.strictEqual(normalise('Teeth'), 'teeth');
  assert.strictEqual(normalise('\tteeth\n'), 'teeth');
});

test('straight and curly apostrophes are treated the same', () => {
  const q = QUESTIONS.find((x) => x.id === 'w-006');
  for (const variant of ["Don't worry.", 'Don\u2019t worry.', 'Don\u02BCt worry', 'DONT WORRY']) {
    assert.ok(mark(q, variant).correct, `"${variant}" should be accepted`);
  }
});

test('ordinary punctuation does not change the result', () => {
  const q = QUESTIONS.find((x) => x.id === 'w-005');
  for (const variant of ['Thank you', 'Thank you!', 'Thank you.', '  thank   you ... ']) {
    assert.ok(mark(q, variant).correct, `"${variant}" should be accepted`);
  }
});

test("o'clock keeps working with and without its apostrophe", () => {
  const q = QUESTIONS.find((x) => x.id === 'r-005');
  assert.ok(mark(q, "I get up at six o'clock.").correct);
  assert.ok(mark(q, 'I get up at six oclock').correct);
  assert.ok(mark(q, 'I get up at six o\u2019clock').correct);
});

test('wrong meanings are rejected, so matching is not broadly fuzzy', () => {
  const nameQuestion = QUESTIONS.find((x) => x.id === 'w-002');
  for (const wrong of ['my name Mali', 'I am Mali', 'name is Mali', 'my nam is Mali', 'Mali']) {
    assert.ok(!mark(nameQuestion, wrong).correct, `"${wrong}" must not be accepted`);
  }

  const teeth = QUESTIONS.find((x) => x.id === 'r-002');
  for (const wrong of ['teath', 'tooth', 'hair', 'teet', 'teethh']) {
    assert.ok(!mark(teeth, wrong).correct, `"${wrong}" must not be accepted`);
  }

  const polite = QUESTIONS.find((x) => x.id === 'w-003');
  for (const wrong of ['open the window', 'Open the window now', 'could you close the window please']) {
    assert.ok(!mark(polite, wrong).correct, `"${wrong}" must not be accepted`);
  }
});

test('empty and whitespace-only answers are never correct', () => {
  for (const q of QUESTIONS.slice(0, 20)) {
    assert.ok(!mark(q, '').correct);
    assert.ok(!mark(q, '     ').correct);
    assert.ok(!mark(q, null).correct);
  }
});

test('open-frame writing accepts the pupil\u2019s own content but needs the frame', () => {
  const hobby = QUESTIONS.find((x) => x.id === 'w-004');
  for (const good of ['I like swimming', 'I like playing football', 'i like reading books']) {
    assert.ok(mark(hobby, good).correct, `"${good}" should be accepted`);
  }
  for (const bad of ['swimming', 'I likes swimming', 'I like', 'like swimming']) {
    assert.ok(!mark(hobby, bad).correct, `"${bad}" must not be accepted`);
  }

  const age = QUESTIONS.find((x) => x.id === 'i-010');
  assert.ok(mark(age, 'I am eleven years old').correct);
  assert.ok(mark(age, 'I am 11 years old').correct);
  assert.ok(!mark(age, 'I am eleven').correct);
});

// ---------------------------------------------------------------------------
// Attempts and retries
// ---------------------------------------------------------------------------

test('first-attempt success is distinguished from success after a retry', () => {
  const q = QUESTIONS.find((x) => x.id === 'r-002');

  const straightAway = { answers: {} };
  const a = recordAttempt(straightAway, q, 'teeth');
  assert.ok(a.correct && a.firstAttempt);
  assert.strictEqual(summariseLearning(straightAway).firstAttemptCorrect, 1);
  assert.strictEqual(summariseLearning(straightAway).correctAfterRetry, 0);

  const afterRetry = { answers: {} };
  const miss = recordAttempt(afterRetry, q, 'hair');
  assert.ok(!miss.correct);
  assert.strictEqual(miss.retriesLeft, 1, 'pupil gets one retry');
  assert.strictEqual(miss.exampleAnswer, null, 'model answer withheld while a retry remains');
  const hit = recordAttempt(afterRetry, q, 'teeth');
  assert.ok(hit.correct);
  assert.ok(!hit.firstAttempt, 'not a first-attempt success');
  const summary = summariseLearning(afterRetry);
  assert.strictEqual(summary.firstAttemptCorrect, 0);
  assert.strictEqual(summary.correctAfterRetry, 1);
  assert.strictEqual(summary.retries, 1);
});

test('after the final attempt the example answer and explanation are shown', () => {
  const q = QUESTIONS.find((x) => x.id === 'r-002');
  const log = { answers: {} };
  recordAttempt(log, q, 'hair');
  const last = recordAttempt(log, q, 'nose');
  assert.ok(!last.correct);
  assert.strictEqual(last.retriesLeft, 0);
  assert.strictEqual(last.exampleAnswer, 'teeth');
  assert.ok(last.explanation.length > 0);
});

test('a finished question cannot be answered again for extra credit', () => {
  const q = QUESTIONS.find((x) => x.id === 'r-002');
  const log = { answers: {} };
  recordAttempt(log, q, 'teeth');
  const replay = recordAttempt(log, q, 'teeth');
  assert.ok(replay.alreadyFinished, 'repeat submission flagged as already finished');
  assert.strictEqual(log.answers[q.id].attempts.length, 1, 'no extra attempt recorded');
  assert.strictEqual(summariseLearning(log).attempted, 1);

  // A pupil cannot flip a wrong answer to correct by resubmitting.
  const failed = { answers: {} };
  recordAttempt(failed, q, 'hair');
  recordAttempt(failed, q, 'nose');
  const sneaky = recordAttempt(failed, q, 'teeth');
  assert.ok(sneaky.alreadyFinished);
  assert.ok(!sneaky.correct, 'result stays incorrect after attempts are used up');
  assert.strictEqual(summariseLearning(failed).incorrect, 1);
});

test('learning summary reports first-attempt accuracy per topic', () => {
  const log = { answers: {} };
  recordAttempt(log, QUESTIONS.find((q) => q.id === 'r-002'), 'teeth');
  recordAttempt(log, QUESTIONS.find((q) => q.id === 'r-006'), 'on');
  recordAttempt(log, QUESTIONS.find((q) => q.id === 'r-006'), 'at');
  const summary = summariseLearning(log);
  assert.strictEqual(summary.attempted, 2);
  assert.strictEqual(summary.firstAttemptAccuracy, 50);
  assert.deepStrictEqual(summary.byTopic.routines, { attempted: 2, firstAttemptCorrect: 1 });
});

test('multi-token order answers tolerate spacing differences', () => {
  const q = QUESTIONS.find((x) => x.id === 'c-013');
  assert.ok(mark(q, q.tokens.join(' ')).correct);
  assert.ok(mark(q, q.tokens.join('  ')).correct);
  assert.ok(!mark(q, q.tokens.slice().reverse().join(' ')).correct);
});
