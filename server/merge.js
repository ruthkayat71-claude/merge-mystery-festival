'use strict';
/**
 * Merge board engine, missions, economy and story progression.
 *
 * The server owns the authoritative board. Clients may animate optimistically
 * but every action is re-validated here, and every action carries a nonce so a
 * double-tap or a retried request cannot merge twice or pay out twice.
 *
 * Board geometry: 5 columns x 6 rows = 30 cells, index = row * 5 + col.
 * A few cells start locked and are opened by completing town requests.
 */

const COLUMNS = 5;
const ROWS = 6;
const CELL_COUNT = COLUMNS * ROWS;
const TRAY_SLOTS = 3;
const MAX_LEVEL = 5;

const DEFAULT_ROUND_ALLOWANCE = 8;
const CHARGE_CAP = 24;
const INITIAL_LOCKED = [25, 26, 27, 28, 29];
const MISSIONS_PER_UNLOCK = 2;
const COINS_PER_CHARGE = 5;
const ACTIVE_MISSIONS = 3;
const NONCE_MEMORY = 400;

// ---------------------------------------------------------------------------
// Item families. Five levels each, named so the upgrade chain reads clearly.
// These are game upgrades, not real-world recipes.
// ---------------------------------------------------------------------------

const FAMILIES = {
  paper: {
    key: 'paper',
    label: 'Paper Decorations',
    colour: 'purple',
    source: 'Paper Workshop',
    sourceHint: 'Makes paper decorations',
    levels: [
      { name: 'Paper Shape', short: 'Shape' },
      { name: 'Paper Chain', short: 'Chain' },
      { name: 'Bunting', short: 'Bunting' },
      { name: 'Festival Banner', short: 'Banner' },
      { name: 'Entrance Decoration', short: 'Entrance' },
    ],
  },
  flower: {
    key: 'flower',
    label: 'Flowers',
    colour: 'coral',
    source: 'Flower Cart',
    sourceHint: 'Makes single flowers',
    levels: [
      { name: 'Flower', short: 'Flower' },
      { name: 'Small Bunch', short: 'Bunch' },
      { name: 'Bouquet', short: 'Bouquet' },
      { name: 'Flower Basket', short: 'Basket' },
      { name: 'Festival Flower Display', short: 'Display' },
    ],
  },
  ribbon: {
    key: 'ribbon',
    label: 'Gifts',
    colour: 'yellow',
    source: 'Ribbon Box',
    sourceHint: 'Makes ribbons',
    levels: [
      { name: 'Ribbon', short: 'Ribbon' },
      { name: 'Bow', short: 'Bow' },
      { name: 'Gift Bag', short: 'Gift Bag' },
      { name: 'Gift Box', short: 'Gift Box' },
      { name: 'Festival Gift Chest', short: 'Gift Chest' },
    ],
  },
  lantern: {
    key: 'lantern',
    label: 'Lights',
    colour: 'turquoise',
    source: 'Candle Stall',
    sourceHint: 'Makes candles',
    levels: [
      { name: 'Candle', short: 'Candle' },
      { name: 'Small Lantern', short: 'Small Lantern' },
      { name: 'Paper Lantern', short: 'Lantern' },
      { name: 'Lantern String', short: 'String' },
      { name: 'Festival Light Arch', short: 'Light Arch' },
    ],
  },
};

const FAMILY_KEYS = Object.keys(FAMILIES);

/** Level-1 items needed to build one item of the given level. */
function buildCost(level) {
  return Math.pow(2, level - 1);
}

function itemName(family, level) {
  return FAMILIES[family].levels[level - 1].name;
}

// ---------------------------------------------------------------------------
// Chapters and the mystery
// ---------------------------------------------------------------------------

const CHAPTERS = [
  {
    id: 1,
    key: 'welcome',
    name: 'Welcome Square',
    intro:
      'The festival flags never arrived at Welcome Square. Mayor Ploy needs decorations for the gate.',
    outro: 'Welcome Square looks bright again. Mayor Ploy gives you your first clue card.',
    families: ['paper'],
    requestsNeeded: 6,
    maxRequestLevel: 3,
    decorations: [
      { id: 'welcome-arch', name: 'Purple Paper Arch', note: 'A tall arch over the gate' },
      { id: 'welcome-flags', name: 'Row of Bunting Flags', note: 'Flags along the wall' },
    ],
    clue: {
      id: 'clue-1',
      title: 'Clue Card 1',
      from: 'Mayor Ploy',
      sentences: ['The chest is not inside a building.', 'It is outside, under the open sky.'],
      check: {
        prompt: 'Is the festival chest inside a building?',
        options: ['No, it is outside.', 'Yes, it is inside.', 'The clue does not say.'],
        answer: 'No, it is outside.',
        explanation: 'The clue says the chest is outside, under the open sky.',
      },
    },
  },
  {
    id: 2,
    key: 'cafe',
    name: 'Rainbow Caf\u00e9',
    intro:
      'Mr Anan\u2019s caf\u00e9 lost its flower boxes. He needs flowers and paper decorations for the windows.',
    outro: 'The caf\u00e9 windows are full of flowers. Mr Anan hands you a clue card.',
    families: ['paper', 'flower'],
    requestsNeeded: 8,
    maxRequestLevel: 3,
    decorations: [
      { id: 'cafe-window', name: 'Coral Window Boxes', note: 'Flowers under every window' },
      { id: 'cafe-awning', name: 'Rainbow Awning', note: 'A striped roof over the door' },
    ],
    clue: {
      id: 'clue-2',
      title: 'Clue Card 2',
      from: 'Mr Anan',
      sentences: ['You can hear water from the chest.', 'It is near the river.'],
      check: {
        prompt: 'What can you hear near the chest?',
        options: ['water', 'music', 'birds', 'cars'],
        answer: 'water',
        explanation: 'The clue says you can hear water, because the chest is near the river.',
      },
    },
  },
  {
    id: 3,
    key: 'garden',
    name: 'Hobby Garden',
    intro:
      'Miss Nin\u2019s garden club needs gift bags for the hobby show, and flowers for the beds.',
    outro: 'The Hobby Garden is ready for the show. Miss Nin gives you a clue card.',
    families: ['paper', 'flower', 'ribbon'],
    requestsNeeded: 9,
    maxRequestLevel: 4,
    decorations: [
      { id: 'garden-arch', name: 'Green Plant Arch', note: 'Climbing plants over the path' },
      { id: 'garden-pots', name: 'Painted Flower Pots', note: 'Bright pots along the beds' },
    ],
    clue: {
      id: 'clue-3',
      title: 'Clue Card 3',
      from: 'Miss Nin',
      sentences: ['A lantern hangs above the chest.', 'It gives light at night.'],
      check: {
        prompt: 'What hangs above the chest?',
        options: ['a lantern', 'a flag', 'a basket', 'a bell'],
        answer: 'a lantern',
        explanation: 'The clue says a lantern hangs above the chest and gives light at night.',
      },
    },
  },
  {
    id: 4,
    key: 'market',
    name: 'Riverside Market',
    intro:
      'The Riverside Market is dark. Grandma Dao needs lanterns, and gifts for the market stalls.',
    outro: 'Lanterns glow along the river. Grandma Dao gives you a clue card.',
    families: ['paper', 'flower', 'ribbon', 'lantern'],
    requestsNeeded: 10,
    maxRequestLevel: 4,
    decorations: [
      { id: 'market-lights', name: 'Turquoise Lantern Line', note: 'Lanterns across the stalls' },
      { id: 'market-stalls', name: 'Striped Stall Roofs', note: 'New roofs for every stall' },
    ],
    clue: {
      id: 'clue-4',
      title: 'Clue Card 4',
      from: 'Grandma Dao',
      sentences: ['A small blue boat is beside the chest.'],
      check: {
        prompt: 'What colour is the boat beside the chest?',
        options: ['blue', 'red', 'green', 'yellow'],
        answer: 'blue',
        explanation: 'The clue says a small blue boat is beside the chest.',
      },
    },
  },
  {
    id: 5,
    key: 'stage',
    name: 'Festival Stage',
    intro:
      'The last job is the Festival Stage. Everyone is waiting! Build the biggest decorations of all.',
    outro: 'The stage is ready. Mayor Ploy reads the last clue to the whole town.',
    families: ['paper', 'flower', 'ribbon', 'lantern'],
    requestsNeeded: 11,
    maxRequestLevel: 5,
    decorations: [
      { id: 'stage-arch', name: 'Festival Light Arch', note: 'A glowing arch over the stage' },
      { id: 'stage-banner', name: 'Giant Welcome Banner', note: 'A huge banner behind the stage' },
    ],
    clue: {
      id: 'clue-5',
      title: 'Clue Card 5',
      from: 'Mayor Ploy',
      sentences: ['Look under the old wooden bridge.', 'The blue boat is tied there.'],
      check: {
        prompt: 'Where is the blue boat tied?',
        options: [
          'under the old wooden bridge',
          'behind the stage',
          'inside the caf\u00e9',
          'in the garden',
        ],
        answer: 'under the old wooden bridge',
        explanation: 'The clue says the blue boat is tied under the old wooden bridge.',
      },
    },
  },
];

/**
 * The final choice. Exactly one option satisfies every clue, and each wrong
 * option is wrong because of a specific clue the pupil already holds.
 */
const FINALE = {
  prompt: 'Read your five clue cards. Where is the missing festival chest?',
  options: [
    {
      id: 'cafe-kitchen',
      label: 'Inside the Rainbow Caf\u00e9 kitchen',
      correct: false,
      explanation:
        'Clue 1 says the chest is not inside a building. A kitchen is inside, so this cannot be right.',
    },
    {
      id: 'bridge',
      label: 'Under the old wooden bridge, beside the blue boat',
      correct: true,
      explanation:
        'This matches every clue: it is outside (1), by the river so you hear water (2), a lantern hangs on the bridge (3), and the blue boat is tied there (4 and 5).',
    },
    {
      id: 'stage-curtain',
      label: 'Behind the Festival Stage curtain',
      correct: false,
      explanation:
        'Clue 2 says you can hear water, and clue 4 says a blue boat is beside the chest. There is no river or boat at the stage.',
    },
    {
      id: 'garden-shed',
      label: 'In the Hobby Garden shed',
      correct: false,
      explanation:
        'Clue 1 says the chest is outside, under the open sky. A shed is a building, so this cannot be right.',
    },
  ],
  ending:
    'You run to the old wooden bridge. The blue boat rocks on the water, and a lantern glows above. ' +
    'Under the bridge sits the festival chest! Inside are the missing supplies for every corner of town. ' +
    'The whole town cheers. The festival can begin, and you are the detective who found it.',
};

/** Bonus festival orders unlocked after the story, so early finishers continue. */
const BONUS_REQUESTS = [
  { family: 'paper', level: 4, coins: 45, label: 'Extra banner for the school gate' },
  { family: 'flower', level: 4, coins: 45, label: 'Flower basket for the bridge' },
  { family: 'ribbon', level: 4, coins: 45, label: 'Gift box for the band' },
  { family: 'lantern', level: 4, coins: 45, label: 'Lantern string for the boat' },
  { family: 'paper', level: 5, coins: 90, label: 'Grand entrance decoration' },
  { family: 'flower', level: 5, coins: 90, label: 'Grand flower display' },
  { family: 'ribbon', level: 5, coins: 90, label: 'Grand festival gift chest' },
  { family: 'lantern', level: 5, coins: 90, label: 'Grand festival light arch' },
];

// ---------------------------------------------------------------------------
// Deterministic pseudo-random generator, seeded per pupil
// ---------------------------------------------------------------------------

function makeRandom(seed) {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function seedFromString(text) {
  let seed = 7;
  for (let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) % 2147483647;
  return seed;
}

// ---------------------------------------------------------------------------
// Game creation
// ---------------------------------------------------------------------------

function createGame(pupilId, options = {}) {
  const game = {
    board: new Array(CELL_COUNT).fill(null),
    locked: INITIAL_LOCKED.slice(),
    tray: new Array(TRAY_SLOTS).fill(null),
    charges: options.roundAllowance || DEFAULT_ROUND_ALLOWANCE,
    chargeCap: CHARGE_CAP,
    coins: 0,
    chapterIndex: 0,
    chapterRequestsDone: 0,
    requestsCompleted: 0,
    unlockedCount: 0,
    missions: [],
    clues: [],
    pendingClue: null,
    clueAttempts: {},
    decorationChoice: null,
    decorations: {},
    improvements: {},
    storyComplete: false,
    finaleAttempts: 0,
    finaleSolved: false,
    bonusIndex: 0,
    simplified: Boolean(options.simplified),
    itemSeq: 1,
    missionSeq: 1,
    recentNonces: [],
    rescuesUsed: 0,
    hintsUsed: 0,
    stats: { generated: 0, merges: 0, failedMerges: 0, deliveries: 0, recycled: 0, moves: 0 },
    random: makeRandom(seedFromString(String(pupilId))),
  };
  for (const chapter of CHAPTERS) game.improvements[chapter.key] = 0;
  refillMissions(game);
  return game;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentChapter(game) {
  return CHAPTERS[Math.min(game.chapterIndex, CHAPTERS.length - 1)];
}

function unlockedFamilies(game) {
  if (game.storyComplete) return FAMILY_KEYS.slice();
  return currentChapter(game).families.slice();
}

function isLocked(game, index) {
  return game.locked.includes(index);
}

function emptyCells(game) {
  const out = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!isLocked(game, i) && game.board[i] === null) out.push(i);
  }
  return out;
}

function newItem(game, family, level) {
  return { uid: `i${game.itemSeq++}`, family, level };
}

function readSlot(game, ref) {
  if (!ref || typeof ref !== 'object') return undefined;
  const index = Number(ref.index);
  if (!Number.isInteger(index)) return undefined;
  if (ref.zone === 'board') {
    if (index < 0 || index >= CELL_COUNT) return undefined;
    return game.board[index];
  }
  if (ref.zone === 'tray') {
    if (index < 0 || index >= TRAY_SLOTS) return undefined;
    return game.tray[index];
  }
  return undefined;
}

function writeSlot(game, ref, value) {
  if (ref.zone === 'board') game.board[Number(ref.index)] = value;
  else game.tray[Number(ref.index)] = value;
}

function sameRef(a, b) {
  return a && b && a.zone === b.zone && Number(a.index) === Number(b.index);
}

/** Every item currently held, with its location. */
function allItems(game) {
  const out = [];
  game.board.forEach((item, index) => {
    if (item) out.push({ item, ref: { zone: 'board', index } });
  });
  game.tray.forEach((item, index) => {
    if (item) out.push({ item, ref: { zone: 'tray', index } });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

/**
 * Build a request the pupil can definitely finish:
 *  - only families that are already unlocked
 *  - never more level-1 items than one full allowance can produce
 */
function makeMission(game, kind) {
  const families = unlockedFamilies(game);
  const chapter = currentChapter(game);
  // Early chapters ask for smaller items, so the first lesson stays gentle.
  const ceiling = game.storyComplete ? MAX_LEVEL : chapter.maxRequestLevel || MAX_LEVEL;

  // The three requests must be genuinely different choices, not the same job
  // listed twice. Build every pair this chapter allows, drop the ones already
  // on the list, then prefer one inside the band this request kind wants.
  const taken = new Set(game.missions.map((m) => `${m.family}:${m.level}`));
  const candidates = [];
  for (const candidateFamily of families) {
    for (let candidateLevel = 1; candidateLevel <= ceiling; candidateLevel++) {
      if (buildCost(candidateLevel) > game.chargeCap) continue;
      if (taken.has(`${candidateFamily}:${candidateLevel}`)) continue;
      candidates.push({ family: candidateFamily, level: candidateLevel });
    }
  }

  let family;
  let level;
  if (candidates.length === 0) {
    // Every allowed pair is already offered, which only happens in a very
    // small chapter. Fall back to a plain random pick.
    family = families[Math.floor(game.random() * families.length)];
    level = pickLevel(game, kind, ceiling);
  } else {
    const wanted = kind === 'quick'
      ? candidates.filter((c) => c.level <= 2)
      : candidates.filter((c) => c.level >= 3);
    const pool = wanted.length > 0 ? wanted : candidates;
    const chosen = pool[Math.floor(game.random() * pool.length)];
    family = chosen.family;
    level = chosen.level;
  }

  // Guarantee affordability against a single full allowance.
  while (buildCost(level) > game.chargeCap && level > 1) level--;

  // The label must describe the job the pupil actually gets. If the preferred
  // band was unavailable and a small item was chosen instead, calling it a
  // "longer" job would be wrong, and it would pay more than an identical
  // "quick" job for the same work.
  const actualKind = kind === 'bonus' ? 'bonus' : level <= 2 ? 'quick' : 'long';
  const coins = actualKind === 'quick' ? 6 * buildCost(level) : 9 * buildCost(level);
  return {
    id: `m${game.missionSeq++}`,
    kind: actualKind,
    family,
    level,
    name: itemName(family, level),
    cost: buildCost(level),
    coins,
    bonus: false,
    requester: requesterFor(game, family),
  };
}

/** Level band for a request kind, never above the chapter's ceiling. */
function pickLevel(game, kind, ceiling) {
  let low;
  let span;
  if (kind === 'quick') {
    low = 1;
    span = 2; // 1-2: a job a pupil can finish in one round
  } else if (kind === 'long') {
    low = Math.min(3, ceiling);
    span = 2; // 3-4: worth more coins, takes longer
  } else {
    low = 2;
    span = 3;
  }
  const level = low + Math.floor(game.random() * span);
  return Math.max(1, Math.min(ceiling, level));
}

const REQUESTERS = {
  paper: 'Mayor Ploy',
  flower: 'Mr Anan',
  ribbon: 'Miss Nin',
  lantern: 'Grandma Dao',
};

function requesterFor(game, family) {
  return REQUESTERS[family] || 'A townsperson';
}

/** Keep exactly three active requests, with a mix of quick and longer jobs. */
function refillMissions(game) {
  if (game.storyComplete) {
    while (game.missions.length < ACTIVE_MISSIONS) {
      const template = BONUS_REQUESTS[game.bonusIndex % BONUS_REQUESTS.length];
      game.bonusIndex++;
      game.missions.push({
        id: `m${game.missionSeq++}`,
        kind: 'bonus',
        family: template.family,
        level: template.level,
        name: itemName(template.family, template.level),
        cost: buildCost(template.level),
        coins: template.coins,
        bonus: true,
        label: template.label,
        requester: requesterFor(game, template.family),
      });
    }
    return;
  }

  while (game.missions.length < ACTIVE_MISSIONS) {
    const haveQuick = game.missions.some((m) => m.kind === 'quick');
    const haveLong = game.missions.some((m) => m.kind === 'long');
    let kind = 'quick';
    if (!haveQuick) kind = 'quick';
    else if (!haveLong) kind = 'long';
    else kind = game.random() < 0.5 ? 'quick' : 'long';
    game.missions.push(makeMission(game, kind));
  }
}

// ---------------------------------------------------------------------------
// Board analysis and dead-end prevention
// ---------------------------------------------------------------------------

function findMergePair(game) {
  const groups = new Map();
  for (const { item, ref } of allItems(game)) {
    if (item.level >= MAX_LEVEL) continue;
    const key = `${item.family}:${item.level}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ref);
  }
  for (const refs of groups.values()) {
    if (refs.length >= 2) return { a: refs[0], b: refs[1] };
  }
  return null;
}

/** Can any active request be filled from what the pupil already holds? */
function findDeliverable(game) {
  for (const mission of game.missions) {
    for (const { item, ref } of allItems(game)) {
      if (item.family === mission.family && item.level === mission.level) {
        return { missionId: mission.id, ref };
      }
    }
  }
  return null;
}

function analyse(game) {
  const free = emptyCells(game).length;
  const traySpace = game.tray.filter((slot) => slot === null).length;
  const mergePair = findMergePair(game);
  const deliverable = findDeliverable(game);
  const canGenerate = game.charges > 0 && free > 0;
  const canBuyCharge = game.coins >= COINS_PER_CHARGE && free > 0;

  // A pupil is blocked only when nothing at all can move them forward.
  const blocked = !mergePair && !deliverable && !canGenerate && !canBuyCharge;
  return {
    freeCells: free,
    traySpace,
    hasMergePair: Boolean(mergePair),
    mergePair,
    deliverable,
    canGenerate,
    canBuyCharge,
    boardFull: free === 0,
    blocked,
  };
}

// ---------------------------------------------------------------------------
// Rewards and progression
// ---------------------------------------------------------------------------

function grantRequestProgress(game, mission) {
  game.requestsCompleted++;
  game.coins += mission.coins;

  const events = [{ type: 'coins', amount: mission.coins }];

  // Open a locked cell every couple of requests.
  if (
    game.requestsCompleted % MISSIONS_PER_UNLOCK === 0 &&
    game.locked.length > 0
  ) {
    const opened = game.locked.shift();
    game.unlockedCount++;
    events.push({ type: 'unlock', index: opened });
  }

  // Bonus orders, and anything delivered after the story ends, pay coins only.
  // Without this guard a leftover request would push chapter 5 past its target
  // a second time and award its clue card and decoration choice twice.
  if (mission.bonus || game.storyComplete) return events;

  const chapter = currentChapter(game);
  game.chapterRequestsDone++;
  game.improvements[chapter.key] = Math.min(
    100,
    Math.round((game.chapterRequestsDone / chapter.requestsNeeded) * 100)
  );
  events.push({
    type: 'improvement',
    chapter: chapter.key,
    percent: game.improvements[chapter.key],
  });

  if (game.chapterRequestsDone >= chapter.requestsNeeded) {
    completeChapter(game, chapter, events);
  }
  return events;
}

function completeChapter(game, chapter, events) {
  // Guard against a chapter being completed twice by any path.
  if (game.clues.includes(chapter.clue.id)) return;

  game.improvements[chapter.key] = 100;
  game.pendingClue = chapter.clue.id;
  game.decorationChoice = {
    chapterKey: chapter.key,
    options: chapter.decorations.map((d) => ({ ...d })),
  };
  events.push({
    type: 'chapter-complete',
    chapter: chapter.key,
    chapterName: chapter.name,
    outro: chapter.outro,
    clueId: chapter.clue.id,
  });

  if (!game.clues.includes(chapter.clue.id)) game.clues.push(chapter.clue.id);

  if (game.chapterIndex < CHAPTERS.length - 1) {
    game.chapterIndex++;
    game.chapterRequestsDone = 0;
    const next = currentChapter(game);
    events.push({ type: 'chapter-start', chapter: next.key, chapterName: next.name, intro: next.intro });
  } else {
    game.storyComplete = true;
    // Turn any request still on the board into a festival order, so an item the
    // pupil already built stays deliverable and the list reads consistently.
    game.missions = game.missions.map((mission) =>
      mission.bonus
        ? mission
        : { ...mission, kind: 'bonus', bonus: true, label: 'Extra festival order' }
    );
    events.push({ type: 'story-ready', message: 'All five clue cards collected. Time to solve the mystery!' });
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function fail(reason, message) {
  return { ok: false, reason, message };
}

function rememberNonce(game, nonce) {
  game.recentNonces.push(nonce);
  if (game.recentNonces.length > NONCE_MEMORY) {
    game.recentNonces.splice(0, game.recentNonces.length - NONCE_MEMORY);
  }
}

/**
 * Apply one validated action.
 *
 * @param {object} game
 * @param {object} action {type, nonce, ...}
 * @param {{playing: boolean}} context
 */
function applyAction(game, action, context = {}) {
  if (!action || typeof action.type !== 'string') return fail('bad-action', 'Unknown action.');

  // Idempotency: repeat of an action we already applied is a no-op success.
  if (action.nonce) {
    if (game.recentNonces.includes(action.nonce)) {
      return { ok: true, duplicate: true, events: [], message: null };
    }
  }

  const needsPlaying = [
    'generate', 'merge', 'move', 'deliver', 'recycle', 'rescue', 'buy-charge',
  ];
  if (needsPlaying.includes(action.type) && context.playing === false) {
    return fail('not-playing', 'The merge round is not running right now.');
  }

  let result;
  switch (action.type) {
    case 'generate': result = doGenerate(game, action); break;
    case 'merge': result = doMerge(game, action); break;
    case 'move': result = doMove(game, action); break;
    case 'deliver': result = doDeliver(game, action); break;
    case 'recycle': result = doRecycle(game, action); break;
    case 'rescue': result = doRescue(game); break;
    case 'buy-charge': result = doBuyCharge(game); break;
    case 'choose-decoration': result = doChooseDecoration(game, action); break;
    case 'clue-answer': result = doClueAnswer(game, action); break;
    case 'finale': result = doFinale(game, action); break;
    default: return fail('bad-action', 'Unknown action.');
  }

  if (result.ok && action.nonce) rememberNonce(game, action.nonce);
  return result;
}

function doGenerate(game, action) {
  const family = action.family;
  if (!FAMILIES[family]) return fail('bad-family', 'That supply source does not exist.');
  if (!unlockedFamilies(game).includes(family)) {
    return fail('locked-family', 'That supply source is not open yet.');
  }
  if (game.charges <= 0) {
    return fail('no-charges', 'No supply taps left. Merge, deliver, or recycle to keep going.');
  }
  const free = emptyCells(game);
  if (free.length === 0) {
    return fail('board-full', 'The board is full. Merge two items or put one in the tray.');
  }

  game.charges--;
  game.stats.generated++;
  const index = free[0];
  const item = newItem(game, family, 1);
  game.board[index] = item;
  return {
    ok: true,
    events: [{ type: 'spawn', index, item, family }],
    message: null,
  };
}

function doMerge(game, action) {
  const from = action.from;
  const to = action.to;
  if (sameRef(from, to)) return fail('same-slot', 'Choose two different items.');

  const a = readSlot(game, from);
  const b = readSlot(game, to);
  if (a === undefined || b === undefined) return fail('bad-slot', 'That place is not on the board.');
  if (!a || !b) return fail('empty-slot', 'Pick two items to join.');

  if (a.family !== b.family) {
    game.stats.failedMerges++;
    return fail(
      'different-family',
      `A ${itemName(a.family, a.level)} and a ${itemName(b.family, b.level)} are different things. ` +
        'Join two items with the same picture.'
    );
  }
  if (a.level !== b.level) {
    game.stats.failedMerges++;
    return fail(
      'different-level',
      `Level ${a.level} and level ${b.level} cannot join. Find two items of the same level.`
    );
  }
  if (a.level >= MAX_LEVEL) {
    game.stats.failedMerges++;
    return fail('max-level', `A ${itemName(a.family, a.level)} is the biggest one. Deliver it to a request!`);
  }

  const merged = newItem(game, a.family, a.level + 1);
  writeSlot(game, from, null);
  writeSlot(game, to, merged);
  game.stats.merges++;

  return {
    ok: true,
    events: [
      {
        type: 'merge',
        from,
        to,
        item: merged,
        fromItem: a,
        toItem: b,
        newName: itemName(merged.family, merged.level),
      },
    ],
    message: `${itemName(merged.family, merged.level)}! Level ${merged.level}.`,
  };
}

function doMove(game, action) {
  const from = action.from;
  const to = action.to;
  if (sameRef(from, to)) return { ok: true, events: [], message: null };

  const moving = readSlot(game, from);
  const target = readSlot(game, to);
  if (moving === undefined || target === undefined) return fail('bad-slot', 'That place is not on the board.');
  if (!moving) return fail('empty-slot', 'There is nothing to move.');
  if (to.zone === 'board' && isLocked(game, Number(to.index))) {
    return fail('cell-locked', 'That space is still locked. Finish a town request to open it.');
  }
  if (target) return fail('occupied', 'That space is taken. Move to an empty space.');

  writeSlot(game, from, null);
  writeSlot(game, to, moving);
  game.stats.moves++;
  return { ok: true, events: [{ type: 'move', from, to, item: moving }], message: null };
}

function doDeliver(game, action) {
  const mission = game.missions.find((m) => m.id === action.missionId);
  if (!mission) return fail('no-mission', 'That request is already finished.');

  const item = readSlot(game, action.from);
  if (item === undefined) return fail('bad-slot', 'That place is not on the board.');
  if (!item) return fail('empty-slot', 'Pick the item you want to deliver.');
  if (item.family !== mission.family || item.level !== mission.level) {
    return fail(
      'wrong-item',
      `${mission.requester} asked for a ${mission.name}. That is a ${itemName(item.family, item.level)}.`
    );
  }

  // Delivering removes the item from the board.
  writeSlot(game, action.from, null);
  game.stats.deliveries++;
  game.missions = game.missions.filter((m) => m.id !== mission.id);

  const events = [{ type: 'deliver', mission, from: action.from, item }];
  events.push(...grantRequestProgress(game, mission));
  refillMissions(game);

  return {
    ok: true,
    events,
    message: `${mission.requester} says thank you! +${mission.coins} coins.`,
  };
}

function doRecycle(game, action) {
  if (action.confirmed !== true) {
    return fail('needs-confirm', 'Tap again to confirm you want to recycle this item.');
  }
  const item = readSlot(game, action.from);
  if (item === undefined) return fail('bad-slot', 'That place is not on the board.');
  if (!item) return fail('empty-slot', 'There is nothing to recycle.');

  writeSlot(game, action.from, null);
  const refund = 2 * item.level;
  game.coins += refund;
  game.stats.recycled++;
  return {
    ok: true,
    events: [{ type: 'recycle', from: action.from, item, refund }],
    message: `Recycled the ${itemName(item.family, item.level)}. +${refund} coins.`,
  };
}

/**
 * Free recovery. Offered only when the pupil truly cannot act: it clears the
 * lowest-level item and tops up a few taps, so no pupil can get stuck.
 */
function doRescue(game) {
  const state = analyse(game);
  if (!state.blocked) {
    return fail('not-blocked', 'You can still play. Try a merge, a delivery, or the hint button.');
  }
  const items = allItems(game).sort((x, y) => x.item.level - y.item.level);
  const events = [];
  if (items.length > 0) {
    const lowest = items[0];
    writeSlot(game, lowest.ref, null);
    events.push({ type: 'rescue-clear', ref: lowest.ref, item: lowest.item });
  }
  game.charges = Math.min(game.chargeCap, game.charges + 3);
  game.rescuesUsed++;
  events.push({ type: 'rescue-charges', charges: game.charges });
  return {
    ok: true,
    events,
    message: 'Helping hand! One small item was cleared and you got 3 supply taps.',
  };
}

function doBuyCharge(game) {
  if (game.coins < COINS_PER_CHARGE) {
    return fail('no-coins', `You need ${COINS_PER_CHARGE} coins for one supply tap.`);
  }
  if (game.charges >= game.chargeCap) {
    return fail('charges-full', 'Your supply taps are already full.');
  }
  game.coins -= COINS_PER_CHARGE;
  game.charges++;
  return {
    ok: true,
    events: [{ type: 'buy-charge', charges: game.charges, coins: game.coins }],
    message: `Bought one supply tap for ${COINS_PER_CHARGE} coins.`,
  };
}

function doChooseDecoration(game, action) {
  if (!game.decorationChoice) return fail('no-choice', 'There is no decoration to choose right now.');
  const choice = game.decorationChoice;
  const picked = choice.options.find((o) => o.id === action.optionId);
  if (!picked) return fail('bad-option', 'That decoration is not on the list.');

  game.decorations[choice.chapterKey] = picked.id;
  game.decorationChoice = null;
  return {
    ok: true,
    events: [{ type: 'decoration', chapter: choice.chapterKey, decoration: picked }],
    message: `${picked.name} added to the town!`,
  };
}

function doClueAnswer(game, action) {
  const chapter = CHAPTERS.find((c) => c.clue.id === action.clueId);
  if (!chapter) return fail('bad-clue', 'That clue card does not exist.');
  if (!game.clues.includes(action.clueId)) return fail('clue-locked', 'You have not found that clue yet.');

  const check = chapter.clue.check;
  const record = (game.clueAttempts[action.clueId] = game.clueAttempts[action.clueId] || {
    attempts: 0,
    solved: false,
  });
  if (record.solved) {
    return {
      ok: true,
      events: [],
      message: null,
      clue: { clueId: action.clueId, correct: true, explanation: check.explanation, alreadySolved: true },
    };
  }

  const chosen = check.options[Number(action.optionIndex)];
  if (chosen === undefined) return fail('bad-option', 'Choose one of the answers.');
  record.attempts++;
  const correct = chosen === check.answer;
  if (correct) {
    record.solved = true;
    if (game.pendingClue === action.clueId) game.pendingClue = null;
  }

  return {
    ok: true,
    events: [{ type: 'clue-check', clueId: action.clueId, correct }],
    message: null,
    clue: {
      clueId: action.clueId,
      correct,
      explanation: check.explanation,
      attempts: record.attempts,
      canRetry: !correct,
    },
  };
}

function doFinale(game, action) {
  if (!game.storyComplete) return fail('story-locked', 'Collect all five clue cards first.');
  if (game.finaleSolved) {
    return {
      ok: true,
      events: [],
      message: null,
      finale: { correct: true, alreadySolved: true, ending: FINALE.ending },
    };
  }
  const option = FINALE.options.find((o) => o.id === action.optionId);
  if (!option) return fail('bad-option', 'Choose one of the places.');

  game.finaleAttempts++;
  if (option.correct) {
    game.finaleSolved = true;
    refillMissions(game);
    return {
      ok: true,
      events: [{ type: 'finale', correct: true }],
      message: 'You found the festival chest!',
      finale: { correct: true, explanation: option.explanation, ending: FINALE.ending },
    };
  }
  return {
    ok: true,
    events: [{ type: 'finale', correct: false }],
    message: null,
    finale: { correct: false, explanation: option.explanation, canRetry: true },
  };
}

// ---------------------------------------------------------------------------
// Hints and guided play
// ---------------------------------------------------------------------------

/** A single next step, chosen to always be useful. Never mutates the board. */
function hint(game) {
  game.hintsUsed++;
  const state = analyse(game);

  if (state.deliverable) {
    const mission = game.missions.find((m) => m.id === state.deliverable.missionId);
    return {
      kind: 'deliver',
      message: `You have a ${mission.name}. Deliver it to ${mission.requester} for ${mission.coins} coins.`,
      highlight: [state.deliverable.ref],
      missionId: mission.id,
    };
  }
  if (state.mergePair) {
    const item = readSlot(game, state.mergePair.a);
    return {
      kind: 'merge',
      message: `Join these two ${itemName(item.family, item.level)} items to make a ${itemName(item.family, item.level + 1)}.`,
      highlight: [state.mergePair.a, state.mergePair.b],
    };
  }
  if (state.canGenerate) {
    const target = game.missions.slice().sort((a, b) => a.cost - b.cost)[0];
    return {
      kind: 'generate',
      message: `Tap the ${FAMILIES[target.family].source} to start making a ${target.name}.`,
      highlight: [],
      family: target.family,
    };
  }
  if (state.canBuyCharge) {
    return {
      kind: 'buy',
      message: `You have ${game.coins} coins. Buy a supply tap for ${COINS_PER_CHARGE} coins.`,
      highlight: [],
    };
  }
  const items = allItems(game).sort((a, b) => a.item.level - b.item.level);
  if (items.length > 0) {
    return {
      kind: 'recycle',
      message: `No moves left. Recycle this ${itemName(items[0].item.family, items[0].item.level)} to make space and get coins.`,
      highlight: [items[0].ref],
    };
  }
  return { kind: 'rescue', message: 'Tap Helping Hand for free supplies.', highlight: [] };
}

/**
 * The guided request a struggling pupil is pointed at: the cheapest active
 * request, with the exact next step spelled out.
 */
function guidedMission(game) {
  if (game.missions.length === 0) return null;
  const cheapest = game.missions.slice().sort((a, b) => a.cost - b.cost)[0];
  return {
    missionId: cheapest.id,
    name: cheapest.name,
    requester: cheapest.requester,
    family: cheapest.family,
    level: cheapest.level,
    steps: [
      `Tap the ${FAMILIES[cheapest.family].source} ${cheapest.cost} time${cheapest.cost === 1 ? '' : 's'}.`,
      cheapest.level > 1
        ? 'Join two the same, again and again, until it grows.'
        : 'That is already the right item.',
      `Deliver it to ${cheapest.requester}.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Round handling
// ---------------------------------------------------------------------------

/** Grant the round allowance, carrying unused taps forward to a visible cap. */
function startRound(game, allowance) {
  const before = game.charges;
  game.charges = Math.min(game.chargeCap, game.charges + allowance);
  return { granted: game.charges - before, carriedIn: before, charges: game.charges };
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/** Everything a pupil's own client is allowed to see. */
function publicState(game) {
  const chapter = currentChapter(game);
  return {
    board: game.board.map((item) => (item ? { ...item, name: itemName(item.family, item.level) } : null)),
    locked: game.locked.slice(),
    tray: game.tray.map((item) => (item ? { ...item, name: itemName(item.family, item.level) } : null)),
    columns: COLUMNS,
    rows: ROWS,
    traySlots: TRAY_SLOTS,
    charges: game.charges,
    chargeCap: game.chargeCap,
    coins: game.coins,
    coinsPerCharge: COINS_PER_CHARGE,
    sources: unlockedFamilies(game).map((key) => ({
      family: key,
      label: FAMILIES[key].source,
      hint: FAMILIES[key].sourceHint,
      makes: itemName(key, 1),
      colour: FAMILIES[key].colour,
    })),
    missions: game.missions.map((m) => ({ ...m })),
    chapter: {
      id: chapter.id,
      key: chapter.key,
      name: chapter.name,
      intro: chapter.intro,
      index: game.chapterIndex,
      total: CHAPTERS.length,
      requestsDone: game.chapterRequestsDone,
      requestsNeeded: chapter.requestsNeeded,
    },
    improvements: { ...game.improvements },
    decorations: { ...game.decorations },
    decorationChoice: game.decorationChoice ? { ...game.decorationChoice } : null,
    clues: game.clues.map((id) => {
      const found = CHAPTERS.find((c) => c.clue.id === id).clue;
      const record = game.clueAttempts[id] || { attempts: 0, solved: false };
      return {
        id: found.id,
        title: found.title,
        from: found.from,
        sentences: found.sentences.slice(),
        // The check's correct answer is never sent; only the options.
        check: { prompt: found.check.prompt, options: found.check.options.slice() },
        solved: record.solved,
        attempts: record.attempts,
      };
    }),
    pendingClue: game.pendingClue,
    storyComplete: game.storyComplete,
    finaleSolved: game.finaleSolved,
    finale: game.storyComplete
      ? { prompt: FINALE.prompt, options: FINALE.options.map((o) => ({ id: o.id, label: o.label })) }
      : null,
    ending: game.finaleSolved ? FINALE.ending : null,
    simplified: game.simplified,
    requestsCompleted: game.requestsCompleted,
    stats: { ...game.stats },
  };
}

/** Compact progress line for the teacher dashboard. */
function teacherSummary(game) {
  const chapter = currentChapter(game);
  return {
    chapterId: chapter.id,
    chapterName: chapter.name,
    chapterProgress: `${game.chapterRequestsDone}/${chapter.requestsNeeded}`,
    requestsCompleted: game.requestsCompleted,
    coins: game.coins,
    cluesFound: game.clues.length,
    cluesSolved: Object.values(game.clueAttempts).filter((c) => c.solved).length,
    storyComplete: game.storyComplete,
    mysterySolved: game.finaleSolved,
    merges: game.stats.merges,
    deliveries: game.stats.deliveries,
    charges: game.charges,
    hintsUsed: game.hintsUsed,
    rescuesUsed: game.rescuesUsed,
    simplified: game.simplified,
  };
}

/** Strip the non-serialisable RNG so a game can be snapshotted. */
function toSnapshot(game) {
  const { random, ...rest } = game;
  void random;
  return rest;
}

function fromSnapshot(snapshot, pupilId) {
  const game = { ...snapshot, random: makeRandom(seedFromString(String(pupilId))) };
  return game;
}

module.exports = {
  FAMILIES,
  FAMILY_KEYS,
  CHAPTERS,
  FINALE,
  BONUS_REQUESTS,
  COLUMNS,
  ROWS,
  CELL_COUNT,
  TRAY_SLOTS,
  MAX_LEVEL,
  CHARGE_CAP,
  DEFAULT_ROUND_ALLOWANCE,
  COINS_PER_CHARGE,
  INITIAL_LOCKED,
  createGame,
  applyAction,
  analyse,
  hint,
  guidedMission,
  startRound,
  publicState,
  teacherSummary,
  toSnapshot,
  fromSnapshot,
  buildCost,
  itemName,
  currentChapter,
  unlockedFamilies,
  emptyCells,
  findMergePair,
  findDeliverable,
  allItems,
  refillMissions,
};
