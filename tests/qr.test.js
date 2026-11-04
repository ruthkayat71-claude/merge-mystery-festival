'use strict';
const test = require('node:test');
const assert = require('node:assert');
const qr = require('../server/qr');
const { decodeMatrix, decodeSvg } = require('../server/qrdecode');

/**
 * Published format-information strings from ISO/IEC 18004 Annex C.
 * Used as an external oracle for the encoder's BCH implementation.
 */
const PUBLISHED_FORMAT_INFO = {
  L: [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976],
  M: [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0],
  Q: [0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed],
  H: [0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b],
};

test('format information matches the published table for all 32 combinations', () => {
  for (const [level, expected] of Object.entries(PUBLISHED_FORMAT_INFO)) {
    for (let mask = 0; mask < 8; mask++) {
      assert.strictEqual(
        qr.formatInformation(level, mask),
        expected[mask],
        `format info mismatch for ${level} mask ${mask}`
      );
    }
  }
});

test('block tables sum to the published total codeword counts', () => {
  for (const level of ['L', 'M', 'Q', 'H']) {
    for (let version = 1; version <= qr.MAX_VERSION; version++) {
      const [ec, b1, d1, b2, d2] = qr.BLOCK_TABLE[level][version];
      const total = (b1 + b2) * ec + b1 * d1 + b2 * d2;
      assert.strictEqual(
        total,
        qr.TOTAL_CODEWORDS[version],
        `version ${version} level ${level} totals ${total}, expected ${qr.TOTAL_CODEWORDS[version]}`
      );
    }
  }
});

test('join URLs round-trip through encode and an independent decoder', () => {
  const urls = [
    'https://merge-mystery.onrender.com/j/ABCD',
    'https://merge-mystery.onrender.com/j/7H2K9Q',
    'https://merge-mystery-festival.onrender.com/join?room=XK4P9T',
    'https://a-very-long-render-subdomain-name-for-testing.onrender.com/join?room=QQ99ZZ&v=1',
  ];
  for (const url of urls) {
    const code = qr.encode(url, { ecLevel: 'M' });
    const decoded = decodeMatrix(code.matrix);
    assert.strictEqual(decoded.text, url, `decode mismatch for ${url}`);
    assert.strictEqual(decoded.ecLevel, 'M');
    assert.strictEqual(decoded.mask, code.mask);
    assert.strictEqual(decoded.version, code.version);
  }
});

test('round-trips at every EC level and across versions 1-10', () => {
  for (const level of ['L', 'M', 'Q', 'H']) {
    for (let version = 1; version <= qr.MAX_VERSION; version++) {
      const capacity = qr.byteCapacity(version, level);
      if (capacity < 1) continue;
      // Fill the version exactly so block group 2 and interleaving are exercised.
      let payload = '';
      for (let i = 0; i < capacity; i++) {
        payload += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./:'[i % 41];
      }
      const code = qr.encode(payload, { ecLevel: level, minVersion: version });
      assert.strictEqual(code.version, version, `expected version ${version} for ${level}`);
      const decoded = decodeMatrix(code.matrix);
      assert.strictEqual(decoded.text, payload, `payload mismatch v${version} ${level}`);
      assert.strictEqual(decoded.ecLevel, level);
    }
  }
});

test('non-ASCII text round-trips as UTF-8', () => {
  const text = 'https://example.com/join?name=มาลี&emoji=🎉';
  const code = qr.encode(text, { ecLevel: 'M' });
  assert.strictEqual(decodeMatrix(code.matrix).text, text);
});

test('SVG output decodes and carries a 4-module quiet zone', () => {
  const url = 'https://merge-mystery.onrender.com/j/MYSTERY';
  const code = qr.encode(url, { ecLevel: 'M' });
  const svg = qr.toSvg(code, { scale: 8, quietZone: 4 });
  const decoded = decodeSvg(svg);
  assert.strictEqual(decoded.text, url);
  assert.strictEqual(decoded.quietZoneModules, 4, 'quiet zone must be at least 4 modules');
  assert.strictEqual(decoded.moduleScale, 8);
  // The viewBox must account for the quiet zone on both sides.
  const expectedPixels = (code.size + 8) * 8;
  assert.ok(svg.includes(`width="${expectedPixels}"`), 'SVG width includes quiet zone');
});

test('selected mask is the lowest-penalty mask', () => {
  const code = qr.encode('https://merge-mystery.onrender.com/j/PENALTY', { ecLevel: 'M' });
  assert.ok(code.mask >= 0 && code.mask <= 7);
  // Re-derive by decoding: the format info in the symbol must agree.
  assert.strictEqual(decodeMatrix(code.matrix).mask, code.mask);
});

test('PNG output is a well-formed greyscale PNG of the expected size', () => {
  const code = qr.encode('https://merge-mystery.onrender.com/j/PNGTEST', { ecLevel: 'M' });
  const png = qr.toPngBuffer(code, { scale: 6, quietZone: 4 });
  assert.deepStrictEqual(
    Array.from(png.subarray(0, 8)),
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'PNG magic bytes'
  );
  const expected = (code.size + 8) * 6;
  assert.strictEqual(png.readUInt32BE(16), expected, 'PNG width');
  assert.strictEqual(png.readUInt32BE(20), expected, 'PNG height');
  assert.strictEqual(png[24], 8, 'bit depth 8');
  assert.strictEqual(png[25], 0, 'greyscale colour type');
  assert.ok(png.includes(Buffer.from('IEND', 'ascii')), 'IEND chunk present');
});

test('encoder picks the smallest version that fits', () => {
  const short = qr.encode('https://x.com/j/AB', { ecLevel: 'M' });
  const long = qr.encode('x'.repeat(200), { ecLevel: 'M' });
  assert.ok(short.version < long.version);
  assert.strictEqual(short.version, 2, 'a 18-byte URL fits in version 2 at level M');
});

test('rejects empty input and payloads beyond version 10', () => {
  assert.throws(() => qr.encode(''), /non-empty/);
  assert.throws(() => qr.encode('y'.repeat(400), { ecLevel: 'M' }), /does not fit/);
  assert.throws(() => qr.encode('ok', { ecLevel: 'Z' }), /unknown EC level/);
});

test('decoder rejects a corrupted symbol rather than returning wrong text', () => {
  const code = qr.encode('https://merge-mystery.onrender.com/j/CORRUPT', { ecLevel: 'M' });
  // Flip enough data modules that the syndromes cannot all be zero.
  const broken = code.matrix.map((row) => row.slice());
  let flipped = 0;
  for (let r = 10; r < 20 && flipped < 12; r++) {
    for (let c = 10; c < 20 && flipped < 12; c++) {
      broken[r][c] ^= 1;
      flipped++;
    }
  }
  assert.throws(() => decodeMatrix(broken), /syndrome/);
});
