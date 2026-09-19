// Tests für die reinen Bildfunktionen (Built-ins, Community, Format-Sniffing).
// Bewusst ohne Abhängigkeiten – `node --test` genügt.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILTIN_IMAGE_DIR, MAX_IMAGE_ALT,
  isValidImageKey, normalizeBuiltinImagePath, imagePathForKey,
  resolveBuiltinImageFields, sniffImageType, extensionMatchesType,
  safeHttpsImageUrl, normalizeCommunityImage, displayImageFor, imageAltFor,
  COMMUNITY_IMAGE_MIME_TYPES, MAX_COMMUNITY_IMAGE_BYTES, COMMUNITY_IMAGE_UPLOAD_ENABLED,
  validateCommunityImageFile, communityImageNotice, createGameVisual,
} from '../js/gameimages.js';

const bytes = (...parts) => Uint8Array.from(parts.flatMap(p =>
  typeof p === 'string' ? Array.from(p, c => c.charCodeAt(0)) : p));
const pad = (arr, len = 16) => Uint8Array.from([...arr, ...new Array(Math.max(0, len - arr.length)).fill(0)]);

const HTTPS_IMG = 'https://images.example.org/spiele/burgball.webp';

// ── Lokale imageKey-/Pfad-Validierung ─────────────────────────────────────────

test('isValidImageKey akzeptiert nur kebab-case aus a-z und 0-9', () => {
  for (const key of ['burgball', 'ball-ueber-die-schnur', 'atom2', 'a']) {
    assert.equal(isValidImageKey(key), true, key);
  }
  for (const key of ['', 'Burgball', 'burg_ball', '-burg', 'burg-', 'burg--ball',
    'burgball.webp', '../burgball', 'burg ball', 'bällebad', null, undefined, 42]) {
    assert.equal(isValidImageKey(key), false, String(key));
  }
});

test('imagePathForKey baut assets/games/<key>.webp und lehnt Unbekanntes ab', () => {
  assert.equal(imagePathForKey('burgball'), `${BUILTIN_IMAGE_DIR}burgball.webp`);
  assert.equal(imagePathForKey('burgball', 'png'), 'assets/games/burgball.png');
  assert.equal(imagePathForKey('burgball', 'svg'), null);
  assert.equal(imagePathForKey('../burgball'), null);
  assert.equal(imagePathForKey('Burgball'), null);
});

test('normalizeBuiltinImagePath erlaubt nur lokale Pfade unter assets/games/', () => {
  assert.equal(normalizeBuiltinImagePath('assets/games/burgball.webp'), 'assets/games/burgball.webp');
  assert.equal(normalizeBuiltinImagePath('./assets/games/burgball.png'), 'assets/games/burgball.png');
  assert.equal(normalizeBuiltinImagePath('  assets/games/burgball.jpeg '), 'assets/games/burgball.jpeg');
  for (const ext of ['jpg', 'avif']) {
    assert.equal(normalizeBuiltinImagePath(`assets/games/x.${ext}`), `assets/games/x.${ext}`);
  }
  for (const path of [
    '/assets/games/burgball.webp',
    'assets/games/../icons/burgball.webp',
    'assets/games/sub/burgball.webp',
    'assets/icons/burgball.webp',
    'assets/games/burgball.webp?v=2',
    'assets/games/burgball.webp#x',
    'assets/games/Burgball.webp',
    'assets/games/burgball.WEBP',
    'assets/games/burgball.gif',
    'assets/games/burgball',
    null, undefined, {},
  ]) {
    assert.equal(normalizeBuiltinImagePath(path), null, String(path));
  }
});

test('resolveBuiltinImageFields leitet den Pfad aus imageKey ab', () => {
  const r = resolveBuiltinImageFields({ imageKey: 'burgball', imageAlt: '  Kinder   werfen auf eine Burg ' });
  assert.deepEqual(r, {
    image: 'assets/games/burgball.webp',
    imageKey: 'burgball',
    imageAlt: 'Kinder werfen auf eine Burg',
    errors: [],
  });
});

test('resolveBuiltinImageFields: expliziter image-Pfad hat Vorrang vor imageKey', () => {
  const r = resolveBuiltinImageFields({ imageKey: 'burgball', image: 'assets/games/burgball.png' });
  assert.equal(r.image, 'assets/games/burgball.png');
  assert.equal(r.imageKey, 'burgball');
  assert.deepEqual(r.errors, []);
});

test('resolveBuiltinImageFields: ohne Bildfelder bleibt alles leer und fehlerfrei', () => {
  assert.deepEqual(resolveBuiltinImageFields({}), { image: null, imageKey: null, imageAlt: null, errors: [] });
  assert.deepEqual(resolveBuiltinImageFields(), { image: null, imageKey: null, imageAlt: null, errors: [] });
});

test('resolveBuiltinImageFields meldet ungültigen imageKey und verwaistes imageAlt', () => {
  const bad = resolveBuiltinImageFields({ imageKey: 'Burg Ball' });
  assert.equal(bad.image, null);
  assert.equal(bad.imageKey, null);
  assert.equal(bad.errors.length, 1);
  assert.match(bad.errors[0], /imageKey/);

  const orphan = resolveBuiltinImageFields({ imageAlt: 'Beschreibung ohne Bild' });
  assert.equal(orphan.image, null);
  assert.match(orphan.errors[0], /imageAlt/);
});

test('resolveBuiltinImageFields kürzt imageAlt auf MAX_IMAGE_ALT Zeichen', () => {
  const r = resolveBuiltinImageFields({ imageKey: 'burgball', imageAlt: 'x'.repeat(MAX_IMAGE_ALT + 50) });
  assert.equal(r.imageAlt.length, MAX_IMAGE_ALT);
  assert.equal(resolveBuiltinImageFields({ imageKey: 'burgball', imageAlt: '   ' }).imageAlt, null);
});

// ── Verbotene Pfade: data:, SVG, HTTP(S) ──────────────────────────────────────

test('resolveBuiltinImageFields verbietet data:-Bilder', () => {
  for (const image of ['data:image/png;base64,iVBORw0KGgo=', ' DATA:image/webp;base64,UklGRg== ']) {
    const r = resolveBuiltinImageFields({ image });
    assert.equal(r.image, null);
    assert.match(r.errors[0], /data:/);
  }
});

test('resolveBuiltinImageFields verbietet SVG-Dateien', () => {
  for (const image of ['assets/games/burgball.svg', 'assets/games/burgball.SVGZ', 'https://cdn.example.org/a.svg']) {
    const r = resolveBuiltinImageFields({ image });
    assert.equal(r.image, null, image);
    assert.match(r.errors[0], /SVG/, image);
  }
});

test('resolveBuiltinImageFields verbietet externe HTTP-/HTTPS-URLs für Built-ins', () => {
  for (const image of [
    'http://example.org/assets/games/burgball.webp',
    'https://example.org/assets/games/burgball.webp',
    '//example.org/assets/games/burgball.webp',
    'javascript:alert(1)',
  ]) {
    const r = resolveBuiltinImageFields({ image });
    assert.equal(r.image, null, image);
    assert.match(r.errors[0], /lokaler Pfad/, image);
  }
});

test('safeHttpsImageUrl lässt nur saubere HTTPS-URLs ohne SVG durch', () => {
  assert.equal(safeHttpsImageUrl(HTTPS_IMG), HTTPS_IMG);
  assert.equal(safeHttpsImageUrl(`  ${HTTPS_IMG}  `), HTTPS_IMG);
  for (const url of [
    'http://images.example.org/a.webp',
    'data:image/png;base64,iVBORw0KGgo=',
    'javascript:alert(1)',
    'https://user:pw@images.example.org/a.webp',
    'https://images.example.org/a.svg',
    'https://images.example.org/a.SVGZ',
    'https://images.example.org/a b.webp',
    'assets/games/burgball.webp',
    `https://images.example.org/${'a'.repeat(2100)}.webp`,
    '', null, 42,
  ]) {
    assert.equal(safeHttpsImageUrl(url), null, String(url).slice(0, 60));
  }
});

// ── Community: approved HTTPS vs. pending/blocked/revoked ────────────────────

test('normalizeCommunityImage übernimmt ein freigegebenes HTTPS-Bild', () => {
  assert.deepEqual(
    normalizeCommunityImage({ image: HTTPS_IMG, imageAlt: ' Burg  aus Kästen ', imageStatus: 'approved' }),
    { image: HTTPS_IMG, imageAlt: 'Burg aus Kästen', imageStatus: 'approved' },
  );
  // Alternativer Feldname und Groß-/Kleinschreibung des Status.
  assert.deepEqual(
    normalizeCommunityImage({ imageUrl: HTTPS_IMG, imageStatus: ' APPROVED ' }),
    { image: HTTPS_IMG, imageAlt: null, imageStatus: 'approved' },
  );
});

test('normalizeCommunityImage verwirft Bilder mit pending/blocked/revoked/leerem Status', () => {
  const none = { image: null, imageAlt: null, imageStatus: null };
  for (const imageStatus of ['pending', 'blocked', 'revoked', '', null, undefined, 'approved-ish', 'ok']) {
    assert.deepEqual(
      normalizeCommunityImage({ image: HTTPS_IMG, imageAlt: 'Alt', imageStatus }),
      none,
      String(imageStatus),
    );
  }
  assert.deepEqual(normalizeCommunityImage(null), none);
  assert.deepEqual(normalizeCommunityImage('approved'), none);
});

test('normalizeCommunityImage verwirft auch freigegebene, aber unsichere URLs', () => {
  const none = { image: null, imageAlt: null, imageStatus: null };
  for (const image of ['http://images.example.org/a.webp', 'https://images.example.org/a.svg',
    'data:image/png;base64,iVBORw0KGgo=', 'assets/games/burgball.webp']) {
    assert.deepEqual(normalizeCommunityImage({ image, imageStatus: 'approved' }), none, image);
  }
});

test('displayImageFor: Community nur approved + HTTPS, Built-ins nur lokal, eigene Spiele nie', () => {
  assert.equal(displayImageFor({ community: true, image: HTTPS_IMG, imageStatus: 'approved' }), HTTPS_IMG);
  for (const imageStatus of ['pending', 'blocked', 'revoked', null]) {
    assert.equal(displayImageFor({ community: true, image: HTTPS_IMG, imageStatus }), null, String(imageStatus));
  }
  // Community darf kein lokales Built-in-Bild „ausleihen“.
  assert.equal(displayImageFor({ community: true, image: 'assets/games/burgball.webp', imageStatus: 'approved' }), null);

  assert.equal(displayImageFor({ image: 'assets/games/burgball.webp' }), 'assets/games/burgball.webp');
  assert.equal(displayImageFor({ image: HTTPS_IMG }), null);
  assert.equal(displayImageFor({ image: 'data:image/png;base64,iVBORw0KGgo=' }), null);
  assert.equal(displayImageFor({ custom: true, image: 'assets/games/burgball.webp' }), null);
  assert.equal(displayImageFor({ name: 'Ohne Bild' }), null);
  assert.equal(displayImageFor(null), null);
});

test('imageAltFor nutzt imageAlt, sonst den Namen, sonst einen Standardtext', () => {
  assert.equal(imageAltFor({ imageAlt: 'Burg aus Kästen', name: 'Burgball' }), 'Burg aus Kästen');
  assert.equal(imageAltFor({ name: 'Burgball' }), 'Illustration: Burgball');
  assert.equal(imageAltFor({}), 'Spielillustration');
  assert.equal(imageAltFor(null), 'Spielillustration');
});

// ── sniffImageType ────────────────────────────────────────────────────────────

test('sniffImageType erkennt PNG, JPEG, WebP und AVIF an den Magic Bytes', () => {
  assert.equal(sniffImageType(pad(bytes([0x89], 'PNG\r\n', [0x1a, 0x0a]))), 'png');
  assert.equal(sniffImageType(pad(bytes([0xff, 0xd8, 0xff, 0xe0]))), 'jpeg');
  assert.equal(sniffImageType(pad(bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '))), 'webp');
  assert.equal(sniffImageType(pad(bytes([0, 0, 0, 0x1c], 'ftypavif'))), 'avif');
  assert.equal(sniffImageType(pad(bytes([0, 0, 0, 0x1c], 'ftypavis'))), 'avif');
  // Funktioniert auch mit Node-Buffern (wie im Content-Build).
  assert.equal(sniffImageType(Buffer.from(pad(bytes('RIFF', [0, 0, 0, 0], 'WEBP')))), 'webp');
});

test('sniffImageType lehnt SVG, HTML, andere Formate und zu kurze Daten ab', () => {
  for (const [label, data] of [
    ['svg', bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
    ['xml', bytes('<?xml version="1.0"?><svg/>')],
    ['html', bytes('<!DOCTYPE html><html>')],
    ['gif', pad(bytes('GIF89a'))],
    ['riff-wav', pad(bytes('RIFF', [0, 0, 0, 0], 'WAVE'))],
    ['heic', pad(bytes([0, 0, 0, 0x18], 'ftypheic'))],
    ['kurz', bytes([0x89], 'PNG')],
    ['leer', new Uint8Array(0)],
  ]) {
    assert.equal(sniffImageType(data), null, label);
  }
  assert.equal(sniffImageType(null), null);
  assert.equal(sniffImageType(undefined), null);
});

test('extensionMatchesType prüft Endung gegen erkanntes Format (jpg = jpeg)', () => {
  assert.equal(extensionMatchesType('assets/games/a.webp', 'webp'), true);
  assert.equal(extensionMatchesType('assets/games/a.jpg', 'jpeg'), true);
  assert.equal(extensionMatchesType('assets/games/a.JPEG', 'jpeg'), true);
  assert.equal(extensionMatchesType('assets/games/a.webp', 'png'), false);
  assert.equal(extensionMatchesType('assets/games/a.png', null), false);
});

// ── Community-Drive-URLs aus dem GameImages-Vertrag ───────────────────────────

test('normalizeCommunityImage übernimmt freigegebene Drive-Thumbnail-URLs aus dem Apps Script', () => {
  const url = 'https://drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345&sz=w1200';
  assert.deepEqual(
    normalizeCommunityImage({ image: url, imageAlt: 'Kinder am Kasten', imageStatus: 'approved' }),
    { image: url, imageAlt: 'Kinder am Kasten', imageStatus: 'approved' },
  );
  // Bilddaten statt URL (z. B. versehentlich in der Games-Zeile) werden verworfen.
  assert.equal(normalizeCommunityImage({ image: 'data:image/webp;base64,UklGRg==', imageStatus: 'approved' }).image, null);
});

// ── Optionaler Community-Bildupload (Client-Prüfung) ─────────────────────────

const WEBP_HEAD = pad(bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '));
const PNG_HEAD = pad(bytes([0x89], 'PNG\r\n', [0x1a, 0x0a]));
const JPEG_HEAD = pad(bytes([0xff, 0xd8, 0xff, 0xe0]));
const file = (type, size, name = 'bild') => ({ type, size, name });

test('Community-Upload: Limits sind klar definiert (WebP/PNG/JPEG, max. 2 MB, Upload serverseitig aus)', () => {
  assert.deepEqual(COMMUNITY_IMAGE_MIME_TYPES, ['image/webp', 'image/png', 'image/jpeg']);
  assert.equal(MAX_COMMUNITY_IMAGE_BYTES, 2 * 1024 * 1024);
  assert.equal(COMMUNITY_IMAGE_UPLOAD_ENABLED, false);
});

test('validateCommunityImageFile akzeptiert passende WebP-, PNG- und JPEG-Dateien', () => {
  assert.deepEqual(validateCommunityImageFile(file('image/webp', 120_000, 'a.webp'), WEBP_HEAD), { ok: true, type: 'webp', error: null });
  assert.deepEqual(validateCommunityImageFile(file('image/png', 5_000, 'a.png'), PNG_HEAD), { ok: true, type: 'png', error: null });
  assert.deepEqual(validateCommunityImageFile(file('image/jpeg', MAX_COMMUNITY_IMAGE_BYTES, 'a.jpg'), JPEG_HEAD), { ok: true, type: 'jpeg', error: null });
});

test('validateCommunityImageFile lehnt leere, zu große, falsche und getarnte Dateien verständlich ab', () => {
  const cases = [
    [null, WEBP_HEAD, /Keine Datei/],
    [file('image/webp', 0), WEBP_HEAD, /leer/],
    [file('image/webp', MAX_COMMUNITY_IMAGE_BYTES + 1), WEBP_HEAD, /2 MB/],
    [file('image/svg+xml', 900, 'a.svg'), bytes('<svg xmlns="http://www.w3.org/2000/svg">'), /WebP, PNG oder JPEG/],
    [file('image/gif', 900, 'a.gif'), pad(bytes('GIF89a')), /WebP, PNG oder JPEG/],
    [file('image/heic', 900, 'a.heic'), pad(bytes([0, 0, 0, 0x18], 'ftypheic')), /WebP, PNG oder JPEG/],
    // Umbenannte Datei: MIME/Endung sagt PNG, Inhalt ist SVG/HTML.
    [file('image/png', 900, 'a.png'), bytes('<svg xmlns="http://www.w3.org/2000/svg">'), /Inhalt/],
    // MIME und Magic Bytes widersprechen sich.
    [file('image/png', 900, 'a.png'), WEBP_HEAD, /Inhalt/],
    [file('image/webp', 900, 'a.svg'), WEBP_HEAD, /SVG/],
  ];
  for (const [f, head, re] of cases) {
    const r = validateCommunityImageFile(f, head);
    assert.equal(r.ok, false, JSON.stringify(f));
    assert.equal(r.type, null);
    assert.match(r.error, re, JSON.stringify(f));
  }
});

test('communityImageNotice erklärt, dass ohne sicheren Upload-Weg nur ohne Bild gesendet wird', () => {
  assert.equal(communityImageNotice(false), '');
  const msg = communityImageNotice(true);
  assert.match(msg, /ohne Bild/);
  assert.match(msg, /Icon/);
});

// ── DOM-Fallback (mit minimalem Fake-DOM) ─────────────────────────────────────

function fakeDoc() {
  class Node {
    constructor(tag) {
      this.tagName = tag; this.parentNode = null; this.children = []; this.attrs = {};
      this.listeners = {}; this.textContent = ''; this.className = '';
    }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); }
    emit(t) { [...(this.listeners[t] || [])].forEach(fn => fn()); }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; }
    replaceChild(n, o) { this.children = this.children.map(x => (x === o ? n : x)); n.parentNode = this; o.parentNode = null; return o; }
  }
  return { createElement: tag => new Node(tag) };
}

test('createGameVisual: Built-in-Bild mit Alt-Text, lazy, no-referrer', () => {
  const doc = fakeDoc();
  const img = createGameVisual({ name: 'Burgball', icon: '🏰', image: 'assets/games/burgball.webp', imageAlt: 'Burg aus Kästen' }, { doc });
  assert.equal(img.tagName, 'img');
  assert.equal(img.src, 'assets/games/burgball.webp');
  assert.equal(img.alt, 'Burg aus Kästen');
  assert.equal(img.loading, 'lazy');
  assert.equal(img.referrerPolicy, 'no-referrer');
});

test('createGameVisual: ohne gültiges Bild sofort Icon bzw. nichts – nie ein <img>', () => {
  const doc = fakeDoc();
  for (const entry of [
    { icon: '🏰' },
    { icon: '🏰', image: 'https://evil.example/x.webp' },
    { icon: '🏰', custom: true, image: 'assets/games/burgball.webp' },
    { icon: '🏰', community: true, image: HTTPS_IMG, imageStatus: 'pending' },
  ]) {
    const icon = createGameVisual(entry, { doc, iconClass: 'x-icon' });
    assert.equal(icon.tagName, 'span');
    assert.equal(icon.textContent, '🏰');
    assert.equal(icon.className, 'x-icon');
    assert.equal(createGameVisual(entry, { doc, fallback: 'remove' }), null);
  }
});

test('createGameVisual: Ladefehler fällt genau einmal auf das Icon zurück', () => {
  const doc = fakeDoc();
  const parent = doc.createElement('div');
  let calls = 0;
  const img = createGameVisual({ icon: '🏰', image: 'assets/games/burgball.webp' }, {
    doc, iconClass: 'rules-item-icon', onFallback: () => { calls++; },
  });
  parent.appendChild(img);
  img.emit('error');
  img.emit('error');
  assert.equal(calls, 1);
  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0].tagName, 'span');
  assert.equal(parent.children[0].textContent, '🏰');
});

test('createGameVisual: fallback "remove" entfernt die Fläche, abgehängte Bilder bleiben unberührt', () => {
  const doc = fakeDoc();
  const parent = doc.createElement('div');
  const img = createGameVisual({ icon: '🏰', image: 'assets/games/burgball.webp' }, { doc, fallback: 'remove', eager: true });
  assert.equal(img.loading, 'eager');
  parent.appendChild(img);
  img.emit('error');
  assert.equal(parent.children.length, 0);

  let calls = 0;
  const detached = createGameVisual({ icon: '🏰', image: 'assets/games/burgball.webp' }, { doc, onFallback: () => { calls++; } });
  detached.emit('error');
  assert.equal(calls, 0);
});
