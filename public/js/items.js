/**
 * Item illustrations for Merge Mystery: The Missing Festival.
 *
 * Four families, five levels each, all original to this project.
 *
 * Design rules, so the board stays readable on a small phone:
 *   - Every level has a clearly different silhouette, not just a different
 *     colour or a bigger version of the same shape. A pupil must be able to
 *     match two tiles at a glance.
 *   - Every shape carries a dark outline, so it stands out against any cell
 *     background and reads at roughly 40 px across.
 *   - A light highlight on the top-left of round forms gives depth without
 *     needing gradients, filters or raster images.
 *   - Flat colour only: no gradients, no blurs, no external images. The whole
 *     set is a few kilobytes of markup and stays sharp at any zoom.
 */

import { PALETTE, OUTLINE, familyColour } from './palette.js';

/** Standard outline width at the 100x100 drawing scale. */
const W = 3.2;

function outline(extra = '') {
  return `stroke="${OUTLINE}" stroke-width="${W}" stroke-linejoin="round" stroke-linecap="round" ${extra}`;
}

/** A soft white highlight, used sparingly to suggest a light source. */
function shine(cx, cy, r) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.7}" fill="#ffffff" opacity="0.35"/>`;
}

// ---------------------------------------------------------------------------
// Paper decorations: shape -> chain -> bunting -> banner -> entrance
// ---------------------------------------------------------------------------

function paper(level, c) {
  switch (level) {
    case 1: // a single folded paper diamond
      return `
        <polygon points="50,14 82,50 50,86 18,50" fill="${c.main}" ${outline()}/>
        <polyline points="18,50 50,62 82,50" fill="none" stroke="${PALETTE.paper}" stroke-width="3" opacity="0.75"/>
        <polygon points="50,14 50,86" fill="none" stroke="${OUTLINE}" stroke-width="2" opacity="0.35"/>
        ${shine(39, 36, 9)}`;

    case 2: // three linked rings
      return `
        <ellipse cx="27" cy="50" rx="16" ry="18" fill="none" stroke="${OUTLINE}" stroke-width="11"/>
        <ellipse cx="27" cy="50" rx="16" ry="18" fill="none" stroke="${c.main}" stroke-width="7"/>
        <ellipse cx="73" cy="50" rx="16" ry="18" fill="none" stroke="${OUTLINE}" stroke-width="11"/>
        <ellipse cx="73" cy="50" rx="16" ry="18" fill="none" stroke="${PALETTE.turquoise}" stroke-width="7"/>
        <ellipse cx="50" cy="50" rx="16" ry="18" fill="none" stroke="${OUTLINE}" stroke-width="11"/>
        <ellipse cx="50" cy="50" rx="16" ry="18" fill="none" stroke="${c.accent}" stroke-width="7"/>`;

    case 3: // a string of triangular flags
      return `
        <path d="M6 26 Q50 46 94 26" fill="none" stroke="${OUTLINE}" stroke-width="4"/>
        <polygon points="16,29 34,33 25,62" fill="${c.main}" ${outline('stroke-width="2.6"')}/>
        <polygon points="38,34 56,35 47,66" fill="${c.accent}" ${outline('stroke-width="2.6"')}/>
        <polygon points="60,34 78,30 69,61" fill="${PALETTE.turquoise}" ${outline('stroke-width="2.6"')}/>
        <circle cx="6" cy="26" r="4" fill="${OUTLINE}"/>
        <circle cx="94" cy="26" r="4" fill="${OUTLINE}"/>`;

    case 4: // a banner hanging from a pole
      return `
        <rect x="46.5" y="10" width="7" height="80" rx="3.5" fill="${PALETTE.woodDark}" ${outline('stroke-width="2.6"')}/>
        <path d="M14 20 H86 V60 L50 76 L14 60 Z" fill="${c.main}" ${outline()}/>
        <rect x="14" y="32" width="72" height="9" fill="${c.accent}"/>
        <rect x="14" y="47" width="72" height="9" fill="${PALETTE.paper}" opacity="0.9"/>
        <circle cx="50" cy="14" r="6" fill="${PALETTE.yellow}" ${outline('stroke-width="2.6"')}/>
        ${shine(28, 27, 8)}`;

    default: // a decorated entrance arch
      return `
        <path d="M12 90 V48 Q50 12 88 48 V90" fill="none" stroke="${OUTLINE}" stroke-width="15" stroke-linecap="round"/>
        <path d="M12 90 V48 Q50 12 88 48 V90" fill="none" stroke="${c.main}" stroke-width="9" stroke-linecap="round"/>
        <polygon points="22,56 36,58 29,76" fill="${c.accent}" ${outline('stroke-width="2.4"')}/>
        <polygon points="43,46 57,46 50,65" fill="${PALETTE.turquoise}" ${outline('stroke-width="2.4"')}/>
        <polygon points="64,56 78,59 71,77" fill="${PALETTE.green}" ${outline('stroke-width="2.4"')}/>
        <circle cx="50" cy="20" r="9" fill="${PALETTE.yellow}" ${outline()}/>
        <path d="M50 13 L52 19 L58 20 L52 22 L50 28 L48 22 L42 20 L48 19 Z" fill="${PALETTE.paper}"/>`;
  }
}

// ---------------------------------------------------------------------------
// Flowers: flower -> bunch -> bouquet -> basket -> display
// ---------------------------------------------------------------------------

function bloom(cx, cy, r, main, centre, petals = 5) {
  let out = '';
  for (let i = 0; i < petals; i++) {
    const angle = (i / petals) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * r * 0.74;
    const py = cy + Math.sin(angle) * r * 0.74;
    out += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(r * 0.5).toFixed(1)}" ` +
      `fill="${main}" stroke="${OUTLINE}" stroke-width="2.2"/>`;
  }
  out += `<circle cx="${cx}" cy="${cy}" r="${(r * 0.4).toFixed(1)}" fill="${centre}" ` +
    `stroke="${OUTLINE}" stroke-width="2.2"/>`;
  return out;
}

function leaf(x, y, flip = false) {
  const d = flip
    ? `M${x} ${y} Q${x + 15} ${y - 9} ${x + 19} ${y + 3} Q${x + 7} ${y + 8} ${x} ${y} Z`
    : `M${x} ${y} Q${x - 15} ${y - 9} ${x - 19} ${y + 3} Q${x - 7} ${y + 8} ${x} ${y} Z`;
  return `<path d="${d}" fill="${PALETTE.green}" ${outline('stroke-width="2.2"')}/>`;
}

function flower(level, c) {
  switch (level) {
    case 1: // one bloom on a stem
      return `
        <path d="M50 58 V88" stroke="${OUTLINE}" stroke-width="6" stroke-linecap="round"/>
        <path d="M50 58 V88" stroke="${PALETTE.greenDark}" stroke-width="3.5" stroke-linecap="round"/>
        ${leaf(50, 74)}
        ${bloom(50, 42, 26, c.main, PALETTE.yellow)}`;

    case 2: // three blooms tied together
      return `
        <path d="M50 62 V88 M33 64 L45 84 M67 64 L55 84" stroke="${OUTLINE}" stroke-width="5" stroke-linecap="round"/>
        <path d="M50 62 V88 M33 64 L45 84 M67 64 L55 84" stroke="${PALETTE.greenDark}" stroke-width="2.6" stroke-linecap="round"/>
        <rect x="40" y="74" width="20" height="8" rx="4" fill="${c.accent}" ${outline('stroke-width="2.2"')}/>
        ${bloom(28, 52, 17, c.main, PALETTE.yellow)}
        ${bloom(72, 52, 17, PALETTE.purple, PALETTE.paper)}
        ${bloom(50, 34, 19, PALETTE.coral, PALETTE.yellow)}`;

    case 3: // a wrapped bouquet
      return `
        <path d="M34 60 L50 92 L66 60 Z" fill="${PALETTE.paper}" ${outline()}/>
        <path d="M34 60 H66" stroke="${OUTLINE}" stroke-width="2.6"/>
        <rect x="42" y="68" width="16" height="7" rx="3.5" fill="${c.accent}" ${outline('stroke-width="2.2"')}/>
        ${leaf(34, 58)} ${leaf(66, 58, true)}
        ${bloom(26, 44, 15, c.main, PALETTE.yellow)}
        ${bloom(74, 44, 15, PALETTE.turquoise, PALETTE.paper)}
        ${bloom(38, 28, 15, PALETTE.purple, PALETTE.paper)}
        ${bloom(62, 28, 15, PALETTE.yellow, PALETTE.coralDark)}
        ${bloom(50, 44, 17, PALETTE.coral, PALETTE.yellow)}`;

    case 4: // a woven basket of flowers
      return `
        <path d="M20 56 H80 L72 90 H28 Z" fill="${PALETTE.wood}" ${outline()}/>
        <path d="M26 68 H74 M29 79 H71" stroke="${PALETTE.woodDark}" stroke-width="3.4"/>
        <path d="M20 56 H80" stroke="${OUTLINE}" stroke-width="4"/>
        <path d="M28 56 Q50 24 72 56" fill="none" stroke="${PALETTE.woodDark}" stroke-width="6"/>
        <path d="M28 56 Q50 24 72 56" fill="none" stroke="${OUTLINE}" stroke-width="2.4"/>
        ${bloom(28, 46, 14, c.main, PALETTE.yellow)}
        ${bloom(50, 38, 16, PALETTE.purple, PALETTE.paper)}
        ${bloom(72, 46, 14, PALETTE.turquoise, PALETTE.paper)}
        ${bloom(39, 52, 12, PALETTE.yellow, PALETTE.coralDark)}
        ${bloom(61, 52, 12, PALETTE.green, PALETTE.paper)}`;

    default: // a tiered festival flower display
      return `
        <rect x="32" y="80" width="36" height="11" rx="5" fill="${PALETTE.woodDark}" ${outline()}/>
        <rect x="44" y="58" width="12" height="24" fill="${PALETTE.wood}" ${outline('stroke-width="2.4"')}/>
        <path d="M16 56 H84 L75 70 H25 Z" fill="${PALETTE.purple}" ${outline('stroke-width="2.6"')}/>
        <path d="M25 34 H75 L68 48 H32 Z" fill="${PALETTE.turquoise}" ${outline('stroke-width="2.6"')}/>
        ${bloom(23, 48, 12, c.main, PALETTE.yellow)}
        ${bloom(50, 46, 12, PALETTE.yellow, PALETTE.coralDark)}
        ${bloom(77, 48, 12, PALETTE.green, PALETTE.paper)}
        ${bloom(33, 26, 12, PALETTE.coral, PALETTE.paper)}
        ${bloom(67, 26, 12, PALETTE.purple, PALETTE.paper)}
        ${bloom(50, 15, 13, PALETTE.yellow, PALETTE.coralDark)}`;
  }
}

// ---------------------------------------------------------------------------
// Gifts: ribbon -> bow -> gift bag -> gift box -> gift chest
// ---------------------------------------------------------------------------

function ribbon(level, c) {
  switch (level) {
    case 1: // a curling ribbon
      return `
        <path d="M20 38 Q38 18 50 38 Q62 58 80 38" fill="none" stroke="${OUTLINE}" stroke-width="17" stroke-linecap="round"/>
        <path d="M20 38 Q38 18 50 38 Q62 58 80 38" fill="none" stroke="${c.main}" stroke-width="11" stroke-linecap="round"/>
        <path d="M20 66 Q38 46 50 66 Q62 86 80 66" fill="none" stroke="${OUTLINE}" stroke-width="13" stroke-linecap="round"/>
        <path d="M20 66 Q38 46 50 66 Q62 86 80 66" fill="none" stroke="${c.dark}" stroke-width="7" stroke-linecap="round"/>`;

    case 2: // a tied bow
      return `
        <path d="M46 56 L30 88" stroke="${OUTLINE}" stroke-width="10" stroke-linecap="round"/>
        <path d="M54 56 L70 88" stroke="${OUTLINE}" stroke-width="10" stroke-linecap="round"/>
        <path d="M46 56 L30 88" stroke="${c.main}" stroke-width="5.5" stroke-linecap="round"/>
        <path d="M54 56 L70 88" stroke="${c.main}" stroke-width="5.5" stroke-linecap="round"/>
        <path d="M50 48 L16 26 Q7 48 16 70 Z" fill="${c.main}" ${outline()}/>
        <path d="M50 48 L84 26 Q93 48 84 70 Z" fill="${c.main}" ${outline()}/>
        <circle cx="50" cy="48" r="12" fill="${c.accent}" ${outline()}/>
        ${shine(45, 43, 4)}`;

    case 3: // a gift bag with handles
      return `
        <path d="M36 34 Q36 14 50 14 Q64 14 64 34" fill="none" stroke="${OUTLINE}" stroke-width="6"/>
        <path d="M36 34 Q36 14 50 14 Q64 14 64 34" fill="none" stroke="${PALETTE.woodDark}" stroke-width="3"/>
        <path d="M24 34 H76 L71 88 H29 Z" fill="${c.main}" ${outline()}/>
        <rect x="24" y="50" width="52" height="12" fill="${PALETTE.paper}" opacity="0.92"/>
        <circle cx="50" cy="56" r="9" fill="${c.accent}" ${outline('stroke-width="2.4"')}/>
        ${shine(34, 42, 7)}`;

    case 4: // a wrapped box with a cross ribbon
      return `
        <rect x="16" y="38" width="68" height="50" rx="5" fill="${c.main}" ${outline()}/>
        <rect x="11" y="28" width="78" height="15" rx="6" fill="${c.dark}" ${outline()}/>
        <rect x="43" y="28" width="14" height="60" fill="${c.accent}" ${outline('stroke-width="2.4"')}/>
        <rect x="16" y="56" width="68" height="13" fill="${c.accent}" ${outline('stroke-width="2.4"')}/>
        <path d="M50 28 L31 10 Q25 27 43 30 Z" fill="${PALETTE.coral}" ${outline('stroke-width="2.4"')}/>
        <path d="M50 28 L69 10 Q75 27 57 30 Z" fill="${PALETTE.coral}" ${outline('stroke-width="2.4"')}/>
        <circle cx="50" cy="28" r="7" fill="${PALETTE.yellow}" ${outline('stroke-width="2.4"')}/>`;

    default: // a treasure-style gift chest
      return `
        <path d="M14 48 Q50 20 86 48 V56 H14 Z" fill="${c.dark}" ${outline()}/>
        <rect x="14" y="54" width="72" height="38" rx="5" fill="${PALETTE.wood}" ${outline()}/>
        <rect x="14" y="64" width="72" height="10" fill="${c.main}"/>
        <rect x="43" y="54" width="14" height="38" fill="${c.main}"/>
        <rect x="39" y="66" width="22" height="16" rx="4" fill="${PALETTE.yellow}" ${outline('stroke-width="2.4"')}/>
        <circle cx="50" cy="74" r="3.4" fill="${OUTLINE}"/>
        <path d="M50 42 L30 22 Q24 40 43 44 Z" fill="${PALETTE.coral}" ${outline('stroke-width="2.4"')}/>
        <path d="M50 42 L70 22 Q76 40 57 44 Z" fill="${PALETTE.coral}" ${outline('stroke-width="2.4"')}/>
        <circle cx="50" cy="42" r="8" fill="${PALETTE.yellow}" ${outline('stroke-width="2.4"')}/>
        <circle cx="22" cy="18" r="3.4" fill="${PALETTE.yellow}"/>
        <circle cx="78" cy="15" r="2.8" fill="${PALETTE.turquoise}"/>`;
  }
}

// ---------------------------------------------------------------------------
// Lights: candle -> small lantern -> paper lantern -> string -> light arch
// ---------------------------------------------------------------------------

function flame(cx, cy, scale = 1) {
  const h = 16 * scale;
  const w = 8 * scale;
  return `
    <path d="M${cx} ${cy - h} Q${cx + w} ${cy - h * 0.35} ${cx} ${cy} Q${cx - w} ${cy - h * 0.35} ${cx} ${cy - h} Z"
          fill="${PALETTE.yellow}" ${outline('stroke-width="2.2"')}/>
    <path d="M${cx} ${cy - h * 0.62} Q${cx + w * 0.42} ${cy - h * 0.2} ${cx} ${cy - h * 0.06}
             Q${cx - w * 0.42} ${cy - h * 0.2} ${cx} ${cy - h * 0.62} Z" fill="${PALETTE.coral}"/>`;
}

function lanternBody(cx, cy, w, h, main, ribs) {
  return `
    <rect x="${cx - w * 0.33}" y="${cy - h / 2 - 7}" width="${w * 0.66}" height="6" rx="3"
          fill="${PALETTE.woodDark}" ${outline('stroke-width="2.2"')}/>
    <ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" fill="${main}" ${outline()}/>
    ${ribs ? `<path d="M${cx - w * 0.42} ${cy - h * 0.2} Q${cx} ${cy - h * 0.05} ${cx + w * 0.42} ${cy - h * 0.2}
                       M${cx - w * 0.46} ${cy + h * 0.1} Q${cx} ${cy + h * 0.26} ${cx + w * 0.46} ${cy + h * 0.1}"
                 fill="none" stroke="${OUTLINE}" stroke-width="2" opacity="0.4"/>` : ''}
    <rect x="${cx - w * 0.33}" y="${cy + h / 2 - 2}" width="${w * 0.66}" height="6" rx="3"
          fill="${PALETTE.woodDark}" ${outline('stroke-width="2.2"')}/>
    <circle cx="${cx}" cy="${cy}" r="${Math.max(4, w * 0.19).toFixed(1)}" fill="${PALETTE.yellow}"
            stroke="${OUTLINE}" stroke-width="2"/>`;
}

function lantern(level, c) {
  switch (level) {
    case 1: // a candle in a holder
      return `
        <path d="M34 86 H66 L62 92 H38 Z" fill="${c.dark}" ${outline('stroke-width="2.4"')}/>
        <rect x="39" y="44" width="22" height="42" rx="4" fill="${PALETTE.paper}" ${outline()}/>
        <path d="M39 56 Q50 62 61 56" fill="none" stroke="${PALETTE.stone}" stroke-width="2.6"/>
        <path d="M50 44 V36" stroke="${OUTLINE}" stroke-width="3"/>
        ${flame(50, 36, 1.15)}`;

    case 2: // a small round lantern
      return `
        <path d="M50 8 V18" stroke="${OUTLINE}" stroke-width="3.4"/>
        <circle cx="50" cy="8" r="4" fill="${PALETTE.woodDark}" ${outline('stroke-width="2"')}/>
        ${lanternBody(50, 52, 38, 46, c.main, false)}
        ${shine(40, 42, 6)}`;

    case 3: // a ribbed paper lantern with a tassel
      return `
        <path d="M50 4 V14" stroke="${OUTLINE}" stroke-width="3.4"/>
        ${lanternBody(50, 48, 58, 60, c.main, true)}
        <path d="M50 81 V90" stroke="${c.accent}" stroke-width="5" stroke-linecap="round"/>
        <path d="M43 90 Q50 97 57 90" fill="none" stroke="${c.accent}" stroke-width="4.4" stroke-linecap="round"/>
        ${shine(36, 34, 8)}`;

    case 4: // three lanterns on a line
      return `
        <path d="M4 22 Q50 44 96 22" fill="none" stroke="${OUTLINE}" stroke-width="4.4"/>
        ${lanternBody(21, 48, 27, 32, c.main, false)}
        ${lanternBody(50, 58, 29, 34, PALETTE.coral, false)}
        ${lanternBody(79, 48, 27, 32, PALETTE.purple, false)}`;

    default: // a glowing arch of lights
      return `
        <path d="M8 90 V52 Q50 12 92 52 V90" fill="none" stroke="${OUTLINE}" stroke-width="14" stroke-linecap="round"/>
        <path d="M8 90 V52 Q50 12 92 52 V90" fill="none" stroke="${c.main}" stroke-width="8" stroke-linecap="round"/>
        ${lanternBody(18, 62, 17, 21, PALETTE.coral, false)}
        ${lanternBody(33, 40, 17, 21, PALETTE.yellow, false)}
        ${lanternBody(50, 29, 19, 23, c.accent, false)}
        ${lanternBody(67, 40, 17, 21, PALETTE.purple, false)}
        ${lanternBody(82, 62, 17, 21, PALETTE.green, false)}
        <circle cx="50" cy="12" r="4" fill="${PALETTE.yellow}" stroke="${OUTLINE}" stroke-width="2"/>`;
  }
}

const DRAWERS = { paper, flower, ribbon, lantern };

/**
 * Drawing commands for one item, without the surrounding <svg>.
 * @param {string} family
 * @param {number} level 1-5
 */
export function itemBody(family, level) {
  const drawer = DRAWERS[family] || paper;
  const safe = Math.max(1, Math.min(5, Number(level) || 1));
  return drawer(safe, familyColour(family));
}

export { OUTLINE, bloom, flame, lanternBody };
