'use strict';
/**
 * Simulated classroom load test.
 *
 * Starts the real server in this process and drives N independent pupil
 * sessions through the real HTTP API at the same time: join, hold an SSE
 * stream open, answer questions, play merge rounds, deliver requests.
 *
 * What this proves: the server's own logic and timers cope with a full class
 * without errors, lost sessions, duplicated pupils or double rewards.
 *
 * What this does NOT prove: that a particular classroom's Wi-Fi or a
 * particular host plan will perform well. Both clients and server run on one
 * machine here, with no radio contention and no internet in between. Treat the
 * latency figures as a floor, not a prediction.
 *
 * Run with: npm run test:load   (or: node tests/load.js --pupils 60)
 */

const { createApp } = require('../server/index');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

const PUPILS = arg('pupils', 45);
const CYCLES = arg('cycles', 3);
const ROUND_SECONDS = 30;

const PASSWORD = 'load-test-password';

const stats = {
  requests: 0,
  errors: [],
  latencies: [],
  joined: 0,
  answers: 0,
  merges: 0,
  generates: 0,
  deliveries: 0,
  refusals: {},
  sseFrames: 0,
  sseOpen: 0,
};

function note(reason) {
  stats.refusals[reason] = (stats.refusals[reason] || 0) + 1;
}

async function main() {
  const app = createApp({
    port: 0,
    publicBaseUrl: 'https://merge-mystery-load.onrender.com',
    teacherPassword: PASSWORD,
    teacherPasswordHash: '',
    nodeEnv: 'test',
  });
  app.startTimers();
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;

  async function call(path, { method, body, cookie } = {}) {
    const options = { method: method || (body === undefined ? 'GET' : 'POST'), headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    if (cookie) options.headers.Cookie = cookie;

    const started = process.hrtime.bigint();
    let response;
    try {
      response = await fetch(base + path, options);
    } catch (err) {
      stats.errors.push(`${method || 'GET'} ${path}: ${err.message}`);
      return { status: 0, body: {} };
    }
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    stats.requests++;
    stats.latencies.push(elapsed);

    let payload = {};
    const type = response.headers.get('content-type') || '';
    if (type.includes('json')) {
      try { payload = await response.json(); } catch { payload = {}; }
    } else {
      await response.text();
    }

    const setCookie = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    let newCookie = null;
    for (const raw of setCookie) {
      if (raw.startsWith('mm_pupil=')) newCookie = raw.split(';')[0];
      if (raw.startsWith('mm_teacher=')) newCookie = raw.split(';')[0];
    }
    return { status: response.status, body: payload, cookie: newCookie };
  }

  // --- teacher sets up ---
  const login = await call('/api/teacher/login', { body: { password: PASSWORD } });
  if (login.status !== 200) throw new Error('teacher login failed in load test');
  const teacherCookie = login.cookie;

  const created = await call('/api/teacher/rooms', { body: {}, cookie: teacherCookie });
  const roomCode = created.body.code;
  if (!roomCode) throw new Error('room creation failed in load test');
  await call(`/api/teacher/rooms/${roomCode}/settings`, {
    body: { roundSeconds: ROUND_SECONDS },
    cookie: teacherCookie,
  });

  console.log(`Load test: ${PUPILS} pupils, ${CYCLES} cycles each, room ${roomCode}`);
  const wallStart = Date.now();

  // --- pupils join, all at once ---
  const pupils = await Promise.all(
    Array.from({ length: PUPILS }, async (_, index) => {
      const nickname = `Pupil${String(index + 1).padStart(2, '0')}`;
      const joined = await call('/api/pupil/join', { body: { roomCode, nickname } });
      if (joined.status !== 200) {
        stats.errors.push(`join ${nickname}: status ${joined.status}`);
        return null;
      }
      stats.joined++;
      return {
        nickname,
        cookie: joined.cookie,
        rejoinToken: joined.body.rejoinToken,
        id: joined.body.state.pupil.id,
        displayName: joined.body.state.pupil.displayName,
      };
    })
  );
  const roster = pupils.filter(Boolean);

  // --- every pupil opens a live event stream and keeps it open ---
  const controllers = [];
  await Promise.all(
    roster.map(async (pupil) => {
      const controller = new AbortController();
      controllers.push(controller);
      try {
        const response = await fetch(`${base}/api/pupil/events`, {
          headers: { Cookie: pupil.cookie },
          signal: controller.signal,
        });
        if (response.status !== 200) {
          stats.errors.push(`sse ${pupil.nickname}: status ${response.status}`);
          return;
        }
        stats.sseOpen++;
        // Drain in the background, counting frames.
        (async () => {
          const reader = response.body.getReader();
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              const text = new TextDecoder().decode(value);
              stats.sseFrames += (text.match(/^event: /gm) || []).length;
            }
          } catch { /* aborted at the end of the test */ }
        })();
      } catch (err) {
        if (err.name !== 'AbortError') stats.errors.push(`sse ${pupil.nickname}: ${err.message}`);
      }
    })
  );

  await call(`/api/teacher/rooms/${roomCode}/start`, { body: {}, cookie: teacherCookie });

  // --- run the cycles concurrently ---
  const room = app.manager.get(roomCode);

  async function runPupil(pupil) {
    for (let cycle = 0; cycle < CYCLES; cycle++) {
      // Learning step: answer both questions, deliberately missing some so
      // retries and corrections are exercised too.
      for (let guard = 0; guard < 6; guard++) {
        const snapshot = await call('/api/pupil/state', { cookie: pupil.cookie });
        const state = snapshot.body.state;
        if (!state || state.phase !== 'learning' || !state.question) break;

        const full = app.store.get(state.question.id);
        const beWrong = (cycle + pupil.nickname.length) % 3 === 0 && state.question.attemptsUsed === 0;
        let answer;
        if (beWrong) {
          answer = full.options ? full.options.find((o) => o !== full.answer) : 'wrong-on-purpose';
        } else if (full.type === 'order') {
          answer = full.tokens.join(' ');
        } else {
          answer = full.answer;
        }
        const result = await call('/api/pupil/answer', {
          body: { questionId: full.id, answer },
          cookie: pupil.cookie,
        });
        if (result.status === 200) stats.answers++;
        else note(`answer-${result.status}`);
      }

      const started = await call('/api/pupil/start-round', { body: {}, cookie: pupil.cookie });
      if (started.status !== 200) {
        note(`start-round-${started.status}`);
        continue;
      }

      // Merge round: work the cheapest request.
      let state = started.body.state;
      if (!state.game) continue;
      // Pick the cheapest request that actually needs merging, so the merge
      // path is exercised rather than a one-tap level-1 delivery.
      const byCost = state.game.missions.slice().sort((a, b) => a.cost - b.cost);
      const target = byCost.find((m) => m.level >= 2) || byCost[0];

      for (let i = 0; i < target.cost; i++) {
        const result = await call('/api/pupil/action', {
          body: { action: { type: 'generate', family: target.family, nonce: `${pupil.id}-g-${cycle}-${i}` } },
          cookie: pupil.cookie,
        });
        if (result.status === 200) stats.generates++;
        else { note(`generate-${result.body.reason || result.status}`); break; }
      }

      for (let level = 1; level < 5; level++) {
        for (let pass = 0; pass < 16; pass++) {
          const snapshot = await call('/api/pupil/state', { cookie: pupil.cookie });
          state = snapshot.body.state;
          if (!state.game) break;
          const slots = [];
          state.game.board.forEach((item, index) => {
            if (item && item.family === target.family && item.level === level) slots.push(index);
          });
          if (slots.length < 2) break;
          const result = await call('/api/pupil/action', {
            body: {
              action: {
                type: 'merge',
                nonce: `${pupil.id}-m-${cycle}-${level}-${pass}`,
                from: { zone: 'board', index: slots[0] },
                to: { zone: 'board', index: slots[1] },
              },
            },
            cookie: pupil.cookie,
          });
          if (result.status === 200) stats.merges++;
          else { note(`merge-${result.body.reason || result.status}`); break; }
        }
      }

      // Deliver anything that matches a request.
      const snapshot = await call('/api/pupil/state', { cookie: pupil.cookie });
      state = snapshot.body.state;
      if (state.game) {
        for (const mission of state.game.missions) {
          const index = state.game.board.findIndex(
            (item) => item && item.family === mission.family && item.level === mission.level
          );
          if (index === -1) continue;
          const result = await call('/api/pupil/action', {
            body: {
              action: {
                type: 'deliver',
                nonce: `${pupil.id}-d-${cycle}-${mission.id}`,
                missionId: mission.id,
                from: { zone: 'board', index },
              },
            },
            cookie: pupil.cookie,
          });
          if (result.status === 200) stats.deliveries++;
          else note(`deliver-${result.body.reason || result.status}`);
          break;
        }
      }

      // Cut the round short so the test does not take CYCLES * 30 seconds.
      const inner = room.pupils.get(pupil.id);
      if (inner) {
        inner.roundEndsAt = Date.now() - 1;
        inner.checkRoundExpiry();
      }
    }
  }

  await Promise.all(roster.map(runPupil));

  // --- a third of the class refreshes at the same time ---
  const refreshers = roster.filter((_, index) => index % 3 === 0);
  const refreshResults = await Promise.all(
    refreshers.map(async (pupil) => {
      const before = await call('/api/pupil/state', { cookie: pupil.cookie });
      const rejoined = await call('/api/pupil/rejoin', {
        body: { roomCode, rejoinToken: pupil.rejoinToken },
      });
      if (rejoined.status !== 200) return { ok: false, why: `status ${rejoined.status}` };
      const sameId = rejoined.body.state.pupil.id === pupil.id;
      const beforeBoard = JSON.stringify(before.body.state?.game?.board || null);
      const afterBoard = JSON.stringify(rejoined.body.state?.game?.board || null);
      return { ok: sameId && beforeBoard === afterBoard, sameId, boardMatches: beforeBoard === afterBoard };
    })
  );

  // --- teacher exports results while the class is still live ---
  const exportStart = process.hrtime.bigint();
  const exports = {};
  for (const kind of ['english-summary', 'english-answers', 'game-results']) {
    const response = await fetch(`${base}/api/teacher/rooms/${roomCode}/export/${kind}.csv`, {
      headers: { Cookie: teacherCookie },
    });
    exports[kind] = (await response.text()).split('\r\n').filter(Boolean).length;
  }
  const exportMs = Number(process.hrtime.bigint() - exportStart) / 1e6;

  const dashboardStart = process.hrtime.bigint();
  const dashboard = await call(`/api/teacher/rooms/${roomCode}/dashboard`, { cookie: teacherCookie });
  const dashboardMs = Number(process.hrtime.bigint() - dashboardStart) / 1e6;

  const wallMs = Date.now() - wallStart;

  // --- integrity checks ---
  const problems = [];
  const rows = dashboard.body.pupils || [];
  if (rows.length !== roster.length) {
    problems.push(`dashboard shows ${rows.length} pupils, expected ${roster.length}`);
  }
  const names = new Set(rows.map((r) => r.displayName));
  if (names.size !== rows.length) problems.push('duplicate display names on the dashboard');

  for (const pupil of roster) {
    const inner = room.pupils.get(pupil.id);
    if (!inner) { problems.push(`${pupil.nickname} vanished from the room`); continue; }
    // No pupil may have been rewarded twice for one request.
    const answered = Object.values(inner.learning.answers);
    for (const entry of answered) {
      if (entry.attempts.length > 2) {
        problems.push(`${pupil.nickname} recorded ${entry.attempts.length} attempts on ${entry.questionId}`);
      }
      if (entry.firstAttemptCorrect && entry.correctAfterRetry) {
        problems.push(`${pupil.nickname} counted twice on ${entry.questionId}`);
      }
    }
  }
  const badRefresh = refreshResults.filter((r) => !r.ok);
  if (badRefresh.length > 0) {
    problems.push(`${badRefresh.length} of ${refreshResults.length} refreshes did not restore the same session`);
  }
  if (stats.sseOpen !== roster.length) {
    problems.push(`only ${stats.sseOpen} of ${roster.length} event streams opened`);
  }

  // --- report ---
  const sorted = stats.latencies.slice().sort((a, b) => a - b);
  const percentile = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

  console.log('\n--- Results -------------------------------------------------');
  console.log(`pupils joined          : ${stats.joined} / ${PUPILS}`);
  console.log(`event streams open     : ${stats.sseOpen}`);
  console.log(`SSE frames received    : ${stats.sseFrames}`);
  console.log(`HTTP requests          : ${stats.requests}`);
  console.log(`wall clock             : ${(wallMs / 1000).toFixed(1)}s`);
  console.log(`throughput             : ${(stats.requests / (wallMs / 1000)).toFixed(0)} requests/second`);
  console.log(`latency p50 / p95 / p99: ${percentile(50).toFixed(1)} / ${percentile(95).toFixed(1)} / ${percentile(99).toFixed(1)} ms`);
  console.log(`latency max            : ${sorted.length ? sorted[sorted.length - 1].toFixed(1) : 0} ms`);
  console.log(`answers marked         : ${stats.answers}`);
  console.log(`items generated        : ${stats.generates}`);
  console.log(`merges performed       : ${stats.merges}`);
  console.log(`requests delivered     : ${stats.deliveries}`);
  console.log(`refreshes restored     : ${refreshResults.filter((r) => r.ok).length} / ${refreshResults.length}`);
  console.log(`dashboard build time   : ${dashboardMs.toFixed(1)} ms`);
  console.log(`3 CSV exports          : ${exportMs.toFixed(1)} ms (${JSON.stringify(exports)} rows)`);
  console.log(`memory (rss)           : ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB`);
  if (Object.keys(stats.refusals).length > 0) {
    console.log(`expected refusals      : ${JSON.stringify(stats.refusals)}`);
  }
  console.log(`transport errors       : ${stats.errors.length}`);
  for (const error of stats.errors.slice(0, 10)) console.log(`   ${error}`);

  console.log('\n--- Integrity -----------------------------------------------');
  if (problems.length === 0) {
    console.log('PASS: no duplicated pupils, no double-counted answers, every refresh restored.');
  } else {
    console.log('FAIL:');
    for (const problem of problems) console.log(`   ${problem}`);
  }

  console.log(
    '\nNote: clients and server shared one machine with no network in between.\n' +
    'This measures server capacity only. It is not evidence about classroom Wi-Fi.'
  );

  for (const controller of controllers) controller.abort();
  app.stopTimers();
  if (app.server.closeAllConnections) app.server.closeAllConnections();
  await new Promise((resolve) => app.server.close(resolve));

  const failed = problems.length > 0 || stats.errors.length > 0;
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Load test crashed:', err);
  process.exit(1);
});
