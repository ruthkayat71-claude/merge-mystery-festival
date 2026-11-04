'use strict';
/**
 * Zero-dependency QR Code encoder (ISO/IEC 18004).
 *
 * Supports byte mode, versions 1-10, EC levels L/M/Q/H.
 * That covers any join URL we generate (up to 271 bytes at level M).
 *
 * Output is a boolean module matrix; renderers (SVG / PNG) live below.
 * A matching decoder used only by the test suite lives in tests/qr-decode.js,
 * so encode -> decode round-trips are checked independently of this file.
 */

// ---------------------------------------------------------------------------
// Static tables from the specification
// ---------------------------------------------------------------------------

/** Total codewords (data + error correction) per version. Index 0 unused. */
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/**
 * Block structure per version and EC level.
 * [ecCodewordsPerBlock, blocksGroup1, dataCodewordsGroup1, blocksGroup2, dataCodewordsGroup2]
 */
const BLOCK_TABLE = {
  L: [
    null,
    [7, 1, 19, 0, 0],
    [10, 1, 34, 0, 0],
    [15, 1, 55, 0, 0],
    [20, 1, 80, 0, 0],
    [26, 1, 108, 0, 0],
    [18, 2, 68, 0, 0],
    [20, 2, 78, 0, 0],
    [24, 2, 97, 0, 0],
    [30, 2, 116, 0, 0],
    [18, 2, 68, 2, 69],
  ],
  M: [
    null,
    [10, 1, 16, 0, 0],
    [16, 1, 28, 0, 0],
    [26, 1, 44, 0, 0],
    [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0],
    [18, 4, 31, 0, 0],
    [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37],
    [26, 4, 43, 1, 44],
  ],
  Q: [
    null,
    [13, 1, 13, 0, 0],
    [22, 1, 22, 0, 0],
    [18, 2, 17, 0, 0],
    [26, 2, 24, 0, 0],
    [18, 2, 15, 2, 16],
    [24, 4, 19, 0, 0],
    [18, 2, 14, 4, 15],
    [22, 4, 18, 2, 19],
    [20, 4, 16, 4, 17],
    [24, 6, 19, 2, 20],
  ],
  H: [
    null,
    [17, 1, 9, 0, 0],
    [28, 1, 16, 0, 0],
    [22, 2, 13, 0, 0],
    [16, 4, 9, 0, 0],
    [22, 2, 11, 2, 12],
    [28, 4, 15, 0, 0],
    [26, 4, 13, 1, 14],
    [26, 4, 14, 2, 15],
    [24, 4, 12, 4, 13],
    [28, 6, 15, 2, 16],
  ],
};

/** Row/column centres of alignment patterns, per version. */
const ALIGNMENT_CENTRES = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Pre-computed BCH(18,6) version information, versions 7-10. */
const VERSION_INFO = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

/** Two-bit EC level indicator used inside the format information. */
const EC_INDICATOR = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

const EC_LEVELS = ['L', 'M', 'Q', 'H'];
const MAX_VERSION = 10;

// ---------------------------------------------------------------------------
// GF(256) arithmetic for Reed-Solomon, primitive polynomial 0x11d
// ---------------------------------------------------------------------------

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function buildGaloisTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Generator polynomial of the given degree, coefficients high-order first. */
function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Error-correction codewords for one data block. */
function rsEncodeBlock(data, ecCount) {
  const generator = rsGeneratorPoly(ecCount);
  const remainder = new Array(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    if (factor !== 0) {
      for (let i = 0; i < ecCount; i++) {
        remainder[i] ^= gfMul(generator[i + 1], factor);
      }
    }
  }
  return remainder;
}

// ---------------------------------------------------------------------------
// BCH codes for format and version information
// ---------------------------------------------------------------------------

function bchRemainder(value, generator, generatorBitLength) {
  let remainder = value;
  const shift = generatorBitLength - 1;
  while (bitLength(remainder) > shift) {
    remainder ^= generator << (bitLength(remainder) - generatorBitLength);
  }
  return remainder;
}

function bitLength(value) {
  let length = 0;
  while (value !== 0) {
    length++;
    value >>>= 1;
  }
  return length;
}

/** 15-bit format information for an EC level + mask pattern. */
function formatInformation(ecLevel, mask) {
  const data = (EC_INDICATOR[ecLevel] << 3) | mask;
  const remainder = bchRemainder(data << 10, 0b10100110111, 11);
  return ((data << 10) | remainder) ^ 0b101010000010010;
}

// ---------------------------------------------------------------------------
// Bit buffer
// ---------------------------------------------------------------------------

class BitBuffer {
  constructor() {
    this.bits = [];
  }
  put(value, length) {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }
  get length() {
    return this.bits.length;
  }
  toCodewords() {
    const bits = this.bits;
    const out = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0);
      out.push(byte);
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Capacity helpers
// ---------------------------------------------------------------------------

function dataCodewordCount(version, ecLevel) {
  const [ecPerBlock, blocks1, data1, blocks2, data2] = BLOCK_TABLE[ecLevel][version];
  void ecPerBlock;
  return blocks1 * data1 + blocks2 * data2;
}

/** Bits used by the byte-mode character count field. */
function charCountBits(version) {
  return version <= 9 ? 8 : 16;
}

/** Maximum UTF-8 byte payload for a version/EC level in byte mode. */
function byteCapacity(version, ecLevel) {
  const totalBits = dataCodewordCount(version, ecLevel) * 8;
  const overhead = 4 + charCountBits(version);
  return Math.max(0, Math.floor((totalBits - overhead) / 8));
}

function chooseVersion(byteLength, ecLevel, minVersion = 1) {
  for (let version = Math.max(1, minVersion); version <= MAX_VERSION; version++) {
    if (byteCapacity(version, ecLevel) >= byteLength) return version;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Data encoding
// ---------------------------------------------------------------------------

function buildCodewords(bytes, version, ecLevel) {
  const totalData = dataCodewordCount(version, ecLevel);
  const buffer = new BitBuffer();
  buffer.put(0b0100, 4); // byte mode
  buffer.put(bytes.length, charCountBits(version));
  for (const byte of bytes) buffer.put(byte, 8);

  // Terminator, up to four zero bits but never past capacity.
  const capacityBits = totalData * 8;
  const terminator = Math.min(4, capacityBits - buffer.length);
  if (terminator > 0) buffer.put(0, terminator);

  // Pad to a byte boundary.
  if (buffer.length % 8 !== 0) buffer.put(0, 8 - (buffer.length % 8));

  const codewords = buffer.toCodewords();
  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (codewords.length < totalData) {
    codewords.push(padBytes[padIndex++ % 2]);
  }
  return codewords;
}

/** Split into blocks, add EC codewords, then interleave as the spec requires. */
function interleave(dataCodewords, version, ecLevel) {
  const [ecPerBlock, blocks1, data1, blocks2, data2] = BLOCK_TABLE[ecLevel][version];
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;

  for (let i = 0; i < blocks1; i++) {
    const block = dataCodewords.slice(offset, offset + data1);
    offset += data1;
    dataBlocks.push(block);
    ecBlocks.push(rsEncodeBlock(block, ecPerBlock));
  }
  for (let i = 0; i < blocks2; i++) {
    const block = dataCodewords.slice(offset, offset + data2);
    offset += data2;
    dataBlocks.push(block);
    ecBlocks.push(rsEncodeBlock(block, ecPerBlock));
  }

  const result = [];
  const maxData = Math.max(data1, data2);
  for (let i = 0; i < maxData; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) result.push(block[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Matrix construction
// ---------------------------------------------------------------------------

const EMPTY = -1;

function createMatrix(size) {
  const matrix = [];
  for (let r = 0; r < size; r++) matrix.push(new Array(size).fill(EMPTY));
  return matrix;
}

function placeFinderPattern(matrix, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= matrix.length || cc >= matrix.length) continue;
      const inRing =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      matrix[rr][cc] = inRing || inCore ? 1 : 0;
    }
  }
}

function placeAlignmentPatterns(matrix, version) {
  const centres = ALIGNMENT_CENTRES[version];
  const size = matrix.length;
  for (const row of centres) {
    for (const col of centres) {
      // Skip the three positions occupied by finder patterns.
      if (
        (row === 6 && col === 6) ||
        (row === 6 && col === size - 7) ||
        (row === size - 7 && col === 6)
      ) {
        continue;
      }
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const ring = Math.max(Math.abs(r), Math.abs(c));
          matrix[row + r][col + c] = ring === 1 ? 0 : 1;
        }
      }
    }
  }
}

function placeTimingPatterns(matrix) {
  const size = matrix.length;
  for (let i = 8; i < size - 8; i++) {
    const value = i % 2 === 0 ? 1 : 0;
    if (matrix[6][i] === EMPTY) matrix[6][i] = value;
    if (matrix[i][6] === EMPTY) matrix[i][6] = value;
  }
}

/** Reserve format/version areas so data placement skips them. */
function reserveFunctionAreas(matrix, version) {
  const size = matrix.length;
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === EMPTY) matrix[8][i] = 0;
    if (matrix[i][8] === EMPTY) matrix[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    matrix[8][size - 1 - i] = 0;
    matrix[size - 1 - i][8] = 0;
  }
  matrix[size - 8][8] = 1; // dark module

  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const r = Math.floor(i / 3);
      const c = i % 3;
      matrix[size - 11 + c][r] = 0;
      matrix[r][size - 11 + c] = 0;
    }
  }
}

function placeData(matrix, codewords) {
  const size = matrix.length;
  const bits = [];
  for (const byte of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((byte >>> i) & 1);
  }

  let bitIndex = 0;
  let upward = true;
  for (let colPair = size - 1; colPair > 0; colPair -= 2) {
    // The vertical timing pattern column shifts the pair left by one.
    if (colPair === 6) colPair = 5;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (let i = 0; i < 2; i++) {
        const col = colPair - i;
        if (matrix[row][col] !== EMPTY) continue;
        matrix[row][col] = bitIndex < bits.length ? bits[bitIndex] : 0;
        bitIndex++;
      }
    }
    upward = !upward;
  }
  return bitIndex;
}

function maskBit(mask, row, col) {
  switch (mask) {
    case 0: return (row + col) % 2 === 0;
    case 1: return row % 2 === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    case 7: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: throw new Error(`invalid mask ${mask}`);
  }
}

/** Which modules are function patterns (never masked). */
function functionModuleMap(version) {
  const size = version * 4 + 17;
  const map = createMatrix(size);
  placeFinderPattern(map, 0, 0);
  placeFinderPattern(map, 0, size - 7);
  placeFinderPattern(map, size - 7, 0);
  placeAlignmentPatterns(map, version);
  placeTimingPatterns(map);
  reserveFunctionAreas(map, version);
  const flags = [];
  for (let r = 0; r < size; r++) {
    flags.push(map[r].map((v) => v !== EMPTY));
  }
  return flags;
}

function applyMask(matrix, isFunction, mask) {
  const size = matrix.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isFunction[r][c]) continue;
      if (maskBit(mask, r, c)) matrix[r][c] ^= 1;
    }
  }
}

function writeFormatInformation(matrix, ecLevel, mask) {
  const size = matrix.length;
  const format = formatInformation(ecLevel, mask);
  // Bit 0 is the least significant bit of the 15-bit value.
  const bit = (i) => (format >>> i) & 1;

  for (let i = 0; i <= 5; i++) matrix[8][i] = bit(14 - i);
  matrix[8][7] = bit(8);
  matrix[8][8] = bit(7);
  matrix[7][8] = bit(6);
  for (let i = 9; i <= 14; i++) matrix[14 - i][8] = bit(14 - i);

  for (let i = 0; i <= 7; i++) matrix[size - 1 - i][8] = bit(i);
  for (let i = 8; i <= 14; i++) matrix[8][size - 15 + i] = bit(i);

  matrix[size - 8][8] = 1; // dark module
}

function writeVersionInformation(matrix, version) {
  if (version < 7) return;
  const size = matrix.length;
  const info = VERSION_INFO[version];
  for (let i = 0; i < 18; i++) {
    const bit = (info >>> i) & 1;
    const r = Math.floor(i / 3);
    const c = i % 3;
    matrix[size - 11 + c][r] = bit;
    matrix[r][size - 11 + c] = bit;
  }
}

// ---------------------------------------------------------------------------
// Mask penalty scoring (ISO/IEC 18004 section 8.8.2)
// ---------------------------------------------------------------------------

function maskPenalty(matrix) {
  const size = matrix.length;
  let penalty = 0;

  // Rule 1: runs of five or more same-coloured modules in a row or column.
  for (let i = 0; i < size; i++) {
    for (const getter of [(j) => matrix[i][j], (j) => matrix[j][i]]) {
      let runColour = getter(0);
      let runLength = 1;
      for (let j = 1; j < size; j++) {
        const value = getter(j);
        if (value === runColour) {
          runLength++;
        } else {
          if (runLength >= 5) penalty += runLength - 2;
          runColour = value;
          runLength = 1;
        }
      }
      if (runLength >= 5) penalty += runLength - 2;
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = matrix[r][c];
      if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns with four light modules on a side.
  const pattern = [1, 0, 1, 1, 1, 0, 1];
  const light4 = [0, 0, 0, 0];
  const matches = (values, target) => target.every((t, i) => values[i] === t);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= size - 7; j++) {
      for (const getter of [(k) => matrix[i][k], (k) => matrix[k][i]]) {
        const window = [];
        for (let k = 0; k < 7; k++) window.push(getter(j + k));
        if (!matches(window, pattern)) continue;
        const before = [];
        for (let k = j - 4; k < j; k++) before.push(k >= 0 ? getter(k) : 0);
        const after = [];
        for (let k = j + 7; k < j + 11; k++) after.push(k < size ? getter(k) : 0);
        if (matches(before, light4) || matches(after, light4)) penalty += 40;
      }
    }
  }

  // Rule 4: deviation of dark module proportion from 50%.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (matrix[r][c]) dark++;
  const percent = (dark * 100) / (size * size);
  penalty += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return penalty;
}

// ---------------------------------------------------------------------------
// Public encode API
// ---------------------------------------------------------------------------

/**
 * Encode text as a QR symbol.
 * @param {string} text
 * @param {{ecLevel?: 'L'|'M'|'Q'|'H', minVersion?: number}} [options]
 * @returns {{matrix: number[][], size: number, version: number, ecLevel: string, mask: number, text: string}}
 */
function encode(text, options = {}) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('QR encode requires a non-empty string');
  }
  const ecLevel = options.ecLevel || 'M';
  if (!EC_LEVELS.includes(ecLevel)) throw new Error(`unknown EC level ${ecLevel}`);

  const bytes = Array.from(Buffer.from(text, 'utf8'));
  const version = chooseVersion(bytes.length, ecLevel, options.minVersion || 1);
  if (version === null) {
    throw new Error(
      `text of ${bytes.length} bytes does not fit in QR version ${MAX_VERSION} at level ${ecLevel}`
    );
  }

  const dataCodewords = buildCodewords(bytes, version, ecLevel);
  const finalCodewords = interleave(dataCodewords, version, ecLevel);

  const size = version * 4 + 17;
  const base = createMatrix(size);
  placeFinderPattern(base, 0, 0);
  placeFinderPattern(base, 0, size - 7);
  placeFinderPattern(base, size - 7, 0);
  placeAlignmentPatterns(base, version);
  placeTimingPatterns(base);
  reserveFunctionAreas(base, version);
  placeData(base, finalCodewords);

  const isFunction = functionModuleMap(version);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = base.map((row) => row.slice());
    applyMask(candidate, isFunction, mask);
    writeFormatInformation(candidate, ecLevel, mask);
    writeVersionInformation(candidate, version);
    const penalty = maskPenalty(candidate);
    if (best === null || penalty < best.penalty) {
      best = { matrix: candidate, mask, penalty };
    }
  }

  return {
    matrix: best.matrix,
    size,
    version,
    ecLevel,
    mask: best.mask,
    text,
  };
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

/**
 * Render as SVG. Quiet zone defaults to the spec-mandated 4 modules.
 * Uses one path for all dark modules so the markup stays small.
 */
function toSvg(qr, options = {}) {
  const quietZone = options.quietZone === undefined ? 4 : options.quietZone;
  const scale = options.scale || 8;
  const dark = options.dark || '#101433';
  const light = options.light || '#ffffff';
  const total = qr.size + quietZone * 2;
  const pixels = total * scale;

  let path = '';
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (qr.matrix[r][c] !== 1) continue;
      const x = (c + quietZone) * scale;
      const y = (r + quietZone) * scale;
      path += `M${x} ${y}h${scale}v${scale}h-${scale}z`;
    }
  }

  const label = options.ariaLabel || 'QR code';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" ` +
    `viewBox="0 0 ${pixels} ${pixels}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="${escapeXml(label)}">` +
    `<rect width="${pixels}" height="${pixels}" fill="${light}"/>` +
    `<path d="${path}" fill="${dark}"/>` +
    `</svg>`
  );
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&apos;';
    }
  });
}

/**
 * Render as an uncompressed-deflate PNG (zero dependencies beyond node:zlib).
 * Handy for printing and for pasting into slides.
 */
function toPngBuffer(qr, options = {}) {
  const zlib = require('node:zlib');
  const quietZone = options.quietZone === undefined ? 4 : options.quietZone;
  const scale = options.scale || 8;
  const total = qr.size + quietZone * 2;
  const pixels = total * scale;

  // Greyscale, 1 byte per pixel.
  const raw = Buffer.alloc((pixels + 1) * pixels, 0xff);
  for (let y = 0; y < pixels; y++) {
    raw[y * (pixels + 1)] = 0; // filter type none
    const moduleRow = Math.floor(y / scale) - quietZone;
    for (let x = 0; x < pixels; x++) {
      const moduleCol = Math.floor(x / scale) - quietZone;
      const isDark =
        moduleRow >= 0 &&
        moduleCol >= 0 &&
        moduleRow < qr.size &&
        moduleCol < qr.size &&
        qr.matrix[moduleRow][moduleCol] === 1;
      raw[y * (pixels + 1) + 1 + x] = isDark ? 0x00 : 0xff;
    }
  }

  const chunks = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(pixels, 0);
  ihdr.writeUInt32BE(pixels, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  chunks.push(pngChunk('IHDR', ihdr));
  chunks.push(pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })));
  chunks.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

module.exports = {
  encode,
  toSvg,
  toPngBuffer,
  byteCapacity,
  formatInformation,
  maskBit,
  functionModuleMap,
  BLOCK_TABLE,
  TOTAL_CODEWORDS,
  ALIGNMENT_CENTRES,
  VERSION_INFO,
  EC_INDICATOR,
  MAX_VERSION,
};
