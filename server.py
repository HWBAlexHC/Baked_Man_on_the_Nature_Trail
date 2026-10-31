"""Tiny local server: serves the game from ./static and proxies Gemini so the API key never reaches the browser.

Run:  python3 server.py      then open http://localhost:8000
Key:  put GEMINI_API_KEY=... in a .env file next to this script (never commit it).
No key? The game still works; Baked Man falls back to his built-in lines.
"""
import json
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
PORT = int(os.environ.get("PORT", "8000"))


def load_env():
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        return
    for line in open(path):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()

MODELS = [m for m in [os.environ.get("GEMINI_MODEL"), "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"] if m]
working_model = None

SYSTEM = """You are THE BAKED MAN, a burned, smoldering slasher who stalks hikers on a haunted nature trail in a top-down horror game.
You are the game's AI opponent. You receive a JSON summary of how the player is doing in THIS playthrough and a game event.
Reply with ONLY a JSON object, no markdown:
{"thought": "<your private hunting reasoning, first person, max 22 words, reference the player's actual stats>",
 "line": "<what you say out loud to the player, max 14 words, creepy, PG-13, no slurs>",
 "aggression": <number 0.0-1.0: how hard to hunt; raise it if the player is sloppy/noisy/failing puzzles, lower slightly if they are struggling badly so the game stays fair>,
 "strategy": "<one of: patrol, stalk, ambush, check_hiding_spots>"}
Pick check_hiding_spots if they hide a lot, stalk if they are noisy, ambush if they rush, patrol otherwise.
Speak like a slow, crackling, patient killer. Fire, smoke, embers, cooking, ash are your motifs."""

EVENT_HINTS = {
    "chase_start": "You just spotted the player and the chase begins. Say something as you lunge.",
    "caught": "You just caught the player. They went limp and you think they are dead. Gloat quietly.",
    "return": "You came back to where you 'killed' the player and they are gone. Your line MUST contain the words \"you didn't die\".",
    "hide_success": "The player held their breath in a hiding spot and you gave up searching. Sound frustrated but patient.",
    "room_clear": "The player just cleared an area of the trail. React from somewhere nearby.",
    "periodic": "Routine check-in while you hunt. Taunt from the dark.",
    "death": "The player lost their last heart. Final line.",
}

ENDING_SYSTEM = """You narrate the ending of a horror game called Baked Man on the Nature Trail. The player escaped the burned killer.
Write a 3-4 sentence eerie epilogue in second person that references their actual stats from the JSON (hearts left, times caught, times hidden, failed puzzles, noise).
Reply with ONLY JSON: {"ending": "<epilogue>", "line": "<Baked Man's last words, max 12 words>"}"""


def call_gemini(key, system, prompt):
    global working_model
    models = [working_model] if working_model else MODELS
    last_err = None
    for model in models:
        for thinking in (True, False):
            cfg = {"responseMimeType": "application/json", "temperature": 0.95, "maxOutputTokens": 300}
            if thinking and "2.5" in model:
                cfg["thinkingConfig"] = {"thinkingBudget": 0}
            body = {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": cfg,
            }
            req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json", "x-goog-api-key": key},
            )
            try:
                with urllib.request.urlopen(req, timeout=8) as r:
                    data = json.load(r)
                text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if text.startswith("```"):
                    text = text.strip("`").split("\n", 1)[1]
                working_model = model
                return json.loads(text)
            except urllib.error.HTTPError as e:
                last_err = f"{model}: HTTP {e.code} {e.read()[:200]!r}"
                if e.code == 429:
                    raise RuntimeError("rate limited")
                if e.code == 400 and "thinkingConfig" in cfg:
                    continue  # retry without thinking config
                break  # try next model
            except Exception as e:  # bad JSON, timeout, etc.
                last_err = f"{model}: {e}"
                break
    raise RuntimeError(last_err or "gemini failed")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)

    def send_json(self, code, obj):
        raw = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        if self.path != "/api/jason":
            return self.send_json(404, {"error": "not found"})
        key = os.environ.get("GEMINI_API_KEY")
        if not key:
            return self.send_json(503, {"error": "no GEMINI_API_KEY set"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(n) or b"{}")
            event = str(payload.get("event", "periodic"))
            stats = payload.get("stats", {})
            if event == "ending":
                system, prompt = ENDING_SYSTEM, "Player stats: " + json.dumps(stats)
            else:
                system = SYSTEM
                prompt = f"EVENT: {event}. {EVENT_HINTS.get(event, '')}\nPlayer stats this run: {json.dumps(stats)}"
            result = call_gemini(key, system, prompt)
            print(f"[gemini] {event}: {result}")
            return self.send_json(200, result)
        except Exception as e:
            print(f"[gemini] error: {e}")
            return self.send_json(502, {"error": str(e)})


if __name__ == "__main__":
    print(f"Baked Man on the Nature Trail -> http://localhost:{PORT}")
    print("Gemini key:", "loaded" if os.environ.get("GEMINI_API_KEY") else "MISSING (using fallback lines)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
