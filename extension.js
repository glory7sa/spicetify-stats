/* Spicetify Stats - collector.
 *
 * Registered as `subfiles_extension`, so this runs on every Spotify start,
 * no matter whether the custom app is open in the sidebar. It is the only
 * writer of the `spicetify-stats:` keys; the viewer (index.js) only reads.
 * Both share no scope - localStorage is the single bridge between them.
 */
(function statsCollector() {
    if (window.__spicetifyStatsCollector) return;
    window.__spicetifyStatsCollector = true;

    const PREFIX = "spicetify-stats:";
    const KEY_VERSION = PREFIX + "version";
    const KEY_EVENTS = PREFIX + "events";
    const KEY_AGGREGATES = PREFIX + "aggregates";

    // Bumped to 2: stored blobs carry their own version field now, and local
    // files are no longer logged.
    const SCHEMA_VERSION = 2;

    // A track only counts as played after 30s or half its length, whichever
    // comes first - otherwise skipping through a playlist skews everything.
    const MIN_PLAY_MS = 30000;
    const MIN_PLAY_RATIO = 0.5;

    const TICK_MS = 1000;

    // Below this the player sits at the beginning of a track, which is how a
    // genuine restart is told apart from a repeated songchange event.
    const RESTART_PROGRESS_MS = 3000;

    // localStorage is small, so raw events are kept for half a year and then
    // folded into monthly aggregates.
    const RAW_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
    const RAW_MAX_EVENTS = 20000;
    const AGGREGATE_TOP_N = 100;

    /* ---------------------------------------------------------------- storage */

    function readJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            // Corrupted entry - start over rather than break playback logging.
            return fallback;
        }
    }

    function writeJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    }

    let quotaWarned = false;

    function notify(text) {
        try {
            Spicetify.showNotification(text);
        } catch (e) {
            /* notifications are best effort */
        }
    }

    /* Every stored blob carries its own `v`, so a copied or exported payload
     * stays self-describing instead of relying on the separate version key.
     * Readers still accept the v1 shape (bare array / bare month map). */

    function readEvents() {
        const stored = readJSON(KEY_EVENTS, null);
        if (Array.isArray(stored)) return stored;
        if (stored && Array.isArray(stored.events)) return stored.events;
        return [];
    }

    function writeEvents(events) {
        return writeJSON(KEY_EVENTS, { v: SCHEMA_VERSION, events: events });
    }

    function readAggregates() {
        const stored = readJSON(KEY_AGGREGATES, null);
        if (!stored || typeof stored !== "object") return {};
        if (stored.months && typeof stored.months === "object") return stored.months;
        if (stored.v) return {};
        return stored;
    }

    function writeAggregates(months) {
        return writeJSON(KEY_AGGREGATES, { v: SCHEMA_VERSION, months: months });
    }

    function migrate(from) {
        if (from < 2) {
            // v1 stored bare containers and still logged local files. Those
            // are dropped here so they cannot leak into future aggregates.
            writeEvents(readEvents().filter((event) => event && isLoggableUri(event.uri)));
            writeAggregates(readAggregates());
        }
    }

    function ensureSchema() {
        const stored = Number(localStorage.getItem(KEY_VERSION)) || 0;
        if (stored === SCHEMA_VERSION) return;
        // Newer schema than this build knows: leave the data untouched.
        if (stored > SCHEMA_VERSION) return;

        if (stored > 0) migrate(stored);
        else if (localStorage.getItem(KEY_EVENTS)) migrate(1); // pre-versioning data

        localStorage.setItem(KEY_VERSION, String(SCHEMA_VERSION));
    }

    /* ------------------------------------------------------------ aggregation */

    function monthKey(timestamp) {
        const date = new Date(timestamp);
        const month = String(date.getMonth() + 1).padStart(2, "0");
        return date.getFullYear() + "-" + month;
    }

    function trimMap(map, limit, score) {
        const entries = Object.entries(map);
        if (entries.length <= limit) return map;
        entries.sort((a, b) => score(b[1]) - score(a[1]));
        return Object.fromEntries(entries.slice(0, limit));
    }

    // Folds raw events into per-month buckets so the details can be dropped.
    function foldIntoAggregates(events) {
        if (!events.length) return;
        const aggregates = readAggregates();

        for (const event of events) {
            const key = monthKey(event.ts);
            let bucket = aggregates[key];
            if (!bucket) {
                bucket = aggregates[key] = { plays: 0, ms: 0, artists: {}, tracks: {} };
            }

            bucket.plays += 1;
            bucket.ms += event.playedMs || 0;

            for (const artist of event.artists || []) {
                bucket.artists[artist.name] = (bucket.artists[artist.name] || 0) + 1;
            }

            let track = bucket.tracks[event.uri];
            if (!track) {
                track = bucket.tracks[event.uri] = {
                    title: event.title,
                    artist: (event.artists && event.artists[0] && event.artists[0].name) || "",
                    plays: 0
                };
            }
            track.plays += 1;
        }

        for (const key of Object.keys(aggregates)) {
            aggregates[key].artists = trimMap(aggregates[key].artists, AGGREGATE_TOP_N, (v) => v);
            aggregates[key].tracks = trimMap(aggregates[key].tracks, AGGREGATE_TOP_N, (v) => v.plays);
        }

        writeAggregates(aggregates);
    }

    // Returns the events worth keeping raw; everything else goes to aggregates.
    function compactEvents(events, aggressive) {
        const cutoff = Date.now() - RAW_MAX_AGE_MS;
        const keep = [];
        let expired = [];

        for (const event of events) {
            if (event && event.ts >= cutoff) keep.push(event);
            else if (event) expired.push(event);
        }

        // Events are appended chronologically, so the front is the oldest.
        const limit = aggressive ? Math.floor(RAW_MAX_EVENTS / 2) : RAW_MAX_EVENTS;
        if (keep.length > limit) {
            expired = expired.concat(keep.splice(0, keep.length - limit));
        }

        foldIntoAggregates(expired);
        return keep;
    }

    function appendEvent(event) {
        let events = readEvents();
        events.push(event);
        events = compactEvents(events, false);

        if (writeEvents(events)) return;

        // Quota hit: aggregate away the older half and retry once.
        events = compactEvents(events, true);
        if (writeEvents(events)) return;

        if (!quotaWarned) {
            quotaWarned = true;
            notify("Stats: localStorage is full, play events are not being saved.");
        }
    }

    /* ------------------------------------------------------------ track model */

    function readArtists(item, meta) {
        if (Array.isArray(item.artists) && item.artists.length) {
            return item.artists
                .filter(Boolean)
                .map((artist) => ({ name: artist.name || "Unknown", uri: artist.uri || "" }));
        }

        // Older player payloads expose artist_name, artist_name:1, artist_name:2 ...
        const artists = [];
        for (let i = 0; ; i++) {
            const nameKey = i === 0 ? "artist_name" : "artist_name:" + i;
            const uriKey = i === 0 ? "artist_uri" : "artist_uri:" + i;
            if (!meta[nameKey]) break;
            artists.push({ name: meta[nameKey], uri: meta[uriKey] || "" });
        }
        return artists;
    }

    // Only catalogue tracks are counted. Podcast episodes (spotify:episode:),
    // local files (spotify:local:) and ads (spotify:ad:) all fail this test.
    function isLoggableUri(uri) {
        return typeof uri === "string" && uri.startsWith("spotify:track:");
    }

    // Some Spotify builds hand out ads with a regular track uri, so the
    // metadata is checked as well.
    function isAdvertisement(item, meta) {
        return (
            item.provider === "ad" ||
            String(meta.is_advertisement) === "true" ||
            meta["ad.id"] != null
        );
    }

    function readTrack(item) {
        if (!item) return null;

        const meta = item.metadata || {};
        const uri = item.uri || meta.uri || "";
        if (!isLoggableUri(uri)) return null;
        if (isAdvertisement(item, meta)) return null;

        let durationMs = Number(
            (item.duration && item.duration.milliseconds) != null
                ? item.duration.milliseconds
                : meta.duration
        );
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
            durationMs = Number(Spicetify.Player.getDuration()) || 0;
        }

        return {
            uri: uri,
            title: item.name || meta.title || "Unknown",
            artists: readArtists(item, meta),
            album: (item.album && item.album.name) || meta.album_title || "",
            durationMs: durationMs
        };
    }

    function playThreshold(durationMs) {
        if (!durationMs) return MIN_PLAY_MS;
        return Math.min(MIN_PLAY_MS, durationMs * MIN_PLAY_RATIO);
    }

    /* ---------------------------------------------------------------- session */

    let session = null;
    let lastLog = null;

    function progressMs() {
        const progress = Number(Spicetify.Player.getProgress());
        return Number.isFinite(progress) && progress > 0 ? progress : 0;
    }

    // Spicetify can fire songchange more than once for the same track. Only a
    // player sitting at the beginning is a real restart (repeat one); anything
    // else keeps the running session, including its accumulated time and its
    // already-logged flag.
    function startSession(item) {
        const track = readTrack(item);
        if (!track) {
            session = null;
            return;
        }

        const progress = progressMs();
        if (session && session.track.uri === track.uri && progress > RESTART_PROGRESS_MS) {
            session.lastTick = Date.now();
            session.lastProgress = progress;
            return;
        }

        session = {
            track: track,
            playedMs: 0,
            lastTick: Date.now(),
            lastProgress: progress,
            logged: false
        };
    }

    // Second guard against inflated counts: a repeat play has to accumulate a
    // full threshold of fresh playback anyway, so no genuine replay can ever
    // land inside this window - only an event storm can.
    function canLog(track) {
        if (!lastLog || lastLog.uri !== track.uri) return true;
        return Date.now() - lastLog.ts >= playThreshold(track.durationMs);
    }

    function logSession() {
        lastLog = { uri: session.track.uri, ts: Date.now() };
        appendEvent({
            ts: Date.now(),
            uri: session.track.uri,
            title: session.track.title,
            artists: session.track.artists,
            album: session.track.album,
            durationMs: session.track.durationMs,
            playedMs: Math.round(session.playedMs)
        });
    }

    // Playback progress instead of wall clock: a paused player does not
    // advance, and clamping to the elapsed wall time discards forward seeks.
    // Suspending the machine or a throttled timer stay correct that way too.
    function measure() {
        if (!session) return;

        const now = Date.now();
        const progress = progressMs();
        const wallDelta = now - session.lastTick;
        const progressDelta = progress - session.lastProgress;

        session.lastTick = now;
        session.lastProgress = progress;

        if (session.logged) return;
        if (progressDelta <= 0 || wallDelta <= 0) return;

        session.playedMs += Math.min(progressDelta, wallDelta);
        if (session.playedMs >= playThreshold(session.track.durationMs)) {
            // Written the moment the threshold is crossed, so a hard quit of
            // Spotify cannot lose a play that already counted.
            session.logged = true;
            if (canLog(session.track)) logSession();
        }
    }

    /* Everything below runs on Spotify's own event loop. An exception escaping
     * here would either kill the interval or break the player's listener list,
     * so both entry points swallow errors and drop the current session rather
     * than take the collector down for the rest of the session. */
    function guard(action) {
        try {
            action();
        } catch (e) {
            session = null;
        }
    }

    function tick() {
        guard(measure);
    }

    /* ------------------------------------------------------------------- boot */

    async function main() {
        while (!(window.Spicetify && Spicetify.Player && Spicetify.Player.addEventListener && Spicetify.showNotification)) {
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        guard(ensureSchema);

        Spicetify.Player.addEventListener("songchange", (event) => {
            guard(() => {
                const data = event && event.data;
                const item =
                    (data && (data.item || data.track)) || (Spicetify.Player.data && Spicetify.Player.data.item);
                startSession(item);
            });
        });

        // Something may already be playing when the extension loads.
        if (Spicetify.Player.data && Spicetify.Player.data.item) {
            guard(() => startSession(Spicetify.Player.data.item));
        }

        setInterval(tick, TICK_MS);
    }

    main();
})();
