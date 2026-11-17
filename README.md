# Void Bloom

**The last flower in the dark is still shining. You are its keeper.**

Void Bloom is an original arena-defence game that runs in a desktop browser from
static files — no build step, no network request, nothing to install. A luminous
cosmic flower, the Bloom, drifts at the centre of the field while void moths,
wisps, beetles and worse pour in from the dark to eat its light. You are the
firefly keeper: fly, aim, and hold back the swarm for ten waves. Between waves
the Bloom offers one of three gifts — faster pollen, thorn aura, a stronger
heart — and the swarm answers harder. On the tenth wave the Void Maw itself
comes to feed. Kill it and dawn breaks; let the Bloom or the keeper fall, and
the dark prevails.

## Play it

Serve the `game/` folder with any static file server, for example:

```
node serve.ts            # then open http://localhost:8090
```

or open `game/index.html` through any static host. Desktop Chrome is the
reference browser.

## Controls

- **WASD / arrow keys** — fly
- **Mouse** — aim
- **Hold left click or Space** — fire pollen bolts
- **Shift or right click** — dash (briefly untouchable)
- **P** — pause · **M** — mute · **Enter** — start / restart
- Between waves: **click a gift card** or press **1 · 2 · 3**

## How it is put together

- `game/` — the whole game as plain static files: `index.html` plus ES modules
  under `game/src/` (`world.js` holds the rules with no browser in it,
  `render.js` only draws, `input.js` and `audio.js` — a small oscillator synth,
  no audio files — serve the shell in `main.js`). No library is used.
- `game/src/shots.js` — deterministic screenshot scenes (`?shot=start|play|
  upgrade|end&seed=N`) that stage real frames of the game for `screenshots/`;
  the list is in `shots.json`.
- `screenshots/` — four real renders of the game (title, mid-swarm combat, the
  gift choice, the fall), taken by the maker in a browser.
- `main.ts` — the hand-in program (Node 22, standard library only): copies
  `game/` and `screenshots/` to the output directory and writes `dossier.json`
  with `vendor/makefun-game.ts`. Rehearse it with
  `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.
- `serve.ts` — a tiny local server for play-testing.

An entry in the make.fun **best-game-01** competition ("Make the best game").
MIT licensed — see `LICENSE`.
