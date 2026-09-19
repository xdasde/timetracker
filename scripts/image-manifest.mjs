// Prüfung des Assetmanifests assets/games/manifest.json (GPT-Spielillustrationen).
//
// Wird vom Content-Build (scripts/build-content.mjs) und von
// test/image-manifest.test.mjs verwendet. Bewusst ohne Abhängigkeiten.
//
// Vertrag der Lieferung game-illustrations-gpt-v1:
//  • genau 62 gebündelte Built-in-Bilder unter assets/games/<id>.webp,
//    je eines pro content/games/<id>.md, als echtes WebP in 1200×800;
//  • genau die zwei Community-Test-IDs – sie werden nie gebündelt, Community-
//    Bilder kommen ausschließlich über den GameImages-Vertrag des Apps Scripts;
//  • promptHash = sha256(commonStylePrompt + " Scene: " + visualSummary).
import { createHash } from 'node:crypto';
import { isValidImageKey, imagePathForKey, sniffImageType } from '../js/gameimages.js';

export const EXPECTED_BUILTIN_COUNT = 62;
export const COMMUNITY_TEST_IDS = ['community~smoke-test', 'community~teesfft'];
export const MANIFEST_FILE = 'manifest.json';
const DIMENSIONS = { width: 1200, height: 800 };

const sha256 = data => createHash('sha256').update(data).digest('hex');

export function promptFor(manifest, entry) {
  return `${manifest?.generation?.commonStylePrompt ?? ''} Scene: ${entry?.visualSummary ?? ''}`;
}

// Liest Breite/Höhe aus dem WebP-Header (VP8, VP8L oder VP8X). null bei Nicht-WebP.
export function webpDimensions(bytes) {
  if (!bytes || bytes.length < 25 || sniffImageType(bytes) !== 'webp') return null;
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  const u24 = i => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
  if (chunk === 'VP8X' && bytes.length >= 30) return { width: u24(24) + 1, height: u24(27) + 1 };
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

// Liefert eine Liste deutscher Fehlermeldungen (leer = gültig).
//  • contentEntries: gebaute Content-Einträge (mit id/image)
//  • readAsset(path): Bytes einer Datei relativ zum Repo
//  • listAssets(): Dateinamen in assets/games/
export function validateImageManifest(manifest, { contentEntries = [], readAsset, listAssets } = {}) {
  const errors = [];
  const err = msg => errors.push(msg);
  if (!manifest || typeof manifest !== 'object') return ['Manifest fehlt oder ist kein Objekt'];

  const builtins = Array.isArray(manifest.builtins) ? manifest.builtins : [];
  const community = Array.isArray(manifest.communityTestIds) ? manifest.communityTestIds : [];
  if (builtins.length !== EXPECTED_BUILTIN_COUNT) {
    err(`Manifest enthält ${builtins.length} Built-ins, erwartet ${EXPECTED_BUILTIN_COUNT}`);
  }

  const content = new Map(contentEntries.map(c => [c.id, c]));
  const seen = new Set();
  for (const e of builtins) {
    const id = e?.id;
    if (!isValidImageKey(id)) { err(`Ungültige Built-in-ID im Manifest: "${id}"`); continue; }
    if (seen.has(id)) err(`Built-in-ID doppelt im Manifest: "${id}"`);
    seen.add(id);
    if (e.file !== imagePathForKey(id)) err(`${id}: Pfad muss "${imagePathForKey(id)}" sein, ist "${e.file}"`);
    const entry = content.get(id);
    if (!entry) err(`${id}: keine passende Datei content/games/${id}.md`);
    else if (entry.image !== imagePathForKey(id)) err(`${id}: content/games/${id}.md verweist nicht auf ${imagePathForKey(id)} (imageKey fehlt?)`);
    if (!/^[0-9a-f]{64}$/.test(e.promptHash || '') || sha256(promptFor(manifest, e)) !== e.promptHash) {
      err(`${id}: promptHash passt nicht zu Stilprompt + Szene`);
    }
    if (!readAsset || e.file !== imagePathForKey(id)) continue;
    let bytes;
    try { bytes = readAsset(e.file); } catch { err(`${id}: Datei ${e.file} fehlt`); continue; }
    if (bytes.length !== e.byteSize) err(`${id}: Dateigröße ${bytes.length} ≠ Manifest ${e.byteSize}`);
    if (sha256(bytes) !== e.sha256) err(`${id}: SHA-256 stimmt nicht mit dem Manifest überein`);
    const dim = webpDimensions(bytes);
    if (!dim) err(`${id}: ${e.file} ist kein gültiges WebP`);
    else if (dim.width !== DIMENSIONS.width || dim.height !== DIMENSIONS.height
      || e.width !== dim.width || e.height !== dim.height) {
      err(`${id}: Abmessungen ${dim.width}×${dim.height} statt ${DIMENSIONS.width}×${DIMENSIONS.height}`);
    }
  }

  const communityIds = community.map(e => e?.id);
  if (JSON.stringify(communityIds) !== JSON.stringify(COMMUNITY_TEST_IDS)) {
    err(`Community-Test-IDs müssen genau ${COMMUNITY_TEST_IDS.join(', ')} sein, sind ${communityIds.join(', ') || '(keine)'}`);
  }
  for (const e of community) {
    if (e?.bundled !== false || 'file' in (e || {})) err(`${e?.id}: Community-Test-Bild muss nicht gebündelt sein (bundled: false, kein file)`);
    if (sha256(promptFor(manifest, e)) !== e?.promptHash) err(`${e?.id}: promptHash passt nicht zu Stilprompt + Szene`);
  }

  if (listAssets) {
    const expected = new Set([MANIFEST_FILE, ...builtins.map(e => `${e?.id}.webp`)]);
    for (const f of listAssets()) {
      if (!expected.has(f)) err(`assets/games/${f} ist nicht im Manifest (nur Manifest-WebPs erlaubt)`);
    }
  }
  return errors;
}
