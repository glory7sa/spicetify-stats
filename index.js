/* Spicetify Stats - viewer.
 *
 * Reads from localStorage only, it never collects anything itself. The
 * aggregation and drawing live in src/ (concatenated into this scope by
 * Spicetify), this file is the shell: range switcher, layout, empty states.
 */

const STATS_REFRESH_MS = 15000;

function statsEl(tag, props, children) {
    return Spicetify.React.createElement(tag, props, children);
}

function statsCard(key, title, subtitle, body, extraClass) {
    return statsEl(
        "section",
        { key: key, className: "stats-card" + (extraClass ? " " + extraClass : "") },
        [
            statsEl("header", { key: "head", className: "stats-card-head" }, [
                statsEl("h2", { key: "title", className: "stats-card-title" }, title),
                subtitle ? statsEl("p", { key: "sub", className: "stats-card-subtitle" }, subtitle) : null
            ]),
            statsEl("div", { key: "body", className: "stats-card-body" }, body)
        ]
    );
}

function statsTile(key, value, unit, label) {
    return statsEl("div", { key: key, className: "stats-tile" }, [
        statsEl("span", { key: "value", className: "stats-tile-value" }, [
            value,
            unit ? statsEl("span", { key: "unit", className: "stats-tile-unit" }, unit) : null
        ]),
        statsEl("span", { key: "label", className: "stats-tile-label" }, label)
    ]);
}

function statsRangeSwitcher(current, onChange) {
    return statsEl(
        "div",
        { className: "stats-range", role: "group", "aria-label": "time range" },
        StatsAggregate.RANGES.map((range) =>
            statsEl(
                "button",
                {
                    key: range.id,
                    type: "button",
                    className: "stats-range-button" + (range.id === current ? " stats-range-button-active" : ""),
                    "aria-pressed": range.id === current,
                    onClick: () => onChange(range.id)
                },
                range.label
            )
        )
    );
}

function statsEmpty(text) {
    return statsEl("p", { className: "stats-empty" }, text);
}

function statsTopArtists(data) {
    if (!data.topArtists.length) return statsEmpty("No artists in this range yet.");

    const rows = data.topArtists.map((artist) => ({
        key: artist.name,
        label: artist.name,
        value: artist.plays,
        valueLabel: StatsFormat.number(artist.plays),
        title: artist.name + " · " + artist.plays + " plays · " + StatsFormat.duration(artist.ms)
    }));

    return StatsCharts.barChart(rows, { ariaLabel: "top artists by plays" });
}

function statsTopTracks(data) {
    if (!data.topTracks.length) return statsEmpty("No tracks in this range yet.");

    const rows = data.topTracks.map((track) => ({
        key: track.uri,
        label: track.title,
        sublabel: track.artist,
        value: track.plays,
        valueLabel: StatsFormat.number(track.plays),
        title: track.title + " · " + track.artist + " · " + track.plays + " plays · " + StatsFormat.duration(track.ms)
    }));

    return StatsCharts.barChart(rows, { rank: true, ariaLabel: "top tracks by plays" });
}

function statsHeatmapReadout(hovered, calendar, range) {
    if (hovered) {
        const detail = hovered.plays
            ? StatsFormat.number(hovered.plays) +
              " " +
              StatsFormat.plural(hovered.plays, "play", "plays") +
              " · " +
              StatsFormat.duration(hovered.ms)
            : "nothing played";
        return StatsFormat.date(hovered.ts) + " — " + detail;
    }

    if (!calendar.activeDays) return "No listening days in this range yet.";

    const window = range.days ? "in the last " + range.days + " days" : "across all raw history";
    return (
        StatsFormat.number(calendar.activeDays) +
        " active " +
        StatsFormat.plural(calendar.activeDays, "day", "days") +
        " · " +
        StatsFormat.duration(calendar.activeMs) +
        " " +
        window
    );
}

function statsHeatmapCard(calendar, hovered, setHovered, range) {
    const body = [
        statsEl("p", { key: "readout", className: "stats-readout" }, statsHeatmapReadout(hovered, calendar, range)),
        statsEl(
            "div",
            { key: "scroll", className: "stats-heatmap-scroll" },
            StatsCharts.heatmap(calendar, { onHover: setHovered })
        ),
        statsEl("div", { key: "legend", className: "stats-legend" }, [
            statsEl("span", { key: "less", className: "stats-legend-label" }, "Less"),
            StatsCharts.heatmapLegend(),
            statsEl("span", { key: "more", className: "stats-legend-label" }, "More")
        ])
    ];

    const subtitle = range.days
        ? "Listening time per day over the last " + range.days + " days."
        : "Listening time per day across the whole raw history.";

    return statsCard("heatmap", "Listening activity", subtitle, body, "stats-card-wide");
}

function statsImportSummary(report) {
    const parts = [
        StatsFormat.number(report.imported) + " " + StatsFormat.plural(report.imported, "play", "plays") + " imported"
    ];
    if (report.duplicates) parts.push(StatsFormat.number(report.duplicates) + " already known");
    if (report.tooShort) parts.push(StatsFormat.number(report.tooShort) + " under 30 seconds");
    if (report.archived) parts.push(StatsFormat.number(report.archived) + " folded into monthly totals");
    return parts.join(" · ");
}

function statsImportCard(state, onFiles) {
    const body = [
        statsEl(
            "p",
            { key: "intro", className: "stats-empty" },
            "Spotify can send you your full listening history. Request it under Privacy Settings, then drop the " +
                "JSON files from the export in here - both “Extended streaming history” and the smaller " +
                "“Account data” export are understood."
        ),
        statsEl("label", { key: "picker", className: "stats-file" }, [
            statsEl("input", {
                key: "input",
                type: "file",
                accept: ".json,application/json",
                multiple: true,
                disabled: state.status === "reading",
                onChange: (event) => onFiles(event.target.files)
            }),
            statsEl(
                "span",
                { key: "label", className: "stats-file-label" },
                state.status === "reading" ? "Reading…" : "Choose JSON files"
            )
        ])
    ];

    if (state.status === "reading" && state.progress) {
        body.push(
            statsEl(
                "p",
                { key: "progress", className: "stats-empty" },
                "Reading " + state.progress.file + " (" + (state.progress.index + 1) + " of " + state.progress.count + ")"
            )
        );
    }

    if (state.status === "done" && state.report) {
        body.push(
            statsEl("p", { key: "result", className: "stats-import-result" }, statsImportSummary(state.report))
        );
        if (state.report.failures && state.report.failures.length) {
            body.push(
                statsEl(
                    "p",
                    { key: "failures", className: "stats-error-message" },
                    "Skipped files - " + state.report.failures.join("; ")
                )
            );
        }
        if (state.report.format === "basic") {
            body.push(
                statsEl(
                    "p",
                    { key: "note", className: "stats-empty" },
                    "The Account data export carries no track links, so those plays are grouped by artist and title " +
                        "and cannot merge with plays logged live."
                )
            );
        }
    }

    if (state.status === "error") {
        body.push(statsEl("p", { key: "error", className: "stats-error-message" }, state.message));
    }

    return statsCard(
        "import",
        "Import listening history",
        "Everything stays on this machine, nothing is uploaded.",
        body,
        "stats-card-wide"
    );
}

function statsFooter(snapshot, data) {
    const parts = [
        StatsFormat.number(data.rawCount) + " raw " + StatsFormat.plural(data.rawCount, "event", "events"),
        StatsFormat.bytes(snapshot.bytes) + " stored",
        "schema v" + snapshot.version
    ];
    if (data.archivedPlays) {
        parts.splice(1, 0, StatsFormat.number(data.archivedPlays) + " archived plays in monthly aggregates");
    }
    return statsEl("p", { key: "footer", className: "stats-footer" }, parts.join(" · "));
}

function statsOnboarding() {
    return statsCard(
        "onboarding",
        "Nothing logged yet",
        null,
        [
            statsEl(
                "p",
                { key: "line1", className: "stats-empty" },
                "The collector counts a track once it has played for 30 seconds, or half its length for anything shorter."
            ),
            statsEl(
                "p",
                { key: "line2", className: "stats-empty" },
                "Podcasts, local files and ads are skipped on purpose. Play something and this page fills up on its own."
            )
        ],
        "stats-card-wide"
    );
}

function StatsApp() {
    const React = Spicetify.React;
    const [rangeId, setRangeId] = React.useState(StatsAggregate.DEFAULT_RANGE);
    const [refresh, setRefresh] = React.useState(0);
    const [hovered, setHovered] = React.useState(null);
    const [importState, setImportState] = React.useState({ status: "idle" });

    function handleFiles(files) {
        if (!files || !files.length) return;
        setImportState({ status: "reading" });
        StatsImport.importFiles(files, (progress) => setImportState({ status: "reading", progress: progress }))
            .then((report) => {
                setImportState({ status: "done", report: report });
                setRefresh((value) => value + 1);
            })
            .catch((error) => setImportState({ status: "error", message: error.message || String(error) }));
    }

    // The collector keeps writing while the app is open.
    React.useEffect(() => {
        const id = setInterval(() => setRefresh((value) => value + 1), STATS_REFRESH_MS);
        return () => clearInterval(id);
    }, []);

    const snapshot = React.useMemo(
        () => ({
            events: StatsStore.readEvents(),
            months: StatsStore.readMonths(),
            version: StatsStore.readVersion(),
            bytes: StatsStore.usedBytes()
        }),
        [refresh]
    );

    const range = StatsAggregate.rangeById(rangeId);
    const data = React.useMemo(
        () => StatsAggregate.build(snapshot.events, snapshot.months, range.days),
        [snapshot, range.days]
    );
    const calendar = React.useMemo(
        () => StatsAggregate.calendar(snapshot.events, range),
        [snapshot, range.days]
    );

    const listening = StatsFormat.durationParts(data.ms);
    const hasData = data.rawCount > 0 || data.archivedPlays > 0;

    const header = statsEl("header", { key: "header", className: "stats-header" }, [
        statsEl("div", { key: "titles" }, [
            statsEl("h1", { key: "title", className: "stats-title" }, "Stats"),
            statsEl(
                "p",
                { key: "subtitle", className: "stats-subtitle" },
                data.lastTs ? "Last play logged " + StatsFormat.dateTime(data.lastTs) : "Waiting for the first play"
            )
        ]),
        statsEl("div", { key: "range" }, statsRangeSwitcher(rangeId, setRangeId))
    ]);

    if (!hasData) {
        return statsEl("div", { className: "stats-app" }, [
            header,
            statsOnboarding(),
            statsImportCard(importState, handleFiles)
        ]);
    }

    const tiles = statsEl("div", { key: "tiles", className: "stats-tiles" }, [
        statsTile("plays", StatsFormat.number(data.plays), null, "plays"),
        statsTile("time", listening.value, null, listening.unit + " listened"),
        statsTile("artists", StatsFormat.number(data.artistCount), null, "different artists"),
        statsTile("tracks", StatsFormat.number(data.trackCount), null, "different tracks")
    ]);

    const columns = statsEl("div", { key: "columns", className: "stats-columns" }, [
        statsCard("artists", "Top artists", "Ranked by plays, hover for listening time.", statsTopArtists(data)),
        statsCard("tracks", "Top tracks", "Ranked by plays, hover for listening time.", statsTopTracks(data))
    ]);

    return statsEl("div", { className: "stats-app" }, [
        header,
        tiles,
        columns,
        statsHeatmapCard(calendar, hovered, setHovered, range),
        statsImportCard(importState, handleFiles),
        statsFooter(snapshot, data)
    ]);
}

/* A throwing render blanks Spotify's whole main view, so the tree is wrapped
 * in a boundary that shows the message instead. The class is built lazily
 * because Spicetify.React does not exist yet when this file is evaluated. */
let statsBoundaryClass = null;

function statsErrorBoundary() {
    if (statsBoundaryClass) return statsBoundaryClass;

    class StatsErrorBoundary extends Spicetify.React.Component {
        constructor(props) {
            super(props);
            this.state = { error: null };
        }

        static getDerivedStateFromError(error) {
            return { error: error };
        }

        render() {
            if (!this.state.error) return this.props.children;

            const message = (this.state.error && this.state.error.message) || String(this.state.error);
            return statsEl("div", { className: "stats-app" }, [
                statsEl("h1", { key: "title", className: "stats-title" }, "Stats"),
                statsCard(
                    "error",
                    "This page failed to render",
                    null,
                    [
                        statsEl("p", { key: "message", className: "stats-error-message" }, message),
                        statsEl(
                            "p",
                            { key: "hint", className: "stats-empty" },
                            "Your listening history is untouched - it lives in localStorage, not in this view. " +
                                "Switching away from the app and back retries the render."
                        )
                    ],
                    "stats-card-wide"
                )
            ]);
        }
    }

    statsBoundaryClass = StatsErrorBoundary;
    return statsBoundaryClass;
}

function render() {
    const React = Spicetify.React;
    return React.createElement(statsErrorBoundary(), null, React.createElement(StatsApp, null));
}
