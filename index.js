/* Spicetify Stats - viewer.
 *
 * Reads from localStorage only, it never collects anything itself. For now
 * this is a placeholder page that shows how many play events the collector
 * has stored - enough to verify that the app mounts and extension.js runs.
 */

const PREFIX = "spicetify-stats:";
const KEY_VERSION = PREFIX + "version";
const KEY_EVENTS = PREFIX + "events";

// Schema v2 wraps the events in a versioned envelope; v1 stored a bare array.
function readEvents() {
    try {
        const raw = localStorage.getItem(KEY_EVENTS);
        const stored = raw ? JSON.parse(raw) : null;
        if (Array.isArray(stored)) return stored;
        if (stored && Array.isArray(stored.events)) return stored.events;
        return [];
    } catch (e) {
        return [];
    }
}

function readSnapshot() {
    const events = readEvents();
    const last = events[events.length - 1];
    return {
        count: events.length,
        version: localStorage.getItem(KEY_VERSION) || "-",
        last: last
            ? {
                  title: last.title,
                  artist: (last.artists && last.artists[0] && last.artists[0].name) || "",
                  ts: last.ts
              }
            : null
    };
}

function formatTime(timestamp) {
    try {
        return new Date(timestamp).toLocaleString();
    } catch (e) {
        return "";
    }
}

function StatsApp() {
    const { React } = Spicetify;
    const [snapshot, setSnapshot] = React.useState(readSnapshot);

    // The collector writes while the app is open, so poll for fresh numbers.
    React.useEffect(() => {
        const id = setInterval(() => setSnapshot(readSnapshot()), 5000);
        return () => clearInterval(id);
    }, []);

    const children = [
        React.createElement("h1", { className: "stats-title", key: "title" }, "Stats"),
        React.createElement(
            "p",
            { className: "stats-subtitle", key: "subtitle" },
            "Collector status - schema v" + snapshot.version
        ),
        React.createElement(
            "div",
            { className: "stats-card", key: "card" },
            React.createElement("span", { className: "stats-metric-value" }, String(snapshot.count)),
            React.createElement("span", { className: "stats-metric-label" }, "logged play events")
        )
    ];

    children.push(
        snapshot.last
            ? React.createElement(
                  "p",
                  { className: "stats-hint", key: "hint" },
                  "Last entry: " +
                      snapshot.last.title +
                      (snapshot.last.artist ? " - " + snapshot.last.artist : "") +
                      " (" +
                      formatTime(snapshot.last.ts) +
                      ")"
              )
            : React.createElement(
                  "p",
                  { className: "stats-hint", key: "hint" },
                  "Nothing logged yet. A track is counted after 30 seconds or half its length."
              )
    );

    return React.createElement("div", { className: "stats-app" }, children);
}

function render() {
    return Spicetify.React.createElement(StatsApp, null);
}
