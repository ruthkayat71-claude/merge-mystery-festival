'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {
  startServer, teacherLogin, createRoom, joinPupil, answerCycle, TEST_PASSWORD,
} = require('./helpers');
const { decodeSvg } = require('../server/qrdecode');

// ---------------------------------------------------------------------------
// Teacher authentication
// ---------------------------------------------------------------------------

test('teacher login rejects a wrong password and accepts the right one', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  const bad = await server.request('/api/teacher/login', { body: { password: 'wrong' }, jar: {} });
  assert.strictEqual(bad.status, 401);
  assert.match(bad.body.error, /not correct/);
  assert.ok(!JSON.stringify(bad.body).includes(TEST_PASSWORD), 'the real password is never echoed');

  const { jar, result } = await teacherLogin(server);
  assert.strictEqual(result.status, 200);
  assert.ok(jar.mm_teacher, 'a session cookie was set');
});

test('the teacher session cookie is HttpOnly and never contains the password', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const jar = {};
  const result = await server.request('/api/teacher/login', { body: { password: TEST_PASSWORD }, jar });
  const cookies = result.headers.getSetCookie
    ? result.headers.getSetCookie()
    : [result.headers.get('set-cookie')];
  const teacherCookie = cookies.find((c) => c.startsWith('mm_teacher='));
  assert.ok(teacherCookie.includes('HttpOnly'), 'HttpOnly is set');
  assert.ok(teacherCookie.includes('SameSite=Lax'), 'SameSite is set');
  assert.ok(!teacherCookie.includes(TEST_PASSWORD));
});

test('every teacher endpoint refuses an unauthenticated caller', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);

  const guarded = [
    ['POST', '/api/teacher/rooms'],
    ['GET', '/api/teacher/rooms'],
    ['GET', '/api/teacher/questions'],
    ['PUT', '/api/teacher/questions/r-002'],
    ['POST', '/api/teacher/questions/r-002/test'],
    ['GET', `/api/teacher/rooms/${room.code}/dashboard`],
    ['GET', `/api/teacher/rooms/${room.code}/qr`],
    ['POST', `/api/teacher/rooms/${room.code}/start`],
    ['POST', `/api/teacher/rooms/${room.code}/pause`],
    ['POST', `/api/teacher/rooms/${room.code}/end`],
    ['POST', `/api/teacher/rooms/${room.code}/settings`],
    ['GET', `/api/teacher/rooms/${room.code}/export/english-summary.csv`],
    ['GET', `/api/teacher/rooms/${room.code}/export/game-results.csv`],
    ['GET', `/api/teacher/rooms/${room.code}/events`],
  ];
  for (const [method, path] of guarded) {
    const result = await server.request(path, { method, body: method === 'GET' ? undefined : {}, jar: {} });
    assert.strictEqual(result.status, 401, `${method} ${path} should need a teacher session`);
  }
});

test('a pupil session cannot reach teacher endpoints', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar: teacherJar } = await teacherLogin(server);
  const room = await createRoom(server, teacherJar);
  const pupil = await joinPupil(server, room.code, 'Mali');

  for (const path of [
    `/api/teacher/rooms/${room.code}/dashboard`,
    '/api/teacher/questions',
    `/api/teacher/rooms/${room.code}/export/english-answers.csv`,
  ]) {
    const result = await server.request(path, { jar: pupil.jar });
    assert.strictEqual(result.status, 401, `${path} must stay teacher-only`);
  }
});

test('repeated wrong passwords lock the client out', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  let lockedOut = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = await server.request('/api/teacher/login', { body: { password: 'nope' }, jar: {} });
    if (result.status === 429) { lockedOut = true; break; }
  }
  assert.ok(lockedOut, 'brute-force attempts are eventually refused');
});

test('a server with no password configured cannot be signed into', async (t) => {
  const server = await startServer({ teacherPassword: '', teacherPasswordHash: '' });
  t.after(() => server.close());
  const status = await server.request('/api/teacher/status');
  assert.strictEqual(status.body.configured, false);
  const result = await server.request('/api/teacher/login', { body: { password: '' }, jar: {} });
  assert.strictEqual(result.status, 401);
  assert.match(result.body.error, /TEACHER_PASSWORD/);
});

// ---------------------------------------------------------------------------
// Rooms, join links, QR
// ---------------------------------------------------------------------------

test('a new room has a short readable code, a join link and a verified QR code', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);

  assert.match(room.code, /^[A-Z0-9]{6}$/, 'six-character code');
  assert.ok(!/[OI01]/.test(room.code), 'no easily-confused characters');

  assert.strictEqual(room.qr.url, `https://merge-mystery-test.onrender.com/j/${room.code}`);
  assert.ok(room.qr.url.startsWith('https://'), 'join URL is HTTPS');
  assert.ok(!room.qr.usesLocalhost, 'join URL is not localhost');
  assert.strictEqual(room.qr.verified, true, 'server verified its own QR code');
  assert.strictEqual(room.qr.decodedText, room.qr.url);
  assert.strictEqual(room.qr.quietZoneModules, 4);

  // Decode the delivered SVG independently of the server's own check.
  const decoded = decodeSvg(room.qr.svg);
  assert.strictEqual(decoded.text, room.qr.url, 'the SVG sent to the browser decodes to the join URL');
  assert.ok(decoded.quietZoneModules >= 4, 'quiet zone present in the delivered markup');
});

test('the QR code contains the configured public address, never localhost', async (t) => {
  const server = await startServer({ publicBaseUrl: 'https://my-festival-game.onrender.com' });
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  assert.strictEqual(decodeSvg(room.qr.svg).text, `https://my-festival-game.onrender.com/j/${room.code}`);
});

test('a localhost base URL is reported as a problem rather than hidden', async (t) => {
  const server = await startServer({ publicBaseUrl: 'http://localhost:3000' });
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  assert.strictEqual(room.qr.usesLocalhost, true, 'the dashboard is warned');
  assert.strictEqual(decodeSvg(room.qr.svg).text, `http://localhost:3000/j/${room.code}`);
});

test('the QR endpoint also serves a real PNG', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  const response = await fetch(`${server.base}/api/teacher/rooms/${room.code}/qr?format=png`, {
    headers: { Cookie: `mm_teacher=${jar.mm_teacher}` },
  });
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get('content-type'), 'image/png');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepStrictEqual(Array.from(bytes.subarray(0, 4)), [0x89, 0x50, 0x4e, 0x47]);
});

test('the join link path serves the pupil app', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  const result = await server.request(`/j/${room.code}`, { raw: true });
  assert.strictEqual(result.status, 200);
  assert.ok(result.body.includes('Merge Mystery'), 'the pupil page is returned');
  assert.ok(result.body.includes('/js/pupil.js'));
});

// ---------------------------------------------------------------------------
// Pupil joining
// ---------------------------------------------------------------------------

test('a pupil joins with a nickname and no account', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);

  const pupil = await joinPupil(server, room.code, 'Mali');
  assert.strictEqual(pupil.status, 200);
  assert.ok(pupil.body.rejoinToken.length > 20, 'a private rejoin token is issued');
  assert.strictEqual(pupil.body.state.pupil.displayName, 'Mali');
  assert.ok(pupil.jar.mm_pupil, 'a session cookie was set');
});

test('room codes are accepted in lowercase', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  const pupil = await joinPupil(server, room.code.toLowerCase(), 'Nok');
  assert.strictEqual(pupil.status, 200);
});

test('a wrong room code is refused with a helpful message', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const result = await joinPupil(server, 'ZZZZZZ', 'Mali');
  assert.strictEqual(result.status, 404);
  assert.match(result.body.error, /not found/i);
});

test('duplicate nicknames are distinguished', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);

  const first = await joinPupil(server, room.code, 'Mali');
  const second = await joinPupil(server, room.code, 'Mali');
  const third = await joinPupil(server, room.code, 'mali');

  assert.strictEqual(first.body.state.pupil.displayName, 'Mali');
  assert.strictEqual(second.body.state.pupil.displayName, 'Mali (2)');
  assert.strictEqual(third.body.state.pupil.displayName, 'mali (3)');
  // The nickname they typed is kept for the teacher's reference.
  assert.strictEqual(second.body.state.pupil.nickname, 'Mali');
});

test('unsafe nicknames are refused', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);

  for (const bad of [
    '', '   ', '<script>alert(1)</script>', 'http://evil.example',
    'a'.repeat(40), 'name"with\'quotes', 'back\\slash',
  ]) {
    const result = await joinPupil(server, room.code, bad);
    assert.strictEqual(result.status, 400, `nickname ${JSON.stringify(bad)} should be refused`);
  }
  // Thai characters must be welcome.
  const thai = await joinPupil(server, room.code, '\u0e21\u0e32\u0e25\u0e35');
  assert.strictEqual(thai.status, 200);
});

test('a removed pupil cannot keep playing and must join again', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  const pupil = await joinPupil(server, room.code, 'RudeName');
  const pupilId = pupil.body.state.pupil.id;

  const removed = await server.request(`/api/teacher/rooms/${room.code}/pupils/${pupilId}/remove`, {
    body: {}, jar,
  });
  assert.strictEqual(removed.status, 200);

  const after = await server.request('/api/pupil/state', { jar: pupil.jar });
  assert.strictEqual(after.status, 401, 'their session stops working');

  const rejoin = await server.request('/api/pupil/rejoin', {
    body: { roomCode: room.code, rejoinToken: pupil.body.rejoinToken },
    jar: {},
  });
  assert.strictEqual(rejoin.status, 401, 'the old rejoin token is dead');

  const dashboard = await server.request(`/api/teacher/rooms/${room.code}/dashboard`, { jar });
  assert.strictEqual(dashboard.body.pupils.length, 0, 'removed from the pupil list');
});

// ---------------------------------------------------------------------------
// Answer keys must never reach pupils
// ---------------------------------------------------------------------------

test('a pupil state payload never contains an answer key', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Mali');

  const result = await server.request('/api/pupil/state', { jar: pupil.jar });
  const state = result.body.state;
  assert.strictEqual(state.phase, 'learning');
  assert.ok(state.question, 'a question was served');

  const question = state.question;
  assert.strictEqual(question.answer, undefined);
  assert.strictEqual(question.accepted, undefined);
  assert.strictEqual(question.acceptedPatterns, undefined);
  assert.strictEqual(question.explanation, undefined);
  assert.strictEqual(question.example, undefined);

  // For a typed question the answer must not appear anywhere in the payload.
  const full = server.app.store.get(question.id);
  if (full.type === 'blank' || full.type === 'writing') {
    const json = JSON.stringify(state).toLowerCase();
    const needle = full.answer.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.ok(
      !new RegExp(`(^|[^a-z'])${needle}($|[^a-z'])`).test(json),
      `the answer "${full.answer}" leaked into the pupil payload`
    );
  }
});

test('a pupil cannot read another pupil\u2019s answers', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });

  const mali = await joinPupil(server, room.code, 'Mali');
  const nok = await joinPupil(server, room.code, 'Nok');
  await answerCycle(server, mali.jar, server.app);

  const maliId = mali.body.state.pupil.id;
  const peek = await server.request(
    `/api/teacher/rooms/${room.code}/pupils/${maliId}/answers`,
    { jar: nok.jar }
  );
  assert.strictEqual(peek.status, 401, 'pupils cannot use the teacher answer view');

  const nokState = await server.request('/api/pupil/state', { jar: nok.jar });
  const json = JSON.stringify(nokState.body);
  assert.ok(!json.includes('Mali'), 'no other pupil appears in a pupil payload');
});

test('the class scoreboard is off by default, but a pupil always sees their own', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const mali = await joinPupil(server, room.code, 'Mali');
  const nok = await joinPupil(server, room.code, 'Nok');
  await answerCycle(server, mali.jar, server.app, { correct: true });

  let state = (await server.request('/api/pupil/state', { jar: nok.jar })).body.state;
  assert.strictEqual(state.room.publicScoreboard, false, 'off by default');
  assert.strictEqual(state.scoreboard.publicScoreboard, false);
  assert.strictEqual(state.scoreboard.english, null, 'the full list is withheld');
  assert.strictEqual(state.scoreboard.game, null);
  assert.ok(state.scoreboard.me, 'but their own standing is always there');
  assert.ok(!JSON.stringify(state.scoreboard).includes('Mali'), 'no other pupil is named');

  // Switching it on publishes names and scores, and nothing private.
  await server.request(`/api/teacher/rooms/${room.code}/settings`, {
    body: { publicScoreboard: true }, jar,
  });
  state = (await server.request('/api/pupil/state', { jar: nok.jar })).body.state;
  assert.ok(Array.isArray(state.scoreboard.english));
  assert.strictEqual(state.scoreboard.english.length, 2);
  for (const row of state.scoreboard.english) {
    assert.deepStrictEqual(
      Object.keys(row).sort(),
      ['attempted', 'displayName', 'isMe', 'points', 'rank', 'tied'],
      'only names and scores are published'
    );
  }
  for (const row of state.scoreboard.game) {
    assert.ok(!('points' in row), 'the game board carries no English points');
  }
});

test('English points on the scoreboard come only from first-attempt answers', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });

  const straight = await joinPupil(server, room.code, 'Straight');
  const retried = await joinPupil(server, room.code, 'Retried');

  await answerCycle(server, straight.jar, server.app, { correct: true });

  // Retried gets each question wrong once, then right.
  for (let slot = 0; slot < 2; slot++) {
    const state = (await server.request('/api/pupil/state', { jar: retried.jar })).body.state;
    if (!state.question) break;
    const full = server.app.store.get(state.question.id);
    const wrong = full.options ? full.options.find((o) => o !== full.answer) : 'definitely-wrong';
    await server.request('/api/pupil/answer', {
      body: { questionId: full.id, answer: wrong }, jar: retried.jar,
    });
    const answer = full.type === 'order' ? full.tokens.join(' ') : full.answer;
    await server.request('/api/pupil/answer', {
      body: { questionId: full.id, answer }, jar: retried.jar,
    });
  }

  const dashboard = await server.request(`/api/teacher/rooms/${room.code}/dashboard`, { jar });
  const board = dashboard.body.scoreboard;
  const straightRow = board.english.find((r) => r.displayName === 'Straight');
  const retriedRow = board.english.find((r) => r.displayName === 'Retried');

  assert.strictEqual(straightRow.points, 20, 'two first-attempt answers at 10 points each');
  assert.strictEqual(retriedRow.points, 0, 'correct after a retry earns no points');
  assert.strictEqual(retriedRow.correctAfterRetry, 2, 'but the learning is still recorded');
  assert.strictEqual(retriedRow.attempted, 2, 'and the attempt count is shown');
  assert.strictEqual(straightRow.rank, 1);
  assert.strictEqual(retriedRow.rank, 2);
});

test('the dashboard carries both boards with their explanations', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  await joinPupil(server, room.code, 'Mali');

  const dashboard = await server.request(`/api/teacher/rooms/${room.code}/dashboard`, { jar });
  const board = dashboard.body.scoreboard;
  assert.ok(board, 'the dashboard includes the scoreboard');
  assert.strictEqual(board.labels.english, 'English Stars');
  assert.strictEqual(board.labels.game, 'Festival Champions');
  assert.strictEqual(board.pointsPerFirstAttempt, 10);
  assert.ok(board.explanations.english.length > 40);
  assert.ok(board.explanations.game.length > 40);
  assert.ok(Array.isArray(board.winners.english));
  assert.ok(Array.isArray(board.winners.game));
});

// ---------------------------------------------------------------------------
// The learning / merge cycle
// ---------------------------------------------------------------------------

test('the default cycle is two questions, then feedback, then a merge round', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Mali');

  let state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.phase, 'learning');
  assert.strictEqual(state.question.total, 2, 'two questions per cycle');
  assert.strictEqual(state.round.playing, false, 'no round timer during questions');
  assert.strictEqual(state.round.remainingMs, null, 'the merge timer is not running');

  state = await answerCycle(server, pupil.jar, server.app);
  assert.strictEqual(state.phase, 'feedback');
  assert.strictEqual(state.cycleResults.length, 2, 'both answers are reviewed');
  for (const item of state.cycleResults) {
    assert.ok(item.explanation, 'each result carries an explanation');
  }

  const started = await server.request('/api/pupil/start-round', { body: {}, jar: pupil.jar });
  assert.strictEqual(started.status, 200);
  assert.strictEqual(started.body.state.phase, 'playing');
  assert.ok(started.body.state.round.remainingMs > 55000, 'a 60 second round by default');
  assert.strictEqual(started.body.state.round.playing, true);
});

test('a pupil who answered everything wrong still gets a merge round', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Nok');

  const state = await answerCycle(server, pupil.jar, server.app, { correct: false });
  assert.strictEqual(state.phase, 'feedback');
  assert.ok(state.cycleResults.every((r) => !r.correct), 'all answers were wrong');

  const started = await server.request('/api/pupil/start-round', { body: {}, jar: pupil.jar });
  assert.strictEqual(started.body.state.phase, 'playing');

  // And the resources granted are exactly the same as a correct pupil's.
  const strong = await joinPupil(server, room.code, 'Mali');
  await answerCycle(server, strong.jar, server.app, { correct: true });
  const strongStart = await server.request('/api/pupil/start-round', { body: {}, jar: strong.jar });
  assert.strictEqual(
    started.body.state.game.charges,
    strongStart.body.state.game.charges,
    'English score does not change the supply allowance'
  );
});

test('a wrong answer gives one retry, then an explanation and an example', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Mali');

  const state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  const full = server.app.store.get(state.question.id);
  const wrong = full.type === 'mc' || full.type === 'reading'
    ? full.options.find((o) => o !== full.answer)
    : 'not-the-answer';

  const first = await server.request('/api/pupil/answer', {
    body: { questionId: full.id, answer: wrong }, jar: pupil.jar,
  });
  assert.strictEqual(first.body.feedback.correct, false);
  assert.strictEqual(first.body.feedback.retriesLeft, 1);
  assert.strictEqual(first.body.feedback.moveOn, false);
  assert.strictEqual(first.body.feedback.exampleAnswer, null, 'no answer given away yet');

  const second = await server.request('/api/pupil/answer', {
    body: { questionId: full.id, answer: wrong }, jar: pupil.jar,
  });
  assert.strictEqual(second.body.feedback.retriesLeft, 0);
  assert.strictEqual(second.body.feedback.moveOn, true);
  assert.ok(second.body.feedback.explanation, 'explanation given');
  assert.ok(second.body.feedback.exampleAnswer, 'example answer given at the end');
});

test('first-attempt success and success after a retry are reported separately', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Mali');

  const state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  const full = server.app.store.get(state.question.id);
  const wrong = full.type === 'mc' || full.type === 'reading'
    ? full.options.find((o) => o !== full.answer)
    : 'not-the-answer';

  await server.request('/api/pupil/answer', { body: { questionId: full.id, answer: wrong }, jar: pupil.jar });
  const recovered = await server.request('/api/pupil/answer', {
    body: { questionId: full.id, answer: full.answer }, jar: pupil.jar,
  });
  assert.strictEqual(recovered.body.feedback.correct, true);
  assert.strictEqual(recovered.body.feedback.firstAttempt, false);

  const dashboard = await server.request(`/api/teacher/rooms/${room.code}/dashboard`, { jar });
  const row = dashboard.body.pupils[0];
  assert.strictEqual(row.english.firstAttemptCorrect, 0);
  assert.strictEqual(row.english.correctAfterRetry, 1);
  assert.strictEqual(row.english.retries, 1);
});

test('answers cannot be submitted out of turn or resubmitted for extra credit', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Mali');

  const state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  const firstId = state.question.id;

  // A question that is not the current one is refused.
  const other = server.app.store.all().find((q) => q.id !== firstId && q.id !== state.question.id);
  const outOfTurn = await server.request('/api/pupil/answer', {
    body: { questionId: other.id, answer: other.answer }, jar: pupil.jar,
  });
  assert.strictEqual(outOfTurn.status, 409);

  // Answer correctly, then try the same question again.
  const full = server.app.store.get(firstId);
  await server.request('/api/pupil/answer', { body: { questionId: firstId, answer: full.answer }, jar: pupil.jar });
  const replay = await server.request('/api/pupil/answer', {
    body: { questionId: firstId, answer: full.answer }, jar: pupil.jar,
  });
  assert.strictEqual(replay.status, 409, 'the question has moved on');

  const dashboard = await server.request(`/api/teacher/rooms/${room.code}/dashboard`, { jar });
  assert.strictEqual(dashboard.body.pupils[0].english.attempted, 1, 'counted once');
});

test('questions do not repeat immediately', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Mali');

  const seen = [];
  for (let cycle = 0; cycle < 6; cycle++) {
    for (let slot = 0; slot < 2; slot++) {
      const state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
      if (state.phase !== 'learning') break;
      seen.push(state.question.id);
      const full = server.app.store.get(state.question.id);
      await server.request('/api/pupil/answer', {
        body: { questionId: full.id, answer: full.answer }, jar: pupil.jar,
      });
    }
    await server.request('/api/pupil/start-round', { body: {}, jar: pupil.jar });
    // End the round early so the next cycle begins.
    const inner = server.app.manager.get(room.code).pupils.get(pupil.body.state.pupil.id);
    inner.roundEndsAt = Date.now() - 1;
    inner.checkRoundExpiry();
  }
  assert.strictEqual(new Set(seen).size, seen.length, `questions repeated: ${seen.join(', ')}`);
  assert.ok(seen.length >= 10, 'enough questions were served to be meaningful');
});

test('the difficulty ladder starts easy', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Mali');
  const state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.question.difficulty, 1, 'the first question is the easiest band');
});

// ---------------------------------------------------------------------------
// Merge actions over HTTP
// ---------------------------------------------------------------------------

async function reachPlaying(server, roomCode, nickname) {
  const pupil = await joinPupil(server, roomCode, nickname);
  await answerCycle(server, pupil.jar, server.app);
  const started = await server.request('/api/pupil/start-round', { body: {}, jar: pupil.jar });
  return { ...pupil, state: started.body.state };
}

test('merge actions are validated by the server and replays are ignored', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await reachPlaying(server, room.code, 'Mali');

  // Make two identical items through the real endpoint.
  const first = await server.request('/api/pupil/action', {
    body: { action: { type: 'generate', family: 'paper', nonce: 'g1' } }, jar: pupil.jar,
  });
  assert.strictEqual(first.status, 200);
  await server.request('/api/pupil/action', {
    body: { action: { type: 'generate', family: 'paper', nonce: 'g2' } }, jar: pupil.jar,
  });

  let state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  const filled = state.game.board
    .map((item, index) => ({ item, index }))
    .filter((entry) => entry.item);
  assert.strictEqual(filled.length, 2);

  const mergeBody = {
    action: {
      type: 'merge', nonce: 'merge-once',
      from: { zone: 'board', index: filled[0].index },
      to: { zone: 'board', index: filled[1].index },
    },
  };
  const merged = await server.request('/api/pupil/action', { body: mergeBody, jar: pupil.jar });
  assert.strictEqual(merged.status, 200);
  assert.strictEqual(merged.body.state.game.board[filled[1].index].level, 2);

  // Replay: the board must not change and no second merge happens.
  const replay = await server.request('/api/pupil/action', { body: mergeBody, jar: pupil.jar });
  assert.strictEqual(replay.status, 200);
  assert.strictEqual(replay.body.duplicate, true);
  assert.strictEqual(replay.body.state.game.board[filled[1].index].level, 2);

  // A spent supply tap is not refunded by replaying the generate either.
  const chargesNow = replay.body.state.game.charges;
  await server.request('/api/pupil/action', {
    body: { action: { type: 'generate', family: 'paper', nonce: 'g1' } }, jar: pupil.jar,
  });
  state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.game.charges, chargesNow, 'replayed generate changed nothing');
});

test('an invalid merge is refused over HTTP with a gentle message', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await reachPlaying(server, room.code, 'Mali');
  const inner = server.app.manager.get(room.code).pupils.get(pupil.body.state.pupil.id);

  inner.game.board[0] = { uid: 'a', family: 'paper', level: 1 };
  inner.game.board[1] = { uid: 'b', family: 'flower', level: 1 };

  const result = await server.request('/api/pupil/action', {
    body: {
      action: {
        type: 'merge', nonce: 'bad-merge',
        from: { zone: 'board', index: 0 }, to: { zone: 'board', index: 1 },
      },
    },
    jar: pupil.jar,
  });
  assert.strictEqual(result.status, 409);
  assert.strictEqual(result.body.reason, 'different-family');
  assert.match(result.body.message, /same picture/);
  assert.ok(result.body.state.game.board[0], 'nothing was lost');
});

test('merge actions are refused while the round is not running', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Mali');

  // Still on the learning phase: no merging allowed.
  const result = await server.request('/api/pupil/action', {
    body: { action: { type: 'generate', family: 'paper', nonce: 'x1' } }, jar: pupil.jar,
  });
  assert.strictEqual(result.status, 409);
  assert.strictEqual(result.body.reason, 'not-playing');
});

test('a hint always returns a usable next step and a guided request', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await reachPlaying(server, room.code, 'Mali');

  const result = await server.request('/api/pupil/hint', { body: {}, jar: pupil.jar });
  assert.strictEqual(result.status, 200);
  assert.ok(result.body.hint.message.length > 5);
  assert.ok(result.body.guided.steps.length >= 3);
});

// ---------------------------------------------------------------------------
// Teacher controls and timers
// ---------------------------------------------------------------------------

test('pause freezes the round and resume gives back the remaining time', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await reachPlaying(server, room.code, 'Mali');

  await new Promise((resolve) => setTimeout(resolve, 1100));
  const paused = await server.request(`/api/teacher/rooms/${room.code}/pause`, { body: {}, jar });
  assert.strictEqual(paused.status, 200);

  let state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.phase, 'paused');
  const frozen = state.round.remainingMs;
  assert.ok(frozen > 0 && frozen < 60000, `remaining time was captured (${frozen}ms)`);
  assert.strictEqual(state.round.playing, false);

  // Gameplay is refused while paused.
  const blocked = await server.request('/api/pupil/action', {
    body: { action: { type: 'generate', family: 'paper', nonce: 'p1' } }, jar: pupil.jar,
  });
  assert.strictEqual(blocked.status, 409);

  // The clock really is stopped.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.round.remainingMs, frozen, 'no time was lost while paused');

  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.phase, 'playing');
  assert.ok(Math.abs(state.round.remainingMs - frozen) < 500, 'resumed with the time that was left');
});

test('a pupil on the question screen is paused safely too', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Mali');

  await server.request(`/api/teacher/rooms/${room.code}/pause`, { body: {}, jar });
  let state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.phase, 'paused');

  const blocked = await server.request('/api/pupil/answer', {
    body: { questionId: 'g-001', answer: 'Good morning!' }, jar: pupil.jar,
  });
  assert.strictEqual(blocked.status, 409, 'answering is held while paused');

  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.phase, 'learning', 'back to the same question screen');
});

test('ending the lesson stops everyone and cannot be undone', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await reachPlaying(server, room.code, 'Mali');

  await server.request(`/api/teacher/rooms/${room.code}/end`, { body: {}, jar });
  const state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.phase, 'ended');

  const restart = await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  assert.strictEqual(restart.status, 409);

  const late = await joinPupil(server, room.code, 'Late');
  assert.strictEqual(late.status, 400, 'nobody can join a finished lesson');
});

test('the round length can be set to 30, 45, 60 or 90 seconds and nothing else', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);

  for (const seconds of [30, 45, 60, 90]) {
    const result = await server.request(`/api/teacher/rooms/${room.code}/settings`, {
      body: { roundSeconds: seconds }, jar,
    });
    assert.strictEqual(result.status, 200, `${seconds}s should be allowed`);
    assert.strictEqual(result.body.settings.roundSeconds, seconds);
  }
  for (const bad of [15, 61, 600, 0, -30, 'sixty']) {
    const result = await server.request(`/api/teacher/rooms/${room.code}/settings`, {
      body: { roundSeconds: bad }, jar,
    });
    assert.strictEqual(result.status, 400, `${bad} should be refused`);
  }
});

test('a 30 second round really lasts 30 seconds of server time', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/settings`, { body: { roundSeconds: 30 }, jar });
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await reachPlaying(server, room.code, 'Mali');
  assert.ok(pupil.state.round.remainingMs > 28000 && pupil.state.round.remainingMs <= 30000);
  assert.strictEqual(pupil.state.round.lengthMs, 30000);
});

test('a finished round sends the pupil back to new questions', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await reachPlaying(server, room.code, 'Mali');

  const inner = server.app.manager.get(room.code).pupils.get(pupil.body.state.pupil.id);
  inner.roundEndsAt = Date.now() - 1;

  const state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.phase, 'learning');
  assert.ok(state.question, 'a fresh question is waiting');
});

test('the teacher can switch a pupil to simple merge or English only', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Mali');
  const pupilId = pupil.body.state.pupil.id;

  await server.request(`/api/teacher/rooms/${room.code}/pupils/${pupilId}/mode`, {
    body: { simplified: true }, jar,
  });
  let state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.game.simplified, true);

  await server.request(`/api/teacher/rooms/${room.code}/pupils/${pupilId}/mode`, {
    body: { englishOnly: true }, jar,
  });
  state = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;
  assert.strictEqual(state.englishOnly, true);
  assert.strictEqual(state.game, null, 'no board is sent in English-only mode');

  // English-only pupils go straight from feedback to the next questions.
  await answerCycle(server, pupil.jar, server.app);
  const next = await server.request('/api/pupil/start-round', { body: {}, jar: pupil.jar });
  assert.strictEqual(next.body.state.phase, 'learning');
});

// ---------------------------------------------------------------------------
// Rejoining and disconnection
// ---------------------------------------------------------------------------

test('a refresh restores the same pupil and the same board', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await reachPlaying(server, room.code, 'Mali');

  await server.request('/api/pupil/action', {
    body: { action: { type: 'generate', family: 'paper', nonce: 'keep-me' } }, jar: pupil.jar,
  });
  const before = (await server.request('/api/pupil/state', { jar: pupil.jar })).body.state;

  // A refresh on a phone that lost its cookie: rejoin with the private token.
  const freshJar = {};
  const rejoined = await server.request('/api/pupil/rejoin', {
    body: { roomCode: room.code, rejoinToken: pupil.body.rejoinToken },
    jar: freshJar,
  });
  assert.strictEqual(rejoined.status, 200);
  const after = rejoined.body.state;

  assert.strictEqual(after.pupil.id, before.pupil.id, 'the same pupil, not a duplicate');
  assert.strictEqual(after.pupil.displayName, 'Mali');
  assert.deepStrictEqual(
    after.game.board.map((c) => (c ? `${c.family}${c.level}` : null)),
    before.game.board.map((c) => (c ? `${c.family}${c.level}` : null)),
    'the board came back unchanged'
  );
  assert.strictEqual(after.game.charges, before.game.charges);
  assert.strictEqual(after.learning.attempted, before.learning.attempted);

  const dashboard = await server.request(`/api/teacher/rooms/${room.code}/dashboard`, { jar });
  assert.strictEqual(dashboard.body.pupils.length, 1, 'no duplicate pupil appeared');
});

test('a rejoin token from another pupil cannot be used to steal a session', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  const mali = await joinPupil(server, room.code, 'Mali');
  const nok = await joinPupil(server, room.code, 'Nok');

  // Using Mali's token returns Mali - it is her private key, and Nok never
  // sees it in any payload he receives.
  const nokState = await server.request('/api/pupil/state', { jar: nok.jar });
  assert.ok(!JSON.stringify(nokState.body).includes(mali.body.rejoinToken));

  const forged = await server.request('/api/pupil/rejoin', {
    body: { roomCode: room.code, rejoinToken: 'made-up-token-value-123456' },
    jar: {},
  });
  assert.strictEqual(forged.status, 401);
});

test('a disconnected pupil is shown as offline then recovers', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await joinPupil(server, room.code, 'Mali');
  const inner = server.app.manager.get(room.code).pupils.get(pupil.body.state.pupil.id);

  // Simulate a Wi-Fi drop: nothing seen for longer than the grace period.
  inner.lastSeen = Date.now() - 60 * 1000;
  server.app.manager.get(room.code).tick();
  let dashboard = await server.request(`/api/teacher/rooms/${room.code}/dashboard`, { jar });
  assert.strictEqual(dashboard.body.pupils[0].connected, false);

  // The phone comes back; a heartbeat is enough.
  const beat = await server.request('/api/pupil/heartbeat', { body: {}, jar: pupil.jar });
  assert.strictEqual(beat.status, 200);
  dashboard = await server.request(`/api/teacher/rooms/${room.code}/dashboard`, { jar });
  assert.strictEqual(dashboard.body.pupils[0].connected, true);
  assert.strictEqual(dashboard.body.pupils.length, 1, 'still only one pupil');
});

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

test('CSV exports are separate for English and game results', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  const pupil = await reachPlaying(server, room.code, 'Mali');
  void pupil;

  const english = await server.request(`/api/teacher/rooms/${room.code}/export/english-summary.csv`, { jar, raw: true });
  assert.strictEqual(english.status, 200);
  assert.match(english.headers.get('content-type'), /text\/csv/);
  assert.match(english.headers.get('content-disposition'), /attachment; filename=".*\.csv"/);
  assert.ok(english.body.includes('questions_attempted'));
  assert.ok(!english.body.includes('coins'), 'game data is not in the English file');

  const game = await server.request(`/api/teacher/rooms/${room.code}/export/game-results.csv`, { jar, raw: true });
  assert.ok(game.body.includes('coins'));
  assert.ok(!game.body.includes('first_attempt_accuracy'), 'English marks are not in the game file');

  const answers = await server.request(`/api/teacher/rooms/${room.code}/export/english-answers.csv`, { jar, raw: true });
  assert.ok(answers.body.includes('submitted_answer'));
  assert.ok(answers.body.split('\r\n').length > 2, 'answers were recorded');
});

test('a nickname that looks like a spreadsheet formula is neutralised in CSV', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);

  // The nickname validator blocks most of this, so set it directly to prove
  // the CSV layer is itself safe.
  const pupil = await joinPupil(server, room.code, 'Mali');
  const inner = server.app.manager.get(room.code).pupils.get(pupil.body.state.pupil.id);
  inner.nickname = '=HYPERLINK("http://evil.example","clickme")';
  inner.displayName = '+1234';

  const csvText = (await server.request(
    `/api/teacher/rooms/${room.code}/export/english-summary.csv`, { jar, raw: true }
  )).body;
  assert.ok(csvText.includes("\"'=HYPERLINK"), 'formula is quoted and prefixed');
  assert.ok(csvText.includes("'+1234"), 'plus-prefixed value is neutralised');
  assert.ok(!/(^|,)=HYPERLINK/m.test(csvText), 'no cell begins with a bare =');
});

// ---------------------------------------------------------------------------
// Question editing
// ---------------------------------------------------------------------------

test('the teacher can add an accepted alternative and it marks correct', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);

  const before = await server.request('/api/teacher/questions/r-002/test', {
    body: { answer: 'my teeth please' }, jar,
  });
  assert.strictEqual(before.body.correct, false);

  const saved = await server.request('/api/teacher/questions/r-002', {
    method: 'PUT',
    body: { patch: { accepted: ['my teeth', 'my teeth please'] } },
    jar,
  });
  assert.strictEqual(saved.status, 200);

  const after = await server.request('/api/teacher/questions/r-002/test', {
    body: { answer: 'My Teeth, Please!' }, jar,
  });
  assert.strictEqual(after.body.correct, true, 'capitals and punctuation still ignored');
});

test('an edit that breaks a question is refused with a readable reason', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);

  // An answer that is not one of the choices.
  const badAnswer = await server.request('/api/teacher/questions/g-001', {
    method: 'PUT', body: { patch: { answer: 'Something else entirely' } }, jar,
  });
  assert.strictEqual(badAnswer.status, 400);
  assert.ok(badAnswer.body.problems.join(' ').includes('not one of the options'));

  // An empty prompt.
  const noPrompt = await server.request('/api/teacher/questions/g-001', {
    method: 'PUT', body: { patch: { prompt: '   ' } }, jar,
  });
  assert.strictEqual(noPrompt.status, 400);

  // A pattern that is not anchored.
  const badPattern = await server.request('/api/teacher/questions/w-002', {
    method: 'PUT', body: { patch: { acceptedPatterns: ['my name is .*'] } }, jar,
  });
  assert.strictEqual(badPattern.status, 400);
  assert.ok(badPattern.body.problems.join(' ').includes('anchored'));

  // A change that would make a wrong choice correct.
  const wouldAcceptWrong = await server.request('/api/teacher/questions/g-001', {
    method: 'PUT', body: { patch: { accepted: ['Good night!'] } }, jar,
  });
  assert.strictEqual(wouldAcceptWrong.status, 400);
  assert.ok(wouldAcceptWrong.body.problems.join(' ').includes('would now be marked correct'));

  // The question is still intact after all of those refusals.
  const check = await server.request('/api/teacher/questions/g-001/test', {
    body: { answer: 'Good morning!' }, jar,
  });
  assert.strictEqual(check.body.correct, true);
});

test('protected fields cannot be edited', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const result = await server.request('/api/teacher/questions/g-001', {
    method: 'PUT', body: { patch: { id: 'hacked', type: 'writing' } }, jar,
  });
  assert.strictEqual(result.status, 400);
  assert.ok(result.body.problems.join(' ').includes('cannot be edited'));
});

// ---------------------------------------------------------------------------
// Security basics
// ---------------------------------------------------------------------------

test('security headers and a tight content policy are sent', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const result = await server.request('/', { raw: true });
  assert.strictEqual(result.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(result.headers.get('x-frame-options'), 'DENY');
  const csp = result.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"), 'no inline scripts allowed');
});

test('path traversal cannot escape the public directory', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  for (const path of [
    '/../server/index.js',
    '/..%2fserver%2findex.js',
    '/css/../../server/auth.js',
    '/%2e%2e/%2e%2e/package.json',
  ]) {
    const result = await server.request(path, { raw: true });
    assert.ok(result.status === 403 || result.status === 404, `${path} returned ${result.status}`);
    assert.ok(!String(result.body).includes('TeacherAuth'), `${path} leaked server source`);
  }
});

test('oversized and malformed request bodies are rejected safely', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);

  const huge = await server.request('/api/pupil/join', {
    body: JSON.stringify({ roomCode: room.code, nickname: 'x'.repeat(200000) }),
  });
  assert.ok(huge.status >= 400, 'a huge body is refused');

  const broken = await server.request('/api/pupil/join', { body: '{not json' });
  assert.strictEqual(broken.status, 400);

  const notObject = await server.request('/api/pupil/join', { body: '"a string"' });
  assert.strictEqual(notObject.status, 400);
});

test('the health endpoint reports without a session', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const result = await server.request('/healthz');
  assert.strictEqual(result.status, 200);
  assert.strictEqual(result.body.ok, true);
  assert.ok(result.body.questions >= 80);
});

// ---------------------------------------------------------------------------
// Server-Sent Events
// ---------------------------------------------------------------------------

test('a pupil receives a live state push over the event stream', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);
  const pupil = await joinPupil(server, room.code, 'Mali');

  const controller = new AbortController();
  t.after(() => controller.abort());
  const response = await fetch(`${server.base}/api/pupil/events`, {
    headers: { Cookie: `mm_pupil=${pupil.jar.mm_pupil}` },
    signal: controller.signal,
  });
  assert.strictEqual(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const readUntil = async (needle, limit = 12) => {
    for (let i = 0; i < limit; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes(needle)) return true;
    }
    return false;
  };

  assert.ok(await readUntil('event: state'), 'the first state frame arrived');

  // Starting the lesson must push a new state to this pupil.
  await server.request(`/api/teacher/rooms/${room.code}/start`, { body: {}, jar });
  assert.ok(await readUntil('"phase":"learning"'), 'the phase change was pushed');
  controller.abort();
});

test('the event stream refuses a caller with no pupil session', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const result = await server.request('/api/pupil/events');
  assert.strictEqual(result.status, 401);
});

// ---------------------------------------------------------------------------
// Classroom scale from a single shared IP address
// ---------------------------------------------------------------------------

test('45 pupils can join at once from one shared school IP address', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);

  // Every request in this test comes from the same loopback address, which is
  // exactly what a school NAT looks like to the server.
  const results = await Promise.all(
    Array.from({ length: 45 }, (_, i) => joinPupil(server, room.code, `Pupil${i + 1}`))
  );

  const refused = results.filter((r) => r.status !== 200);
  assert.strictEqual(
    refused.length,
    0,
    `${refused.length} pupils were refused (statuses: ${[...new Set(refused.map((r) => r.status))].join(', ')})`
  );

  const dashboard = await server.request(`/api/teacher/rooms/${room.code}/dashboard`, { jar });
  assert.strictEqual(dashboard.body.counts.joined, 45);
  const names = dashboard.body.pupils.map((p) => p.displayName);
  assert.strictEqual(new Set(names).size, 45, 'every pupil has a distinct label');
});

test('a correct teacher password still works after pupils have made wrong guesses', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  // Someone on the same school network hammers the login form.
  for (let attempt = 0; attempt < 25; attempt++) {
    await server.request('/api/teacher/login', { body: { password: `guess-${attempt}` }, jar: {} });
  }
  // The teacher, on the same IP, must still be able to sign in.
  const { jar, result } = await teacherLogin(server);
  assert.strictEqual(result.status, 200, 'the teacher is not locked out by someone else');
  assert.ok(jar.mm_teacher);
});

// ---------------------------------------------------------------------------
// Payload size on classroom Wi-Fi
// ---------------------------------------------------------------------------

test('text assets are compressed when the browser accepts it', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  for (const path of ['/', '/teacher', '/css/common.css', '/js/pupil.js', '/js/art.js']) {
    const plain = await fetch(server.base + path, { headers: { 'Accept-Encoding': 'identity' } });
    const plainBytes = (await plain.arrayBuffer()).byteLength;

    const compressed = await fetch(server.base + path, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.strictEqual(compressed.headers.get('content-encoding'), 'gzip', `${path} was not compressed`);
    assert.match(compressed.headers.get('vary') || '', /Accept-Encoding/, `${path} must vary on encoding`);

    // fetch decodes transparently, so compare the decoded text instead.
    const decoded = await compressed.text();
    assert.strictEqual(decoded.length > 0, true);
    assert.ok(
      Number(compressed.headers.get('content-length')) < plainBytes,
      `${path} compressed body (${compressed.headers.get('content-length')}B) ` +
        `should be smaller than ${plainBytes}B`
    );
  }
});

test('the whole pupil app fits comfortably in one small download', async (t) => {
  const server = await startServer();
  t.after(() => server.close());

  const firstLoad = ['/', '/css/common.css', '/css/pupil.css', '/js/pupil.js', '/js/art.js'];
  let total = 0;
  for (const path of firstLoad) {
    const response = await fetch(server.base + path, { headers: { 'Accept-Encoding': 'gzip' } });
    total += Number(response.headers.get('content-length'));
    await response.arrayBuffer();
  }
  // No images, fonts or third-party scripts are loaded at all.
  assert.ok(total < 60 * 1024, `pupil first load is ${(total / 1024).toFixed(1)}KB, expected under 60KB`);
});

test('a CSV download is never compressed, so the saved bytes are exact', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const { jar } = await teacherLogin(server);
  const room = await createRoom(server, jar);

  const response = await fetch(
    `${server.base}/api/teacher/rooms/${room.code}/export/english-summary.csv`,
    { headers: { Cookie: `mm_teacher=${jar.mm_teacher}`, 'Accept-Encoding': 'gzip' } }
  );
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get('content-encoding'), null, 'downloads stay uncompressed');
  assert.match(response.headers.get('content-type'), /text\/csv/);
  // Response.text() strips a BOM, so inspect the raw bytes instead.
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepStrictEqual(
    Array.from(bytes.subarray(0, 3)),
    [0xef, 0xbb, 0xbf],
    'the UTF-8 BOM survived, so Excel opens Thai names correctly'
  );
});

test('a HEAD request reports the same headers a GET would', async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const headers = { 'Accept-Encoding': 'gzip' };

  const head = await fetch(`${server.base}/js/art.js`, { method: 'HEAD', headers });
  const get = await fetch(`${server.base}/js/art.js`, { headers });
  await get.arrayBuffer();

  assert.strictEqual(head.headers.get('content-encoding'), get.headers.get('content-encoding'));
  assert.strictEqual(head.headers.get('content-length'), get.headers.get('content-length'));
  assert.strictEqual(head.headers.get('content-type'), get.headers.get('content-type'));
});
