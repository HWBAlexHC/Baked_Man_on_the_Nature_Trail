// Baked Man on the Nature Trail: main game.
const txt = (s, x, y, str, size = 14, color = '#f5e6c8', extra = {}) =>
  s.add.text(x, y, str, { fontFamily: FONT, fontSize: size + 'px', color, stroke: '#000', strokeThickness: 3, ...extra });

class IntroScene extends Phaser.Scene {
  constructor() { super('intro'); }
  create() {
    makeTextures(this);
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0605);
    txt(this, W / 2, 50, 'BAKED MAN ON THE NATURE TRAIL', 34, '#ff6a1a').setOrigin(0.5);
    txt(this, W / 2, 92, 'Something burned is walking the trail tonight. Get out.', 16, '#d9c7a8').setOrigin(0.5);
    this.add.image(250, 200, 'player').setScale(3);
    this.add.image(710, 196, 'jason').setScale(3);
    const lines = [
      'GOAL  Clear all 6 areas of the looping trail, then return to the Trailhead.',
      '      The gate opens and the final chase begins. Survive it to escape.',
      '',
      'MOVE  W A S D          SNEAK  hold SHIFT (slow but silent)',
      'SHOOT Arrow keys       Your taser field zaps anything that touches you',
      'USE   E  (hide, search, buy, take)      Q  firecracker (if bought)',
      'R     reset crates (crate puzzle)       B  toggle the Baked Man brain panel',
      '',
      'HE IS LISTENING. Running, shooting, slamming doors and failed puzzles make noise.',
      'You will HEAR him (footsteps, panned left/right) before you SEE him.',
      'If he finds you: run to another area, or hide and hold your breath (SPACE).',
      'You only lose a heart (of 3) if he actually catches you.',
      'Enemies steal coins. Spend coins at the Ranger Shop. Puzzle rooms are safe from him',
      'until you solve them, except Stealth rooms, where he patrols. Don\'t get seen.',
    ];
    txt(this, 70, 270, lines.join('\n'), 15, '#f5e6c8', { lineSpacing: 6 });
    const start = txt(this, W / 2, 600, 'PRESS SPACE TO START', 22, '#ffcc66').setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });
    const go = () => { SFX.init(); this.scene.start('game'); };
    this.input.keyboard.once('keydown-SPACE', go);
    this.input.once('pointerdown', go);
  }
}

class GameScene extends Phaser.Scene {
  constructor() { super('game'); }

  create() {
    makeTextures(this);
    this.physics.resume(); // the world stays paused across scene.restart() otherwise
    this.run = newRun();
    this.over = false; this.finale = null; this.mg = null; this.hidden = null;
    this.knockT = 0; this.invulnT = 0; this.hitCd = 0; this.shootCd = 0; this.auraT = 0; this.fireCd = 0; this.slowT = 0;
    this.stepT = 0; this.lastStage = 0; this.periodicT = 20; this.pushT = 0; this.roomTime = 0; this.roomToken = 0;
    this.showBrain = true; this.chatLines = []; this.roomObjs = [];
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,E,Q,R,SPACE,B');

    this.floorG = this.add.graphics().setDepth(0);
    this.fxG = this.add.graphics().setDepth(6);
    this.auraG = this.add.graphics().setDepth(9);
    this.walls = this.physics.add.staticGroup();
    this.obst = this.physics.add.staticGroup();
    this.blocks = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.bolts = this.physics.add.group();
    this.eshots = this.physics.add.group();

    this.player = this.physics.add.sprite(480, 440, 'player').setDepth(10);
    this.player.body.setSize(14, 12).setOffset(3, 14);
    const js = this.physics.add.sprite(-200, -200, 'jason').setDepth(11).setVisible(false);
    js.body.setSize(18, 16).setOffset(5, 22);
    this.jason = { sprite: js, room: 4, state: 'wander', inRoom: false, moveT: 12, follow: null, pathT: 0, next: null, facing: 0, spot: 0, lastChaseAt: -99999 };

    const P = this.physics;
    P.add.collider(this.player, this.walls); P.add.collider(this.player, this.obst);
    P.add.collider(this.player, this.blocks, () => { this.pushT = 0.15; });
    P.add.collider(this.blocks, this.walls); P.add.collider(this.blocks, this.obst); P.add.collider(this.blocks, this.blocks);
    P.add.collider(this.enemies, this.walls);
    P.add.collider(this.enemies, this.obst, null, e => e.kind !== 'bat');
    P.add.overlap(this.bolts, this.walls, b => b.destroy());
    P.add.overlap(this.bolts, this.obst, b => b.destroy());
    P.add.overlap(this.bolts, this.blocks, b => b.destroy());
    P.add.overlap(this.bolts, this.enemies, (b, e) => { b.destroy(); this.damageEnemy(e, this.boltDamage()); });
    P.add.overlap(this.eshots, this.walls, s => s.destroy());
    P.add.overlap(this.player, this.enemies, () => this.playerHit());
    P.add.overlap(this.player, this.eshots, (p, s) => { s.destroy(); this.playerHit(); });

    // HUD
    this.hud = txt(this, 10, 6, '', 15).setDepth(100);
    this.hudItems = txt(this, 10, H - 24, '', 13, '#cfe8ff').setDepth(100);
    this.chatText = txt(this, 12, H - 130, '', 13, '#ffb08a', { wordWrap: { width: 560 }, lineSpacing: 2 }).setDepth(100);
    this.dbg = txt(this, W - 10, 40, '', 12, '#ffd0a0', { backgroundColor: '#000000b0', padding: { x: 6, y: 4 }, wordWrap: { width: 290 }, strokeThickness: 0 }).setOrigin(1, 0).setDepth(100);
    this.bannerT = txt(this, W / 2, 230, '', 34, '#ff6a1a').setOrigin(0.5).setDepth(120).setAlpha(0);
    this.bannerS = txt(this, W / 2, 272, '', 16, '#f5e6c8').setOrigin(0.5).setDepth(120).setAlpha(0);
    this.toastT = txt(this, W / 2, H - 70, '', 15, '#ffffff').setOrigin(0.5).setDepth(120).setAlpha(0);
    this.promptT = txt(this, 0, 0, '', 12, '#ffff99').setOrigin(0.5, 1).setDepth(110);
    this.bubble = txt(this, 0, 0, '', 13, '#ff7744', { wordWrap: { width: 260 }, align: 'center' }).setOrigin(0.5, 1).setDepth(112).setAlpha(0);
    this.mgG = this.add.graphics().setDepth(150);
    this.mgText = txt(this, W / 2, 500, '', 16, '#ffffff').setOrigin(0.5).setDepth(151);

    this.chat('TRAIL', 'Clear 6 areas to open the Trailhead gate. Ranger Shop is 4 areas away.', '#9fd3a0');
    this.enterRoom(0, 'start');
  }

  // ---------- helpers ----------
  has(k) { return this.run.items.includes(k); }
  slotsUsed() { return this.run.items.filter(k => ITEMS[k] && !ITEMS[k].noSlot).length; }
  track(o) { this.roomObjs.push(o); return o; }
  boltDamage() { return (this.has('overcharge') ? 1.6 : 1) * (this.has('mask') ? 2 : 1); }
  allowed(idx) { const r = this.run.rooms[idx]; return !(PUZZLES.includes(r.type) && !r.cleared); }
  ringDist(from, to) { const d = (to - from + N) % N; return d <= N / 2 ? { dist: d, dir: 1 } : { dist: N - d, dir: -1 }; }
  noiseMult() { return (this.has('mask') ? 1.5 : 1) * (0.7 + this.run.aggression * 0.6); }
  addNoise(n) { this.run.stats.noise += n; if (!this.finale) this.run.awareness = Math.min(100, this.run.awareness + n * this.noiseMult()); }

  banner(t, s = '') {
    this.bannerT.setText(t).setAlpha(1); this.bannerS.setText(s).setAlpha(1);
    this.tweens.killTweensOf([this.bannerT, this.bannerS]);
    this.tweens.add({ targets: [this.bannerT, this.bannerS], alpha: 0, delay: 1800, duration: 700 });
  }
  toast(t) {
    this.toastT.setText(t).setAlpha(1);
    this.tweens.killTweensOf(this.toastT);
    this.tweens.add({ targets: this.toastT, alpha: 0, delay: 1600, duration: 500 });
  }
  chat(who, line, color = '#ffb08a') {
    this.chatLines.push(`${who}: ${line}`);
    if (this.chatLines.length > 5) this.chatLines.shift();
    this.chatText.setText(this.chatLines.join('\n'));
    this.chatText.setY(H - 34 - this.chatText.height);
  }
  say(line) {
    this.chat('BAKED MAN', line);
    this.bubble.setText(line).setAlpha(1);
    this.tweens.killTweensOf(this.bubble);
    this.tweens.add({ targets: this.bubble, alpha: 0, delay: 3000, duration: 600 });
  }
  brainStats() {
    const r = this.run, s = r.stats;
    return {
      current_area: this.room.area + ' / ' + TYPE_LABEL[this.room.type], rooms_cleared: r.cleared, rooms_total: CHALLENGES,
      hearts: r.hearts, coins: r.coins, enemy_hits_taken: s.enemyHits, failed_puzzle_attempts: s.failedPuzzles,
      noise_made: Math.round(s.noise), times_hidden: s.hides, times_caught: s.catches, enemies_killed: s.kills,
      seconds_survived: Math.round((Date.now() - r.start) / 1000), awareness: Math.round(r.awareness),
      baked_man_state: this.jason.state, items: r.items.map(k => (ITEMS[k] || CURSED[k]).name),
    };
  }
  askBrain(event) {
    const runRef = this.run;
    return Brain.ask(event, this.brainStats()).then(res => {
      if (this.run !== runRef) return res;
      runRef.thought = res.thought; runRef.aggression = res.aggression; runRef.strategy = res.strategy;
      this.brainSource = res.source;
      if (res.line && event !== 'ending') this.say(res.line);
      return res;
    });
  }

  // ---------- grid / pathfinding ----------
  blocked(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS && this.grid[r][c] === 1; }
  los(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1), steps = Math.ceil(d / 12);
    for (let i = 1; i < steps; i++) {
      const x = x1 + (x2 - x1) * i / steps, y = y1 + (y2 - y1) * i / steps;
      if (this.blocked(Math.floor(x / T), Math.floor(y / T))) return false;
    }
    return true;
  }
  bfsNext(sx, sy, tx, ty) {
    const sc = clamp(Math.floor(sx / T), 0, COLS - 1), sr = clamp(Math.floor(sy / T), 0, ROWS - 1);
    const tc = clamp(Math.floor(tx / T), 0, COLS - 1), tr = clamp(Math.floor(ty / T), 0, ROWS - 1);
    if (sc === tc && sr === tr) return { x: tx, y: ty };
    const prev = new Int32Array(COLS * ROWS).fill(-1);
    const start = sr * COLS + sc, goal = tr * COLS + tc;
    const q = [start]; prev[start] = start;
    while (q.length) {
      const cur = q.shift();
      if (cur === goal) break;
      const c = cur % COLS, r = (cur - c) / COLS;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || this.grid[nr][nc] === 1) continue;
        const ni = nr * COLS + nc;
        if (prev[ni] !== -1) continue;
        prev[ni] = cur; q.push(ni);
      }
    }
    if (prev[goal] === -1) return null;
    let step = goal;
    while (prev[step] !== start) step = prev[step];
    const c = step % COLS;
    return tileCenter(c, (step - c) / COLS);
  }
  randomOpenPoint(minDistFromPlayer = 0) {
    for (let i = 0; i < 200; i++) {
      const c = randi(2, COLS - 3), r = randi(2, ROWS - 3);
      if (this.grid[r][c]) continue;
      const p = tileCenter(c, r);
      if (Math.hypot(p.x - this.player.x, p.y - this.player.y) >= minDistFromPlayer) return p;
    }
    return { x: W / 2, y: H / 2 };
  }

  // ---------- rooms ----------
  clearRoomObjects() {
    this.roomToken++;
    [this.walls, this.obst, this.blocks, this.enemies, this.bolts, this.eshots].forEach(g => g.clear(true, true));
    this.roomObjs.forEach(o => o.destroy()); this.roomObjs = [];
    this.hides = []; this.pedestals = []; this.plates = []; this.pumpkins = []; this.searchObjs = [];
    this.lantern = null; this.trapPed = null; this.fight = null; this.simon = null; this.gateZone = false; this.rightDoorWalls = [];
  }

  drawFloor(color, seed) {
    const g = this.floorG; g.clear();
    g.fillStyle(color); g.fillRect(0, 0, W, H);
    let s = seed * 9301 + 49297;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 260; i++) {
      g.fillStyle(rnd() < 0.5 ? 0x000000 : 0xffffff, 0.06 + rnd() * 0.06);
      g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 2 + Math.floor(rnd() * 3), 2);
    }
    g.fillStyle(0x000000, 0.18); g.fillRect(0, 9 * T, W, 2 * T); // the trail path
  }

  buildWalls(opts) {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!(r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1)) continue;
      const doorRow = r === 9 || r === 10;
      if (c === 0 && doorRow && opts.left) continue;
      if (c === COLS - 1 && doorRow && opts.right) continue;
      let tex = 'wall';
      if (r === 0 && (c === 14 || c === 15) && opts.gate) { if (opts.gateOpen) continue; tex = 'gate'; }
      const p = tileCenter(c, r);
      const w = this.walls.create(p.x, p.y, tex);
      this.grid[r][c] = 1;
      if (c === COLS - 1 && doorRow) this.rightDoorWalls.push(w);
    }
  }

  addObstacle(c, r, kind) {
    const p = tileCenter(c, r);
    const o = this.obst.create(p.x, p.y, kind);
    o.body.setSize(26, 26);
    o.setDepth(4);
    this.grid[r][c] = 1;
  }

  enterRoom(idx, side) {
    const prev = this.cur;
    this.cur = idx;
    const room = this.room = this.run.rooms[idx];
    this.clearRoomObjects();
    this.drawFloor(room.floor, idx + 1);
    const gateOpen = this.run.cleared >= CHALLENGES;
    this.buildWalls({ left: true, right: true, gate: room.type === 'exit', gateOpen });
    room.obstacles.forEach(o => this.addObstacle(o.c, o.r, o.kind));
    this.hides = room.hides.map(h => {
      const p = tileCenter(h.c, h.r);
      return { x: p.x, y: p.y, spr: this.track(this.add.image(p.x, p.y, h.kind).setDepth(7)), kind: h.kind };
    });
    this.roomTime = 0;
    const pos = side === 'left' ? { x: 46, y: 320 } : side === 'right' ? { x: W - 46, y: 320 } : { x: 480, y: 440 };
    this.player.body.reset(pos.x, pos.y);
    this.setupType(room, side);
    this.banner(room.area, TYPE_LABEL[room.type] + (room.cleared ? '  (cleared)' : ''));
    if (prev !== undefined) this.jasonOnPlayerMove(prev, idx, side);
  }

  setupType(room, side) {
    const tok = this.roomToken;
    const later = (ms, fn) => this.time.delayedCall(ms, () => { if (tok === this.roomToken && !this.over) fn(); });
    switch (room.type) {
      case 'exit': {
        const open = this.run.cleared >= CHALLENGES;
        this.track(txt(this, W / 2, 62, open ? 'THE GATE IS OPEN. GO NORTH!' : `GATE LOCKED: clear the trail ${this.run.cleared}/${CHALLENGES}`, 16, open ? '#80ff90' : '#ff8070').setOrigin(0.5).setDepth(3));
        this.track(txt(this, 70, 200, '<- Smokehouse', 13, '#bbaa88').setDepth(3));
        this.track(txt(this, W - 190, 200, 'Campsite ->', 13, '#bbaa88').setDepth(3));
        this.gateZone = open;
        break;
      }
      case 'shop':
        this.track(txt(this, W / 2, 110, 'RANGER STATION: walk up to an item and press E to buy', 14, '#ffe0a0').setOrigin(0.5).setDepth(3));
        room.stock.forEach((st, i) => {
          const x = 240 + i * 120, y = 210, it = ITEMS[st.key];
          this.track(this.add.image(x, y + 14, 'pedestal').setDepth(3));
          const icon = this.track(this.add.circle(x, y - 4, 11, CAT_COLOR[it.cat]).setStrokeStyle(2, 0x000000).setDepth(4));
          const label = this.track(txt(this, x, y + 30, `${it.name}\n${st.sold ? 'SOLD' : it.price + 'c'}`, 11, '#ffffff', { align: 'center' }).setOrigin(0.5, 0).setDepth(4));
          if (st.sold) icon.setAlpha(0.2);
          this.pedestals.push({ x, y, st, icon, label });
        });
        break;
      case 'fight':
        if (!room.cleared) later(700, () => {
          const n = 3 + Math.min(4, this.run.cleared);
          for (let i = 0; i < n; i++) this.spawnEnemy(pick(['zombie', 'zombie', 'bat', 'crow']));
          this.fight = { active: true };
        });
        break;
      case 'trap': {
        this.track(this.add.image(W / 2, 250, 'altar').setDepth(3));
        if (!room.taken) {
          const it = CURSED[room.cursedKey];
          const icon = this.track(this.add.circle(W / 2, 228, 10, CAT_COLOR.Cursed).setStrokeStyle(2, 0xff3030).setDepth(4));
          this.tweens.add({ targets: icon, scale: 1.3, duration: 500, yoyo: true, repeat: -1 });
          this.track(txt(this, W / 2, 196, `${it.name} (FREE)\n${it.desc}`, 11, '#ff9090', { align: 'center' }).setOrigin(0.5, 1).setDepth(4));
          this.trapPed = { x: W / 2, y: 240, icon };
        } else if (!room.cleared) later(500, () => this.trapAmbush());
        break;
      }
      case 'plates': {
        const P = [[320, 160], [640, 160], [480, 480]];
        this.plates = P.map(([x, y]) => ({ x, y, spr: this.track(this.add.image(x, y, 'plate').setDepth(2)) }));
        this.track(txt(this, W / 2, 56, 'Push the crates onto the plates.  R = reset (loud)', 13, '#d0d0d0').setOrigin(0.5).setDepth(3));
        this.spawnCrates(room.cleared);
        break;
      }
      case 'search':
        this.track(txt(this, W / 2, 56, 'The gate key is hidden in one of these stumps.  E = search', 13, '#d0d0d0').setOrigin(0.5).setDepth(3));
        room.searchObjs.forEach((o, i) => {
          const p = tileCenter(o.c, o.r);
          const spr = this.track(this.add.image(p.x, p.y, 'stump').setDepth(3));
          if (o.searched) spr.setTint(0x555555);
          if (i === room.keyIdx && this.has('trailmap') && !room.cleared) this.tweens.add({ targets: spr, alpha: 0.5, duration: 300, yoyo: true, repeat: -1 });
          this.searchObjs.push({ x: p.x, y: p.y, spr, o, isKey: i === room.keyIdx });
        });
        break;
      case 'simon': {
        const P = [[480, 180], [340, 320], [620, 320], [480, 460]];
        this.pumpkins = P.map(([x, y]) => ({ x, y, spr: this.track(this.add.image(x, y, 'pumpkin').setDepth(3).setScale(1.4)) }));
        this.track(txt(this, W / 2, 56, 'Watch the pumpkins glow, then step on them in the same order.', 13, '#d0d0d0').setOrigin(0.5).setDepth(3));
        if (!room.cleared) { this.simon = { i: 0, playing: true, on: -1 }; later(1200, () => this.playSimon()); }
        else this.pumpkins.forEach(p => p.spr.setTexture('pumpkinLit'));
        break;
      }
      case 'stealth': {
        const lx = side === 'right' ? 70 : W - 70, ly = pick([120, 520]);
        const l = this.track(this.add.image(lx, ly, room.cleared ? 'lanternLit' : 'lantern').setDepth(3).setScale(1.3));
        this.track(txt(this, W / 2, 56, 'Light the ranger lantern without being seen. Sneak with SHIFT.', 13, '#d0d0d0').setOrigin(0.5).setDepth(3));
        if (!room.cleared) this.lantern = { x: lx, y: ly, spr: l };
        break;
      }
    }
  }

  spawnCrates(solved) {
    const P = solved ? [[320, 160], [640, 160], [480, 480]] : [[320, 260], [640, 260], [480, 390]];
    P.forEach(([x, y]) => {
      const b = this.blocks.create(x, y, 'crate').setDepth(5);
      b.body.setSize(28, 28);
      b.setDrag(1400).setMaxVelocity(160).setCollideWorldBounds(true);
      if (solved) b.setImmovable(true).body.moves = false;
    });
  }

  playSimon() {
    const seq = this.room.seq;
    this.simon.playing = true;
    seq.forEach((k, i) => this.time.delayedCall(i * 700, () => { if (this.simon) this.flashPumpkin(k); }));
    this.time.delayedCall(seq.length * 700, () => { if (this.simon) { this.simon.playing = false; this.simon.i = 0; } });
  }
  flashPumpkin(k) {
    const p = this.pumpkins[k]; if (!p) return;
    p.spr.setTexture('pumpkinLit'); SFX.pumpkin(k);
    this.time.delayedCall(380, () => { if (p.spr.active && !this.room.cleared) p.spr.setTexture('pumpkin'); });
  }

  trapAmbush() {
    for (let i = 0; i < 5; i++) this.spawnEnemy(pick(['zombie', 'bat', 'crow']));
    this.fight = { active: true };
  }

  clearCurrent() {
    const room = this.room;
    if (room.cleared || room.type === 'finale') return;
    room.cleared = true; this.run.cleared++;
    const reward = (10 + (this.roomTime < 45 ? 5 : 0)) * (this.has('bloodcoin') ? 2 : 1);
    this.run.coins += reward;
    SFX.good();
    this.banner('AREA CLEARED', `+${reward} coins   Gate ${this.run.cleared}/${CHALLENGES}`);
    if (this.run.cleared >= CHALLENGES) this.chat('TRAIL', 'The Trailhead gate creaks open... go back and escape!', '#9fd3a0');
    if (room.type === 'stealth' && this.jason.inRoom && this.jason.state === 'patrol') this.jasonLeave('lost');
    this.askBrain('room_clear');
  }

  puzzleFail(msg) {
    this.run.stats.failedPuzzles++;
    if (!this.has('whisper')) this.addNoise(12);
    SFX.fail(); this.toast(msg + (this.has('whisper') ? '' : '  (that was loud)'));
  }

  // ---------- combat ----------
  spawnEnemy(kind) {
    const p = this.randomOpenPoint(220);
    const e = this.enemies.create(p.x, p.y, kind).setDepth(8);
    e.kind = kind; e.hp = { zombie: 3, bat: 2, crow: 3 }[kind] + Math.floor(this.run.cleared / 3);
    e.t = rand(0, 6); e.shootT = rand(1.2, 2.5);
    if (kind === 'crow') e.setImmovable(true);
    e.setAlpha(0); this.tweens.add({ targets: e, alpha: 1, duration: 300 });
  }
  damageEnemy(e, dmg) {
    if (!e.active) return;
    e.hp -= dmg;
    e.setTintFill(0xffffff);
    this.time.delayedCall(60, () => e.active && e.clearTint());
    if (e.hp <= 0) {
      const coins = randi(1, 2) * (this.has('bloodcoin') ? 2 : 1);
      this.run.coins += coins; this.run.stats.kills++;
      SFX.coin();
      const puff = this.track(txt(this, e.x, e.y - 10, `+${coins}c`, 12, '#ffe060').setOrigin(0.5).setDepth(20));
      this.tweens.add({ targets: puff, y: e.y - 40, alpha: 0, duration: 700 });
      e.destroy();
    }
  }
  playerHit() {
    if (this.hitCd > 0 || this.hidden || this.knockT > 0 || this.over) return;
    this.hitCd = 1;
    const lost = this.run.coins > 0 ? 1 : 0;
    this.run.coins -= lost; this.run.stats.enemyHits++;
    this.addNoise(6); SFX.hit();
    this.player.setTint(0xff4040); this.time.delayedCall(150, () => this.player.clearTint());
    this.toast(lost ? '-1 coin (and that made noise)' : 'Ouch! (that made noise)');
  }
  updateEnemies(dt) {
    const p = this.player;
    this.enemies.getChildren().slice().forEach(e => {
      e.t += dt;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      if (e.kind === 'zombie') e.setVelocity(dx / d * (55 + this.run.cleared * 6), dy / d * (55 + this.run.cleared * 6));
      else if (e.kind === 'bat') e.setVelocity(dx / d * 105 + Math.sin(e.t * 5) * 90, dy / d * 105 + Math.cos(e.t * 4) * 90);
      else if (e.kind === 'crow') {
        e.setVelocity(0); e.setFlipX(dx < 0);
        e.shootT -= dt;
        if (e.shootT <= 0 && !this.hidden) {
          e.shootT = 2.2 - Math.min(0.8, this.run.cleared * 0.1);
          const s = this.eshots.create(e.x, e.y, 'eshot').setDepth(8);
          s.setVelocity(dx / d * 190, dy / d * 190); s.life = 3;
        }
      }
      if (e.kind !== 'crow' && Math.abs(dx) > 2) e.setFlipX(dx < 0);
    });
    this.eshots.getChildren().slice().forEach(s => { s.life -= dt; if (s.life <= 0) s.destroy(); });
    this.bolts.getChildren().slice().forEach(b => { b.life -= dt; if (b.life <= 0) b.destroy(); });
  }

  // ---------- hiding / minigame ----------
  jasonSeesPlayer() {
    const j = this.jason, s = j.sprite, p = this.player;
    if (!j.inRoom || this.hidden) return false;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    if (j.state === 'patrol') return this.inCone();
    return d < 420 && this.los(s.x, s.y, p.x, p.y);
  }
  inCone() {
    const s = this.jason.sprite, p = this.player;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    const diff = Phaser.Math.Angle.Wrap(Math.atan2(p.y - s.y, p.x - s.x) - this.jason.facing);
    return d < 230 && Math.abs(diff) < 0.6 && this.los(s.x, s.y, p.x, p.y);
  }
  hide(spot) {
    const j = this.jason;
    const saw = this.jasonSeesPlayer();
    this.hidden = spot; this.run.stats.hides++;
    this.player.setVelocity(0).setAlpha(0);
    this.player.body.enable = false;
    this.tweens.add({ targets: spot.spr, x: spot.x + 2, duration: 60, yoyo: true, repeat: 3 });
    this.toast(saw ? 'He SAW you hide...' : 'You hold still in the dark.');
    if (j.inRoom && (j.state === 'chase' || saw) && j.state !== 'mg') {
      j.state = 'search'; j.searchT = 9; j.sawHide = saw; j.searchTarget = saw ? { x: spot.x, y: spot.y, spot } : null;
    }
  }
  unhide() {
    const s = this.hidden; if (!s) return;
    this.hidden = null;
    this.player.body.enable = true;
    this.player.body.reset(s.x, s.y + (s.y < H / 2 ? 34 : -34));
    this.player.setAlpha(1);
  }
  startMinigame(hard) {
    if (this.mg) return;
    const j = this.jason; j.state = 'mg'; j.sprite.setVelocity(0);
    this.mg = { need: hard ? 3 : 2, done: 0, pos: 0, dir: 1, t: 0, speed: (hard ? 1.5 : 1.1) * (1 + this.run.cleared * 0.07), hard };
    this.newZone();
    SFX.heartbeat(0.4);
  }
  newZone() { const w = this.mg.hard ? 0.15 : 0.22; this.mg.a = rand(0.08, 0.92 - w); this.mg.w = w; this.mg.t = 0; }
  updateMinigame(dt) {
    const m = this.mg;
    m.pos += m.dir * m.speed * dt;
    if (m.pos > 1) { m.pos = 1; m.dir = -1; } if (m.pos < 0) { m.pos = 0; m.dir = 1; }
    m.t += dt;
    const g = this.mgG; g.clear();
    const x = W / 2 - 180, y = 520, w = 360;
    g.fillStyle(0x000000, 0.8); g.fillRect(x - 10, y - 40, w + 20, 76);
    g.fillStyle(0x552222); g.fillRect(x, y, w, 20);
    g.fillStyle(0x40d070); g.fillRect(x + m.a * w, y, m.w * w, 20);
    g.fillStyle(0xffffff); g.fillRect(x + m.pos * w - 2, y - 4, 4, 28);
    this.mgText.setText(`HOLD YOUR BREATH! SPACE in the green  (${m.done}/${m.need})`).setY(y - 22);
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
      if (m.pos >= m.a && m.pos <= m.a + m.w) {
        m.done++; SFX.heartbeat(0.3);
        if (m.done >= m.need) return this.endMinigame(true);
        this.newZone();
      } else return this.endMinigame(false);
    }
    if (m.t > 4.5) this.endMinigame(false);
  }
  endMinigame(ok) {
    this.mg = null; this.mgG.clear(); this.mgText.setText('');
    if (ok) {
      this.run.awareness = 20;
      this.jasonLeave('lost');
      this.askBrain('hide_success');
      this.toast('He gives up... for now.');
    } else {
      this.say('Found you.');
      this.unhide();
      this.caught();
    }
  }

  // ---------- Baked Man ----------
  jasonSpeed() {
    const j = this.jason;
    if (this.finale) return 160 * (this.has('bloodcoin') ? 1.06 : 1);
    let sp = 138 + 6 * this.run.cleared + 26 * this.run.aggression;
    if (this.has('bloodcoin')) sp *= 1.12;
    sp = Math.min(sp, 176);
    return sp * ({ chase: 1, search: 0.7, wander: 0.45, patrol: 0.42, leave: 0.8 }[j.state] || 0);
  }
  spawnJason(side, state) {
    const j = this.jason, s = j.sprite;
    j.room = this.cur; j.inRoom = true; j.follow = null;
    const pos = side === 'left' ? { x: 18, y: 320 } : side === 'right' ? { x: W - 18, y: 320 } : side;
    s.setPosition(pos.x, pos.y).setVelocity(0).setVisible(true).setAlpha(1);
    j.state = 'wander'; j.lostT = 0; j.wanderT = 12; j.searchTarget = null; j.next = null; j.pathT = 0; j.spot = 0; j.investigate = null;
    j.facing = Math.atan2(this.player.y - s.y, this.player.x - s.x);
    if (state === 'chase') this.startChase();
    else if (state === 'patrol') {
      j.state = 'patrol';
      j.wps = [0, 1, 2, 3].map(() => this.randomOpenPoint(0)); j.wpI = 0;
    } else this.toast('Heavy footsteps... something walked in.');
  }
  startChase() {
    const j = this.jason;
    j.state = 'chase'; j.lostT = 0; this.run.awareness = 100;
    if (this.time.now - j.lastChaseAt > 6000) {
      SFX.sting(); this.cameras.main.shake(250, 0.006);
      this.banner('HE FOUND YOU', this.finale ? 'RUN!' : 'Run to another area, or hide (E)');
      this.askBrain('chase_start');
    }
    j.lastChaseAt = this.time.now;
  }
  jasonLeave(reason) {
    const j = this.jason;
    j.state = 'leave'; j.leaveReason = reason; j.next = null;
    j.leaveSide = j.sprite.x < W / 2 ? 'left' : 'right';
  }
  goOffscreen(dir) {
    const j = this.jason;
    j.inRoom = false; j.sprite.setVisible(false).setVelocity(0).setPosition(-200, -200);
    j.room = (this.cur + dir + N) % N;
    if (j.leaveReason === 'dead') { j.state = 'away'; } else { j.state = 'wander'; j.moveT = 8; }
    j.leaveReason = null;
  }
  caught() {
    const r = this.run, j = this.jason;
    if (this.over) return;
    r.hearts--; r.stats.catches++;
    SFX.hit(); SFX.sting();
    this.cameras.main.flash(400, 160, 0, 0); this.cameras.main.shake(300, 0.012);
    if (this.hidden) this.unhide();
    if (r.hearts <= 0) return this.gameOver();
    this.knockT = 1.6; this.invulnT = 4;
    this.player.setVelocity(0).setAlpha(0.5);
    this.askBrain('caught');
    if (this.finale) {
      this.banner('HE GOT YOU', `${r.hearts} heart(s) left. Keep running!`);
      j.stunT = 2.5; j.sprite.setPosition(30, randi(100, 540));
      return;
    }
    this.banner('YOU WENT LIMP...', `${r.hearts} heart(s) left. He thinks you're dead.`);
    this.jasonLeave('dead');
    j.catchRoom = this.cur; j.awayT = Math.max(10, 18 - r.cleared);
    r.awareness = 10;
  }

  jasonOnPlayerMove(prev, idx, side) {
    const j = this.jason;
    if (j.inRoom) {
      j.inRoom = false; j.sprite.setVisible(false).setVelocity(0).setPosition(-200, -200); j.room = prev;
      if (j.state === 'chase') j.follow = { t: Math.max(1.4, 2.4 - 0.12 * this.run.cleared), room: idx, side };
      else if (j.state === 'leave' && j.leaveReason === 'dead') { j.state = 'away'; j.leaveReason = null; }
      else { j.state = 'wander'; j.moveT = 6; }
    } else if (j.follow) {
      j.room = prev; j.follow = { t: 2.2, room: idx, side };
    }
    if (this.room.type === 'stealth' && !this.room.cleared && !j.follow) {
      const far = side === 'left' ? { x: W - 160, y: 320 } : { x: 160, y: 320 };
      this.spawnJason(far, 'patrol');
    } else if (!j.follow && j.state !== 'away' && j.room === idx) {
      if (this.allowed(idx)) this.spawnJason(side === 'left' ? 'right' : 'left', this.run.awareness >= 100 ? 'chase' : 'wander');
      else j.room = (idx + (side === 'left' ? 1 : -1) + N) % N;
    }
  }

  moveJasonTo(tx, ty, speed, dt) {
    const j = this.jason, s = j.sprite;
    let gx = tx, gy = ty;
    if (!this.los(s.x, s.y, tx, ty)) {
      j.pathT -= dt;
      if (j.pathT <= 0 || !j.next) { j.pathT = 0.25; j.next = this.bfsNext(s.x, s.y, tx, ty); }
      if (j.next) { gx = j.next.x; gy = j.next.y; if (Math.hypot(gx - s.x, gy - s.y) < 5) j.pathT = 0; }
    } else j.next = null;
    const dx = gx - s.x, dy = gy - s.y, d = Math.hypot(dx, dy);
    if (d < 2) { s.setVelocity(0); return 0; }
    s.setVelocity(dx / d * speed, dy / d * speed);
    if (Math.abs(dx) > 1) s.setFlipX(dx < 0);
    j.facing = Math.atan2(dy, dx);
    return Math.hypot(tx - s.x, ty - s.y);
  }

  updateJasonIn(dt) {
    const j = this.jason, s = j.sprite, p = this.player;
    const speed = this.jasonSpeed();
    const dist = Math.hypot(p.x - s.x, p.y - s.y);
    if (j.stunT > 0) { j.stunT -= dt; s.setVelocity(0); s.setAlpha(0.6); return; }
    s.setAlpha(1);
    switch (j.state) {
      case 'chase':
        this.run.awareness = 100;
        if (this.jasonSeesPlayer()) j.lostT = 0; else j.lostT += dt;
        this.moveJasonTo(p.x, p.y, speed, dt);
        if (!this.finale && j.lostT > 6) { j.state = 'search'; j.searchT = 8; j.searchTarget = null; j.sawHide = false; }
        break;
      case 'search': {
        j.searchT -= dt;
        if (!this.hidden && this.jasonSeesPlayer() && dist < 300) { this.startChase(); break; }
        if (!j.searchTarget) {
          const check = this.run.strategy === 'check_hiding_spots' ? 0.6 : 0.3;
          if (this.hidden && (j.sawHide || Math.random() < check)) j.searchTarget = { x: this.hidden.x, y: this.hidden.y, spot: this.hidden };
          else j.searchTarget = this.randomOpenPoint(0);
        }
        const left = this.moveJasonTo(j.searchTarget.x, j.searchTarget.y, speed, dt);
        if (left < 40) {
          if (j.searchTarget.spot && this.hidden === j.searchTarget.spot) { this.startMinigame(j.sawHide); break; }
          j.searchTarget = null;
        }
        if (j.searchT <= 0) { this.run.awareness = 30; this.jasonLeave('lost'); }
        break;
      }
      case 'wander':
        j.wanderT -= dt;
        if (this.jasonSeesPlayer() && (dist < 280 || (!this.sneaking && this.moving && dist < 380))) { this.startChase(); break; }
        if (!j.searchTarget) j.searchTarget = this.randomOpenPoint(0);
        if (this.moveJasonTo(j.searchTarget.x, j.searchTarget.y, speed, dt) < 30) j.searchTarget = null;
        if (j.wanderT <= 0) this.jasonLeave('bored');
        break;
      case 'patrol': {
        if (this.inCone() && !this.hidden) j.spot += dt * (this.sneaking ? 1.1 : 3);
        else j.spot = Math.max(0, j.spot - dt * 0.5);
        if (j.spot >= 1) { this.startChase(); break; }
        if (this.moving && !this.sneaking && dist < 170 && !this.hidden) j.investigate = { x: p.x, y: p.y, t: 3 };
        if (j.investigate) {
          j.investigate.t -= dt;
          if (this.moveJasonTo(j.investigate.x, j.investigate.y, speed * 1.2, dt) < 30 || j.investigate.t <= 0) j.investigate = null;
        } else {
          const wp = j.wps[j.wpI];
          if (this.moveJasonTo(wp.x, wp.y, speed, dt) < 20) j.wpI = (j.wpI + 1) % j.wps.length;
        }
        break;
      }
      case 'leave': {
        const tx = j.leaveSide === 'left' ? -30 : W + 30;
        this.moveJasonTo(tx, 320, speed, dt);
        if (s.x < 6) this.goOffscreen(-1); else if (s.x > W - 6) this.goOffscreen(1);
        break;
      }
      case 'mg':
        s.setVelocity(0);
        break;
    }
    if (j.inRoom && ['chase', 'search', 'wander', 'patrol'].includes(j.state) && !this.hidden && this.invulnT <= 0 && this.knockT <= 0
      && Math.hypot(p.x - s.x, p.y - s.y) < 26) this.caught();
  }

  updateJasonOff(dt) {
    const j = this.jason, r = this.run;
    if (j.follow) {
      j.follow.t -= dt;
      if (j.follow.t <= 0) {
        const f = j.follow; j.follow = null;
        if (this.cur === f.room && this.allowed(this.cur)) this.spawnJason(f.side, 'chase');
        else { j.state = 'stalk'; j.moveT = 3; r.awareness = Math.max(r.awareness, 90); this.toast('He stopped at the door... listening.'); }
      }
      return;
    }
    if (j.state === 'away') {
      j.awayT -= dt;
      if (j.awayT <= 0) {
        j.room = j.catchRoom;
        this.askBrain('return');
        if (this.cur === j.room && this.allowed(this.cur)) this.spawnJason(pick(['left', 'right']), 'chase');
        else { j.state = 'wander'; j.moveT = 6; }
      }
      return;
    }
    const { dist, dir } = this.ringDist(j.room, this.cur);
    if (r.awareness >= 75) j.state = 'stalk'; else if (j.state === 'stalk' && r.awareness < 55) j.state = 'wander';
    if (dist === 0) {
      if (this.allowed(this.cur)) this.spawnJason(pick(['left', 'right']), r.awareness >= 100 ? 'chase' : 'wander');
      else j.room = (j.room + pick([-1, 1]) + N) % N;
      return;
    }
    if (dist === 1 && r.awareness >= 100 && this.allowed(this.cur)) { this.spawnJason(dir > 0 ? 'left' : 'right', 'chase'); return; }
    j.moveT -= dt;
    if (j.moveT > 0) return;
    if (j.state === 'stalk') {
      j.moveT = r.awareness >= 100 ? 1.6 : 3.5;
      // "ambush": he circles to the door you're heading toward instead of the one behind you
      if (dist > 1) j.room = (j.room + dir + N) % N;
    } else {
      j.moveT = Math.max(4, 10 - 0.7 * r.cleared);
      const track = 0.5 + 0.06 * r.cleared + (r.strategy === 'stalk' ? 0.15 : 0);
      const d = Math.random() < track ? dir : pick([-1, 1]);
      let next = (j.room + d + N) % N;
      if (next === this.cur) {
        if (r.awareness >= 50 && this.allowed(this.cur)) { this.spawnJason(d > 0 ? 'left' : 'right', 'wander'); return; }
        next = (j.room - d + N) % N;
      }
      j.room = next;
    }
  }

  // ---------- finale ----------
  startFinale() {
    this.finale = { t: 25, open: false, emberT: 2 };
    this.cur = -1;
    this.room = { type: 'finale', area: 'The Last Mile', floor: 0x2a1410, cleared: false };
    this.clearRoomObjects();
    this.drawFloor(0x2a1410, 99);
    this.buildWalls({ left: false, right: false });
    for (let n = 0, tries = 0; n < 16 && tries < 400; tries++) {
      const c = randi(4, COLS - 4), r = randi(2, ROWS - 3);
      if (this.grid[r][c] || this.grid[r - 1][c] || this.grid[r + 1][c] || this.grid[r][c - 1] || this.grid[r][c + 1]) continue;
      this.addObstacle(c, r, pick(['deadtree', 'tree', 'rock'])); n++;
    }
    this.hides = [];
    this.player.body.reset(70, 320);
    this.finaleText = this.track(txt(this, W / 2, 50, '', 18, '#ffcc66').setOrigin(0.5).setDepth(100));
    this.banner('THE LAST MILE', 'Dodge the falling embers. Survive 25s until the exit opens ->');
    const j = this.jason; j.follow = null; j.inRoom = false; j.sprite.setVisible(false);
    const tok = this.roomToken;
    this.time.delayedCall(1500, () => { if (tok === this.roomToken && !this.over) this.spawnJason({ x: 20, y: 320 }, 'chase'); });
  }
  updateFinale(dt) {
    const f = this.finale, p = this.player;
    if (!f.open) {
      f.t -= dt;
      this.finaleText.setText(`Exit opens in ${Math.ceil(Math.max(0, f.t))}s`);
      if (f.t <= 0) {
        f.open = true;
        this.rightDoorWalls.forEach(w => w.destroy());
        this.grid[9][COLS - 1] = 0; this.grid[10][COLS - 1] = 0;
        this.finaleText.setText('THE EXIT IS OPEN!  RUN ->');
        SFX.good();
      }
    }
    f.emberT -= dt;
    if (f.emberT <= 0) {
      f.emberT = 0.75;
      const tx = clamp(p.x + p.body.velocity.x * 0.6 + rand(-60, 60), 40, W - 40), ty = clamp(p.y + p.body.velocity.y * 0.6 + rand(-60, 60), 40, H - 40);
      const warn = this.track(this.add.circle(tx, ty, 28, 0xff6600, 0.18).setStrokeStyle(2, 0xff9900).setDepth(3));
      const tok = this.roomToken;
      this.time.delayedCall(850, () => {
        if (tok !== this.roomToken || this.over) return;
        warn.setFillStyle(0xffcc33, 0.8);
        this.tweens.add({ targets: warn, alpha: 0, scale: 1.4, duration: 300 });
        SFX.boom((tx - W / 2) / W * 2);
        if (Math.hypot(this.player.x - tx, this.player.y - ty) < 30 && this.invulnT <= 0) {
          this.slowT = 0.9; this.playerHit(); this.toast('Burned! You stumble.');
        }
      });
    }
    if (f.open && p.x > W - 14) this.win();
  }

  // ---------- end states ----------
  endOverlay(title, color) {
    this.over = true;
    this.physics.pause();
    this.mgG.clear(); this.mgText.setText('');
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.86).setDepth(300);
    txt(this, W / 2, 120, title, 34, color).setOrigin(0.5).setDepth(301);
    const s = this.run.stats;
    txt(this, W / 2, 190, `Areas cleared ${this.run.cleared}/${CHALLENGES}   Hearts ${this.run.hearts}   Caught ${s.catches}   Hid ${s.hides}   Kills ${s.kills}   Failed puzzles ${s.failedPuzzles}`, 14).setOrigin(0.5).setDepth(301);
    const epi = txt(this, W / 2, 300, 'The Baked Man is thinking...', 16, '#ffb08a', { wordWrap: { width: 720 }, align: 'center' }).setOrigin(0.5).setDepth(301);
    txt(this, W / 2, 560, 'Press R to start a new run', 18, '#ffcc66').setOrigin(0.5).setDepth(301);
    return epi;
  }
  win() {
    const epi = this.endOverlay('YOU ESCAPED THE NATURE TRAIL', '#80ff90');
    SFX.good();
    this.askBrain('ending').then(res => epi.setText(`${res.ending}\n\nBAKED MAN: "${res.line}"`));
  }
  gameOver() {
    const epi = this.endOverlay('THE BAKED MAN GOT YOU', '#ff4020');
    this.askBrain('death').then(res => epi.setText(`BAKED MAN: "${res.line}"`));
  }

  // ---------- main loop ----------
  update(time, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const k = this.keys, p = this.player, r = this.run, j = this.jason;
    if (this.over) { if (Phaser.Input.Keyboard.JustDown(k.R)) this.scene.restart(); return; }
    if (Phaser.Input.Keyboard.JustDown(k.B)) this.showBrain = !this.showBrain;
    this.roomTime += dt;
    ['knockT', 'invulnT', 'hitCd', 'shootCd', 'auraT', 'fireCd', 'slowT', 'pushT'].forEach(n => { this[n] = Math.max(0, this[n] - dt); });
    if (this.knockT <= 0 && !this.hidden) p.setAlpha(this.invulnT > 0 ? 0.6 + Math.sin(time / 60) * 0.3 : 1);

    // movement
    this.sneaking = k.SHIFT.isDown;
    this.moving = false;
    if (!this.hidden && this.knockT <= 0) {
      const vx = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0), vy = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
      let sp = this.sneaking ? 85 : 180;
      if (this.has('energy')) sp *= 1.2;
      if (this.slowT > 0) sp *= 0.45;
      if (vx || vy) {
        const l = Math.hypot(vx, vy);
        p.setVelocity(vx / l * sp, vy / l * sp);
        this.facing = { x: vx / l, y: vy / l };
        if (vx) p.setFlipX(vx < 0);
        this.moving = true;
      } else p.setVelocity(0);
      if (this.moving && !this.sneaking) this.addNoise(2.2 * dt * (this.has('sneakers') ? 0.5 : 1) * (this.has('energy') ? 1.3 : 1));
      if (this.pushT > 0) this.addNoise(1.2 * dt);

      // shooting
      const sx = (k.RIGHT.isDown ? 1 : 0) - (k.LEFT.isDown ? 1 : 0), sy = (k.DOWN.isDown ? 1 : 0) - (k.UP.isDown ? 1 : 0);
      if ((sx || sy) && this.shootCd <= 0) {
        this.shootCd = this.has('capacitor') ? 0.21 : 0.35;
        const l = Math.hypot(sx, sy);
        const b = this.bolts.create(p.x + sx / l * 12, p.y + sy / l * 8, 'bolt').setDepth(9);
        b.setVelocity(sx / l * 430, sy / l * 430).setRotation(Math.atan2(sy, sx)); b.life = 1.1;
        SFX.zap(); this.addNoise(0.8);
      }
    } else p.setVelocity(0);

    // always-on taser field
    const auraR = this.has('arc') ? 50 : 32;
    this.auraG.clear();
    if (!this.hidden) {
      this.auraG.lineStyle(2, 0x7fdbff, 0.15 + Math.random() * 0.35).strokeCircle(p.x, p.y + 4, auraR);
      if (this.auraT <= 0) {
        this.auraT = 0.3;
        this.enemies.getChildren().slice().forEach(e => {
          if (Math.hypot(e.x - p.x, e.y - p.y) < auraR + 8) this.damageEnemy(e, (this.has('arc') ? 1 : 0.5) * (this.has('mask') ? 2 : 1));
        });
      }
    }

    this.updateEnemies(dt);
    this.updateInteractions();
    this.updateRoomLogic(dt);

    if (this.finale) {
      this.updateFinale(dt);
      if (this.over) return;
    } else {
      // doors (ring)
      if (p.x < 6) { if (!this.sneaking) this.addNoise(8); this.enterRoom((this.cur - 1 + N) % N, 'right'); }
      else if (p.x > W - 6) { if (!this.sneaking) this.addNoise(8); this.enterRoom((this.cur + 1) % N, 'left'); }
      else if (this.gateZone && p.y < 22 && p.x > 14 * T && p.x < 16 * T) { this.startFinale(); return; }

      // awareness: rises over time, falls when hiding or sneaking still
      let rate = 0.45 * (1 + 0.12 * r.cleared) * this.noiseMult();
      if (this.hidden) rate = -8; else if (this.sneaking && !this.moving) rate = -1.5;
      if (j.state === 'away' || j.follow) rate = Math.min(rate, 0.2);
      r.awareness = clamp(r.awareness + rate * dt, 0, 100);
      if (!j.inRoom && !this.allowed(this.cur)) r.awareness = Math.min(r.awareness, 99);
    }
    if (this.over) return;

    if (j.inRoom) this.updateJasonIn(dt); else if (!this.finale) this.updateJasonOff(dt);
    if (this.over) return;
    if (this.mg) this.updateMinigame(dt);

    // firecracker
    if (this.has('noisemaker') && Phaser.Input.Keyboard.JustDown(k.Q) && this.fireCd <= 0 && !this.hidden && !this.finale) {
      this.fireCd = 30;
      const fx = clamp(p.x + this.facing.x * 180, 40, W - 40), fy = clamp(p.y + this.facing.y * 180, 40, H - 40);
      const fc = this.track(this.add.image(p.x, p.y, 'firecracker').setDepth(9));
      this.tweens.add({ targets: fc, x: fx, y: fy, angle: 720, duration: 500, onComplete: () => {
        SFX.boom((fx - W / 2) / W * 2); fc.setVisible(false);
        r.awareness = Math.max(0, r.awareness - 35);
        if (j.inRoom && ['chase', 'search', 'wander'].includes(j.state)) { j.state = 'search'; j.searchT = 6; j.sawHide = false; j.searchTarget = { x: fx, y: fy }; }
        else if (!j.inRoom && j.state !== 'away') { const { dir } = this.ringDist(j.room, this.cur); j.room = (j.room - dir + N) % N; }
        this.toast('BANG! That should distract him.');
      } });
    }

    this.updateAudio(dt);
    this.drawFx(time);
    this.updateHud();

    this.periodicT -= dt;
    if (this.periodicT <= 0) { this.periodicT = 28; this.askBrain('periodic'); }
  }

  updateInteractions() {
    const p = this.player, k = this.keys, room = this.room;
    const E = Phaser.Input.Keyboard.JustDown(k.E);
    this.promptT.setText('');
    if (this.hidden) {
      this.promptT.setText(this.mg ? '' : 'E: step out').setPosition(this.hidden.x, this.hidden.y - 26);
      if (E && !this.mg) this.unhide();
      return;
    }
    if (this.knockT > 0) return;
    const near = (o, r = 38) => Math.hypot(o.x - p.x, o.y - p.y) < r;
    let action = null, label = '', at = null;
    for (const h of this.hides) if (near(h, 40)) { action = () => this.hide(h); label = `E: hide in ${h.kind}`; at = h; }
    for (const ped of this.pedestals) if (near(ped, 40) && !ped.st.sold) {
      const it = ITEMS[ped.st.key];
      action = () => this.buy(ped); label = `E: buy ${it.name} (${it.price}c)\n${it.desc}`; at = ped;
    }
    for (const so of this.searchObjs) if (near(so) && !so.o.searched && !room.cleared) {
      action = () => this.searchStump(so); label = 'E: search'; at = so;
    }
    if (this.trapPed && near(this.trapPed, 48)) { action = () => this.takeCursed(); label = 'E: take the cursed item'; at = this.trapPed; }
    if (at) this.promptT.setText(label).setPosition(at.x, at.y - 30);
    if (E && action) action();
    if (room.type === 'plates' && !room.cleared && Phaser.Input.Keyboard.JustDown(k.R)) {
      this.blocks.clear(true, true); this.spawnCrates(false);
      this.puzzleFail('You kicked the crates back into place.');
    }
  }

  buy(ped) {
    const r = this.run, it = ITEMS[ped.st.key];
    if (r.coins < it.price) return this.toast(`Need ${it.price - r.coins} more coins.`);
    if (!it.noSlot && this.slotsUsed() >= r.slots) return this.toast('Inventory full! (Backpack adds a slot)');
    r.coins -= it.price; r.items.push(ped.st.key); ped.st.sold = true;
    if (ped.st.key === 'heart') { r.maxHearts++; r.hearts = r.maxHearts; }
    if (ped.st.key === 'backpack') r.slots++;
    ped.icon.setAlpha(0.2); ped.label.setText(`${it.name}\nSOLD`);
    SFX.coin(); this.toast(`Bought ${it.name}!`);
  }
  searchStump(so) {
    so.o.searched = true; so.spr.setTint(0x555555);
    if (so.isKey) { this.toast('You found the key!'); this.clearCurrent(); }
    else {
      this.puzzleFail('Nothing but ash and bugs.');
      if (Math.random() < 0.4) this.spawnEnemy('bat');
    }
  }
  takeCursed() {
    const room = this.room, k = room.cursedKey;
    room.taken = true; this.run.items.push(k);
    this.trapPed.icon.destroy(); this.trapPed = null;
    this.addNoise(35); SFX.sting(); this.cameras.main.shake(300, 0.01);
    this.banner('IT WAS A TRAP', `${CURSED[k].name}: ${CURSED[k].desc}`);
    this.trapAmbush();
  }

  updateRoomLogic(dt) {
    const room = this.room, p = this.player;
    if (this.fight && this.fight.active && this.enemies.countActive(true) === 0) { this.fight = null; this.clearCurrent(); }
    if (room.type === 'plates' && !room.cleared && this.plates.length) {
      let all = true;
      const crates = this.blocks.getChildren();
      this.plates.forEach(pl => {
        const on = crates.some(b => Math.hypot(b.x - pl.x, b.y - pl.y) < 18);
        pl.spr.setTexture(on ? 'plateOn' : 'plate'); if (!on) all = false;
      });
      if (all) { crates.forEach(b => { b.setVelocity(0); b.setImmovable(true); b.body.moves = false; }); this.clearCurrent(); }
    }
    if (this.simon && !this.simon.playing && !room.cleared) {
      const s = this.simon;
      let on = -1;
      this.pumpkins.forEach((pk, i) => { if (Math.hypot(pk.x - p.x, pk.y - p.y) < 28) on = i; });
      if (on !== -1 && on !== s.on) {
        this.flashPumpkin(on);
        if (on === room.seq[s.i]) {
          s.i++;
          if (s.i >= room.seq.length) { this.simon = null; this.pumpkins.forEach(pk => pk.spr.setTexture('pumpkinLit')); this.clearCurrent(); return; }
        } else {
          this.puzzleFail('Wrong pumpkin!');
          s.playing = true; s.i = 0;
          this.time.delayedCall(900, () => { if (this.simon === s) this.playSimon(); });
        }
      }
      s.on = on;
    }
    if (this.lantern && Math.hypot(this.lantern.x - p.x, this.lantern.y - p.y) < 30 && !this.hidden) {
      this.lantern.spr.setTexture('lanternLit'); this.lantern = null; this.clearCurrent();
    }
  }

  updateAudio(dt) {
    const j = this.jason, r = this.run;
    SFX.mood(r.awareness, j.inRoom && j.state === 'chase', dt);
    this.stepT -= dt;
    if (this.stepT > 0) return;
    if (j.inRoom && j.sprite.body.speed > 5) {
      this.stepT = j.state === 'chase' ? 0.3 : 0.55;
      SFX.footstep(0.55, (j.sprite.x - W / 2) / (W / 2));
    } else if (!j.inRoom && !this.finale && j.state !== 'away') {
      const { dist, dir } = j.follow ? { dist: 1, dir: j.follow.side === 'left' ? 1 : -1 } : this.ringDist(j.room, this.cur);
      // dir>0 means he is to the LEFT of you (moving right toward you)
      if (dist === 1) { this.stepT = j.state === 'stalk' || j.follow ? 0.5 : 0.9; SFX.footstep(r.awareness >= 25 ? 0.45 : 0.2, dir > 0 ? -0.85 : 0.85); }
      else if (dist === 2 && r.awareness >= 25) { this.stepT = 1.0; SFX.footstep(0.12, dir > 0 ? -0.9 : 0.9); }
      else this.stepT = 0.5;
    } else this.stepT = 0.3;
  }

  drawFx(time) {
    const g = this.fxG, j = this.jason, r = this.run, p = this.player;
    g.clear();
    // warnings
    const stage = r.awareness >= 75 ? 3 : r.awareness >= 50 ? 2 : r.awareness >= 25 ? 1 : 0;
    if (!this.finale && stage > this.lastStage && !j.inRoom) {
      this.toast(['', 'You hear distant footsteps...', 'The music shifts. Something is hunting you.', 'A shadow moves under the door...'][stage]);
    }
    this.lastStage = stage;
    if (!this.finale && !j.inRoom && j.state !== 'away') {
      const { dist, dir } = j.follow ? { dist: 1, dir: j.follow.side === 'left' ? 1 : -1 } : this.ringDist(j.room, this.cur);
      if (dist === 1 && (stage >= 3 || j.follow)) {
        const x = dir > 0 ? 18 : W - 18;
        g.fillStyle(0x000000, 0.55 + Math.sin(time / 90) * 0.25); g.fillEllipse(x, 320, 34, 70);
        g.fillStyle(0xff3300, 0.5 + Math.random() * 0.4); g.fillRect(x - 5, 306, 3, 2); g.fillRect(x + 2, 306, 3, 2);
      }
    }
    // stealth vision cone
    if (j.inRoom && j.state === 'patrol') {
      const s = j.sprite;
      g.fillStyle(j.spot > 0 ? 0xff5040 : 0xffdd88, 0.12 + j.spot * 0.25);
      g.slice(s.x, s.y, 230, j.facing - 0.6, j.facing + 0.6, false); g.fillPath();
    }
    // trail map hints
    if (this.has('trailmap')) {
      if (this.simon && !this.simon.playing) { const pk = this.pumpkins[this.room.seq[this.simon.i]]; g.lineStyle(2, 0xffff80, 0.4 + Math.sin(time / 150) * 0.3).strokeCircle(pk.x, pk.y, 30); }
      if (this.room.type === 'plates' && !this.room.cleared) { g.lineStyle(2, 0x80ff90, 0.5); this.plates.forEach(pl => g.strokeRect(pl.x - 18, pl.y - 18, 36, 36)); }
    }
    if (this.gateZone) { g.fillStyle(0x80ff90, 0.25 + Math.sin(time / 200) * 0.15); g.fillRect(14 * T, 0, 2 * T, T); }
    // speech bubble follows him
    if (j.inRoom) this.bubble.setPosition(j.sprite.x, j.sprite.y - 24); else this.bubble.setPosition(W / 2, 140);
  }

  updateHud() {
    const r = this.run, j = this.jason;
    const hearts = '♥'.repeat(Math.max(0, r.hearts)) + '♡'.repeat(Math.max(0, r.maxHearts - r.hearts));
    this.hud.setText(`${hearts}   Coins ${r.coins}   ${this.room.area}: ${TYPE_LABEL[this.room.type]}   Gate ${r.cleared}/${CHALLENGES}`);
    const items = r.items.map(k => (ITEMS[k] || CURSED[k]).name).join(', ') || 'none';
    const fc = this.has('noisemaker') ? `   Q: ${this.fireCd > 0 ? Math.ceil(this.fireCd) + 's' : 'ready'}` : '';
    this.hudItems.setText(`Items [${this.slotsUsed()}/${r.slots}]: ${items}${fc}${this.sneaking ? '   (sneaking)' : ''}`);
    if (!this.showBrain) { this.dbg.setVisible(false); return; }
    const bars = Math.round(r.awareness / 10);
    let where;
    if (j.inRoom) where = 'IN THIS ROOM';
    else if (j.state === 'away') where = `away (${Math.ceil(j.awayT)}s)`;
    else if (j.follow) where = 'right behind the door';
    else { const { dist, dir } = this.ringDist(j.room, this.cur); where = `${AREAS[j.room]} (${dist} ${dir > 0 ? 'to your left' : 'to your right'})`; }
    const src = this.brainSource === 'gemini' ? 'GEMINI' : Brain.isOnline() === false ? 'offline fallback' : 'waiting...';
    this.dbg.setVisible(true).setText(
      `BAKED MAN BRAIN [${src}]  (B to hide)\n` +
      `Awareness ${'#'.repeat(bars)}${'.'.repeat(10 - bars)} ${Math.round(r.awareness)}\n` +
      `State: ${j.follow ? 'following' : j.state}   Where: ${where}\n` +
      `Aggression ${r.aggression.toFixed(2)}   Strategy: ${r.strategy}\n` +
      `Thinking: "${r.thought}"`);
  }
}

window.game = new Phaser.Game({
  type: Phaser.AUTO, width: W, height: H, parent: 'game', pixelArt: true, backgroundColor: '#000000',
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [IntroScene, GameScene],
});
