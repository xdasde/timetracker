# Spielbilder (Built-in & Community)

Bilder sind in der App immer optional. Das Emoji-`icon` eines Spiels bleibt die
stabile Rückfallebene. Logik und Sicherheitsregeln stehen in
[`js/gameimages.js`](../js/gameimages.js); der Content-Build
([`scripts/build-content.mjs`](../scripts/build-content.mjs)) verwendet dieselben
Funktionen. Tests: [`test/gameimages.test.mjs`](../test/gameimages.test.mjs).

## Nachlieferung der GPT-Bilder für Built-in-Spiele

Die 64 generierten Bilder gehören ausschließlich ins Repository. Sie werden
**nicht** in die Google-Tabelle eingetragen: Die Tabs `Games` und `Ratings`
sind nur für Community-Spiele und Bewertungen da, Built-ins kommen allein aus
`content/games/*.md`.

Vor dem Start prüfen, dass jedes Bild genau einem Eintrag in `content/games/`
zugeordnet ist (`ls content/games | wc -l`). Bilder ohne passende
Markdown-Datei werden nicht eingebunden.

Pro Spiel `<id>` (entspricht dem Dateinamen `content/games/<id>.md`):

1. **Datei ablegen:** `assets/games/<id>.webp`
   - Dateiname nur `a-z`, `0-9` und einzelne `-` (z. B. `ball-ueber-die-schnur.webp`).
   - Echtes WebP (die Endung muss zu den Magic Bytes passen; umbenannte
     PNG/SVG/HTML-Dateien lehnt der Build ab). PNG/JPEG/AVIF gehen auch, dann
     aber über ein explizites `image:` (siehe unten).
   - Höchstens **400 KB** pro Datei. Kein SVG, kein Base64, keine Unterordner.
2. **Markdown ergänzen** (Frontmatter von `content/games/<id>.md`):

   ```yaml
   imageKey: burgball
   imageAlt: Zwei Kinderteams werfen einen Softball auf einen umgedrehten Kasten
   ```

   - `imageKey` ergibt automatisch `assets/games/<imageKey>.webp`.
   - Alternativ `image: assets/games/<name>.(webp|png|jpg|jpeg|avif)`, das hat
     Vorrang vor `imageKey`. Absolute URLs, `http(s):`, `data:`, `..`,
     Query/Hash und SVG sind verboten.
   - `imageAlt` beschreibt kurz, was zu sehen ist (max. 120 Zeichen, wird
     gekürzt). Ohne `imageAlt` nutzt die App „Illustration: <Name>“.
     `imageAlt` ohne `imageKey`/`image` ist ein Fehler.
   - `imageKey` erst setzen, wenn die Datei im Repo liegt – ein Verweis auf eine
     fehlende Datei lässt den Build scheitern.
3. **Prüfen:**

   ```bash
   npm run validate:content   # prüft Frontmatter, Datei, Größe, Format; Bundle aktuell?
   npm test                   # u. a. test/gameimages.test.mjs
   ```

   Meldet `validate:content`, dass `js/content.generated.js` veraltet ist,
   `npm run build:content` ausführen und erneut prüfen.
4. **Service Worker:** Bilder unter `assets/games/` werden nach dem ersten Laden
   cache-first ausgeliefert. Wird ein bereits veröffentlichtes Bild unter
   gleichem Namen **ersetzt**, muss `CACHE` in `service-worker.js` erhöht werden,
   sonst sehen Bestandsnutzer weiter das alte Bild. Für neu hinzugefügte Dateien
   ist das nicht nötig.

Teillieferungen sind möglich: Spiele ohne Bildfelder bleiben im Bundle
unverändert und zeigen weiter ihr Icon.

## Fallback-Verhalten

- Kein gültiges Bild (fehlende Felder, ungültiger Pfad, nicht freigegeben) →
  es wird gar kein `<img>` erzeugt; Listen zeigen das Emoji-Icon.
- Bild schlägt beim Laden fehl (404, kaputt, offline und nicht im Cache) →
  genau ein Rückfall ohne Endlosschleife:
  - Liste/Datenbank (`fallback: 'icon'`): `<img>` wird durch das Icon ersetzt.
  - Detail-Hero und Roulette (`fallback: 'remove'`): Die Bildfläche wird
    entfernt, im Roulette wird das Icon wieder eingeblendet.
  - Hängt das Bild nicht mehr im Dokument (z. B. neues Roulette-Ergebnis),
    passiert nichts.
- Eigene Spiele (`custom`) zeigen nie ein Bild.
- Bilder laden `lazy` (Roulette `eager`), `decoding="async"`, mit
  `referrerpolicy="no-referrer"`.
- Offline: Nur bereits einmal geladene Built-in-Bilder sind verfügbar (sie
  werden nicht vorab gecacht). Community-Bilder liegen auf fremden Hosts, der
  Service Worker cacht sie nicht.

## Community-Statusvertrag

Bildfelder vergibt ausschließlich der Server. Die App sendet beim Einreichen
nie `image`, `imageAlt` oder `imageStatus` mit.

Eine Server-Zeile darf liefern:

| Feld          | Bedeutung                                                   |
|---------------|-------------------------------------------------------------|
| `image` (alternativ `imageUrl`) | absolute `https:`-URL, ohne Zugangsdaten, kein SVG, max. 2048 Zeichen |
| `imageAlt`    | Alternativtext, max. 120 Zeichen                            |
| `imageStatus` | `approved` \| `pending` \| `blocked` \| `revoked`           |

- Nur `imageStatus: approved` (Groß-/Kleinschreibung egal) **und** eine gültige
  HTTPS-URL führen zur Anzeige.
- `pending`, `blocked`, `revoked`, leer oder unbekannt → das Bild wird komplett
  verworfen (`image`, `imageAlt`, `imageStatus` = `null`); das Spiel selbst
  bleibt sichtbar.
- Beim Rendern wird erneut geprüft (defense in depth): Community-Einträge
  zeigen nur `approved` + HTTPS, niemals lokale `assets/games/`-Pfade.
- Entzug eines Bildes: Status auf `revoked` oder `blocked` setzen. Die App
  übernimmt das beim nächsten Community-Refresh; es gibt keinen lokalen Cache,
  der ein entzogenes Bild weiter anzeigt.

## Offene Betreiberentscheidungen

Der Client-Vertrag ist umgesetzt, das Apps Script
(`scripts/google-apps-script/Code.gs`) liefert derzeit aber **keine**
Bildfelder. Bis zu folgenden Entscheidungen zeigen Community-Spiele nur Icons:

- **Speicherort/Drive:** Wo liegen Community-Bilder (Google Drive, eigener
  Bucket/CDN)? Drive-Freigabelinks sind oft keine direkten Bild-URLs, leiten um
  oder werden gedrosselt; benötigt wird eine stabile, direkt ladbare HTTPS-URL.
- **Ingest:** Wie kommen Bilder zum Server (Upload im Formular, Einsendung per
  Mail, nur Betreiber)? Dabei serverseitig Format per Magic Bytes, Größe und
  Abmessungen prüfen, Metadaten (EXIF/GPS) entfernen, nur WebP/PNG/JPEG/AVIF.
- **Moderation:** Wer setzt `approved`/`blocked`/`revoked`, in welcher Spalte
  von `Games` oder in einem eigenen Tab, mit welcher Reaktionszeit? Regeln für
  erkennbare Personen/Kinder, Logos und Texte im Bild.
- **Provenienz/Rechte:** Für die GPT-Bilder und Community-Uploads festhalten,
  woher ein Bild stammt (Modell/Prompt/Datum bzw. Uploader), unter welcher
  Lizenz es genutzt wird und ob KI-generierte Bilder gekennzeichnet werden.
  Aktuell gibt es dafür kein Feld im Schema.
