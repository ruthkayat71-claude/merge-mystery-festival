'use strict';
/**
 * Teacher authentication.
 *
 * The password is supplied privately through the TEACHER_PASSWORD environment
 * variable and is never written to logs, never sent to any client, and never
 * stored in the repository. Sessions are random opaque tokens held in memory.
 */

const crypto = require('node:crypto');

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // one long school day
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 10 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

/** Hash a password with a fresh random salt. Returns "scrypt$salt$hash". */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Constant-time verification against a stored "scrypt$salt$hash" string. */
function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[1], 'hex');
    expected = Buffer.from(parts[2], 'hex');
  } catch {
    return false;
  }
  if (expected.length !== SCRYPT_KEYLEN) return false;

  let derived;
  try {
    derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  } catch {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

class TeacherAuth {
  /**
   * @param {{password?: string, passwordHash?: string}} config
   */
  constructor(config = {}) {
    this.sessions = new Map(); // token -> { createdAt, expiresAt, label }
    this.attempts = new Map(); // ip -> { count, firstAt, lockedUntil }
    this.configured = false;
    this.weakPassword = false;

    if (config.passwordHash) {
      this.passwordHash = config.passwordHash;
      this.configured = true;
    } else if (config.password) {
      if (config.password.length < MIN_PASSWORD_LENGTH) this.weakPassword = true;
      this.passwordHash = hashPassword(config.password);
      this.configured = true;
    } else {
      this.passwordHash = null;
    }
  }

  /** True when a login attempt from this client should be refused outright. */
  isLockedOut(clientKey, now = Date.now()) {
    const record = this.attempts.get(clientKey);
    if (!record) return false;
    if (record.lockedUntil && record.lockedUntil > now) return true;
    if (record.lockedUntil && record.lockedUntil <= now) {
      this.attempts.delete(clientKey);
    }
    return false;
  }

  noteFailure(clientKey, now = Date.now()) {
    const record = this.attempts.get(clientKey) || { count: 0, firstAt: now, lockedUntil: 0 };
    if (now - record.firstAt > LOCKOUT_MS) {
      record.count = 0;
      record.firstAt = now;
    }
    record.count++;
    if (record.count >= MAX_ATTEMPTS) record.lockedUntil = now + LOCKOUT_MS;
    this.attempts.set(clientKey, record);
    return record;
  }

  /**
   * @returns {{ok: true, token: string, expiresAt: number}
   *           | {ok: false, reason: string, message: string, retryAfterMs?: number}}
   */
  login(password, clientKey = 'unknown', now = Date.now()) {
    if (!this.configured) {
      return {
        ok: false,
        reason: 'not-configured',
        message:
          'No teacher password is set on the server. Add the TEACHER_PASSWORD environment variable.',
      };
    }
    // The password is checked first, on purpose.
    //
    // A school normally presents one public IP for every device, so a pupil
    // making wrong guesses would otherwise lock the teacher out of their own
    // dashboard. Checking first means the correct password always works. Guess
    // rate is still held down by the per-request rate limiter in the server and
    // by scrypt, which makes each attempt deliberately slow.
    const correct = verifyPassword(password || '', this.passwordHash);

    if (!correct) {
      const record = this.noteFailure(clientKey, now);
      if (record.lockedUntil && record.lockedUntil > now) {
        return {
          ok: false,
          reason: 'locked-out',
          message: 'Too many wrong tries from this network. Please wait a few minutes.',
          retryAfterMs: record.lockedUntil - now,
        };
      }
      return { ok: false, reason: 'bad-password', message: 'That password is not correct.' };
    }

    this.attempts.delete(clientKey);
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = now + SESSION_TTL_MS;
    this.sessions.set(token, { createdAt: now, expiresAt });
    return { ok: true, token, expiresAt };
  }

  /** @returns {boolean} whether the token is a live teacher session. */
  isValidSession(token, now = Date.now()) {
    if (typeof token !== 'string' || token.length < 20) return false;
    const session = this.sessions.get(token);
    if (!session) return false;
    if (session.expiresAt <= now) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  logout(token) {
    return this.sessions.delete(token);
  }

  pruneSessions(now = Date.now()) {
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
  }

  /** Safe status for the login page. Reveals nothing about the password. */
  status() {
    return { configured: this.configured, weakPassword: this.weakPassword };
  }
}

module.exports = { TeacherAuth, hashPassword, verifyPassword, MIN_PASSWORD_LENGTH, SESSION_TTL_MS };
