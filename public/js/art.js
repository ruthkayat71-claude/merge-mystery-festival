/**
 * Artwork for Merge Mystery: The Missing Festival.
 *
 * Everything is original to this project and drawn as inline SVG in the
 * browser. Nothing is downloaded: no images, no fonts, no third-party service,
 * no paid assets. The whole art set is a few kilobytes of markup bundled with
 * the app, so it loads reliably on shared classroom Wi-Fi and stays sharp at
 * any zoom level on any phone.
 *
 * Item illustrations live in items.js; colours live in palette.js.
 *
 * Accessibility: an item's meaning is never carried by colour alone. Every
 * level has a different silhouette, and the interface always prints the item's
 * name and level number next to the picture.
 */

import { PALETTE, OUTLINE, familyColour, chapterTheme, CHAPTER_THEMES } from './palette.js';
import { itemBody, bloom, lanternBody } from './items.js';

export { PALETTE, familyColour, chapterTheme, CHAPTER_THEMES };

const W = 3.2;
function outline(extra = '') {
  return `stroke="${OUTLINE}" stroke-width="${W}" stroke-linejoin="round" stroke-linecap="round" ${extra}`;
}

/**
 * Wrap drawing commands in an <svg>.
 *
 * The width and height attributes are set as well as the viewBox. An inline SVG
 * carrying only a viewBox collapses to zero height inside a column flexbox on
 * iOS Safari and on several Android WebViews, which is what made board items
 * invisible while their name and level badge still showed.
 */
function svg(body, { width = 100, height = 100, extraClass = '' } = {}) {
  return (
    `<svg class="art ${extraClass}" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" ` +
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`
  );
}

/** Scenes are drawn on a wide 200x120 stage. */
function sceneSvg(body) {
  return svg(body, { width: 200, height: 120, extraClass: 'art-scene' });
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * Picture for one item.
 * @param {string} family paper | flower | ribbon | lantern
 * @param {number} level 1-5
 */
export function itemArt(family, level) {
  return svg(itemBody(family, level), { extraClass: `art-item art-${family}` });
}

/** Supply-source badge: a crate that matches the family it produces. */
export function sourceArt(family) {
  const c = familyColour(family);
  const lid = {
    paper: `<rect x="22" y="28" width="56" height="16" rx="5" fill="${c.main}" ${outline()}/>`,
    flower: `<path d="M22 40 Q50 18 78 40 Z" fill="${c.main}" ${outline()}/>`,
    ribbon: `<rect x="22" y="28" width="56" height="16" rx="8" fill="${c.main}" ${outline()}/>`,
    lantern: `<path d="M24 42 L50 20 L76 42 Z" fill="${c.main}" ${outline()}/>`,
  }[family] || `<rect x="22" y="28" width="56" height="16" rx="5" fill="${c.main}" ${outline()}/>`;

  return svg(
    `${lid}
     <rect x="20" y="42" width="60" height="44" rx="7" fill="${PALETTE.paper}" ${outline()}/>
     <rect x="20" y="42" width="60" height="44" rx="7" fill="${c.main}" opacity="0.14"/>
     <path d="M30 54 H70 M30 64 H56" stroke="${c.dark}" stroke-width="4" stroke-linecap="round" opacity="0.6"/>
     <circle cx="69" cy="71" r="11" fill="${PALETTE.yellow}" ${outline()}/>
     <path d="M69 65 V77 M63 71 H75" stroke="${OUTLINE}" stroke-width="3.4" stroke-linecap="round"/>`,
    { extraClass: 'art-source' }
  );
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

const CHARACTERS = {
  'Mayor Ploy': {
    skin: '#f6c89a', hair: PALETTE.purple, hairStyle: 'bun',
    cloth: PALETTE.purple, prop: 'sash', hat: true,
  },
  'Mr Anan': {
    skin: '#dfa268', hair: '#2b2118', hairStyle: 'short',
    cloth: PALETTE.coral, prop: 'cup', hat: false,
  },
  'Miss Nin': {
    skin: '#f8d2ac', hair: PALETTE.greenDark, hairStyle: 'long',
    cloth: PALETTE.green, prop: 'leaf', hat: false,
  },
  'Grandma Dao': {
    skin: '#e8bb8f', hair: '#eef2f7', hairStyle: 'bun',
    cloth: PALETTE.turquoise, prop: 'basket', hat: false,
  },
  Detective: {
    skin: '#f2c49b', hair: '#3a2a1c', hairStyle: 'short',
    cloth: PALETTE.yellow, prop: 'glass', hat: true,
  },
};

function hairFor(style, colour) {
  if (style === 'bun') {
    return `<circle cx="50" cy="14" r="11" fill="${colour}" ${outline('stroke-width="2.6"')}/>
            <path d="M22 44 Q26 16 50 16 Q74 16 78 44 Q64 30 50 32 Q36 30 22 44 Z" fill="${colour}" ${outline('stroke-width="2.6"')}/>`;
  }
  if (style === 'long') {
    return `<path d="M20 48 Q22 14 50 14 Q78 14 80 48 L80 72 Q72 56 70 40 Q60 32 50 33 Q40 32 30 40 Q28 56 20 72 Z"
                  fill="${colour}" ${outline('stroke-width="2.6"')}/>`;
  }
  return `<path d="M22 44 Q26 14 50 14 Q74 14 78 44 Q64 28 50 31 Q36 28 22 44 Z" fill="${colour}" ${outline('stroke-width="2.6"')}/>`;
}

/**
 * Character portrait with a readable expression.
 * @param {string} name one of the townspeople
 * @param {'happy'|'thinking'|'cheer'|'worried'} mood
 */
export function characterArt(name, mood = 'happy') {
  const c = CHARACTERS[name] || CHARACTERS.Detective;

  const faces = {
    happy: {
      eyes: `<circle cx="39" cy="47" r="5" fill="${OUTLINE}"/><circle cx="61" cy="47" r="5" fill="${OUTLINE}"/>
             <circle cx="40.8" cy="45.2" r="1.8" fill="${PALETTE.paper}"/><circle cx="62.8" cy="45.2" r="1.8" fill="${PALETTE.paper}"/>`,
      brows: `<path d="M33 38 Q39 35 45 38" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round"/>
              <path d="M55 38 Q61 35 67 38" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round"/>`,
      mouth: `<path d="M40 60 Q50 70 60 60" fill="none" stroke="${OUTLINE}" stroke-width="3.4" stroke-linecap="round"/>`,
    },
    cheer: {
      eyes: `<path d="M34 48 Q39 42 44 48" fill="none" stroke="${OUTLINE}" stroke-width="3.4" stroke-linecap="round"/>
             <path d="M56 48 Q61 42 66 48" fill="none" stroke="${OUTLINE}" stroke-width="3.4" stroke-linecap="round"/>`,
      brows: `<path d="M32 36 Q39 32 46 36" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round"/>
              <path d="M54 36 Q61 32 68 36" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round"/>`,
      mouth: `<path d="M38 58 Q50 74 62 58 Z" fill="${PALETTE.coralDark}" ${outline('stroke-width="2.6"')}/>
              <path d="M44 66 Q50 70 56 66" fill="${PALETTE.paper}" opacity="0.5"/>`,
    },
    thinking: {
      eyes: `<circle cx="39" cy="48" r="4" fill="${OUTLINE}"/><circle cx="61" cy="48" r="4" fill="${OUTLINE}"/>`,
      brows: `<path d="M32 36 Q39 31 46 37" fill="none" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round"/>
              <path d="M55 37 Q61 34 67 37" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round"/>`,
      mouth: `<path d="M43 63 H57" stroke="${OUTLINE}" stroke-width="3.2" stroke-linecap="round"/>`,
    },
    worried: {
      eyes: `<circle cx="39" cy="48" r="5" fill="${OUTLINE}"/><circle cx="61" cy="48" r="5" fill="${OUTLINE}"/>
             <circle cx="40.8" cy="46.2" r="1.8" fill="${PALETTE.paper}"/><circle cx="62.8" cy="46.2" r="1.8" fill="${PALETTE.paper}"/>`,
      brows: `<path d="M33 34 Q39 39 45 37" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round"/>
              <path d="M55 37 Q61 39 67 34" fill="none" stroke="${OUTLINE}" stroke-width="2.8" stroke-linecap="round"/>`,
      mouth: `<path d="M41 66 Q50 58 59 66" fill="none" stroke="${OUTLINE}" stroke-width="3.2" stroke-linecap="round"/>`,
    },
  };
  const face = faces[mood] || faces.happy;

  const props = {
    sash: `<path d="M28 94 L72 78" stroke="${PALETTE.yellow}" stroke-width="9" ${outline('stroke-width="2.4"')}/>
           <circle cx="70" cy="79" r="6" fill="${PALETTE.yellowDark}" ${outline('stroke-width="2.2"')}/>`,
    cup: `<rect x="70" y="72" width="18" height="14" rx="3" fill="${PALETTE.paper}" ${outline('stroke-width="2.4"')}/>
          <path d="M88 76 Q95 79 88 82" fill="none" stroke="${OUTLINE}" stroke-width="2.6"/>
          <path d="M74 70 Q76 65 78 70" fill="none" stroke="${PALETTE.stone}" stroke-width="2.4"/>`,
    leaf: `<path d="M70 76 Q84 66 86 80 Q74 86 70 76 Z" fill="${PALETTE.green}" ${outline('stroke-width="2.4"')}/>
           <path d="M72 78 Q80 76 85 79" fill="none" stroke="${PALETTE.greenDark}" stroke-width="2"/>`,
    basket: `<path d="M64 80 H92 L87 97 H69 Z" fill="${PALETTE.wood}" ${outline('stroke-width="2.4"')}/>
             <path d="M68 87 H88" stroke="${PALETTE.woodDark}" stroke-width="2.6"/>
             ${bloom(74, 78, 7, PALETTE.coral, PALETTE.yellow)}${bloom(85, 78, 6, PALETTE.purple, PALETTE.paper)}`,
    glass: `<circle cx="78" cy="70" r="12" fill="${PALETTE.sky}" fill-opacity="0.85" ${outline('stroke-width="3.4"')}/>
            <path d="M87 79 L96 90" stroke="${PALETTE.woodDark}" stroke-width="7" stroke-linecap="round"/>
            <path d="M72 65 Q76 62 80 64" fill="none" stroke="${PALETTE.paper}" stroke-width="2.6"/>`,
  };

  const hat = c.hat
    ? `<path d="M18 26 H82 L74 16 Q50 6 26 16 Z" fill="${c.cloth}" ${outline('stroke-width="2.6"')}/>
       <rect x="14" y="24" width="72" height="7" rx="3.5" fill="${PALETTE.ink}" ${outline('stroke-width="2.2"')}/>`
    : '';

  return svg(
    `<circle cx="50" cy="50" r="47" fill="${PALETTE.sky}"/>
     <circle cx="50" cy="50" r="47" fill="none" stroke="${OUTLINE}" stroke-width="2.4" opacity="0.25"/>
     <path d="M14 100 Q22 72 50 72 Q78 72 86 100 Z" fill="${c.cloth}" ${outline()}/>
     <path d="M40 72 Q50 82 60 72" fill="${PALETTE.paper}" opacity="0.5"/>
     <circle cx="50" cy="48" r="27" fill="${c.skin}" ${outline()}/>
     <circle cx="27" cy="52" r="5" fill="${c.skin}" ${outline('stroke-width="2.2"')}/>
     <circle cx="73" cy="52" r="5" fill="${c.skin}" ${outline('stroke-width="2.2"')}/>
     ${hairFor(c.hairStyle, c.hair)}
     ${hat}
     ${face.brows}
     ${face.eyes}
     <circle cx="33" cy="57" r="5.4" fill="${PALETTE.coral}" opacity="0.4"/>
     <circle cx="67" cy="57" r="5.4" fill="${PALETTE.coral}" opacity="0.4"/>
     <path d="M48 52 Q50 55 52 52" fill="none" stroke="${OUTLINE}" stroke-width="2.2" stroke-linecap="round" opacity="0.6"/>
     ${face.mouth}
     ${props[c.prop] || ''}`,
    { extraClass: 'art-character' }
  );
}

// ---------------------------------------------------------------------------
// Shops and buildings, drawn in detail for the chapter headers
// ---------------------------------------------------------------------------

/**
 * A detailed shop front for one chapter.
 * @param {string} key chapter key
 * @param {boolean} lively draw it restored and decorated
 */
export function shopArt(key, lively = true) {
  const theme = chapterTheme(key);
  const wall = lively ? PALETTE.paper : '#dcdfe5';
  const roof = lively ? theme.main : PALETTE.dull;
  const glass = lively ? PALETTE.sky : '#c3c8d1';
  const trim = lively ? theme.accent : PALETTE.dullDark;

  const signs = {
    welcome: `<path d="M26 30 H74 L68 42 H32 Z" fill="${trim}" ${outline('stroke-width="2.4"')}/>
              <path d="M38 36 H62" stroke="${OUTLINE}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>`,
    cafe: `<rect x="28" y="28" width="44" height="14" rx="4" fill="${trim}" ${outline('stroke-width="2.4"')}/>
           <circle cx="38" cy="35" r="3.4" fill="${PALETTE.paper}"/>
           <circle cx="50" cy="35" r="3.4" fill="${PALETTE.paper}"/>
           <circle cx="62" cy="35" r="3.4" fill="${PALETTE.paper}"/>`,
    garden: `<path d="M34 40 Q50 22 66 40" fill="none" stroke="${PALETTE.greenDark}" stroke-width="5"/>
             ${lively ? bloom(40, 34, 7, PALETTE.coral, PALETTE.yellow) + bloom(60, 34, 7, PALETTE.purple, PALETTE.paper) : ''}`,
    market: `<path d="M24 30 H76 L70 42 H30 Z" fill="${trim}" ${outline('stroke-width="2.4"')}/>
             <path d="M34 30 V42 M46 30 V42 M58 30 V42" stroke="${PALETTE.paper}" stroke-width="5"/>`,
    stage: `<path d="M26 34 H74 V44 H26 Z" fill="${trim}" ${outline('stroke-width="2.4"')}/>
            <path d="M32 39 H68" stroke="${PALETTE.paper}" stroke-width="3.4" stroke-linecap="round"/>`,
  };

  return svg(
    `<rect x="16" y="42" width="68" height="48" rx="4" fill="${wall}" ${outline()}/>
     <path d="M10 44 L50 18 L90 44 Z" fill="${roof}" ${outline()}/>
     <rect x="24" y="52" width="18" height="16" rx="2" fill="${glass}" ${outline('stroke-width="2.4"')}/>
     <path d="M33 52 V68 M24 60 H42" stroke="${OUTLINE}" stroke-width="2"/>
     <rect x="58" y="52" width="18" height="16" rx="2" fill="${glass}" ${outline('stroke-width="2.4"')}/>
     <path d="M67 52 V68 M58 60 H76" stroke="${OUTLINE}" stroke-width="2"/>
     <rect x="42" y="68" width="16" height="22" rx="2" fill="${lively ? theme.main : PALETTE.dullDark}" ${outline('stroke-width="2.4"')}/>
     <circle cx="54" cy="79" r="2.4" fill="${PALETTE.yellow}"/>
     ${signs[key] || signs.welcome}
     ${lively ? `<circle cx="50" cy="14" r="5" fill="${PALETTE.yellow}" ${outline('stroke-width="2.2"')}/>` : ''}`,
    { extraClass: 'art-shop' }
  );
}

// ---------------------------------------------------------------------------
// Location scenes, with visible improvement as missions are completed
// ---------------------------------------------------------------------------

/** Background sky and ground, dull before restoration and bright after. */
function stage(progress) {
  const bright = progress >= 25;
  const sky = bright ? '#cdf1f2' : '#e3e6eb';
  const ground = progress >= 50 ? PALETTE.green : progress >= 25 ? '#9fbf9f' : PALETTE.dull;
  const sun = progress >= 75 ? PALETTE.yellow : '#d6dae1';
  return `
    <rect width="200" height="120" fill="${sky}"/>
    <circle cx="170" cy="24" r="15" fill="${sun}"/>
    ${progress >= 75 ? `<circle cx="170" cy="24" r="15" fill="none" stroke="${PALETTE.yellowDark}" stroke-width="2.4" opacity="0.5"/>` : ''}
    ${bright ? `<ellipse cx="44" cy="22" rx="20" ry="9" fill="${PALETTE.paper}" opacity="0.85"/>
                <ellipse cx="58" cy="26" rx="14" ry="7" fill="${PALETTE.paper}" opacity="0.85"/>` : ''}
    <rect y="92" width="200" height="28" fill="${ground}"/>
    <path d="M0 92 H200" stroke="${OUTLINE}" stroke-width="2.4" opacity="0.35"/>`;
}

function building(x, y, w, h, wallColour, roofColour, windows = 2) {
  let panes = '';
  const step = w / (windows + 1);
  for (let i = 1; i <= windows; i++) {
    const px = x + step * i - 6;
    panes += `<rect x="${px}" y="${y + 10}" width="12" height="11" rx="2" fill="${PALETTE.sky}" ${outline('stroke-width="2"')}/>
              <path d="M${px + 6} ${y + 10} V${y + 21} M${px} ${y + 15.5} H${px + 12}" stroke="${OUTLINE}" stroke-width="1.4"/>`;
  }
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${wallColour}" ${outline('stroke-width="2.4"')}/>
    <path d="M${x - 4} ${y + 2} L${x + w / 2} ${y - 14} L${x + w + 4} ${y + 2} Z" fill="${roofColour}" ${outline('stroke-width="2.4"')}/>
    ${panes}`;
}

function bunting(y, colours) {
  let flags = '';
  colours.forEach((colour, i) => {
    const x = 26 + i * 24;
    flags += `<polygon points="${x},${y + 4} ${x + 14},${y + 6} ${x + 7},${y + 22}" fill="${colour}" ${outline('stroke-width="2"')}/>`;
  });
  return `<path d="M18 ${y} Q100 ${y + 14} 182 ${y}" fill="none" stroke="${OUTLINE}" stroke-width="2.6"/>${flags}`;
}

/** A small flag that appears once a location is fully restored, so completion
 *  is visible even before the pupil has chosen their decoration. */
function completionFlag(x, y) {
  return `
    <path d="M${x} ${y + 22} V${y}" stroke="${OUTLINE}" stroke-width="3"/>
    <path d="M${x} ${y} H${x + 18} L${x + 13} ${y + 6} L${x + 18} ${y + 12} H${x} Z"
          fill="${PALETTE.coral}" ${outline('stroke-width="2.2"')}/>
    <circle cx="${x}" cy="${y - 3}" r="3.4" fill="${PALETTE.yellow}" ${outline('stroke-width="2"')}/>`;
}

const SCENE_COLOURS = [PALETTE.coral, PALETTE.yellow, PALETTE.turquoise, PALETTE.purple, PALETTE.green];

function welcomeScene(progress, decoration) {
  const lively = progress >= 50;
  const wall = lively ? PALETTE.paper : '#d5d9e0';
  return sceneSvg(
    `${stage(progress)}
     ${building(16, 50, 42, 42, wall, lively ? PALETTE.coral : PALETTE.dull, 2)}
     ${building(142, 46, 44, 46, wall, lively ? PALETTE.turquoise : PALETTE.dull, 2)}
     <rect x="84" y="58" width="32" height="34" rx="3" fill="${lively ? PALETTE.yellow : PALETTE.dull}" ${outline('stroke-width="2.4"')}/>
     <path d="M100 58 V92" stroke="${OUTLINE}" stroke-width="2.2" opacity="0.5"/>
     ${progress >= 25 ? bunting(36, SCENE_COLOURS.slice(0, 3)) : ''}
     ${progress >= 100 && decoration === 'welcome-flags' ? bunting(52, SCENE_COLOURS) : ''}
     ${progress >= 100 && decoration !== 'welcome-flags'
      ? `<path d="M44 92 V56 Q100 24 156 56 V92" fill="none" stroke="${PALETTE.purple}" stroke-width="9" stroke-linecap="round"/>
         <path d="M44 92 V56 Q100 24 156 56 V92" fill="none" stroke="${OUTLINE}" stroke-width="2.4" stroke-dasharray="5 7"/>
         <circle cx="100" cy="34" r="8" fill="${PALETTE.yellow}" ${outline('stroke-width="2.4"')}/>` : ''}
     ${progress >= 75 ? `${bloom(28, 86, 6, PALETTE.coral, PALETTE.yellow)}${bloom(172, 86, 6, PALETTE.purple, PALETTE.paper)}` : ''}
     ${progress >= 100 ? completionFlag(30, 30) : ''}`
  );
}

function cafeScene(progress, decoration) {
  const lively = progress >= 50;
  return sceneSvg(
    `${stage(progress)}
     <rect x="30" y="38" width="140" height="54" rx="4" fill="${lively ? PALETTE.paper : '#d5d9e0'}" ${outline()}/>
     <rect x="30" y="32" width="140" height="9" rx="3" fill="${lively ? PALETTE.purple : PALETTE.dullDark}" ${outline('stroke-width="2.2"')}/>
     <rect x="48" y="50" width="32" height="20" rx="2" fill="${lively ? PALETTE.sky : '#c3c8d1'}" ${outline('stroke-width="2.4"')}/>
     <path d="M64 50 V70 M48 60 H80" stroke="${OUTLINE}" stroke-width="1.8"/>
     <rect x="120" y="50" width="32" height="20" rx="2" fill="${lively ? PALETTE.sky : '#c3c8d1'}" ${outline('stroke-width="2.4"')}/>
     <path d="M136 50 V70 M120 60 H152" stroke="${OUTLINE}" stroke-width="1.8"/>
     <rect x="90" y="56" width="20" height="36" rx="2" fill="${lively ? PALETTE.coral : PALETTE.dullDark}" ${outline('stroke-width="2.4"')}/>
     <circle cx="105" cy="74" r="2.4" fill="${PALETTE.yellow}"/>
     ${progress >= 25
      ? `<rect x="48" y="72" width="32" height="9" rx="3" fill="${PALETTE.wood}" ${outline('stroke-width="2.2"')}/>
         <rect x="120" y="72" width="32" height="9" rx="3" fill="${PALETTE.wood}" ${outline('stroke-width="2.2"')}/>`
      : `<rect x="48" y="72" width="32" height="9" rx="3" fill="${PALETTE.dull}" ${outline('stroke-width="2.2"')}/>
         <rect x="120" y="72" width="32" height="9" rx="3" fill="${PALETTE.dull}" ${outline('stroke-width="2.2"')}/>`}
     ${progress >= 75
      ? `${bloom(56, 69, 7, PALETTE.coral, PALETTE.yellow)}${bloom(72, 69, 7, PALETTE.purple, PALETTE.paper)}
         ${bloom(128, 69, 7, PALETTE.turquoise, PALETTE.paper)}${bloom(144, 69, 7, PALETTE.yellow, PALETTE.coralDark)}` : ''}
     ${progress >= 100 && decoration === 'cafe-awning'
      ? `<path d="M34 42 H166 L156 58 H44 Z" fill="${PALETTE.coral}" ${outline('stroke-width="2.4"')}/>
         <path d="M56 42 V58 M78 42 V58 M100 42 V58 M122 42 V58 M144 42 V58" stroke="${PALETTE.paper}" stroke-width="7"/>` : ''}
     ${progress >= 100 && decoration === 'cafe-window' ? bunting(28, SCENE_COLOURS.slice(0, 4)) : ''}
     ${progress >= 100 ? completionFlag(176, 20) : ''}`
  );
}

function gardenScene(progress, decoration) {
  const lively = progress >= 50;
  return sceneSvg(
    `${stage(progress)}
     <rect x="12" y="84" width="176" height="9" rx="3" fill="${lively ? PALETTE.woodDark : PALETTE.dullDark}" ${outline('stroke-width="2.2"')}/>
     <circle cx="26" cy="72" r="${lively ? 14 : 9}" fill="${lively ? PALETTE.green : PALETTE.dull}" ${outline('stroke-width="2.4"')}/>
     <circle cx="176" cy="70" r="${lively ? 15 : 10}" fill="${lively ? PALETTE.greenDark : PALETTE.dull}" ${outline('stroke-width="2.4"')}/>
     <path d="M44 92 L50 74 H70 L76 92 Z" fill="${progress >= 25 ? PALETTE.coral : PALETTE.dull}" ${outline('stroke-width="2.4"')}/>
     <path d="M124 92 L130 74 H150 L156 92 Z" fill="${progress >= 25 ? PALETTE.purple : PALETTE.dull}" ${outline('stroke-width="2.4"')}/>
     ${progress >= 75 ? `${bloom(60, 68, 8, PALETTE.yellow, PALETTE.coralDark)}${bloom(140, 68, 8, PALETTE.turquoise, PALETTE.paper)}` : ''}
     ${progress >= 50 ? `<rect x="92" y="60" width="16" height="32" rx="2" fill="${PALETTE.wood}" ${outline('stroke-width="2.2"')}/>
                         <path d="M86 60 H114 L100 48 Z" fill="${PALETTE.greenDark}" ${outline('stroke-width="2.2"')}/>` : ''}
     ${progress >= 100 && decoration === 'garden-arch'
      ? `<path d="M64 92 V62 Q100 38 136 62 V92" fill="none" stroke="${PALETTE.greenDark}" stroke-width="8" stroke-linecap="round"/>
         ${bloom(76, 54, 7, PALETTE.coral, PALETTE.yellow)}${bloom(100, 46, 8, PALETTE.purple, PALETTE.paper)}${bloom(124, 54, 7, PALETTE.yellow, PALETTE.coralDark)}` : ''}
     ${progress >= 100 && decoration === 'garden-pots'
      ? `${bloom(30, 58, 8, PALETTE.coral, PALETTE.yellow)}${bloom(170, 56, 8, PALETTE.purple, PALETTE.paper)}
         ${bunting(34, SCENE_COLOURS.slice(0, 3))}` : ''}
     ${progress >= 100 ? completionFlag(100, 26) : ''}`
  );
}

function marketScene(progress, decoration) {
  const lively = progress >= 50;
  const water = progress >= 25 ? PALETTE.turquoise : '#9fb3b6';
  return sceneSvg(
    `${stage(progress)}
     <rect y="96" width="200" height="24" fill="${water}"/>
     <path d="M0 100 Q25 94 50 100 T100 100 T150 100 T200 100" fill="none" stroke="${PALETTE.paper}" stroke-width="2.4" opacity="0.7"/>
     <path d="M0 96 H200" stroke="${OUTLINE}" stroke-width="2.2" opacity="0.35"/>
     <rect x="24" y="60" width="58" height="32" rx="3" fill="${lively ? PALETTE.paper : '#d5d9e0'}" ${outline('stroke-width="2.4"')}/>
     <rect x="118" y="60" width="58" height="32" rx="3" fill="${lively ? PALETTE.paper : '#d5d9e0'}" ${outline('stroke-width="2.4"')}/>
     ${progress >= 25
      ? `<path d="M20 60 H86 L80 50 H26 Z" fill="${PALETTE.coral}" ${outline('stroke-width="2.4"')}/>
         <path d="M114 60 H180 L174 50 H120 Z" fill="${PALETTE.purple}" ${outline('stroke-width="2.4"')}/>` : ''}
     <path d="M74 106 Q100 98 126 106 Q100 114 74 106 Z" fill="${PALETTE.turquoiseDark}" ${outline('stroke-width="2.2"')}/>
     <path d="M100 98 V88" stroke="${OUTLINE}" stroke-width="2.4"/>
     ${progress >= 75 ? `<path d="M18 40 Q100 58 182 40" fill="none" stroke="${OUTLINE}" stroke-width="2.6"/>
         ${lanternBody(46, 50, 16, 18, PALETTE.coral, PALETTE.coralDark)}
         ${lanternBody(78, 56, 16, 18, PALETTE.yellow, PALETTE.yellowDark)}
         ${lanternBody(122, 56, 16, 18, PALETTE.turquoise, PALETTE.turquoiseDark)}
         ${lanternBody(154, 50, 16, 18, PALETTE.purple, PALETTE.purpleDark)}` : ''}
     ${progress >= 100 && decoration === 'market-stalls' ? bunting(30, SCENE_COLOURS) : ''}
     ${progress >= 100 && decoration === 'market-lights'
      ? `${lanternBody(100, 36, 18, 20, PALETTE.yellow, PALETTE.yellowDark)}` : ''}
     ${progress >= 100 ? completionFlag(22, 22) : ''}`
  );
}

function stageScene(progress, decoration) {
  const lively = progress >= 50;
  return sceneSvg(
    `${stage(progress)}
     <rect x="28" y="74" width="144" height="18" rx="3" fill="${lively ? PALETTE.wood : PALETTE.dull}" ${outline('stroke-width="2.4"')}/>
     <path d="M28 82 H172" stroke="${PALETTE.woodDark}" stroke-width="2.4" opacity="0.7"/>
     <rect x="32" y="52" width="18" height="24" rx="2" fill="${progress >= 25 ? PALETTE.coral : PALETTE.dull}" ${outline('stroke-width="2.4"')}/>
     <rect x="150" y="52" width="18" height="24" rx="2" fill="${progress >= 25 ? PALETTE.coral : PALETTE.dull}" ${outline('stroke-width="2.4"')}/>
     ${progress >= 50 ? `<path d="M50 52 H150 L144 64 H56 Z" fill="${PALETTE.purple}" ${outline('stroke-width="2.4"')}/>` : ''}
     ${progress >= 75 ? `<circle cx="100" cy="66" r="8" fill="${PALETTE.yellow}" ${outline('stroke-width="2.4"')}/>` : ''}
     ${progress >= 100 && decoration === 'stage-banner'
      ? `<rect x="52" y="28" width="96" height="24" rx="4" fill="${PALETTE.purple}" ${outline('stroke-width="2.4"')}/>
         <rect x="52" y="36" width="96" height="7" fill="${PALETTE.yellow}"/>
         <path d="M64 46 H136" stroke="${PALETTE.paper}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>` : ''}
     ${progress >= 100 && decoration !== 'stage-banner'
      ? `<path d="M44 86 V54 Q100 24 156 54 V86" fill="none" stroke="${PALETTE.turquoise}" stroke-width="9" stroke-linecap="round"/>
         ${lanternBody(60, 56, 15, 17, PALETTE.coral, PALETTE.coralDark)}
         ${lanternBody(100, 40, 17, 19, PALETTE.yellow, PALETTE.yellowDark)}
         ${lanternBody(140, 56, 15, 17, PALETTE.purple, PALETTE.purpleDark)}` : ''}
     ${progress >= 25 ? bunting(22, SCENE_COLOURS.slice(0, 4)) : ''}
     ${progress >= 100 ? completionFlag(176, 34) : ''}`
  );
}

const SCENES = {
  welcome: welcomeScene,
  cafe: cafeScene,
  garden: gardenScene,
  market: marketScene,
  stage: stageScene,
};

/**
 * A location picture that reflects how much has been restored.
 *
 * @param {string} key chapter key
 * @param {boolean|object} restoredOrOptions `true` for the finished version, or
 *        `{ progress, decoration }` to draw a part-finished location.
 * @param {string} [decoration] chosen decoration id
 */
export function sceneArt(key, restoredOrOptions, decoration) {
  const drawer = SCENES[key] || welcomeScene;
  let progress;
  let chosen = decoration;

  if (typeof restoredOrOptions === 'object' && restoredOrOptions !== null) {
    progress = Number(restoredOrOptions.progress) || 0;
    chosen = restoredOrOptions.decoration;
  } else {
    progress = restoredOrOptions ? 100 : 0;
  }
  return drawer(Math.max(0, Math.min(100, progress)), chosen);
}

/** Small map pin for the chapter map. */
export function mapPinArt(state) {
  const fill = state === 'done' ? PALETTE.green : state === 'current' ? PALETTE.coral : PALETTE.stone;
  const mark =
    state === 'done'
      ? `<path d="M36 50 L47 61 L66 38" fill="none" stroke="${PALETTE.paper}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`
      : state === 'current'
        ? `<circle cx="50" cy="48" r="12" fill="${PALETTE.paper}"/>
           <circle cx="50" cy="48" r="5" fill="${PALETTE.coralDark}"/>`
        : `<rect x="41" y="40" width="18" height="21" rx="4" fill="${PALETTE.paper}"/>
           <path d="M44 40 V33 Q50 25 56 33 V40" fill="none" stroke="${PALETTE.paper}" stroke-width="5.4"/>
           <circle cx="50" cy="50" r="3" fill="${PALETTE.stone}"/>`;
  return svg(
    `<path d="M50 95 Q17 60 17 42 A33 33 0 0 1 83 42 Q83 60 50 95 Z" fill="${fill}" ${outline()}/>
     ${mark}`,
    { extraClass: `art-pin art-pin-${state}` }
  );
}

/** Clue-card decoration: a magnifying glass over a handwritten note. */
export function clueCardArt() {
  return svg(
    `<rect x="12" y="16" width="62" height="72" rx="7" fill="${PALETTE.paper}" ${outline()}/>
     <rect x="12" y="16" width="62" height="12" rx="7" fill="${PALETTE.turquoise}" ${outline('stroke-width="2.4"')}/>
     <rect x="22" y="36" width="42" height="5" rx="2.5" fill="${PALETTE.turquoiseDark}" opacity="0.8"/>
     <rect x="22" y="48" width="34" height="5" rx="2.5" fill="${PALETTE.stone}"/>
     <rect x="22" y="60" width="38" height="5" rx="2.5" fill="${PALETTE.stone}"/>
     <circle cx="68" cy="66" r="19" fill="${PALETTE.sky}" fill-opacity="0.85" ${outline('stroke-width="5"')}/>
     <path d="M71 58 Q62 60 60 68" fill="none" stroke="${PALETTE.paper}" stroke-width="3.4" stroke-linecap="round"/>
     <path d="M81 80 L94 93" stroke="${PALETTE.woodDark}" stroke-width="8" stroke-linecap="round"/>
     <path d="M81 80 L94 93" stroke="${OUTLINE}" stroke-width="2.4" stroke-linecap="round" opacity="0.4"/>`,
    { extraClass: 'art-clue' }
  );
}

/** The festival chest, shown at the ending. */
export function chestArt() {
  return svg(
    `<path d="M12 46 Q50 16 88 46 V56 H12 Z" fill="${PALETTE.woodDark}" ${outline()}/>
     <rect x="12" y="54" width="76" height="40" rx="5" fill="${PALETTE.wood}" ${outline()}/>
     <rect x="12" y="64" width="76" height="10" fill="${PALETTE.yellow}"/>
     <rect x="44" y="54" width="12" height="40" fill="${PALETTE.yellow}"/>
     <rect x="38" y="68" width="24" height="17" rx="4" fill="${PALETTE.yellowDark}" ${outline('stroke-width="2.4"')}/>
     <circle cx="50" cy="76" r="3.4" fill="${OUTLINE}"/>
     <path d="M20 24 L23 31 L30 34 L23 37 L20 44 L17 37 L10 34 L17 31 Z" fill="${PALETTE.coral}"/>
     <path d="M80 18 L83 26 L91 29 L83 32 L80 40 L77 32 L69 29 L77 26 Z" fill="${PALETTE.turquoise}"/>
     <circle cx="62" cy="14" r="4" fill="${PALETTE.purple}"/>
     <circle cx="38" cy="12" r="3" fill="${PALETTE.green}"/>`,
    { extraClass: 'art-chest' }
  );
}

/** Coin icon for the resource bar and the scoreboard. */
export function coinArt() {
  return svg(
    `<circle cx="50" cy="50" r="39" fill="${PALETTE.yellow}" ${outline('stroke-width="5"')}/>
     <circle cx="50" cy="50" r="25" fill="none" stroke="${PALETTE.yellowDark}" stroke-width="4"/>
     <path d="M50 33 V67 M41 42 H59 M41 58 H59" stroke="${PALETTE.yellowDark}" stroke-width="5.4" stroke-linecap="round"/>
     <ellipse cx="38" cy="36" rx="7" ry="5" fill="${PALETTE.paper}" opacity="0.4"/>`,
    { extraClass: 'art-coin' }
  );
}

/** Supply-tap icon for the resource bar. */
export function chargeArt() {
  return svg(
    `<circle cx="50" cy="50" r="39" fill="${PALETTE.turquoise}" ${outline('stroke-width="5"')}/>
     <path d="M55 20 L31 55 H48 L43 80 L69 43 H52 Z" fill="${PALETTE.paper}" ${outline('stroke-width="3"')}/>`,
    { extraClass: 'art-charge' }
  );
}

/** Star icon for the English Stars scoreboard. */
export function starArt() {
  return svg(
    `<path d="M50 10 L62 38 L92 41 L69 61 L76 90 L50 75 L24 90 L31 61 L8 41 L38 38 Z"
           fill="${PALETTE.yellow}" ${outline('stroke-width="4"')}/>
     <path d="M50 26 L57 42 L74 44 L61 55 L65 72 L50 63 L35 72 L39 55 L26 44 L43 42 Z"
           fill="${PALETTE.paper}" opacity="0.35"/>`,
    { extraClass: 'art-star' }
  );
}

/** Trophy icon for the Festival Champions scoreboard. */
export function trophyArt() {
  return svg(
    `<path d="M30 16 H70 V40 Q70 60 50 60 Q30 60 30 40 Z" fill="${PALETTE.yellow}" ${outline()}/>
     <path d="M30 22 Q14 22 14 34 Q14 46 32 46" fill="none" ${outline('stroke-width="5"')}/>
     <path d="M70 22 Q86 22 86 34 Q86 46 68 46" fill="none" ${outline('stroke-width="5"')}/>
     <rect x="44" y="60" width="12" height="16" fill="${PALETTE.yellowDark}" ${outline('stroke-width="2.4"')}/>
     <rect x="28" y="76" width="44" height="12" rx="4" fill="${PALETTE.coral}" ${outline()}/>
     <path d="M42 28 L50 44 L58 28" fill="none" stroke="${PALETTE.paper}" stroke-width="4" opacity="0.5"/>`,
    { extraClass: 'art-trophy' }
  );
}

export const CHARACTER_NAMES = Object.keys(CHARACTERS);

/** Which townsperson belongs to which chapter, for the chapter header. */
export const CHAPTER_CHARACTER = {
  welcome: 'Mayor Ploy',
  cafe: 'Mr Anan',
  garden: 'Miss Nin',
  market: 'Grandma Dao',
  stage: 'Mayor Ploy',
};
