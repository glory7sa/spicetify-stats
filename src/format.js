/* Spicetify Stats - display formatting.
 *
 * Dates and times use a fixed English format rather than the system locale,
 * so the page reads the same on every machine and matches the English UI.
 */
const StatsFormat = (function () {
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    // Monday first, the same order the heatmap grid uses.
    const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

    // "12 Mar 2026"
    function date(ts) {
        const value = new Date(ts);
        if (isNaN(value.getTime())) return "";
        return value.getDate() + " " + MONTHS[value.getMonth()] + " " + value.getFullYear();
    }

    // "12 Mar 2026, 19:55" - 24 hour, no seconds.
    function dateTime(ts) {
        const value = new Date(ts);
        if (isNaN(value.getTime())) return "";
        return date(ts) + ", " + pad(value.getHours()) + ":" + pad(value.getMinutes());
    }

    function monthName(monthIndex) {
        return MONTHS[monthIndex] || "";
    }

    // Index 0 is Monday, matching the heatmap rows.
    function weekdayName(weekdayIndex) {
        return WEEKDAYS[weekdayIndex] || "";
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
        weekdayName: weekdayName,
        bytes: bytes,
        clip: clip,
        plural: plural
    };
})();
