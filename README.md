# Baked Man on the Nature Trail

Halloween top-down roguelite (Binding of Isaac style). Escape a looping nature trail while
**the Baked Man**, an AI-driven killer powered by **Google Gemini**, hunts you.

## Run it
1. Get a Gemini key: https://aistudio.google.com/apikey
2. `cp .env.example .env` and paste the key into `.env` (it is git-ignored, never commit it)
3. `python3 server.py`, then open http://localhost:8000

No key or no internet? The game still runs; Baked Man uses built-in fallback lines and rules.

## How Gemini is used
`server.py` is a tiny Python proxy (keeps the key out of the browser). At key moments the game
sends Gemini a summary of **this playthrough** (damage taken, failed puzzles, noise, hides, catches)
and Gemini returns Baked Man's:
- **line**: what he says out loud (chat + speech bubble)
- **thought**: his hunting reasoning (shown in the Brain panel, press B)
- **aggression**: 0 to 1, scales his speed and how fast awareness rises
- **strategy**: patrol / stalk / ambush / check_hiding_spots, changes his behavior
It also writes the personalized ending epilogue.

Frame-by-frame movement, pathfinding (BFS), and the hidden awareness meter run locally in the game.

## Files
- `static/js/game.js`: scenes, player, rooms, Baked Man AI, HUD
- `static/js/data.js`: items, room generation, pixel-art textures (drawn in code)
- `static/js/brain.js`: Gemini client + fallback brain
- `static/js/audio.js`: synthesized sound (panned footsteps, heartbeat, drone)
- `server.py`: static server + `/api/jason` Gemini proxy
