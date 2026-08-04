/* Spicetify Stats - hand built inline SVG charts.
 *
 * No chart library and no external assets: Spotify's CSP blocks both. Colors
 * come from CSS classes so the charts follow the active theme.
 */
const StatsCharts = (function () {
    const CHART_WIDTH = 720;

    const CELL_MIN = 11;
    const CELL_MAX = 34;
    const CELL_GAP = 3;
    const LEVELS = 4;

    // Legend cells keep the original size no matter how the grid scales.
    const LEGEND_CELL = 12;
    const LEGEND_PITCH = 15;

    function el(tag, props, children) {
        return Spicetify.React.createElement(tag, props, children);
    }

    function level(value, max) {
        if (!value) return 0;
        if (!max) return 1;
        return Math.min(LEVELS, Math.ceil((value / max) * LEVELS));
    }

    /* Horizontal bars for the top lists. One SVG per chart, rows are groups so
     * label, bar and value stay aligned without any measuring. */
    function barChart(rows, options) {
        const opts = options || {};
        const showRank = !!opts.rank;
        const twoLine = rows.some((row) => row.sublabel);

        const rowHeight = twoLine ? 44 : 36;
        const rankWidth = showRank ? 26 : 0;
        const labelWidth = 232;
        const valueWidth = 74;
        const barX = rankWidth + labelWidth;
        const barWidth = CHART_WIDTH - barX - valueWidth;
        const height = Math.max(rows.length, 1) * rowHeight;

        let max = 0;
        for (const row of rows) if (row.value > max) max = row.value;
        if (!max) max = 1;

        const groups = rows.map((row, index) => {
            const center = rowHeight / 2;
            const width = Math.max(3, Math.round((barWidth * row.value) / max));
            const children = [];

            if (showRank) {
                children.push(
                    el("text", { key: "rank", className: "stats-bar-rank", x: 0, y: center + 4 }, String(index + 1))
                );
            }

            children.push(
                el(
                    "text",
                    {
                        key: "label",
                        className: "stats-bar-label",
                        x: rankWidth,
                        y: twoLine ? center - 3 : center + 4
                    },
                    StatsFormat.clip(row.label, 28)
                )
            );

            if (twoLine) {
                children.push(
                    el(
                        "text",
                        { key: "sub", className: "stats-bar-sublabel", x: rankWidth, y: center + 13 },
                        StatsFormat.clip(row.sublabel || "", 32)
                    )
                );
            }

            children.push(
                el("rect", {
                    key: "track",
                    className: "stats-bar-track",
                    x: barX,
                    y: center - 5,
                    width: barWidth,
                    height: 10,
                    rx: 5
                })
            );
            children.push(
                el("rect", {
                    key: "value",
                    className: "stats-bar-value",
                    x: barX,
                    y: center - 5,
                    width: width,
                    height: 10,
                    rx: 5
                })
            );
            children.push(
                el(
                    "text",
                    {
                        key: "number",
                        className: "stats-bar-number",
                        x: CHART_WIDTH,
                        y: center + 4,
                        textAnchor: "end"
                    },
                    row.valueLabel
                )
            );
            children.push(el("title", { key: "title" }, row.title || row.label));

            return el(
                "g",
                { key: row.key || row.label + index, transform: "translate(0," + index * rowHeight + ")" },
                children
            );
        });

        return el(
            "svg",
            {
                className: "stats-chart",
                viewBox: "0 0 " + CHART_WIDTH + " " + height,
                width: CHART_WIDTH,
                height: height,
                role: "img",
                "aria-label": opts.ariaLabel || "bar chart"
            },
            groups
        );
    }

    // Cells grow when the window is short, so a 30 day range does not end up
    // as a postage stamp in a full width card.
    function cellSize(columnCount, gutter) {
        const size = Math.floor((CHART_WIDTH - gutter) / columnCount) - CELL_GAP;
        return Math.max(CELL_MIN, Math.min(CELL_MAX, size));
    }

    /* GitHub style contribution grid. In "weeks" mode columns are weeks and
     * rows run Monday to Sunday; in "days" mode every column is a single day.
     * Both are the same grid maths, only the axis labels differ. */
    function heatmap(calendar, options) {
        const opts = options || {};
        const columns = calendar.columns;
        const daysMode = calendar.mode === "days";

        const gutter = daysMode ? 0 : 30;
        const cell = cellSize(columns.length, gutter);
        const pitch = cell + CELL_GAP;
        const top = daysMode ? 32 : 22;

        const width = gutter + columns.length * pitch;
        const height = top + calendar.rows * pitch;
        const children = [];

        if (daysMode) {
            // One column per day: weekday over the date.
            columns.forEach((column, index) => {
                const day = column[0];
                const x = index * pitch + cell / 2;
                children.push(
                    el(
                        "text",
                        { key: "wd" + index, className: "stats-heatmap-axis", x: x, y: 11, textAnchor: "middle" },
                        StatsFormat.weekdayName(day.weekday)
                    )
                );
                children.push(
                    el(
                        "text",
                        { key: "dom" + index, className: "stats-heatmap-axis", x: x, y: 24, textAnchor: "middle" },
                        String(day.dayOfMonth)
                    )
                );
            });
        } else {
            // Month labels, skipped when they would collide with the previous.
            let lastMonth = -1;
            let lastLabelX = -999;
            columns.forEach((column, index) => {
                const month = column[0].month;
                const x = gutter + index * pitch;
                if (month !== lastMonth && x - lastLabelX >= 30) {
                    children.push(
                        el(
                            "text",
                            { key: "month" + index, className: "stats-heatmap-axis", x: x, y: 10 },
                            StatsFormat.monthName(month)
                        )
                    );
                    lastLabelX = x;
                }
                lastMonth = month;
            });

            [0, 2, 4].forEach((row) => {
                children.push(
                    el(
                        "text",
                        {
                            key: "weekday" + row,
                            className: "stats-heatmap-axis",
                            x: 0,
                            y: top + row * pitch + cell / 2 + 3
                        },
                        StatsFormat.weekdayName(row)
                    )
                );
            });
        }

        columns.forEach((column, columnIndex) => {
            column.forEach((day, rowIndex) => {
                if (day.future) return;

                const shade = level(day.ms, calendar.max);
                const classes = ["stats-cell", "stats-cell-" + shade];
                if (!day.inRange) classes.push("stats-cell-muted");

                const tooltip = day.plays
                    ? StatsFormat.date(day.ts) +
                      " · " +
                      day.plays +
                      " " +
                      StatsFormat.plural(day.plays, "play", "plays") +
                      " · " +
                      StatsFormat.duration(day.ms)
                    : StatsFormat.date(day.ts) + " · nothing played";

                children.push(
                    el(
                        "rect",
                        {
                            key: day.ts,
                            className: classes.join(" "),
                            x: gutter + columnIndex * pitch,
                            y: top + rowIndex * pitch,
                            width: cell,
                            height: cell,
                            rx: Math.min(4, cell / 4),
                            onMouseEnter: opts.onHover ? () => opts.onHover(day) : undefined
                        },
                        el("title", null, tooltip)
                    )
                );
            });
        });

        return el(
            "svg",
            {
                className: "stats-heatmap",
                viewBox: "0 0 " + width + " " + height,
                width: width,
                height: height,
                role: "img",
                "aria-label": "listening activity per day",
                onMouseLeave: opts.onHover ? () => opts.onHover(null) : undefined
            },
            children
        );
    }

    function heatmapLegend() {
        const cells = [];
        for (let shade = 0; shade <= LEVELS; shade++) {
            cells.push(
                el("rect", {
                    key: shade,
                    className: "stats-cell stats-cell-" + shade,
                    x: shade * LEGEND_PITCH,
                    y: 0,
                    width: LEGEND_CELL,
                    height: LEGEND_CELL,
                    rx: 2.5
                })
            );
        }
        const width = LEVELS * LEGEND_PITCH + LEGEND_CELL;
        return el(
            "svg",
            {
                className: "stats-legend-grid",
                viewBox: "0 0 " + width + " " + LEGEND_CELL,
                width: width,
                height: LEGEND_CELL,
                "aria-hidden": "true"
            },
            cells
        );
    }

    return {
        barChart: barChart,
        heatmap: heatmap,
        heatmapLegend: heatmapLegend
    };
})();
