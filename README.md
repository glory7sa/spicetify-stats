# Stats

A [Spicetify](https://spicetify.app) custom app that logs what you listen to,
locally, and turns it into a dashboard: top artists, top tracks, and a
GitHub-style listening heatmap over 7, 30 or 90 days, or your whole history.

Nothing is uploaded anywhere. The listening log lives in Spotify's own
`localStorage` and never leaves the machine.

## Install

Copy this folder to your Spicetify `CustomApps` directory, register it, and
apply:

```bash
spicetify config custom_apps stats
spicetify apply
```

Restart Spotify afterwards. The collector is registered through the app's
manifest, so it starts with Spotify whether or not the app is open — the
dashboard only shows what the collector already wrote.

To remove it again:

```bash
spicetify config custom_apps stats-
spicetify apply
```

## How a play is counted

A track counts once it has actually been listened to: **30 seconds, or half
its length for anything shorter**, whichever comes first. Skipping through a
playlist therefore produces no entries at all.

Listened time is measured from the player's own playback position, clamped to
the elapsed wall-clock time. Pausing does not accumulate time, seeking forward
is not counted as listening, and neither suspending the machine nor a
throttled timer distorts the number.

Deliberately **not** counted: podcast episodes, local files and ads.

A repeated track counts again — an hour on loop is an hour of listening — but
only after a full threshold of genuinely new playback. Spotify sometimes fires
its `songchange` event more than once for the same track, and those duplicates
cannot inflate the count.

The play is written the moment the threshold is crossed, not when the track
ends, so quitting Spotify mid-track cannot lose a play that already counted.

## Importing Spotify's data export

Spotify will send you your own listening history on request (Privacy Settings
in your account). The card at the bottom of the dashboard reads both shapes it
comes in:

| Export | Covers | Track links |
| --- | --- | --- |
| Extended streaming history | everything | yes |
| Account data | last 12 months | no |

Plays already in storage are recognised and skipped, both by an exact
timestamp match and by seeing the same track within about ten minutes — the
collector timestamps a play when its threshold is crossed, while the export
timestamps it when playback ended, so the same play appears at two different
times.

Two caveats. The export carries no track lengths, so only the 30 second rule
can be applied to imported plays. And the Account data export has no track
URIs, so those rows are keyed by a hash of artist and title and cannot merge
with plays the collector logged live.

## Where the data lives

| Key | Contents |
| --- | --- |
| `spicetify-stats:version` | schema version, currently `2` |
| `spicetify-stats:events` | `{ "v": 2, "events": [...] }`, one entry per play |
| `spicetify-stats:aggregates` | `{ "v": 2, "months": {...} }`, monthly rollups |

`localStorage` is small, so raw events are kept for 180 days and capped at
20 000 entries. Anything past that is folded into per-month rollups (plays,
listening time, top 100 artists and tracks) and the raw rows are dropped. That
is what lets a multi-year import fit at all. The "All time" range reads both
layers.

Both stored blobs carry their own `v`, so an exported blob stays
self-describing, and the readers still accept the older bare-array format.

## Development

There is no build step, by design. Spicetify loads the `.js` files directly —
no npm, no bundler, no TypeScript, and no JSX (custom apps cannot use it, so
React elements are built with `Spicetify.React.createElement`). Every chart is
hand-built inline SVG, because Spotify's CSP blocks external and data-URI
resources.

```
manifest.json     app metadata, icons, subfile list
extension.js      the collector - runs with Spotify, owns the play log
index.js          viewer entry point: state, layout, global render()
style.css         styles, semantic Spotify colors only
src/format.js     dates, durations, numbers
src/store.js      read access to localStorage, with a parse cache
src/aggregate.js  tallies, top lists, the heatmap calendar
src/charts.js     inline SVG bar charts and heatmap
src/import.js     Spotify data export import
src/views.js      the cards the dashboard is made of
```

`subfiles` are concatenated with `index.js` into a single shared scope, so
each module wraps itself in an IIFE and exposes one `Stats*` object.
`extension.js` runs in a scope of its own — `localStorage` is the only bridge
between collector and viewer.

Colors come from Spotify's semantic variables (`--spice-text`,
`--spice-button`, `--spice-card`, …), so the app follows whatever theme is
active. `prefers-reduced-motion` disables the decorative animation.

Changes only take effect after `spicetify apply`, which copies the files into
the Spotify folder. Debug through Spotify's DevTools.

## Limits

- Audio features (BPM, energy, valence) are heavily restricted by Spotify and
  are not used.
- A play counts for every credited artist, so the sum of per-artist plays is
  larger than the total play count on tracks with features.
- The heatmap only knows per-day detail for raw events. Months that have been
  folded into rollups contribute to totals and top lists, not to the grid.
- Everything is per machine. There is no sync.
