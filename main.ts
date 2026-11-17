// Void Bloom — hand-in program for the best-game-01 entry (Node 22, standard library only).
//
// The game itself lives in game/ as plain static files (open game/index.html in a desktop
// browser, no build step, no network). This program is the courier: it copies game/ and
// screenshots/ from beside itself into the grader's output directory and writes
// dossier.json there with buildDossier from the vendored make.fun library, so the judge
// reads exactly the files the player would run.
//
// In the grader the output directory is /output; anywhere else, point MAKEFUN_OUTPUT_DIR
// at a folder to rehearse the hand-in:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
const shotsDir = join(root, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

// The caps below mirror the sealed scorer's own limits, so a hand-in this program writes
// is one the scorer can accept: dossier text budget, at most 4 screenshots of at most
// 256 KiB each, at most 993 files and 48 MiB under game/, no game path over 1000 bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
