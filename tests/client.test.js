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

const test = require('node:test');
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

/** Load art.js, which is an ES module, into this CommonJS test. */
function loadArt() {
  const source = artJs.replace(/^export /gm, '');
  const names = [
    'PALETTE', 'familyColour', 'itemArt', 'sourceArt', 'characterArt', 'sceneArt',
    'mapPinArt', 'clueCardArt', 'chestArt', 'coinArt', 'chargeArt', 'CHARACTER_NAMES',
  ];
  // eslint-disable-next-line no-new-func
  return new Function(`${source}\nreturn {${names.join(',')}};`)();
}

const art = loadArt();

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
