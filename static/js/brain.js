// Baked Man's "brain": asks Gemini (through server.py) what he thinks and says.
// If Gemini is unreachable, slow, or rate limited, a rule-based fallback answers instead, so the game never stalls.
const Brain = (() => {
  const LINES = {
    chase_start: ['I smell you, little camper.', 'There you are. Sizzling.', 'Run. It makes the meat tender.', 'Found you by the smoke.'],
    caught: ['Shhh. Lie still. Let it cool.', 'One more for the fire.', 'Done. Golden brown.'],
    return: ["Oh... you didn't die?", "You didn't die? Hm. Undercooked.", "Oh, you didn't die? I'll fix that."],
    hide_success: ['Hmph. Not here. Not yet.', 'I can wait. Embers last all night.', 'Hide. The smoke will find you.'],
    room_clear: ['Clever little hiker.', 'Every gate you open, I hear.', 'Keep going. Deeper into my woods.'],
    periodic: ['Can you smell the smoke?', 'I hear your little shoes.', 'The trail only goes in a circle.', 'Breathing so loud...'],
    death: ['Rest now. The fire is warm.', 'Another hiker for the trail.'],
  };
  const THOUGHTS = {
    patrol: 'Quiet one. I will walk the trail and listen.',
    stalk: 'So much noise. I just have to follow it.',
    ambush: 'They keep failing. They will panic and run straight to me.',
    check_hiding_spots: 'They love closets. Next time I open every door.',
  };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  let inflight = 0;
  let online = null; // null = unknown yet

  function fallback(event, s) {
    let aggression = 0.25 + s.enemy_hits_taken * 0.03 + s.failed_puzzle_attempts * 0.06 + s.noise_made / 700
      + s.times_caught * 0.05 - s.times_hidden * 0.02;
    aggression = Math.max(0.1, Math.min(1, aggression));
    const strategy = s.times_hidden >= 3 ? 'check_hiding_spots'
      : s.noise_made > 250 ? 'stalk'
      : s.failed_puzzle_attempts >= 2 ? 'ambush' : 'patrol';
    const res = { line: pick(LINES[event] || LINES.periodic), thought: THOUGHTS[strategy], aggression, strategy, source: 'fallback' };
    if (event === 'ending') {
      res.ending = `You stumble out of the treeline with ${s.hearts} heart(s) left, smelling of smoke. ` +
        `He caught you ${s.times_caught} time(s), you hid ${s.times_hidden} time(s), and you botched ${s.failed_puzzle_attempts} puzzle(s). ` +
        `Behind you, the trail glows orange. Somewhere, something is still cooking.`;
      res.line = 'Next year, camper.';
    }
    return res;
  }

  async function ask(event, stats) {
    if (inflight >= 2 || online === false && Math.random() < 0.7) return fallback(event, stats);
    inflight++;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 7000);
      const r = await fetch('/api/jason', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, stats }), signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      online = true;
      const base = fallback(event, stats);
      const out = { ...base, source: 'gemini' };
      if (typeof j.line === 'string' && j.line) out.line = j.line;
      if (typeof j.thought === 'string' && j.thought) out.thought = j.thought;
      if (typeof j.aggression === 'number') out.aggression = Math.max(0, Math.min(1, j.aggression));
      if (THOUGHTS[j.strategy]) out.strategy = j.strategy;
      if (typeof j.ending === 'string' && j.ending) out.ending = j.ending;
      return out;
    } catch (e) {
      online = false;
      return fallback(event, stats);
    } finally {
      inflight--;
    }
  }

  return { ask, isOnline: () => online };
})();
