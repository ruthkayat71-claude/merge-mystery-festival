'use strict';
/**
 * Merge Mystery: The Missing Festival - application server.
 *
 * One Node process serves the pupil app, the teacher dashboard, the JSON API
 * and the Server-Sent Event streams. No external dependencies.
 */

const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');

const H = require('./http');
const qr = require('./qr');
const qrdecode = require('./qrdecode');
const merge = require('./merge');
const csv = require('./csv');
const { TeacherAuth } = require('./auth');
const { QuestionStore } = require('./questionStore');
const { RoomManager, ROUND_LENGTH_CHOICES, validateNickname } = require('./rooms');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TICK_INTERVAL_MS = 1000;
const KEEPALIVE_INTERVAL_MS = 20 * 1000;
const PUPIL_COOKIE = 'mm_pupil';
const TEACHER_COOKIE = 'mm_teacher';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function readConfig(env = process.env) {
  const port = Number(env.PORT) || 3000;
  const rawBase = (env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  return {
    port,
    publicBaseUrl: rawBase,
    teacherPassword: env.TEACHER_PASSWORD || '',
    teacherPasswordHash: env.TEACHER_PASSWORD_HASH || '',
    nodeEnv: env.NODE_ENV || 'development',
  };
}

/**
 * The address pupils will actually use.
 *
 * PUBLIC_BASE_URL is preferred because it is the only value that is certainly
 * right for QR codes. Falling back to the request's own Host header still
 * avoids localhost whenever the request came from a real device.
 */
function resolveBaseUrl(config, req) {
  if (config.publicBaseUrl) return config.publicBaseUrl;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!host) return '';
  const proto = H.isSecureRequest(req) ? 'https' : 'http';
  return `${proto}://${host}`;
}

function isLocalBase(baseUrl) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|$|\/)/i.test(baseUrl);
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

function createApp(config) {
  const store = new QuestionStore();
  const manager = new RoomManager(store);
  const auth = new TeacherAuth({
    password: config.teacherPassword,
    passwordHash: config.teacherPasswordHash,
  });

  // pupil session cookie value -> { roomCode, pupilId }
  const pupilSessions = new Map();
  // A whole school usually shares one public IP, so anything keyed by client
  // address has to be generous enough for several classes joining at once.
  // Per-pupil limits are keyed by pupil id instead, where they are meaningful.
  const loginLimiter = new H.RateLimiter(40, 60 * 1000);
  const joinLimiter = new H.RateLimiter(400, 60 * 1000);
  const actionLimiter = new H.RateLimiter(600, 60 * 1000);

  const bankProblems = store.validateAll();
  if (bankProblems.length > 0) {
    console.error('Question bank has problems:', bankProblems);
  }

  function newPupilSession(room, pupil) {
    const token = crypto.randomBytes(24).toString('base64url');
    pupilSessions.set(token, { roomCode: room.code, pupilId: pupil.id });
    return token;
  }

  function resolvePupil(req) {
    const cookies = H.parseCookies(req);
    const token = cookies[PUPIL_COOKIE];
    if (!token) return null;
    const session = pupilSessions.get(token);
    if (!session) return null;
    const room = manager.get(session.roomCode);
    if (!room) return null;
    const pupil = room.pupils.get(session.pupilId);
    if (!pupil || pupil.removed) return null;
    pupil.lastSeen = Date.now();
    if (!pupil.connected) pupil.connected = true;
    return { room, pupil, token };
  }

  function isTeacher(req) {
    const cookies = H.parseCookies(req);
    return auth.isValidSession(cookies[TEACHER_COOKIE]);
  }

  function setCookie(req, res, name, value, maxAgeSeconds) {
    H.appendCookie(
      res,
      H.buildCookie(name, value, {
        maxAge: maxAgeSeconds,
        secure: H.isSecureRequest(req) || config.nodeEnv === 'production',
        httpOnly: true,
        sameSite: 'Lax',
      })
    );
  }

  function clearCookie(req, res, name) {
    H.appendCookie(
      res,
      H.buildCookie(name, '', {
        maxAge: 0,
        secure: H.isSecureRequest(req) || config.nodeEnv === 'production',
        httpOnly: true,
      })
    );
  }

  // -- push helpers --------------------------------------------------------

  function pushPupil(pupil) {
    if (pupil.channel) pupil.channel.send('state', pupil.selfState());
  }

  function pushRoom(room) {
    for (const pupil of room.pupilList()) pushPupil(pupil);
    pushTeachers(room);
  }

  /**
   * Push the dashboard to any watching teacher.
   *
   * Building a dashboard walks every pupil and recomputes both scoreboards, so
   * sending one per pupil action would mean O(class size) work on every tap.
   * Pushes are coalesced instead: the first is immediate, and anything that
   * arrives during the window is collapsed into a single trailing update. A
   * teacher watching a TV cannot perceive the difference.
   */
  const TEACHER_PUSH_INTERVAL_MS = 400;
  const teacherPushState = new Map(); // room code -> { lastAt, timer }

  function sendDashboardNow(room) {
    if (room.teacherChannels.size === 0) return;
    const payload = room.dashboard();
    for (const channel of room.teacherChannels) {
      if (!channel.send('dashboard', payload)) room.teacherChannels.delete(channel);
    }
  }

  function pushTeachers(room) {
    if (room.teacherChannels.size === 0) return;
    const now = Date.now();
    const entry = teacherPushState.get(room.code) || { lastAt: 0, timer: null };
    teacherPushState.set(room.code, entry);

    if (now - entry.lastAt >= TEACHER_PUSH_INTERVAL_MS) {
      entry.lastAt = now;
      sendDashboardNow(room);
      return;
    }
    if (entry.timer) return; // an update is already queued
    entry.timer = setTimeout(() => {
      entry.timer = null;
      entry.lastAt = Date.now();
      sendDashboardNow(room);
    }, TEACHER_PUSH_INTERVAL_MS - (now - entry.lastAt));
    if (entry.timer.unref) entry.timer.unref();
  }

  // -- join URL and QR ----------------------------------------------------

  function joinUrl(baseUrl, code) {
    return `${baseUrl}/j/${code}`;
  }

  /**
   * Build the QR code for a room and verify, before returning it, that the
   * symbol decodes back to the exact join URL.
   */
  function buildQr(baseUrl, code) {
    const url = joinUrl(baseUrl, code);
    const encoded = qr.encode(url, { ecLevel: 'M' });
    const svg = qr.toSvg(encoded, {
      scale: 8,
      quietZone: 4,
      ariaLabel: `QR code to join room ${code}`,
    });

    let decoded = null;
    let verified = false;
    let verifyError = null;
    try {
      decoded = qrdecode.decodeSvg(svg).text;
      verified = decoded === url;
    } catch (err) {
      verifyError = err.message;
    }

    return {
      url,
      svg,
      version: encoded.version,
      ecLevel: encoded.ecLevel,
      mask: encoded.mask,
      modules: encoded.size,
      quietZoneModules: 4,
      verified,
      decodedText: decoded,
      verifyError,
      usesLocalhost: isLocalBase(baseUrl),
    };
  }

  // -- routing -------------------------------------------------------------

  async function handle(req, res) {
    H.applySecurityHeaders(res);

    let url;
    try {
      url = new URL(req.url, 'http://placeholder');
    } catch {
      return H.sendText(res, 400, 'Bad request');
    }
    const pathname = url.pathname.replace(/\/{2,}/g, '/');
    const method = req.method || 'GET';

    // ---- pages ----
    if (pathname === '/' || pathname === '/index.html') {
      return H.serveStatic(req, res, PUBLIC_DIR, '/index.html', { cacheControl: 'no-cache' });
    }
    if (pathname === '/teacher' || pathname === '/teacher.html') {
      return H.serveStatic(req, res, PUBLIC_DIR, '/teacher.html', { cacheControl: 'no-cache' });
    }
    // Join link: /j/CODE -> pupil app, code read from the path by the client.
    const joinMatch = pathname.match(/^\/j\/([A-Za-z0-9]{1,12})$/);
    if (joinMatch) {
      return H.serveStatic(req, res, PUBLIC_DIR, '/index.html', { cacheControl: 'no-cache' });
    }
    if (pathname === '/healthz') {
      return H.sendJson(res, 200, {
        ok: true,
        rooms: manager.rooms.size,
        questions: store.count(),
        uptimeSeconds: Math.round(process.uptime()),
      });
    }

    // ---- public config ----
    if (pathname === '/api/config' && method === 'GET') {
      const baseUrl = resolveBaseUrl(config, req);
      return H.sendJson(res, 200, {
        baseUrl,
        roundLengthChoices: ROUND_LENGTH_CHOICES,
        teacherConfigured: auth.status().configured,
      });
    }

    // ---- pupil API ----
    if (pathname.startsWith('/api/pupil/')) {
      return handlePupil(req, res, pathname, method, url);
    }
    // ---- teacher API ----
    if (pathname.startsWith('/api/teacher/')) {
      return handleTeacher(req, res, pathname, method, url);
    }

    // ---- static assets ----
    const served = await H.serveStatic(req, res, PUBLIC_DIR, pathname);
    if (served) return undefined;
    return H.sendText(res, 404, 'Not found');
  }

  // -- pupil endpoints -----------------------------------------------------

  async function handlePupil(req, res, pathname, method, url) {
    if (pathname === '/api/pupil/events' && method === 'GET') {
      const found = resolvePupil(req);
      if (!found) return H.sendJson(res, 401, { error: 'Please join the room again.' });
      const channel = new H.Channel(req, res);
      if (found.pupil.channel && found.pupil.channel !== channel) {
        // A refresh leaves the old stream behind; close it so only one is live.
        found.pupil.channel.close();
      }
      found.pupil.channel = channel;
      found.pupil.connected = true;
      channel.onClose = () => {
        if (found.pupil.channel === channel) {
          found.pupil.channel = null;
          found.pupil.connected = false;
          pushTeachers(found.room);
        }
      };
      channel.send('state', found.pupil.selfState());
      pushTeachers(found.room);
      return undefined;
    }

    if (method === 'POST' && pathname === '/api/pupil/join') {
      const limit = joinLimiter.check(`join:${H.clientKey(req)}`);
      if (!limit.allowed) {
        return H.sendJson(res, 429, { error: 'Too many tries. Please wait a moment.' });
      }
      const parsed = await H.readJsonBody(req);
      if (!parsed.ok) return H.sendJson(res, parsed.tooLarge ? 413 : 400, { error: parsed.error });

      const room = manager.get(parsed.body.roomCode);
      if (!room) {
        return H.sendJson(res, 404, { error: 'That room code was not found. Please check the code on the screen.' });
      }
      const result = room.join(parsed.body.nickname);
      if (!result.ok) return H.sendJson(res, 400, { error: result.message });

      const token = newPupilSession(room, result.pupil);
      setCookie(req, res, PUPIL_COOKIE, token, 12 * 60 * 60);
      pushTeachers(room);
      return H.sendJson(res, 200, {
        // The rejoin token is this pupil's private key for coming back after a
        // refresh. It is stored only on their own device.
        rejoinToken: result.pupil.rejoinToken,
        state: result.pupil.selfState(),
      });
    }

    if (method === 'POST' && pathname === '/api/pupil/rejoin') {
      const parsed = await H.readJsonBody(req);
      if (!parsed.ok) return H.sendJson(res, parsed.tooLarge ? 413 : 400, { error: parsed.error });
      const room = manager.get(parsed.body.roomCode);
      if (!room) return H.sendJson(res, 404, { error: 'That room is no longer open.' });
      const result = room.rejoin(String(parsed.body.rejoinToken || ''));
      if (!result.ok) return H.sendJson(res, 401, { error: result.message });

      const token = newPupilSession(room, result.pupil);
      setCookie(req, res, PUPIL_COOKIE, token, 12 * 60 * 60);
      pushTeachers(room);
      return H.sendJson(res, 200, { rejoinToken: result.pupil.rejoinToken, state: result.pupil.selfState() });
    }

    // Everything below needs a live pupil session.
    const found = resolvePupil(req);
    if (!found) return H.sendJson(res, 401, { error: 'Please join the room again.' });
    const { room, pupil } = found;

    if (pathname === '/api/pupil/state' && method === 'GET') {
      pupil.checkRoundExpiry();
      return H.sendJson(res, 200, { state: pupil.selfState() });
    }

    if (pathname === '/api/pupil/leave' && method === 'POST') {
      clearCookie(req, res, PUPIL_COOKIE);
      return H.sendJson(res, 200, { ok: true });
    }

    const limit = actionLimiter.check(`act:${pupil.id}`);
    if (!limit.allowed) {
      return H.sendJson(res, 429, { error: 'Slow down a little!' });
    }

    if (pathname === '/api/pupil/answer' && method === 'POST') {
      const parsed = await H.readJsonBody(req);
      if (!parsed.ok) return H.sendJson(res, parsed.tooLarge ? 413 : 400, { error: parsed.error });
      if (room.status !== 'running') {
        return H.sendJson(res, 409, { error: 'Waiting for your teacher.', state: pupil.selfState() });
      }
      const result = pupil.submitAnswer(String(parsed.body.questionId || ''), parsed.body.answer);
      if (!result.ok) return H.sendJson(res, 409, { error: result.message, state: pupil.selfState() });
      pushTeachers(room);
      return H.sendJson(res, 200, { feedback: result.feedback, state: pupil.selfState() });
    }

    if (pathname === '/api/pupil/start-round' && method === 'POST') {
      const result = pupil.startRound();
      if (!result.ok) return H.sendJson(res, 409, { error: result.message, state: pupil.selfState() });
      pushTeachers(room);
      return H.sendJson(res, 200, { state: pupil.selfState() });
    }

    if (pathname === '/api/pupil/action' && method === 'POST') {
      const parsed = await H.readJsonBody(req);
      if (!parsed.ok) return H.sendJson(res, parsed.tooLarge ? 413 : 400, { error: parsed.error });
      if (pupil.englishOnly) {
        return H.sendJson(res, 409, { error: 'You are in English-only mode.', state: pupil.selfState() });
      }
      pupil.checkRoundExpiry();

      const action = parsed.body.action || {};
      // Story and reward choices stay available outside the timed round so a
      // pupil is never rushed while reading a clue card.
      const alwaysAllowed = ['choose-decoration', 'clue-answer', 'finale'];
      const playing = alwaysAllowed.includes(action.type)
        ? true
        : room.status === 'running' && pupil.isPlaying();

      const result = merge.applyAction(pupil.game, action, { playing });
      pushTeachers(room);
      return H.sendJson(res, result.ok ? 200 : 409, {
        ok: result.ok,
        reason: result.reason || null,
        message: result.message || null,
        events: result.events || [],
        clue: result.clue || null,
        finale: result.finale || null,
        duplicate: Boolean(result.duplicate),
        state: pupil.selfState(),
      });
    }

    if (pathname === '/api/pupil/hint' && method === 'POST') {
      if (pupil.englishOnly) return H.sendJson(res, 409, { error: 'You are in English-only mode.' });
      return H.sendJson(res, 200, {
        hint: merge.hint(pupil.game),
        guided: merge.guidedMission(pupil.game),
        state: pupil.selfState(),
      });
    }

    if (pathname === '/api/pupil/heartbeat' && method === 'POST') {
      pupil.checkRoundExpiry();
      return H.sendJson(res, 200, { ok: true, serverNow: Date.now(), phase: pupil.phase });
    }

    return H.sendJson(res, 404, { error: 'Unknown pupil endpoint.' });
  }

  // -- teacher endpoints ---------------------------------------------------

  async function handleTeacher(req, res, pathname, method, url) {
    if (pathname === '/api/teacher/status' && method === 'GET') {
      return H.sendJson(res, 200, {
        ...auth.status(),
        signedIn: isTeacher(req),
        baseUrl: resolveBaseUrl(config, req),
      });
    }

    if (pathname === '/api/teacher/login' && method === 'POST') {
      const key = H.clientKey(req);
      const limit = loginLimiter.check(`login:${key}`);
      if (!limit.allowed) {
        return H.sendJson(res, 429, { error: 'Too many tries. Please wait a minute.' });
      }
      const parsed = await H.readJsonBody(req);
      if (!parsed.ok) return H.sendJson(res, parsed.tooLarge ? 413 : 400, { error: parsed.error });

      const result = auth.login(String(parsed.body.password || ''), key);
      if (!result.ok) {
        // Never echo the submitted password back, and never log it.
        return H.sendJson(res, result.reason === 'locked-out' ? 429 : 401, { error: result.message });
      }
      setCookie(req, res, TEACHER_COOKIE, result.token, Math.floor((result.expiresAt - Date.now()) / 1000));
      return H.sendJson(res, 200, { ok: true, expiresAt: result.expiresAt });
    }

    if (pathname === '/api/teacher/logout' && method === 'POST') {
      const cookies = H.parseCookies(req);
      auth.logout(cookies[TEACHER_COOKIE]);
      clearCookie(req, res, TEACHER_COOKIE);
      return H.sendJson(res, 200, { ok: true });
    }

    // Everything below is teacher-only.
    if (!isTeacher(req)) {
      return H.sendJson(res, 401, { error: 'Please sign in as the teacher.' });
    }

    if (pathname === '/api/teacher/rooms' && method === 'POST') {
      const parsed = await H.readJsonBody(req);
      if (!parsed.ok) return H.sendJson(res, parsed.tooLarge ? 413 : 400, { error: parsed.error });
      const room = manager.create();
      if (parsed.body.settings) {
        const applied = room.updateSettings(parsed.body.settings);
        if (!applied.ok) return H.sendJson(res, 400, { error: applied.problems.join(' ') });
      }
      const baseUrl = resolveBaseUrl(config, req);
      return H.sendJson(res, 200, {
        code: room.code,
        qr: buildQr(baseUrl, room.code),
        dashboard: room.dashboard(),
      });
    }

    if (pathname === '/api/teacher/rooms' && method === 'GET') {
      return H.sendJson(res, 200, {
        rooms: manager.list().map((room) => ({
          code: room.code,
          status: room.status,
          joined: room.pupilList().length,
          connected: room.countConnected(),
          createdAt: room.createdAt,
        })),
      });
    }

    // Question bank management.
    if (pathname === '/api/teacher/questions' && method === 'GET') {
      return H.sendJson(res, 200, {
        questions: store.listForTeacher(),
        problems: store.validateAll(),
      });
    }
    const questionMatch = pathname.match(/^\/api\/teacher\/questions\/([A-Za-z0-9_-]+)$/);
    if (questionMatch && method === 'PUT') {
      const parsed = await H.readJsonBody(req);
      if (!parsed.ok) return H.sendJson(res, parsed.tooLarge ? 413 : 400, { error: parsed.error });
      const result = store.update(questionMatch[1], parsed.body.patch || {});
      if (!result.ok) return H.sendJson(res, 400, { problems: result.problems });
      return H.sendJson(res, 200, { question: result.question });
    }
    const testMatch = pathname.match(/^\/api\/teacher\/questions\/([A-Za-z0-9_-]+)\/test$/);
    if (testMatch && method === 'POST') {
      const parsed = await H.readJsonBody(req);
      if (!parsed.ok) return H.sendJson(res, parsed.tooLarge ? 413 : 400, { error: parsed.error });
      const result = store.testAnswer(testMatch[1], String(parsed.body.answer ?? ''));
      if (!result.ok) return H.sendJson(res, 400, { problems: result.problems });
      return H.sendJson(res, 200, result);
    }
    if (pathname === '/api/teacher/questions/export' && method === 'GET') {
      return H.sendDownload(res, 'question-bank.json', store.exportJson(), 'application/json; charset=utf-8');
    }

    // Room-scoped routes.
    const roomMatch = pathname.match(/^\/api\/teacher\/rooms\/([A-Za-z0-9]{1,12})(\/.*)?$/);
    if (!roomMatch) return H.sendJson(res, 404, { error: 'Unknown teacher endpoint.' });

    const room = manager.get(roomMatch[1]);
    if (!room) return H.sendJson(res, 404, { error: 'That room was not found.' });
    const rest = roomMatch[2] || '';

    if (rest === '/events' && method === 'GET') {
      const channel = new H.Channel(req, res);
      room.teacherChannels.add(channel);
      channel.onClose = () => room.teacherChannels.delete(channel);
      channel.send('dashboard', room.dashboard());
      return undefined;
    }

    if (rest === '' || rest === '/dashboard') {
      if (method !== 'GET') return H.sendJson(res, 405, { error: 'Method not allowed.' });
      return H.sendJson(res, 200, room.dashboard());
    }

    if (rest === '/qr' && method === 'GET') {
      const baseUrl = url.searchParams.get('baseUrl') || resolveBaseUrl(config, req);
      const built = buildQr(baseUrl, room.code);
      if (url.searchParams.get('format') === 'png') {
        const encoded = qr.encode(built.url, { ecLevel: 'M' });
        const png = qr.toPngBuffer(encoded, { scale: 10, quietZone: 4 });
        return H.sendBuffer(res, 200, png, 'image/png', {
          'Content-Disposition': `inline; filename="join-${room.code}.png"`,
          'Cache-Control': 'no-store',
        });
      }
      return H.sendJson(res, 200, built);
    }

    if (method === 'POST' && ['/start', '/pause', '/end'].includes(rest)) {
      const action = rest.slice(1);
      const result = room[action]();
      if (!result.ok) return H.sendJson(res, 409, { error: result.message });
      pushRoom(room);
      return H.sendJson(res, 200, { dashboard: room.dashboard() });
    }

    if (rest === '/settings' && method === 'POST') {
      const parsed = await H.readJsonBody(req);
      if (!parsed.ok) return H.sendJson(res, parsed.tooLarge ? 413 : 400, { error: parsed.error });
      const result = room.updateSettings(parsed.body);
      if (!result.ok) return H.sendJson(res, 400, { problems: result.problems });
      pushRoom(room);
      return H.sendJson(res, 200, { settings: result.settings, dashboard: room.dashboard() });
    }

    const pupilMatch = rest.match(/^\/pupils\/([A-Za-z0-9-]+)(\/.*)?$/);
    if (pupilMatch) {
      const pupilId = pupilMatch[1];
      const sub = pupilMatch[2] || '';

      if (sub === '/answers' && method === 'GET') {
        const pupil = room.pupils.get(pupilId);
        if (!pupil) return H.sendJson(res, 404, { error: 'That pupil was not found.' });
        return H.sendJson(res, 200, {
          pupil: { id: pupil.id, displayName: pupil.displayName, nickname: pupil.nickname },
          english: pupil.learningSummary(),
          answers: pupil.teacherAnswers(),
          game: pupil.gameSummary(),
        });
      }
      if (sub === '/remove' && method === 'POST') {
        const result = room.removePupil(pupilId);
        if (!result.ok) return H.sendJson(res, 404, { error: result.message });
        pushTeachers(room);
        return H.sendJson(res, 200, { ok: true, dashboard: room.dashboard() });
      }
      if (sub === '/mode' && method === 'POST') {
        const parsed = await H.readJsonBody(req);
        if (!parsed.ok) return H.sendJson(res, parsed.tooLarge ? 413 : 400, { error: parsed.error });
        const result = room.setPupilMode(pupilId, parsed.body);
        if (!result.ok) return H.sendJson(res, 404, { error: result.message });
        pushPupil(result.pupil);
        pushTeachers(room);
        return H.sendJson(res, 200, { ok: true });
      }
      return H.sendJson(res, 404, { error: 'Unknown pupil endpoint.' });
    }

    // CSV exports. English and game results are separate files.
    const exportMatch = rest.match(/^\/export\/([a-z-]+)\.csv$/);
    if (exportMatch && method === 'GET') {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const kind = exportMatch[1];
      const files = {
        'english-summary': () => csv.englishSummaryCsv(room),
        'english-answers': () => csv.englishAnswersCsv(room),
        'game-results': () => csv.gameResultsCsv(room),
      };
      if (!files[kind]) return H.sendJson(res, 404, { error: 'Unknown export.' });
      const filename = csv.safeFilename(`${kind}-${room.code}-${stamp}`) + '.csv';
      return H.sendDownload(res, filename, files[kind](), 'text/csv; charset=utf-8');
    }

    return H.sendJson(res, 404, { error: 'Unknown teacher endpoint.' });
  }

  // -- timers --------------------------------------------------------------

  const timers = [];

  function startTimers() {
    timers.push(
      setInterval(() => {
        const now = Date.now();
        for (const room of manager.list()) {
          const result = room.tick(now);
          if (result.ended) {
            pushRoom(room);
            continue;
          }
          for (const pupil of result.changed) pushPupil(pupil);
          if (result.changed.length > 0) pushTeachers(room);
        }
      }, TICK_INTERVAL_MS)
    );

    timers.push(
      setInterval(() => {
        // Keep intermediaries from closing idle streams, and refresh the
        // dashboard so lesson countdowns stay live.
        for (const room of manager.list()) {
          for (const pupil of room.pupilList()) {
            if (pupil.channel) pupil.channel.comment();
          }
          for (const channel of room.teacherChannels) channel.comment();
          pushTeachers(room);
        }
      }, KEEPALIVE_INTERVAL_MS)
    );

    timers.push(
      setInterval(() => {
        auth.pruneSessions();
        loginLimiter.prune();
        joinLimiter.prune();
        actionLimiter.prune();
        const pruned = manager.prune();
        if (pruned > 0) {
          for (const [token, session] of pupilSessions) {
            if (!manager.get(session.roomCode)) pupilSessions.delete(token);
          }
        }
      }, 5 * 60 * 1000)
    );

    for (const timer of timers) if (timer.unref) timer.unref();
  }

  function stopTimers() {
    for (const timer of timers) clearInterval(timer);
    timers.length = 0;
    for (const entry of teacherPushState.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    teacherPushState.clear();
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('Request failed:', req.method, req.url, err && err.message);
      if (!res.headersSent) H.sendJson(res, 500, { error: 'Something went wrong on the server.' });
      else res.destroy();
    });
  });

  // Long-lived SSE streams must not be cut by the default socket timeouts.
  server.keepAliveTimeout = 65 * 1000;
  server.headersTimeout = 70 * 1000;
  server.requestTimeout = 0;

  return {
    server,
    manager,
    store,
    auth,
    config,
    pupilSessions,
    startTimers,
    stopTimers,
    buildQr,
    joinUrl,
    resolveBaseUrl: (req) => resolveBaseUrl(config, req),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main() {
  const config = readConfig();
  const app = createApp(config);
  app.startTimers();

  app.server.listen(config.port, '0.0.0.0', () => {
    const base = config.publicBaseUrl || `http://localhost:${config.port}`;
    console.log('Merge Mystery: The Missing Festival');
    console.log(`  listening on port ${config.port}`);
    console.log(`  pupil app:         ${base}/`);
    console.log(`  teacher dashboard: ${base}/teacher`);
    console.log(`  questions loaded:  ${app.store.count()}`);
    if (!config.publicBaseUrl) {
      console.warn(
        '  WARNING: PUBLIC_BASE_URL is not set. QR codes will use the address of ' +
          'the request, which is wrong if you open the dashboard on localhost.'
      );
    }
    if (!app.auth.status().configured) {
      console.warn('  WARNING: TEACHER_PASSWORD is not set. The dashboard cannot be opened.');
    } else if (app.auth.status().weakPassword) {
      console.warn('  WARNING: TEACHER_PASSWORD is shorter than 8 characters.');
    }
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down.`);
    app.stopTimers();
    app.server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) main();

module.exports = { createApp, readConfig, resolveBaseUrl, isLocalBase };
