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

    /* Parsing the raw log dominates every render once a few thousand plays
     * have piled up, so the result is cached against a cheap fingerprint of
     * the stored string. Length plus the tail is enough: the collector only
     * ever appends, and a rewrite changes the length. */
    function signatureOf(raw) {
        return raw === null ? "empty" : raw.length + ":" + raw.slice(-192);
    }

    const cache = { events: null, months: null };

    // Callers must treat the returned array as read only, it is shared.
    function readEvents() {
        const raw = readRaw(KEY_EVENTS);
        const signature = signatureOf(raw);
        if (cache.events && cache.events.signature === signature) return cache.events.value;

        let stored = null;
        try {
            stored = raw ? JSON.parse(raw) : null;
        } catch (e) {
            stored = null;
        }

        let events = null;
        if (Array.isArray(stored)) events = stored;
        else if (stored && Array.isArray(stored.events)) events = stored.events;

        const value = events
            ? events.filter((event) => event && typeof event.ts === "number").sort((a, b) => a.ts - b.ts)
            : [];

        cache.events = { signature: signature, value: value };
        return value;
    }

    // Monthly rollups of events that were already pruned from the raw log.
    function readMonths() {
        const raw = readRaw(KEY_AGGREGATES);
        const signature = signatureOf(raw);
        if (cache.months && cache.months.signature === signature) return cache.months.value;

        let stored = null;
        try {
            stored = raw ? JSON.parse(raw) : null;
        } catch (e) {
            stored = null;
        }

        let value = {};
        if (stored && typeof stored === "object") {
            if (stored.months && typeof stored.months === "object") value = stored.months;
            else if (!stored.v) value = stored;
        }

        cache.months = { signature: signature, value: value };
        return value;
    }

    // Cheap change detector for the refresh poll, so an idle app does no work.
    function signature() {
        return signatureOf(readRaw(KEY_EVENTS)) + "/" + signatureOf(readRaw(KEY_AGGREGATES));
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
        readEvents: readEvents,
        readMonths: readMonths,
        readVersion: readVersion,
        signature: signature,
        usedBytes: usedBytes,
        isInitialised: isInitialised
    };
})();
