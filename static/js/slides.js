// Story + how-to-play slideshow. Shown before the first run, and from the pause menu (H).
const SLIDES = [
  {
    title: 'BAKED MAN ON THE NATURE TRAIL', size: 40,
    art: [['tree', 2.5], ['tent', 2.5], ['player', 3.5], ['pumpkinLit', 2.5], ['tree', 2.5]],
    body: 'Halloween night. You came to the Kettle Creek Nature Trail for a night hike.\n\nThe ranger said two things:\nstay on the trail, and stay away from the old Smokehouse.',
  },
  {
    title: 'THE LEGEND',
    art: [['deadtree', 3], ['jason', 4.5], ['deadtree', 3]],
    body: 'Forty years ago, the camp cook was locked inside the Smokehouse when it burned down.\nThey never found a body.\n\nEvery Halloween since, hikers smell smoke on the trail...\nand hear heavy footsteps that never stop.',
  },
  {
    title: 'TONIGHT',
    art: [['gate', 2], ['player', 3.5], ['bush', 2.5], ['closet', 2.2]],
    body: 'Your group is gone. The trail loops in a circle, and the Trailhead gate has locked behind you.\n\nSomething charred and smoking is walking the loop.\nIt cannot see far. But it is always listening.',
  },
  {
    title: 'YOUR GOAL',
    art: [['zombie', 2.5, 'Ambush'], ['crate', 2, 'Crates'], ['stump', 2.2, 'Lost Key'], ['pumpkin', 2, 'Pumpkins'], ['lantern', 2.2, 'Stealth'], ['altar', 1.8, 'Shrine']],
    body: 'Clear 6 areas of the trail. Each one has a challenge: fight, solve, or sneak.\nYour objective is always shown at the top of the room and on the right.\n\nThen return to the Trailhead. Its north gate opens, and the final chase begins.\nSurvive it, and you escape.',
  },
  {
    title: 'CONTROLS', align: 'left',
    body: 'W A S D        Move\nSHIFT (hold)   Sneak: slow but silent\nARROW KEYS     Shoot your taser (your taser field also zaps anything close)\nE              Hide, buy, take.  HOLD E to break open stumps\nSPACE          Hold your breath while hiding\nQ              Throw a firecracker (if you bought them)\nF              Energy drink speed burst (if you bought it)\nR              Reset crates (crate puzzle only)\nP or ESC       Pause / see these slides again',
  },
  {
    title: 'THE BAKED MAN',
    art: [['jason', 4], ['closet', 2.2], ['locker', 2.2]],
    body: 'Noise raises his AWARENESS (the bar on the right).\nRunning, shooting, slamming doors and failed puzzles are all noise.\nYou HEAR him first (footsteps from that side), then see a shadow under the door.\n\nWhen he finds you: run to another area, or hide (E) and hold your breath (SPACE).\nTaser bolts slow him. Four quick hits stun him.\nHe only takes a heart (you have 3) if he actually catches you.\n\nHis brain is Google Gemini. He watches how YOU play and changes how he hunts.',
  },
  {
    title: 'COINS & ITEMS',
    art: [['bat', 2.5], ['crow', 2.5], ['pedestal', 2.2], ['altar', 1.8]],
    body: 'Enemies drop coins, and clearing an area pays more. Getting hit makes noise and costs a coin.\n\nSpend coins at the Ranger Shop, halfway around the loop.\nBuy for what you struggle with: combat, stealth, or puzzles.\nCursed Shrines give free items with a nasty catch.',
  },
  {
    title: 'GOOD LUCK',
    art: [['player', 3.5], ['tree', 2.5], ['tree', 2.5], ['tree', 2.5], ['jason', 3]],
    body: 'Stay quiet. Listen for footsteps.\n\nAnd whatever you do... don\'t let him catch you.',
  },
];

class SlidesScene extends Phaser.Scene {
  constructor() { super('slides'); }
  init(data) { this.fromPause = !!(data && data.fromPause); this.i = 0; this.content = null; }

  create() {
    makeTextures(this);
    this.add.rectangle(GW / 2, H / 2, GW, H, 0x0a0605, this.fromPause ? 0.97 : 1).setDepth(0);
    // drifting embers
    for (let k = 0; k < 36; k++) {
      const e = this.add.rectangle(rand(0, GW), rand(0, H), 3, 3, pick([0xff6a00, 0xffaa00, 0xff3300]), rand(0.3, 0.8)).setDepth(1);
      this.tweens.add({ targets: e, y: e.y - rand(120, 300), alpha: 0, duration: rand(2500, 5000), repeat: -1, delay: rand(0, 3000),
        onRepeat: () => { e.setPosition(rand(0, GW), H + 10); e.setAlpha(rand(0.3, 0.8)); } });
    }
    this.dotsG = this.add.graphics().setDepth(5);
    this.hint = txt(this, GW / 2, H - 28, '', 15, '#bba890').setOrigin(0.5).setDepth(5);

    this.input.keyboard.on('keydown', e => {
      SFX.init();
      if (['ArrowRight', 'KeyD', 'Space', 'Enter'].includes(e.code)) this.next();
      else if (['ArrowLeft', 'KeyA'].includes(e.code)) this.show(this.i - 1);
      else if (['Escape', 'KeyP', 'KeyH'].includes(e.code)) this.close();
    });
    this.input.on('pointerdown', () => { SFX.init(); this.next(); });
    this.show(0);
  }

  show(i) {
    if (i < 0 || i >= SLIDES.length) return;
    this.i = i;
    const s = SLIDES[i];
    if (this.content) { const old = this.content; this.tweens.add({ targets: old, alpha: 0, duration: 150, onComplete: () => old.destroy() }); }
    const c = this.content = this.add.container(0, 0).setDepth(3).setAlpha(0);
    c.add(txt(this, GW / 2, 64, s.title, s.size || 34, '#ff6a1a').setOrigin(0.5));
    let bodyY = 140;
    if (s.art) {
      const gap = Math.min(170, (GW - 300) / s.art.length);
      s.art.forEach(([key, scale, label], k) => {
        const x = GW / 2 + (k - (s.art.length - 1) / 2) * gap;
        const img = this.add.image(x, 245, key).setOrigin(0.5, 1);
        img.setScale(Math.min(scale, 120 / img.height)); // keep tall art clear of the title
        c.add(img);
        if (label) c.add(txt(this, x, 256, label, 14, '#ffe9a0').setOrigin(0.5, 0));
      });
      bodyY = s.art.some(a => a[2]) ? 300 : 282;
    }
    const left = s.align === 'left';
    c.add(txt(this, left ? 230 : GW / 2, bodyY, s.body, 19, '#f5e6c8', { align: left ? 'left' : 'center', lineSpacing: 7, wordWrap: { width: 1100 } }).setOrigin(left ? 0 : 0.5, 0));
    this.tweens.add({ targets: c, alpha: 1, duration: 250 });

    const last = i === SLIDES.length - 1;
    this.hint.setText(last
      ? (this.fromPause ? 'SPACE: back to the game    <- back' : 'PRESS SPACE TO BEGIN    <- back')
      : `SPACE or -> next    <- back    ESC ${this.fromPause ? 'back to game' : 'skip to game'}`);
    this.hint.setColor(last ? '#ffcc66' : '#bba890');
    const g = this.dotsG; g.clear();
    SLIDES.forEach((_, k) => { g.fillStyle(k === i ? 0xff6a1a : 0x4a3a30); g.fillCircle(GW / 2 + (k - (SLIDES.length - 1) / 2) * 22, H - 58, k === i ? 6 : 4); });
  }

  next() { if (this.i >= SLIDES.length - 1) this.close(); else this.show(this.i + 1); }

  close() {
    if (this.fromPause) {
      const game = this.scene.get('game');
      this.scene.stop();
      this.scene.resume('game');
      game.input.keyboard.resetKeys();
    } else this.scene.start('game');
  }
}
