# Portfolio-Filter

Ein Filtermodul für Projekt-Referenzen in reinem JavaScript: Facettenfilter mit Trefferzahlen, Suche, Sortierung und Pagination, ohne Seitenreload.

Das Modul ist eine eigenständige Neuumsetzung meines IHK-Abschlussprojekts. Im Original lief es als WordPress-Plugin mit REST-API und `WP_Query`. Diese Version kommt ohne CMS und ohne Server aus und läuft direkt auf GitHub Pages. Alle Projekte in `data/projects.json` sind fiktive Beispieldaten.

## Aufbau

```
portfolio-filter/
├─ index.html          Markup und Styles
├─ js/api.js           Datenschicht: Validierung, Filter, Sortierung, Pagination, Facetten, Cache
├─ js/app.js           Oberfläche: Filterzustand, Events, Rendering, URL-Sync, DE/EN
└─ data/projects.json  Beispieldaten und Taxonomien (Typ, Branche, Technologie)
```

`api.js` verhält sich wie ein REST-Endpunkt. `query(params)` liefert immer dieselbe Struktur:

```json
{
  "items": [{ "id": 1, "title": "…", "excerpt": "…", "client": "…", "date": "2026-08-14", "typ": "website", "branche": "handwerk", "technologie": ["wordpress", "php"] }],
  "pagination": { "page": 1, "perPage": 9, "total": 24, "totalPages": 3, "hasMore": true },
  "facets": { "typ": { "website": 10 }, "branche": { "handwerk": 4 }, "technologie": { "php": 12 } }
}
```

Damit lässt sich die Datenschicht später gegen ein echtes Backend austauschen, zum Beispiel eine Spring-Boot-API mit Datenbank, ohne die Oberfläche anzupassen.

## Funktionen

- Filter nach Typ, Branche und Technologie: innerhalb einer Gruppe ODER, zwischen Gruppen UND
- Trefferzahl je Filterwert, berechnet mit allen anderen aktiven Filtern
- Volltextsuche mit 250 ms Debounce
- Abbruch überholter Anfragen per `AbortController`
- Sortierung nach Datum oder Titel, Pagination mit 9 Projekten pro Seite
- Validierung aller Parameter (Whitelists, Grenzen für `page` und `perPage`)
- Antwort-Cache für wiederholte Anfragen
- Leere Zustände, Fehlerzustand mit erneutem Versuch
- Barrierearm: Tastaturbedienung, `aria-pressed`, `aria-live`-Statuszeile, Fokus nach Seitenwechsel
- Filterzustand in der URL, z. B. `?typ=webapp&technologie=java`
- Deutsch und Englisch

`api.js` simuliert eine kurze Netzwerklatenz (180 ms), damit Ladezustand und Abbruch von Anfragen sichtbar werden.

## Lokal starten

Die Seite lädt `data/projects.json` per `fetch`. Browser blockieren das beim Öffnen per Doppelklick (`file://`). Lokal daher über einen kleinen Webserver öffnen, zum Beispiel mit der VS-Code-Erweiterung **Live Server** (Rechtsklick auf `index.html` → „Open with Live Server“).
