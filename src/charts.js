/* Spicetify Stats - hand built inline SVG charts.
 *
 * No chart library and no external assets: Spotify's CSP blocks both. Colors
 * come from CSS classes so the charts follow the active theme.
 */
const StatsCharts = (function () {
    const CHART_WIDTH = 720;

    const CELL = 12;
    const CELL_PITCH = 15;
    const GRID_LEFT = 30;
    const GRID_TOP = 22;
    const LEVELS = 4;

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

    /* GitHub style contribution grid: columns are weeks, rows Monday-Sunday,
     * shade by listening time. */
    function heatmap(calendar, options) {
        const opts = options || {};
        const columns = calendar.columns;
        const width = GRID_LEFT + columns.length * CELL_PITCH;
        const height = GRID_TOP + 7 * CELL_PITCH;
        const children = [];

        // Month labels, skipped when they would collide with the previous one.
        let lastMonth = -1;
        let lastLabelColumn = -99;
        columns.forEach((column, index) => {
            const month = column[0].month;
            if (month !== lastMonth && index - lastLabelColumn >= 3) {
                children.push(
                    el(
                        "text",
                        {
                            key: "month" + index,
                            className: "stats-heatmap-axis",
                            x: GRID_LEFT + index * CELL_PITCH,
                            y: 10
                        },
                        StatsFormat.monthName(month)
                    )
                );
                lastLabelColumn = index;
            }
            lastMonth = month;
        });

        ["Mon", "Wed", "Fri"].forEach((label, index) => {
            children.push(
                el(
                    "text",
                    {
                        key: "weekday" + label,
                        className: "stats-heatmap-axis",
                        x: 0,
                        y: GRID_TOP + index * 2 * CELL_PITCH + CELL - 2
                    },
                    label
                )
            );
        });

        columns.forEach((column, weekIndex) => {
            column.forEach((day, dayIndex) => {
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
                            x: GRID_LEFT + weekIndex * CELL_PITCH,
                            y: GRID_TOP + dayIndex * CELL_PITCH,
                            width: CELL,
                            height: CELL,
                            rx: 2.5,
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
                    x: shade * CELL_PITCH,
                    y: 0,
                    width: CELL,
                    height: CELL,
                    rx: 2.5
                })
            );
        }
        return el(
            "svg",
            {
                className: "stats-legend-grid",
                viewBox: "0 0 " + (LEVELS * CELL_PITCH + CELL) + " " + CELL,
                width: LEVELS * CELL_PITCH + CELL,
                height: CELL,
                "aria-hidden": "true"
            },
            cells
        );
    }

    return {
        barChart: barChart,
        heatmap: heatmap,
        heatmapLegend: heatmapLegend,
        level: level
    };
})();
