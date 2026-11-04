/**
 * Pupil app.
 *
 * One phone, one pupil. The server owns the board; this file renders the state
 * it is given, collects touch input, and plays the animations.
 */

import {
  itemArt, sourceArt, characterArt, sceneArt, mapPinArt, shopArt,
  clueCardArt, chestArt, coinArt, chargeArt, starArt, trophyArt,
  familyColour, chapterTheme, PALETTE, CHAPTER_CHARACTER,
} from './art.js';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
};
/**
 * Wrap an illustration in a fixed-ratio box.
 *
 * An inline SVG with only a viewBox collapses to zero height inside a flex
 * container on iOS Safari and several Android WebViews, which is what made
 * board items invisible. The box gets its height from a padding ratio instead,
 * so the picture always has somewhere to be drawn.
 */
const art = (svg, extraClass = '') => `<span class="art-box ${extraClass}">${svg}</span>`;

const esc = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
  );

const STORE_KEY = 'merge-mystery-session';
const PREFS_KEY = 'merge-mystery-prefs';

const state = {
  config: null,
  session: null, // { roomCode, rejoinToken }
  data: null, // latest server state
  selected: null, // { zone, index }
  hintRefs: [],
  suggestedFamily: null,
  pendingRecycle: null,
  recycleMode: false,
  orderTokens: [],
  chosenOption: null,
  timerHandle: null,
  timerBase: null,
  events: null,
  reconnectDelay: 1000,
  seenClues: new Set(),
  shownChapterIntro: new Set(),
  tutorialStep: 0,
  infoMode: false,
  scoreTab: 'english',
  themeKey: null,
  prefs: { sound: true, reducedMotion: false, tutorialDone: false },
  lastStateJson: '',
};

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) Object.assign(state.prefs, JSON.parse(raw));
  } catch { /* storage unavailable, keep defaults */ }
  document.body.classList.toggle('reduced-motion', state.prefs.reducedMotion);
}
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch { /* ignore */ }
}
function loadSession() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) state.session = JSON.parse(raw);
  } catch { /* ignore */ }
}
function saveSession(session) {
  state.session = session;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(session)); } catch { /* ignore */ }
}
function clearSession() {
  state.session = null;
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
}

function announce(text) {
  $('live').textContent = text;
}

function toast(message, kind = '') {
  if (!message) return;
  const host = $('toasts');
  const node = el('div', `toast ${kind}`, esc(message));
  host.appendChild(node);
  setTimeout(() => node.remove(), 2600);
  announce(message);
}

// ---------------------------------------------------------------------------
// Sound: created only after the first real user gesture
// ---------------------------------------------------------------------------

const sound = {
  ctx: null,
  unlocked: false,
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this.ctx = new Ctx();
    } catch { this.ctx = null; }
  },
  play(kind) {
    if (!state.prefs.sound || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const tones = {
      merge: [[523, 0], [784, 0.07]],
      spawn: [[392, 0]],
      deliver: [[523, 0], [659, 0.07], [784, 0.15]],
      no: [[196, 0]],
      good: [[659, 0], [880, 0.09]],
      celebrate: [[523, 0], [659, 0.08], [784, 0.16], [1047, 0.26]],
    }[kind] || [[440, 0]];

    const now = this.ctx.currentTime;
    for (const [freq, delay] of tones) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = kind === 'no' ? 'sawtooth' : 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.12, now + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.22);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.25);
    }
  },
};

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

async function api(path, body) {
  const options = {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (body !== undefined) options.body = JSON.stringify(body);

  let response;
  try {
    response = await fetch(path, options);
  } catch {
    return { ok: false, offline: true, error: 'No connection. Trying again...' };
  }
  let payload = {};
  try { payload = await response.json(); } catch { /* empty body */ }
  return { ok: response.ok, status: response.status, ...payload };
}

let nonceCounter = 0;
function nextNonce() {
  nonceCounter++;
  return `${Date.now().toString(36)}-${nonceCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

function connectEvents() {
  if (state.events) state.events.close();
  const source = new EventSource('/api/pupil/events');
  state.events = source;

  source.addEventListener('state', (event) => {
    state.reconnectDelay = 1000;
    try { applyState(JSON.parse(event.data)); } catch { /* ignore malformed frame */ }
  });
  source.addEventListener('removed', (event) => {
    let message = 'Your teacher removed this nickname.';
    try { message = JSON.parse(event.data).message || message; } catch { /* ignore */ }
    source.close();
    clearSession();
    showOverlay({
      title: 'Please join again',
      bodyHtml: `<p>${esc(message)}</p>`,
      actions: [{ label: 'Join again', kind: 'btn-go', onClick: () => location.reload() }],
      dismissible: false,
    });
  });
  source.onerror = () => {
    // EventSource retries on its own; this only covers a hard close.
    if (source.readyState === EventSource.CLOSED) {
      setTimeout(() => {
        state.reconnectDelay = Math.min(state.reconnectDelay * 2, 15000);
        connectEvents();
      }, state.reconnectDelay);
    }
  };
}

/** Keeps the pupil marked as connected and nudges the server to check timers. */
function startHeartbeat() {
  setInterval(async () => {
    if (!state.session) return;
    const result = await api('/api/pupil/heartbeat', {});
    if (result.status === 401) await tryRejoin();
  }, 15000);
}

async function tryRejoin() {
  if (!state.session) return false;
  const result = await api('/api/pupil/rejoin', {
    roomCode: state.session.roomCode,
    rejoinToken: state.session.rejoinToken,
  });
  if (result.ok && result.state) {
    saveSession({ roomCode: state.session.roomCode, rejoinToken: result.rejoinToken });
    applyState(result.state);
    connectEvents();
    return true;
  }
  if (result.status === 401 || result.status === 404) {
    clearSession();
    showScreen('join');
    $('topbar').hidden = true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const SCREENS = ['join', 'tutorial', 'wait', 'learning', 'feedback', 'play', 'paused', 'ended'];

function showScreen(name) {
  for (const screen of SCREENS) {
    const node = $(`screen-${screen}`);
    if (node) node.hidden = screen !== name;
  }
}

function applyState(data) {
  const previous = state.data;
  state.data = data;
  $('topbar').hidden = false;
  $('bar-name').textContent = data.pupil.displayName;

  if (data.game) {
    $('bar-chapter').textContent =
      `Chapter ${data.game.chapter.id} of ${data.game.chapter.total}: ${data.game.chapter.name}`;
  } else {
    $('bar-chapter').textContent = 'English only mode';
  }

  // Tutorial, once per device, before the first real screen.
  if (!state.prefs.tutorialDone) {
    showScreen('tutorial');
    renderTutorial();
    return;
  }

  routePhase(data, previous);
}

function routePhase(data, previous) {
  switch (data.phase) {
    case 'lobby':
      showScreen('wait');
      $('wait-text').textContent =
        data.room.status === 'running'
          ? 'Getting your first question ready...'
          : 'Waiting for your teacher to start.';
      $('wait-art').innerHTML = art(characterArt('Detective', 'happy'));
      break;
    case 'learning':
      showScreen('learning');
      renderQuestion(data);
      break;
    case 'feedback':
      showScreen('feedback');
      renderFeedback(data);
      break;
    case 'playing':
      showScreen('play');
      renderPlay(data, previous);
      break;
    case 'paused':
      showScreen('paused');
      $('paused-detail').textContent = data.round.remainingMs
        ? `Your round will carry on with ${Math.ceil(data.round.remainingMs / 1000)} seconds left.`
        : 'Your questions are waiting for you.';
      stopTimer();
      break;
    case 'ended':
      showScreen('ended');
      renderEnded(data);
      stopTimer();
      break;
    default:
      showScreen('wait');
  }

  if (data.phase !== 'playing') stopTimer();
  maybeShowStoryOverlays(data);
}

// ---------------------------------------------------------------------------
// Tutorial: three screens maximum
// ---------------------------------------------------------------------------

const TUTORIAL = [
  {
    title: '1. Answer two questions',
    text: 'Read the English question and choose or type your answer. If it is wrong, you get one more try and a hint.',
    art: () => characterArt('Miss Nin', 'happy'),
  },
  {
    title: '2. Join two the same',
    text: 'Tap a supply box to make an item. Tap one item, then tap another that looks the same. They join and grow bigger!',
    art: () => itemArt('flower', 2),
  },
  {
    title: '3. Help the town, find the chest',
    text: 'Deliver the items people ask for. Each place you fix gives you a clue card. Five clues tell you where the festival chest is hidden.',
    art: () => chestArt(),
  },
];

function renderTutorial() {
  const step = TUTORIAL[state.tutorialStep];
  $('tut-title').textContent = step.title;
  $('tut-text').textContent = step.text;
  $('tut-art').innerHTML = art(step.art());
  $('tut-dots').innerHTML = TUTORIAL.map((_, i) =>
    `<span class="${i === state.tutorialStep ? 'on' : ''}"></span>`).join('');
  $('btn-tut-back').disabled = state.tutorialStep === 0;
  $('btn-tut-next').textContent = state.tutorialStep === TUTORIAL.length - 1 ? "Let's play!" : 'Next';
}

function finishTutorial() {
  state.prefs.tutorialDone = true;
  savePrefs();
  if (state.data) routePhase(state.data, null);
  else showScreen('join');
}

// ---------------------------------------------------------------------------
// English question rendering
// ---------------------------------------------------------------------------

function renderQuestion(data) {
  const q = data.question;
  if (!q) {
    $('q-prompt').textContent = 'Getting your question ready...';
    return;
  }
  $('q-topic').textContent = q.topic.replace(/^\w/, (c) => c.toUpperCase());
  $('q-counter').textContent = `Question ${q.slot} of ${q.total}`;
  $('q-prompt').textContent = q.prompt;

  const passage = $('q-passage');
  if (q.passage) {
    passage.textContent = q.passage;
    passage.hidden = false;
  } else {
    passage.hidden = true;
  }

  $('q-options').hidden = true;
  $('q-order').hidden = true;
  $('q-typed').hidden = true;
  $('q-feedback').hidden = true;
  state.chosenOption = null;
  state.orderTokens = [];

  if (q.type === 'mc' || q.type === 'reading') {
    const host = $('q-options');
    host.innerHTML = '';
    q.options.forEach((option) => {
      const button = el('button', 'option-btn', esc(option));
      button.type = 'button';
      button.addEventListener('click', () => {
        state.chosenOption = option;
        [...host.children].forEach((child) => child.classList.remove('chosen'));
        button.classList.add('chosen');
        sound.unlock();
      });
      host.appendChild(button);
    });
    host.hidden = false;
  } else if (q.type === 'order') {
    renderOrder(q);
    $('q-order').hidden = false;
  } else {
    $('typed-label').textContent = q.inputHint || 'Your answer';
    const input = $('input-answer');
    input.value = '';
    $('q-typed').hidden = false;
  }

  $('btn-answer').disabled = false;
  $('btn-answer').textContent = q.attemptsUsed > 0 ? 'Try again' : 'Check my answer';
  $('q-progress').textContent =
    `You have answered ${data.learning.attempted} question${data.learning.attempted === 1 ? '' : 's'} today.`;
}

function renderOrder(q) {
  const answerHost = $('order-answer');
  const poolHost = $('order-pool');
  const used = new Set(state.orderTokens.map((t) => t.key));

  answerHost.innerHTML = '';
  state.orderTokens.forEach((token, position) => {
    const button = el('button', 'token-btn', esc(token.text));
    button.type = 'button';
    button.addEventListener('click', () => {
      state.orderTokens.splice(position, 1);
      renderOrder(q);
    });
    answerHost.appendChild(button);
  });
  if (state.orderTokens.length === 0) {
    answerHost.appendChild(el('span', 'small muted', 'Tap words below to build your sentence.'));
  }

  poolHost.innerHTML = '';
  q.shuffled.forEach((text, index) => {
    const key = `${index}:${text}`;
    if (used.has(key)) return;
    const button = el('button', 'token-btn', esc(text));
    button.type = 'button';
    button.addEventListener('click', () => {
      state.orderTokens.push({ key, text });
      sound.unlock();
      renderOrder(q);
    });
    poolHost.appendChild(button);
  });
}

function collectAnswer(q) {
  if (q.type === 'mc' || q.type === 'reading') return state.chosenOption;
  if (q.type === 'order') return state.orderTokens.map((t) => t.text).join(' ');
  return $('input-answer').value;
}

async function submitAnswer() {
  const data = state.data;
  if (!data || !data.question) return;
  const q = data.question;
  const answer = collectAnswer(q);
  if (!answer || String(answer).trim() === '') {
    toast(q.type === 'mc' || q.type === 'reading' ? 'Please choose an answer.' : 'Please write your answer.', 'bad');
    return;
  }

  $('btn-answer').disabled = true;
  const result = await api('/api/pupil/answer', { questionId: q.id, answer });
  if (result.offline) {
    $('btn-answer').disabled = false;
    toast('No connection. Please wait a moment.', 'bad');
    return;
  }
  if (result.status === 401) {
    await tryRejoin();
    return;
  }
  if (!result.ok) {
    $('btn-answer').disabled = false;
    toast(result.error || 'Could not send your answer.', 'bad');
    if (result.state) applyState(result.state);
    return;
  }

  const feedback = result.feedback;
  const box = $('q-feedback');
  box.hidden = false;
  if (feedback.correct) {
    box.className = 'notice notice-good';
    box.innerHTML =
      `<strong>&#10003; Correct!</strong> ${esc(feedback.explanation || '')}` +
      (feedback.firstAttempt ? '' : '<br><span class="small">Well done for trying again.</span>');
    sound.play('good');
  } else if (feedback.retriesLeft > 0) {
    box.className = 'notice notice-bad';
    box.innerHTML = '<strong>&#10007; Not quite.</strong> Have one more try.';
    sound.play('no');
  } else {
    box.className = 'notice notice-bad';
    box.innerHTML =
      `<strong>&#10007; Not this time.</strong> ${esc(feedback.explanation || '')}` +
      (feedback.exampleAnswer ? `<br>Example answer: <strong>${esc(feedback.exampleAnswer)}</strong>` : '');
    sound.play('no');
  }
  announce(box.textContent);

  if (feedback.moveOn) {
    // Let the pupil read the feedback before the next screen appears.
    setTimeout(() => { if (result.state) applyState(result.state); }, 1600);
  } else {
    $('btn-answer').disabled = false;
    $('btn-answer').textContent = 'Try again';
    if (state.data) state.data.question.attemptsUsed = feedback.attemptNumber;
  }
}

function renderFeedback(data) {
  const host = $('feedback-list');
  host.innerHTML = '';
  for (const item of data.cycleResults) {
    const card = el('div', `feedback-item ${item.correct ? 'ok' : 'no'}`);
    card.innerHTML =
      `<p class="verdict">${item.correct ? '&#10003; Correct' : '&#10007; Not correct'}` +
      `${item.correct && !item.firstAttemptCorrect ? ' (after one more try)' : ''}</p>` +
      `<p class="small">${esc(item.prompt)}</p>` +
      `<p class="small">You wrote: <strong>${esc(item.yourAnswer)}</strong></p>` +
      (item.exampleAnswer ? `<p class="small">Good answer: <strong>${esc(item.exampleAnswer)}</strong></p>` : '') +
      `<p class="small muted">${esc(item.explanation)}</p>`;
    host.appendChild(card);
  }
  $('btn-start-round').hidden = false;
  $('btn-start-round').textContent = data.englishOnly ? 'Next questions' : 'Start merge round';
}

// ---------------------------------------------------------------------------
// Play screen
// ---------------------------------------------------------------------------

function renderPlay(data, previous) {
  const game = data.game;
  if (!game) return;

  $('val-charges').textContent = game.charges;
  $('val-charge-cap').textContent = game.chargeCap;
  $('val-coins').textContent = game.coins;
  $('chapter-chip').textContent = `Chapter ${game.chapter.id}`;

  const percent = game.improvements[game.chapter.key] || 0;
  $('improve-label').textContent = game.chapter.name;
  $('improve-value').textContent = `${percent}%`;
  $('improve-fill').style.width = `${percent}%`;

  applyChapterTheme(game);
  renderScorePanel(data);
  renderBoard(game, previous);
  renderTray(game);
  renderSources(game);
  renderMissions(game);
  startTimer(data);

  const blocked = data.board && data.board.blocked;
  $('btn-rescue').hidden = !blocked;
  if (blocked && (!previous || !previous.board || !previous.board.blocked)) {
    toast('No moves left. Tap Helping hand for free supplies.', 'bad');
  }
}

function cellButton(zone, index, item, locked) {
  const button = el('button', 'cell');
  button.type = 'button';
  button.dataset.zone = zone;
  button.dataset.index = String(index);
  button.classList.add(locked ? 'locked' : item ? 'filled' : 'empty');

  if (locked) {
    button.setAttribute('aria-label', `Locked space ${index + 1}. Finish a town request to open it.`);
    button.disabled = true;
    return button;
  }
  if (item) {
    button.innerHTML =
      `<span class="tile">${art(itemArt(item.family, item.level))}` +
      `<span class="tile-level">${item.level}</span>` +
      `<span class="tile-name">${esc(item.name)}</span></span>`;
    button.setAttribute('aria-label', `${item.name}, level ${item.level}`);
  } else {
    button.setAttribute('aria-label', `Empty space ${index + 1}`);
  }

  const selected = state.selected && state.selected.zone === zone && state.selected.index === index;
  if (selected) button.classList.add('selected');
  if (state.hintRefs.some((ref) => ref.zone === zone && Number(ref.index) === index)) {
    button.classList.add('hinted');
  }
  // Simplified mode highlights every item that has a matching partner.
  if (state.data && state.data.game && state.data.game.simplified && item) {
    const partners = allHeldItems(state.data.game).filter(
      (other) => other.item.family === item.family && other.item.level === item.level
    );
    if (partners.length >= 2 && item.level < 5) button.classList.add('hinted');
  }
  return button;
}

function allHeldItems(game) {
  const out = [];
  game.board.forEach((item, index) => { if (item) out.push({ item, ref: { zone: 'board', index } }); });
  game.tray.forEach((item, index) => { if (item) out.push({ item, ref: { zone: 'tray', index } }); });
  return out;
}

function renderBoard(game, previous) {
  const host = $('board');
  host.innerHTML = '';
  for (let index = 0; index < game.board.length; index++) {
    host.appendChild(cellButton('board', index, game.board[index], game.locked.includes(index)));
  }
  void previous;
}

function renderTray(game) {
  const host = $('tray');
  host.innerHTML = '';
  game.tray.forEach((item, index) => {
    host.appendChild(cellButton('tray', index, item, false));
  });
}

function renderSources(game) {
  const host = $('sources');
  host.innerHTML = '';
  for (const source of game.sources) {
    const button = el('button', 'source-btn');
    button.type = 'button';
    button.innerHTML =
      `${art(sourceArt(source.family))}<span class="source-name">${esc(source.label)}</span>` +
      `<span class="source-makes">Makes: ${esc(source.makes)}</span>`;
    button.setAttribute('aria-label', `${source.label}. Makes a ${source.makes}. Uses one supply tap.`);
    if (state.suggestedFamily === source.family) button.classList.add('suggested');
    button.disabled = game.charges <= 0;
    button.addEventListener('click', () => {
      sound.unlock();
      sendAction({ type: 'generate', family: source.family });
    });
    host.appendChild(button);
  }
}

function renderMissions(game) {
  const host = $('missions');
  host.innerHTML = '';
  const held = allHeldItems(game);

  for (const mission of game.missions) {
    const match = held.find((h) => h.item.family === mission.family && h.item.level === mission.level);
    const card = el('div', `mission ${match ? 'ready' : ''}`);
    const kindLabel = mission.bonus ? 'Bonus' : mission.kind === 'quick' ? 'Quick' : 'Longer';
    card.innerHTML =
      `${art(itemArt(mission.family, mission.level))}` +
      `<span class="mission-info">` +
      `<span class="mission-kind ${mission.bonus ? 'bonus' : mission.kind}">${kindLabel}</span> ` +
      `<span class="mission-name">${esc(mission.name)}</span>` +
      `<span class="mission-meta">Level ${mission.level} &middot; for ${esc(mission.requester)} &middot; ` +
      `${mission.coins} coins</span></span>`;

    const button = el('button', match ? 'btn-go' : 'btn-ghost', match ? 'Deliver' : 'Need it');
    button.type = 'button';
    button.disabled = !match;
    if (match) {
      button.addEventListener('click', () => {
        sound.unlock();
        sendAction({ type: 'deliver', missionId: mission.id, from: match.ref });
      });
    } else {
      button.setAttribute('aria-label', `You do not have a ${mission.name} yet.`);
    }
    card.appendChild(button);
    host.appendChild(card);
  }
}

// ---------------------------------------------------------------------------
// Round timer
// ---------------------------------------------------------------------------

function startTimer(data) {
  stopTimer();
  const length = data.round.lengthMs || 60000;
  const endsAt = Date.now() + (data.round.remainingMs || 0);

  const paint = () => {
    const remaining = Math.max(0, endsAt - Date.now());
    const seconds = Math.ceil(remaining / 1000);
    $('timer-value').textContent = `${seconds}s`;
    const fill = $('timer-fill');
    fill.style.width = `${Math.max(0, Math.min(100, (remaining / length) * 100))}%`;
    fill.parentElement.classList.toggle('bar-low', remaining < 10000);
    if (remaining <= 0) {
      stopTimer();
      // The server decides when the round really ends; ask it now.
      api('/api/pupil/heartbeat', {}).then(() => refreshState());
    }
  };
  paint();
  state.timerHandle = setInterval(paint, 250);
}

function stopTimer() {
  if (state.timerHandle) {
    clearInterval(state.timerHandle);
    state.timerHandle = null;
  }
}

async function refreshState() {
  const result = await api('/api/pupil/state');
  if (result.ok && result.state) applyState(result.state);
  else if (result.status === 401) await tryRejoin();
}

// ---------------------------------------------------------------------------
// Board interaction: tap-then-tap and drag-and-drop
// ---------------------------------------------------------------------------

function refFromElement(node) {
  const cell = node && node.closest ? node.closest('.cell') : null;
  if (!cell || cell.classList.contains('locked')) return null;
  return { zone: cell.dataset.zone, index: Number(cell.dataset.index), element: cell };
}

function itemAt(ref) {
  const game = state.data && state.data.game;
  if (!game || !ref) return null;
  return ref.zone === 'board' ? game.board[ref.index] : game.tray[ref.index];
}

function setSelection(ref) {
  state.selected = ref ? { zone: ref.zone, index: ref.index } : null;
  document.querySelectorAll('.cell.selected').forEach((node) => {
    node.classList.remove('selected');
  });
  if (ref && ref.element) ref.element.classList.add('selected');
}

/** Decide what a pair of taps or a drop should do, then send it. */
function actOnPair(fromRef, toRef) {
  const fromItem = itemAt(fromRef);
  const toItem = itemAt(toRef);
  if (!fromItem) return;

  if (!toItem) {
    sendAction({ type: 'move', from: plainRef(fromRef), to: plainRef(toRef) });
    return;
  }
  if (fromRef.zone === toRef.zone && fromRef.index === toRef.index) {
    setSelection(null);
    return;
  }
  sendAction({ type: 'merge', from: plainRef(fromRef), to: plainRef(toRef) });
}

function plainRef(ref) {
  return { zone: ref.zone, index: ref.index };
}

let drag = null;

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const ref = refFromElement(event.target);
  if (!ref) return;
  sound.unlock();

  drag = {
    ref,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
    ghost: null,
    pointerId: event.pointerId,
  };
  // Capture keeps the gesture bound to this element even if the finger slides
  // off, which is what stops the page scrolling mid-drag on iOS.
  if (ref.element.setPointerCapture && event.pointerId !== undefined) {
    try { ref.element.setPointerCapture(event.pointerId); } catch { /* ignore */ }
  }
}

function onPointerMove(event) {
  if (!drag) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) < 10) return;

  if (!drag.moved) {
    if (!itemAt(drag.ref)) { drag = null; return; }
    drag.moved = true;
    drag.ref.element.classList.add('drag-source');
    const ghost = el('div', 'tile');
    const item = itemAt(drag.ref);
    ghost.innerHTML = `${art(itemArt(item.family, item.level))}<span class="tile-level">${item.level}</span>`;
    Object.assign(ghost.style, {
      position: 'fixed', width: '58px', height: '58px', zIndex: '80',
      pointerEvents: 'none', opacity: '0.92',
      filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.35))',
    });
    document.body.appendChild(ghost);
    drag.ghost = ghost;
  }

  drag.ghost.style.left = `${event.clientX - 29}px`;
  drag.ghost.style.top = `${event.clientY - 29}px`;

  document.querySelectorAll('.cell.drop-target').forEach((n) => n.classList.remove('drop-target'));
  const over = refFromElement(document.elementFromPoint(event.clientX, event.clientY));
  if (over && !(over.zone === drag.ref.zone && over.index === drag.ref.index)) {
    over.element.classList.add('drop-target');
  }
  event.preventDefault();
}

function onPointerUp(event) {
  if (!drag) return;
  const current = drag;
  drag = null;

  if (current.ghost) current.ghost.remove();
  current.ref.element.classList.remove('drag-source');
  document.querySelectorAll('.cell.drop-target').forEach((n) => n.classList.remove('drop-target'));

  if (!current.moved) {
    handleTap(current.ref);
    return;
  }
  const over = refFromElement(document.elementFromPoint(event.clientX, event.clientY));
  if (!over) return;
  if (over.zone === current.ref.zone && over.index === current.ref.index) return;
  actOnPair(current.ref, over);
}

function handleTap(ref) {
  // Info mode turns the next tap into "show me this item", and stays on so a
  // pupil can look at several items in a row.
  if (state.infoMode) {
    const viewed = itemAt(ref);
    if (!viewed) {
      toast('Tap an item to see its picture and name.', 'bad');
      return;
    }
    showItemPreview(viewed);
    return;
  }

  // Recycle mode turns the next tap into a recycle request.
  if (state.recycleMode) {
    const item = itemAt(ref);
    state.recycleMode = false;
    $('btn-recycle').classList.remove('btn-warn');
    if (!item) {
      toast('Tap an item to recycle it.', 'bad');
      return;
    }
    askRecycle(ref, item);
    return;
  }

  const item = itemAt(ref);
  if (!state.selected) {
    if (!item) return;
    setSelection(ref);
    announce(`${item.name} selected. Now tap a matching item.`);
    return;
  }
  const fromRef = { ...state.selected, element: findCell(state.selected) };
  if (fromRef.zone === ref.zone && fromRef.index === ref.index) {
    setSelection(null);
    return;
  }
  if (!itemAt(fromRef)) {
    setSelection(item ? ref : null);
    return;
  }
  actOnPair(fromRef, ref);
}

function findCell(ref) {
  return document.querySelector(`.cell[data-zone="${ref.zone}"][data-index="${ref.index}"]`);
}

// ---------------------------------------------------------------------------
// Sending actions and playing the resulting animations
// ---------------------------------------------------------------------------

async function sendAction(action) {
  const payload = { ...action, nonce: nextNonce() };
  const failedRef = action.to || action.from;

  const result = await api('/api/pupil/action', { action: payload });
  if (result.offline) {
    toast('No connection. Trying again...', 'bad');
    return;
  }
  if (result.status === 401) {
    await tryRejoin();
    return;
  }

  if (!result.ok) {
    // Gentle refusal: shake the target and say why in plain words.
    const cell = failedRef ? findCell(failedRef) : null;
    if (cell) {
      cell.classList.add('anim-no');
      setTimeout(() => cell.classList.remove('anim-no'), 340);
    }
    sound.play('no');
    toast(result.message || result.error || 'That did not work.', 'bad');
    if (result.state) {
      state.hintRefs = [];
      applyState(result.state);
    }
    return;
  }

  setSelection(null);
  state.hintRefs = [];
  state.suggestedFamily = null;

  const events = result.events || [];
  if (result.state) applyState(result.state);
  playEvents(events);

  if (result.message) toast(result.message, 'good');
  if (result.clue) showClueResult(result.clue);
  if (result.finale) showFinaleResult(result.finale);
}

function playEvents(events) {
  for (const event of events) {
    if (event.type === 'spawn') {
      flash({ zone: 'board', index: event.index }, 'anim-spawn');
      sound.play('spawn');
    } else if (event.type === 'merge') {
      flash(event.to, 'anim-merge');
      mergeRing(event.to);
      sparkleAt(event.to);
      sound.play('merge');
      announce(event.newName ? `${event.newName} made.` : 'Items joined.');
    } else if (event.type === 'deliver') {
      sound.play('deliver');
      rewardSweep($('missions'));
    } else if (event.type === 'coins') {
      rewardSweep($('score-panel'));
    } else if (event.type === 'improvement') {
      rewardSweep($('improve-fill').parentElement);
    } else if (event.type === 'unlock') {
      toast('A new board space opened!', 'good');
      flash({ zone: 'board', index: event.index }, 'anim-spawn');
    } else if (event.type === 'chapter-complete') {
      celebrate();
      sound.play('celebrate');
    } else if (event.type === 'recycle') {
      coinPop(event.from, `+${event.refund}`);
      sound.play('good');
    } else if (event.type === 'rescue-clear' || event.type === 'rescue-charges') {
      sound.play('good');
    }
  }
}

function flash(ref, className) {
  const cell = findCell(ref);
  if (!cell) return;
  cell.classList.add(className);
  setTimeout(() => cell.classList.remove(className), 480);
}

function sparkleAt(ref) {
  if (state.prefs.reducedMotion) return;
  const cell = findCell(ref);
  if (!cell) return;
  const colours = [PALETTE.yellow, PALETTE.turquoise, PALETTE.coral, PALETTE.purple, PALETTE.green];
  for (let i = 0; i < 8; i++) {
    const dot = el('div', 'sparkle');
    const angle = (i / 8) * Math.PI * 2;
    dot.style.setProperty('--dx', `${Math.cos(angle) * 40}px`);
    dot.style.setProperty('--dy', `${Math.sin(angle) * 40}px`);
    dot.style.background = colours[i % colours.length];
    dot.style.left = '50%';
    dot.style.top = '50%';
    cell.appendChild(dot);
    setTimeout(() => dot.remove(), 700);
  }
}

function celebrate() {
  if (state.prefs.reducedMotion) return;
  const host = $('confetti');
  const colours = [PALETTE.yellow, PALETTE.turquoise, PALETTE.coral, PALETTE.purple, PALETTE.green];
  for (let i = 0; i < 40; i++) {
    const piece = el('div', 'confetti');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colours[i % colours.length];
    piece.style.animationDuration = `${1.4 + Math.random() * 1.2}s`;
    piece.style.animationDelay = `${Math.random() * 0.5}s`;
    host.appendChild(piece);
    setTimeout(() => piece.remove(), 3200);
  }
}

// ---------------------------------------------------------------------------
// Chapter look
// ---------------------------------------------------------------------------

/**
 * Tint the page, the top bar and the board frame for the current chapter.
 * Board cells are deliberately left pale and plain: a decorative background
 * behind the tiles would make matching harder.
 */
function applyChapterTheme(game) {
  if (!game || !game.chapter) return;
  const key = game.chapter.key;
  if (state.themeKey === key) return;
  state.themeKey = key;

  const theme = chapterTheme(key);
  const root = document.body.style;
  root.setProperty('--chapter-main', theme.main);
  root.setProperty('--chapter-soft', theme.soft);
  root.setProperty('--chapter-softer', theme.softer);
  root.setProperty('--chapter-accent', theme.accent);

  $('board-chapter-name').textContent = `${game.chapter.id}. ${game.chapter.name}`;
  $('board-chapter-art').innerHTML = shopArt(key, true);
}

// ---------------------------------------------------------------------------
// Compact score panel
// ---------------------------------------------------------------------------

function rankText(rank, tied) {
  if (!rank) return '\u2013';
  return `${tied ? '=' : ''}#${rank}`;
}

/**
 * Two short chips above the board: English Stars and Festival Champions.
 *
 * Questions attempted is printed next to the English points on purpose. Pupils
 * work at different speeds, so 30 points from 3 questions and 30 points from
 * 12 are very different, and the panel should not hide that.
 */
function renderScorePanel(data) {
  const host = $('score-panel');
  const board = data.scoreboard;
  if (!board || !board.me) {
    host.innerHTML = '';
    return;
  }
  const me = board.me;
  const english = me.english;
  const game = me.game;
  const parts = [];

  if (english) {
    parts.push(
      `<div class="score-chip">${art(starArt())}<div class="score-body">` +
      `<div class="score-top"><span>${english.points}</span>` +
      `<span class="score-rank">${esc(rankText(english.rank, english.tied))}</span></div>` +
      `<div class="score-label">English Stars &middot; ${english.attempted} asked</div>` +
      `</div></div>`
    );
  }
  if (game) {
    parts.push(
      `<div class="score-chip">${art(trophyArt())}<div class="score-body">` +
      `<div class="score-top"><span>${game.missions}</span>` +
      `<span class="score-rank">${esc(rankText(game.rank, game.tied))}</span></div>` +
      `<div class="score-label">Orders &middot; ${game.coins} coins</div>` +
      `</div></div>`
    );
  }
  host.innerHTML = parts.join('');
  host.setAttribute(
    'aria-label',
    english
      ? `Your English Stars: ${english.points} points from ${english.attempted} questions, rank ${english.rank}.` +
        (game ? ` Festival orders delivered: ${game.missions}, rank ${game.rank}.` : '')
      : 'Your scores'
  );
}

/** One scoreboard table. `rows` may be null when the teacher has it switched off. */
function scoreTableHtml(kind, rows, pointsPerFirstAttempt) {
  if (!rows) {
    return (
      '<p class="score-empty">Your teacher has not switched on the class scoreboard. ' +
      'Your own score and rank are always shown above.</p>'
    );
  }
  if (rows.length === 0) return '<p class="score-empty">No scores yet.</p>';

  const header = kind === 'english'
    ? '<tr><th>Rank</th><th>Detective</th><th class="num">Points</th><th class="num">Asked</th></tr>'
    : '<tr><th>Rank</th><th>Detective</th><th class="num">Orders</th><th class="num">Coins</th></tr>';

  const body = rows
    .map((row) => {
      const rankClass = row.rank <= 3 ? `rank rank-${row.rank}` : 'rank';
      const cells = kind === 'english'
        ? `<td class="num">${row.points}</td><td class="num">${row.attempted}</td>`
        : `<td class="num">${row.missions}</td><td class="num">${row.coins}</td>`;
      return (
        `<tr class="${row.isMe ? 'is-me' : ''}">` +
        `<td><span class="${rankClass}${row.tied ? ' rank-tied' : ''}">${row.rank}</span></td>` +
        `<td class="score-name">${esc(row.displayName)}</td>${cells}</tr>`
      );
    })
    .join('');

  const note = kind === 'english'
    ? `<p class="score-sub">${pointsPerFirstAttempt} points for each answer right on the first try.</p>`
    : '';
  return `<table class="score-table">${header}${body}</table>${note}`;
}

/** Full scoreboard sheet, reachable from the top bar. */
function showScoreboard() {
  const board = state.data && state.data.scoreboard;
  if (!board) {
    showOverlay({ title: 'Scoreboard', bodyHtml: '<p>Scores appear once the lesson starts.</p>' });
    return;
  }

  const sheet = showOverlay({
    title: 'Scoreboard',
    bodyHtml:
      `<div class="score-tabs" role="tablist">` +
      `<button type="button" class="tab-english" role="tab" data-score-tab="english">` +
      `${art(starArt())}<span>${esc(board.labels.english)}</span></button>` +
      `<button type="button" class="tab-game" role="tab" data-score-tab="game">` +
      `${art(trophyArt())}<span>${esc(board.labels.game)}</span></button>` +
      `</div><div id="score-body"></div>`,
  });

  const paint = () => {
    const kind = state.scoreTab;
    for (const button of sheet.querySelectorAll('[data-score-tab]')) {
      button.setAttribute('aria-selected', String(button.dataset.scoreTab === kind));
    }
    sheet.querySelector('#score-body').innerHTML =
      `<p class="score-how${kind === 'game' ? ' for-game' : ''}">${esc(board.explanations[kind])}</p>` +
      scoreTableHtml(kind, board[kind], board.pointsPerFirstAttempt);
  };
  for (const button of sheet.querySelectorAll('[data-score-tab]')) {
    button.addEventListener('click', () => {
      state.scoreTab = button.dataset.scoreTab;
      sound.unlock();
      paint();
    });
  }
  paint();
}

// ---------------------------------------------------------------------------
// Item information preview
// ---------------------------------------------------------------------------

const FAMILY_LABELS = {
  paper: 'Paper Decorations', flower: 'Flowers', ribbon: 'Gifts', lantern: 'Lights',
};

/** A large picture of one item, its name, and what it becomes. */
function showItemPreview(item) {
  const names = (GUIDE_FAMILIES.find((f) => f.key === item.family) || GUIDE_FAMILIES[0]).names;
  const nextName = item.level < 5 ? names[item.level] : null;

  const chain = names
    .map(
      (name, index) =>
        `<div class="step ${index + 1 === item.level ? 'here' : ''}">` +
        `${art(itemArt(item.family, index + 1))}` +
        `<div class="cap">${esc(name)}</div><div class="cap">L${index + 1}</div></div>`
    )
    .join('');

  showOverlay({
    title: 'Item information',
    bodyHtml:
      `${art(itemArt(item.family, item.level), 'preview-art')}` +
      `<p class="preview-name">${esc(item.name)}</p>` +
      `<span class="preview-level">Level ${item.level} of 5 &middot; ${esc(FAMILY_LABELS[item.family] || '')}</span>` +
      (nextName
        ? `<div class="preview-next">${art(itemArt(item.family, item.level))}<span class="plus">+</span>` +
          `${art(itemArt(item.family, item.level))}<span class="plus">=</span>` +
          `${art(itemArt(item.family, item.level + 1))}</div>` +
          `<p class="center"><strong>Join two of these to make a ${esc(nextName)}.</strong></p>`
        : '<p class="notice notice-good">This is the biggest one. Deliver it to a town request!</p>') +
      `<p class="small muted">The whole family:</p><div class="preview-chain">${chain}</div>`,
  });
}

function setInfoMode(on) {
  state.infoMode = on;
  const button = $('btn-info');
  button.setAttribute('aria-pressed', String(on));
  button.classList.toggle('btn-go', on);
  button.classList.toggle('btn-primary', !on);
  $('board').classList.toggle('info-mode', on);
  if (on) {
    state.recycleMode = false;
    $('btn-recycle').classList.remove('btn-warn');
    toast('Tap any item to see a big picture and its name.');
  }
}

// ---------------------------------------------------------------------------
// Reward effects
// ---------------------------------------------------------------------------

/** A coin value that floats up from a cell. */
function coinPop(ref, text) {
  if (state.prefs.reducedMotion) return;
  const cell = findCell(ref);
  if (!cell) return;
  const pop = el('div', 'coin-pop', esc(text));
  pop.style.left = '50%';
  pop.style.top = '30%';
  cell.appendChild(pop);
  setTimeout(() => pop.remove(), 1000);
}

/** An expanding ring, used when two items join. */
function mergeRing(ref) {
  if (state.prefs.reducedMotion) return;
  const cell = findCell(ref);
  if (!cell) return;
  const ring = el('div', 'merge-ring');
  cell.appendChild(ring);
  setTimeout(() => ring.remove(), 600);
}

/** A light sweep across a panel, used when a reward lands. */
function rewardSweep(node) {
  if (!node || state.prefs.reducedMotion) return;
  node.classList.remove('reward-sweep');
  // Force a reflow so the animation restarts if it is already running.
  void node.offsetWidth;
  node.classList.add('reward-sweep');
  setTimeout(() => node.classList.remove('reward-sweep'), 1000);
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

function showOverlay({ title, bodyHtml, actions = [], dismissible = true, onBuild }) {
  closeOverlay();
  const backdrop = el('div', 'sheet-backdrop');
  const sheet = el('div', 'sheet stack');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title);
  sheet.innerHTML = `<h2>${esc(title)}</h2><div class="overlay-body stack">${bodyHtml || ''}</div>`;

  const row = el('div', 'row');
  for (const action of actions) {
    const button = el('button', `${action.kind || 'btn-ghost'} grow`, esc(action.label));
    button.type = 'button';
    button.addEventListener('click', () => {
      sound.unlock();
      if (action.onClick) action.onClick();
      if (action.keepOpen !== true) closeOverlay();
    });
    row.appendChild(button);
  }
  if (dismissible) {
    const close = el('button', 'btn-ghost grow', 'Close');
    close.type = 'button';
    close.addEventListener('click', closeOverlay);
    row.appendChild(close);
  }
  if (row.children.length > 0) sheet.appendChild(row);

  backdrop.appendChild(sheet);
  $('overlay-host').appendChild(backdrop);
  if (onBuild) onBuild(sheet.querySelector('.overlay-body'));
  sheet.querySelector('button')?.focus();
  return sheet;
}

function closeOverlay() {
  $('overlay-host').innerHTML = '';
}

// -- story overlays --------------------------------------------------------

function maybeShowStoryOverlays(data) {
  const game = data.game;
  if (!game) return;

  if (game.decorationChoice) {
    showDecorationChoice(game.decorationChoice, game);
    return;
  }
  const unseen = game.clues.find((clue) => !state.seenClues.has(clue.id));
  if (unseen) {
    state.seenClues.add(unseen.id);
    showClueCard(unseen);
    return;
  }
  if (game.storyComplete && !game.finaleSolved && !state.finaleShown) {
    state.finaleShown = true;
    showFinale(game);
  }
}

function showClueCard(clue) {
  const sentences = clue.sentences.map((s) => `<p class="clue-sentences">${esc(s)}</p>`).join('');
  const sheet = showOverlay({
    title: clue.title,
    bodyHtml:
      `<div class="clue-card clue-reveal"><span style="flex:0 0 60px">${art(clueCardArt())}</span>` +
      `<div><p class="small muted">From ${esc(clue.from)}</p>${sentences}</div></div>` +
      `<div class="notice notice-info"><strong>${esc(clue.check.prompt)}</strong></div>` +
      `<div class="options" id="clue-options"></div>` +
      `<p class="notice" id="clue-result" hidden></p>`,
    dismissible: true,
  });
  const host = sheet.querySelector('#clue-options');
  clue.check.options.forEach((option, index) => {
    const button = el('button', 'option-btn', esc(option));
    button.type = 'button';
    button.addEventListener('click', () => {
      sound.unlock();
      sendAction({ type: 'clue-answer', clueId: clue.id, optionIndex: index });
    });
    host.appendChild(button);
  });
}

function showClueResult(clue) {
  const box = document.getElementById('clue-result');
  if (!box) {
    toast(clue.correct ? 'Clue understood!' : 'Read the clue again and try once more.', clue.correct ? 'good' : 'bad');
    return;
  }
  box.hidden = false;
  box.className = `notice ${clue.correct ? 'notice-good' : 'notice-bad'}`;
  box.innerHTML = clue.correct
    ? `<strong>&#10003; Yes!</strong> ${esc(clue.explanation)}`
    : '<strong>&#10007; Not quite.</strong> Read the clue again, then try another answer.';
  sound.play(clue.correct ? 'good' : 'no');
  announce(box.textContent);
  if (clue.correct) setTimeout(closeOverlay, 2200);
}

function showDecorationChoice(choice, game) {
  const chapterName = (game.chapter && game.chapter.name) || 'this place';
  const sheet = showOverlay({
    title: 'Choose a decoration',
    bodyHtml:
      `<p>You fixed <strong>${esc(chapterName)}</strong>! Pick one decoration to add.</p>` +
      `<div class="options" id="dec-options"></div>`,
    dismissible: false,
  });
  const host = sheet.querySelector('#dec-options');
  for (const option of choice.options) {
    const button = el('button', 'option-btn', '');
    button.type = 'button';
    button.innerHTML =
      `<div class="scene-frame">${art(sceneArt(choice.chapterKey, { progress: 100, decoration: option.id }), "art-box-scene")}</div>` +
      `<strong>${esc(option.name)}</strong><br><span class="small muted">${esc(option.note)}</span>`;
    button.addEventListener('click', () => {
      sound.unlock();
      sendAction({ type: 'choose-decoration', chapterKey: choice.chapterKey, optionId: option.id });
      closeOverlay();
    });
    host.appendChild(button);
  }
}

function showFinale(game) {
  const clueList = game.clues
    .map((c) => `<li>${c.sentences.map(esc).join(' ')}</li>`)
    .join('');
  const sheet = showOverlay({
    title: 'Solve the mystery!',
    bodyHtml:
      `<div style="max-width:120px;margin:0 auto">${art(clueCardArt())}</div>` +
      `<p><strong>${esc(game.finale.prompt)}</strong></p>` +
      `<p class="small muted">Your clues:</p><ul class="small">${clueList}</ul>` +
      `<div class="options" id="finale-options"></div>` +
      `<p class="notice" id="finale-result" hidden></p>`,
    dismissible: true,
  });
  const host = sheet.querySelector('#finale-options');
  for (const option of game.finale.options) {
    const button = el('button', 'option-btn', esc(option.label));
    button.type = 'button';
    button.addEventListener('click', () => {
      sound.unlock();
      sendAction({ type: 'finale', optionId: option.id });
    });
    host.appendChild(button);
  }
}

function showFinaleResult(finale) {
  const box = document.getElementById('finale-result');
  if (finale.correct) {
    celebrate();
    sound.play('celebrate');
    showOverlay({
      title: 'You found the festival chest!',
      bodyHtml:
        `<div style="max-width:150px;margin:0 auto">${art(chestArt())}</div>` +
        `<p style="font-size:1.05rem;font-weight:700">${esc(finale.ending)}</p>` +
        `<p class="notice notice-good">New festival orders are open. Keep playing until your teacher ends the lesson!</p>`,
      actions: [{ label: 'Keep playing', kind: 'btn-go' }],
      dismissible: false,
    });
    return;
  }
  if (box) {
    box.hidden = false;
    box.className = 'notice notice-bad';
    box.innerHTML = `<strong>&#10007; Not there.</strong> ${esc(finale.explanation)}<br>Read your clues and try again.`;
    announce(box.textContent);
  }
  sound.play('no');
}

// -- notebook, map, guide, settings ---------------------------------------

function showNotebook() {
  const game = state.data && state.data.game;
  const learning = state.data ? state.data.learning : null;
  if (!game) {
    showOverlay({ title: 'Detective notebook', bodyHtml: '<p>Your notebook opens when the game starts.</p>' });
    return;
  }
  const clues = game.clues.length
    ? game.clues
        .map(
          (clue) =>
            `<div class="clue-card ${clue.solved ? 'solved' : ''}">` +
            `<span style="flex:0 0 48px">${art(clueCardArt())}</span><div>` +
            `<p class="small muted">${esc(clue.title)} &middot; from ${esc(clue.from)} &middot; ` +
            `${clue.solved ? 'checked \u2713' : 'not checked yet'}</p>` +
            clue.sentences.map((s) => `<p class="clue-sentences">${esc(s)}</p>`).join('') +
            `</div></div>`
        )
        .join('')
    : '<p class="muted">No clue cards yet. Fix a place in town to get your first clue.</p>';

  showOverlay({
    title: 'Detective notebook',
    bodyHtml:
      `<h3>Clue cards (${game.clues.length} of 5)</h3>${clues}` +
      `<h3 style="margin-top:0.8rem">My English today</h3>` +
      `<p>Questions answered: <strong>${learning ? learning.attempted : 0}</strong><br>` +
      `Right the first time: <strong>${learning ? learning.firstAttemptCorrect : 0}</strong><br>` +
      `Right after trying again: <strong>${learning ? learning.correctAfterRetry : 0}</strong></p>` +
      (state.data && state.data.scoreboard && state.data.scoreboard.me.english
        ? `<p><strong>English Stars: ${state.data.scoreboard.me.english.points} points</strong></p>` +
          `<p class="score-how">${esc(state.data.scoreboard.explanations.english)}</p>`
        : '') +
      `<p class="small muted">English and the merge game are counted separately.</p>`,
  });
}

function showMap() {
  const game = state.data && state.data.game;
  if (!game) {
    showOverlay({ title: 'Town map', bodyHtml: '<p>The map opens when the game starts.</p>' });
    return;
  }
  const names = {
    welcome: 'Welcome Square', cafe: 'Rainbow Caf\u00e9', garden: 'Hobby Garden',
    market: 'Riverside Market', stage: 'Festival Stage',
  };
  const keys = ['welcome', 'cafe', 'garden', 'market', 'stage'];
  const pins = keys
    .map((key, index) => {
      const percent = game.improvements[key] || 0;
      const current = game.chapter.key === key;
      const status = percent >= 100 ? 'done' : current ? 'current' : 'locked';
      const label = percent >= 100 ? 'Fixed' : current ? 'Now' : 'Later';
      return (
        `<div class="map-stop">${art(mapPinArt(status))}` +
        `<div class="map-name">${index + 1}. ${esc(names[key])}</div>` +
        `<div class="map-state">${label} &middot; ${percent}%</div></div>`
      );
    })
    .join('');

  const key = game.chapter.key;
  const percentNow = game.improvements[key] || 0;
  const restored = percentNow >= 100;
  showOverlay({
    title: 'Town map',
    bodyHtml:
      `<div class="map-grid">${pins}</div>` +
      `<h3 style="margin-top:0.8rem">${esc(game.chapter.name)}</h3>` +
      `<div class="before-after">` +
      `<figure><div class="scene-frame">${art(sceneArt(key, { progress: 0 }), "art-box-scene")}</div><figcaption>Before</figcaption></figure>` +
      `<figure><div class="scene-frame">${art(sceneArt(key, { progress: percentNow, decoration: game.decorations[key] }), "art-box-scene")}</div>` +
      `<figcaption>${restored ? 'After \u2713' : 'Your goal'}</figcaption></figure>` +
      `</div><p class="small muted">${esc(game.chapter.intro)}</p>`,
  });
}

const GUIDE_FAMILIES = [
  { key: 'paper', label: 'Paper Decorations', names: ['Paper Shape', 'Paper Chain', 'Bunting', 'Festival Banner', 'Entrance Decoration'] },
  { key: 'flower', label: 'Flowers', names: ['Flower', 'Small Bunch', 'Bouquet', 'Flower Basket', 'Festival Flower Display'] },
  { key: 'ribbon', label: 'Gifts', names: ['Ribbon', 'Bow', 'Gift Bag', 'Gift Box', 'Festival Gift Chest'] },
  { key: 'lantern', label: 'Lights', names: ['Candle', 'Small Lantern', 'Paper Lantern', 'Lantern String', 'Festival Light Arch'] },
];

function showGuide() {
  const unlocked = new Set((state.data?.game?.sources || []).map((s) => s.family));
  const body = GUIDE_FAMILIES.map((family) => {
    const chain = family.names
      .map(
        (name, index) =>
          `<div class="guide-step">${art(itemArt(family.key, index + 1))}` +
          `<div class="guide-name">${esc(name)}</div><div class="small muted">L${index + 1}</div></div>`
      )
      .join('<span class="guide-arrow">&rarr;</span>');
    const open = unlocked.has(family.key);
    return (
      `<div class="guide-family"><h3>${esc(family.label)} ` +
      `<span class="chip ${open ? 'chip-good' : 'chip-warn'}">${open ? 'Open now' : 'Later chapter'}</span></h3>` +
      `<div class="guide-chain">${chain}</div></div>`
    );
  }).join('');

  showOverlay({
    title: 'Item guide',
    bodyHtml:
      '<p class="small muted">Join two items of the same kind and the same level. ' +
      'These are game upgrades, not real recipes.</p>' + body,
  });
}

function showSettings() {
  const sheet = showOverlay({
    title: 'Settings',
    bodyHtml:
      `<div class="stack">` +
      `<button type="button" id="set-sound" class="btn-ghost btn-block"></button>` +
      `<button type="button" id="set-motion" class="btn-ghost btn-block"></button>` +
      `<button type="button" id="set-tutorial" class="btn-ghost btn-block">Show how to play again</button>` +
      `<p class="small muted">Room code: <strong>${esc(state.data?.room.code || '')}</strong><br>` +
      `Your name: <strong>${esc(state.data?.pupil.displayName || '')}</strong></p>` +
      `</div>`,
  });

  const soundButton = sheet.querySelector('#set-sound');
  const motionButton = sheet.querySelector('#set-motion');
  const paint = () => {
    soundButton.textContent = state.prefs.sound ? 'Sound: ON (tap to mute)' : 'Sound: OFF (tap to turn on)';
    motionButton.textContent = state.prefs.reducedMotion
      ? 'Less movement: ON (tap for full effects)'
      : 'Less movement: OFF (tap to reduce)';
  };
  paint();
  soundButton.addEventListener('click', () => {
    state.prefs.sound = !state.prefs.sound;
    savePrefs();
    if (state.prefs.sound) { sound.unlock(); sound.play('good'); }
    paint();
  });
  motionButton.addEventListener('click', () => {
    state.prefs.reducedMotion = !state.prefs.reducedMotion;
    document.body.classList.toggle('reduced-motion', state.prefs.reducedMotion);
    savePrefs();
    paint();
  });
  sheet.querySelector('#set-tutorial').addEventListener('click', () => {
    state.prefs.tutorialDone = false;
    state.tutorialStep = 0;
    savePrefs();
    closeOverlay();
    showScreen('tutorial');
    renderTutorial();
  });
}

// -- recycle ---------------------------------------------------------------

function askRecycle(ref, item) {
  showOverlay({
    title: 'Recycle this item?',
    bodyHtml:
      `<div style="max-width:100px;margin:0 auto">${art(itemArt(item.family, item.level))}</div>` +
      `<p class="center"><strong>${esc(item.name)}</strong> (level ${item.level})</p>` +
      `<p>It will be removed from the board. You get <strong>${item.level * 2} coins</strong>.</p>`,
    actions: [
      {
        label: 'Yes, recycle it',
        kind: 'btn-stop',
        onClick: () => sendAction({ type: 'recycle', from: plainRef(ref), confirmed: true }),
      },
    ],
  });
}

async function doHint() {
  const result = await api('/api/pupil/hint', {});
  if (!result.ok) {
    toast(result.error || 'No hint right now.', 'bad');
    return;
  }
  state.hintRefs = result.hint.highlight || [];
  state.suggestedFamily = result.hint.family || null;
  const box = $('play-hint');
  box.hidden = false;
  const steps = result.guided ? `<br><span class="small">Guided job: ${result.guided.steps.map(esc).join(' ')}</span>` : '';
  box.innerHTML = `<strong>Hint:</strong> ${esc(result.hint.message)}${steps}`;
  announce(result.hint.message);
  if (result.state) applyState(result.state);
}

// ---------------------------------------------------------------------------
// Ended screen
// ---------------------------------------------------------------------------

/** Separate English and game winners on the finish screen. */
function winnersHtml(board) {
  if (!board || !board.winners) return '';
  const list = (rows, score) =>
    rows.length === 0
      ? '<p class="winner-score">Nobody yet</p>'
      : rows
          .map((row) => `<p class="winner-name">${esc(row.displayName)}</p><p class="winner-score">${esc(score(row))}</p>`)
          .join('');
  return (
    '<div class="winner-grid">' +
    `<div class="winner-card english">${art(starArt())}<h3>${esc(board.labels.english)}</h3>` +
    list(board.winners.english, (r) => `${r.points} points from ${r.attempted} questions`) +
    '</div>' +
    `<div class="winner-card game">${art(trophyArt())}<h3>${esc(board.labels.game)}</h3>` +
    list(board.winners.game, (r) => `${r.missions} orders, ${r.coins} coins`) +
    '</div></div>' +
    '<p class="small muted center">Two different prizes: one for English, one for the festival. ' +
    'Equal scores share a place.</p>'
  );
}

function renderEnded(data) {
  $('ended-art').innerHTML = art(
    data.game && data.game.finaleSolved ? chestArt() : characterArt('Mayor Ploy', 'cheer')
  );
  const learning = data.learning;
  const game = data.game;
  $('ended-summary').innerHTML =
    winnersHtml(data.scoreboard) +
    `<div class="card stack"><h3>English today</h3>` +
    `<p>Questions answered: <strong>${learning.attempted}</strong><br>` +
    `Right the first time: <strong>${learning.firstAttemptCorrect}</strong><br>` +
    `Right after trying again: <strong>${learning.correctAfterRetry}</strong></p></div>` +
    (game
      ? `<div class="card stack"><h3>Your town</h3>` +
        `<p>Chapter reached: <strong>${game.chapter.id} of ${game.chapter.total}</strong><br>` +
        `Requests finished: <strong>${game.requestsCompleted}</strong><br>` +
        `Clue cards: <strong>${game.clues.length} of 5</strong><br>` +
        `Mystery solved: <strong>${game.finaleSolved ? 'Yes! \u2713' : 'Not yet'}</strong></p></div>`
      : '');
}

// ---------------------------------------------------------------------------
// Joining
// ---------------------------------------------------------------------------

function roomCodeFromUrl() {
  const match = location.pathname.match(/^\/j\/([A-Za-z0-9]{1,12})$/);
  if (match) return match[1].toUpperCase();
  const param = new URLSearchParams(location.search).get('room');
  return param ? param.toUpperCase() : '';
}

async function handleJoin(event) {
  event.preventDefault();
  sound.unlock();
  const code = $('input-room').value.trim().toUpperCase();
  const nickname = $('input-nick').value.trim();
  const errorBox = $('join-error');
  errorBox.hidden = true;

  if (!code) { errorBox.textContent = 'Please type the room code.'; errorBox.hidden = false; return; }
  if (!nickname) { errorBox.textContent = 'Please type your nickname.'; errorBox.hidden = false; return; }

  $('btn-join').disabled = true;
  const result = await api('/api/pupil/join', { roomCode: code, nickname });
  $('btn-join').disabled = false;

  if (!result.ok) {
    errorBox.textContent = result.error || 'Could not join. Please check the code.';
    errorBox.hidden = false;
    return;
  }
  saveSession({ roomCode: code, rejoinToken: result.rejoinToken });
  applyState(result.state);
  connectEvents();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function boot() {
  loadPrefs();
  loadSession();

  $('join-art').innerHTML = art(characterArt('Detective', 'happy'));
  $('icon-coin').innerHTML = art(coinArt());
  $('icon-charge').innerHTML = art(chargeArt());

  const urlCode = roomCodeFromUrl();
  if (urlCode) $('input-room').value = urlCode;

  $('join-form').addEventListener('submit', handleJoin);
  $('btn-answer').addEventListener('click', submitAnswer);
  $('input-answer').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); submitAnswer(); }
  });
  $('btn-start-round').addEventListener('click', async () => {
    sound.unlock();
    $('btn-start-round').disabled = true;
    const result = await api('/api/pupil/start-round', {});
    $('btn-start-round').disabled = false;
    if (result.ok && result.state) applyState(result.state);
    else if (result.status === 401) await tryRejoin();
    else toast(result.error || 'Please wait for your teacher.', 'bad');
  });

  $('btn-hint').addEventListener('click', () => { sound.unlock(); doHint(); });
  $('btn-recycle').addEventListener('click', () => {
    state.recycleMode = !state.recycleMode;
    if (state.recycleMode && state.infoMode) setInfoMode(false);
    $('btn-recycle').classList.toggle('btn-warn', state.recycleMode);
    toast(state.recycleMode ? 'Now tap the item you want to recycle.' : 'Recycle cancelled.');
  });
  $('btn-info').addEventListener('click', () => {
    sound.unlock();
    setInfoMode(!state.infoMode);
  });
  $('btn-scores').addEventListener('click', showScoreboard);
  $('btn-rescue').addEventListener('click', () => sendAction({ type: 'rescue' }));
  $('btn-notebook').addEventListener('click', showNotebook);
  $('btn-map').addEventListener('click', showMap);
  $('btn-guide').addEventListener('click', showGuide);
  $('btn-settings').addEventListener('click', showSettings);

  $('btn-tut-next').addEventListener('click', () => {
    sound.unlock();
    if (state.tutorialStep >= TUTORIAL.length - 1) finishTutorial();
    else { state.tutorialStep++; renderTutorial(); }
  });
  $('btn-tut-back').addEventListener('click', () => {
    if (state.tutorialStep > 0) { state.tutorialStep--; renderTutorial(); }
  });
  $('btn-tut-skip').addEventListener('click', finishTutorial);

  // Board gestures. Listeners sit on the document so a finger that slides off
  // a cell still finishes the gesture correctly.
  const boardHosts = [$('board'), $('tray')];
  for (const host of boardHosts) {
    host.addEventListener('pointerdown', onPointerDown);
  }
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', () => {
    if (drag && drag.ghost) drag.ghost.remove();
    if (drag) drag.ref.element.classList.remove('drag-source');
    drag = null;
  });

  // Coming back to the tab after the phone slept: re-sync immediately.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.session) refreshState();
  });

  state.config = await api('/api/config');

  if (state.session) {
    const restored = await tryRejoin();
    if (restored) {
      startHeartbeat();
      return;
    }
  }
  showScreen('join');
  startHeartbeat();
}

boot();
