'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { escapeCell, toCsv, safeFilename } = require('../server/csv');
const { TeacherAuth, hashPassword, verifyPassword } = require('../server/auth');
const { validateNickname, buildQueue, RoomManager, ROUND_LENGTH_CHOICES } = require('../server/rooms');
const { QuestionStore } = require('../server/questionStore');

// ---------------------------------------------------------------------------
// CSV safety
// ---------------------------------------------------------------------------

test('cells that a spreadsheet would run as a formula are neutralised', () => {
  const dangerous = [
    '=1+1',
    '=cmd|\' /C calc\'!A0',
    '+1-1',
    '-2+3',
    '@SUM(A1:A9)',
    '|echo hi',
    '\tstarts with tab',
    '\rstarts with return',
  ];
  for (const value of dangerous) {
    const cell = escapeCell(value);
    const inner = cell.startsWith('"') ? cell.slice(1, -1) : cell;
    assert.strictEqual(inner[0], "'", `"${value}" should be prefixed with an apostrophe, got ${cell}`);
  }
});

test('ordinary values are left readable', () => {
  assert.strictEqual(escapeCell('Mali'), 'Mali');
  assert.strictEqual(escapeCell(12), '12');
  assert.strictEqual(escapeCell(''), '');
  assert.strictEqual(escapeCell(null), '');
  assert.strictEqual(escapeCell('\u0e21\u0e32\u0e25\u0e35'), '\u0e21\u0e32\u0e25\u0e35');
  assert.strictEqual(escapeCell('I am fine, thank you'), '"I am fine, thank you"');
  assert.strictEqual(escapeCell('she said "hello"'), '"she said ""hello"""');
});

test('newlines inside an answer cannot break the row structure', () => {
  const csv = toCsv(['a', 'b'], [['line one\nline two', 'ok']]);
  const lines = csv.replace(/^\ufeff/, '').split('\r\n').filter(Boolean);
  assert.strictEqual(lines.length, 2, 'header plus exactly one data row');
  assert.ok(lines[1].startsWith('"line one'));
});

test('the export carries a UTF-8 BOM so Thai names open correctly', () => {
  const csv = toCsv(['name'], [['\u0e21\u0e32\u0e25\u0e35']]);
  assert.strictEqual(csv.charCodeAt(0), 0xfeff);
});

test('download filenames cannot carry path or traversal characters', () => {
  const traversal = safeFilename('../../etc/passwd');
  assert.ok(!traversal.includes('/'), 'no slashes');
  assert.ok(!traversal.includes('..'), 'no parent-directory sequence');
  assert.ok(!/^[.-]/.test(traversal), 'does not start with a dot or dash');
  assert.strictEqual(safeFilename('english-summary-ABC123'), 'english-summary-ABC123');
  assert.ok(!safeFilename('a"b;c').includes('"'));
  assert.strictEqual(safeFilename('///'), 'export', 'falls back to a safe default');
});

// ---------------------------------------------------------------------------
// Password handling
// ---------------------------------------------------------------------------

test('password hashes are salted, so the same password hashes differently', () => {
  const a = hashPassword('festival-2026');
  const b = hashPassword('festival-2026');
  assert.notStrictEqual(a, b, 'a fresh salt is used each time');
  assert.ok(verifyPassword('festival-2026', a));
  assert.ok(verifyPassword('festival-2026', b));
  assert.ok(!verifyPassword('festival-2027', a));
});

test('verification refuses malformed stored hashes instead of throwing', () => {
  for (const bad of ['', 'nonsense', 'scrypt$only-two', 'md5$aa$bb', null, undefined]) {
    assert.strictEqual(verifyPassword('anything', bad), false);
  }
});

test('a session token is opaque, long and not derived from the password', () => {
  const auth = new TeacherAuth({ password: 'festival-2026' });
  const result = auth.login('festival-2026', 'ip1');
  assert.ok(result.ok);
  assert.ok(result.token.length >= 40, 'token is long');
  assert.ok(!result.token.includes('festival'), 'token reveals nothing about the password');
  assert.ok(auth.isValidSession(result.token));
});

test('sessions expire and can be signed out', () => {
  const auth = new TeacherAuth({ password: 'festival-2026' });
  const { token } = auth.login('festival-2026', 'ip1');
  assert.ok(auth.isValidSession(token));

  auth.logout(token);
  assert.ok(!auth.isValidSession(token), 'signing out kills the session');

  const second = auth.login('festival-2026', 'ip1');
  const farFuture = Date.now() + 9 * 60 * 60 * 1000;
  assert.ok(!auth.isValidSession(second.token, farFuture), 'sessions do not live forever');
});

test('a forged or empty token is never a valid session', () => {
  const auth = new TeacherAuth({ password: 'festival-2026' });
  for (const bad of ['', 'x', 'a'.repeat(64), null, undefined, 123, {}]) {
    assert.strictEqual(auth.isValidSession(bad), false);
  }
});

test('a short password is flagged without being revealed', () => {
  const auth = new TeacherAuth({ password: 'short1' });
  const status = auth.status();
  assert.strictEqual(status.weakPassword, true);
  assert.strictEqual(status.configured, true);
  assert.ok(!JSON.stringify(status).includes('short1'));
});

test('a pre-computed hash can be supplied instead of a plaintext password', () => {
  const stored = hashPassword('from-the-hash-tool');
  const auth = new TeacherAuth({ passwordHash: stored });
  assert.ok(auth.login('from-the-hash-tool', 'ip1').ok);
  assert.ok(!auth.login('wrong', 'ip1').ok);
});

// ---------------------------------------------------------------------------
// Nicknames
// ---------------------------------------------------------------------------

test('nicknames accept Thai, Latin and digits but refuse markup and links', () => {
  const good = ['Mali', 'Nok 2', '\u0e21\u0e32\u0e25\u0e35', '\u0e19\u0e49\u0e2d\u0e07', 'A_b-c.d', 'P4 Dao'];
  for (const name of good) {
    assert.ok(validateNickname(name).ok, `"${name}" should be allowed`);
  }
  const bad = ['', '  ', '<b>x</b>', 'see www.example.com', 'http://x.y', 'a'.repeat(17), 'q"q', "o'o", 'a/b', 'a\\b', 'x&y'];
  for (const name of bad) {
    assert.ok(!validateNickname(name).ok, `"${name}" should be refused`);
  }
});

test('nickname whitespace is tidied up', () => {
  assert.strictEqual(validateNickname('  Mali   Dao  ').nickname, 'Mali Dao');
});

// ---------------------------------------------------------------------------
// Question queue
// ---------------------------------------------------------------------------

test('the question queue runs easy to hard and uses every question once', () => {
  const store = new QuestionStore();
  const queue = buildQueue(store.all(), 12345);
  assert.strictEqual(queue.length, store.count(), 'every question appears');
  assert.strictEqual(new Set(queue).size, queue.length, 'no duplicates');

  const difficulties = queue.map((id) => store.get(id).difficulty);
  for (let i = 1; i < difficulties.length; i++) {
    assert.ok(difficulties[i] >= difficulties[i - 1], 'difficulty never goes backwards');
  }
  assert.strictEqual(difficulties[0], 1);
  assert.strictEqual(difficulties[difficulties.length - 1], 5);
});

test('two pupils get different orders within the same difficulty band', () => {
  const store = new QuestionStore();
  const a = buildQueue(store.all(), 111);
  const b = buildQueue(store.all(), 999);
  assert.notDeepStrictEqual(a, b, 'the order is per-pupil');
  assert.deepStrictEqual(a.slice().sort(), b.slice().sort(), 'same questions, different order');
});

// ---------------------------------------------------------------------------
// Room codes
// ---------------------------------------------------------------------------

test('room codes are unique and avoid easily-confused characters', () => {
  const manager = new RoomManager(new QuestionStore());
  const codes = new Set();
  for (let i = 0; i < 400; i++) {
    const room = manager.create();
    assert.match(room.code, /^[A-Z0-9]{6}$/);
    // Pupils read this off a TV and type it on a phone, so the alphabet must
    // exclude each pair that looks alike: O/0, I/1, S/5, Z/2, B/8.
    assert.ok(
      !/[OI015SZB]/.test(room.code),
      `code ${room.code} contains an easily-confused character`
    );
    assert.ok(!codes.has(room.code), 'codes do not collide');
    codes.add(room.code);
  }
});

test('rooms are found case-insensitively and pruned when old', () => {
  const manager = new RoomManager(new QuestionStore());
  const room = manager.create();
  assert.strictEqual(manager.get(room.code.toLowerCase()), room);
  assert.strictEqual(manager.get(` ${room.code} `), room);
  assert.strictEqual(manager.get('NOPE12'), undefined);
  assert.strictEqual(manager.get(null), undefined);

  room.endedAt = Date.now() - 48 * 60 * 60 * 1000;
  assert.strictEqual(manager.prune(), 1);
  assert.strictEqual(manager.get(room.code), undefined);
});

test('the teacher-adjustable round lengths are exactly the four requested', () => {
  assert.deepStrictEqual(ROUND_LENGTH_CHOICES, [30, 45, 60, 90]);
});

// ---------------------------------------------------------------------------
// Question store
// ---------------------------------------------------------------------------

test('editing the store never mutates the shipped bank', () => {
  const { QUESTIONS } = require('../server/questions');
  const original = QUESTIONS.find((q) => q.id === 'g-001').prompt;
  const store = new QuestionStore();
  store.update('g-001', { prompt: 'Changed prompt for this room?' });
  assert.strictEqual(store.get('g-001').prompt, 'Changed prompt for this room?');
  assert.strictEqual(
    QUESTIONS.find((q) => q.id === 'g-001').prompt,
    original,
    'the module-level bank is untouched'
  );
});

test('the store exports valid JSON that still passes validation', () => {
  const store = new QuestionStore();
  const parsed = JSON.parse(store.exportJson());
  assert.ok(Array.isArray(parsed));
  assert.strictEqual(parsed.length, store.count());
  const reloaded = new QuestionStore(parsed);
  assert.deepStrictEqual(reloaded.validateAll(), []);
});
