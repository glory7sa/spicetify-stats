/* Local presentation layer. Manual genre labels never change listening events.
 * No network, external assets, build step or inferred genre metadata.
 */
const StatsDesign = (function () {
    const KEY = "spicetify-stats:manual-genres:v1";
    const UNKNOWN = "Без жанра";
    const SUGGESTIONS = ["Wave", "Hardwave", "Phonk", "Atmospheric Phonk", "Dark Ambient", "Hip-Hop", "Trap", "Indie Rock", "Alternative Rock", "Pop", "Electronic", "Jazz"];
    const color = (i) => "var(--stats-tone-" + (i % 6) + ")";
    const el = (tag, props, children) => Spicetify.React.createElement(tag, props, children);

    function readLabels() {
        try {
            const value = JSON.parse(localStorage.getItem(KEY) || "{}");
            if (!value || typeof value !== "object" || Array.isArray(value)) return {};
            return Object.fromEntries(Object.entries(value).filter(([k, v]) => k && typeof v === "string" && v.length <= 60));
        } catch (_) { return {}; }
    }

    function scoped(events, days) {
        if (!days) return events;
        const from = new Date();
        from.setHours(0, 0, 0, 0);
        from.setDate(from.getDate() - days + 1);
        return events.filter(e => e.ts >= from.getTime());
    }

    // Count a play once, using only its first credited artist.
    function genreData(events, labels, days) {
        const source = scoped(events, days);
        const totals = new Map();
        let known = 0;
        for (const event of source) {
            const artist = event.artists && event.artists[0];
            const key = artist && (artist.uri || artist.name);
            const label = key && Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : "";
            const name = label || UNKNOWN;
            if (label) known++;
            totals.set(name, (totals.get(name) || 0) + 1);
        }
        const rows = Array.from(totals, ([name, count]) => ({ name, count })).sort((a,b) => b.count-a.count || a.name.localeCompare(b.name));
        return { rows, total: source.length, known };
    }

    function Genres(props) {
        const React = Spicetify.React;
        const [labels, setLabels] = React.useState(readLabels);
        const [artistKey, setArtistKey] = React.useState("");
        const [genre, setGenre] = React.useState("");
        const [status, setStatus] = React.useState("");
        const artists = React.useMemo(() => {
            const result = new Map();
            for (const event of props.events) {
                const artist = event.artists && event.artists[0];
                if (artist && artist.name) result.set(artist.uri || artist.name, artist.name);
            }
            return Array.from(result).sort((a,b) => a[1].localeCompare(b[1]));
        }, [props.events]);
        const data = React.useMemo(() => genreData(props.events, labels, props.days), [props.events, labels, props.days]);
        const selected = artistKey || (artists[0] && artists[0][0]) || "";
        React.useEffect(() => { setGenre(labels[selected] || ""); }, [selected, labels]);
        function save(event) {
            event.preventDefault();
            if (!selected) return;
            const next = Object.assign({}, labels);
            const value = genre.trim();
            if (value) Object.defineProperty(next, selected, { value, enumerable: true, configurable: true, writable: true });
            else delete next[selected];
            try {
                localStorage.setItem(KEY, JSON.stringify(next));
                setLabels(next);
                setStatus(value ? "Жанр сохранён. Диаграмма обновлена." : "Метка жанра удалена.");
            } catch (_) { setStatus("Не удалось сохранить: хранилище недоступно или заполнено."); }
        }
        const coverage = data.total ? Math.round(100 * data.known / data.total) : 0;
        let offset = 0;
        const segments = data.rows.map((row,i) => {
            const length = 100 * row.count / data.total;
            const circle = el("circle", { key: row.name, cx: 100, cy: 100, r: 76, pathLength: 100,
                fill: "none", stroke: row.name === UNKNOWN ? "var(--spice-highlight)" : color(i), strokeWidth: 18,
                strokeDasharray: length + " " + (100-length), strokeDashoffset: -offset,
                transform: "rotate(-90 100 100)" }, el("title", null, row.name + ": " + row.count));
            offset += length;
            return circle;
        });
        const body = [
            el("div", { key: "layout", className: "stats-genre-layout" }, [
                el("svg", { key: "ring", className: "stats-donut", viewBox: "0 0 200 200", role: "img", "aria-label": "Жанры: классифицировано " + coverage + "% прослушиваний" }, [
                    el("circle", { key: "base", cx: 100, cy: 100, r: 76, fill: "none", stroke: "var(--spice-highlight)", strokeWidth: 18 }),
                    ...segments,
                    el("text", { key: "value", x:100, y:98, textAnchor:"middle", className:"stats-donut-value" }, coverage + "%"),
                    el("text", { key: "label", x:100, y:121, textAnchor:"middle", className:"stats-donut-label" }, "с жанром")
                ]),
                el("div", { key: "list", className: "stats-genre-list" }, data.rows.length ? data.rows.map((row,i) =>
                    el("div", { key:row.name, className:"stats-genre-row", style:{"--stats-accent": row.name === UNKNOWN ? "var(--spice-subtext)" : color(i)} }, [
                        el("div", {key:"head", className:"stats-genre-head"}, [el("strong", {key:"name"},row.name), el("span",{key:"value"},(100*row.count/data.total).toFixed(1)+"%")]),
                        el("div", {key:"bar", className:"stats-meter"}, el("span", {style:{width:(100*row.count/data.total)+"%"}})),
                        el("small",{key:"count"},row.count + " прослушиваний")
                    ])
                ) : statsEmpty("В этом периоде пока нет подробных записей."))
            ]),
            el("details", {key:"editor", className:"stats-genre-editor"}, [
                el("summary",{key:"title"},"Назначить жанры исполнителям"),
                el("p",{key:"hint",className:"stats-empty"},"Это ваши метки, а не жанры Spotify. Один основной жанр на первого исполнителя трека. Пустое поле удаляет метку."),
                el("form",{key:"form", onSubmit:save, className:"stats-genre-form"},[
                    el("label",{key:"artist"},["Исполнитель",el("select",{key:"select",value:selected,onChange:e=>{setArtistKey(e.target.value);setGenre(labels[e.target.value] || "");}},artists.map(([key,name])=>el("option",{key,value:key},name)))]),
                    el("label",{key:"genre"},["Жанр",el("input",{key:"input",value:genre,maxLength:60,list:"stats-genre-options",placeholder:labels[selected] || "Например: Wave",onChange:e=>setGenre(e.target.value)})]),
                    el("datalist",{key:"options",id:"stats-genre-options"},SUGGESTIONS.map(name=>el("option",{key:name,value:name}))),
                    el("button",{key:"save",type:"submit",disabled:!selected,className:"stats-save"},"Сохранить")
                ]),
                el("p",{key:"status",role:"status",className:"stats-empty"},status)
            ]),
            el("p",{key:"note",className:"stats-note"},"Доли по числу прослушиваний, включая «Без жанра». Только подробные записи; старые месячные итоги не включены. Метки хранятся на этом компьютере.")
        ];
        return statsCard("genres","Музыкальная палитра","Жанры твоей коллекции · ручная классификация",body,"stats-card-wide stats-genre-card");
    }

    function ranking(rows, tracks) {
        const max = rows.length ? rows[0].plays : 1;
        return el("ol", {className:"stats-ranking"},rows.map((row,i)=>el("li",{key:row.uri || row.name,className:"stats-ranking-row"},[
            el("span",{key:"rank",className:"stats-ranking-number"},String(i+1).padStart(2,"0")),
            el("div",{key:"detail",className:"stats-ranking-detail"},[
                el("strong",{key:"name",title:tracks ? row.title : row.name},tracks ? row.title : row.name),
                tracks ? el("small",{key:"artist"},row.artist) : null,
                el("div",{key:"bar",className:"stats-meter",style:{"--stats-accent":color(i)}},el("span",{style:{width:100*row.plays/max+"%"}}))
            ]),
            el("span",{key:"count",className:"stats-ranking-count",title:"Число прослушиваний"},StatsFormat.number(row.plays))
        ])));
    }

    function activity(calendar, range) {
        const days = calendar.columns.flat().filter(d=>d.inRange);
        const maximum = Math.max(60000,...days.map(d=>d.ms));
        const width = 900, height = 200, left = 54, right = 884, bottom = 164;
        const step = (right-left)/Math.max(1,days.length);
        const shapes = [];
        for (let i=0;i<=3;i++) {
            const y = bottom-i*46;
            shapes.push(el("line",{key:"grid"+i,x1:left,x2:right,y1:y,y2:y,stroke:"currentColor",opacity:0.12}));
            shapes.push(el("text",{key:"tick"+i,x:left-10,y:y+4,textAnchor:"end",className:"stats-axis"},String(Math.round(maximum*i/3/60000))));
        }
        days.forEach((day,i)=>{
            const h = 138*day.ms/maximum;
            shapes.push(el("rect",{key:day.ts,x:left+i*step+step*.15,y:bottom-h,width:step*.7,height:h,rx:Math.min(4,step*.2),fill:color(0)},el("title",null,StatsFormat.date(day.ts)+" · "+StatsFormat.duration(day.ms)+" · "+day.plays+" прослушиваний")));
        });
        if (days.length) [0,days.length-1].forEach((i,k)=>shapes.push(el("text",{key:"date"+k,x:k?right:left,y:190,textAnchor:k?"end":"start",className:"stats-axis"},StatsFormat.date(days[i].ts))));
        return statsCard("trend","Ритм прослушивания", "Минуты в день · " + (range.days ? "последние " + range.days + " дней" : "доступная подробная история, максимум 53 недели"),[
            el("svg",{key:"graph",className:"stats-trend",viewBox:"0 0 "+width+" "+height,role:"img","aria-label":"Время прослушивания по дням в минутах"},shapes),
            el("details",{key:"data",className:"stats-genre-editor"},[
                el("summary",{key:"summary"},"Данные графика"),
                el("div",{key:"table",className:"stats-data-scroll"},el("table",null,[
                    el("thead",{key:"head"},el("tr",null,[el("th",{key:"d"},"Дата"),el("th",{key:"p"},"Прослушивания"),el("th",{key:"m"},"Минуты")])),
                    el("tbody",{key:"body"},days.map(d=>el("tr",{key:d.ts},[el("td",{key:"date"},StatsFormat.date(d.ts)),el("td",{key:"plays"},d.plays),el("td",{key:"ms"},(d.ms/60000).toFixed(1))])))
                ]))
            ]),
            el("p",{key:"note",className:"stats-note"},"Старые месячные итоги здесь не показаны. Нулевые дни не означают отсутствие прослушиваний на других устройствах.")
        ],"stats-card-wide");
    }
    return { Genres, ranking, activity, genreData, readLabels };
})();
