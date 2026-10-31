// Baked Man on the Nature Trail: main game.
const txt = (s, x, y, str, size = 14, color = '#f5e6c8', extra = {}) =>
  s.add.text(x, y, str, { fontFamily: FONT, fontSize: size + 'px', color, stroke: '#000', strokeThickness: 3, ...extra });

class IntroScene extends Phaser.Scene {
  constructor() { super('intro'); }
  create() {
    makeTextures(this);
    this.add.rectangle(GW / 2, H / 2, GW, H, 0x0a0605);
    txt(this, GW / 2, 46, 'BAKED MAN ON THE NATURE TRAIL', 36, '#ff6a1a').setOrigin(0.5);
    txt(this, GW / 2, 88, 'Something burned is walking the trail tonight. Get out.', 17, '#d9c7a8').setOrigin(0.5);
    this.add.image(330, 190, 'player').setScale(3.5);
    this.add.image(GW - 330, 186, 'jason').setScale(3.5);
    const lines = [
      'GOAL  Clear all 6 areas of the looping trail, then return to the Trailhead.',
      '      Its north gate opens and the final chase begins. Survive it to escape.',
      '',
      'MOVE  W A S D            SNEAK  hold SHIFT (slow but silent)',
      'SHOOT Arrow keys         Taser bolts hurt enemies and SLOW the Baked Man',
      'USE   E  (hide, search, buy, take)',
      'ITEMS Q firecracker  /  F energy drink  (if you bought them)',
      '',
      'HE IS LISTENING. Running, shooting, slamming doors and failed puzzles make noise.',
      'Watch the AWARENESS bar on the right. You HEAR him before you SEE him.',
      'If he finds you: run to another area, or hide and hold your breath (SPACE).',
      'You only lose a heart (of 3) if he actually catches you. Enemies steal coins.',
      'Each area\'s objective is always shown on the right and at the top of the room.',
    ];
    txt(this, 120, 270, lines.join('\n'), 16, '#f5e6c8', { lineSpacing: 6 });
    const start = txt(this, GW / 2, 630, 'PRESS SPACE OR CLICK TO START', 22, '#ffcc66').setOrigin(0.5);
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
    this.energyT = 0; this.energyCd = 0; this.noiseFlash = 0; this.sneakHintT = 0;
    this.stepT = 0; this.lastStage = 0; this.periodicT = 20; this.pushT = 0; this.roomTime = 0; this.roomToken = 0;
    this.chatLines = []; this.roomObjs = [];
    this.facing = { x: 1, y: 0 };
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,E,Q,F,R,SPACE');

    this.floorG = this.add.graphics().setDepth(0);
    this.fxG = this.add.graphics().setDepth(6);
    this.auraG = this.add.graphics().setDepth(9);
    this.walls = this.physics.add.staticGroup();
    this.obst = this.physics.add.staticGroup();
    this.blocks = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.bolts = this.physics.add.group();
    this.eshots = this.physics.add.group();

    this.player = this.physics.add.sprite(W / 2, H - 3 * T, 'player').setDepth(10).setScale(S);
    this.player.body.setSize(14, 12).setOffset(3, 14);
    const js = this.physics.add.sprite(-200, -200, 'jason').setDepth(11).setVisible(false).setScale(S);
    js.body.setSize(22, 36).setOffset(3, 1); // whole body, so taser bolts can hit him (catching uses distance, not this)
    this.jason = { sprite: js, room: 4, state: 'wander', inRoom: false, moveT: 12, follow: null, pathT: 0, next: null, facing: 0, spot: 0, lastChaseAt: -99999, slowT: 0, stunT: 0, zap: 0 };

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
    P.add.overlap(this.bolts, js, (a, b) => this.boltHitsJason(a.texture.key === 'bolt' ? a : b));
    P.add.overlap(this.eshots, this.walls, s => s.destroy());
    P.add.overlap(this.player, this.enemies, () => this.playerHit());
    P.add.overlap(this.player, this.eshots, (p, s) => { s.destroy(); this.playerHit(); });

    // In-room overlays
    this.headerT = txt(this, W / 2, T / 2, '', 16, '#ffe9a0').setOrigin(0.5).setDepth(100);
    this.bannerT = txt(this, W / 2, H / 2 - 70, '', 36, '#ff6a1a').setOrigin(0.5).setDepth(120).setAlpha(0);
    this.bannerS = txt(this, W / 2, H / 2 - 28, '', 17, '#f5e6c8').setOrigin(0.5).setDepth(120).setAlpha(0);
    this.toastT = txt(this, W / 2, H - T * 1.6, '', 16, '#ffffff', { align: 'center' }).setOrigin(0.5).setDepth(120).setAlpha(0);
    this.promptT = txt(this, 0, 0, '', 13, '#ffff99', { align: 'center' }).setOrigin(0.5, 1).setDepth(110);
    this.bubble = txt(this, 0, 0, '', 14, '#ff7744', { wordWrap: { width: 300 }, align: 'center' }).setOrigin(0.5, 1).setDepth(112).setAlpha(0);
    this.mgG = this.add.graphics().setDepth(150);
    this.mgText = txt(this, W / 2, H - 170, '', 17, '#ffffff').setOrigin(0.5).setDepth(151);
    this.buildPanel();

    this.chat('TRAIL', 'Clear 6 areas to open the Trailhead gate. Ranger Shop is halfway around.', '#9fd3a0');
    this.enterRoom(0, 'start');
  }

  // ---------- side panel ----------
  buildPanel() {
    const x = W + 12, wrap = { wordWrap: { width: PANEL - 22 } };
    this.add.rectangle(W + PANEL / 2, H / 2, PANEL, H, 0x0d0907).setDepth(90);
    this.add.rectangle(W + 1, H / 2, 2, H, 0x3a2418).setDepth(91);
    this.panelG = this.add.graphics().setDepth(95);
    const P = (y, s, size, color, extra = {}) => txt(this, x, y, s, size, color, { strokeThickness: 0, ...extra }).setDepth(100);
    P(10, 'BAKED MAN ON THE NATURE TRAIL', 11, '#ff6a1a');
    this.pHearts = P(28, '', 24, '#ff4050');
    this.pStatus = P(60, '', 14, '#ffe060');
    this.pArea = P(84, '', 14, '#f5e6c8', wrap);
    P(108, 'OBJECTIVE', 11, '#999080');
    this.pObj = P(122, '', 14, '#ffe9a0', wrap);
    P(206, 'HIS AWARENESS  (your noise)', 11, '#999080');
    this.pStage = P(246, '', 14, '#ffffff', wrap);
    this.pYou = P(266, '', 12, '#c8d8e8', wrap);
    this.pEffLabel = P(294, '', 11, '#999080');
    this.pEff = P(308, '', 12, '#cfe8ff', { lineSpacing: 2, ...wrap });
    this.pBrainLabel = P(452, '', 11, '#999080');
    this.pBrain = P(466, '', 12, '#ffd0a0', wrap);
    this.pChat = P(H - 8, '', 12, '#ffb08a', { lineSpacing: 2, ...wrap }).setOrigin(0, 1);
  }

  updatePanel(time) {
    const r = this.run, j = this.jason, g = this.panelG;
    this.pHearts.setText('♥'.repeat(Math.max(0, r.hearts)) + '♡'.repeat(Math.max(0, r.maxHearts - r.hearts)));
    this.pStatus.setText(`Coins ${r.coins}    Gate ${r.cleared}/${CHALLENGES}`);
    this.pArea.setText(`${this.room.area}: ${TYPE_LABEL[this.room.type]}${this.room.cleared ? ' (cleared)' : ''}`);
    this.pObj.setText(this.objective());

    // awareness bar
    const aw = r.awareness, chasing = j.inRoom && j.state === 'chase';
    const bx = W + 12, by = 222, bw = PANEL - 24, bh = 18;
    const col = chasing ? (Math.floor(time / 150) % 2 ? 0xff2020 : 0x801010) : aw >= 75 ? 0xe03030 : aw >= 50 ? 0xe08030 : aw >= 25 ? 0xe0c040 : 0x50c060;
    g.clear();
    g.fillStyle(0x2a2020); g.fillRect(bx, by, bw, bh);
    g.fillStyle(col); g.fillRect(bx, by, bw * aw / 100, bh);
    g.lineStyle(this.noiseFlash > 0 ? 2 : 1, this.noiseFlash > 0 ? 0xffffff : 0x605048); g.strokeRect(bx, by, bw, bh);
    [25, 50, 75].forEach(m => { g.fillStyle(0x000000, 0.6); g.fillRect(bx + bw * m / 100, by, 1, bh); });
    const stage = chasing ? 'CHASE! Run or hide (E)' : j.inRoom && j.state === 'patrol' ? 'PATROLLING: avoid his light!'
      : j.inRoom ? 'HE IS IN THIS ROOM' : aw >= 75 ? 'At the door... (shadow)' : aw >= 50 ? 'He is hunting you' : aw >= 25 ? 'Distant footsteps' : 'Quiet';
    this.pStage.setText(stage).setColor(chasing || j.inRoom ? '#ff5050' : aw >= 50 ? '#ffb070' : '#ffffff');
    const you = this.hidden ? 'You: HIDDEN (awareness falling)' : this.knockT > 0 ? 'You: knocked down'
      : !this.moving ? (this.sneaking ? 'You: still + sneaking (calming)' : 'You: standing still')
      : this.sneaking ? 'You: sneaking (silent)' : 'You: RUNNING (loud!)';
    this.pYou.setText(you).setY(this.pStage.y + this.pStage.height + 2);
    this.pEffLabel.setY(this.pYou.y + this.pYou.height + 12);
    this.pEff.setY(this.pEffLabel.y + 14);

    // effects
    const lines = [];
    if (this.energyT > 0) lines.push(`> SPEED BURST ${this.energyT.toFixed(1)}s (louder)`);
    if (this.invulnT > 0) lines.push(`> Safe from him ${Math.ceil(this.invulnT)}s`);
    if (this.slowT > 0) lines.push('> Burned: slowed');
    if (j.stunT > 0) lines.push(`> HE IS STUNNED ${j.stunT.toFixed(1)}s`);
    else if (j.slowT > 0) lines.push('> He is slowed by your taser');
    r.items.forEach(k => {
      const it = ITEMS[k] || CURSED[k];
      let extra = '';
      if (k === 'noisemaker') extra = this.fireCd > 0 ? ` (${Math.ceil(this.fireCd)}s)` : ' READY';
      if (k === 'energy') extra = this.energyT > 0 ? ' ACTIVE' : this.energyCd > 0 ? ` (${Math.ceil(this.energyCd)}s)` : ' READY';
      lines.push(`${it.name}: ${it.short}${extra}`);
    });
    this.pEffLabel.setText(`EFFECTS & ITEMS  [slots ${this.slotsUsed()}/${r.slots}]`);
    this.pEff.setText(lines.join('\n') || 'none yet. Buy items at the Ranger Shop.');
    this.pBrainLabel.setY(this.pEff.y + this.pEff.height + 12);
    this.pBrain.setY(this.pBrainLabel.y + 14);

    // Baked Man brain
    let where;
    if (j.inRoom) where = 'IN THIS ROOM';
    else if (this.finale) where = 'behind you';
    else if (j.state === 'away') where = `gone (${Math.ceil(j.awayT)}s)`;
    else if (j.follow) where = `right behind the ${j.follow.side} door`;
    else { const { dist } = this.ringDist(j.room, this.cur); where = dist === 1 ? `next door (${this.jasonSide()} door)` : `${dist} areas away`; }
    const src = this.brainSource === 'gemini' ? 'GEMINI' : Brain.isOnline() === false ? 'offline' : '...';
    this.pBrainLabel.setText(`BAKED MAN BRAIN  [${src}]`);
    this.pBrain.setText(`Where: ${where}\nMood: ${r.strategy}, aggression ${r.aggression.toFixed(2)}\n"${r.thought}"`);
  }

  objective() {
    const room = this.room, n = this.enemies.countActive(true);
    switch (room.type) {
      case 'exit': return this.run.cleared >= CHALLENGES ? 'The gate is OPEN. Walk through the north gate!' : `Clear ${CHALLENGES - this.run.cleared} more area(s), then come back and go through the north gate.`;
      case 'shop': return 'Walk up to an item and press E to buy. He can still come in here.';
      case 'fight': return room.cleared ? 'Cleared. Move on.' : `KILL ALL ENEMIES (${this.fight ? n : '...'} left). Shoot with the arrow keys.`;
      case 'trap': return room.cleared ? 'Cleared. Move on.' : !room.taken ? 'Take the cursed item on the altar (E). It is a trap: then KILL THE AMBUSH.' : `KILL THE AMBUSH (${n} left).`;
      case 'plates': return room.cleared ? 'Solved. Move on.' : 'Push all 3 crates onto the grey plates. R resets them (loud).';
      case 'search': return room.cleared ? 'Key found. Move on.' : 'Search the stumps (E) to find the key. Wrong stumps make noise.';
      case 'simon': return room.cleared ? 'Solved. Move on.' : this.simon && this.simon.playing ? 'WATCH the pumpkins light up...' : `Step on the pumpkins in the order they lit up (${this.simon ? this.simon.i : 0}/${room.seq.length}).`;
      case 'stealth': return room.cleared ? 'Lantern lit. Move on.' : 'Reach the lantern without being seen. HOLD SHIFT TO SNEAK. Stay out of his light cone.';
      case 'finale': return this.finale && this.finale.open ? 'EXIT OPEN: run east (->)!' : 'Survive! Dodge falling embers. The exit opens on the east side.';
    }
    return '';
  }
  shortObjective() {
    const room = this.room, n = this.enemies.countActive(true);
    if (room.cleared && room.type !== 'exit' && room.type !== 'shop') return `${TYPE_LABEL[room.type]}: CLEARED`;
    switch (room.type) {
      case 'exit': return this.run.cleared >= CHALLENGES ? 'GATE OPEN: GO NORTH' : `TRAILHEAD: gate locked (${this.run.cleared}/${CHALLENGES})`;
      case 'shop': return 'RANGER SHOP: press E at an item to buy';
      case 'fight': return `AMBUSH: kill all enemies (${this.fight ? n : '...'} left)`;
      case 'trap': return room.taken ? `CURSED SHRINE: kill the ambush (${n} left)` : 'CURSED SHRINE: take the item (E)';
      case 'plates': return 'CRATE PUZZLE: push crates onto plates (R reset)';
      case 'search': return 'LOST KEY: search stumps with E';
      case 'simon': return 'PUMPKIN PATCH: repeat the glowing order';
      case 'stealth': return 'STEALTH: reach the lantern. HOLD SHIFT!';
      case 'finale': return this.finale && this.finale.open ? 'EXIT OPEN -> RUN!' : `THE LAST MILE: survive ${Math.ceil(Math.max(0, this.finale ? this.finale.t : 0))}s`;
    }
    return '';
  }

  // ---------- helpers ----------
  has(k) { return this.run.items.includes(k); }
  slotsUsed() { return this.run.items.filter(k => ITEMS[k] && !ITEMS[k].noSlot).length; }
  track(o) { this.roomObjs.push(o); return o; }
  boltDamage() { return (this.has('overcharge') ? 1.6 : 1) * (this.has('mask') ? 2 : 1); }
  allowed(idx) { const r = this.run.rooms[idx]; return !(PUZZLES.includes(r.type) && !r.cleared); }
  ringDist(from, to) { const d = (to - from + N) % N; return d <= N / 2 ? { dist: d, dir: 1 } : { dist: N - d, dir: -1 }; }
  // Which door of the current room he is behind (or would come through).
  jasonSide() {
    const j = this.jason;
    if (j.follow) return j.follow.side;
    return this.ringDist(j.room, this.cur).dir > 0 ? this.room.prev : this.room.next;
  }
  noiseMult() { return (this.has('mask') ? 1.5 : 1) * (0.7 + this.run.aggression * 0.6); }
  addNoise(n) {
    this.run.stats.noise += n;
    if (n >= 1) this.noiseFlash = 0.25;
    if (!this.finale) this.run.awareness = Math.min(100, this.run.awareness + n * this.noiseMult());
  }

  banner(t, s = '') {
    this.bannerT.setText(t).setAlpha(1); this.bannerS.setText(s).setAlpha(1);
    this.tweens.killTweensOf([this.bannerT, this.bannerS]);
    this.tweens.add({ targets: [this.bannerT, this.bannerS], alpha: 0, delay: 2200, duration: 700 });
  }
  toast(t) {
    this.toastT.setText(t).setAlpha(1);
    this.tweens.killTweensOf(this.toastT);
    this.tweens.add({ targets: this.toastT, alpha: 0, delay: 1800, duration: 500 });
  }
  chat(who, line) {
    this.chatLines.push(`${who}: ${line}`);
    if (this.chatLines.length > 3) this.chatLines.shift();
    this.pChat.setText(this.chatLines.join('\n'));
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
    const d = Math.hypot(x2 - x1, y2 - y1), steps = Math.ceil(d / 16);
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
      const c = randi(1, COLS - 2), r = randi(1, ROWS - 2);
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
    this.lantern = null; this.trapPed = null; this.fight = null; this.simon = null; this.gateZone = false; this.rightDoorWalls = []; this.breaking = null;
  }

  drawFloor(color, seed, doors) {
    const g = this.floorG; g.clear();
    g.fillStyle(color); g.fillRect(0, 0, W, H);
    let s = seed * 9301 + 49297;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 260; i++) {
      g.fillStyle(rnd() < 0.5 ? 0x000000 : 0xffffff, 0.06 + rnd() * 0.06);
      g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 3 + Math.floor(rnd() * 3), 3);
    }
    // dirt trail from each door to the middle
    g.fillStyle(0x000000, 0.2);
    doors.forEach(d => {
      if (d === 'left') g.fillRect(0, 6 * T, W / 2 + T, 2 * T);
      if (d === 'right') g.fillRect(W / 2 - T, 6 * T, W / 2 + T, 2 * T);
      if (d === 'top') g.fillRect(9 * T, 0, 2 * T, H / 2 + T);
      if (d === 'bottom') g.fillRect(9 * T, H / 2 - T, 2 * T, H / 2 + T);
    });
  }

  buildWalls(doors, gate, gateOpen) {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!(r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1)) continue;
      const midRow = r === 6 || r === 7, midCol = c === 9 || c === 10;
      if ((c === 0 && midRow && doors.includes('left')) || (c === COLS - 1 && midRow && doors.includes('right'))
        || (r === 0 && midCol && doors.includes('top')) || (r === ROWS - 1 && midCol && doors.includes('bottom'))) continue;
      let tex = 'wall';
      if (r === 0 && midCol && gate) { if (gateOpen) continue; tex = 'gate'; }
      const p = tileCenter(c, r);
      const w = this.walls.create(p.x, p.y, tex);
      this.grid[r][c] = 1;
      if (c === COLS - 1 && midRow) this.rightDoorWalls.push(w);
    }
  }

  addObstacle(c, r, kind) {
    const p = tileCenter(c, r);
    const o = this.obst.create(p.x, p.y, kind).setScale(S).setDepth(4);
    o.refreshBody();
    o.body.setSize(38, 38);
    this.grid[r][c] = 1;
  }

  enterRoom(idx, side) {
    const prev = this.cur;
    this.cur = idx;
    const room = this.room = this.run.rooms[idx];
    this.clearRoomObjects();
    const doors = [room.prev, room.next];
    this.drawFloor(room.floor, idx + 1, doors);
    this.buildWalls(doors, room.type === 'exit', this.run.cleared >= CHALLENGES);
    room.obstacles.forEach(o => this.addObstacle(o.c, o.r, o.kind));
    this.hides = room.hides.map(h => {
      const p = tileCenter(h.c, h.r);
      return { x: p.x, y: p.y, spr: this.track(this.add.image(p.x, p.y, h.kind).setScale(S).setDepth(7)), kind: h.kind };
    });
    // door signs
    [[room.prev, (idx - 1 + N) % N], [room.next, (idx + 1) % N]].forEach(([d, to]) => {
      const dest = this.run.rooms[to];
      const label = `${ARROW[d]} ${dest.area}${dest.cleared ? ' (done)' : dest.type === 'shop' ? ' (shop)' : ''}`;
      const pos = { left: [T * 1.1, H / 2 - T * 1.3, 0], right: [W - T * 1.1, H / 2 - T * 1.3, 1], top: [W / 2 + T * 1.3, T * 1.2, 0], bottom: [W / 2 + T * 1.3, H - T * 1.2, 0] }[d];
      this.track(txt(this, pos[0], pos[1], label, 13, dest.cleared ? '#90d090' : '#d8c8a8').setOrigin(pos[2], 0.5).setDepth(3));
    });
    this.roomTime = 0;
    const pos = side === 'start' ? { x: W / 2, y: H - 3 * T } : DOOR_IN[side];
    this.player.body.reset(pos.x, pos.y);
    this.setupType(room, side);
    this.banner(room.area, TYPE_LABEL[room.type] + (room.cleared ? '  (cleared)' : ''));
    if (room.type === 'stealth' && !room.cleared) this.toast('STEALTH ROOM: hold SHIFT to sneak!');
    if (prev !== undefined) this.jasonOnPlayerMove(prev, idx, side);
  }

  setupType(room, side) {
    const tok = this.roomToken;
    const later = (ms, fn) => this.time.delayedCall(ms, () => { if (tok === this.roomToken && !this.over) fn(); });
    switch (room.type) {
      case 'exit':
        this.gateZone = this.run.cleared >= CHALLENGES;
        break;
      case 'shop':
        room.stock.forEach((st, i) => {
          const x = W / 2 + (i - 2) * T * 3.2, y = T * 2.6, it = ITEMS[st.key];
          this.track(this.add.image(x, y + 20, 'pedestal').setScale(S).setDepth(3));
          const icon = this.track(this.add.circle(x, y - 4, 15, CAT_COLOR[it.cat]).setStrokeStyle(2, 0x000000).setDepth(4));
          const label = this.track(txt(this, x, y + 40, `${it.name}\n${st.sold ? 'SOLD' : it.price + 'c'}`, 12, '#ffffff', { align: 'center' }).setOrigin(0.5, 0).setDepth(4));
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
        this.track(this.add.image(W / 2, T * 3, 'altar').setScale(S).setDepth(3));
        if (!room.taken) {
          const it = CURSED[room.cursedKey];
          const icon = this.track(this.add.circle(W / 2, T * 3 - 30, 13, CAT_COLOR.Cursed).setStrokeStyle(2, 0xff3030).setDepth(4));
          this.tweens.add({ targets: icon, scale: 1.3, duration: 500, yoyo: true, repeat: -1 });
          this.track(txt(this, W / 2, T * 3 + 30, `${it.name} (FREE)\n${it.desc}`, 12, '#ff9090', { align: 'center' }).setOrigin(0.5, 0).setDepth(4));
          this.trapPed = { x: W / 2, y: T * 3, icon };
        } else if (!room.cleared) later(500, () => this.trapAmbush());
        break;
      }
      case 'plates':
        this.plates = this.platePositions().map(([x, y]) => ({ x, y, spr: this.track(this.add.image(x, y, 'plate').setScale(S).setDepth(2)) }));
        this.spawnCrates(room.cleared);
        break;
      case 'search':
        room.searchObjs.forEach((o, i) => {
          const p = tileCenter(o.c, o.r);
          const spr = this.track(this.add.image(p.x, p.y, 'stump').setScale(S).setDepth(3));
          if (o.searched) spr.setTint(0x555555);
          if (i === room.keyIdx && this.has('trailmap') && !room.cleared) this.tweens.add({ targets: spr, alpha: 0.5, duration: 300, yoyo: true, repeat: -1 });
          if (!o.searched && !room.cleared) {
            const q = this.track(txt(this, p.x, p.y - 30, '?', 18, '#ffe060').setOrigin(0.5).setDepth(4));
            this.tweens.add({ targets: q, y: p.y - 36, duration: 500, yoyo: true, repeat: -1 });
            o.marker = q;
          }
          this.searchObjs.push({ x: p.x, y: p.y, spr, o, isKey: i === room.keyIdx });
        });
        break;
      case 'simon': {
        const P = [[W / 2, H / 2 - T * 2.5], [W / 2 - T * 3.5, H / 2], [W / 2 + T * 3.5, H / 2], [W / 2, H / 2 + T * 2.5]];
        this.pumpkins = P.map(([x, y]) => ({ x, y, spr: this.track(this.add.image(x, y, 'pumpkin').setDepth(3).setScale(2)) }));
        if (!room.cleared) { this.simon = { i: 0, playing: true, on: -1 }; later(1200, () => this.playSimon()); }
        else this.pumpkins.forEach(p => p.spr.setTexture('pumpkinLit'));
        break;
      }
      case 'stealth': {
        // lantern goes in the corner farthest from where you came in
        const from = side === 'start' ? DOOR_IN.bottom : DOOR_IN[side];
        const corner = [[2, 2], [17, 2], [2, 11], [17, 11]].map(([c, r]) => tileCenter(c, r))
          .sort((a, b) => Math.hypot(b.x - from.x, b.y - from.y) - Math.hypot(a.x - from.x, a.y - from.y))[0];
        const l = this.track(this.add.image(corner.x, corner.y, room.cleared ? 'lanternLit' : 'lantern').setDepth(3).setScale(2));
        if (!room.cleared) {
          this.lantern = { x: corner.x, y: corner.y, spr: l };
          this.tweens.add({ targets: l, alpha: 0.5, duration: 500, yoyo: true, repeat: -1 });
        }
        break;
      }
    }
  }

  platePositions() { return [[5.5 * T, 3.5 * T], [14.5 * T, 3.5 * T], [10 * T, 11 * T]]; }
  spawnCrates(solved) {
    const P = solved ? this.platePositions() : [[5.5 * T, 6.5 * T], [14.5 * T, 6.5 * T], [10 * T, 8.5 * T]];
    P.forEach(([x, y]) => {
      const b = this.blocks.create(x, y, 'crate').setDepth(5).setScale(S);
      b.body.setSize(28, 28);
      b.setDrag(1400).setMaxVelocity(170).setCollideWorldBounds(true);
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
    if (this.run.cleared >= CHALLENGES) this.chat('TRAIL', 'The Trailhead gate creaks open... go back and escape!');
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
    const p = this.randomOpenPoint(260);
    const e = this.enemies.create(p.x, p.y, kind).setDepth(8).setScale(S);
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
      const puff = this.track(txt(this, e.x, e.y - 14, `+${coins}c`, 14, '#ffe060').setOrigin(0.5).setDepth(20));
      this.tweens.add({ targets: puff, y: e.y - 50, alpha: 0, duration: 700 });
      e.destroy();
    }
  }
  boltHitsJason(b) {
    const j = this.jason;
    if (!b || !b.active || !j.inRoom || j.stunT > 0) return;
    b.destroy();
    j.slowT = 0.9;
    j.sprite.setTintFill(0x7fdbff);
    this.time.delayedCall(80, () => j.sprite.clearTint());
    j.zap += 1; // 4 quick hits stun him; the counter drains over time in updateJasonIn
    if (j.zap >= 4) {
      j.zap = 0; j.stunT = 2.2; j.sprite.setVelocity(0);
      SFX.boom(0); this.toast('ZAP! He is STUNNED. Get away!');
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
      const zs = 70 + this.run.cleared * 7;
      if (e.kind === 'zombie') e.setVelocity(dx / d * zs, dy / d * zs);
      else if (e.kind === 'bat') e.setVelocity(dx / d * 120 + Math.sin(e.t * 5) * 100, dy / d * 120 + Math.cos(e.t * 4) * 100);
      else if (e.kind === 'crow') {
        e.setVelocity(0); e.setFlipX(dx < 0);
        e.shootT -= dt;
        if (e.shootT <= 0 && !this.hidden) {
          e.shootT = 2.2 - Math.min(0.8, this.run.cleared * 0.1);
          const s = this.eshots.create(e.x, e.y, 'eshot').setDepth(8).setScale(S);
          s.setVelocity(dx / d * 220, dy / d * 220); s.life = 3;
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
    if (j.state === 'patrol') return this.inCone();
    return Math.hypot(p.x - s.x, p.y - s.y) < 520 && this.los(s.x, s.y, p.x, p.y);
  }
  inCone() {
    const s = this.jason.sprite, p = this.player;
    const d = Math.hypot(p.x - s.x, p.y - s.y);
    const diff = Phaser.Math.Angle.Wrap(Math.atan2(p.y - s.y, p.x - s.x) - this.jason.facing);
    return d < CONE_RANGE && Math.abs(diff) < CONE_HALF_ANGLE && this.los(s.x, s.y, p.x, p.y);
  }
  hide(spot) {
    const j = this.jason;
    const saw = this.jasonSeesPlayer();
    this.hidden = spot; this.run.stats.hides++;
    this.player.setVelocity(0).setAlpha(0);
    this.player.body.enable = false;
    this.tweens.add({ targets: spot.spr, x: spot.x + 3, duration: 60, yoyo: true, repeat: 3 });
    this.toast(saw ? 'He SAW you hide...' : 'You hold still in the dark.');
    if (j.inRoom && (j.state === 'chase' || saw) && j.state !== 'mg') {
      j.state = 'search'; j.searchT = 9; j.sawHide = saw; j.searchTarget = saw ? { x: spot.x, y: spot.y, spot } : null;
    }
  }
  unhide() {
    const s = this.hidden; if (!s) return;
    this.hidden = null;
    this.player.body.enable = true;
    const dy = s.y < H / 2 ? 50 : -50;
    this.player.body.reset(s.x, s.y + dy);
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
    const x = W / 2 - 200, y = H - 150, w = 400;
    g.fillStyle(0x000000, 0.85); g.fillRect(x - 12, y - 46, w + 24, 84);
    g.fillStyle(0x552222); g.fillRect(x, y, w, 24);
    g.fillStyle(0x40d070); g.fillRect(x + m.a * w, y, m.w * w, 24);
    g.fillStyle(0xffffff); g.fillRect(x + m.pos * w - 2, y - 5, 5, 34);
    this.mgText.setText(`HOLD YOUR BREATH! SPACE in the green  (${m.done}/${m.need})`).setY(y - 24);
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
    let sp;
    if (this.finale) sp = 172 * (this.has('bloodcoin') ? 1.06 : 1);
    else {
      sp = 150 + 7 * this.run.cleared + 28 * this.run.aggression;
      if (this.has('bloodcoin')) sp *= 1.12;
      sp = Math.min(sp, 192);
    }
    if (j.slowT > 0) sp *= 0.4;
    if (this.room.type === 'stealth') sp *= STEALTH_JASON_SPEED;
    return sp * ({ chase: 1, distracted: 1, search: 0.7, wander: 0.45, patrol: 0.42, leave: 0.8 }[j.state] || 0);
  }
  spawnJason(side, state) {
    const j = this.jason, s = j.sprite;
    j.room = this.cur; j.inRoom = true; j.follow = null;
    const pos = typeof side === 'string' ? DOOR_POS[side] : side;
    s.setPosition(pos.x, pos.y).setVelocity(0).setVisible(true).setAlpha(1);
    j.state = 'wander'; j.lostT = 0; j.wanderT = 12; j.searchTarget = null; j.next = null; j.pathT = 0; j.spot = 0; j.investigate = null; j.stunT = 0; j.slowT = 0;
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
      this.banner('HE FOUND YOU', this.finale ? 'RUN!' : 'Run to another area, hide (E), or zap him (arrows)');
      this.askBrain('chase_start');
    }
    j.lastChaseAt = this.time.now;
  }
  jasonLeave(reason) {
    const j = this.jason, s = j.sprite;
    j.state = 'leave'; j.leaveReason = reason; j.next = null;
    const dist = d => Math.hypot(DOOR_POS[d].x - s.x, DOOR_POS[d].y - s.y);
    j.leaveSide = dist(this.room.prev) < dist(this.room.next) ? this.room.prev : this.room.next;
  }
  goOffscreen(side) {
    const j = this.jason;
    j.inRoom = false; j.sprite.setVisible(false).setVelocity(0).setPosition(-200, -200);
    j.room = (this.cur + (side === this.room.next ? 1 : -1) + N) % N;
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
      j.stunT = 2.5; j.sprite.setPosition(40, randi(2, ROWS - 3) * T);
      return;
    }
    this.banner('YOU WENT LIMP...', `${r.hearts} heart(s) left. He thinks you're dead.`);
    this.jasonLeave('dead');
    j.catchRoom = this.cur; j.awayT = Math.max(10, 18 - r.cleared);
    r.awareness = 10;
  }

  jasonOnPlayerMove(prev, idx, side) {
    const j = this.jason, room = this.room;
    if (j.inRoom) {
      j.inRoom = false; j.sprite.setVisible(false).setVelocity(0).setPosition(-200, -200); j.room = prev;
      if (j.state === 'chase') j.follow = { t: Math.max(1.4, 2.4 - 0.12 * this.run.cleared), room: idx, side };
      else if (j.state === 'leave' && j.leaveReason === 'dead') { j.state = 'away'; j.leaveReason = null; }
      else { j.state = 'wander'; j.moveT = 6; }
    } else if (j.follow) {
      j.room = prev; j.follow = { t: 2.2, room: idx, side };
    }
    const otherDoor = side === room.prev ? room.next : room.prev;
    if (room.type === 'stealth' && !room.cleared && !j.follow) {
      const from = side === 'start' ? DOOR_IN.bottom : DOOR_IN[side];
      this.spawnJason({ x: W - from.x, y: H - from.y }, 'patrol');
    } else if (!j.follow && j.state !== 'away' && j.room === idx) {
      if (this.allowed(idx)) this.spawnJason(otherDoor, this.run.awareness >= 100 ? 'chase' : 'wander');
      else j.room = (idx + (side === room.prev ? 1 : -1) + N) % N;
    }
  }

  moveJasonTo(tx, ty, speed, dt) {
    const j = this.jason, s = j.sprite;
    let gx = tx, gy = ty;
    if (!this.los(s.x, s.y, tx, ty)) {
      j.pathT -= dt;
      if (j.pathT <= 0 || !j.next) { j.pathT = 0.25; j.next = this.bfsNext(s.x, s.y, tx, ty); }
      if (j.next) { gx = j.next.x; gy = j.next.y; if (Math.hypot(gx - s.x, gy - s.y) < 6) j.pathT = 0; }
    } else j.next = null;
    const dx = gx - s.x, dy = gy - s.y, d = Math.hypot(dx, dy);
    if (d < 2) { s.setVelocity(0); return Math.hypot(tx - s.x, ty - s.y); }
    s.setVelocity(dx / d * speed, dy / d * speed);
    if (Math.abs(dx) > 1) s.setFlipX(dx < 0);
    j.facing = Math.atan2(dy, dx);
    return Math.hypot(tx - s.x, ty - s.y);
  }

  updateJasonIn(dt) {
    const j = this.jason, s = j.sprite, p = this.player;
    j.slowT = Math.max(0, j.slowT - dt);
    j.zap = Math.max(0, j.zap - dt * 1.2);
    if (j.stunT > 0) { j.stunT -= dt; s.setVelocity(0); s.setAlpha(0.5 + Math.sin(this.time.now / 50) * 0.2); return; }
    s.setAlpha(1);
    const speed = this.jasonSpeed();
    const dist = Math.hypot(p.x - s.x, p.y - s.y);
    switch (j.state) {
      case 'chase':
        this.run.awareness = 100;
        if (this.jasonSeesPlayer()) j.lostT = 0; else j.lostT += dt;
        this.moveJasonTo(p.x, p.y, speed, dt);
        if (!this.finale && j.lostT > 6) { j.state = 'search'; j.searchT = 8; j.searchTarget = null; j.sawHide = false; }
        break;
      case 'distracted': {
        // he runs to the firecracker and pokes around, ignoring you
        if (this.moveJasonTo(j.distract.x, j.distract.y, speed, dt) < 50) { s.setVelocity(0); j.distract.t -= dt; }
        if (j.distract.t <= 0) { j.state = 'search'; j.searchT = 6; j.searchTarget = null; j.sawHide = false; }
        break;
      }
      case 'search': {
        j.searchT -= dt;
        if (!this.hidden && this.jasonSeesPlayer() && dist < 360) { this.startChase(); break; }
        if (!j.searchTarget) {
          const check = this.run.strategy === 'check_hiding_spots' ? 0.6 : 0.3;
          if (this.hidden && (j.sawHide || Math.random() < check)) j.searchTarget = { x: this.hidden.x, y: this.hidden.y, spot: this.hidden };
          else j.searchTarget = this.randomOpenPoint(0);
        }
        const left = this.moveJasonTo(j.searchTarget.x, j.searchTarget.y, speed, dt);
        if (left < 50) {
          if (j.searchTarget.spot && this.hidden === j.searchTarget.spot) { this.startMinigame(j.sawHide); break; }
          j.searchTarget = null;
        }
        if (j.searchT <= 0) { this.run.awareness = 30; this.jasonLeave('lost'); }
        break;
      }
      case 'wander':
        j.wanderT -= dt;
        if (this.jasonSeesPlayer() && (dist < 340 || (!this.sneaking && this.moving && dist < 460))) { this.startChase(); break; }
        if (!j.searchTarget) j.searchTarget = this.randomOpenPoint(0);
        if (this.moveJasonTo(j.searchTarget.x, j.searchTarget.y, speed, dt) < 40) j.searchTarget = null;
        if (j.wanderT <= 0) this.jasonLeave('bored');
        break;
      case 'patrol': {
        if (this.inCone() && !this.hidden) j.spot += dt * (this.sneaking ? 1.1 : 3);
        else j.spot = Math.max(0, j.spot - dt * 0.5);
        if (j.spot >= 1) { this.startChase(); break; }
        if (this.moving && !this.sneaking && dist < 220 && !this.hidden) j.investigate = { x: p.x, y: p.y, t: 3 };
        if (j.investigate) {
          j.investigate.t -= dt;
          if (this.moveJasonTo(j.investigate.x, j.investigate.y, speed * 1.2, dt) < 40 || j.investigate.t <= 0) j.investigate = null;
        } else {
          const wp = j.wps[j.wpI];
          if (this.moveJasonTo(wp.x, wp.y, speed, dt) < 26) j.wpI = (j.wpI + 1) % j.wps.length;
        }
        break;
      }
      case 'leave': {
        const out = DOOR_OUT[j.leaveSide];
        this.moveJasonTo(out.x, out.y, speed, dt);
        if (s.x < 4 || s.x > W - 4 || s.y < 4 || s.y > H - 4) this.goOffscreen(j.leaveSide);
        break;
      }
      case 'mg':
        s.setVelocity(0);
        break;
    }
    if (j.inRoom && ['chase', 'search', 'wander', 'patrol'].includes(j.state) && !this.hidden && this.invulnT <= 0 && this.knockT <= 0
      && Math.hypot(p.x - s.x, p.y - s.y) < 36) this.caught();
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
        if (this.cur === j.room && this.allowed(this.cur)) this.spawnJason(pick([this.room.prev, this.room.next]), 'chase');
        else { j.state = 'wander'; j.moveT = 6; }
      }
      return;
    }
    const { dist, dir } = this.ringDist(j.room, this.cur);
    if (r.awareness >= 75) j.state = 'stalk'; else if (j.state === 'stalk' && r.awareness < 55) j.state = 'wander';
    if (dist === 0) {
      if (this.allowed(this.cur)) this.spawnJason(pick([this.room.prev, this.room.next]), r.awareness >= 100 ? 'chase' : 'wander');
      else j.room = (j.room + pick([-1, 1]) + N) % N;
      return;
    }
    if (dist === 1 && r.awareness >= 100 && this.allowed(this.cur)) { this.spawnJason(this.jasonSide(), 'chase'); return; }
    j.moveT -= dt;
    if (j.moveT > 0) return;
    if (j.state === 'stalk') {
      j.moveT = r.awareness >= 100 ? 1.6 : 3.5;
      if (dist > 1) j.room = (j.room + dir + N) % N;
    } else {
      j.moveT = Math.max(4, 10 - 0.7 * r.cleared);
      const track = 0.5 + 0.06 * r.cleared + (r.strategy === 'stalk' ? 0.15 : 0);
      const d = Math.random() < track ? dir : pick([-1, 1]);
      let next = (j.room + d + N) % N;
      if (next === this.cur) {
        if (r.awareness >= 50 && this.allowed(this.cur)) { this.spawnJason(d > 0 ? this.room.prev : this.room.next, 'wander'); return; }
        next = (j.room - d + N) % N;
      }
      j.room = next;
    }
  }

  throwFirecracker() {
    const p = this.player, j = this.jason, r = this.run;
    this.fireCd = 25;
    // if he's here, throw it off to the side so he runs away from your path; otherwise where you're facing
    let dx = this.facing.x, dy = this.facing.y;
    if (j.inRoom) {
      const a = Math.atan2(p.y - j.sprite.y, p.x - j.sprite.x) + pick([-1, 1]) * Math.PI / 2 + rand(-0.3, 0.3);
      dx = Math.cos(a); dy = Math.sin(a);
    }
    const fx = clamp(p.x + dx * 260, T * 1.5, W - T * 1.5), fy = clamp(p.y + dy * 260, T * 1.5, H - T * 1.5);
    const fc = this.track(this.add.image(p.x, p.y, 'firecracker').setDepth(9).setScale(2));
    this.tweens.add({ targets: fc, x: fx, y: fy, angle: 720, duration: 450, onComplete: () => {
      if (!fc.active) return;
      SFX.boom((fx - W / 2) / W * 2); fc.setVisible(false);
      const flash = this.track(this.add.circle(fx, fy, 30, 0xffcc33, 0.8).setDepth(9));
      this.tweens.add({ targets: flash, scale: 3, alpha: 0, duration: 400 });
      r.awareness = Math.max(0, r.awareness - 35);
      if (j.inRoom && ['chase', 'search', 'wander', 'patrol'].includes(j.state)) {
        j.state = 'distracted'; j.distract = { x: fx, y: fy, t: 3.5 }; j.next = null; j.investigate = null; j.spot = 0;
        this.toast('BANG! He runs to the noise. GO!');
      } else {
        if (!j.inRoom && j.state !== 'away') {
          if (j.follow) { j.follow = null; j.state = 'wander'; j.moveT = 6; }
          const { dir } = this.ringDist(j.room, this.cur); j.room = (j.room - dir + N) % N;
        }
        this.toast('BANG! That should pull him away.');
      }
    } });
  }

  // ---------- finale ----------
  startFinale() {
    this.finale = { t: 25, open: false, emberT: 2 };
    this.cur = -1;
    this.room = { type: 'finale', area: 'The Last Mile', floor: 0x2a1410, cleared: false, prev: 'left', next: 'right' };
    this.clearRoomObjects();
    this.drawFloor(0x2a1410, 99, ['left', 'right']);
    this.buildWalls([], false, false);
    for (let n = 0, tries = 0; n < 14 && tries < 400; tries++) {
      const c = randi(3, COLS - 4), r = randi(2, ROWS - 3);
      if (this.grid[r][c] || this.grid[r - 1][c] || this.grid[r + 1][c] || this.grid[r][c - 1] || this.grid[r][c + 1]) continue;
      this.addObstacle(c, r, pick(['deadtree', 'tree', 'rock'])); n++;
    }
    this.hides = [];
    this.player.body.reset(T * 1.6, H / 2);
    this.banner('THE LAST MILE', 'Dodge the falling embers. Survive 25s until the exit opens ->');
    const j = this.jason; j.follow = null; j.inRoom = false; j.sprite.setVisible(false);
    const tok = this.roomToken;
    this.time.delayedCall(1500, () => { if (tok === this.roomToken && !this.over) this.spawnJason({ x: 20, y: H / 2 }, 'chase'); });
  }
  updateFinale(dt) {
    const f = this.finale, p = this.player;
    if (!f.open) {
      f.t -= dt;
      if (f.t <= 0) {
        f.open = true;
        this.rightDoorWalls.forEach(w => w.destroy());
        this.grid[6][COLS - 1] = 0; this.grid[7][COLS - 1] = 0;
        SFX.good(); this.toast('THE EXIT IS OPEN! RUN ->');
      }
    }
    f.emberT -= dt;
    if (f.emberT <= 0) {
      f.emberT = 0.75;
      const tx = clamp(p.x + p.body.velocity.x * 0.6 + rand(-70, 70), 60, W - 60), ty = clamp(p.y + p.body.velocity.y * 0.6 + rand(-70, 70), 60, H - 60);
      const warn = this.track(this.add.circle(tx, ty, 40, 0xff6600, 0.18).setStrokeStyle(2, 0xff9900).setDepth(3));
      const tok = this.roomToken;
      this.time.delayedCall(850, () => {
        if (tok !== this.roomToken || this.over) return;
        warn.setFillStyle(0xffcc33, 0.8);
        this.tweens.add({ targets: warn, alpha: 0, scale: 1.4, duration: 300 });
        SFX.boom((tx - W / 2) / W * 2);
        if (Math.hypot(this.player.x - tx, this.player.y - ty) < 42 && this.invulnT <= 0) {
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
    this.add.rectangle(GW / 2, H / 2, GW, H, 0x000000, 0.88).setDepth(300);
    txt(this, GW / 2, 130, title, 36, color).setOrigin(0.5).setDepth(301);
    const s = this.run.stats;
    txt(this, GW / 2, 200, `Areas cleared ${this.run.cleared}/${CHALLENGES}   Hearts ${this.run.hearts}   Caught ${s.catches}   Hid ${s.hides}   Kills ${s.kills}   Failed puzzles ${s.failedPuzzles}`, 15).setOrigin(0.5).setDepth(301);
    const epi = txt(this, GW / 2, 320, 'The Baked Man is thinking...', 17, '#ffb08a', { wordWrap: { width: 780 }, align: 'center' }).setOrigin(0.5).setDepth(301);
    txt(this, GW / 2, 580, 'Press R to start a new run', 20, '#ffcc66').setOrigin(0.5).setDepth(301);
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
    this.roomTime += dt;
    ['knockT', 'invulnT', 'hitCd', 'shootCd', 'auraT', 'fireCd', 'slowT', 'pushT', 'energyT', 'energyCd', 'noiseFlash', 'sneakHintT'].forEach(n => { this[n] = Math.max(0, this[n] - dt); });
    if (this.knockT <= 0 && !this.hidden) p.setAlpha(this.invulnT > 0 ? 0.6 + Math.sin(time / 60) * 0.3 : 1);

    // movement
    this.sneaking = k.SHIFT.isDown;
    this.moving = false;
    if (!this.hidden && this.knockT <= 0) {
      const vx = (k.D.isDown ? 1 : 0) - (k.A.isDown ? 1 : 0), vy = (k.S.isDown ? 1 : 0) - (k.W.isDown ? 1 : 0);
      let sp = this.sneaking ? 95 : 200;
      if (this.room.type === 'stealth') sp *= STEALTH_PLAYER_SPEED;
      if (this.energyT > 0) sp *= 1.35;
      if (this.slowT > 0) sp *= 0.45;
      if (vx || vy) {
        const l = Math.hypot(vx, vy);
        p.setVelocity(vx / l * sp, vy / l * sp);
        this.facing = { x: vx / l, y: vy / l };
        if (vx) p.setFlipX(vx < 0);
        this.moving = true;
      } else p.setVelocity(0);
      if (this.moving && !this.sneaking) this.addNoise(2.2 * dt * (this.has('sneakers') ? 0.5 : 1) * (this.energyT > 0 ? 1.5 : 1));
      if (this.pushT > 0) this.addNoise(1.2 * dt);
      if (this.moving && !this.sneaking && j.inRoom && j.state === 'patrol' && this.sneakHintT <= 0) { this.sneakHintT = 3; this.toast('He can hear you! HOLD SHIFT to sneak.'); }

      // shooting
      const sx = (k.RIGHT.isDown ? 1 : 0) - (k.LEFT.isDown ? 1 : 0), sy = (k.DOWN.isDown ? 1 : 0) - (k.UP.isDown ? 1 : 0);
      if ((sx || sy) && this.shootCd <= 0) {
        this.shootCd = this.has('capacitor') ? 0.21 : 0.35;
        const l = Math.hypot(sx, sy);
        const b = this.bolts.create(p.x + sx / l * 16, p.y + sy / l * 10, 'bolt').setDepth(9).setScale(S);
        b.setVelocity(sx / l * 520, sy / l * 520).setRotation(Math.atan2(sy, sx)); b.life = 1.0;
        SFX.zap(); this.addNoise(0.8);
      }
    } else p.setVelocity(0);

    // energy drink
    if (this.has('energy') && Phaser.Input.Keyboard.JustDown(k.F) && this.energyCd <= 0 && !this.hidden) {
      this.energyT = 6; this.energyCd = 25; SFX.good(); this.toast('Energy drink! 6s speed burst (louder)');
    }

    // always-on taser field
    const auraR = this.has('arc') ? 72 : 48;
    this.auraG.clear();
    if (!this.hidden) {
      this.auraG.lineStyle(2, 0x7fdbff, 0.2 + Math.random() * 0.4).strokeCircle(p.x, p.y + 4, auraR);
      if (this.auraT <= 0) {
        this.auraT = 0.3;
        this.enemies.getChildren().slice().forEach(e => {
          if (Math.hypot(e.x - p.x, e.y - p.y) < auraR + 14) this.damageEnemy(e, (this.has('arc') ? 1 : 0.5) * (this.has('mask') ? 2 : 1));
        });
      }
    }

    this.updateEnemies(dt);
    this.updateInteractions(dt);
    this.updateRoomLogic(dt);

    if (this.finale) {
      this.updateFinale(dt);
      if (this.over) return;
    } else {
      // doors
      const out = p.x < 6 ? 'left' : p.x > W - 6 ? 'right' : p.y < 6 ? 'top' : p.y > H - 6 ? 'bottom' : null;
      if (out && this.gateZone && out === 'top') { this.startFinale(); return; }
      if (out === this.room.next || out === this.room.prev) {
        if (!this.sneaking) this.addNoise(8);
        const to = out === this.room.next ? (this.cur + 1) % N : (this.cur - 1 + N) % N;
        this.enterRoom(to, OPP[out]);
      }

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

    if (this.has('noisemaker') && Phaser.Input.Keyboard.JustDown(k.Q) && this.fireCd <= 0 && !this.hidden && !this.finale) this.throwFirecracker();

    this.updateAudio(dt);
    this.drawFx(time);
    this.headerT.setText(this.shortObjective());
    this.updatePanel(time);

    this.periodicT -= dt;
    if (this.periodicT <= 0) { this.periodicT = 28; this.askBrain('periodic'); }
  }

  updateInteractions(dt) {
    const p = this.player, k = this.keys, room = this.room;
    const E = Phaser.Input.Keyboard.JustDown(k.E);
    this.promptT.setText('');
    if (this.hidden) {
      this.promptT.setText(this.mg ? '' : 'E: step out').setPosition(this.hidden.x, this.hidden.y - 34);
      if (E && !this.mg) this.unhide();
      return;
    }
    if (this.knockT > 0) return;
    const near = (o, r = 56) => Math.hypot(o.x - p.x, o.y - p.y) < r;
    let action = null, label = '', at = null;
    for (const h of this.hides) if (near(h, 60)) { action = () => this.hide(h); label = `E: hide in ${h.kind}`; at = h; }
    for (const ped of this.pedestals) if (near(ped, 60) && !ped.st.sold) {
      const it = ITEMS[ped.st.key];
      action = () => this.buy(ped); label = `E: buy ${it.name} (${it.price}c)\n${it.desc}`; at = ped;
    }
    let stump = null;
    for (const so of this.searchObjs) if (near(so)) {
      action = null; at = so;
      if (room.cleared) label = 'Key already found';
      else if (so.o.searched) label = 'Already searched';
      else { label = 'HOLD E to break it open'; stump = so; }
    }
    if (this.trapPed && near(this.trapPed, 70)) { action = () => this.takeCursed(); label = 'E: take the cursed item'; at = this.trapPed; stump = null; }
    if (at) this.promptT.setText(label).setPosition(at.x, at.y - 36);
    if (E && action) action();

    // Breaking a stump takes a couple of seconds of holding E, and the cracking makes noise.
    if (stump && k.E.isDown) {
      if (!this.breaking || this.breaking.so !== stump) this.breaking = { so: stump, t: 0, crackT: 0 };
      const b = this.breaking;
      b.t += dt; b.crackT -= dt;
      if (b.crackT <= 0) { b.crackT = 0.35; SFX.crack(); this.addNoise(1.2); }
      stump.spr.setX(stump.x + rand(-2, 2));
      if (b.t >= STUMP_BREAK_TIME) { stump.spr.setX(stump.x); this.breaking = null; this.searchStump(stump); }
    } else if (this.breaking) {
      this.breaking.so.spr.setX(this.breaking.so.x);
      this.breaking = null;
    }
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
    SFX.coin(); this.toast(`Bought ${it.name}! ${it.desc}`);
  }
  searchStump(so) {
    so.o.searched = true; so.spr.setTint(0x555555);
    if (so.o.marker) { so.o.marker.destroy(); so.o.marker = null; }
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
        const on = crates.some(b => Math.hypot(b.x - pl.x, b.y - pl.y) < 26);
        pl.spr.setTexture(on ? 'plateOn' : 'plate'); if (!on) all = false;
      });
      if (all) { crates.forEach(b => { b.setVelocity(0); b.setImmovable(true); b.body.moves = false; }); this.clearCurrent(); }
    }
    if (this.simon && !this.simon.playing && !room.cleared) {
      const s = this.simon;
      let on = -1;
      this.pumpkins.forEach((pk, i) => { if (Math.hypot(pk.x - p.x, pk.y - p.y) < 40) on = i; });
      if (on !== -1 && on !== s.on) {
        this.flashPumpkin(on);
        if (on === room.seq[s.i]) {
          s.i++;
          if (s.i >= room.seq.length) { this.simon = null; this.pumpkins.forEach(pk => pk.spr.setTexture('pumpkinLit')); this.clearCurrent(); return; }
        } else {
          this.puzzleFail('Wrong pumpkin! Watch again.');
          s.playing = true; s.i = 0;
          this.time.delayedCall(900, () => { if (this.simon === s) this.playSimon(); });
        }
      }
      s.on = on;
    }
    if (this.lantern && Math.hypot(this.lantern.x - p.x, this.lantern.y - p.y) < 44 && !this.hidden) {
      this.tweens.killTweensOf(this.lantern.spr);
      this.lantern.spr.setTexture('lanternLit').setAlpha(1); this.lantern = null; this.clearCurrent();
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
      const dist = j.follow ? 1 : this.ringDist(j.room, this.cur).dist;
      const pan = SIDE_PAN[this.jasonSide()];
      if (dist === 1) { this.stepT = j.state === 'stalk' || j.follow ? 0.5 : 0.9; SFX.footstep(r.awareness >= 25 ? 0.45 : 0.2, pan); }
      else if (dist === 2 && r.awareness >= 25) { this.stepT = 1.0; SFX.footstep(0.12, pan); }
      else this.stepT = 0.5;
    } else this.stepT = 0.3;
  }

  drawFx(time) {
    const g = this.fxG, j = this.jason, r = this.run;
    g.clear();
    const stage = r.awareness >= 75 ? 3 : r.awareness >= 50 ? 2 : r.awareness >= 25 ? 1 : 0;
    if (!this.finale && stage > this.lastStage && !j.inRoom) {
      this.toast(['', 'You hear distant footsteps...', 'The music shifts. Something is hunting you.', 'A shadow moves under the door...'][stage]);
    }
    this.lastStage = stage;
    // shadow under the door he's behind
    if (!this.finale && !j.inRoom && j.state !== 'away') {
      const dist = j.follow ? 1 : this.ringDist(j.room, this.cur).dist;
      if (dist === 1 && (stage >= 3 || j.follow)) {
        const side = this.jasonSide(), d = DOOR_POS[side], horiz = side === 'top' || side === 'bottom';
        g.fillStyle(0x000000, 0.55 + Math.sin(time / 90) * 0.25); g.fillEllipse(d.x, d.y, horiz ? 100 : 46, horiz ? 46 : 100);
        g.fillStyle(0xff3300, 0.5 + Math.random() * 0.4); g.fillRect(d.x - 8, d.y - 4, 4, 3); g.fillRect(d.x + 4, d.y - 4, 4, 3);
      }
    }
    // stealth vision cone
    if (j.inRoom && j.state === 'patrol') {
      const s = j.sprite;
      g.fillStyle(j.spot > 0 ? 0xff5040 : 0xffdd88, 0.14 + j.spot * 0.25);
      g.slice(s.x, s.y, CONE_RANGE, j.facing - CONE_HALF_ANGLE, j.facing + CONE_HALF_ANGLE, false); g.fillPath();
    }
    if (j.inRoom && j.state === 'distracted') {
      g.lineStyle(2, 0xffcc33, 0.6); g.strokeCircle(j.distract.x, j.distract.y, 30 + Math.sin(time / 100) * 6);
    }
    // trail map hints
    if (this.breaking) {
      const so = this.breaking.so, f = Math.min(1, this.breaking.t / STUMP_BREAK_TIME);
      g.fillStyle(0x000000, 0.8); g.fillRect(so.x - 32, so.y + 26, 64, 10);
      g.fillStyle(0xffb040); g.fillRect(so.x - 31, so.y + 27, 62 * f, 8);
    }
    if (this.has('trailmap')) {
      if (this.simon && !this.simon.playing) { const pk = this.pumpkins[this.room.seq[this.simon.i]]; g.lineStyle(3, 0xffff80, 0.4 + Math.sin(time / 150) * 0.3).strokeCircle(pk.x, pk.y, 44); }
      if (this.room.type === 'plates' && !this.room.cleared) { g.lineStyle(3, 0x80ff90, 0.5); this.plates.forEach(pl => g.strokeRect(pl.x - 28, pl.y - 28, 56, 56)); }
    }
    if (this.gateZone) { g.fillStyle(0x80ff90, 0.25 + Math.sin(time / 200) * 0.15); g.fillRect(9 * T, 0, 2 * T, T); }
    if (j.inRoom) this.bubble.setPosition(j.sprite.x, j.sprite.y - 34); else this.bubble.setPosition(W / 2, 150);
  }
}

window.game = new Phaser.Game({
  type: Phaser.AUTO, width: GW, height: H, parent: 'game', pixelArt: true, backgroundColor: '#000000',
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [IntroScene, GameScene],
});
