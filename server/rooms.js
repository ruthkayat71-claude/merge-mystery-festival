'use strict';
/**
 * Rooms, pupils, the learning/merge cycle and server-side timers.
 *
 * State lives in memory. The teacher dashboard exports CSV at any time, which
 * is the durable record. See README for exactly what survives a refresh, a
 * brief disconnection, a server restart and a later lesson.
 */

const crypto = require('node:crypto');
const merge = require('./merge');
const { recordAttempt, summariseLearning } = require('./marking');
const { forPupil } = require('./questions');

const ROOM_CODE_LENGTH = 6;
// Unambiguous alphabet: no O/0, I/1, or similar-looking pairs, because pupils
// type this from a TV screen.
const ROOM_CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY2346789';

const QUESTIONS_PER_CYCLE = 2;
const ROUND_LENGTH_CHOICES = [30, 45, 60, 90];
const DEFAULT_ROUND_SECONDS = 60;
const DEFAULT_LESSON_MINUTES = 45;
const NO_REPEAT_WINDOW = 12;
const DISCONNECT_GRACE_MS = 45 * 1000;
const MAX_NICKNAME_LENGTH = 16;
const MAX_PUPILS = 120;

const PHASES = {
  LOBBY: 'lobby',
  LEARNING: 'learning',
  FEEDBACK: 'feedback',
  PLAYING: 'playing',
  PAUSED: 'paused',
  ENDED: 'ended',
};

// ---------------------------------------------------------------------------
// Nicknames
// ---------------------------------------------------------------------------

/**
 * Validate a pupil nickname. Allows Latin letters, Thai characters, digits,
 * spaces and a few safe marks. Rejects anything that looks like a link or
 * contains control characters.
 */
function validateNickname(raw) {
  if (typeof raw !== 'string') return { ok: false, message: 'Please type a nickname.' };
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) return { ok: false, message: 'Please type a nickname.' };
  if (trimmed.length > MAX_NICKNAME_LENGTH) {
    return { ok: false, message: `Please use ${MAX_NICKNAME_LENGTH} letters or fewer.` };
  }
  if (/[\u0000-\u001F\u007F<>&"'\\/]/.test(trimmed)) {
    return { ok: false, message: 'Please use letters and numbers only.' };
  }
  if (/https?:|www\./i.test(trimmed)) {
    return { ok: false, message: 'Please use letters and numbers only.' };
  }
  // \p{M} admits combining marks, which Thai vowel and tone signs need. Without
  // it a name such as "\u0e21\u0e32\u0e25\u0e35" would be rejected.
  if (!/^[\p{L}\p{M}\p{N} ._-]+$/u.test(trimmed)) {
    return { ok: false, message: 'Please use letters and numbers only.' };
  }
  return { ok: true, nickname: trimmed };
}

// ---------------------------------------------------------------------------
// Question queue
// ---------------------------------------------------------------------------

/**
 * Build a per-pupil question order: easy first, harder later, shuffled inside
 * each difficulty band so neighbours do not see identical screens. The order
 * depends only on the pupil's own seed and never on game progress.
 */
function buildQueue(bank, seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  const random = () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };

  const bands = new Map();
  for (const question of bank) {
    if (!bands.has(question.difficulty)) bands.set(question.difficulty, []);
    bands.get(question.difficulty).push(question.id);
  }
  const queue = [];
  for (const difficulty of [...bands.keys()].sort((a, b) => a - b)) {
    const ids = bands.get(difficulty);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    queue.push(...ids);
  }
  return queue;
}

// ---------------------------------------------------------------------------
// Pupil
// ---------------------------------------------------------------------------

let pupilCounter = 0;

class Pupil {
  constructor(room, nickname, displayName) {
    this.id = `p${++pupilCounter}-${crypto.randomBytes(4).toString('hex')}`;
    this.room = room;
    this.nickname = nickname;
    this.displayName = displayName;
    // Private: identifies this pupil on reconnect. Never sent to anyone else.
    this.rejoinToken = crypto.randomBytes(24).toString('base64url');
    this.joinedAt = Date.now();
    this.lastSeen = Date.now();
    this.connected = true;
    this.removed = false;

    this.phase = room.status === 'running' ? PHASES.LEARNING : PHASES.LOBBY;
    this.learning = { answers: {} };
    this.game = merge.createGame(this.id, { roundAllowance: room.settings.roundAllowance });
    this.englishOnly = false;

    this.queue = buildQueue(room.store.all(), hashString(this.id));
    this.queueIndex = 0;
    this.recentQuestionIds = [];
    this.currentQuestionIds = [];
    this.questionSlot = 0;
    this.cycleResults = [];
    this.cyclesCompleted = 0;
    this.roundsPlayed = 0;

    this.roundEndsAt = null;
    this.roundRemainingMs = null;
    this.channel = null; // SSE writer

    if (this.phase === PHASES.LEARNING) this.beginLearning();
  }

  // -- question flow -------------------------------------------------------

  nextQuestionId() {
    const bank = this.room.store;
    for (let guard = 0; guard < this.queue.length * 2 + 4; guard++) {
      if (this.queueIndex >= this.queue.length) {
        // Rebuild and continue the ladder from the start, keeping the
        // no-repeat window so nothing reappears immediately.
        this.queue = buildQueue(bank.all(), hashString(this.id + ':' + this.cyclesCompleted));
        this.queueIndex = 0;
      }
      const id = this.queue[this.queueIndex++];
      if (!bank.get(id)) continue;
      if (this.recentQuestionIds.includes(id)) continue;
      return id;
    }
    // Every question is inside the no-repeat window: allow the oldest.
    return this.queue[0];
  }

  beginLearning() {
    this.phase = PHASES.LEARNING;
    this.questionSlot = 0;
    this.cycleResults = [];
    this.currentQuestionIds = [];
    for (let i = 0; i < QUESTIONS_PER_CYCLE; i++) {
      const id = this.nextQuestionId();
      this.currentQuestionIds.push(id);
      this.recentQuestionIds.push(id);
    }
    while (this.recentQuestionIds.length > NO_REPEAT_WINDOW) this.recentQuestionIds.shift();
    this.roundEndsAt = null;
    this.roundRemainingMs = null;
  }

  currentQuestion() {
    const id = this.currentQuestionIds[this.questionSlot];
    return id ? this.room.store.get(id) : null;
  }

  /**
   * Mark one submitted answer. Returns feedback for this pupil only.
   */
  submitAnswer(questionId, submitted) {
    if (this.phase !== PHASES.LEARNING) {
      return { ok: false, reason: 'not-learning', message: 'It is not question time right now.' };
    }
    const expected = this.currentQuestionIds[this.questionSlot];
    if (questionId !== expected) {
      return { ok: false, reason: 'wrong-question', message: 'That is not the current question.' };
    }
    const question = this.room.store.get(questionId);
    if (!question) return { ok: false, reason: 'no-question', message: 'That question is missing.' };

    const feedback = recordAttempt(this.learning, question, submitted);
    const entry = this.learning.answers[questionId];

    if (entry.finished && !feedback.alreadyFinished) {
      this.cycleResults.push({
        questionId,
        prompt: question.prompt,
        correct: entry.correct,
        firstAttemptCorrect: entry.firstAttemptCorrect,
        explanation: question.explanation,
        exampleAnswer: entry.correct ? null : question.example || question.answer,
        yourAnswer: entry.attempts[entry.attempts.length - 1].submitted,
      });
      this.questionSlot++;
      if (this.questionSlot >= this.currentQuestionIds.length) {
        this.phase = PHASES.FEEDBACK;
      }
    }

    return {
      ok: true,
      feedback: {
        correct: feedback.correct,
        firstAttempt: feedback.firstAttempt,
        attemptNumber: feedback.attemptNumber,
        retriesLeft: feedback.retriesLeft,
        explanation: feedback.correct || feedback.retriesLeft === 0 ? feedback.explanation : null,
        exampleAnswer: feedback.exampleAnswer,
        moveOn: entry.finished,
      },
    };
  }

  /**
   * Leave the feedback screen and start the merge round.
   *
   * Every pupil reaches this point after finishing the learning step, whether
   * or not their answers were correct.
   */
  startRound(now = Date.now()) {
    if (this.phase !== PHASES.FEEDBACK) {
      return { ok: false, reason: 'not-ready', message: 'Finish the questions first.' };
    }
    if (this.room.status !== 'running') {
      return { ok: false, reason: 'room-not-running', message: 'Waiting for your teacher.' };
    }
    this.cyclesCompleted++;
    if (this.englishOnly) {
      // English-only pupils skip the merge round and go straight on.
      this.beginLearning();
      return { ok: true, englishOnly: true };
    }
    this.phase = PHASES.PLAYING;
    this.roundsPlayed++;
    const grant = merge.startRound(this.game, this.room.settings.roundAllowance);
    this.roundRemainingMs = this.room.settings.roundSeconds * 1000;
    this.roundEndsAt = now + this.roundRemainingMs;
    return { ok: true, grant };
  }

  /** Round timer expiry, checked lazily and by the room tick. */
  checkRoundExpiry(now = Date.now()) {
    if (this.phase !== PHASES.PLAYING || this.roundEndsAt === null) return false;
    if (now < this.roundEndsAt) return false;
    this.roundEndsAt = null;
    this.roundRemainingMs = null;
    this.beginLearning();
    return true;
  }

  pause(now = Date.now()) {
    if (this.phase === PHASES.PLAYING && this.roundEndsAt !== null) {
      this.roundRemainingMs = Math.max(0, this.roundEndsAt - now);
      this.roundEndsAt = null;
      this.resumePhase = PHASES.PLAYING;
    } else {
      this.resumePhase = this.phase;
    }
    if (this.phase !== PHASES.ENDED) this.phase = PHASES.PAUSED;
  }

  resume(now = Date.now()) {
    if (this.phase !== PHASES.PAUSED) return;
    const back = this.resumePhase || PHASES.LEARNING;
    this.phase = back;
    if (back === PHASES.PLAYING) {
      // Resume with exactly the time that was left.
      this.roundEndsAt = now + (this.roundRemainingMs || 0);
    }
    this.resumePhase = null;
  }

  end() {
    this.phase = PHASES.ENDED;
    this.roundEndsAt = null;
    this.roundRemainingMs = null;
  }

  isPlaying(now = Date.now()) {
    return (
      this.room.status === 'running' &&
      this.phase === PHASES.PLAYING &&
      this.roundEndsAt !== null &&
      now < this.roundEndsAt
    );
  }

  remainingRoundMs(now = Date.now()) {
    if (this.phase === PHASES.PAUSED) return this.roundRemainingMs;
    if (this.roundEndsAt === null) return null;
    return Math.max(0, this.roundEndsAt - now);
  }

  learningSummary() {
    return summariseLearning(this.learning);
  }

  gameSummary() {
    return this.game ? merge.teacherSummary(this.game) : null;
  }

  // -- serialisation -------------------------------------------------------

  /** State for this pupil's own device. Contains no answer keys. */
  selfState(now = Date.now()) {
    const question = this.phase === PHASES.LEARNING ? this.currentQuestion() : null;
    const summary = this.learningSummary();
    return {
      pupil: {
        id: this.id,
        nickname: this.nickname,
        displayName: this.displayName,
      },
      room: {
        code: this.room.code,
        status: this.room.status,
        roundSeconds: this.room.settings.roundSeconds,
        lessonEndsAt: this.room.lessonEndsAt,
        leaderboardEnabled: this.room.settings.leaderboardEnabled,
      },
      phase: this.phase,
      serverNow: now,
      question: question
        ? {
            ...forPupil(question),
            slot: this.questionSlot + 1,
            total: this.currentQuestionIds.length,
            attemptsUsed: (this.learning.answers[question.id]?.attempts || []).length,
          }
        : null,
      cycleResults: this.phase === PHASES.FEEDBACK ? this.cycleResults : [],
      learning: {
        attempted: summary.attempted,
        firstAttemptCorrect: summary.firstAttemptCorrect,
        correctAfterRetry: summary.correctAfterRetry,
        firstAttemptAccuracy: summary.firstAttemptAccuracy,
      },
      round: {
        remainingMs: this.remainingRoundMs(now),
        lengthMs: this.room.settings.roundSeconds * 1000,
        playing: this.isPlaying(now),
      },
      game: this.englishOnly ? null : merge.publicState(this.game),
      board: this.englishOnly ? null : merge.analyse(this.game),
      englishOnly: this.englishOnly,
      cyclesCompleted: this.cyclesCompleted,
      roundsPlayed: this.roundsPlayed,
      leaderboard: this.room.settings.leaderboardEnabled ? this.room.leaderboard() : null,
    };
  }

  /** Row for the teacher dashboard. */
  teacherRow(now = Date.now()) {
    const summary = this.learningSummary();
    return {
      id: this.id,
      nickname: this.nickname,
      displayName: this.displayName,
      connected: this.connected,
      secondsSinceSeen: Math.round((now - this.lastSeen) / 1000),
      joinedAt: this.joinedAt,
      phase: this.phase,
      englishOnly: this.englishOnly,
      simplified: this.game ? this.game.simplified : false,
      english: {
        attempted: summary.attempted,
        firstAttemptCorrect: summary.firstAttemptCorrect,
        correctAfterRetry: summary.correctAfterRetry,
        incorrect: summary.incorrect,
        retries: summary.retries,
        firstAttemptAccuracy: summary.firstAttemptAccuracy,
      },
      game: this.gameSummary(),
      roundRemainingMs: this.remainingRoundMs(now),
    };
  }

  /** Full answer detail for the teacher's pupil view. */
  teacherAnswers() {
    return Object.values(this.learning.answers).map((entry) => {
      const question = this.room.store.get(entry.questionId);
      return {
        questionId: entry.questionId,
        topic: entry.topic,
        type: entry.type,
        difficulty: entry.difficulty,
        prompt: question ? question.prompt : '(question removed)',
        correctAnswer: question ? question.answer : '',
        correct: entry.correct,
        firstAttemptCorrect: entry.firstAttemptCorrect,
        correctAfterRetry: entry.correctAfterRetry,
        attempts: entry.attempts.map((a) => ({
          submitted: a.submitted,
          correct: a.correct,
          at: a.at,
        })),
      };
    });
  }
}

function hashString(text) {
  let seed = 11;
  for (let i = 0; i < text.length; i++) seed = (seed * 33 + text.charCodeAt(i)) % 2147483647;
  return seed;
}

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

class Room {
  constructor(code, store, options = {}) {
    this.code = code;
    this.store = store;
    this.createdAt = Date.now();
    this.status = 'lobby'; // lobby | running | paused | ended
    this.pupils = new Map(); // id -> Pupil
    this.byRejoinToken = new Map();
    this.settings = {
      roundSeconds: DEFAULT_ROUND_SECONDS,
      lessonMinutes: DEFAULT_LESSON_MINUTES,
      roundAllowance: merge.DEFAULT_ROUND_ALLOWANCE,
      leaderboardEnabled: false, // public leaderboard is off by default
      ...options.settings,
    };
    this.lessonEndsAt = null;
    this.startedAt = null;
    this.endedAt = null;
    this.teacherChannels = new Set();
  }

  pupilList() {
    return [...this.pupils.values()].filter((p) => !p.removed);
  }

  countConnected() {
    return this.pupilList().filter((p) => p.connected).length;
  }

  /** Unique display name: "Mali", then "Mali (2)" for a second Mali. */
  uniqueDisplayName(nickname) {
    const taken = new Set(this.pupilList().map((p) => p.displayName.toLowerCase()));
    if (!taken.has(nickname.toLowerCase())) return nickname;
    for (let suffix = 2; suffix < 100; suffix++) {
      const candidate = `${nickname} (${suffix})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${nickname} (${crypto.randomBytes(2).toString('hex')})`;
  }

  join(rawNickname) {
    if (this.status === 'ended') {
      return { ok: false, reason: 'ended', message: 'This lesson has finished.' };
    }
    if (this.pupilList().length >= MAX_PUPILS) {
      return { ok: false, reason: 'full', message: 'This room is full.' };
    }
    const check = validateNickname(rawNickname);
    if (!check.ok) return { ok: false, reason: 'bad-nickname', message: check.message };

    const displayName = this.uniqueDisplayName(check.nickname);
    const pupil = new Pupil(this, check.nickname, displayName);
    this.pupils.set(pupil.id, pupil);
    this.byRejoinToken.set(pupil.rejoinToken, pupil.id);
    return { ok: true, pupil };
  }

  /** Restore the same pupil after a refresh or a brief disconnection. */
  rejoin(rejoinToken) {
    const id = this.byRejoinToken.get(rejoinToken);
    if (!id) return { ok: false, reason: 'unknown-token', message: 'Please join again with your nickname.' };
    const pupil = this.pupils.get(id);
    if (!pupil || pupil.removed) {
      return { ok: false, reason: 'removed', message: 'Please join again with your nickname.' };
    }
    pupil.connected = true;
    pupil.lastSeen = Date.now();
    return { ok: true, pupil };
  }

  removePupil(pupilId) {
    const pupil = this.pupils.get(pupilId);
    if (!pupil) return { ok: false, reason: 'no-pupil', message: 'That pupil is not in the room.' };
    pupil.removed = true;
    pupil.connected = false;
    pupil.end();
    this.byRejoinToken.delete(pupil.rejoinToken);
    if (pupil.channel) {
      try {
        pupil.channel.send('removed', { message: 'Your teacher removed this nickname. Please join again.' });
        pupil.channel.close();
      } catch {
        /* the socket was already gone */
      }
      pupil.channel = null;
    }
    return { ok: true, pupil };
  }

  // -- teacher controls ----------------------------------------------------

  start(now = Date.now()) {
    if (this.status === 'running') return { ok: false, reason: 'already-running', message: 'The lesson is already running.' };
    if (this.status === 'ended') return { ok: false, reason: 'ended', message: 'This lesson has finished.' };

    const resuming = this.status === 'paused';
    this.status = 'running';
    if (!this.startedAt) this.startedAt = now;
    if (!this.lessonEndsAt) this.lessonEndsAt = now + this.settings.lessonMinutes * 60 * 1000;

    for (const pupil of this.pupilList()) {
      if (resuming) pupil.resume(now);
      else if (pupil.phase === PHASES.LOBBY) pupil.beginLearning();
    }
    return { ok: true, resumed: resuming };
  }

  pause(now = Date.now()) {
    if (this.status !== 'running') return { ok: false, reason: 'not-running', message: 'The lesson is not running.' };
    this.status = 'paused';
    for (const pupil of this.pupilList()) pupil.pause(now);
    return { ok: true };
  }

  end(now = Date.now()) {
    if (this.status === 'ended') return { ok: false, reason: 'ended', message: 'Already finished.' };
    this.status = 'ended';
    this.endedAt = now;
    for (const pupil of this.pupilList()) pupil.end();
    return { ok: true };
  }

  updateSettings(patch) {
    const problems = [];
    const next = { ...this.settings };

    if (patch.roundSeconds !== undefined) {
      const value = Number(patch.roundSeconds);
      if (!ROUND_LENGTH_CHOICES.includes(value)) {
        problems.push(`Round length must be one of ${ROUND_LENGTH_CHOICES.join(', ')} seconds.`);
      } else next.roundSeconds = value;
    }
    if (patch.lessonMinutes !== undefined) {
      const value = Number(patch.lessonMinutes);
      if (!Number.isFinite(value) || value < 5 || value > 180) {
        problems.push('Lesson length must be between 5 and 180 minutes.');
      } else next.lessonMinutes = Math.round(value);
    }
    if (patch.roundAllowance !== undefined) {
      const value = Number(patch.roundAllowance);
      if (!Number.isFinite(value) || value < 4 || value > merge.CHARGE_CAP) {
        problems.push(`Supply taps per round must be between 4 and ${merge.CHARGE_CAP}.`);
      } else next.roundAllowance = Math.round(value);
    }
    if (patch.leaderboardEnabled !== undefined) {
      next.leaderboardEnabled = Boolean(patch.leaderboardEnabled);
    }
    if (problems.length > 0) return { ok: false, problems };

    const lessonChanged = next.lessonMinutes !== this.settings.lessonMinutes;
    this.settings = next;
    if (lessonChanged && this.startedAt) {
      this.lessonEndsAt = this.startedAt + this.settings.lessonMinutes * 60 * 1000;
    }
    return { ok: true, settings: { ...this.settings } };
  }

  setPupilMode(pupilId, patch) {
    const pupil = this.pupils.get(pupilId);
    if (!pupil || pupil.removed) {
      return { ok: false, reason: 'no-pupil', message: 'That pupil is not in the room.' };
    }
    if (patch.englishOnly !== undefined) pupil.englishOnly = Boolean(patch.englishOnly);
    if (patch.simplified !== undefined && pupil.game) {
      pupil.game.simplified = Boolean(patch.simplified);
    }
    return { ok: true, pupil };
  }

  // -- ticking -------------------------------------------------------------

  /**
   * Advance timers. Returns the pupils whose state changed, so only those get
   * a push.
   */
  tick(now = Date.now()) {
    const changed = [];
    if (this.status === 'running' && this.lessonEndsAt && now >= this.lessonEndsAt) {
      this.end(now);
      return { ended: true, changed: this.pupilList() };
    }
    if (this.status !== 'running') return { ended: false, changed };

    for (const pupil of this.pupilList()) {
      if (pupil.checkRoundExpiry(now)) changed.push(pupil);
      if (pupil.connected && now - pupil.lastSeen > DISCONNECT_GRACE_MS) {
        pupil.connected = false;
        changed.push(pupil);
      }
    }
    return { ended: false, changed };
  }

  /** Optional, off by default. Shows game progress only, never English marks. */
  leaderboard() {
    return this.pupilList()
      .map((p) => ({
        displayName: p.displayName,
        chapter: p.game ? merge.currentChapter(p.game).id : 0,
        requests: p.game ? p.game.requestsCompleted : 0,
        coins: p.game ? p.game.coins : 0,
      }))
      .sort((a, b) => b.chapter - a.chapter || b.requests - a.requests || b.coins - a.coins)
      .slice(0, 10);
  }

  dashboard(now = Date.now()) {
    const pupils = this.pupilList().map((p) => p.teacherRow(now));
    const totals = pupils.reduce(
      (acc, p) => {
        acc.attempted += p.english.attempted;
        acc.firstAttemptCorrect += p.english.firstAttemptCorrect;
        acc.correctAfterRetry += p.english.correctAfterRetry;
        acc.retries += p.english.retries;
        return acc;
      },
      { attempted: 0, firstAttemptCorrect: 0, correctAfterRetry: 0, retries: 0 }
    );
    return {
      room: {
        code: this.code,
        status: this.status,
        createdAt: this.createdAt,
        startedAt: this.startedAt,
        endedAt: this.endedAt,
        lessonEndsAt: this.lessonEndsAt,
        lessonRemainingMs: this.lessonEndsAt ? Math.max(0, this.lessonEndsAt - now) : null,
      },
      settings: { ...this.settings },
      roundLengthChoices: ROUND_LENGTH_CHOICES,
      counts: {
        joined: pupils.length,
        connected: pupils.filter((p) => p.connected).length,
        learning: pupils.filter((p) => p.phase === PHASES.LEARNING).length,
        feedback: pupils.filter((p) => p.phase === PHASES.FEEDBACK).length,
        playing: pupils.filter((p) => p.phase === PHASES.PLAYING).length,
        storyComplete: pupils.filter((p) => p.game && p.game.storyComplete).length,
        mysterySolved: pupils.filter((p) => p.game && p.game.mysterySolved).length,
      },
      englishTotals: {
        ...totals,
        firstAttemptAccuracy:
          totals.attempted === 0 ? null : Math.round((totals.firstAttemptCorrect / totals.attempted) * 100),
      },
      pupils,
      serverNow: now,
      questionCount: this.store.count(),
    };
  }
}

// ---------------------------------------------------------------------------
// Room manager
// ---------------------------------------------------------------------------

class RoomManager {
  constructor(store) {
    this.store = store;
    this.rooms = new Map();
  }

  generateCode() {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      const bytes = crypto.randomBytes(ROOM_CODE_LENGTH);
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('could not allocate a free room code');
  }

  create(options = {}) {
    const code = this.generateCode();
    const room = new Room(code, this.store, options);
    this.rooms.set(code, room);
    return room;
  }

  /** Room codes are matched case-insensitively, so pupils can type lowercase. */
  get(code) {
    if (typeof code !== 'string') return undefined;
    return this.rooms.get(code.trim().toUpperCase());
  }

  list() {
    return [...this.rooms.values()];
  }

  /** Drop rooms that finished long ago, to bound memory use. */
  prune(maxAgeMs = 12 * 60 * 60 * 1000, now = Date.now()) {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      const reference = room.endedAt || room.createdAt;
      if (now - reference > maxAgeMs) {
        this.rooms.delete(code);
        removed++;
      }
    }
    return removed;
  }
}

module.exports = {
  Room,
  Pupil,
  RoomManager,
  validateNickname,
  buildQueue,
  PHASES,
  ROUND_LENGTH_CHOICES,
  DEFAULT_ROUND_SECONDS,
  DEFAULT_LESSON_MINUTES,
  QUESTIONS_PER_CYCLE,
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  MAX_NICKNAME_LENGTH,
  DISCONNECT_GRACE_MS,
  NO_REPEAT_WINDOW,
};
