/* Spicetify Stats - aggregation.
 *
 * Turns the raw play events into the numbers the views draw. Day boundaries
 * are walked with Date#setDate instead of millisecond arithmetic so daylight
 * saving shifts cannot move a play into the wrong day.
 */
const StatsAggregate = (function () {
    const RANGES = [
        { id: "7d", label: "7 days", days: 7 },
        { id: "30d", label: "30 days", days: 30 },
        { id: "90d", label: "90 days", days: 90 },
        { id: "all", label: "All time", days: null }
    ];

    const HEATMAP_WEEKS = 53;
    const TOP_LIMIT = 10;
    const DEFAULT_RANGE = "30d";

    function rangeById(id) {
        return RANGES.find((range) => range.id === id) || RANGES.find((range) => range.id === DEFAULT_RANGE);
    }

    function startOfDay(ts) {
        const date = new Date(ts);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
    }

    function dayKey(ts) {
        const date = new Date(ts);
        return (
            date.getFullYear() +
            "-" +
            String(date.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(date.getDate()).padStart(2, "0")
        );
    }

    // First millisecond of the window, e.g. 7 days = today plus the six days
    // before it.
    function rangeStart(days) {
        if (!days) return null;
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - (days - 1));
        return date.getTime();
    }

    function artistsOf(event) {
        if (event.artists && event.artists.length) return event.artists;
        return [{ name: "Unknown artist", uri: "" }];
    }

    function tally(events) {
        const artists = new Map();
        const tracks = new Map();
        let plays = 0;
        let ms = 0;

        for (const event of events) {
            const played = event.playedMs || 0;
            plays += 1;
            ms += played;

            // A play counts for every credited artist, the same way the
            // collector folds them into the monthly aggregates.
            for (const artist of artistsOf(event)) {
                let entry = artists.get(artist.name);
                if (!entry) {
                    entry = { name: artist.name, uri: artist.uri || "", plays: 0, ms: 0 };
                    artists.set(artist.name, entry);
                }
                entry.plays += 1;
                entry.ms += played;
                if (!entry.uri && artist.uri) entry.uri = artist.uri;
            }

            let track = tracks.get(event.uri);
            if (!track) {
                track = {
                    uri: event.uri,
                    title: event.title || "Unknown",
                    artist: artistsOf(event)[0].name,
                    plays: 0,
                    ms: 0
                };
                tracks.set(event.uri, track);
            }
            track.plays += 1;
            track.ms += played;
        }

        return { plays: plays, ms: ms, artists: artists, tracks: tracks };
    }

    // Monthly rollups only exist for events that were already pruned from the
    // raw log, so adding them cannot double count.
    function mergeMonths(result, months) {
        let archived = 0;

        for (const key of Object.keys(months || {})) {
            const bucket = months[key];
            if (!bucket) continue;

            archived += bucket.plays || 0;
            result.plays += bucket.plays || 0;
            result.ms += bucket.ms || 0;

            for (const [name, count] of Object.entries(bucket.artists || {})) {
                let entry = result.artists.get(name);
                if (!entry) {
                    entry = { name: name, uri: "", plays: 0, ms: 0 };
                    result.artists.set(name, entry);
                }
                // Aggregates keep play counts only, no per-artist listening time.
                entry.plays += count || 0;
            }

            for (const [uri, track] of Object.entries(bucket.tracks || {})) {
                let entry = result.tracks.get(uri);
                if (!entry) {
                    entry = { uri: uri, title: track.title || "Unknown", artist: track.artist || "", plays: 0, ms: 0 };
                    result.tracks.set(uri, entry);
                }
                entry.plays += track.plays || 0;
            }
        }

        return archived;
    }

    function top(map, limit) {
        return Array.from(map.values())
            .sort((a, b) => {
                if (b.plays !== a.plays) return b.plays - a.plays;
                if (b.ms !== a.ms) return b.ms - a.ms;
                // Stable order for ties so the list does not shuffle on refresh.
                const left = String(a.name || a.title || "");
                const right = String(b.name || b.title || "");
                return left.localeCompare(right);
            })
            .slice(0, limit);
    }

    function build(events, months, days) {
        const from = rangeStart(days);
        const scoped = from === null ? events : events.filter((event) => event.ts >= from);
        const result = tally(scoped);
        const archived = days === null ? mergeMonths(result, months) : 0;

        return {
            days: days,
            from: from,
            plays: result.plays,
            ms: result.ms,
            artistCount: result.artists.size,
            trackCount: result.tracks.size,
            topArtists: top(result.artists, TOP_LIMIT),
            topTracks: top(result.tracks, TOP_LIMIT),
            archivedPlays: archived,
            rawCount: events.length,
            firstTs: events.length ? events[0].ts : null,
            lastTs: events.length ? events[events.length - 1].ts : null
        };
    }

    function dailyBuckets(events) {
        const daily = new Map();
        for (const event of events) {
            const key = dayKey(event.ts);
            let bucket = daily.get(key);
            if (!bucket) {
                bucket = { plays: 0, ms: 0 };
                daily.set(key, bucket);
            }
            bucket.plays += 1;
            bucket.ms += event.playedMs || 0;
        }
        return daily;
    }

    /* The heatmap always draws the same window so the grid does not jump when
     * the range changes; days outside the selected range are flagged and the
     * view mutes them. Columns are weeks, rows are Monday through Sunday. */
    function calendar(events, from, weeks) {
        const columnCount = weeks || HEATMAP_WEEKS;
        const daily = dailyBuckets(events);
        const today = startOfDay(Date.now());

        const cursor = new Date(today);
        const weekday = (cursor.getDay() + 6) % 7; // Monday = 0
        cursor.setDate(cursor.getDate() - weekday - (columnCount - 1) * 7);

        const columns = [];
        let max = 0;
        let rangeMs = 0;
        let rangeDays = 0;

        for (let week = 0; week < columnCount; week++) {
            const column = [];
            for (let day = 0; day < 7; day++) {
                const ts = cursor.getTime();
                const bucket = daily.get(dayKey(ts));
                const future = ts > today;
                const entry = {
                    ts: ts,
                    month: cursor.getMonth(),
                    dayOfMonth: cursor.getDate(),
                    plays: bucket ? bucket.plays : 0,
                    ms: bucket ? bucket.ms : 0,
                    future: future,
                    inRange: !future && (from === null || ts >= from)
                };

                if (!future && entry.ms > max) max = entry.ms;
                if (entry.inRange && entry.plays > 0) {
                    rangeMs += entry.ms;
                    rangeDays += 1;
                }

                column.push(entry);
                cursor.setDate(cursor.getDate() + 1);
            }
            columns.push(column);
        }

        return { columns: columns, max: max, activeDays: rangeDays, activeMs: rangeMs };
    }

    return {
        RANGES: RANGES,
        DEFAULT_RANGE: DEFAULT_RANGE,
        HEATMAP_WEEKS: HEATMAP_WEEKS,
        rangeById: rangeById,
        rangeStart: rangeStart,
        dayKey: dayKey,
        dailyBuckets: dailyBuckets,
        build: build,
        calendar: calendar
    };
})();
