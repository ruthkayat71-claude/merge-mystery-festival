'use strict';
/**
 * Answer normalisation and marking.
 *
 * Design rules, taken straight from the classroom requirements:
 *  - ignore leading/trailing space, repeated space and capitalisation
 *  - treat straight and curly apostrophes as the same character
 *  - treat ordinary sentence punctuation as decoration, not meaning
 *  - accept only explicitly listed equivalents; never guess with edit distance
 *  - creative content inside a fixed sentence frame is checked by frame only
 */

/**
 * Contractions whose apostrophe-free spelling cannot be confused with another
 * English word used in this question bank. Deliberately excludes pairs like
 * "we're"/"were" and "it's"/"its", where dropping the apostrophe changes
 * meaning.
 */
const SAFE_CONTRACTIONS = [
  ["i'm", 'im'],
  ["don't", 'dont'],
  ["doesn't", 'doesnt'],
  ["didn't", 'didnt'],
  ["can't", 'cant'],
  ["isn't", 'isnt'],
  ["aren't", 'arent'],
  ["won't", 'wont'],
  ["let's", 'lets'],
  ["o'clock", 'oclock'],
  ["that's", 'thats'],
  ["what's", 'whats'],
  ["he's", 'hes'],
  ["she's", 'shes'],
  ["they're", 'theyre'],
  ["you're", 'youre'],
  ["i'd", 'id'],
  ["i'll", 'ill'],
  ["i've", 'ive'],
];

/** Punctuation removed before comparison. Apostrophes and hyphens are kept. */
const STRIPPED_PUNCTUATION = /[.,!?;:"“”„«»()\[\]{}…]/g;

/**
 * Put text into the canonical form used for every comparison.
 * @param {string} input
 * @returns {string}
 */
function normalise(input) {
  if (typeof input !== 'string') return '';
  let text = input.normalize('NFC');

  // Unify apostrophe-like and dash-like characters.
  text = text.replace(/[\u2018\u2019\u02BC\u02B9\u2032\u00B4`]/g, "'");
  text = text.replace(/[\u2013\u2014\u2212]/g, '-');

  // Unify whitespace, including non-breaking space used in prompts.
  text = text.replace(/[\u00A0\u2007\u202F\t\r\n]+/g, ' ');

  text = text.replace(STRIPPED_PUNCTUATION, ' ');
  text = text.replace(/\s*-\s*/g, '-');
  text = text.replace(/\s+/g, ' ').trim().toLowerCase();

  // "thank you ." style input leaves a dangling apostrophe-free token; also
  // drop an apostrophe that ended up alone.
  text = text.replace(/\s'\s/g, ' ').replace(/^'|'$/g, '').trim();
  return text;
}

/** Variant with safe contractions expanded to their apostrophe-free spelling. */
function withoutApostrophes(normalised) {
  let text = normalised;
  for (const [withMark, without] of SAFE_CONTRACTIONS) {
    text = text.split(withMark).join(without);
  }
  return text;
}

/** Every normalised form a single accepted answer should match. */
function variantsOf(answer) {
  const base = normalise(answer);
  const variants = new Set([base]);
  variants.add(withoutApostrophes(base));
  return variants;
}

/**
 * Build the full comparison set for a question.
 * @param {object} question
 * @returns {{exact: Set<string>, patterns: RegExp[]}}
 */
function buildMatcher(question) {
  const exact = new Set();
  for (const candidate of [question.answer, ...(question.accepted || [])]) {
    if (typeof candidate !== 'string') continue;
    for (const variant of variantsOf(candidate)) {
      if (variant) exact.add(variant);
    }
  }

  const patterns = [];
  for (const source of question.acceptedPatterns || []) {
    patterns.push(new RegExp(source));
  }
  return { exact, patterns };
}

/**
 * Mark one submitted answer.
 *
 * @param {object} question full question record (teacher-side, with the key)
 * @param {string} submitted raw pupil input
 * @returns {{correct: boolean, normalised: string, matchedBy: string|null}}
 */
function mark(question, submitted) {
  const normalised = normalise(submitted);
  if (normalised === '') {
    return { correct: false, normalised, matchedBy: null };
  }

  const { exact, patterns } = buildMatcher(question);

  if (exact.has(normalised)) {
    return { correct: true, normalised, matchedBy: 'listed' };
  }
  const noApostrophes = withoutApostrophes(normalised);
  if (exact.has(noApostrophes)) {
    return { correct: true, normalised, matchedBy: 'listed' };
  }
  for (const pattern of patterns) {
    if (pattern.test(normalised) || pattern.test(noApostrophes)) {
      return { correct: true, normalised, matchedBy: 'pattern' };
    }
  }
  return { correct: false, normalised, matchedBy: null };
}

/**
 * Record one attempt against a pupil's learning log.
 *
 * First-attempt success is tracked separately from success after a retry, and
 * no pupil can be credited twice for the same question.
 *
 * @param {object} log pupil learning log (mutated)
 * @param {object} question
 * @param {string} submitted
 * @returns {{correct: boolean, firstAttempt: boolean, attemptNumber: number,
 *            explanation: string, exampleAnswer: string|null, alreadyFinished: boolean,
 *            retriesLeft: number}}
 */
const MAX_ATTEMPTS = 2;

function recordAttempt(log, question, submitted) {
  if (!log.answers) log.answers = {};
  const entry =
    log.answers[question.id] ||
    (log.answers[question.id] = {
      questionId: question.id,
      topic: question.topic,
      type: question.type,
      difficulty: question.difficulty,
      attempts: [],
      correct: false,
      firstAttemptCorrect: false,
      correctAfterRetry: false,
      finished: false,
    });

  // Idempotency: once the pupil has finished this question, replay the result.
  if (entry.finished) {
    return {
      correct: entry.correct,
      firstAttempt: entry.firstAttemptCorrect,
      attemptNumber: entry.attempts.length,
      explanation: question.explanation,
      exampleAnswer: entry.correct ? null : question.example || question.answer,
      alreadyFinished: true,
      retriesLeft: 0,
    };
  }

  const result = mark(question, submitted);
  const attemptNumber = entry.attempts.length + 1;
  entry.attempts.push({
    at: Date.now(),
    submitted: String(submitted ?? '').slice(0, 300),
    normalised: result.normalised,
    correct: result.correct,
  });

  if (result.correct) {
    entry.correct = true;
    entry.finished = true;
    if (attemptNumber === 1) entry.firstAttemptCorrect = true;
    else entry.correctAfterRetry = true;
  } else if (attemptNumber >= MAX_ATTEMPTS) {
    entry.finished = true;
  }

  const retriesLeft = entry.finished ? 0 : MAX_ATTEMPTS - attemptNumber;
  return {
    correct: result.correct,
    firstAttempt: attemptNumber === 1 && result.correct,
    attemptNumber,
    explanation: question.explanation,
    // Show the model answer only once no retries remain.
    exampleAnswer: result.correct ? null : retriesLeft > 0 ? null : question.example || question.answer,
    alreadyFinished: false,
    retriesLeft,
  };
}

/** Aggregate learning statistics. Kept entirely separate from game scores. */
function summariseLearning(log) {
  const answers = Object.values(log.answers || {});
  const attempted = answers.length;
  const firstAttemptCorrect = answers.filter((a) => a.firstAttemptCorrect).length;
  const correctAfterRetry = answers.filter((a) => a.correctAfterRetry).length;
  const incorrect = answers.filter((a) => a.finished && !a.correct).length;
  const retries = answers.reduce((sum, a) => sum + Math.max(0, a.attempts.length - 1), 0);
  const byTopic = {};
  for (const a of answers) {
    const bucket = (byTopic[a.topic] = byTopic[a.topic] || { attempted: 0, firstAttemptCorrect: 0 });
    bucket.attempted++;
    if (a.firstAttemptCorrect) bucket.firstAttemptCorrect++;
  }
  return {
    attempted,
    firstAttemptCorrect,
    correctAfterRetry,
    incorrect,
    retries,
    firstAttemptAccuracy: attempted === 0 ? null : Math.round((firstAttemptCorrect / attempted) * 100),
    byTopic,
  };
}

module.exports = {
  normalise,
  withoutApostrophes,
  variantsOf,
  buildMatcher,
  mark,
  recordAttempt,
  summariseLearning,
  SAFE_CONTRACTIONS,
  MAX_ATTEMPTS,
};
