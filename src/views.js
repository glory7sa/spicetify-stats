/* Spicetify Stats - view builders.
 *
 * Every card and control the dashboard is made of. Kept apart from index.js
 * so that file stays what it is meant to be: the shell that owns state and
 * assembles the page. No JSX anywhere, Spicetify custom apps cannot use it.
 */

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
    const monthKeys = Object.keys(snapshot.months);
    let archivedPlays = 0;
    for (const key of monthKeys) archivedPlays += (snapshot.months[key] && snapshot.months[key].plays) || 0;

    const parts = [StatsFormat.number(data.rawCount) + " raw " + StatsFormat.plural(data.rawCount, "event", "events")];
    if (archivedPlays) {
        parts.push(
            StatsFormat.number(archivedPlays) +
                " archived across " +
                monthKeys.length +
                " " +
                StatsFormat.plural(monthKeys.length, "month", "months")
        );
    }
    parts.push(StatsFormat.bytes(snapshot.bytes) + " stored", "schema v" + snapshot.version);

    return statsEl("p", { key: "footer", className: "stats-footer" }, parts.join(" · "));
}

// Storage has never been touched: the extension is not running at all, which
// is a different problem from having simply not listened to anything yet.
function statsCollectorMissing() {
    return statsCard(
        "collector",
        "The collector has not run yet",
        null,
        [
            statsEl(
                "p",
                { key: "line1", className: "stats-empty" },
                "extension.js writes the play log, and it has not touched storage on this machine. It is registered " +
                    "through this app's manifest, so it starts together with Spotify."
            ),
            statsEl(
                "p",
                { key: "line2", className: "stats-empty" },
                "Run spicetify apply and restart Spotify. Importing an export below works either way."
            )
        ],
        "stats-card-wide"
    );
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

// History exists, just not inside the picked window.
function statsRangeEmpty(range) {
    return statsCard(
        "range-empty",
        range.days ? "Nothing played in the last " + range.days + " days" : "Nothing played yet",
        null,
        [
            statsEl(
                "p",
                { key: "hint", className: "stats-empty" },
                "Your history is not empty - pick a longer range above to see it."
            )
        ],
        "stats-card-wide"
    );
}
