/* Spicetify Stats - display formatting.
 * Shared by the views and the charts, kept locale aware where it is free.
 */
const StatsFormat = (function () {
    function pad(value) {
        return String(value).padStart(2, "0");
    }

    // Listening time stays in hours even past a day - "128h 12m" reads better
    // than a day count for a stats page.
    function duration(ms) {
        const minutes = Math.round((ms || 0) / 60000);
        if (minutes < 60) return minutes + " min";
        return Math.floor(minutes / 60) + "h " + pad(minutes % 60) + "m";
    }

    // Short form for the summary tiles, where the unit sits on its own line.
    function durationParts(ms) {
        const minutes = Math.round((ms || 0) / 60000);
        if (minutes < 60) return { value: String(minutes), unit: "minutes" };
        const hours = minutes / 60;
        if (hours < 10) return { value: (Math.round(hours * 10) / 10).toFixed(1), unit: "hours" };
        return { value: String(Math.round(hours)), unit: "hours" };
    }

    function number(value) {
        try {
            return (value || 0).toLocaleString();
        } catch (e) {
            return String(value || 0);
        }
    }

    function date(ts) {
        try {
            return new Date(ts).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric"
            });
        } catch (e) {
            return "";
        }
    }

    function dateTime(ts) {
        try {
            return new Date(ts).toLocaleString();
        } catch (e) {
            return "";
        }
    }

    function monthName(monthIndex) {
        try {
            return new Date(2020, monthIndex, 1).toLocaleDateString(undefined, { month: "short" });
        } catch (e) {
            return String(monthIndex + 1);
        }
    }

    function bytes(value) {
        if (value < 1024) return value + " B";
        if (value < 1024 * 1024) return Math.round(value / 1024) + " KB";
        return (value / (1024 * 1024)).toFixed(1) + " MB";
    }

    function clip(text, max) {
        const value = String(text == null ? "" : text);
        return value.length > max ? value.slice(0, max - 1).trimEnd() + "…" : value;
    }

    function plural(count, singular, pluralForm) {
        return count === 1 ? singular : pluralForm;
    }

    return {
        duration: duration,
        durationParts: durationParts,
        number: number,
        date: date,
        dateTime: dateTime,
        monthName: monthName,
        bytes: bytes,
        clip: clip,
        plural: plural
    };
})();
