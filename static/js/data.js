// Constants, items, room generation and procedurally drawn pixel-art textures.
const W = 960, H = 640, T = 32, COLS = 30, ROWS = 20, N = 8;
const FONT = '"Courier New", monospace';
const PUZZLES = ['plates', 'search', 'simon'];
const TYPE_LABEL = {
  exit: 'Trailhead Gate', shop: 'Ranger Shop', fight: 'Ambush', plates: 'Crate Puzzle', search: 'Lost Key',
  simon: 'Pumpkin Patch', stealth: 'Stealth', trap: 'Cursed Shrine', finale: 'Final Chase',
};
// Ring of areas: walking right goes deeper, and eventually loops back to the Trailhead.
const AREAS = ['Trailhead', 'Campsite', 'Cabin Row', 'Lakeshore', 'Ranger Station', 'Pine Hollow', 'Burnt Clearing', 'Smokehouse'];
const FLOORS = [0x2c3a22, 0x34401f, 0x3b3122, 0x22343c, 0x3a2f22, 0x24301d, 0x3d2a1d, 0x34191a];
const CHALLENGES = 6;

const ITEMS = {
  overcharge: { name: 'Overcharged Taser', cat: 'Combat', price: 20, desc: 'Bolts deal +60% damage' },
  capacitor:  { name: 'Rapid Capacitor', cat: 'Combat', price: 18, desc: 'Shoot 40% faster' },
  arc:        { name: 'Arc Field', cat: 'Combat', price: 15, desc: 'Always-on taser field is bigger and stronger' },
  sneakers:   { name: 'Soft Sneakers', cat: 'Stealth', price: 15, desc: 'Running makes half the noise' },
  noisemaker: { name: 'Firecrackers', cat: 'Stealth', price: 20, desc: 'Q: throw one to lure him away (30s cooldown)' },
  trailmap:   { name: 'Trail Map', cat: 'Puzzle', price: 15, desc: 'Reveals keys, next pumpkin, and crate targets' },
  whisper:    { name: 'Spirit Whisper', cat: 'Puzzle', price: 12, desc: 'Failed puzzle attempts make no noise' },
  energy:     { name: 'Energy Drink', cat: 'Trade-off', price: 10, desc: '+20% speed, but you are 30% louder' },
  heart:      { name: 'Extra Heart', cat: 'Survival', price: 25, desc: '+1 max heart and full heal', noSlot: true },
  backpack:   { name: 'Backpack', cat: 'Utility', price: 10, desc: '+1 inventory slot', noSlot: true },
};
// Free trade-off items found only in trap rooms.
const CURSED = {
  mask:      { name: 'Charred Mask', cat: 'Cursed', desc: 'Double damage, but awareness rises 50% faster', noSlot: true },
  bloodcoin: { name: 'Ember Coin', cat: 'Cursed', desc: 'Double coins, but he moves 12% faster', noSlot: true },
};
const CAT_COLOR = { Combat: 0xd94a3a, Stealth: 0x3a7bd9, Puzzle: 0x9b59d0, 'Trade-off': 0xe0b030, Survival: 0xe0507a, Utility: 0x8a8a8a, Cursed: 0x7a0000 };

const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tileCenter = (c, r) => ({ x: c * T + T / 2, y: r * T + T / 2 });
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function newRun() {
  const types = shuffle(['fight', 'fight', 'plates', 'search', 'simon', 'stealth', 'trap']).slice(0, CHALLENGES);
  const rooms = [];
  for (let i = 0; i < N; i++) rooms.push(genRoom(i, i === 0 ? 'exit' : i === 4 ? 'shop' : types.shift()));
  return {
    rooms, cleared: 0, coins: 5, hearts: 3, maxHearts: 3, items: [], slots: 3,
    awareness: 0, aggression: 0.3, strategy: 'patrol', thought: 'A new hiker on my trail...',
    stats: { enemyHits: 0, failedPuzzles: 0, noise: 0, hides: 0, catches: 0, kills: 0 },
    start: Date.now(),
  };
}

function genRoom(i, type) {
  const room = { idx: i, type, area: AREAS[i], floor: FLOORS[i], cleared: false, obstacles: [], hides: [] };
  const occ = new Set();
  const key = (c, r) => c + ',' + r;
  const near = (c, r) => { for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (occ.has(key(c + dc, r + dr))) return true; return false; };

  // Hiding spots hug the top and bottom walls.
  for (let n = 0, tries = 0; n < 2 && tries < 100; tries++) {
    const c = randi(3, COLS - 4), r = n === 0 ? 1 : ROWS - 2;
    if (near(c, r)) continue;
    occ.add(key(c, r)); room.hides.push({ c, r, kind: pick(['closet', 'bush', 'locker']) }); n++;
  }
  const freeTile = (c, r) => c >= 2 && c <= COLS - 3 && r >= 2 && r <= ROWS - 3 && !(r >= 8 && r <= 11) && !near(c, r);
  const takeFree = (extra = () => true) => {
    for (let tries = 0; tries < 300; tries++) {
      const c = randi(2, COLS - 3), r = randi(2, ROWS - 3);
      if (freeTile(c, r) && extra(c, r)) { occ.add(key(c, r)); return { c, r }; }
    }
    return null;
  };

  if (type === 'search') {
    room.searchObjs = [];
    for (let k = 0; k < 6; k++) { const t = takeFree(); if (t) room.searchObjs.push({ ...t, searched: false }); }
    room.keyIdx = randi(0, room.searchObjs.length - 1);
  }
  if (type === 'simon') room.seq = Array.from({ length: 4 }, () => randi(0, 3));
  if (type === 'shop') room.stock = shuffle(Object.keys(ITEMS)).slice(0, 5).map(k => ({ key: k, sold: false }));
  if (type === 'trap') room.cursedKey = pick(Object.keys(CURSED));

  const counts = { exit: 6, shop: 5, fight: 9, plates: 0, search: 5, simon: 5, stealth: 14, trap: 7 };
  const kinds = i <= 1 ? ['tree', 'tree', 'tent', 'rock'] : i >= 6 ? ['deadtree', 'deadtree', 'rock', 'tree'] : ['tree', 'tree', 'rock'];
  for (let n = 0; n < counts[type]; n++) {
    const t = takeFree((c, r) => {
      if (type === 'simon' && c >= 9 && c <= 20 && r >= 3 && r <= 16) return false;
      if ((type === 'shop' || type === 'exit' || type === 'trap') && c >= 6 && c <= 23 && r <= 9) return false;
      if (type === 'exit' && c >= 12 && c <= 18 && r >= 11 && r <= 16) return false; // player spawn
      if (type === 'stealth' && (r <= 4 || r >= 15) && (c <= 4 || c >= 25)) return false; // lantern corners
      return true;
    });
    if (t) room.obstacles.push({ ...t, kind: pick(kinds) });
  }
  return room;
}

function makeTextures(s) {
  const mk = (key, w, h, fn) => {
    if (s.textures.exists(key)) return;
    const g = s.make.graphics({ x: 0, y: 0, add: false });
    fn(g); g.generateTexture(key, w, h); g.destroy();
  };
  const R = (g, c, x, y, w, h) => { g.fillStyle(c); g.fillRect(x, y, w, h); };

  mk('player', 20, 26, g => {
    R(g, 0x5a3b1e, 5, 0, 10, 4); R(g, 0xf2c9a0, 6, 3, 8, 7); R(g, 0x000000, 8, 5, 1, 2); R(g, 0x000000, 11, 5, 1, 2);
    R(g, 0x2b6cb0, 4, 10, 12, 10); R(g, 0x1f4f85, 4, 10, 2, 10); R(g, 0x1a202c, 5, 20, 4, 6); R(g, 0x1a202c, 11, 20, 4, 6);
    R(g, 0x333333, 15, 13, 4, 4); R(g, 0x7fdbff, 18, 13, 2, 2);
  });
  mk('jason', 28, 38, g => {
    R(g, 0x2a1d14, 8, 0, 12, 11); R(g, 0x3a2a1c, 9, 1, 3, 3);
    R(g, 0xff2200, 10, 5, 3, 2); R(g, 0xff2200, 15, 5, 3, 2); R(g, 0xff8800, 11, 8, 6, 1);
    R(g, 0x1a1410, 6, 11, 16, 17); R(g, 0x2a1d14, 2, 12, 4, 13); R(g, 0x2a1d14, 22, 12, 4, 13);
    R(g, 0xff6a00, 9, 14, 2, 6); R(g, 0xffaa00, 15, 17, 3, 2); R(g, 0xff6a00, 12, 23, 2, 3); R(g, 0xff6a00, 18, 12, 1, 4); R(g, 0xff6a00, 10, 2, 1, 3);
    R(g, 0x120d0a, 7, 28, 5, 10); R(g, 0x120d0a, 16, 28, 5, 10);
    R(g, 0x5a3a20, 23, 24, 3, 3); R(g, 0xc8c8c8, 23, 27, 3, 11); R(g, 0x8a2020, 23, 34, 3, 2);
  });
  mk('zombie', 22, 24, g => {
    R(g, 0x6fa35a, 6, 0, 10, 8); R(g, 0x000000, 8, 3, 2, 2); R(g, 0x000000, 12, 3, 2, 2); R(g, 0x3a1010, 9, 6, 4, 1);
    R(g, 0x8a6a3a, 4, 8, 14, 9); R(g, 0x6fa35a, 0, 9, 4, 3); R(g, 0x6fa35a, 18, 9, 4, 3); R(g, 0x3a3a5a, 5, 17, 5, 7); R(g, 0x3a3a5a, 12, 17, 5, 7);
  });
  mk('bat', 22, 12, g => {
    g.fillStyle(0x5a2a7a); g.fillTriangle(0, 2, 9, 4, 6, 11); g.fillTriangle(22, 2, 13, 4, 16, 11);
    R(g, 0x3a1a4a, 8, 3, 6, 7); R(g, 0xff4040, 9, 5, 1, 1); R(g, 0xff4040, 12, 5, 1, 1);
  });
  mk('crow', 20, 18, g => {
    R(g, 0x151515, 4, 4, 12, 10); R(g, 0x222222, 2, 7, 4, 6); R(g, 0x151515, 12, 1, 6, 6);
    R(g, 0xffd000, 15, 3, 2, 2); R(g, 0xe08020, 18, 4, 2, 2); R(g, 0xe08020, 7, 14, 1, 4); R(g, 0xe08020, 11, 14, 1, 4);
  });
  mk('bolt', 14, 4, g => { R(g, 0x7fdbff, 0, 1, 14, 2); R(g, 0xffffff, 4, 0, 6, 4); });
  mk('eshot', 8, 8, g => { g.fillStyle(0xff3030); g.fillCircle(4, 4, 4); g.fillStyle(0xffaaaa); g.fillCircle(3, 3, 1.5); });
  mk('wall', 32, 32, g => {
    R(g, 0x15100d, 0, 0, 32, 32); g.fillStyle(0x261c16);
    for (let y = 0; y < 32; y += 8) for (let x = (y / 8) % 2 * 8; x < 32; x += 16) g.fillRect(x + 1, y + 1, 14, 6);
  });
  mk('gate', 32, 32, g => { R(g, 0x2a0a0a, 0, 0, 32, 32); g.fillStyle(0x8a1a1a); for (let x = 2; x < 32; x += 7) g.fillRect(x, 0, 3, 32); R(g, 0x8a1a1a, 0, 14, 32, 3); });
  mk('tree', 32, 32, g => {
    R(g, 0x4a2f1a, 14, 22, 5, 10); g.fillStyle(0x16301a); g.fillTriangle(16, 0, 1, 24, 31, 24);
    g.fillStyle(0x24482a); g.fillTriangle(16, 4, 7, 18, 25, 18);
  });
  mk('deadtree', 32, 32, g => {
    R(g, 0x2a1a10, 14, 6, 5, 26); R(g, 0x2a1a10, 6, 8, 9, 3); R(g, 0x2a1a10, 18, 12, 9, 3); R(g, 0x2a1a10, 6, 4, 3, 5);
    R(g, 0xff6a00, 15, 18, 2, 3);
  });
  mk('rock', 32, 32, g => { g.fillStyle(0x3e3e46); g.fillEllipse(16, 20, 28, 20); g.fillStyle(0x5a5a64); g.fillEllipse(12, 16, 12, 7); });
  mk('tent', 32, 32, g => { g.fillStyle(0x7a3b2a); g.fillTriangle(16, 2, 0, 30, 32, 30); g.fillStyle(0x1a0d08); g.fillTriangle(16, 12, 10, 30, 22, 30); });
  mk('stump', 28, 24, g => {
    R(g, 0x4a2f1a, 3, 8, 22, 14); g.fillStyle(0x7a5530); g.fillEllipse(14, 8, 22, 10);
    g.lineStyle(1, 0x4a2f1a); g.strokeEllipse(14, 8, 12, 5);
  });
  mk('crate', 30, 30, g => {
    R(g, 0x8b5a2b, 0, 0, 30, 30); g.lineStyle(2, 0x5a3a1a); g.strokeRect(1, 1, 28, 28);
    g.lineBetween(2, 2, 28, 28); g.lineBetween(28, 2, 2, 28);
  });
  mk('plate', 32, 32, g => { R(g, 0x50555c, 1, 1, 30, 30); R(g, 0x33373c, 6, 6, 20, 20); R(g, 0x6a6f76, 14, 9, 4, 14); R(g, 0x6a6f76, 9, 14, 14, 4); });
  mk('plateOn', 32, 32, g => { R(g, 0x50555c, 1, 1, 30, 30); R(g, 0x2a8a4a, 6, 6, 20, 20); R(g, 0x9affb0, 14, 9, 4, 14); R(g, 0x9affb0, 9, 14, 14, 4); });
  const pumpkin = (lit) => g => {
    g.fillStyle(lit ? 0xffb347 : 0xc8541a); g.fillEllipse(15, 16, 28, 22);
    g.fillStyle(lit ? 0xffd27a : 0xa8440f); g.fillEllipse(15, 16, 10, 22);
    R(g, 0x3a6a20, 13, 0, 4, 6);
    g.fillStyle(lit ? 0xffff80 : 0x2a1000); g.fillTriangle(7, 12, 11, 12, 9, 16); g.fillTriangle(19, 12, 23, 12, 21, 16); R(g, lit ? 0xffff80 : 0x2a1000, 8, 20, 14, 3);
  };
  mk('pumpkin', 30, 28, pumpkin(false));
  mk('pumpkinLit', 30, 28, pumpkin(true));
  mk('closet', 30, 40, g => { R(g, 0x5b3a22, 0, 0, 30, 40); R(g, 0x3a2414, 14, 2, 2, 36); R(g, 0x3a2414, 2, 2, 26, 2); R(g, 0xd0b060, 11, 18, 2, 3); R(g, 0xd0b060, 17, 18, 2, 3); });
  mk('bush', 36, 30, g => { g.fillStyle(0x1d4020); g.fillCircle(10, 18, 10); g.fillCircle(26, 18, 10); g.fillCircle(18, 11, 11); g.fillStyle(0x2c5a2c); g.fillCircle(15, 10, 4); g.fillCircle(25, 15, 3); });
  mk('locker', 26, 40, g => { R(g, 0x4a5a6a, 0, 0, 26, 40); R(g, 0x2a3440, 4, 4, 18, 2); R(g, 0x2a3440, 4, 8, 18, 2); R(g, 0x2a3440, 4, 12, 18, 2); R(g, 0xb0b0b0, 19, 20, 3, 6); });
  mk('pedestal', 32, 18, g => { R(g, 0x5a5a5a, 4, 4, 24, 14); R(g, 0x7a7a7a, 0, 0, 32, 5); });
  mk('lantern', 20, 26, g => { R(g, 0x222222, 4, 4, 12, 20); R(g, 0x554410, 6, 8, 8, 12); R(g, 0x222222, 8, 0, 4, 4); });
  mk('lanternLit', 20, 26, g => { R(g, 0x222222, 4, 4, 12, 20); R(g, 0xffe070, 6, 8, 8, 12); R(g, 0xffffff, 8, 11, 4, 5); R(g, 0x222222, 8, 0, 4, 4); });
  mk('altar', 40, 26, g => { R(g, 0x2a2626, 0, 8, 40, 18); R(g, 0x3e3838, 0, 6, 40, 4); R(g, 0xd0d0c0, 4, 0, 3, 7); R(g, 0xff9900, 4, -2, 3, 3); R(g, 0xd0d0c0, 33, 0, 3, 7); R(g, 0x8a0000, 14, 12, 12, 8); });
  mk('firecracker', 10, 6, g => { R(g, 0xd02020, 0, 0, 8, 6); R(g, 0xffd000, 8, 2, 2, 2); });
}
