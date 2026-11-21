// A working gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. Only the plumbing, not an open world: Block
// Dodger, a plain 2D canvas game where a paddle dodges falling blocks and catches coins, with a
// title screen, score, lives and levels, game over and restart, flat colours and no sound. Build
// your own open-world crime game in its place (three.js or any library you vendor under game/),
// put your 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, canonicalJson } from './vendor/makefun-game.ts';

// --- Screenshots manifest (added for this entry) ---------------------------
// The dossier's `images` carry each screenshot's bytes, but not its pixel
// dimensions. This manifest lists the handed-in screenshots — name, pixel
// size and byte size, in name order, the first the cover — so the judge can
// see at a glance what the renders are without decoding them. It is read
// from the files themselves at build time, so it is deterministic: the same
// screenshots always give the same manifest, and the dossier stays
// byte-identical across runs.

/** A PNG or JPEG's pixel dimensions, read from its header bytes (no decode). */
function imageDimensions(bytes: Buffer): { width: number; height: number } {
  // PNG: the IHDR chunk holds width then height, each a big-endian uint32.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  // JPEG: walk the segments until a start-of-frame marker (baseline 0xC0 or
  // progressive 0xC2); it holds precision, then height, then width.
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at] !== 0xff) throw new Error('imageDimensions: bad JPEG marker');
      const marker = bytes[at + 1]!;
      if (marker === 0xd9) break; // EOI: no frame found
      if (marker === 0xc0 || marker === 0xc2) {
        return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
      }
      // Standalone markers carry no length; every other segment does.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
      const len = bytes.readUInt16BE(at + 2);
      if (len < 2 || at + 2 + len > bytes.length) throw new Error('imageDimensions: bad JPEG segment');
      at += 2 + len;
    }
  }
  throw new Error('imageDimensions: not a PNG or JPEG');
}

/** The handed-in screenshots, in name order: name, pixel size and byte size. */
function screenshotManifest(shotsDir: string): { name: string; width: number; height: number; bytes: number }[] {
  return readdirSync(shotsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const bytes = readFileSync(join(shotsDir, name));
      const { width, height } = imageDimensions(bytes);
      return { name, width, height, bytes: bytes.length };
    });
}

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
const dossier = JSON.parse(new TextDecoder().decode(buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
}))) as Record<string, unknown>;
dossier.screenshots = screenshotManifest(join(out, 'screenshots'));
writeFileSync(join(out, 'dossier.json'), canonicalJson(dossier));
