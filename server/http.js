'use strict';
/**
 * Small HTTP helpers: body parsing, cookies, JSON replies, static files and
 * Server-Sent Event channels. Written against node:http with no dependencies.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_BODY_BYTES = 64 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Read and JSON-parse a request body, with a hard size limit. */
function readJsonBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    let tooLarge = false;

    // An over-sized body is drained and discarded rather than destroying the
    // socket. Destroying it mid-upload means the client sees a network error
    // instead of the explanation we want to give it.
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) tooLarge = true;

    req.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) {
        resolve({ ok: false, error: 'Request body too large.', tooLarge: true });
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.trim() === '') return resolve({ ok: true, body: {} });
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return resolve({ ok: false, error: 'Request body must be a JSON object.' });
        }
        resolve({ ok: true, body: parsed });
      } catch {
        resolve({ ok: false, error: 'Request body is not valid JSON.' });
      }
    });
    req.on('error', () => {
      resolve({ ok: false, error: 'Could not read the request.' });
    });
    req.on('aborted', () => {
      resolve({ ok: false, error: 'Could not read the request.' });
    });
  });
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/** True when the original client request arrived over HTTPS. */
function isSecureRequest(req) {
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim() === 'https';
  }
  return Boolean(req.socket && req.socket.encrypted);
}

function buildCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function appendCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) res.setHeader('Set-Cookie', [cookie]);
  else if (Array.isArray(existing)) res.setHeader('Set-Cookie', [...existing, cookie]);
  else res.setHeader('Set-Cookie', [existing, cookie]);
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Everything is served from this origin; no external scripts, fonts or
  // images are used, so the policy can stay tight.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; '),
};

function applySecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}

const zlib = require('node:zlib');

/** Smallest payload worth compressing; below this the headers cost more. */
const COMPRESS_THRESHOLD = 1024;

/**
 * Pick a compression the client accepts.
 *
 * Text payloads shrink by roughly 70%, which is the difference between a
 * sluggish and a snappy first load on shared classroom Wi-Fi.
 */
function chooseEncoding(req) {
  const accepted = String((req && req.headers && req.headers['accept-encoding']) || '').toLowerCase();
  if (accepted.includes('br')) return 'br';
  if (accepted.includes('gzip')) return 'gzip';
  if (accepted.includes('deflate')) return 'deflate';
  return null;
}

function compressSync(buffer, encoding) {
  if (encoding === 'br') {
    return zlib.brotliCompressSync(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length,
      },
    });
  }
  if (encoding === 'gzip') return zlib.gzipSync(buffer, { level: 6 });
  return zlib.deflateSync(buffer, { level: 6 });
}

/**
 * Write a body, compressing it when the client allows and it is worth it.
 * `req` may be omitted, in which case the body is sent uncompressed.
 */
function sendBody(req, res, status, buffer, contentType, headers = {}, headersOnly = false) {
  const encoding = buffer.length >= COMPRESS_THRESHOLD ? chooseEncoding(req) : null;
  let payload = buffer;
  const finalHeaders = { 'Content-Type': contentType, ...headers };

  if (encoding) {
    try {
      payload = compressSync(buffer, encoding);
      finalHeaders['Content-Encoding'] = encoding;
      finalHeaders.Vary = finalHeaders.Vary ? `${finalHeaders.Vary}, Accept-Encoding` : 'Accept-Encoding';
    } catch {
      payload = buffer; // fall back to the plain body
    }
  }
  finalHeaders['Content-Length'] = payload.length;
  res.writeHead(status, finalHeaders);
  if (headersOnly) res.end();
  else res.end(payload);
}

function sendJson(res, status, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  // `res.req` is set by node:http, so JSON replies get compressed too.
  sendBody(res.req, res, status, body, 'application/json; charset=utf-8', {
    'Cache-Control': 'no-store',
    ...headers,
  });
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function sendBuffer(res, status, buffer, contentType, headers = {}) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    ...headers,
  });
  res.end(buffer);
}

function sendDownload(res, filename, body, contentType) {
  // Downloads are sent uncompressed so the saved file is exactly these bytes.
  const buffer = Buffer.from(body, 'utf8');
  sendBuffer(res, 200, buffer, contentType, {
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
}

/**
 * Serve a file from a fixed root, refusing any path that escapes it.
 */
async function serveStatic(req, res, root, urlPath, options = {}) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    sendText(res, 400, 'Bad request');
    return true;
  }
  if (decoded.includes('\u0000')) {
    sendText(res, 400, 'Bad request');
    return true;
  }

  const relative = decoded.replace(/^\/+/, '');
  const resolved = path.resolve(root, relative);
  const rootResolved = path.resolve(root);
  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    sendText(res, 403, 'Forbidden');
    return true;
  }

  let stat;
  try {
    stat = await fsp.stat(resolved);
  } catch {
    return false;
  }
  if (stat.isDirectory()) return false;

  const extension = path.extname(resolved).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  const etag = `W/"${stat.size}-${Number(stat.mtimeMs).toString(36)}"`;

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return true;
  }

  const cacheControl = options.cacheControl || 'public, max-age=60, must-revalidate';
  const baseHeaders = { ETag: etag, 'Cache-Control': cacheControl };

  // Text assets are small enough to read and compress in one go; images and
  // fonts are already compressed, so they stream straight through.
  const isText = /^(text\/|application\/(json|manifest))/.test(contentType);
  if (isText && stat.size < 2 * 1024 * 1024) {
    const buffer = await fsp.readFile(resolved);
    // HEAD goes through the same path so the headers it reports, including
    // Content-Encoding and Content-Length, match what a GET would send.
    sendBody(req, res, 200, buffer, contentType, baseHeaders, req.method === 'HEAD');
    return true;
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size, ...baseHeaders });
    res.end();
    return true;
  }

  res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': stat.size, ...baseHeaders });
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(resolved);
    stream.on('error', reject);
    stream.on('close', resolve);
    stream.pipe(res);
  }).catch(() => res.destroy());
  return true;
}

// ---------------------------------------------------------------------------
// Server-Sent Events
// ---------------------------------------------------------------------------

/**
 * One SSE connection.
 *
 * SSE is used instead of WebSockets because EventSource reconnects by itself
 * after the short network drops that classroom Wi-Fi produces, and because it
 * needs no extra dependency.
 */
class Channel {
  constructor(req, res) {
    this.id = crypto.randomBytes(8).toString('hex');
    this.req = req;
    this.res = res;
    this.closed = false;
    this.openedAt = Date.now();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stops nginx-style proxies from buffering the stream.
      'X-Accel-Buffering': 'no',
    });
    // Tell EventSource how soon to come back after a drop.
    res.write('retry: 3000\n\n');

    const onClose = () => this.markClosed();
    req.on('close', onClose);
    req.on('aborted', onClose);
    res.on('close', onClose);
    res.on('error', onClose);
  }

  markClosed() {
    if (this.closed) return;
    this.closed = true;
    if (typeof this.onClose === 'function') this.onClose(this);
  }

  send(event, data) {
    if (this.closed || this.res.writableEnded) return false;
    try {
      const payload = JSON.stringify(data);
      // A payload must never contain a raw newline inside a data: line.
      this.res.write(`event: ${event}\ndata: ${payload}\n\n`);
      return true;
    } catch {
      this.markClosed();
      return false;
    }
  }

  comment(text = 'keep-alive') {
    if (this.closed || this.res.writableEnded) return false;
    try {
      this.res.write(`: ${text}\n\n`);
      return true;
    } catch {
      this.markClosed();
      return false;
    }
  }

  close() {
    if (this.closed) return;
    try {
      this.res.end();
    } catch {
      /* already gone */
    }
    this.markClosed();
  }
}

/** Fixed-window rate limiter, keyed by client address and route. */
class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.buckets = new Map();
  }

  check(key, now = Date.now()) {
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.start >= this.windowMs) {
      this.buckets.set(key, { start: now, count: 1 });
      return { allowed: true, remaining: this.limit - 1 };
    }
    bucket.count++;
    if (bucket.count > this.limit) {
      return { allowed: false, retryAfterMs: bucket.start + this.windowMs - now };
    }
    return { allowed: true, remaining: this.limit - bucket.count };
  }

  prune(now = Date.now()) {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.start >= this.windowMs * 2) this.buckets.delete(key);
    }
  }
}

/** Best-effort client identity for rate limiting behind a proxy. */
function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

module.exports = {
  readJsonBody,
  parseCookies,
  isSecureRequest,
  buildCookie,
  appendCookie,
  applySecurityHeaders,
  sendJson,
  sendText,
  sendBody,
  chooseEncoding,
  sendBuffer,
  sendDownload,
  serveStatic,
  Channel,
  RateLimiter,
  clientKey,
  escapeHtml,
  MIME_TYPES,
  MAX_BODY_BYTES,
  SECURITY_HEADERS,
};
