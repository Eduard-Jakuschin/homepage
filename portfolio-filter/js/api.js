/**
 * Datenschicht des Portfolio-Filters.
 *
 * Verhält sich wie ein REST-Endpunkt (GET /projects): Parameter werden validiert,
 * gefiltert, sortiert und paginiert, die Antwort enthält items, pagination und facets.
 * Die Daten kommen aus data/projects.json, damit die Demo ohne Server auf GitHub Pages läuft.
 * Ein echtes Backend (z. B. Spring Boot) kann später mit demselben Antwortformat
 * eingesetzt werden, ohne dass sich app.js ändert.
 */
const ProjectApi = (() => {
  const DATA_URL = "data/projects.json";
  const FACETS = ["typ", "branche", "technologie"];
  const SORT_FIELDS = ["date", "name"];
  const ORDERS = ["asc", "desc"];
  const MAX_PER_PAGE = 24;
  const SIMULATED_LATENCY_MS = 180;

  let dataPromise = null;
  const responseCache = new Map();

  function loadData() {
    if (!dataPromise) {
      dataPromise = fetch(DATA_URL).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      });
      dataPromise.catch(() => { dataPromise = null; });
    }
    return dataPromise;
  }

  function toInt(value, fallback, min, max) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(number, min), max);
  }

  function sanitize(raw, taxonomies) {
    const params = {
      page: toInt(raw.page, 1, 1, 9999),
      perPage: toInt(raw.perPage, 9, 1, MAX_PER_PAGE),
      sort: SORT_FIELDS.includes(raw.sort) ? raw.sort : "date",
      order: ORDERS.includes(raw.order) ? raw.order : "desc",
      search: String(raw.search ?? "").trim().slice(0, 80).toLowerCase(),
      lang: raw.lang === "en" ? "en" : "de",
    };
    for (const facet of FACETS) {
      const terms = Array.isArray(raw[facet]) ? raw[facet] : [];
      params[facet] = [...new Set(terms)].filter((term) => term in taxonomies[facet]).sort();
    }
    return params;
  }

  function termsOf(project, facet) {
    return Array.isArray(project[facet]) ? project[facet] : [project[facet]];
  }

  // Innerhalb einer Facette gilt ODER, zwischen den Facetten UND.
  function matches(project, params, skipFacet = null) {
    for (const facet of FACETS) {
      if (facet === skipFacet || params[facet].length === 0) continue;
      const terms = termsOf(project, facet);
      if (!params[facet].some((term) => terms.includes(term))) return false;
    }
    if (params.search) {
      const text = `${project.title[params.lang]} ${project.excerpt[params.lang]} ${project.client}`.toLowerCase();
      if (!text.includes(params.search)) return false;
    }
    return true;
  }

  // Trefferzahl je Begriff, berechnet mit allen aktiven Filtern außer der eigenen Facette.
  function countFacets(projects, params, taxonomies) {
    const facets = {};
    for (const facet of FACETS) {
      facets[facet] = Object.fromEntries(Object.keys(taxonomies[facet]).map((term) => [term, 0]));
      for (const project of projects) {
        if (!matches(project, params, facet)) continue;
        for (const term of termsOf(project, facet)) {
          if (term in facets[facet]) facets[facet][term] += 1;
        }
      }
    }
    return facets;
  }

  function comparator(params) {
    const direction = params.order === "asc" ? 1 : -1;
    if (params.sort === "name") {
      const collator = new Intl.Collator(params.lang);
      return (a, b) => direction * collator.compare(a.title[params.lang], b.title[params.lang]);
    }
    return (a, b) => direction * a.date.localeCompare(b.date) || a.id - b.id;
  }

  function toItem(project, lang) {
    return {
      id: project.id,
      title: project.title[lang],
      excerpt: project.excerpt[lang],
      client: project.client,
      date: project.date,
      typ: project.typ,
      branche: project.branche,
      technologie: project.technologie,
    };
  }

  function abortError() {
    return new DOMException("Request aborted", "AbortError");
  }

  function delay(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(abortError());
      }, { once: true });
    });
  }

  function buildResponse(data, params) {
    const filtered = data.projects.filter((project) => matches(project, params)).sort(comparator(params));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / params.perPage));
    const page = Math.min(params.page, totalPages);
    const start = (page - 1) * params.perPage;

    return {
      items: filtered.slice(start, start + params.perPage).map((project) => toItem(project, params.lang)),
      pagination: { page, perPage: params.perPage, total, totalPages, hasMore: page < totalPages },
      facets: countFacets(data.projects, params, data.taxonomies),
    };
  }

  async function query(rawParams, { signal } = {}) {
    const data = await loadData();
    const params = sanitize(rawParams, data.taxonomies);
    const cacheKey = JSON.stringify(params);

    if (!responseCache.has(cacheKey)) {
      responseCache.set(cacheKey, buildResponse(data, params));
    }
    await delay(SIMULATED_LATENCY_MS, signal);
    return responseCache.get(cacheKey);
  }

  async function taxonomies() {
    const data = await loadData();
    return data.taxonomies;
  }

  return { query, taxonomies, FACETS, MAX_PER_PAGE };
})();
