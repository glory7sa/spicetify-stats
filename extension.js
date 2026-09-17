/* Spicetify Stats - viewer entry point.
 *
 * Spicetify concatenates the manifest's subfiles with this file into one
 * scope and calls the global render(). Everything this file leans on lives in
 * src/: storage access, aggregation, the SVG charts and the view builders.
 *
 * The viewer never collects anything. User-triggered writes are history
 * import and the separate manual genre labels in src/design.js.
 */

const STATS_REFRESH_MS = 15000;


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

    // The collector keeps writing while the app is open. Rebuilding is only
    // worth it when something actually changed, which is rarely the case.
    React.useEffect(() => {
        let seen = StatsStore.signature();
        const id = setInterval(() => {
            const current = StatsStore.signature();
            if (current === seen) return;
            seen = current;
            setRefresh((value) => value + 1);
        }, STATS_REFRESH_MS);
        return () => clearInterval(id);
    }, []);

    const snapshot = React.useMemo(
        () => ({
            events: StatsStore.readEvents(),
            months: StatsStore.readMonths(),
            version: StatsStore.readVersion(),
            bytes: StatsStore.usedBytes(),
            initialised: StatsStore.isInitialised()
        }),
        [refresh]
    );

    const range = StatsAggregate.rangeById(rangeId);
    const data = React.useMemo(
        () => StatsAggregate.build(snapshot.events, snapshot.months, range.days),
        [snapshot, range.days]
    );
    const daily = React.useMemo(() => StatsAggregate.dailyBuckets(snapshot.events), [snapshot]);
    const calendar = React.useMemo(
        () => StatsAggregate.calendar(snapshot.events, range, daily),
        [daily, range.days]
    );

    const listening = StatsFormat.durationParts(data.ms);
    // Whether anything is stored at all, independent of the picked range - an
    // import can leave every play in the monthly rollups and none in the log.
    const hasData = snapshot.events.length > 0 || Object.keys(snapshot.months).length > 0;

    const header = statsEl("header", { key: "header", className: "stats-header" }, [
        statsEl("div", { key: "titles" }, [
            statsEl("p", { key: "eyebrow", className: "stats-eyebrow" }, "ЛИЧНАЯ МУЗЫКАЛЬНАЯ КОЛЛЕКЦИЯ"),
            statsEl("h1", { key: "title", className: "stats-title" }, "Твоя музыка в цифрах"),
            statsEl(
                "p",
                { key: "subtitle", className: "stats-subtitle" },
                data.lastTs ? "Последняя запись: " + StatsFormat.dateTime(data.lastTs) : "Ждём первое прослушивание"
            )
        ]),
        statsEl("div", { key: "range" }, statsRangeSwitcher(rangeId, setRangeId))
    ]);

    if (!hasData) {
        return statsEl("div", { className: "stats-app" }, [
            header,
            snapshot.initialised ? statsOnboarding() : statsCollectorMissing(),
            statsImportCard(importState, handleFiles)
        ]);
    }

    const tiles = statsEl("div", { key: "tiles", className: "stats-tiles" }, [
        statsTile("plays", StatsFormat.number(data.plays), null, "прослушиваний"),
        statsTile("time", listening.value, null, listening.unit === "minutes" ? "минут музыки" : "часов музыки"),
        statsTile("artists", StatsFormat.number(data.artistCount), null, "исполнителей"),
        statsTile("tracks", StatsFormat.number(data.trackCount), null, "композиций")
    ]);

    const columns = data.plays
        ? statsEl("div", { key: "columns", className: "stats-columns" }, [
              statsCard("artists", "Любимые исполнители", "Топ по числу прослушиваний", StatsDesign.ranking(data.topArtists, false)),
              statsCard("tracks", "Треки на повторе", "Топ по числу прослушиваний", StatsDesign.ranking(data.topTracks, true))
          ])
        : statsRangeEmpty(range);

    return statsEl("div", { className: "stats-app" }, [
        header,
        tiles,
        statsEl(StatsDesign.Genres, { key: "genres", events: snapshot.events, days: range.days }),
        columns,
        StatsDesign.activity(calendar, range),
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
