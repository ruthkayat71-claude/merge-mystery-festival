'use strict';
/** Shared helpers for the HTTP-level integration tests. */

const { createApp } = require('../server/index');

const TEST_PASSWORD = 'festival-test-password';

/**
 * Start the real server on an ephemeral port and return a small client.
 */
async function startServer(overrides = {}) {
  const app = createApp({
    port: 0,
    publicBaseUrl: 'https://merge-mystery-test.onrender.com',
    teacherPassword: TEST_PASSWORD,
    teacherPasswordHash: '',
    nodeEnv: 'test',
    ...overrides,
  });

  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const { port } = app.server.address();
  const base = `http://127.0.0.1:${port}`;

  return {
    app,
    base,
    port,
    /** Make a request. `jar` is a mutable cookie store object. */
    async request(path, { method, body, jar, headers = {}, raw = false } = {}) {
      const options = {
        method: method || (body === undefined ? 'GET' : 'POST'),
        headers: { ...headers },
      };
      if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      if (jar && Object.keys(jar).length > 0) {
        options.headers.Cookie = Object.entries(jar)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ');
      }
      const response = await fetch(base + path, options);

      if (jar) {
        const raws = response.headers.getSetCookie
          ? response.headers.getSetCookie()
          : [response.headers.get('set-cookie')].filter(Boolean);
        for (const cookie of raws) {
          const [pair] = cookie.split(';');
          const index = pair.indexOf('=');
          const name = pair.slice(0, index).trim();
          const value = pair.slice(index + 1).trim();
          if (value === '') delete jar[name];
          else jar[name] = value;
        }
      }

      const contentType = response.headers.get('content-type') || '';
      let payload;
      if (raw) payload = await response.text();
      else if (contentType.includes('application/json')) {
        try { payload = await response.json(); } catch { payload = {}; }
      } else payload = await response.text();

      return { status: response.status, headers: response.headers, body: payload };
    },
    async close() {
      app.stopTimers();
      // fetch() keeps sockets alive, and SSE streams stay open on purpose, so
      // close() alone would never settle. Drop the sockets explicitly.
      if (app.server.closeAllConnections) app.server.closeAllConnections();
      await new Promise((resolve) => app.server.close(resolve));
    },
  };
}

/** Sign in as the teacher and return a cookie jar holding the session. */
async function teacherLogin(server, password = TEST_PASSWORD) {
  const jar = {};
  const result = await server.request('/api/teacher/login', { body: { password }, jar });
  return { jar, result };
}

/** Create a room as the teacher. */
async function createRoom(server, jar, settings) {
  const result = await server.request('/api/teacher/rooms', {
    body: settings ? { settings } : {},
    jar,
  });
  return result.body;
}

/** Join a room as a pupil and return their jar plus first state. */
async function joinPupil(server, roomCode, nickname) {
  const jar = {};
  const result = await server.request('/api/pupil/join', {
    body: { roomCode, nickname },
    jar,
  });
  return { jar, status: result.status, body: result.body };
}

/**
 * Answer the current question (correctly or incorrectly) until the pupil has
 * finished the learning step, then return the final state.
 */
async function answerCycle(server, jar, app, { correct = true } = {}) {
  for (let guard = 0; guard < 8; guard++) {
    const stateResult = await server.request('/api/pupil/state', { jar });
    const state = stateResult.body.state;
    if (!state || state.phase !== 'learning' || !state.question) return state;

    const full = app.store.get(state.question.id);
    let answer;
    if (correct) {
      answer = full.answer;
    } else {
      answer = full.type === 'mc' || full.type === 'reading'
        ? full.options.find((o) => o !== full.answer)
        : 'definitely-not-the-answer';
    }
    await server.request('/api/pupil/answer', {
      body: { questionId: state.question.id, answer },
      jar,
    });
  }
  const final = await server.request('/api/pupil/state', { jar });
  return final.body.state;
}

module.exports = { startServer, teacherLogin, createRoom, joinPupil, answerCycle, TEST_PASSWORD };
