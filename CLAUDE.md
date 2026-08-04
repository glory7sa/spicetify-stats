# Spicetify Stats – Custom App

Eine Spicetify Custom App, die die eigene Hörhistorie lokal mitloggt und als
Statistik-Dashboard darstellt (Top-Artists, Top-Tracks, Hör-Heatmap).

Passt optisch zu meinem Theme `kpop-theme` und meiner Extension `Zen-Mode`.

## Harte Constraints – nicht verhandelbar

- **Kein Build-Step.** Kein npm, kein package.json, kein Vite, kein Webpack,
  kein TypeScript, kein Bundler. Spicetify lädt die `.js`-Dateien direkt.
- **Kein JSX.** Custom Apps unterstützen kein JSX. React-Elemente werden
  ausschliesslich mit `Spicetify.React.createElement(...)` erzeugt.
- **Keine externen Abhängigkeiten.** Keine npm-Pakete, keine CDN-Imports,
  keine externen Bilder. Spotify hat eine strikte CSP, die externe und
  Data-URI-Ressourcen blockiert. Alle Grafiken als **Inline-SVG** bauen.
- **`index.js` muss eine globale Funktion `render()` enthalten**, die ein
  React-Element zurückgibt. Das ist der Einstiegspunkt.
- React kommt von `Spicetify.React` / `Spicetify.ReactDOM`, nicht aus einem
  Import.

## Dateistruktur

```
stats/
├── manifest.json     # name, icon, active-icon, subfiles, subfiles_extension
├── index.js          # App-UI, muss render() exportieren
├── extension.js      # Daten-Collector, läuft beim Spotify-Start
├── style.css         # Styles
└── src/              # optionale weitere JS-Dateien (via "subfiles")
```

`manifest.json` – Pflichtkeys:

```json
{
  "name": "Stats",
  "icon": "<svg ...></svg>",
  "active-icon": "<svg ...></svg>",
  "subfiles": ["src/charts.js"],
  "subfiles_extension": ["extension.js"]
}
```

- `subfiles` werden in der angegebenen Reihenfolge mit `index.js`
  zusammenkonkateniert und teilen sich denselben Scope.
- `subfiles_extension` darf **nicht** in einem Unterordner liegen.
- Die SVG-Markup in `icon` / `active-icon` muss escaped sein.

## Architektur

Die App läuft nur, wenn sie in der Sidebar geöffnet wird. Das Mitloggen muss
aber permanent laufen. Deshalb strikte Trennung:

**`extension.js` (Collector)**
- Wartet in einer Schleife, bis `Spicetify.Player` und `Spicetify.showNotification`
  verfügbar sind.
- `Spicetify.Player.addEventListener("songchange", ...)` als Hook.
- Zählt einen Track erst als "gehört", wenn er zu einem sinnvollen Anteil
  gespielt wurde (z. B. 30 Sekunden oder 50 % der Länge) – sonst verfälschen
  Skips die Statistik.
- Schreibt nach `localStorage`.

**`index.js` (Viewer)**
- Liest ausschliesslich aus `localStorage`, sammelt selbst keine Daten.
- Aggregiert und rendert.

**Wichtig:** Die beiden teilen sich keine Variablen und keinen Scope.
`localStorage` ist die einzige Brücke zwischen ihnen.

## Datenhaltung

- Rohe Play-Events und vorberechnete Aggregate in getrennten Keys ablegen,
  damit die App beim Öffnen nicht jedes Mal alles neu durchrechnen muss.
- Key-Präfix `spicetify-stats:` verwenden.
- Auf Grösse achten: `localStorage` ist begrenzt. Events älter als X Monate
  in ein Monats-Aggregat zusammenfassen und die Rohdaten verwerfen.
- Schema versionieren (`spicetify-stats:version`), damit spätere Änderungen
  migrierbar sind.

## Styling

- An Spotifys Semantic Colors halten: `--spice-text`, `--spice-subtext`,
  `--spice-player`, `--spice-card`, `--spice-button`, `--spice-highlight`.
  Dadurch passt sich die App automatisch an das aktive Theme an.
- Alle Diagramme als handgebautes Inline-SVG, keine Chart-Library.
- `prefers-reduced-motion` respektieren – dekorative Animationen dann aus.
- Klassennamen mit `stats-` präfixen, um Kollisionen mit Spotify-CSS zu
  vermeiden.

## Nützliche Spicetify-APIs

- `Spicetify.Player` – Events, `data.item` mit Track-Metadaten
- `Spicetify.Platform.History` – Routing für Unterseiten der App
- `Spicetify.CosmosAsync` / `Spicetify.GraphQL` – interne Spotify-Endpoints
- `Spicetify.showNotification(text)` – Toast
- `Spicetify.SVGIcons` – vorhandene Spotify-Icons

Bei allem, was auf interne Endpoints zugreift: immer defensiv programmieren
und einen Fallback vorsehen. Diese Endpoints ändern sich ohne Vorwarnung.
Audio-Features (BPM, Energy, Valence) sind stark eingeschränkt – nicht als
Kernfeature einplanen.

## Entwicklungs-Workflow

- Änderungen werden erst nach `spicetify apply` wirksam, weil die Dateien
  dabei in den Spotify-Ordner kopiert werden.
- Debugging über die Spotify-DevTools.
- Keine `console.log`-Reste im finalen Code.

## Sprache

Kommentare und Commit-Messages auf Englisch, README auf Englisch
(Portfolio-Projekt). Kommunikation mit mir auf Deutsch.
