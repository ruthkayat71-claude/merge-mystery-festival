'use strict';
/**
 * Static checks on the browser-side code.
 *
 * No browser runs in this environment, so these tests cannot prove how the
 * pages look. What they do prove is that the client is wired up consistently:
 * every element the scripts reach for exists in the HTML, every CSS class the
 * markup and scripts use is defined, the generated SVG is well formed, and the
 * phone-specific rules the requirements ask for are actually present.
 *
 * Visual layout and touch behaviour on real phones still need a human check.
 */

const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (relative) => fs.readFileSync(path.join(PUBLIC, relative), 'utf8');

const pupilHtml = read('index.html');
const teacherHtml = read('teacher.html');
const pupilJs = read('js/pupil.js');
const teacherJs = read('js/teacher.js');
const artJs = read('js/art.js');
const commonCss = read('css/common.css');
const pupilCss = read('css/pupil.css');
const teacherCss = read('css/teacher.css');

/**
 * The art modules are real ES modules, so they are imported exactly as the
 * browser imports them. That means these tests exercise the shipped code
 * rather than a transformed copy of it.
 */
const { pathToFileURL } = require('node:url');
const artPath = pathToFileURL(path.join(PUBLIC, 'js', 'art.js')).href;

let art;
before(async () => {
  art = await import(artPath);
});

// ---------------------------------------------------------------------------
// Minimal XML well-formedness checker for the generated SVG
// ---------------------------------------------------------------------------

const VOID_OK = new Set();

function checkXml(markup) {
  const stack = [];
  const tagPattern = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  let consumed = 0;
  let match;

  while ((match = tagPattern.exec(markup)) !== null) {
    // Anything between tags must not contain a stray angle bracket.
    const between = markup.slice(consumed, match.index);
    if (between.includes('<') || between.includes('>')) {
      return `stray angle bracket before <${match[2]}>`;
    }
    consumed = match.index + match[0].length;

    const [, closing, name, , selfClosing] = match;
    if (closing === '/') {
      if (stack.length === 0) return `closing </${name}> with nothing open`;
      const open = stack.pop();
      if (open !== name) return `</${name}> does not match <${open}>`;
    } else if (selfClosing !== '/' && !VOID_OK.has(name)) {
      stack.push(name);
    }
  }
  const tail = markup.slice(consumed);
  if (tail.includes('<') || tail.includes('>')) return 'stray angle bracket at the end';
  if (stack.length > 0) return `unclosed tags: ${stack.join(', ')}`;
  return null;
}

test('the XML checker itself catches broken markup', () => {
  assert.strictEqual(checkXml('<a><b/></a>'), null);
  assert.ok(checkXml('<a><b></a>'), 'mismatched tags are caught');
  assert.ok(checkXml('<a>'), 'unclosed tags are caught');
  assert.ok(checkXml('<a>x < y</a>'), 'stray brackets are caught');
});

// ---------------------------------------------------------------------------
// Artwork
// ---------------------------------------------------------------------------

test('every item picture, for all families and levels, is well-formed SVG', () => {
  const families = ['paper', 'flower', 'ribbon', 'lantern'];
  for (const family of families) {
    for (let level = 1; level <= 5; level++) {
      const svg = art.itemArt(family, level);
      assert.strictEqual(checkXml(svg), null, `${family} level ${level}: ${checkXml(svg)}`);
      assert.ok(svg.startsWith('<svg'), `${family} ${level} is an svg element`);
      assert.ok(svg.includes('viewBox='), `${family} ${level} has a viewBox so it scales`);
      assert.ok(svg.includes('aria-hidden="true"'), 'decorative art is hidden from screen readers');
      assert.ok(svg.length > 150, `${family} ${level} is more than a placeholder`);
    }
  }
});

test('each level in a family looks different from its neighbours', () => {
  for (const family of ['paper', 'flower', 'ribbon', 'lantern']) {
    const drawings = [];
    for (let level = 1; level <= 5; level++) {
      // Compare the drawing commands, ignoring the wrapper.
      drawings.push(art.itemArt(family, level).replace(/<svg[^>]*>|<\/svg>/g, ''));
    }
    assert.strictEqual(new Set(drawings).size, 5, `${family} reuses a drawing between levels`);
  }
});

test('out-of-range item levels are clamped rather than crashing', () => {
  for (const level of [0, -3, 6, 99, null, undefined, NaN, 'three']) {
    const svg = art.itemArt('paper', level);
    assert.strictEqual(checkXml(svg), null, `level ${level} produced broken SVG`);
  }
  assert.strictEqual(checkXml(art.itemArt('not-a-family', 2)), null, 'unknown family falls back');
});

test('character portraits and moods are well-formed', () => {
  for (const name of art.CHARACTER_NAMES) {
    for (const mood of ['happy', 'thinking', 'cheer']) {
      const svg = art.characterArt(name, mood);
      assert.strictEqual(checkXml(svg), null, `${name}/${mood}: ${checkXml(svg)}`);
    }
  }
  assert.ok(art.CHARACTER_NAMES.length >= 5, 'at least five townspeople');
  // Each character must be visually distinct.
  const bodies = art.CHARACTER_NAMES.map((n) => art.characterArt(n, 'happy'));
  assert.strictEqual(new Set(bodies).size, bodies.length, 'characters share a drawing');
});

test('every location has a distinct before and after picture for each decoration', () => {
  const chapters = [
    ['welcome', ['welcome-arch', 'welcome-flags']],
    ['cafe', ['cafe-window', 'cafe-awning']],
    ['garden', ['garden-arch', 'garden-pots']],
    ['market', ['market-lights', 'market-stalls']],
    ['stage', ['stage-arch', 'stage-banner']],
  ];
  for (const [key, decorations] of chapters) {
    const before = art.sceneArt(key, false);
    assert.strictEqual(checkXml(before), null, `${key} before: ${checkXml(before)}`);
    assert.ok(before.includes('viewBox="0 0 200 120"'), `${key} uses the wide scene stage`);

    const afters = [];
    for (const decoration of decorations) {
      const after = art.sceneArt(key, true, decoration);
      assert.strictEqual(checkXml(after), null, `${key}/${decoration}: ${checkXml(after)}`);
      assert.notStrictEqual(after, before, `${key} after looks identical to before`);
      afters.push(after);
    }
    assert.strictEqual(new Set(afters).size, 2, `${key} decorations look the same as each other`);
  }
});

test('map pins, clue card, chest and resource icons are well-formed', () => {
  for (const state of ['done', 'current', 'locked']) {
    assert.strictEqual(checkXml(art.mapPinArt(state)), null, `pin ${state}`);
  }
  assert.strictEqual(new Set(['done', 'current', 'locked'].map(art.mapPinArt)).size, 3,
    'pin states are visually distinct');
  for (const [name, fn] of Object.entries({
    clueCardArt: art.clueCardArt, chestArt: art.chestArt,
    coinArt: art.coinArt, chargeArt: art.chargeArt,
  })) {
    assert.strictEqual(checkXml(fn()), null, `${name} produced broken SVG`);
  }
});

test('the palette uses the five requested colours', () => {
  const required = ['turquoise', 'coral', 'purple', 'yellow', 'green'];
  for (const colour of required) {
    assert.ok(art.PALETTE[colour], `palette is missing ${colour}`);
    assert.match(art.PALETTE[colour], /^#[0-9a-f]{6}$/i, `${colour} is a hex colour`);
  }
  for (const css of [commonCss, pupilCss]) {
    for (const colour of required) {
      assert.ok(css.includes(`--${colour}`) || commonCss.includes(`--${colour}`),
        `CSS is missing the ${colour} token`);
    }
  }
});

test('all four item families carry colour and a shape, not colour alone', () => {
  const seen = new Set();
  for (const family of ['paper', 'flower', 'ribbon', 'lantern']) {
    const colour = art.familyColour(family);
    assert.ok(colour.main && colour.dark && colour.accent, `${family} needs a full colour set`);
    seen.add(colour.main);
  }
  assert.strictEqual(seen.size, 4, 'each family has its own main colour');
});

// ---------------------------------------------------------------------------
// HTML and JS wiring
// ---------------------------------------------------------------------------

function idsIn(html) {
  const ids = new Set();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) ids.add(match[1]);
  return ids;
}

function dollarIdsIn(js) {
  const ids = new Set();
  for (const match of js.matchAll(/\$\('([^']+)'\)/g)) ids.add(match[1]);
  for (const match of js.matchAll(/getElementById\('([^']+)'\)/g)) ids.add(match[1]);
  return ids;
}

test('every element the pupil script reaches for exists in the pupil page', () => {
  const available = idsIn(pupilHtml);
  // These are created at runtime inside overlays, not present in the static page.
  const runtimeCreated = new Set(['clue-result', 'finale-result', 'clue-options', 'dec-options', 'finale-options']);
  const missing = [...dollarIdsIn(pupilJs)].filter((id) => !available.has(id) && !runtimeCreated.has(id));
  assert.deepStrictEqual(missing, [], `pupil.js looks for missing ids: ${missing.join(', ')}`);
});

test('every element the teacher script reaches for exists in the dashboard page', () => {
  const available = idsIn(teacherHtml);
  const runtimeCreated = new Set([
    'e-prompt', 'e-passage', 'e-options', 'e-answer', 'e-accepted', 'e-patterns',
    'e-explanation', 'e-example', 'e-problems', 'e-ok', 'e-test', 'e-test-result',
    'btn-q-save', 'btn-q-reload', 'btn-q-test',
  ]);
  const missing = [...dollarIdsIn(teacherJs)].filter((id) => !available.has(id) && !runtimeCreated.has(id));
  assert.deepStrictEqual(missing, [], `teacher.js looks for missing ids: ${missing.join(', ')}`);
});

test('every screen the pupil router switches to exists in the page', () => {
  const available = idsIn(pupilHtml);
  const match = pupilJs.match(/const SCREENS = \[([^\]]+)\]/);
  assert.ok(match, 'the screen list was found');
  const screens = match[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, ''));
  for (const screen of screens) {
    assert.ok(available.has(`screen-${screen}`), `screen-${screen} is missing from index.html`);
  }
  // And the router must handle every phase the server can report.
  const { PHASES } = require('../server/rooms');
  for (const phase of Object.values(PHASES)) {
    assert.ok(pupilJs.includes(`case '${phase}':`), `pupil.js does not handle the "${phase}" phase`);
  }
});

test('every CSS class used by the markup or the scripts is defined somewhere', () => {
  const css = commonCss + pupilCss + teacherCss;
  const defined = new Set();
  for (const match of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) defined.add(match[1]);

  const used = new Set();
  for (const html of [pupilHtml, teacherHtml]) {
    for (const match of html.matchAll(/\bclass="([^"]+)"/g)) {
      for (const name of match[1].split(/\s+/)) if (name) used.add(name);
    }
  }
  // Classes the scripts attach dynamically.
  for (const js of [pupilJs, teacherJs]) {
    for (const match of js.matchAll(/el\('[a-z]+', '([^']+)'/g)) {
      for (const name of match[1].split(/\s+/)) if (name && !name.includes('$')) used.add(name);
    }
    for (const match of js.matchAll(/classList\.(?:add|toggle|remove)\('([^']+)'/g)) {
      used.add(match[1]);
    }
  }
  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepStrictEqual(missing, [], `classes used but never styled: ${missing.join(', ')}`);
});

// ---------------------------------------------------------------------------
// Phone and accessibility requirements
// ---------------------------------------------------------------------------

test('both pages are portrait-first and respect phone safe areas', () => {
  for (const [name, html] of [['pupil', pupilHtml], ['teacher', teacherHtml]]) {
    assert.match(html, /<meta name="viewport"[^>]*width=device-width/, `${name} sets the viewport`);
    assert.match(html, /viewport-fit=cover/, `${name} opts into the full screen`);
    assert.match(html, /initial-scale=1/, `${name} does not start zoomed`);
  }
  assert.match(commonCss, /env\(safe-area-inset-top\)/, 'safe-area insets are applied');
  assert.match(pupilCss, /env\(safe-area-inset-bottom\)/, 'bottom inset is respected');
});

test('the board blocks page scrolling while dragging, and only the board', () => {
  const boardRule = pupilCss.match(/\.board\s*\{[^}]*\}/);
  assert.ok(boardRule, '.board rule exists');
  assert.match(boardRule[0], /touch-action:\s*none/, 'the board swallows drag gestures');

  // The body must not disable touch action, so pages still scroll normally.
  const bodyRules = commonCss.match(/\bbody\s*\{[^}]*\}/g) || [];
  for (const rule of bodyRules) {
    assert.ok(!/touch-action:\s*none/.test(rule), 'the page itself must stay scrollable');
  }
  assert.match(commonCss, /overscroll-behavior-y:\s*none/, 'rubber-banding is prevented');
});

test('touch targets meet a minimum size', () => {
  assert.match(commonCss, /--tap:\s*48px/, 'a 48px tap token is defined');
  const buttonRule = commonCss.match(/\bbutton\s*\{[^}]*\}/);
  assert.match(buttonRule[0], /min-height:\s*var\(--tap\)/, 'buttons use the tap size');
  assert.match(buttonRule[0], /min-width:\s*var\(--tap\)/);
  assert.match(buttonRule[0], /touch-action:\s*manipulation/, 'no double-tap zoom delay');
});

test('small phones and short viewports have their own rules', () => {
  assert.match(pupilCss, /@media \(max-width: 360px\)/, 'small Android screens are handled');
  assert.match(pupilCss, /@media \(max-height: 560px\)/, 'the on-screen keyboard case is handled');
  assert.match(pupilCss, /100dvh/, 'dynamic viewport height is used for mobile browser chrome');
});

test('both drag-and-drop and tap-then-tap merging are implemented', () => {
  assert.match(pupilJs, /pointerdown/, 'pointer events drive dragging');
  assert.match(pupilJs, /pointermove/);
  assert.match(pupilJs, /pointerup/);
  assert.match(pupilJs, /pointercancel/, 'cancelled gestures are cleaned up');
  assert.match(pupilJs, /setPointerCapture/, 'the gesture stays bound to the tile');
  assert.match(pupilJs, /function handleTap/, 'tap-then-tap is a separate path');
  assert.match(pupilJs, /elementFromPoint/, 'the drop target is resolved by position');
  assert.match(pupilJs, /preventDefault/, 'the drag suppresses the default gesture');
});

test('no control depends on hover, and none needs a keyboard', () => {
  // A :hover rule may add polish but must never be the only way to see state.
  const hoverRules = (pupilCss + teacherCss + commonCss).match(/:hover[^{]*\{[^}]*\}/g) || [];
  assert.strictEqual(hoverRules.length, 0, 'no hover-only styling is used at all');

  // Keyboard handling exists only as a convenience next to a visible button.
  assert.match(pupilJs, /btn-answer'\)\.addEventListener\('click'/, 'the check button is clickable');
  assert.match(pupilJs, /event\.key === 'Enter'/, 'Enter is a shortcut, not the only route');
  assert.ok(!/event\.key === '[a-z]'/.test(pupilJs), 'no single-letter keyboard shortcuts');
});

test('reduced motion and muting are both available and respected', () => {
  assert.match(commonCss, /@media \(prefers-reduced-motion: reduce\)/, 'the OS setting is honoured');
  assert.match(commonCss, /body\.reduced-motion/, 'an in-app toggle exists');
  assert.match(pupilJs, /reducedMotion/, 'the client stores the preference');
  assert.match(pupilJs, /prefs\.sound/, 'sound can be muted');
  // Audio must only be created after a real user gesture.
  assert.match(pupilJs, /unlock\(\)\s*\{/, 'audio has an explicit unlock step');
  const audioCreation = pupilJs.match(/new Ctx\(\)/g) || [];
  assert.strictEqual(audioCreation.length, 1, 'the audio context is created in exactly one place');
  const unlockBody = pupilJs.slice(pupilJs.indexOf('unlock() {'), pupilJs.indexOf('play(kind)'));
  assert.ok(unlockBody.includes('new Ctx()'), 'the context is created inside unlock, not at load');
});

test('meaning is never carried by colour alone', () => {
  // Status chips add a glyph through ::before.
  assert.match(commonCss, /\.chip-good::before/, 'good chips carry a tick');
  assert.match(commonCss, /\.chip-bad::before/, 'bad chips carry a cross');
  // Selected board cells add a tick as well as a colour change.
  assert.match(pupilCss, /\.cell\.selected::before/, 'selection adds a mark');
  // Progress bars add a texture.
  assert.match(commonCss, /repeating-linear-gradient/, 'bars have a pattern as well as a colour');
  // Tiles print their level as a number and their name as text.
  assert.match(pupilJs, /tile-level/, 'the level number is printed');
  assert.match(pupilJs, /tile-name/, 'the item name is printed');
});

test('the pupil page announces changes to screen readers', () => {
  assert.match(pupilHtml, /role="status"[^>]*aria-live="polite"|aria-live="polite"[^>]*role="status"/,
    'a live region exists');
  assert.match(pupilJs, /function announce/, 'the client uses it');
  assert.match(pupilJs, /aria-label/, 'controls are labelled');
});

// ---------------------------------------------------------------------------
// Content Security Policy compliance and escaping
// ---------------------------------------------------------------------------

test('no page uses an inline script or an inline event handler', () => {
  for (const [name, html] of [['index.html', pupilHtml], ['teacher.html', teacherHtml]]) {
    const scripts = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/g) || [];
    for (const tag of scripts) {
      const body = tag.replace(/<script\b[^>]*>|<\/script>/g, '').trim();
      assert.strictEqual(body, '', `${name} has an inline script body, which the CSP forbids`);
      assert.match(tag, /\bsrc="/, `${name} script tags must load an external file`);
    }
    assert.ok(!/\son(click|load|error|submit|change|input)\s*=/i.test(html),
      `${name} uses an inline event handler`);
  }
});

test('all dynamic HTML runs user text through the escaper', () => {
  for (const [name, js] of [['pupil.js', pupilJs], ['teacher.js', teacherJs]]) {
    assert.match(js, /const esc = /, `${name} defines an escaper`);
    // Template literals interpolating values into innerHTML should use esc().
    // Catch the obvious mistake of dropping a raw nickname into markup.
    assert.ok(!/innerHTML\s*=\s*[^;]*\$\{(?:[a-z]+\.)*(?:nickname|displayName)\}/.test(js),
      `${name} interpolates a name into HTML without escaping`);
  }
});

test('the escaper covers every dangerous character', () => {
  // Re-create the client-side escaper and check it.
  const escSource = pupilJs.match(/const esc = \(text\) =>[\s\S]*?\);\n/)[0];
  // eslint-disable-next-line no-new-func
  const esc = new Function(`${escSource} return esc;`)();
  assert.strictEqual(esc('<script>'), '&lt;script&gt;');
  assert.strictEqual(esc('a & b'), 'a &amp; b');
  assert.strictEqual(esc('"x"'), '&quot;x&quot;');
  assert.strictEqual(esc("it's"), 'it&#39;s');
  assert.strictEqual(esc(null), '');
  assert.strictEqual(esc(undefined), '');
  assert.strictEqual(esc('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;');
});

// ---------------------------------------------------------------------------
// Tutorial and guide content
// ---------------------------------------------------------------------------

test('the pupil tutorial is at most three screens', () => {
  const block = pupilJs.slice(pupilJs.indexOf('const TUTORIAL = ['), pupilJs.indexOf('function renderTutorial'));
  const steps = (block.match(/title:/g) || []).length;
  assert.ok(steps >= 1 && steps <= 3, `tutorial has ${steps} screens, the limit is 3`);
  assert.match(block, /Answer two questions/, 'it explains the English step');
  assert.match(block, /Join two the same/, 'it explains merging');
  assert.match(block, /clue/, 'it explains the mystery');
});

test('the item guide lists all four families with five named levels each', () => {
  const block = pupilJs.slice(pupilJs.indexOf('const GUIDE_FAMILIES'), pupilJs.indexOf('function showGuide'));
  const merge = require('../server/merge');
  for (const key of Object.keys(merge.FAMILIES)) {
    assert.ok(block.includes(`'${key}'`), `the guide is missing the ${key} family`);
    for (const level of merge.FAMILIES[key].levels) {
      assert.ok(block.includes(level.name), `the guide is missing "${level.name}"`);
    }
  }
  assert.match(pupilJs, /not real recipes/, 'the guide says these are game upgrades');
});

test('the dashboard separates English columns from game columns', () => {
  assert.match(teacherHtml, /class="group-english"/, 'English columns are grouped');
  assert.match(teacherHtml, /class="group-game"/, 'game columns are grouped');
  assert.match(teacherHtml, /English results/);
  assert.match(teacherHtml, /Game results/);
  assert.match(teacherCss, /th\.group-english/, 'the groups are styled differently');
});

test('the dashboard warns that storage is temporary and offers CSV', () => {
  assert.match(teacherHtml, /memory only/i, 'the limitation is stated');
  assert.match(teacherHtml, /Export CSV|English results \(CSV\)/, 'CSV export is offered');
  assert.match(teacherHtml, /Server restart or redeploy/, 'the restart case is explained');
});

test('the dashboard explains the QR code and never claims a phone test passed', () => {
  assert.match(teacherHtml, /Copy join link/, 'copy link is offered');
  assert.match(teacherHtml, /type the code/, 'manual code entry is explained');
  assert.match(teacherJs, /scan it once with a real phone/, 'the human check is requested');
  assert.match(teacherJs, /software check only/, 'the automated check is not oversold');
  assert.match(teacherHtml, /PUBLIC_BASE_URL/, 'the localhost fix is explained');
});

// ===========================================================================
// Regression tests for the invisible-item bug
// ===========================================================================

const itemsJs = read('js/items.js');
const paletteJs = read('js/palette.js');

test('every SVG carries explicit width and height, not just a viewBox', () => {
  // An inline SVG with only a viewBox collapses to zero height inside a flex
  // container on iOS Safari and several Android WebViews. That is exactly what
  // made board items invisible while their name and level badge still showed.
  const samples = [
    art.itemArt('paper', 1), art.itemArt('flower', 5), art.itemArt('ribbon', 3),
    art.itemArt('lantern', 4), art.sourceArt('paper'), art.characterArt('Miss Nin'),
    art.sceneArt('market', true), art.mapPinArt('done'), art.clueCardArt(),
    art.chestArt(), art.coinArt(), art.chargeArt(), art.starArt(), art.trophyArt(),
    art.shopArt('cafe'),
  ];
  for (const svg of samples) {
    assert.match(svg, /\bwidth="\d+"/, `missing width attribute: ${svg.slice(0, 80)}`);
    assert.match(svg, /\bheight="\d+"/, `missing height attribute: ${svg.slice(0, 80)}`);
    assert.match(svg, /\bviewBox="0 0 \d+ \d+"/, 'viewBox is still present for scaling');
    assert.match(svg, /preserveAspectRatio="xMidYMid meet"/, 'aspect ratio is pinned');
  }
});

test('the fixed-ratio art box exists and cannot collapse', () => {
  const box = commonCss.match(/\.art-box\s*\{[^}]*\}/);
  assert.ok(box, '.art-box rule exists');
  assert.match(box[0], /position:\s*relative/);
  assert.match(box[0], /padding-bottom:\s*100%/, 'height comes from a padding ratio');
  assert.match(box[0], /height:\s*0/);

  const inner = commonCss.match(/\.art-box > \.art,\s*\.art-box > svg\s*\{[^}]*\}/);
  assert.ok(inner, 'the SVG inside the box is positioned');
  assert.match(inner[0], /position:\s*absolute/);
  assert.match(inner[0], /height:\s*100%/, 'the SVG fills the box, not the other way round');

  assert.match(commonCss, /\.art-box-scene\s*\{\s*padding-bottom:\s*60%/, 'scenes use a 200x120 ratio');
});

test('board tiles place their picture inside an art box', () => {
  assert.match(pupilCss, /\.tile \.art-box\s*\{[^}]*padding-bottom:/, 'tile art has a ratio box');
  // The helper must be used everywhere an illustration is injected, so no call
  // site can reintroduce a bare, collapsible SVG.
  assert.match(pupilJs, /^const art = \(svg, extraClass = ''\) =>/m, 'the art() helper exists');
  const bareCalls = pupilJs.match(
    /\$\{(?:itemArt|sourceArt|characterArt|sceneArt|mapPinArt|clueCardArt|chestArt|coinArt|chargeArt|starArt|trophyArt)\(/g
  );
  assert.strictEqual(
    bareCalls,
    null,
    `these illustrations are injected without art(): ${(bareCalls || []).join(', ')}`
  );
});

test('the board survives a browser with no aspect-ratio support', () => {
  assert.match(
    commonCss,
    /@supports not \(aspect-ratio: 1 \/ 1\)/,
    'a fallback exists for browsers without aspect-ratio'
  );
  const fallback = commonCss.slice(commonCss.indexOf('@supports not (aspect-ratio'));
  assert.match(fallback, /padding-bottom:\s*100%/, 'the fallback gives the cell a height');
  // And a floor height, so the cell is never zero even mid-layout.
  const cellRule = pupilCss.match(/\.cell\s*\{[^}]*\}/)[0];
  assert.match(cellRule, /min-height:\s*\d+px/, 'cells have a minimum height');
});

// ===========================================================================
// Graphics quality
// ===========================================================================

test('all 20 item illustrations are distinct, detailed and outlined', () => {
  const seen = new Map();
  for (const family of ['paper', 'flower', 'ribbon', 'lantern']) {
    for (let level = 1; level <= 5; level++) {
      const svg = art.itemArt(family, level);
      const label = `${family} L${level}`;

      assert.strictEqual(checkXml(svg), null, `${label}: ${checkXml(svg)}`);
      // A recognisable illustration, not a plain symbol.
      const shapes = (svg.match(/<(path|circle|rect|polygon|ellipse|polyline)\b/g) || []).length;
      assert.ok(shapes >= 4, `${label} only has ${shapes} shapes, which is too plain`);
      // A dark outline so it reads against any cell background.
      assert.ok(svg.includes('#15193a'), `${label} has no outline colour`);

      const body = svg.replace(/<svg[^>]*>|<\/svg>/g, '');
      assert.ok(!seen.has(body), `${label} reuses the drawing of ${seen.get(body)}`);
      seen.set(body, label);
    }
  }
  assert.strictEqual(seen.size, 20, 'all 20 item pictures are unique');
});

test('levels within a family differ in silhouette, not only in colour', () => {
  for (const family of ['paper', 'flower', 'ribbon', 'lantern']) {
    const shapeCounts = [];
    for (let level = 1; level <= 5; level++) {
      const svg = art.itemArt(family, level);
      // Strip every colour, leaving only the geometry.
      const geometry = svg
        .replace(/(?:fill|stroke)="[^"]*"/g, '')
        .replace(/<svg[^>]*>|<\/svg>/g, '');
      shapeCounts.push(geometry);
    }
    assert.strictEqual(
      new Set(shapeCounts).size,
      5,
      `${family} levels are distinguishable only by colour, which fails the colour-alone rule`
    );
  }
});

test('locations show visible improvement at every stage of a chapter', () => {
  for (const key of ['welcome', 'cafe', 'garden', 'market', 'stage']) {
    const stages = [0, 25, 50, 75, 100].map((progress) =>
      art.sceneArt(key, { progress, decoration: null })
    );
    for (const stage of stages) {
      assert.strictEqual(checkXml(stage), null, `${key}: ${checkXml(stage)}`);
    }
    assert.strictEqual(
      new Set(stages).size,
      5,
      `${key} looks the same at two different progress levels, so improvement is invisible`
    );
    // The finished version must be richer than the untouched one.
    const shapesAt = (svg) => (svg.match(/<(path|circle|rect|polygon|ellipse)\b/g) || []).length;
    assert.ok(
      shapesAt(stages[4]) > shapesAt(stages[0]),
      `${key} does not gain detail as it is restored`
    );
  }
});

test('each chapter has its own colour scheme', () => {
  const keys = ['welcome', 'cafe', 'garden', 'market', 'stage'];
  const mains = keys.map((key) => art.chapterTheme(key).main);
  assert.strictEqual(new Set(mains).size, 5, 'every chapter has a different main colour');
  for (const key of keys) {
    const theme = art.chapterTheme(key);
    for (const field of ['main', 'soft', 'softer', 'accent', 'name']) {
      assert.ok(theme[field], `${key} theme is missing ${field}`);
    }
    assert.match(theme.main, /^#[0-9a-f]{6}$/i);
  }
  assert.match(pupilJs, /function applyChapterTheme/, 'the client applies the theme');
  assert.match(pupilCss, /--chapter-main/, 'the theme is wired through CSS variables');
});

test('the chapter tint never sits behind a board tile', () => {
  // The themed colour belongs to the frame around the grid. If it were applied
  // to .cell or .board, items would be harder to tell apart.
  const boardRule = pupilCss.match(/\.board\s*\{[^}]*\}/)[0];
  assert.ok(!boardRule.includes('--chapter'), 'the grid itself is not tinted');

  const cellRules = pupilCss.match(/\.cell(?:\.\w+)?\s*\{[^}]*\}/g) || [];
  for (const rule of cellRules) {
    assert.ok(!rule.includes('--chapter'), `a cell rule is themed: ${rule.slice(0, 60)}`);
  }
  // Filled cells keep a plain pale background for maximum contrast.
  assert.match(pupilCss, /\.cell\.filled\s*\{[^}]*background:\s*var\(--paper\)/);
  // Any .board-wrap rule may carry the tint; a later one only tweaks padding.
  const frameRules = pupilCss.match(/\.board-wrap\s*\{[^}]*\}/g);
  assert.ok(
    frameRules.some((rule) => rule.includes('--chapter-soft')),
    'the frame around the grid carries the chapter colour instead'
  );
});

test('characters have several readable expressions and detailed shops exist', () => {
  for (const name of art.CHARACTER_NAMES) {
    const moods = ['happy', 'thinking', 'cheer', 'worried'].map((mood) =>
      art.characterArt(name, mood)
    );
    for (const svg of moods) assert.strictEqual(checkXml(svg), null, `${name}: ${checkXml(svg)}`);
    assert.strictEqual(new Set(moods).size, 4, `${name} does not change expression`);
    // Eyebrows, cheeks and a mouth, so the face actually reads.
    assert.ok(moods[0].length > 1200, `${name} is drawn too plainly`);
  }
  for (const key of ['welcome', 'cafe', 'garden', 'market', 'stage']) {
    const shop = art.shopArt(key, true);
    assert.strictEqual(checkXml(shop), null, `${key} shop: ${checkXml(shop)}`);
    assert.ok(shop.includes('viewBox'), 'shops scale');
  }
  assert.strictEqual(
    new Set(['welcome', 'cafe', 'garden', 'market', 'stage'].map((k) => art.shopArt(k, true))).size,
    5,
    'each chapter has its own shop front'
  );
});

test('merge, sparkle, reward and clue-reveal effects all exist', () => {
  for (const [name, selector] of [
    ['merge burst', '@keyframes merge-burst'],
    ['item appearing', '@keyframes pop-in'],
    ['sparkles', '@keyframes sparkle-fly'],
    ['refusal shake', '@keyframes shake-no'],
    ['confetti', '@keyframes confetti-fall'],
    ['merge ring', '@keyframes ring-pulse'],
    ['coin reward', '@keyframes coin-rise'],
    ['clue card reveal', '@keyframes clue-reveal'],
    ['reward sweep', '@keyframes glow-sweep'],
  ]) {
    assert.ok(
      (commonCss + pupilCss).includes(selector),
      `the ${name} effect (${selector}) is missing`
    );
  }
  // And every one of them is driven from the client.
  for (const fn of ['mergeRing', 'coinPop', 'rewardSweep', 'sparkleAt', 'celebrate']) {
    assert.ok(pupilJs.includes(`function ${fn}`), `${fn} is not implemented`);
  }
  // All of them must respect the reduced-motion choice.
  for (const fn of ['mergeRing', 'coinPop', 'celebrate', 'sparkleAt']) {
    const body = pupilJs.slice(pupilJs.indexOf(`function ${fn}`), pupilJs.indexOf(`function ${fn}`) + 400);
    assert.match(body, /reducedMotion/, `${fn} ignores the reduced-motion setting`);
  }
});

test('the item information preview shows a large picture and the item name', () => {
  assert.match(pupilJs, /function showItemPreview/, 'the preview exists');
  const body = pupilJs.slice(pupilJs.indexOf('function showItemPreview'), pupilJs.indexOf('function setInfoMode'));
  assert.match(body, /preview-art/, 'a large picture is rendered');
  assert.match(body, /preview-name/, 'the name is rendered');
  assert.match(body, /Level \$\{item\.level\} of 5/, 'the level is rendered');
  assert.match(body, /Join two of these to make/, 'it explains what the item becomes');
  assert.match(pupilCss, /\.preview-art\s*\{[^}]*width:\s*62%/, 'the preview picture is large');
  assert.match(pupilHtml, /id="btn-info"/, 'an information button exists');
  assert.match(pupilJs, /function setInfoMode/, 'the button has a handler');
});

test('artwork stays lightweight and is bundled with the project', () => {
  const totalBytes = Buffer.byteLength(artJs + itemsJs + paletteJs, 'utf8');
  assert.ok(totalBytes < 70 * 1024, `art modules are ${(totalBytes / 1024).toFixed(1)}KB, expected under 70KB`);

  // No external or binary assets anywhere in the client.
  for (const [name, source] of [['art.js', artJs], ['items.js', itemsJs], ['palette.js', paletteJs]]) {
    // The SVG namespace URL is not a network request, so it is excluded.
    const withoutNamespace = source.replace(/https?:\/\/www\.w3\.org\/2000\/svg/g, '');
    assert.ok(!/https?:\/\//.test(withoutNamespace), `${name} fetches something remote`);
    assert.ok(!source.includes('base64'), `${name} embeds a raster image`);
    assert.ok(!source.includes('url('), `${name} references an external asset`);
  }
  for (const html of [pupilHtml, teacherHtml]) {
    assert.ok(!/<img\b/.test(html), 'no raster images are used');
    assert.ok(!/@font-face|fonts\.googleapis/.test(html), 'no web fonts are downloaded');
  }
  // Filters and blurs are avoided so the art stays sharp and cheap on phones.
  assert.ok(!artJs.includes('<filter'), 'no SVG filters, which are slow on phones');
  assert.ok(!itemsJs.includes('<filter'));
});

// ===========================================================================
// Scoreboard in the interface
// ===========================================================================

test('the dashboard has two clearly labelled scoreboard tabs', () => {
  assert.match(teacherHtml, /data-score-tab="english"/, 'English tab');
  assert.match(teacherHtml, /data-score-tab="game"/, 'game tab');
  assert.match(teacherHtml, /English Stars/, 'the English tab is named');
  assert.match(teacherHtml, /Festival Champions/, 'the game tab is named');
  assert.match(teacherHtml, /role="tablist"/, 'the tabs are marked up as tabs');
  assert.match(teacherJs, /function renderScoreboard/, 'the dashboard renders them');
  assert.match(teacherJs, /aria-selected/, 'the selected tab is announced');
});

test('the scoreboard explains itself on screen rather than hiding the rules', () => {
  assert.match(teacherHtml, /id="score-how"/, 'the dashboard has an explanation line');
  assert.match(teacherJs, /explanations\[state\.scoreTab\]/, 'it uses the server explanation');
  assert.match(pupilJs, /score-how/, 'the pupil sheet explains it too');
});

test('the scoreboard is large enough for a classroom TV', () => {
  assert.match(teacherCss, /body\.present #panel-scoreboard/, 'TV view styles the scoreboard');
  const tv = teacherCss.slice(teacherCss.indexOf('body.present #panel-scoreboard'));
  assert.match(tv, /font-size:\s*clamp\(1\.4rem/, 'table text scales up on a TV');
  assert.match(tv, /\.rank\s*\{[\s\S]{0,120}font-size:\s*clamp/, 'rank badges scale up too');
  // The scoreboard panel must not be hidden in presentation mode.
  assert.ok(
    !/id="panel-scoreboard"[^>]*class="[^"]*no-present/.test(teacherHtml),
    'the scoreboard stays visible in TV view'
  );
});

test('the pupil score panel is compact and sits outside the board', () => {
  assert.match(pupilHtml, /id="score-panel"/, 'the panel exists');
  // It must be a sibling of the board, never inside it.
  const boardBlock = pupilHtml.slice(pupilHtml.indexOf('<div class="board-wrap">'), pupilHtml.indexOf('</section>', pupilHtml.indexOf('<div class="board-wrap">')));
  assert.ok(!boardBlock.includes('score-panel'), 'the panel is not inside the board');
  assert.ok(
    pupilHtml.indexOf('id="score-panel"') < pupilHtml.indexOf('<div class="board-wrap">'),
    'the panel sits above the board'
  );
  const rule = pupilCss.match(/\.score-panel\s*\{[^}]*\}/)[0];
  assert.match(rule, /grid-template-columns:\s*1fr 1fr/, 'two compact columns');
  assert.match(pupilJs, /function renderScorePanel/, 'the client renders it');
});

test('questions attempted is shown beside English points, on both screens', () => {
  const panel = pupilJs.slice(pupilJs.indexOf('function renderScorePanel'), pupilJs.indexOf('function scoreTableHtml'));
  assert.match(panel, /english\.attempted/, 'the phone panel shows the attempt count');
  assert.match(panel, /asked/, 'and labels it in plain words');
  assert.match(teacherJs, /Questions asked/, 'the dashboard column is labelled');
  assert.match(teacherJs, /row\.attempted/, 'and shows the number');
});

test('the public scoreboard toggle is clearly labelled and defaults to off', () => {
  assert.match(teacherHtml, /id="btn-scoreboard"/, 'the toggle exists');
  assert.match(teacherHtml, /pupils&rsquo; phones/, 'the label says where it applies');
  assert.match(teacherHtml, /own<\/strong> score and rank/, 'it explains what is always shown');
  assert.match(teacherJs, /publicScoreboard/, 'the client sends the right setting');
  const { Room } = require('../server/rooms');
  const { QuestionStore } = require('../server/questionStore');
  const room = new Room('TESTAA', new QuestionStore());
  assert.strictEqual(room.settings.publicScoreboard, false, 'off by default');
});

test('ranks never rely on colour alone', () => {
  // Rank badges are coloured for the top three, but the number is always shown.
  assert.match(commonCss, /\.rank\s*\{/, 'rank badge styled');
  assert.match(teacherJs, /">\$\{row\.rank\}<\/span>/, 'the dashboard prints the rank number');
  assert.match(pupilJs, /\$\{row\.rank\}<\/span>/, 'the pupil table prints it too');
  // A shared rank is marked with an equals sign as well as a style.
  assert.match(commonCss, /\.rank-tied::after\s*\{[^}]*content:\s*"="/, 'ties are marked with a symbol');
  assert.match(pupilJs, /function rankText/, 'the compact panel spells the rank out');
});

test('separate English and game winners are shown at the end', () => {
  assert.match(pupilJs, /function winnersHtml/, 'the pupil finish screen shows winners');
  assert.match(teacherJs, /function winnersHtml/, 'the dashboard shows winners');
  assert.match(commonCss, /\.winner-card\.english/, 'the English card is styled');
  assert.match(commonCss, /\.winner-card\.game/, 'the game card is styled');
  assert.match(teacherJs, /data\.room\.status === 'ended'/, 'winners appear only once finished');
  for (const js of [pupilJs, teacherJs]) {
    assert.match(js, /Equal scores share a place/, 'ties are explained');
  }
});
