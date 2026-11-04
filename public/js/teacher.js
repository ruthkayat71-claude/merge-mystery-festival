/** Teacher dashboard. */

import { starArt, trophyArt } from './art.js';

const $ = (id) => document.getElementById(id);
const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
};
const esc = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
  );

const state = {
  roomCode: null,
  dashboard: null,
  qr: null,
  questions: [],
  selectedQuestion: null,
  events: null,
  tab: 'control',
  search: '',
  scoreTab: 'english',
};

/** Illustrations go inside a fixed-ratio box so they can never collapse. */
const art = (svg, extraClass = '') => `<span class="art-box ${extraClass}">${svg}</span>`;

function toast(message, kind = '') {
  if (!message) return;
  const node = el('div', `toast ${kind}`, esc(message));
  $('toasts').appendChild(node);
  setTimeout(() => node.remove(), 3200);
  $('live').textContent = message;
}

async function api(path, body, method) {
  const options = {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (body !== undefined) options.body = JSON.stringify(body);
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    return { ok: false, offline: true, error: 'No connection to the server.' };
  }
  let payload = {};
  try { payload = await response.json(); } catch { /* no body */ }
  return { ok: response.ok, status: response.status, ...payload };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

async function checkStatus() {
  const status = await api('/api/teacher/status');
  if (status.configured === false) $('login-not-configured').hidden = false;
  if (status.signedIn) {
    showDashboard();
  } else {
    $('view-login').hidden = false;
    $('view-dash').hidden = true;
  }
}

async function doLogin(event) {
  event.preventDefault();
  const errorBox = $('login-error');
  errorBox.hidden = true;
  $('btn-login').disabled = true;

  const result = await api('/api/teacher/login', { password: $('input-password').value });
  $('btn-login').disabled = false;
  // The password is cleared from the field straight away.
  $('input-password').value = '';

  if (!result.ok) {
    errorBox.textContent = result.error || 'Could not sign in.';
    errorBox.hidden = false;
    return;
  }
  showDashboard();
}

function showDashboard() {
  $('view-login').hidden = true;
  $('view-dash').hidden = false;
  loadQuestions();
}

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

async function createRoom() {
  $('btn-create-room').disabled = true;
  const result = await api('/api/teacher/rooms', {});
  $('btn-create-room').disabled = false;
  if (!result.ok) {
    toast(result.error || 'Could not create the room.', 'bad');
    return;
  }
  state.roomCode = result.code;
  state.qr = result.qr;
  applyDashboard(result.dashboard);
  renderJoinPanel();
  connectEvents();
  $('panel-no-room').hidden = true;
  $('panel-join').hidden = false;
  $('panel-main').hidden = false;
  $('panel-scoreboard').hidden = false;
}

function renderJoinPanel() {
  const qr = state.qr;
  $('room-code').textContent = state.roomCode;
  $('join-url').textContent = qr.url;
  $('qr-holder').innerHTML = qr.svg;
  $('qr-meta').textContent =
    `QR version ${qr.version}, level ${qr.ecLevel}, ${qr.modules}\u00d7${qr.modules} modules, ` +
    `${qr.quietZoneModules}-module quiet zone.`;
  $('qr-localhost-warning').hidden = !qr.usesLocalhost;

  const verdict = $('qr-verdict');
  if (qr.verified) {
    verdict.className = 'small';
    verdict.innerHTML =
      '<strong>&#10003; Decoded on the server:</strong> this QR code reads back as exactly the join link above. ' +
      'Please still scan it once with a real phone before the lesson.';
  } else {
    verdict.className = 'small';
    verdict.innerHTML =
      `<strong>&#10007; Warning:</strong> the server could not verify this QR code (${esc(qr.verifyError || 'mismatch')}). ` +
      'Use the join link or the room code instead.';
  }
}

function connectEvents() {
  if (state.events) state.events.close();
  const source = new EventSource(`/api/teacher/rooms/${state.roomCode}/events`);
  state.events = source;
  source.addEventListener('dashboard', (event) => {
    try { applyDashboard(JSON.parse(event.data)); } catch { /* ignore */ }
  });
  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) setTimeout(connectEvents, 3000);
  };
}

// ---------------------------------------------------------------------------
// Dashboard rendering
// ---------------------------------------------------------------------------

function applyDashboard(data) {
  if (!data) return;
  state.dashboard = data;

  const pill = $('pill-status');
  pill.className = `status-pill ${data.room.status}`;
  pill.textContent = {
    lobby: 'Waiting in lobby',
    running: 'Running',
    paused: 'Paused',
    ended: 'Finished',
  }[data.room.status] || data.room.status;

  const remaining = data.room.lessonRemainingMs;
  $('pill-lesson').textContent =
    remaining === null || remaining === undefined
      ? `Lesson ${data.settings.lessonMinutes} min`
      : `${Math.floor(remaining / 60000)}m ${String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0')}s left`;

  renderCounters(data);
  renderSettings(data);
  renderPupils(data);
  renderScoreboard(data);

  $('btn-start').disabled = data.room.status === 'running' || data.room.status === 'ended';
  $('btn-pause').disabled = data.room.status !== 'running';
  $('btn-resume').disabled = data.room.status !== 'paused';
  $('btn-end').disabled = data.room.status === 'ended';
}

// ---------------------------------------------------------------------------
// Live scoreboard
// ---------------------------------------------------------------------------

/**
 * Two boards, two tabs, updating automatically from the same event stream that
 * feeds the rest of the dashboard.
 *
 * English Stars and Festival Champions are computed from completely separate
 * data. Equal scores share a rank, and answer speed is never used as a
 * tie-break on either board.
 */
function renderScoreboard(data) {
  const board = data.scoreboard;
  const panel = $('panel-scoreboard');
  if (!board) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const rows = board[state.scoreTab] || [];
  $('score-count').textContent =
    `${board.english.length} detective${board.english.length === 1 ? '' : 's'}`;
  $('score-how').textContent = board.explanations[state.scoreTab];
  $('score-how').classList.toggle('for-game', state.scoreTab === 'game');

  for (const button of document.querySelectorAll('[data-score-tab]')) {
    button.setAttribute('aria-selected', String(button.dataset.scoreTab === state.scoreTab));
  }

  if (rows.length === 0) {
    $('score-board').innerHTML = '<p class="score-empty">No scores yet. Press Start to begin.</p>';
  } else if (state.scoreTab === 'english') {
    $('score-board').innerHTML =
      '<table class="score-table"><thead><tr>' +
      '<th>Rank</th><th>Detective</th><th class="num">Points</th>' +
      '<th class="num">Questions asked</th><th class="num">Right 1st try</th>' +
      '<th class="num">After retry</th></tr></thead><tbody>' +
      rows
        .map(
          (row) =>
            `<tr><td>${rankCell(row)}</td>` +
            `<td class="score-name">${esc(row.displayName)}${row.connected ? '' : ' <span class="score-sub">(offline)</span>'}</td>` +
            `<td class="num score-points">${row.points}</td>` +
            `<td class="num">${row.attempted}</td>` +
            `<td class="num">${row.firstAttemptCorrect}</td>` +
            `<td class="num">${row.correctAfterRetry}</td></tr>`
        )
        .join('') +
      '</tbody></table>';
  } else {
    $('score-board').innerHTML =
      '<table class="score-table"><thead><tr>' +
      '<th>Rank</th><th>Detective</th><th class="num">Orders</th>' +
      '<th class="num">Coins</th><th>Chapter</th><th class="num">Clues</th></tr></thead><tbody>' +
      rows
        .map(
          (row) =>
            `<tr><td>${rankCell(row)}</td>` +
            `<td class="score-name">${esc(row.displayName)}${row.connected ? '' : ' <span class="score-sub">(offline)</span>'}</td>` +
            `<td class="num score-points">${row.missions}</td>` +
            `<td class="num">${row.coins}</td>` +
            `<td>${esc(row.chapterName)}</td>` +
            `<td class="num">${row.cluesFound}/5</td></tr>`
        )
        .join('') +
      '</tbody></table>';
  }

  // Winners are only meaningful once the lesson has finished.
  $('score-winners').innerHTML =
    data.room.status === 'ended' ? winnersHtml(board) : '';
}

function rankCell(row) {
  const className = row.rank <= 3 ? `rank rank-${row.rank}` : 'rank';
  return `<span class="${className}${row.tied ? ' rank-tied' : ''}">${row.rank}</span>`;
}

/** Separate winners for English and for the game. Ties share the place. */
function winnersHtml(board) {
  const list = (entries, score) =>
    entries.length === 0
      ? '<p class="winner-score">Nobody yet</p>'
      : entries
          .map(
            (entry) =>
              `<p class="winner-name">${esc(entry.displayName)}</p>` +
              `<p class="winner-score">${esc(score(entry))}</p>`
          )
          .join('');
  return (
    '<h3>Today\u2019s winners</h3><div class="winner-grid">' +
    `<div class="winner-card english">${art(starArt())}<h3>${esc(board.labels.english)}</h3>` +
    list(board.winners.english, (e) => `${e.points} points from ${e.attempted} questions`) +
    '</div>' +
    `<div class="winner-card game">${art(trophyArt())}<h3>${esc(board.labels.game)}</h3>` +
    list(board.winners.game, (e) => `${e.missions} orders, ${e.coins} coins`) +
    '</div></div>' +
    '<p class="small muted">Two separate prizes. Equal scores share a place.</p>'
  );
}

function renderCounters(data) {
  const items = [
    ['Joined', data.counts.joined],
    ['Connected', data.counts.connected],
    ['On questions', data.counts.learning + data.counts.feedback],
    ['Merging', data.counts.playing],
    ['Questions attempted', data.englishTotals.attempted],
    ['1st-try accuracy', data.englishTotals.firstAttemptAccuracy === null ? '\u2013' : `${data.englishTotals.firstAttemptAccuracy}%`],
    ['Retries', data.englishTotals.retries],
    ['Story finished', data.counts.storyComplete],
    ['Mystery solved', data.counts.mysterySolved],
  ];
  $('counters').innerHTML = items
    .map(([k, n]) => `<div class="counter"><div class="n">${esc(n)}</div><div class="k">${esc(k)}</div></div>`)
    .join('');
}

let settingsPainted = false;
function renderSettings(data) {
  const seg = $('seg-round');
  if (seg.children.length === 0) {
    for (const seconds of data.roundLengthChoices) {
      const button = el('button', 'btn-ghost', `${seconds}s`);
      button.type = 'button';
      button.dataset.seconds = String(seconds);
      button.addEventListener('click', () => saveSettings({ roundSeconds: seconds }));
      seg.appendChild(button);
    }
  }
  [...seg.children].forEach((child) => {
    child.classList.toggle('on', Number(child.dataset.seconds) === data.settings.roundSeconds);
  });

  if (!settingsPainted) {
    $('input-lesson').value = data.settings.lessonMinutes;
    $('input-allowance').value = data.settings.roundAllowance;
    settingsPainted = true;
  }
  const scoreboardToggle = $('btn-scoreboard');
  scoreboardToggle.textContent = data.settings.publicScoreboard ? 'On' : 'Off';
  scoreboardToggle.className = data.settings.publicScoreboard ? 'btn-go' : 'btn-ghost';
}

async function saveSettings(patch) {
  const result = await api(`/api/teacher/rooms/${state.roomCode}/settings`, patch);
  const box = $('settings-error');
  if (!result.ok) {
    box.textContent = (result.problems || [result.error || 'Could not save.']).join(' ');
    box.hidden = false;
    return;
  }
  box.hidden = true;
  applyDashboard(result.dashboard);
  toast('Saved.', 'good');
}

function phaseLabel(phase) {
  return {
    lobby: 'In lobby', learning: 'English question', feedback: 'Reading feedback',
    playing: 'Merge round', paused: 'Paused', ended: 'Finished',
  }[phase] || phase;
}

function renderPupils(data) {
  const body = $('pupil-rows');
  body.innerHTML = '';
  $('pupils-empty').hidden = data.pupils.length > 0;

  for (const pupil of data.pupils) {
    const row = el('tr');
    const game = pupil.game || {};
    const connection = pupil.connected
      ? '<span class="chip chip-good">Online</span>'
      : `<span class="chip chip-bad">Offline ${pupil.secondsSinceSeen}s</span>`;

    row.innerHTML =
      `<td class="name">${esc(pupil.displayName)}` +
      (pupil.englishOnly ? '<div class="mini">English only</div>' : '') +
      (pupil.simplified ? '<div class="mini">Simple merge</div>' : '') +
      `</td>` +
      `<td>${connection}</td>` +
      `<td>${esc(phaseLabel(pupil.phase))}</td>` +
      `<td>${pupil.english.attempted}</td>` +
      `<td>${pupil.english.firstAttemptCorrect}</td>` +
      `<td>${pupil.english.correctAfterRetry}</td>` +
      `<td>${pupil.english.retries}</td>` +
      `<td>${pupil.english.firstAttemptAccuracy === null ? '\u2013' : pupil.english.firstAttemptAccuracy + '%'}</td>` +
      `<td>${esc(game.chapterName || '\u2013')}<div class="mini">${esc(game.chapterProgress || '')}</div></td>` +
      `<td>${game.requestsCompleted ?? '\u2013'}</td>` +
      `<td>${game.cluesFound ?? 0}/5</td>` +
      `<td>${game.mysterySolved ? '<span class="chip chip-good">Solved</span>' : '\u2013'}</td>`;

    const actions = el('td');
    const viewButton = el('button', 'btn-ghost', 'Answers');
    viewButton.type = 'button';
    viewButton.addEventListener('click', () => showAnswers(pupil.id));
    actions.appendChild(viewButton);

    const simpleButton = el('button', pupil.simplified ? 'btn-go' : 'btn-ghost', 'Simple');
    simpleButton.type = 'button';
    simpleButton.title = 'Highlight matching items and show guided requests';
    simpleButton.addEventListener('click', () =>
      setMode(pupil.id, { simplified: !pupil.simplified }));
    actions.appendChild(simpleButton);

    const englishButton = el('button', pupil.englishOnly ? 'btn-go' : 'btn-ghost', 'Eng only');
    englishButton.type = 'button';
    englishButton.title = 'Skip the merge rounds for this pupil';
    englishButton.addEventListener('click', () =>
      setMode(pupil.id, { englishOnly: !pupil.englishOnly }));
    actions.appendChild(englishButton);

    const removeButton = el('button', 'btn-stop', 'Remove');
    removeButton.type = 'button';
    removeButton.addEventListener('click', () => confirmRemove(pupil));
    actions.appendChild(removeButton);

    row.appendChild(actions);
    body.appendChild(row);
  }
}

async function setMode(pupilId, patch) {
  const result = await api(`/api/teacher/rooms/${state.roomCode}/pupils/${pupilId}/mode`, patch);
  if (!result.ok) toast(result.error || 'Could not change the mode.', 'bad');
  else toast('Changed.', 'good');
}

function confirmRemove(pupil) {
  showOverlay({
    title: 'Remove this nickname?',
    bodyHtml:
      `<p><strong>${esc(pupil.displayName)}</strong> will be signed out and will need to join again ` +
      `with a new nickname. Their answers stay in your results and CSV export.</p>`,
    actions: [
      {
        label: 'Remove',
        kind: 'btn-stop',
        onClick: async () => {
          const result = await api(`/api/teacher/rooms/${state.roomCode}/pupils/${pupil.id}/remove`, {});
          if (!result.ok) toast(result.error || 'Could not remove.', 'bad');
          else { applyDashboard(result.dashboard); toast('Removed.', 'good'); }
        },
      },
    ],
  });
}

async function showAnswers(pupilId) {
  const result = await api(`/api/teacher/rooms/${state.roomCode}/pupils/${pupilId}/answers`);
  if (!result.ok) {
    toast(result.error || 'Could not load the answers.', 'bad');
    return;
  }
  const rows = result.answers.length
    ? result.answers
        .map((answer) => {
          const attempts = answer.attempts
            .map(
              (attempt, index) =>
                `<li>Try ${index + 1}: &ldquo;${esc(attempt.submitted)}&rdquo; ` +
                `${attempt.correct ? '<strong>&#10003; correct</strong>' : '<strong>&#10007; wrong</strong>'}</li>`
            )
            .join('');
          return (
            `<div class="card stack" style="padding:0.7rem">` +
            `<p style="margin:0"><strong>${esc(answer.prompt)}</strong></p>` +
            `<p class="small muted" style="margin:0">${esc(answer.topic)} &middot; ${esc(answer.type)} &middot; ` +
            `difficulty ${answer.difficulty}</p>` +
            `<ul class="small" style="margin:0">${attempts}</ul>` +
            `<p class="small" style="margin:0">Correct answer: <strong>${esc(answer.correctAnswer)}</strong></p>` +
            `</div>`
          );
        })
        .join('')
    : '<p class="muted">No answers yet.</p>';

  showOverlay({
    title: `${result.pupil.displayName} \u2014 English answers`,
    bodyHtml:
      `<p>Attempted <strong>${result.english.attempted}</strong> &middot; ` +
      `right first try <strong>${result.english.firstAttemptCorrect}</strong> &middot; ` +
      `right after retry <strong>${result.english.correctAfterRetry}</strong> &middot; ` +
      `retries <strong>${result.english.retries}</strong></p>${rows}`,
  });
}

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

async function loadQuestions() {
  const result = await api('/api/teacher/questions');
  if (!result.ok) return;
  state.questions = result.questions;
  $('q-count').textContent = `${result.questions.length} questions in the bank.`;
  const problems = $('q-problems');
  if (result.problems && result.problems.length > 0) {
    problems.hidden = false;
    problems.textContent = `Problems found: ${result.problems.join(' | ')}`;
  } else {
    problems.hidden = true;
  }
  renderQuestionList();
}

function renderQuestionList() {
  const host = $('q-list');
  host.innerHTML = '';
  const needle = state.search.toLowerCase();
  const matches = state.questions.filter(
    (q) =>
      needle === '' ||
      q.prompt.toLowerCase().includes(needle) ||
      q.topic.includes(needle) ||
      q.id.toLowerCase().includes(needle)
  );
  for (const question of matches) {
    const row = el('button', `q-row ${state.selectedQuestion === question.id ? 'active' : ''}`);
    row.type = 'button';
    row.innerHTML =
      `<span class="q-id">${esc(question.id)}</span>` +
      `<span class="q-prompt">${esc(question.prompt)}</span>` +
      `<span class="chip">${esc(question.type)} ${question.difficulty}</span>`;
    row.addEventListener('click', () => {
      state.selectedQuestion = question.id;
      renderQuestionList();
      renderQuestionEditor(question);
    });
    host.appendChild(row);
  }
  if (matches.length === 0) host.innerHTML = '<p class="muted" style="padding:0.8rem">No matches.</p>';
}

function renderQuestionEditor(question) {
  const host = $('q-editor');
  const isChoice = question.type === 'mc' || question.type === 'reading';
  host.innerHTML =
    `<h3 style="margin:0">${esc(question.id)} <span class="chip">${esc(question.topic)}</span> ` +
    `<span class="chip">${esc(question.type)}</span></h3>` +
    `<div><label for="e-prompt">Prompt</label><textarea id="e-prompt">${esc(question.prompt)}</textarea></div>` +
    (question.passage !== undefined
      ? `<div><label for="e-passage">Reading passage (2\u20134 lines)</label>` +
        `<textarea id="e-passage">${esc(question.passage)}</textarea></div>`
      : '') +
    (isChoice
      ? `<div><label for="e-options">Choices (one per line)</label>` +
        `<textarea id="e-options">${esc((question.options || []).join('\n'))}</textarea></div>`
      : '') +
    `<div><label for="e-answer">Correct answer</label>` +
    `<input type="text" id="e-answer" value="${esc(question.answer)}"></div>` +
    `<div><label for="e-accepted">Also accept these answers (one per line)</label>` +
    `<textarea id="e-accepted">${esc((question.accepted || []).join('\n'))}</textarea>` +
    `<p class="small muted">Spaces, capital letters and ordinary punctuation are already ignored.</p></div>` +
    (question.acceptedPatterns
      ? `<div><label for="e-patterns">Accepted sentence patterns (advanced, one per line)</label>` +
        `<textarea id="e-patterns">${esc(question.acceptedPatterns.join('\n'))}</textarea>` +
        `<p class="small muted">Each line must start with ^ and end with $.</p></div>`
      : '') +
    `<div><label for="e-explanation">Friendly explanation</label>` +
    `<textarea id="e-explanation">${esc(question.explanation)}</textarea></div>` +
    (question.example !== undefined
      ? `<div><label for="e-example">Example answer (shown only after answering)</label>` +
        `<input type="text" id="e-example" value="${esc(question.example)}"></div>`
      : '') +
    `<p class="warn-box" id="e-problems" hidden></p><p class="ok-box" id="e-ok" hidden></p>` +
    `<div class="row"><button type="button" class="btn-go grow" id="btn-q-save">Save question</button>` +
    `<button type="button" class="btn-ghost grow" id="btn-q-reload">Undo changes</button></div>` +
    `<div class="card stack" style="padding:0.7rem">` +
    `<label for="e-test">Try an answer against this question</label>` +
    `<div class="row"><input type="text" id="e-test" class="grow" placeholder="Type a pupil answer">` +
    `<button type="button" class="btn-primary" id="btn-q-test">Test</button></div>` +
    `<p id="e-test-result" class="small"></p></div>`;

  $('btn-q-save').addEventListener('click', () => saveQuestion(question));
  $('btn-q-reload').addEventListener('click', () => renderQuestionEditor(question));
  $('btn-q-test').addEventListener('click', async () => {
    const result = await api(`/api/teacher/questions/${question.id}/test`, { answer: $('e-test').value });
    const box = $('e-test-result');
    if (!result.ok) { box.textContent = (result.problems || ['Could not test.']).join(' '); return; }
    box.innerHTML = result.correct
      ? `<strong>&#10003; Marked correct</strong> (matched by ${esc(result.matchedBy)}). Server read it as &ldquo;${esc(result.normalised)}&rdquo;.`
      : `<strong>&#10007; Marked wrong.</strong> Server read it as &ldquo;${esc(result.normalised)}&rdquo;.`;
  });
}

function linesOf(id) {
  const node = $(id);
  if (!node) return undefined;
  return node.value.split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

async function saveQuestion(question) {
  const patch = {
    prompt: $('e-prompt').value,
    answer: $('e-answer').value,
    explanation: $('e-explanation').value,
    accepted: linesOf('e-accepted') || [],
  };
  if ($('e-passage')) patch.passage = $('e-passage').value;
  if ($('e-options')) patch.options = linesOf('e-options');
  if ($('e-patterns')) patch.acceptedPatterns = linesOf('e-patterns');
  if ($('e-example')) patch.example = $('e-example').value;

  const result = await api(`/api/teacher/questions/${question.id}`, { patch }, 'PUT');
  const problems = $('e-problems');
  const ok = $('e-ok');
  if (!result.ok) {
    ok.hidden = true;
    problems.hidden = false;
    problems.textContent = (result.problems || [result.error || 'Could not save.']).join(' ');
    return;
  }
  problems.hidden = true;
  ok.hidden = false;
  ok.textContent = 'Saved and checked. The correct answer still passes and the wrong choices still fail.';
  await loadQuestions();
  const fresh = state.questions.find((q) => q.id === question.id);
  if (fresh) renderQuestionEditor(fresh);
  toast('Question saved.', 'good');
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

function showOverlay({ title, bodyHtml, actions = [] }) {
  closeOverlay();
  const backdrop = el('div', 'sheet-backdrop');
  const sheet = el('div', 'sheet stack');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML = `<h2>${esc(title)}</h2><div class="stack">${bodyHtml}</div>`;
  const row = el('div', 'row');
  for (const action of actions) {
    const button = el('button', `${action.kind || 'btn-ghost'} grow`, esc(action.label));
    button.type = 'button';
    button.addEventListener('click', () => { if (action.onClick) action.onClick(); closeOverlay(); });
    row.appendChild(button);
  }
  const close = el('button', 'btn-ghost grow', 'Close');
  close.type = 'button';
  close.addEventListener('click', closeOverlay);
  row.appendChild(close);
  sheet.appendChild(row);
  backdrop.appendChild(sheet);
  $('overlay-host').appendChild(backdrop);
  sheet.querySelector('button')?.focus();
}

function closeOverlay() {
  $('overlay-host').innerHTML = '';
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

async function control(action) {
  const result = await api(`/api/teacher/rooms/${state.roomCode}/${action}`, {});
  if (!result.ok) { toast(result.error || 'Could not do that.', 'bad'); return; }
  applyDashboard(result.dashboard);
  toast({ start: 'Lesson running.', pause: 'Paused.', end: 'Lesson finished.' }[action] || 'Done.', 'good');
}

function download(kind) {
  if (!state.roomCode) { toast('Create a room first.', 'bad'); return; }
  window.location.href = `/api/teacher/rooms/${state.roomCode}/export/${kind}.csv`;
}

function boot() {
  $('score-tab-star').innerHTML = starArt();
  $('score-tab-trophy').innerHTML = trophyArt();
  for (const button of document.querySelectorAll('[data-score-tab]')) {
    button.addEventListener('click', () => {
      state.scoreTab = button.dataset.scoreTab;
      if (state.dashboard) renderScoreboard(state.dashboard);
    });
  }

  $('login-form').addEventListener('submit', doLogin);
  $('btn-logout').addEventListener('click', async () => {
    await api('/api/teacher/logout', {});
    location.reload();
  });
  $('btn-create-room').addEventListener('click', createRoom);

  $('btn-start').addEventListener('click', () => control('start'));
  $('btn-resume').addEventListener('click', () => control('start'));
  $('btn-pause').addEventListener('click', () => control('pause'));
  $('btn-end').addEventListener('click', () => {
    showOverlay({
      title: 'End the lesson?',
      bodyHtml:
        '<p>Every pupil will see the finish screen and will not be able to play any more.</p>' +
        '<p class="warn-box">Export your CSV results first if you have not already.</p>',
      actions: [{ label: 'End lesson', kind: 'btn-stop', onClick: () => control('end') }],
    });
  });

  $('btn-save-lesson').addEventListener('click', () =>
    saveSettings({ lessonMinutes: Number($('input-lesson').value) }));
  $('btn-save-allowance').addEventListener('click', () =>
    saveSettings({ roundAllowance: Number($('input-allowance').value) }));
  $('btn-scoreboard').addEventListener('click', () =>
    saveSettings({ publicScoreboard: !state.dashboard.settings.publicScoreboard }));

  $('btn-copy-link').addEventListener('click', async () => {
    const url = state.qr ? state.qr.url : '';
    try {
      await navigator.clipboard.writeText(url);
      toast('Join link copied.', 'good');
    } catch {
      // Clipboard access can be refused; show the link so it can be copied by hand.
      showOverlay({ title: 'Join link', bodyHtml: `<p class="join-url">${esc(url)}</p>` });
    }
  });
  $('btn-open-png').addEventListener('click', () => {
    window.open(`/api/teacher/rooms/${state.roomCode}/qr?format=png`, '_blank', 'noopener');
  });
  $('btn-check-qr').addEventListener('click', async () => {
    const result = await api(`/api/teacher/rooms/${state.roomCode}/qr`);
    if (!result.ok) { toast('Could not check the QR code.', 'bad'); return; }
    state.qr = result;
    renderJoinPanel();
    showOverlay({
      title: 'QR code check',
      bodyHtml:
        `<p>The server encoded the join link, then decoded the picture again.</p>` +
        `<p>Link encoded:<br><span class="join-url">${esc(result.url)}</span></p>` +
        `<p>Text decoded back:<br><span class="join-url">${esc(result.decodedText || '(failed)')}</span></p>` +
        (result.verified
          ? '<p class="ok-box">&#10003; They match exactly.</p>'
          : '<p class="warn-box">&#10007; They do not match. Use the room code instead.</p>') +
        '<p class="warn-box">This is a software check only. Before the lesson, scan the code ' +
        'once with a real phone camera and confirm the game opens.</p>',
    });
  });

  $('btn-present').addEventListener('click', () => {
    document.body.classList.toggle('present');
    $('btn-present').textContent = document.body.classList.contains('present') ? 'Exit TV view' : 'TV view';
  });

  $('btn-csv-english').addEventListener('click', () => download('english-summary'));
  $('btn-csv-answers').addEventListener('click', () => download('english-answers'));
  $('btn-csv-game').addEventListener('click', () => download('game-results'));

  $('q-search').addEventListener('input', (event) => {
    state.search = event.target.value;
    renderQuestionList();
  });
  $('btn-q-export').addEventListener('click', () => {
    window.location.href = '/api/teacher/questions/export';
  });

  for (const button of document.querySelectorAll('.tabs button')) {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b === button));
      document.querySelectorAll('[data-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.panel !== state.tab;
      });
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeOverlay();
  });

  checkStatus();
}

boot();
