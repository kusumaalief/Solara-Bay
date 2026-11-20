// Solara Bay v3 — a working gta6-01 entry (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html, its ES modules and the vendored
// Three.js build under game/vendor/, no library from a CDN and no network
// request). Three small JPEG textures under game/textures/ (48 KB total,
// downscaled from a free-to-use city street pack) are used as storefront
// facades and a billboard. It is a 3D blocky open-world crime game in the
// spirit of GTA 6: a city to explore on foot and by car, traffic and
// pedestrians, cars to steal, a wanted level with police, five story
// missions and a story, a taxi side activity and beach collectibles, combat
// with three buyable guns from Marin's Armory, a HUD with a minimap, a
// start screen, a pause menu and a save. This program hands it in: it copies
// game/ and screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. Before writing the dossier it checks the screenshots
// the scorer will check (3 to 4 files, each at most 256 KiB) and refuses
// with a clear error instead of handing in a broken entry.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's screenshot rules, checked here first so a bad hand-in fails
// loudly on the builder's machine instead of silently at grading time.
const shotDir = join(here, 'screenshots');
const shotFiles = existsSync(shotDir)
  ? readdirSync(shotDir).filter((f) => !f.startsWith('.')).sort()
  : [];
if (shotFiles.length < 3 || shotFiles.length > 4) {
  throw new Error(`expected 3 to 4 screenshots in screenshots/, found ${shotFiles.length}`);
}
for (const f of shotFiles) {
  const size = statSync(join(shotDir, f)).size;
  if (size > 262144) throw new Error(`screenshot ${f} is ${size} bytes, over the 256 KiB cap`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
