'use strict';
/**
 * Mutable question bank.
 *
 * Starts from the shipped bank in questions.js. The teacher may edit prompts,
 * options, correct answers, accepted alternatives and explanations. Every edit
 * is validated before it is accepted, so a broken question can never reach a
 * pupil. Edits live in memory; see the README for what that means on a free
 * host, and use the JSON export to keep a copy.
 */

const { QUESTIONS, validateBank, forPupil } = require('./questions');
const { mark } = require('./marking');

const EDITABLE_FIELDS = [
  'prompt', 'passage', 'options', 'answer', 'accepted',
  'acceptedPatterns', 'explanation', 'example', 'tokens', 'difficulty', 'topic',
];

class QuestionStore {
  constructor(initial = QUESTIONS) {
    // Deep copy so the shipped bank is never mutated.
    this.bank = JSON.parse(JSON.stringify(initial));
    this.byId = new Map(this.bank.map((q) => [q.id, q]));
    this.edits = [];
  }

  all() {
    return this.bank;
  }

  get(id) {
    return this.byId.get(id);
  }

  count() {
    return this.bank.length;
  }

  /** Full records including answer keys. Teacher-only. */
  listForTeacher() {
    return this.bank.map((q) => ({ ...q }));
  }

  /** Answer-free records. Safe for pupils. */
  listForPupil() {
    return this.bank.map((q) => forPupil(q));
  }

  /**
   * Apply an edit to one question.
   *
   * Validation runs against a candidate copy of the whole bank, and the edited
   * question must still mark its own answer correct, so a teacher cannot save a
   * question that nobody could pass.
   *
   * @returns {{ok: true, question: object} | {ok: false, problems: string[]}}
   */
  update(id, patch) {
    const existing = this.byId.get(id);
    if (!existing) return { ok: false, problems: [`No question with id "${id}".`] };

    const unknown = Object.keys(patch).filter((key) => !EDITABLE_FIELDS.includes(key));
    if (unknown.length > 0) {
      return { ok: false, problems: [`These fields cannot be edited: ${unknown.join(', ')}.`] };
    }

    const candidate = { ...existing };
    for (const field of EDITABLE_FIELDS) {
      if (!(field in patch)) continue;
      let value = patch[field];
      if (field === 'options' || field === 'accepted' || field === 'acceptedPatterns' || field === 'tokens') {
        if (value === null) value = undefined;
        else if (!Array.isArray(value)) {
          return { ok: false, problems: [`"${field}" must be a list.`] };
        } else {
          value = value.map((entry) => String(entry)).filter((entry) => entry.trim() !== '');
        }
      } else if (field === 'difficulty') {
        value = Number(value);
      } else if (value !== undefined && value !== null) {
        value = String(value);
      }
      if (value === undefined) delete candidate[field];
      else candidate[field] = value;
    }

    if (!Array.isArray(candidate.accepted)) candidate.accepted = [];

    // Validate the candidate inside a copy of the whole bank.
    const candidateBank = this.bank.map((q) => (q.id === id ? candidate : q));
    const problems = validateBank(candidateBank).filter((p) => p.includes(id));
    if (problems.length > 0) return { ok: false, problems };

    // The question must accept its own answer after the edit.
    if (!mark(candidate, candidate.answer).correct) {
      return {
        ok: false,
        problems: [
          'After this change the correct answer is no longer marked correct. ' +
            'Check the answer, the accepted alternatives and any pattern.',
        ],
      };
    }
    // Multiple-choice distractors must still be wrong.
    if (candidate.options) {
      for (const option of candidate.options) {
        if (option === candidate.answer) continue;
        if (mark(candidate, option).correct) {
          return {
            ok: false,
            problems: [`The wrong choice "${option}" would now be marked correct.`],
          };
        }
      }
    }

    const index = this.bank.findIndex((q) => q.id === id);
    this.bank[index] = candidate;
    this.byId.set(id, candidate);
    this.edits.push({ id, at: Date.now(), fields: Object.keys(patch) });
    return { ok: true, question: { ...candidate } };
  }

  /** Check a draft answer against a question, for the teacher's editor. */
  testAnswer(id, submitted) {
    const question = this.byId.get(id);
    if (!question) return { ok: false, problems: [`No question with id "${id}".`] };
    const result = mark(question, submitted);
    return { ok: true, correct: result.correct, normalised: result.normalised, matchedBy: result.matchedBy };
  }

  /** Health check across the whole bank. */
  validateAll() {
    const problems = validateBank(this.bank);
    for (const question of this.bank) {
      if (!mark(question, question.answer).correct) {
        problems.push(`question ${question.id}: its own answer is not marked correct`);
      }
    }
    return problems;
  }

  exportJson() {
    return JSON.stringify(this.bank, null, 2);
  }
}

module.exports = { QuestionStore, EDITABLE_FIELDS };
