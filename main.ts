// Breachline's handing-in program: Node 22, standard library only.
//
// The game itself is the static `game/` folder beside this file — plain ES modules the browser
// loads through the import map in game/index.html, with three.js vendored next to them. Nothing
// here builds or bundles it; this program only assembles what the bounty asks for:
//
//   <out>/game/         a copy of game/, exactly as the browser would load it
//   <out>/screenshots/  a copy of screenshots/ (the first name is the cover)
//   <out>/dossier.json  the summary of both, written by the kit's own library
//
// Inside the grader `out` is /output. Anywhere else, point MAKEFUN_OUTPUT_DIR at a directory:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The two caps below are the scorer's (reference/gate.json). text_max_bytes only shapes the
// dossier's text; the rest make this program refuse what the scorer would refuse anyway: more
// than four screenshots, a screenshot over 256 KiB, more than 993 files in game/ or 48 MiB of
// them. Screenshots are real captures of this game in Chrome at 1280x720.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

const sourceGame = join(ROOT, 'game');
const sourceShots = join(ROOT, 'screenshots');

if (!existsSync(join(sourceGame, 'index.html'))) fail('game/index.html is missing');
if (!existsSync(sourceShots)) fail('screenshots/ is missing: the entry needs 3 or 4 real captures');

mkdirSync(OUT, { recursive: true });
cpSync(sourceGame, join(OUT, 'game'), { recursive: true });
cpSync(sourceShots, join(OUT, 'screenshots'), { recursive: true });

// a quick report, so a run says what it handed in instead of just exiting
const shots = readdirSync(join(OUT, 'screenshots')).filter((name) => !name.startsWith('.'));
const bytes = shots.reduce((sum, name) => sum + statSync(join(OUT, 'screenshots', name)).size, 0);
if (shots.length < 3 || shots.length > CAPS.screenshots.max) fail(`expected 3 or 4 screenshots, found ${shots.length}`);

const dossier = buildDossier(OUT, CAPS);
writeFileSync(join(OUT, 'dossier.json'), dossier);

console.log(`game/ and ${shots.length} screenshots (${Math.round(bytes / 1024)} KiB) copied to ${OUT}`);
console.log(`dossier.json written: ${Buffer.byteLength(dossier)} bytes`);
