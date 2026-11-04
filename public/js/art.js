/**
 * Original artwork for Merge Mystery: The Missing Festival.
 *
 * Everything is drawn as inline SVG built in the browser. That keeps the whole
 * art set inside one small cacheable file instead of dozens of image requests,
 * which matters on shared classroom Wi-Fi.
 *
 * All shapes, characters and scenes here are original to this project.
 *
 * Accessibility note: an item's meaning is never carried by colour alone. Each
 * level has a different silhouette, and the interface always prints the item's
 * name and level number next to the picture.
 */

export const PALETTE = {
  turquoise: '#17bfc4',
  turquoiseDark: '#0e8c90',
  coral: '#ff6f5e',
  coralDark: '#d9442f',
  purple: '#7b4fd3',
  purpleDark: '#55309c',
  yellow: '#ffc53d',
  yellowDark: '#d99a00',
  green: '#35bd6a',
  greenDark: '#1f8b4a',
  ink: '#1d2240',
  paper: '#fffdf7',
  sky: '#dff6f7',
  stone: '#b9c2d0',
  wood: '#a9703f',
  woodDark: '#794e28',
};

const FAMILY_COLOUR = {
  paper: { main: PALETTE.purple, dark: PALETTE.purpleDark, accent: PALETTE.yellow },
  flower: { main: PALETTE.coral, dark: PALETTE.coralDark, accent: PALETTE.green },
  ribbon: { main: PALETTE.yellow, dark: PALETTE.yellowDark, accent: PALETTE.coral },
  lantern: { main: PALETTE.turquoise, dark: PALETTE.turquoiseDark, accent: PALETTE.yellow },
};

export function familyColour(family) {
  return FAMILY_COLOUR[family] || FAMILY_COLOUR.paper;
}

function svg(body, { width = 100, height = 100, extraClass = '' } = {}) {
  return (
    `<svg class="art ${extraClass}" viewBox="0 0 ${width} ${height}" ` +
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`
  );
}

/** Scenes are drawn on a wide 200x120 stage. */
function sceneSvg(body) {
  return svg(body, { width: 200, height: 120, extraClass: 'art-scene' });
}

// ---------------------------------------------------------------------------
// Item artwork: four families, five levels each
// ---------------------------------------------------------------------------

function paperItem(level, c) {
  switch (level) {
    case 1:
      return `
        <polygon points="50,18 80,50 50,82 20,50" fill="${c.main}" stroke="${c.dark}" stroke-width="4"/>
        <polygon points="50,30 68,50 50,70 32,50" fill="${PALETTE.paper}" opacity="0.65"/>`;
    case 2:
      return `
        <circle cx="28" cy="50" r="17" fill="none" stroke="${c.main}" stroke-width="8"/>
        <circle cx="50" cy="50" r="17" fill="none" stroke="${c.accent}" stroke-width="8"/>
        <circle cx="72" cy="50" r="17" fill="none" stroke="${c.main}" stroke-width="8"/>`;
    case 3:
      return `
        <path d="M8 28 Q50 44 92 28" fill="none" stroke="${PALETTE.ink}" stroke-width="4"/>
        <polygon points="18,31 34,34 26,58" fill="${c.main}"/>
        <polygon points="40,36 56,36 48,62" fill="${c.accent}"/>
        <polygon points="62,34 78,30 70,57" fill="${PALETTE.turquoise}"/>`;
    case 4:
      return `
        <rect x="46" y="14" width="6" height="74" rx="3" fill="${PALETTE.woodDark}"/>
        <path d="M20 20 H80 V62 L50 76 L20 62 Z" fill="${c.main}" stroke="${c.dark}" stroke-width="4"/>
        <rect x="20" y="32" width="60" height="9" fill="${c.accent}"/>
        <rect x="20" y="48" width="60" height="9" fill="${PALETTE.paper}" opacity="0.8"/>`;
    default:
      return `
        <path d="M14 86 V46 Q50 12 86 46 V86" fill="none" stroke="${c.main}" stroke-width="12" stroke-linecap="round"/>
        <path d="M14 86 V46 Q50 12 86 46 V86" fill="none" stroke="${c.dark}" stroke-width="4" stroke-dasharray="6 7"/>
        <polygon points="26,52 40,54 33,72" fill="${c.accent}"/>
        <polygon points="46,44 60,44 53,64" fill="${PALETTE.turquoise}"/>
        <polygon points="66,52 80,56 73,74" fill="${PALETTE.green}"/>
        <circle cx="50" cy="22" r="8" fill="${PALETTE.yellow}" stroke="${PALETTE.yellowDark}" stroke-width="3"/>`;
  }
}

function bloom(cx, cy, r, main, centre) {
  let petals = '';
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * r * 0.78;
    const py = cy + Math.sin(angle) * r * 0.78;
    petals += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(r * 0.52).toFixed(1)}" fill="${main}"/>`;
  }
  return `${petals}<circle cx="${cx}" cy="${cy}" r="${(r * 0.42).toFixed(1)}" fill="${centre}"/>`;
}

function flowerItem(level, c) {
  switch (level) {
    case 1:
      return `
        <path d="M50 62 V88" stroke="${PALETTE.greenDark}" stroke-width="5" stroke-linecap="round"/>
        <path d="M50 76 Q34 70 30 80 Q44 86 50 78" fill="${PALETTE.green}"/>
        ${bloom(50, 44, 26, c.main, PALETTE.yellow)}`;
    case 2:
      return `
        <path d="M50 60 V88 M34 64 L44 84 M66 64 L56 84" stroke="${PALETTE.greenDark}" stroke-width="4" stroke-linecap="round"/>
        ${bloom(30, 50, 18, c.main, PALETTE.yellow)}
        ${bloom(70, 50, 18, c.main, PALETTE.yellow)}
        ${bloom(50, 34, 20, PALETTE.coral, PALETTE.paper)}`;
    case 3:
      return `
        <path d="M38 66 L50 90 L62 66 Z" fill="${PALETTE.paper}" stroke="${PALETTE.stone}" stroke-width="3"/>
        <path d="M50 58 V74" stroke="${PALETTE.greenDark}" stroke-width="5"/>
        ${bloom(26, 46, 16, c.main, PALETTE.yellow)}
        ${bloom(74, 46, 16, c.main, PALETTE.yellow)}
        ${bloom(40, 28, 16, PALETTE.purple, PALETTE.paper)}
        ${bloom(62, 28, 16, PALETTE.turquoise, PALETTE.paper)}
        ${bloom(50, 48, 18, PALETTE.coral, PALETTE.yellow)}`;
    case 4:
      return `
        <path d="M22 58 H78 L70 88 H30 Z" fill="${PALETTE.wood}" stroke="${PALETTE.woodDark}" stroke-width="4"/>
        <path d="M22 58 H78" stroke="${PALETTE.woodDark}" stroke-width="5"/>
        <path d="M30 70 H70 M34 80 H66" stroke="${PALETTE.woodDark}" stroke-width="3" opacity="0.7"/>
        <path d="M30 58 Q50 30 70 58" fill="none" stroke="${PALETTE.woodDark}" stroke-width="4"/>
        ${bloom(30, 46, 15, c.main, PALETTE.yellow)}
        ${bloom(50, 38, 17, PALETTE.purple, PALETTE.paper)}
        ${bloom(70, 46, 15, PALETTE.turquoise, PALETTE.paper)}
        ${bloom(40, 54, 13, PALETTE.yellow, PALETTE.coral)}
        ${bloom(60, 54, 13, PALETTE.green, PALETTE.paper)}`;
    default:
      return `
        <rect x="34" y="78" width="32" height="10" rx="4" fill="${PALETTE.woodDark}"/>
        <rect x="44" y="56" width="12" height="26" fill="${PALETTE.wood}"/>
        <path d="M18 56 H82 L74 70 H26 Z" fill="${PALETTE.purple}" stroke="${PALETTE.purpleDark}" stroke-width="3"/>
        <path d="M26 36 H74 L68 50 H32 Z" fill="${PALETTE.turquoise}" stroke="${PALETTE.turquoiseDark}" stroke-width="3"/>
        ${bloom(24, 48, 13, c.main, PALETTE.yellow)}
        ${bloom(50, 46, 13, PALETTE.yellow, PALETTE.coral)}
        ${bloom(76, 48, 13, PALETTE.green, PALETTE.paper)}
        ${bloom(34, 28, 13, PALETTE.coral, PALETTE.paper)}
        ${bloom(66, 28, 13, PALETTE.purple, PALETTE.paper)}
        ${bloom(50, 16, 14, PALETTE.yellow, PALETTE.coralDark)}`;
  }
}

function ribbonItem(level, c) {
  switch (level) {
    case 1:
      return `
        <path d="M22 40 Q40 22 50 40 Q60 58 78 40" fill="none" stroke="${c.main}" stroke-width="13" stroke-linecap="round"/>
        <path d="M22 62 Q40 44 50 62 Q60 80 78 62" fill="none" stroke="${c.dark}" stroke-width="7" stroke-linecap="round" opacity="0.65"/>`;
    case 2:
      return `
        <path d="M50 50 L18 28 Q10 50 18 72 Z" fill="${c.main}" stroke="${c.dark}" stroke-width="4"/>
        <path d="M50 50 L82 28 Q90 50 82 72 Z" fill="${c.main}" stroke="${c.dark}" stroke-width="4"/>
        <path d="M46 58 L34 88 M54 58 L66 88" stroke="${c.main}" stroke-width="7" stroke-linecap="round"/>
        <circle cx="50" cy="50" r="11" fill="${c.accent}" stroke="${c.dark}" stroke-width="4"/>`;
    case 3:
      return `
        <path d="M26 38 H74 L70 86 H30 Z" fill="${c.main}" stroke="${c.dark}" stroke-width="4"/>
        <path d="M36 38 Q36 18 50 18 Q64 18 64 38" fill="none" stroke="${PALETTE.woodDark}" stroke-width="5"/>
        <rect x="26" y="52" width="48" height="11" fill="${PALETTE.paper}" opacity="0.85"/>
        <circle cx="50" cy="58" r="8" fill="${c.accent}"/>`;
    case 4:
      return `
        <rect x="18" y="38" width="64" height="48" rx="5" fill="${c.main}" stroke="${c.dark}" stroke-width="4"/>
        <rect x="14" y="30" width="72" height="14" rx="5" fill="${c.dark}"/>
        <rect x="44" y="30" width="12" height="56" fill="${c.accent}"/>
        <rect x="14" y="54" width="72" height="12" fill="${c.accent}" opacity="0.9"/>
        <path d="M50 30 L34 14 Q30 28 44 30 Z" fill="${PALETTE.coral}"/>
        <path d="M50 30 L66 14 Q70 28 56 30 Z" fill="${PALETTE.coral}"/>`;
    default:
      return `
        <path d="M16 46 Q50 22 84 46 V52 H16 Z" fill="${c.dark}" stroke="${PALETTE.ink}" stroke-width="3"/>
        <rect x="16" y="50" width="68" height="38" rx="5" fill="${PALETTE.wood}" stroke="${PALETTE.woodDark}" stroke-width="4"/>
        <rect x="16" y="62" width="68" height="9" fill="${c.main}"/>
        <rect x="44" y="50" width="12" height="38" fill="${c.main}"/>
        <rect x="40" y="66" width="20" height="14" rx="3" fill="${PALETTE.yellow}" stroke="${PALETTE.yellowDark}" stroke-width="3"/>
        <path d="M50 42 L32 26 Q28 42 44 44 Z" fill="${PALETTE.coral}"/>
        <path d="M50 42 L68 26 Q72 42 56 44 Z" fill="${PALETTE.coral}"/>
        <circle cx="50" cy="42" r="7" fill="${PALETTE.yellow}"/>
        <circle cx="26" cy="22" r="4" fill="${PALETTE.yellow}"/>
        <circle cx="74" cy="20" r="3" fill="${PALETTE.turquoise}"/>`;
  }
}

function lanternShape(cx, cy, w, h, main, dark) {
  return `
    <rect x="${cx - w / 2}" y="${cy - h / 2 - 4}" width="${w}" height="5" rx="2" fill="${dark}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" fill="${main}" stroke="${dark}" stroke-width="3"/>
    <path d="M${cx} ${cy - h / 2} V${cy + h / 2}" stroke="${dark}" stroke-width="2" opacity="0.5"/>
    <rect x="${cx - w / 2}" y="${cy + h / 2 - 2}" width="${w}" height="5" rx="2" fill="${dark}"/>`;
}

function lanternItem(level, c) {
  switch (level) {
    case 1:
      return `
        <rect x="40" y="44" width="20" height="40" rx="4" fill="${PALETTE.paper}" stroke="${PALETTE.stone}" stroke-width="3"/>
        <rect x="34" y="82" width="32" height="8" rx="3" fill="${c.dark}"/>
        <path d="M50 44 V34" stroke="${PALETTE.ink}" stroke-width="3"/>
        <path d="M50 14 Q60 26 50 34 Q40 26 50 14 Z" fill="${PALETTE.yellow}"/>
        <circle cx="50" cy="26" r="4" fill="${PALETTE.coral}"/>`;
    case 2:
      return `
        <path d="M50 10 V22" stroke="${PALETTE.ink}" stroke-width="3"/>
        ${lanternShape(50, 52, 36, 44, c.main, c.dark)}
        <circle cx="50" cy="52" r="9" fill="${PALETTE.yellow}"/>`;
    case 3:
      return `
        <path d="M50 6 V16" stroke="${PALETTE.ink}" stroke-width="3"/>
        ${lanternShape(50, 50, 56, 60, c.main, c.dark)}
        <path d="M30 36 Q50 44 70 36 M26 50 Q50 60 74 50 M30 64 Q50 72 70 64"
              fill="none" stroke="${c.dark}" stroke-width="2" opacity="0.6"/>
        <circle cx="50" cy="50" r="13" fill="${PALETTE.yellow}"/>
        <path d="M44 86 Q50 94 56 86" fill="none" stroke="${c.accent}" stroke-width="4"/>`;
    case 4:
      return `
        <path d="M6 24 Q50 44 94 24" fill="none" stroke="${PALETTE.ink}" stroke-width="4"/>
        ${lanternShape(22, 46, 26, 30, c.main, c.dark)}
        ${lanternShape(50, 56, 28, 32, PALETTE.coral, PALETTE.coralDark)}
        ${lanternShape(78, 46, 26, 30, PALETTE.purple, PALETTE.purpleDark)}
        <circle cx="22" cy="46" r="6" fill="${PALETTE.yellow}"/>
        <circle cx="50" cy="56" r="7" fill="${PALETTE.yellow}"/>
        <circle cx="78" cy="46" r="6" fill="${PALETTE.yellow}"/>`;
    default:
      return `
        <path d="M10 88 V52 Q50 14 90 52 V88" fill="none" stroke="${c.main}" stroke-width="10" stroke-linecap="round"/>
        <path d="M10 88 V52 Q50 14 90 52 V88" fill="none" stroke="${c.dark}" stroke-width="3" stroke-dasharray="5 6"/>
        ${lanternShape(20, 62, 18, 22, PALETTE.coral, PALETTE.coralDark)}
        ${lanternShape(35, 40, 18, 22, PALETTE.yellow, PALETTE.yellowDark)}
        ${lanternShape(50, 30, 20, 24, c.main, c.dark)}
        ${lanternShape(65, 40, 18, 22, PALETTE.purple, PALETTE.purpleDark)}
        ${lanternShape(80, 62, 18, 22, PALETTE.green, PALETTE.greenDark)}
        <circle cx="50" cy="30" r="6" fill="${PALETTE.paper}"/>`;
  }
}

const ITEM_DRAWERS = {
  paper: paperItem,
  flower: flowerItem,
  ribbon: ribbonItem,
  lantern: lanternItem,
};

/**
 * Picture for one item.
 * @param {string} family
 * @param {number} level 1-5
 */
export function itemArt(family, level) {
  const colour = familyColour(family);
  const drawer = ITEM_DRAWERS[family] || paperItem;
  const safeLevel = Math.max(1, Math.min(5, Number(level) || 1));
  return svg(drawer(safeLevel, colour), { extraClass: `art-item art-${family}` });
}

/** Small badge used on supply-source buttons. */
export function sourceArt(family) {
  const c = familyColour(family);
  const lid = {
    paper: `<rect x="24" y="30" width="52" height="14" rx="4" fill="${c.main}"/>`,
    flower: `<path d="M24 38 Q50 20 76 38 Z" fill="${c.main}"/>`,
    ribbon: `<rect x="24" y="30" width="52" height="14" rx="7" fill="${c.main}"/>`,
    lantern: `<path d="M26 40 L50 22 L74 40 Z" fill="${c.main}"/>`,
  }[family] || `<rect x="24" y="30" width="52" height="14" rx="4" fill="${c.main}"/>`;
  return svg(
    `${lid}
     <rect x="22" y="42" width="56" height="42" rx="7" fill="${PALETTE.paper}" stroke="${c.dark}" stroke-width="4"/>
     <rect x="30" y="52" width="40" height="7" rx="3" fill="${c.main}" opacity="0.55"/>
     <rect x="30" y="64" width="26" height="7" rx="3" fill="${c.dark}" opacity="0.4"/>
     <circle cx="70" cy="70" r="9" fill="${PALETTE.yellow}" stroke="${PALETTE.yellowDark}" stroke-width="3"/>
     <path d="M70 65 V75 M65 70 H75" stroke="${PALETTE.ink}" stroke-width="3" stroke-linecap="round"/>`,
    { extraClass: 'art-source' }
  );
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

const CHARACTERS = {
  'Mayor Ploy': { skin: '#f6c89a', hair: PALETTE.purple, cloth: PALETTE.purple, prop: 'sash' },
  'Mr Anan': { skin: '#e0a870', hair: PALETTE.ink, cloth: PALETTE.coral, prop: 'apron' },
  'Miss Nin': { skin: '#f8d2ac', hair: PALETTE.greenDark, cloth: PALETTE.green, prop: 'leaf' },
  'Grandma Dao': { skin: '#e8bb8f', hair: '#e9eef5', cloth: PALETTE.turquoise, prop: 'basket' },
  Detective: { skin: '#f2c49b', hair: '#3a2a1c', cloth: PALETTE.yellow, prop: 'glass' },
};

/**
 * Friendly character portrait.
 * @param {string} name one of the town characters
 * @param {'happy'|'thinking'|'cheer'} mood
 */
export function characterArt(name, mood = 'happy') {
  const c = CHARACTERS[name] || CHARACTERS.Detective;
  const mouth =
    mood === 'cheer'
      ? `<path d="M40 60 Q50 74 60 60 Z" fill="${PALETTE.coralDark}"/>`
      : mood === 'thinking'
        ? `<path d="M42 64 H58" stroke="${PALETTE.ink}" stroke-width="3" stroke-linecap="round"/>`
        : `<path d="M41 61 Q50 70 59 61" fill="none" stroke="${PALETTE.ink}" stroke-width="3.5" stroke-linecap="round"/>`;
  const eyes =
    mood === 'thinking'
      ? `<circle cx="40" cy="47" r="3.5" fill="${PALETTE.ink}"/><circle cx="60" cy="47" r="3.5" fill="${PALETTE.ink}"/>
         <path d="M34 38 Q40 34 46 38" fill="none" stroke="${PALETTE.ink}" stroke-width="3"/>`
      : `<circle cx="40" cy="47" r="4.5" fill="${PALETTE.ink}"/><circle cx="60" cy="47" r="4.5" fill="${PALETTE.ink}"/>
         <circle cx="41.5" cy="45.5" r="1.6" fill="${PALETTE.paper}"/><circle cx="61.5" cy="45.5" r="1.6" fill="${PALETTE.paper}"/>`;
  const prop = {
    sash: `<path d="M30 92 L70 78" stroke="${PALETTE.yellow}" stroke-width="7"/>`,
    apron: `<rect x="38" y="80" width="24" height="18" rx="3" fill="${PALETTE.paper}" opacity="0.9"/>`,
    leaf: `<path d="M72 74 Q84 66 84 78 Q74 82 72 74 Z" fill="${PALETTE.green}"/>`,
    basket: `<path d="M66 82 H88 L84 96 H70 Z" fill="${PALETTE.wood}" stroke="${PALETTE.woodDark}" stroke-width="3"/>`,
    glass: `<circle cx="78" cy="72" r="10" fill="none" stroke="${PALETTE.turquoiseDark}" stroke-width="4"/>
            <path d="M85 79 L94 90" stroke="${PALETTE.woodDark}" stroke-width="5" stroke-linecap="round"/>`,
  }[c.prop] || '';

  return svg(
    `<circle cx="50" cy="50" r="46" fill="${PALETTE.sky}"/>
     <path d="M16 100 Q24 74 50 74 Q76 74 84 100 Z" fill="${c.cloth}"/>
     <circle cx="50" cy="48" r="26" fill="${c.skin}"/>
     <path d="M24 42 Q28 16 50 16 Q72 16 76 42 Q64 30 50 32 Q36 30 24 42 Z" fill="${c.hair}"/>
     ${eyes}
     <circle cx="31" cy="55" r="5" fill="${PALETTE.coral}" opacity="0.45"/>
     <circle cx="69" cy="55" r="5" fill="${PALETTE.coral}" opacity="0.45"/>
     ${mouth}
     ${prop}`,
    { extraClass: 'art-character' }
  );
}

// ---------------------------------------------------------------------------
// Location scenes, with a clear before and after
// ---------------------------------------------------------------------------

function sceneFrame(restored) {
  const sky = restored ? '#cdf1f2' : '#e4e7ec';
  const ground = restored ? PALETTE.green : '#b7bdc7';
  return {
    sky,
    ground,
    open: `<rect width="200" height="120" fill="${sky}"/>
           <circle cx="168" cy="26" r="16" fill="${restored ? PALETTE.yellow : '#d6dae1'}"/>
           <rect y="92" width="200" height="28" fill="${ground}"/>`,
  };
}

function welcomeScene(restored, decoration) {
  const f = sceneFrame(restored);
  const extra = restored
    ? decoration === 'welcome-flags'
      ? `<path d="M34 42 Q100 58 166 42" fill="none" stroke="${PALETTE.ink}" stroke-width="2"/>
         <polygon points="48,46 60,48 54,62" fill="${PALETTE.coral}"/>
         <polygon points="72,50 84,51 78,65" fill="${PALETTE.yellow}"/>
         <polygon points="96,52 108,52 102,66" fill="${PALETTE.turquoise}"/>
         <polygon points="120,50 132,49 126,64" fill="${PALETTE.purple}"/>`
      : `<path d="M44 92 V58 Q100 26 156 58 V92" fill="none" stroke="${PALETTE.purple}" stroke-width="10"/>
         <circle cx="100" cy="36" r="8" fill="${PALETTE.yellow}"/>`
    : `<path d="M60 70 L72 80 M128 72 L140 82" stroke="#9aa2ae" stroke-width="3"/>`;
  return sceneSvg(
    `${f.open}
     <rect x="20" y="52" width="36" height="40" fill="${restored ? PALETTE.paper : '#cfd4db'}" stroke="${PALETTE.ink}" stroke-width="2"/>
     <polygon points="18,52 38,34 58,52" fill="${restored ? PALETTE.coral : '#aab1bb'}"/>
     <rect x="144" y="48" width="38" height="44" fill="${restored ? PALETTE.paper : '#cfd4db'}" stroke="${PALETTE.ink}" stroke-width="2"/>
     <polygon points="142,48 163,30 184,48" fill="${restored ? PALETTE.turquoise : '#aab1bb'}"/>
     <rect x="88" y="62" width="24" height="30" fill="${restored ? PALETTE.yellow : '#c3c9d1'}" stroke="${PALETTE.ink}" stroke-width="2"/>
     ${extra}`
  );
}

function cafeScene(restored, decoration) {
  const f = sceneFrame(restored);
  const extra = restored
    ? decoration === 'cafe-awning'
      ? `<path d="M40 50 H160 L150 64 H50 Z" fill="${PALETTE.coral}"/>
         <path d="M58 50 V64 M80 50 V64 M102 50 V64 M124 50 V64" stroke="${PALETTE.paper}" stroke-width="7"/>`
      : `<rect x="52" y="70" width="30" height="10" rx="3" fill="${PALETTE.wood}"/>
         <rect x="118" y="70" width="30" height="10" rx="3" fill="${PALETTE.wood}"/>
         ${bloom(60, 66, 7, PALETTE.coral, PALETTE.yellow)}${bloom(74, 66, 7, PALETTE.purple, PALETTE.paper)}
         ${bloom(126, 66, 7, PALETTE.turquoise, PALETTE.paper)}${bloom(140, 66, 7, PALETTE.yellow, PALETTE.coral)}`
    : `<rect x="52" y="70" width="30" height="10" rx="3" fill="#aeb5bf"/>
       <rect x="118" y="70" width="30" height="10" rx="3" fill="#aeb5bf"/>`;
  return sceneSvg(
    `${f.open}
     <rect x="34" y="40" width="132" height="52" fill="${restored ? PALETTE.paper : '#cfd4db'}" stroke="${PALETTE.ink}" stroke-width="2"/>
     <rect x="52" y="52" width="30" height="18" fill="${restored ? PALETTE.sky : '#bcc3cc'}" stroke="${PALETTE.ink}" stroke-width="2"/>
     <rect x="118" y="52" width="30" height="18" fill="${restored ? PALETTE.sky : '#bcc3cc'}" stroke="${PALETTE.ink}" stroke-width="2"/>
     <rect x="90" y="58" width="20" height="34" fill="${restored ? PALETTE.turquoise : '#b4bbc4'}" stroke="${PALETTE.ink}" stroke-width="2"/>
     ${restored ? `<rect x="34" y="34" width="132" height="8" fill="${PALETTE.purple}"/>` : ''}
     ${extra}`
  );
}

function gardenScene(restored, decoration) {
  const f = sceneFrame(restored);
  const extra = restored
    ? decoration === 'garden-arch'
      ? `<path d="M64 92 V60 Q100 38 136 60 V92" fill="none" stroke="${PALETTE.greenDark}" stroke-width="8"/>
         ${bloom(76, 52, 7, PALETTE.coral, PALETTE.yellow)}${bloom(100, 44, 7, PALETTE.purple, PALETTE.paper)}${bloom(124, 52, 7, PALETTE.yellow, PALETTE.coral)}`
      : `<path d="M44 92 L50 74 H70 L76 92 Z" fill="${PALETTE.coral}"/>
         <path d="M124 92 L130 74 H150 L156 92 Z" fill="${PALETTE.purple}"/>
         ${bloom(60, 66, 8, PALETTE.yellow, PALETTE.coralDark)}${bloom(140, 66, 8, PALETTE.turquoise, PALETTE.paper)}`
    : `<path d="M44 92 L50 78 H70 L76 92 Z" fill="#aeb5bf"/>
       <path d="M124 92 L130 78 H150 L156 92 Z" fill="#aeb5bf"/>`;
  return sceneSvg(
    `${f.open}
     <rect x="14" y="84" width="172" height="8" fill="${restored ? PALETTE.woodDark : '#9aa2ae'}"/>
     ${restored
      ? `<circle cx="28" cy="74" r="12" fill="${PALETTE.green}"/><circle cx="174" cy="72" r="14" fill="${PALETTE.greenDark}"/>`
      : `<circle cx="28" cy="78" r="8" fill="#a8afb9"/><circle cx="174" cy="78" r="9" fill="#a8afb9"/>`}
     ${extra}`
  );
}

function marketScene(restored, decoration) {
  const f = sceneFrame(restored);
  const water = restored ? PALETTE.turquoise : '#9fb3b6';
  const extra = restored
    ? decoration === 'market-stalls'
      ? `<path d="M26 54 H84 L78 64 H32 Z" fill="${PALETTE.coral}"/>
         <path d="M116 54 H174 L168 64 H122 Z" fill="${PALETTE.purple}"/>`
      : `<path d="M18 40 Q100 58 182 40" fill="none" stroke="${PALETTE.ink}" stroke-width="2"/>
         ${lanternShape(46, 50, 16, 18, PALETTE.coral, PALETTE.coralDark)}
         ${lanternShape(78, 56, 16, 18, PALETTE.yellow, PALETTE.yellowDark)}
         ${lanternShape(122, 56, 16, 18, PALETTE.turquoise, PALETTE.turquoiseDark)}
         ${lanternShape(154, 50, 16, 18, PALETTE.purple, PALETTE.purpleDark)}`
    : '';
  return sceneSvg(
    `${f.open}
     <rect y="96" width="200" height="24" fill="${water}"/>
     <path d="M0 100 Q25 94 50 100 T100 100 T150 100 T200 100" fill="none" stroke="${PALETTE.paper}" stroke-width="2" opacity="0.6"/>
     <rect x="26" y="62" width="58" height="30" fill="${restored ? PALETTE.paper : '#cfd4db'}" stroke="${PALETTE.ink}" stroke-width="2"/>
     <rect x="116" y="62" width="58" height="30" fill="${restored ? PALETTE.paper : '#cfd4db'}" stroke="${PALETTE.ink}" stroke-width="2"/>
     <path d="M70 108 Q86 100 102 108 Q86 114 70 108 Z" fill="${PALETTE.turquoiseDark}"/>
     ${extra}`
  );
}

function stageScene(restored, decoration) {
  const f = sceneFrame(restored);
  const extra = restored
    ? decoration === 'stage-banner'
      ? `<rect x="50" y="30" width="100" height="26" rx="4" fill="${PALETTE.purple}"/>
         <rect x="50" y="38" width="100" height="6" fill="${PALETTE.yellow}"/>`
      : `<path d="M44 86 V54 Q100 24 156 54 V86" fill="none" stroke="${PALETTE.turquoise}" stroke-width="9"/>
         ${lanternShape(60, 56, 14, 16, PALETTE.coral, PALETTE.coralDark)}
         ${lanternShape(100, 40, 16, 18, PALETTE.yellow, PALETTE.yellowDark)}
         ${lanternShape(140, 56, 14, 16, PALETTE.purple, PALETTE.purpleDark)}`
    : '';
  return sceneSvg(
    `${f.open}
     <rect x="30" y="74" width="140" height="18" fill="${restored ? PALETTE.wood : '#aab1bb'}" stroke="${PALETTE.woodDark}" stroke-width="2"/>
     <rect x="34" y="56" width="18" height="20" fill="${restored ? PALETTE.coral : '#bcc3cc'}"/>
     <rect x="148" y="56" width="18" height="20" fill="${restored ? PALETTE.coral : '#bcc3cc'}"/>
     ${restored ? `<circle cx="100" cy="66" r="7" fill="${PALETTE.yellow}"/>` : ''}
     ${extra}`
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
 * A location picture.
 * @param {string} key chapter key
 * @param {boolean} restored draw the restored "after" version
 * @param {string} decoration chosen decoration id
 */
export function sceneArt(key, restored, decoration) {
  const drawer = SCENES[key] || welcomeScene;
  return drawer(Boolean(restored), decoration);
}

/** Small map pin for the chapter map. */
export function mapPinArt(state) {
  const fill =
    state === 'done' ? PALETTE.green : state === 'current' ? PALETTE.coral : PALETTE.stone;
  const mark =
    state === 'done'
      ? `<path d="M38 50 L47 60 L64 40" fill="none" stroke="${PALETTE.paper}" stroke-width="9" stroke-linecap="round"/>`
      : state === 'current'
        ? `<circle cx="50" cy="48" r="11" fill="${PALETTE.paper}"/>`
        : `<rect x="42" y="38" width="16" height="22" rx="4" fill="none" stroke="${PALETTE.paper}" stroke-width="6"/>
           <path d="M44 38 V32 Q50 24 56 32 V38" fill="none" stroke="${PALETTE.paper}" stroke-width="5"/>`;
  return svg(
    `<path d="M50 94 Q18 60 18 42 A32 32 0 0 1 82 42 Q82 60 50 94 Z" fill="${fill}" stroke="${PALETTE.ink}" stroke-width="3"/>
     ${mark}`,
    { extraClass: `art-pin art-pin-${state}` }
  );
}

/** Clue-card decoration: a magnifying glass over a note. */
export function clueCardArt() {
  return svg(
    `<rect x="14" y="18" width="62" height="70" rx="6" fill="${PALETTE.paper}" stroke="${PALETTE.ink}" stroke-width="3"/>
     <rect x="24" y="30" width="42" height="5" rx="2" fill="${PALETTE.turquoise}"/>
     <rect x="24" y="42" width="34" height="5" rx="2" fill="${PALETTE.stone}"/>
     <rect x="24" y="54" width="38" height="5" rx="2" fill="${PALETTE.stone}"/>
     <circle cx="68" cy="66" r="17" fill="${PALETTE.sky}" fill-opacity="0.8" stroke="${PALETTE.turquoiseDark}" stroke-width="5"/>
     <path d="M80 78 L92 90" stroke="${PALETTE.woodDark}" stroke-width="7" stroke-linecap="round"/>`,
    { extraClass: 'art-clue' }
  );
}

/** The festival chest, shown at the ending. */
export function chestArt() {
  return svg(
    `<path d="M12 46 Q50 14 88 46 V54 H12 Z" fill="${PALETTE.woodDark}" stroke="${PALETTE.ink}" stroke-width="3"/>
     <rect x="12" y="52" width="76" height="40" rx="5" fill="${PALETTE.wood}" stroke="${PALETTE.woodDark}" stroke-width="4"/>
     <rect x="12" y="64" width="76" height="9" fill="${PALETTE.yellow}"/>
     <rect x="44" y="52" width="12" height="40" fill="${PALETTE.yellow}"/>
     <rect x="40" y="68" width="20" height="16" rx="3" fill="${PALETTE.yellowDark}" stroke="${PALETTE.ink}" stroke-width="2"/>
     <circle cx="50" cy="76" r="3" fill="${PALETTE.ink}"/>
     <circle cx="20" cy="26" r="4" fill="${PALETTE.coral}"/>
     <circle cx="80" cy="22" r="5" fill="${PALETTE.turquoise}"/>
     <circle cx="62" cy="16" r="3" fill="${PALETTE.purple}"/>`,
    { extraClass: 'art-chest' }
  );
}

/** Coin icon for the resource bar. */
export function coinArt() {
  return svg(
    `<circle cx="50" cy="50" r="38" fill="${PALETTE.yellow}" stroke="${PALETTE.yellowDark}" stroke-width="6"/>
     <circle cx="50" cy="50" r="24" fill="none" stroke="${PALETTE.yellowDark}" stroke-width="4"/>
     <path d="M50 34 V66 M42 42 H58 M42 58 H58" stroke="${PALETTE.yellowDark}" stroke-width="5" stroke-linecap="round"/>`,
    { extraClass: 'art-coin' }
  );
}

/** Supply-tap icon for the resource bar. */
export function chargeArt() {
  return svg(
    `<circle cx="50" cy="50" r="38" fill="${PALETTE.turquoise}" stroke="${PALETTE.turquoiseDark}" stroke-width="6"/>
     <path d="M54 22 L32 54 H48 L44 78 L68 44 H52 Z" fill="${PALETTE.paper}" stroke="${PALETTE.turquoiseDark}" stroke-width="3"/>`,
    { extraClass: 'art-charge' }
  );
}

export const CHARACTER_NAMES = Object.keys(CHARACTERS);
