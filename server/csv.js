'use strict';
/**
 * CSV export with spreadsheet formula-injection protection.
 *
 * A pupil nickname such as `=cmd|...` would be executed as a formula by Excel,
 * LibreOffice and Google Sheets when the file is opened. Any cell starting with
 * a formula trigger is therefore prefixed with a single quote, which those
 * applications display as plain text.
 */

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r', '\n', '\u0009', '|'];

/**
 * Make one value safe for a CSV cell.
 * @param {*} value
 * @returns {string}
 */
function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);

  // Strip control characters that would break row structure, keeping spaces.
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  // Neutralise anything a spreadsheet would read as a formula.
  if (text.length > 0 && FORMULA_TRIGGERS.includes(text[0])) {
    text = `'${text}`;
  }

  // Standard RFC 4180 quoting.
  if (/[",\n\r]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Build a CSV document.
 * @param {string[]} headers
 * @param {Array<Array<*>>} rows
 * @returns {string}
 */
function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  // A BOM makes Excel open UTF-8 (including Thai names) correctly.
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

/** Filename-safe slug for download headers. */
function safeFilename(base) {
  const cleaned = String(base)
    .replace(/[^A-Za-z0-9._-]/g, '-')
    // Collapse dot runs so no "../" style sequence can survive, and never
    // start the name with a dot or dash.
    .replace(/\.{2,}/g, '.')
    .replace(/-+/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 60);
  return cleaned || 'export';
}

function isoOrBlank(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/**
 * English results, one row per pupil. Learning data only.
 */
function englishSummaryCsv(room) {
  const headers = [
    'room_code', 'nickname', 'pupil_label', 'joined_at', 'connection',
    'questions_attempted', 'first_attempt_correct', 'correct_after_retry',
    'incorrect', 'total_retries', 'first_attempt_accuracy_percent',
    'phase', 'english_only_mode', 'simplified_merge_mode',
  ];
  const rows = [];
  for (const pupil of room.pupilList()) {
    const summary = pupil.learningSummary();
    rows.push([
      room.code,
      pupil.nickname,
      pupil.displayName,
      isoOrBlank(pupil.joinedAt),
      pupil.connected ? 'connected' : 'disconnected',
      summary.attempted,
      summary.firstAttemptCorrect,
      summary.correctAfterRetry,
      summary.incorrect,
      summary.retries,
      summary.firstAttemptAccuracy === null ? '' : summary.firstAttemptAccuracy,
      pupil.phase,
      pupil.englishOnly ? 'yes' : 'no',
      pupil.game && pupil.game.simplified ? 'yes' : 'no',
    ]);
  }
  return toCsv(headers, rows);
}

/**
 * Every individual answer, one row per attempt.
 */
function englishAnswersCsv(room) {
  const headers = [
    'room_code', 'nickname', 'pupil_label', 'question_id', 'topic', 'type',
    'difficulty', 'attempt_number', 'submitted_answer', 'marked_correct',
    'first_attempt_correct', 'answered_at',
  ];
  const rows = [];
  for (const pupil of room.pupilList()) {
    for (const entry of Object.values(pupil.learning.answers || {})) {
      entry.attempts.forEach((attempt, index) => {
        rows.push([
          room.code,
          pupil.nickname,
          pupil.displayName,
          entry.questionId,
          entry.topic,
          entry.type,
          entry.difficulty,
          index + 1,
          attempt.submitted,
          attempt.correct ? 'yes' : 'no',
          index === 0 && attempt.correct ? 'yes' : 'no',
          isoOrBlank(attempt.at),
        ]);
      });
    }
  }
  return toCsv(headers, rows);
}

/**
 * Game results, kept in a separate file from English results.
 */
function gameResultsCsv(room) {
  const headers = [
    'room_code', 'nickname', 'pupil_label', 'chapter', 'chapter_name',
    'chapter_progress', 'requests_completed', 'coins', 'merges', 'deliveries',
    'clues_found', 'clues_solved', 'story_complete', 'mystery_solved',
    'hints_used', 'helping_hand_used',
  ];
  const rows = [];
  for (const pupil of room.pupilList()) {
    const game = pupil.gameSummary();
    if (!game) continue;
    rows.push([
      room.code,
      pupil.nickname,
      pupil.displayName,
      game.chapterId,
      game.chapterName,
      game.chapterProgress,
      game.requestsCompleted,
      game.coins,
      game.merges,
      game.deliveries,
      game.cluesFound,
      game.cluesSolved,
      game.storyComplete ? 'yes' : 'no',
      game.mysterySolved ? 'yes' : 'no',
      game.hintsUsed,
      game.rescuesUsed,
    ]);
  }
  return toCsv(headers, rows);
}

module.exports = {
  escapeCell,
  toCsv,
  safeFilename,
  englishSummaryCsv,
  englishAnswersCsv,
  gameResultsCsv,
  FORMULA_TRIGGERS,
};
