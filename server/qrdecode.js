'use strict';
/**
 * QR decoder.
 *
 * Used by the test suite to prove encode -> decode round-trips, and by the
 * teacher dashboard's "check this QR code" button at runtime.
 *
 * Written as a separate implementation from server/qr.js: it re-derives the
 * function-pattern map, reads the format information out of the symbol itself
 * (brute-forcing the nearest valid BCH codeword the way a real scanner does),
 * walks the data placement in reverse, de-interleaves the blocks and verifies
 * every Reed-Solomon syndrome. It imports nothing from the encoder and uses
 * its own copies of the specification tables, so agreement between the two is
 * evidence rather than a tautology.
 */

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function build() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function mul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

// Independent copies of the spec tables (deliberately re-typed).
const BLOCKS = {
  L: { 1: [7, 1, 19, 0, 0], 2: [10, 1, 34, 0, 0], 3: [15, 1, 55, 0, 0], 4: [20, 1, 80, 0, 0], 5: [26, 1, 108, 0, 0], 6: [18, 2, 68, 0, 0], 7: [20, 2, 78, 0, 0], 8: [24, 2, 97, 0, 0], 9: [30, 2, 116, 0, 0], 10: [18, 2, 68, 2, 69] },
  M: { 1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0], 4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0], 6: [16, 4, 27, 0, 0], 7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37], 10: [26, 4, 43, 1, 44] },
  Q: { 1: [13, 1, 13, 0, 0], 2: [22, 1, 22, 0, 0], 3: [18, 2, 17, 0, 0], 4: [26, 2, 24, 0, 0], 5: [18, 2, 15, 2, 16], 6: [24, 4, 19, 0, 0], 7: [18, 2, 14, 4, 15], 8: [22, 4, 18, 2, 19], 9: [20, 4, 16, 4, 17], 10: [24, 6, 19, 2, 20] },
  H: { 1: [17, 1, 9, 0, 0], 2: [28, 1, 16, 0, 0], 3: [22, 2, 13, 0, 0], 4: [16, 4, 9, 0, 0], 5: [22, 2, 11, 2, 12], 6: [28, 4, 15, 0, 0], 7: [26, 4, 13, 1, 14], 8: [26, 4, 14, 2, 15], 9: [24, 4, 12, 4, 13], 10: [28, 6, 15, 2, 16] },
};

const ALIGNMENT = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

const EC_FROM_INDICATOR = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };

/** Mark every module that carries function patterns or reserved information. */
function buildFunctionMap(version) {
  const size = version * 4 + 17;
  const map = [];
  for (let i = 0; i < size; i++) map.push(new Array(size).fill(false));
  const mark = (r, c) => {
    if (r >= 0 && c >= 0 && r < size && c < size) map[r][c] = true;
  };

  // Finder patterns plus their separators: an 8x8 block at each corner.
  for (const [baseR, baseC] of [[0, 0], [0, size - 8], [size - 8, 0]]) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) mark(baseR + r, baseC + c);
  }

  // Timing patterns.
  for (let i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }

  // Alignment patterns (skipping those overlapping finder patterns).
  const centres = ALIGNMENT[version];
  for (const row of centres) {
    for (const col of centres) {
      if ((row === 6 && col === 6) || (row === 6 && col === size - 7) || (row === size - 7 && col === 6)) continue;
      for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) mark(row + r, col + c);
    }
  }

  // Format information areas and the dark module.
  for (let i = 0; i < 9; i++) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    mark(8, size - 1 - i);
    mark(size - 1 - i, 8);
  }

  // Version information blocks.
  if (version >= 7) {
    for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) {
      mark(r, size - 11 + c);
      mark(size - 11 + c, r);
    }
  }
  return map;
}

function popcount(value) {
  let count = 0;
  while (value) {
    count += value & 1;
    value >>>= 1;
  }
  return count;
}

/** Brute-force the closest valid 15-bit format code, as real decoders do. */
function readFormat(matrix) {
  const size = matrix.length;
  let primary = 0;
  for (let i = 0; i <= 5; i++) primary |= matrix[8][i] << (14 - i);
  primary |= matrix[8][7] << 8;
  primary |= matrix[8][8] << 7;
  primary |= matrix[7][8] << 6;
  for (let i = 9; i <= 14; i++) primary |= matrix[14 - i][8] << (14 - i);

  let secondary = 0;
  for (let i = 0; i <= 7; i++) secondary |= matrix[size - 1 - i][8] << i;
  for (let i = 8; i <= 14; i++) secondary |= matrix[8][size - 15 + i] << i;

  for (const raw of [primary, secondary]) {
    const unmasked = raw ^ 0b101010000010010;
    for (let data = 0; data < 32; data++) {
      // Recompute the BCH(15,5) codeword for this candidate.
      let remainder = data << 10;
      while (bits(remainder) > 10) remainder ^= 0b10100110111 << (bits(remainder) - 11);
      const candidate = (data << 10) | remainder;
      if (popcount(candidate ^ unmasked) <= 3) {
        return { ecLevel: EC_FROM_INDICATOR[data >> 3], mask: data & 7 };
      }
    }
  }
  throw new Error('could not read format information');
}

function bits(value) {
  let n = 0;
  while (value) {
    n++;
    value >>>= 1;
  }
  return n;
}

function maskPredicate(mask) {
  const fns = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (((r >> 1) + Math.floor(c / 3)) % 2) === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => ((((r * c) % 2) + ((r * c) % 3)) % 2) === 0,
    (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0,
  ];
  return fns[mask];
}

/** Read the interleaved codeword stream back out of the symbol. */
function readCodewords(matrix, version, mask) {
  const size = matrix.length;
  const fnMap = buildFunctionMap(version);
  const predicate = maskPredicate(mask);
  const bitStream = [];

  let upward = true;
  for (let colPair = size - 1; colPair > 0; colPair -= 2) {
    if (colPair === 6) colPair = 5;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (let i = 0; i < 2; i++) {
        const col = colPair - i;
        if (fnMap[row][col]) continue;
        let bit = matrix[row][col];
        if (predicate(row, col)) bit ^= 1;
        bitStream.push(bit);
      }
    }
    upward = !upward;
  }

  const codewords = [];
  for (let i = 0; i + 7 < bitStream.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bitStream[i + j];
    codewords.push(byte);
  }
  return codewords;
}

/** Undo the block interleaving and verify every Reed-Solomon syndrome. */
function deinterleave(codewords, version, ecLevel) {
  const [ecPerBlock, blocks1, data1, blocks2, data2] = BLOCKS[ecLevel][version];
  const blockCount = blocks1 + blocks2;
  const dataSizes = [];
  for (let i = 0; i < blocks1; i++) dataSizes.push(data1);
  for (let i = 0; i < blocks2; i++) dataSizes.push(data2);

  const dataBlocks = dataSizes.map(() => []);
  const maxData = Math.max(data1, data2 || 0);
  let index = 0;
  for (let i = 0; i < maxData; i++) {
    for (let b = 0; b < blockCount; b++) {
      if (i < dataSizes[b]) dataBlocks[b].push(codewords[index++]);
    }
  }

  const ecBlocks = dataSizes.map(() => []);
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < blockCount; b++) ecBlocks[b].push(codewords[index++]);
  }

  // Syndrome check: a valid codeword evaluates to zero at every root.
  for (let b = 0; b < blockCount; b++) {
    const full = dataBlocks[b].concat(ecBlocks[b]);
    for (let s = 0; s < ecPerBlock; s++) {
      let acc = 0;
      for (const byte of full) acc = mul(acc, GF_EXP[s]) ^ byte;
      if (acc !== 0) {
        throw new Error(`Reed-Solomon syndrome ${s} non-zero in block ${b}`);
      }
    }
  }

  return dataBlocks.flat();
}

function decodePayload(dataCodewords, version) {
  const bitStream = [];
  for (const byte of dataCodewords) {
    for (let i = 7; i >= 0; i--) bitStream.push((byte >>> i) & 1);
  }
  let pos = 0;
  const take = (n) => {
    let value = 0;
    for (let i = 0; i < n; i++) value = (value << 1) | bitStream[pos++];
    return value;
  };

  const mode = take(4);
  if (mode !== 0b0100) throw new Error(`expected byte mode, got ${mode.toString(2)}`);
  const length = take(version <= 9 ? 8 : 16);
  const bytes = [];
  for (let i = 0; i < length; i++) bytes.push(take(8));
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Decode a module matrix back to its text.
 * @param {number[][]} matrix
 * @returns {{text: string, version: number, ecLevel: string, mask: number}}
 */
function decodeMatrix(matrix) {
  const size = matrix.length;
  if ((size - 17) % 4 !== 0) throw new Error(`matrix size ${size} is not a valid QR size`);
  const version = (size - 17) / 4;
  if (version < 1 || version > 10) throw new Error(`unsupported version ${version}`);

  // Structural sanity checks a scanner would also rely on.
  for (const [r, c] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    if (matrix[r + 3][c + 3] !== 1 || matrix[r + 1][c + 1] !== 0) {
      throw new Error(`finder pattern at ${r},${c} is malformed`);
    }
  }
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] !== (i % 2 === 0 ? 1 : 0)) throw new Error('horizontal timing pattern broken');
    if (matrix[i][6] !== (i % 2 === 0 ? 1 : 0)) throw new Error('vertical timing pattern broken');
  }
  if (matrix[size - 8][8] !== 1) throw new Error('dark module missing');

  const { ecLevel, mask } = readFormat(matrix);
  const codewords = readCodewords(matrix, version, mask);
  const dataCodewords = deinterleave(codewords, version, ecLevel);
  const text = decodePayload(dataCodewords, version);
  return { text, version, ecLevel, mask };
}

/** Decode an SVG produced by qr.toSvg by rebuilding the matrix from its path. */
function decodeSvg(svg) {
  const widthMatch = svg.match(/width="(\d+)"/);
  const pathMatch = svg.match(/<path d="([^"]*)"/);
  if (!widthMatch || !pathMatch) throw new Error('not a QR SVG');
  const pixels = Number(widthMatch[1]);

  const rects = [];
  const re = /M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g;
  let m;
  while ((m = re.exec(pathMatch[1])) !== null) {
    rects.push({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) });
  }
  if (rects.length === 0) throw new Error('no modules found in SVG path');

  const scale = rects[0].w;
  const totalModules = pixels / scale;
  const grid = [];
  for (let i = 0; i < totalModules; i++) grid.push(new Array(totalModules).fill(0));
  for (const rect of rects) grid[rect.y / scale][rect.x / scale] = 1;

  // Strip the quiet zone by finding the bounding box of dark modules.
  let minRow = totalModules, maxRow = -1, minCol = totalModules, maxCol = -1;
  for (let r = 0; r < totalModules; r++) {
    for (let c = 0; c < totalModules; c++) {
      if (!grid[r][c]) continue;
      minRow = Math.min(minRow, r);
      maxRow = Math.max(maxRow, r);
      minCol = Math.min(minCol, c);
      maxCol = Math.max(maxCol, c);
    }
  }
  const quiet = minRow;
  const sizeFromBox = Math.max(maxRow - minRow + 1, maxCol - minCol + 1);
  const matrix = [];
  for (let r = 0; r < sizeFromBox; r++) {
    matrix.push(grid[quiet + r].slice(minCol, minCol + sizeFromBox));
  }

  const result = decodeMatrix(matrix);
  result.quietZoneModules = quiet;
  result.moduleScale = scale;
  return result;
}

module.exports = { decodeMatrix, decodeSvg, buildFunctionMap };
