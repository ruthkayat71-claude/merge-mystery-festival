/**
 * Shared colours for Merge Mystery: The Missing Festival.
 *
 * Kept in its own module so the item illustrations and the scene illustrations
 * can both use it without importing each other.
 *
 * The five requested festival colours are turquoise, coral, purple, yellow and
 * green. Each has a darker partner for outlines and shading. Contrast against
 * the near-white board cells was chosen so every item stays legible, and no
 * meaning anywhere in the game depends on colour alone.
 */

export const PALETTE = {
  turquoise: '#17bfc4',
  turquoiseDark: '#0b7a7d',
  coral: '#ff6f5e',
  coralDark: '#c53c28',
  purple: '#7b4fd3',
  purpleDark: '#4e2b96',
  yellow: '#ffc53d',
  yellowDark: '#9a6b00',
  green: '#35bd6a',
  greenDark: '#1a7641',

  ink: '#171a33',
  paper: '#fffdf7',
  sky: '#dff6f7',
  stone: '#b9c2d0',
  wood: '#b67c46',
  woodDark: '#7d502a',
  dull: '#b2b8c4',
  dullDark: '#8d94a3',
};

/** The outline colour every illustration shares, for a consistent style. */
export const OUTLINE = '#15193a';

const FAMILY_COLOUR = {
  paper: { main: PALETTE.purple, dark: PALETTE.purpleDark, accent: PALETTE.yellow },
  flower: { main: PALETTE.coral, dark: PALETTE.coralDark, accent: PALETTE.green },
  ribbon: { main: PALETTE.yellow, dark: PALETTE.yellowDark, accent: PALETTE.coral },
  lantern: { main: PALETTE.turquoise, dark: PALETTE.turquoiseDark, accent: PALETTE.yellow },
};

export function familyColour(family) {
  return FAMILY_COLOUR[family] || FAMILY_COLOUR.paper;
}

/**
 * Each chapter gets its own colour scheme, so a glance at the screen tells a
 * pupil where in the story they are. These tint the board frame, the header and
 * the page background only. Board cells stay pale and plain, because a
 * decorative background behind the tiles would make matching harder.
 */
export const CHAPTER_THEMES = {
  welcome: {
    name: 'Welcome Square',
    main: PALETTE.purple,
    soft: '#efe7ff',
    softer: '#f7f3ff',
    accent: PALETTE.yellow,
  },
  cafe: {
    name: 'Rainbow Caf\u00e9',
    main: PALETTE.coral,
    soft: '#ffe9e4',
    softer: '#fff5f2',
    accent: PALETTE.turquoise,
  },
  garden: {
    name: 'Hobby Garden',
    main: PALETTE.green,
    soft: '#e2f8ea',
    softer: '#f2fcf6',
    accent: PALETTE.yellow,
  },
  market: {
    name: 'Riverside Market',
    main: PALETTE.turquoise,
    soft: '#dff6f7',
    softer: '#f0fbfb',
    accent: PALETTE.coral,
  },
  stage: {
    name: 'Festival Stage',
    main: PALETTE.yellow,
    soft: '#fff3d6',
    softer: '#fffaef',
    accent: PALETTE.purple,
  },
};

export function chapterTheme(key) {
  return CHAPTER_THEMES[key] || CHAPTER_THEMES.welcome;
}
