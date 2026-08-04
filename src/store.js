/* Spicetify Stats - storage access.
 *
 * Read-only window onto what the collector wrote. The viewer never writes to
 * the `spicetify-stats:` keys, extension.js owns them. Both the v2 envelope
 * ({ v, events }) and the bare v1 containers are accepted, so opening the app
 * before Spotify has restarted with a new schema still works.
 */
const StatsStore = (function () {
    const PREFIX = "spicetify-stats:";
    const KEY_VERSION = PREFIX + "version";
    const KEY_EVENTS = PREFIX + "events";
    const KEY_AGGREGATES = PREFIX + "aggregates";

    // localStorage itself can throw (disabled storage, privacy modes), not
    // just JSON.parse, so every access goes through here.
    function readRaw(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function readJSON(key) {
        try {
            const raw = readRaw(key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function readEvents() {
        const stored = readJSON(KEY_EVENTS);
        let events = null;
        if (Array.isArray(stored)) events = stored;
        else if (stored && Array.isArray(stored.events)) events = stored.events;
        if (!events) return [];

        return events
            .filter((event) => event && typeof event.ts === "number")
            .sort((a, b) => a.ts - b.ts);
    }

    // Monthly rollups of events that were already pruned from the raw log.
    function readMonths() {
        const stored = readJSON(KEY_AGGREGATES);
        if (!stored || typeof stored !== "object") return {};
        if (stored.months && typeof stored.months === "object") return stored.months;
        if (stored.v) return {};
        return stored;
    }

    function readVersion() {
        return readRaw(KEY_VERSION) || "-";
    }

    // Rough footprint of the collector's data; localStorage stores UTF-16.
    function usedBytes() {
        let total = 0;
        for (const key of [KEY_EVENTS, KEY_AGGREGATES, KEY_VERSION]) {
            const raw = readRaw(key);
            if (raw) total += (raw.length + key.length) * 2;
        }
        return total;
    }

    // True when the collector has never run, which the views report instead of
    // showing an empty dashboard that looks broken.
    function isInitialised() {
        return readRaw(KEY_VERSION) !== null;
    }

    return {
        KEY_EVENTS: KEY_EVENTS,
        KEY_AGGREGATES: KEY_AGGREGATES,
        KEY_VERSION: KEY_VERSION,
        readEvents: readEvents,
        readMonths: readMonths,
        readVersion: readVersion,
        usedBytes: usedBytes,
        isInitialised: isInitialised
    };
})();
