// Tests für das Assetmanifest der GPT-Spielillustrationen (assets/games/).
// Prüft den Liefervertrag programmgesteuert: exakt 62 gebündelte Built-ins,
// genau die zwei Community-Test-IDs ohne gebündeltes Asset, Hashes, Format,
// Prompt-Provenienz und die Verknüpfung mit dem Content-Bundle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  EXPECTED_BUILTIN_COUNT, COMMUNITY_TEST_IDS, promptFor, webpDimensions, validateImageManifest,
} from '../scripts/image-manifest.mjs';
import { CONTENT } from '../js/content.generated.js';
import { displayImageFor, isValidImageKey, normalizeBuiltinImagePath } from '../js/gameimages.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIR = join(ROOT, 'assets', 'games');
const manifest = JSON.parse(readFileSync(join(ASSET_DIR, 'manifest.json'), 'utf8'));
const readAsset = path => readFileSync(join(ROOT, path));
const listAssets = () => readdirSync(ASSET_DIR);
const sha256 = data => createHash('sha256').update(data).digest('hex');

test('Manifest: exakt 62 Built-ins und genau die 2 Community-Test-IDs aus dem Vertrag', () => {
  assert.equal(EXPECTED_BUILTIN_COUNT, 62);
  assert.deepEqual(COMMUNITY_TEST_IDS, ['community~smoke-test', 'community~teesfft']);
  assert.equal(manifest.builtins.length, 62);
  assert.equal(new Set(manifest.builtins.map(e => e.id)).size, 62);
  assert.deepEqual(manifest.communityTestIds.map(e => e.id), COMMUNITY_TEST_IDS);
});

test('Manifest: jede Built-in-ID entspricht genau einer content/games-Datei', () => {
  const contentIds = readdirSync(join(ROOT, 'content', 'games'))
    .filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)).sort();
  assert.deepEqual(manifest.builtins.map(e => e.id).sort(), contentIds);
});

test('Manifest: Provenienz ist vollständig (Modell, Serie, Normalisierung, KI-Kennzeichnung)', () => {
  assert.equal(manifest.series, 'game-illustrations-gpt-v1');
  assert.equal(manifest.generation.provider, 'openai-codex');
  assert.equal(manifest.generation.model, 'gpt-image-2-medium');
  assert.deepEqual(manifest.generation.normalizedDimensions, [1200, 800]);
  assert.equal(manifest.generation.normalizationFormat, 'WEBP');
  assert.equal(manifest.aiGenerated, true);
  assert.ok(manifest.generation.commonStylePrompt.length > 100);
  assert.match(manifest.source.archive, /sportzaehler-gpt-illustrations-webp\.tar\.gz$/);
});

test('Manifest: promptHash lässt sich aus Stilprompt + Szene nachrechnen', () => {
  for (const e of [...manifest.builtins, ...manifest.communityTestIds]) {
    const prompt = promptFor(manifest, e);
    assert.ok(prompt.endsWith(` Scene: ${e.visualSummary}`), e.id);
    assert.equal(sha256(prompt), e.promptHash, e.id);
  }
});

test('Assets: Hash, Größe, WebP-Magic-Bytes und 1200×800 stimmen mit dem Manifest', () => {
  for (const e of manifest.builtins) {
    const bytes = readAsset(e.file);
    assert.equal(e.file, `assets/games/${e.id}.webp`, e.id);
    assert.equal(bytes.length, e.byteSize, e.id);
    assert.equal(sha256(bytes), e.sha256, e.id);
    assert.deepEqual(webpDimensions(bytes), { width: 1200, height: 800 }, e.id);
  }
});

test('Assets: assets/games enthält nur Manifest-WebPs – keine SVG, keine Community-Assets', () => {
  const files = listAssets().filter(f => f !== 'manifest.json').sort();
  assert.equal(files.length, 62);
  assert.deepEqual(files, manifest.builtins.map(e => `${e.id}.webp`).sort());
  assert.equal(files.some(f => /\.svgz?$/i.test(f) || f.includes('~') || f.startsWith('community')), false);
});

test('Content-Bundle: alle 62 Built-ins tragen ihr Bild und einen Alternativtext', () => {
  const withImage = CONTENT.filter(c => c.image);
  assert.equal(CONTENT.length, 62);
  assert.equal(withImage.length, 62);
  const byId = new Map(manifest.builtins.map(e => [e.id, e]));
  for (const c of CONTENT) {
    assert.equal(c.imageKey, c.id, c.id);
    assert.equal(c.image, byId.get(c.id).file, c.id);
    assert.equal(displayImageFor(c), c.image, c.id);
    assert.ok(c.imageAlt && c.imageAlt.length <= 120, c.id);
  }
});

test('Community-Test-IDs: nicht gebündelt und nie als lokales Built-in-Bild darstellbar', () => {
  for (const e of manifest.communityTestIds) {
    assert.equal(e.bundled, false, e.id);
    assert.equal(e.file, undefined, e.id);
    assert.equal(isValidImageKey(e.id), false, e.id);
    assert.equal(normalizeBuiltinImagePath(`assets/games/${e.id}.webp`), null, e.id);
    assert.equal(displayImageFor({ community: true, id: e.id, image: `assets/games/${e.id}.webp`, imageStatus: 'approved' }), null);
  }
});

test('validateImageManifest: aktuelles Manifest ist fehlerfrei', () => {
  const errors = validateImageManifest(manifest, { contentEntries: CONTENT, readAsset, listAssets });
  assert.deepEqual(errors, []);
});

test('validateImageManifest meldet fehlende, doppelte, falsche und überzählige Einträge', () => {
  const clone = () => JSON.parse(JSON.stringify(manifest));
  const opts = { contentEntries: CONTENT, readAsset, listAssets };

  const missing = clone();
  missing.builtins.pop();
  assert.ok(validateImageManifest(missing, opts).some(e => /62/.test(e)));

  const dup = clone();
  dup.builtins[1] = { ...dup.builtins[0] };
  assert.ok(validateImageManifest(dup, opts).some(e => /doppelt/i.test(e)));

  const hash = clone();
  hash.builtins[0].sha256 = '0'.repeat(64);
  assert.ok(validateImageManifest(hash, opts).some(e => /SHA-256/.test(e)));

  const svg = clone();
  svg.builtins[0].file = 'assets/games/atomspiel.svg';
  assert.ok(validateImageManifest(svg, opts).some(e => /Pfad/.test(e)));

  const community = clone();
  community.communityTestIds.push({ ...community.communityTestIds[0], id: 'community~extra' });
  assert.ok(validateImageManifest(community, opts).some(e => /Community-Test-IDs/.test(e)));

  const bundled = clone();
  bundled.communityTestIds[0].bundled = true;
  assert.ok(validateImageManifest(bundled, opts).some(e => /nicht gebündelt/.test(e)));

  const orphan = validateImageManifest(manifest, { ...opts, listAssets: () => [...listAssets(), 'fremd.webp'] });
  assert.ok(orphan.some(e => /fremd\.webp/.test(e)));

  const unlinked = validateImageManifest(manifest, {
    ...opts, contentEntries: CONTENT.map(c => (c.id === 'burgball' ? { ...c, image: undefined } : c)),
  });
  assert.ok(unlinked.some(e => /burgball/.test(e)));
});

test('webpDimensions liest VP8/VP8L/VP8X und lehnt Nicht-WebP ab', () => {
  const riff = (chunk, payload) => Buffer.concat([
    Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.from(chunk), Buffer.alloc(4), payload,
  ]);
  // VP8X: Breite/Höhe − 1 als 24-Bit little endian ab Byte 24.
  const vp8x = Buffer.alloc(10);
  vp8x.writeUIntLE(1199, 4, 3); vp8x.writeUIntLE(799, 7, 3);
  assert.deepEqual(webpDimensions(riff('VP8X', vp8x)), { width: 1200, height: 800 });
  // VP8 (lossy): Startcode 9d 01 2a, dann 14-Bit-Breite/-Höhe.
  const vp8 = Buffer.alloc(10);
  vp8.set([0x9d, 0x01, 0x2a], 3); vp8.writeUInt16LE(640, 6); vp8.writeUInt16LE(480, 8);
  assert.deepEqual(webpDimensions(riff('VP8 ', vp8)), { width: 640, height: 480 });
  // VP8L (lossless): Signatur 0x2f, dann 14 Bit (w−1) und 14 Bit (h−1).
  const vp8l = Buffer.alloc(5);
  vp8l[0] = 0x2f; vp8l.writeUInt32LE((99) | (49 << 14), 1);
  assert.deepEqual(webpDimensions(riff('VP8L', vp8l)), { width: 100, height: 50 });
  assert.equal(webpDimensions(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(webpDimensions(null), null);
});
