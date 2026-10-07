(() => {
  const TEXT = {
    de: {
      back: "Zurück zu jakuschin.de",
      eyebrow: "Live-Demo",
      intro: "Projekte nach Typ, Branche und Technologie filtern, durchsuchen und sortieren, ohne dass die Seite neu lädt. Eine eigenständige Neuumsetzung meines IHK-Abschlussprojekts in reinem JavaScript, ohne WordPress.",
      sample: "Alle Projekte sind fiktive Beispieldaten.",
      searchLabel: "Suche",
      searchPlaceholder: "z. B. Hotel, Buchung, Plugin",
      facet_typ: "Typ",
      facet_branche: "Branche",
      facet_technologie: "Technologie",
      sortLabel: "Sortierung",
      sort_date_desc: "Neueste zuerst",
      sort_date_asc: "Älteste zuerst",
      sort_name_asc: "Titel A–Z",
      sort_name_desc: "Titel Z–A",
      reset: "Filter zurücksetzen",
      loading: "Projekte werden geladen …",
      found: (n) => (n === 1 ? "1 Projekt gefunden" : `${n} Projekte gefunden`),
      pageOf: (p, t) => `Seite ${p} von ${t}`,
      emptyTitle: "Keine Treffer für diese Kombination",
      emptyText: "Entferne einen Filter oder ändere den Suchbegriff.",
      error: "Die Projekte konnten nicht geladen werden.",
      retry: "Erneut versuchen",
      prev: "Zurück",
      next: "Weiter",
      pagination: "Seitennavigation",
      pageLabel: (p) => `Seite ${p}`,
      results: "Ergebnisse",
      howTitle: "So funktioniert es",
      how: [
        "Jede Änderung aktualisiert einen zentralen Filterzustand und löst eine Anfrage an die Datenschicht aus.",
        "Die Suche wartet 250 ms nach dem letzten Tastendruck (Debounce). Eine noch laufende Anfrage wird per AbortController abgebrochen.",
        "Die Datenschicht validiert alle Parameter, filtert, sortiert, paginiert und liefert Trefferzahlen je Filterwert. Wiederholte Anfragen kommen aus einem Cache.",
        "Die Trefferzahl wird über eine aria-live-Region an Screenreader gemeldet. Alle Filter sind per Tastatur bedienbar, und der Filterzustand steht in der URL.",
      ],
      footer: "Demo von Eduard Jakuschin",
    },
    en: {
      back: "Back to jakuschin.de",
      eyebrow: "Live demo",
      intro: "Filter, search and sort projects by type, industry and technology without a page reload. A standalone rebuild of my final IHK project in plain JavaScript, without WordPress.",
      sample: "All projects are fictional sample data.",
      searchLabel: "Search",
      searchPlaceholder: "e.g. hotel, booking, plugin",
      facet_typ: "Type",
      facet_branche: "Industry",
      facet_technologie: "Technology",
      sortLabel: "Sort by",
      sort_date_desc: "Newest first",
      sort_date_asc: "Oldest first",
      sort_name_asc: "Title A–Z",
      sort_name_desc: "Title Z–A",
      reset: "Reset filters",
      loading: "Loading projects …",
      found: (n) => (n === 1 ? "1 project found" : `${n} projects found`),
      pageOf: (p, t) => `Page ${p} of ${t}`,
      emptyTitle: "No results for this combination",
      emptyText: "Remove a filter or change the search term.",
      error: "The projects could not be loaded.",
      retry: "Try again",
      prev: "Previous",
      next: "Next",
      pagination: "Pagination",
      pageLabel: (p) => `Page ${p}`,
      results: "Results",
      howTitle: "How it works",
      how: [
        "Every change updates one central filter state and sends a request to the data layer.",
        "Search waits 250 ms after the last keystroke (debounce). A request that is still running is cancelled with an AbortController.",
        "The data layer validates all parameters, filters, sorts, paginates and returns result counts per filter value. Repeated requests are served from a cache.",
        "The result count is announced to screen readers through an aria-live region. All filters work with the keyboard, and the filter state is kept in the URL.",
      ],
      footer: "Demo by Eduard Jakuschin",
    },
  };

  const DEFAULTS = { page: 1, perPage: 9, sort: "date", order: "desc", search: "" };
  const SEARCH_DEBOUNCE_MS = 250;

  const state = {
    ...DEFAULTS,
    typ: [],
    branche: [],
    technologie: [],
    lang: "de",
    abortController: null,
  };

  let taxonomies = null;
  let lastResponse = null;

  const el = {
    search: document.getElementById("pf-search"),
    sort: document.getElementById("pf-sort"),
    reset: document.getElementById("pf-reset"),
    facets: document.getElementById("pf-facets"),
    status: document.getElementById("pf-status"),
    results: document.getElementById("pf-results"),
    resultsHeading: document.getElementById("pf-results-heading"),
    list: document.getElementById("pf-list"),
    empty: document.getElementById("pf-empty"),
    error: document.getElementById("pf-error"),
    retry: document.getElementById("pf-retry"),
    pagination: document.getElementById("pf-pagination"),
    how: document.getElementById("pf-how"),
  };

  const t = (key) => TEXT[state.lang][key];

  function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function readUrl() {
    try {
      const query = new URLSearchParams(window.location.search);
      if (query.has("page")) state.page = Number.parseInt(query.get("page"), 10) || 1;
      if (query.has("q")) state.search = query.get("q");
      const [sort, order] = (query.get("sort") || "").split("-");
      if (sort && order) Object.assign(state, { sort, order });
      for (const facet of ProjectApi.FACETS) {
        if (query.has(facet)) state[facet] = query.get(facet).split(",").filter(Boolean);
      }
    } catch (e) { /* ohne URL-Parameter starten */ }
  }

  function writeUrl() {
    const query = new URLSearchParams();
    if (state.search) query.set("q", state.search);
    for (const facet of ProjectApi.FACETS) {
      if (state[facet].length) query.set(facet, state[facet].join(","));
    }
    if (state.sort !== DEFAULTS.sort || state.order !== DEFAULTS.order) query.set("sort", `${state.sort}-${state.order}`);
    if (state.page > 1) query.set("page", state.page);
    const qs = query.toString();
    try {
      history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    } catch (e) { /* z. B. in eingebetteten Vorschauen nicht erlaubt */ }
  }

  function hasActiveFilters() {
    return Boolean(state.search) || ProjectApi.FACETS.some((facet) => state[facet].length > 0);
  }

  function setLoading(isLoading) {
    el.results.setAttribute("aria-busy", String(isLoading));
    el.results.classList.toggle("is-loading", isLoading);
  }

  async function loadProjects() {
    if (state.abortController) state.abortController.abort();
    const controller = new AbortController();
    state.abortController = controller;

    writeUrl();
    el.reset.hidden = !hasActiveFilters();
    el.error.hidden = true;
    setLoading(true);
    if (!lastResponse) el.status.textContent = t("loading");

    try {
      const response = await ProjectApi.query({
        page: state.page,
        perPage: state.perPage,
        sort: state.sort,
        order: state.order,
        search: state.search,
        typ: state.typ,
        branche: state.branche,
        technologie: state.technologie,
        lang: state.lang,
      }, { signal: controller.signal });

      state.page = response.pagination.page;
      lastResponse = response;
      updateView(response);
    } catch (error) {
      if (error.name === "AbortError") return;
      el.list.replaceChildren();
      el.pagination.replaceChildren();
      el.empty.hidden = true;
      el.error.hidden = false;
      el.status.textContent = t("error");
    } finally {
      if (state.abortController === controller) {
        state.abortController = null;
        setLoading(false);
      }
    }
  }

  function label(facet, term) {
    return taxonomies?.[facet]?.[term]?.[state.lang] ?? term;
  }

  function renderFacets() {
    const groups = ProjectApi.FACETS.map((facet) => {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "facet";
      const legend = document.createElement("legend");
      legend.textContent = t(`facet_${facet}`);
      const options = document.createElement("div");
      options.className = "chips";

      for (const term of Object.keys(taxonomies[facet])) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chip";
        button.dataset.facet = facet;
        button.dataset.term = term;
        button.id = `pf-${facet}-${term}`;
        button.setAttribute("aria-pressed", String(state[facet].includes(term)));

        const name = document.createElement("span");
        name.textContent = label(facet, term);
        const count = document.createElement("span");
        count.className = "chip-count";
        count.setAttribute("aria-hidden", "true");

        button.append(name, count);
        options.append(button);
      }
      fieldset.append(legend, options);
      return fieldset;
    });
    el.facets.replaceChildren(...groups);
  }

  function updateFacetCounts(facets) {
    el.facets.querySelectorAll(".chip").forEach((button) => {
      const { facet, term } = button.dataset;
      const count = facets[facet][term] ?? 0;
      const active = state[facet].includes(term);
      button.setAttribute("aria-pressed", String(active));
      button.querySelector(".chip-count").textContent = count;
      button.setAttribute("aria-label", `${label(facet, term)} (${count})`);
      button.disabled = count === 0 && !active;
    });
  }

  function formatDate(iso) {
    const [year, month] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat(state.lang, { month: "short", year: "numeric" }).format(new Date(year, month - 1, 1));
  }

  function initials(name) {
    return name.split(/\s+/).filter((word) => /^[A-Za-zÄÖÜäöü]/.test(word)).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  }

  function renderCard(item) {
    const li = document.createElement("li");
    const article = document.createElement("article");
    article.className = "card";

    const thumb = document.createElement("div");
    thumb.className = `thumb thumb--${item.branche}`;
    thumb.setAttribute("aria-hidden", "true");
    const mark = document.createElement("span");
    mark.className = "thumb-mark";
    mark.textContent = initials(item.client);
    const type = document.createElement("span");
    type.className = "thumb-type";
    type.textContent = label("typ", item.typ);
    thumb.append(type, mark);

    const body = document.createElement("div");
    body.className = "card-body";

    const meta = document.createElement("p");
    meta.className = "card-meta";
    meta.textContent = `${item.client} · ${label("branche", item.branche)} · ${formatDate(item.date)}`;

    const title = document.createElement("h3");
    title.textContent = item.title;

    const excerpt = document.createElement("p");
    excerpt.className = "card-text";
    excerpt.textContent = item.excerpt;

    const tags = document.createElement("ul");
    tags.className = "card-tags";
    tags.setAttribute("aria-label", t("facet_technologie"));
    for (const term of item.technologie) {
      const tag = document.createElement("li");
      tag.textContent = label("technologie", term);
      tags.append(tag);
    }

    body.append(meta, title, excerpt, tags);
    article.append(thumb, body);
    li.append(article);
    return li;
  }

  function pageButton(text, page, { current = false, disabled = false, ariaLabel } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-btn";
    button.textContent = text;
    button.dataset.page = page;
    button.disabled = disabled;
    if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
    if (current) button.setAttribute("aria-current", "page");
    return button;
  }

  function renderPagination({ page, totalPages }) {
    if (totalPages <= 1) {
      el.pagination.replaceChildren();
      el.pagination.hidden = true;
      return;
    }
    el.pagination.hidden = false;
    el.pagination.setAttribute("aria-label", t("pagination"));
    const buttons = [pageButton(`← ${t("prev")}`, page - 1, { disabled: page === 1 })];
    for (let p = 1; p <= totalPages; p += 1) {
      buttons.push(pageButton(String(p), p, { current: p === page, ariaLabel: t("pageLabel")(p) }));
    }
    buttons.push(pageButton(`${t("next")} →`, page + 1, { disabled: page === totalPages }));
    el.pagination.replaceChildren(...buttons);
  }

  function updateView(response) {
    const { items, pagination, facets } = response;
    updateFacetCounts(facets);

    el.list.replaceChildren(...items.map(renderCard));
    el.empty.hidden = items.length > 0;
    renderPagination(pagination);

    const pageInfo = pagination.totalPages > 1 ? ` · ${t("pageOf")(pagination.page, pagination.totalPages)}` : "";
    el.status.textContent = items.length ? `${t("found")(pagination.total)}${pageInfo}` : t("emptyTitle");
  }

  function renderStaticText() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-t]").forEach((node) => {
      const value = t(node.dataset.t);
      if (typeof value === "string") node.textContent = value;
    });
    el.search.placeholder = t("searchPlaceholder");
    for (const option of el.sort.options) option.textContent = t(`sort_${option.value.replace("-", "_")}`);
    el.how.replaceChildren(...t("how").map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }));
    document.querySelectorAll(".lang button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === state.lang));
    });
  }

  function setLanguage(lang) {
    state.lang = lang;
    try { localStorage.setItem("lang", lang); } catch (e) { /* Speicher nicht verfügbar */ }
    renderStaticText();
    if (taxonomies) {
      renderFacets();
      if (lastResponse) updateFacetCounts(lastResponse.facets);
      loadProjects();
    }
  }

  function bindEvents() {
    el.facets.addEventListener("click", (event) => {
      const button = event.target.closest(".chip");
      if (!button || button.disabled) return;
      const { facet, term } = button.dataset;
      const selected = state[facet];
      state[facet] = selected.includes(term) ? selected.filter((x) => x !== term) : [...selected, term];
      state.page = 1;
      loadProjects();
    });

    const onSearch = debounce(() => {
      state.search = el.search.value.trim();
      state.page = 1;
      loadProjects();
    }, SEARCH_DEBOUNCE_MS);
    el.search.addEventListener("input", onSearch);
    el.search.closest("form").addEventListener("submit", (event) => event.preventDefault());

    el.sort.addEventListener("change", () => {
      const [sort, order] = el.sort.value.split("-");
      Object.assign(state, { sort, order, page: 1 });
      loadProjects();
    });

    el.reset.addEventListener("click", () => {
      Object.assign(state, { page: 1, search: "", typ: [], branche: [], technologie: [] });
      el.search.value = "";
      loadProjects();
      el.search.focus();
    });

    el.pagination.addEventListener("click", (event) => {
      const button = event.target.closest(".page-btn");
      if (!button || button.disabled) return;
      state.page = Number(button.dataset.page);
      loadProjects();
      el.resultsHeading.focus({ preventScroll: true });
      el.results.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    el.retry.addEventListener("click", init);

    document.querySelectorAll(".lang button").forEach((button) => {
      button.addEventListener("click", () => setLanguage(button.dataset.lang));
    });
  }

  function detectLanguage() {
    let saved = null;
    try { saved = localStorage.getItem("lang"); } catch (e) { /* Speicher nicht verfügbar */ }
    if (saved === "de" || saved === "en") return saved;
    return (navigator.language || "de").toLowerCase().startsWith("de") ? "de" : "en";
  }

  async function init() {
    try {
      taxonomies = await ProjectApi.taxonomies();
    } catch (error) {
      el.error.hidden = false;
      el.status.textContent = t("error");
      return;
    }
    renderFacets();
    loadProjects();
  }

  state.lang = detectLanguage();
  readUrl();
  el.search.value = state.search;
  el.sort.value = `${state.sort}-${state.order}`;
  if (!el.sort.value) {
    Object.assign(state, { sort: DEFAULTS.sort, order: DEFAULTS.order });
    el.sort.value = `${DEFAULTS.sort}-${DEFAULTS.order}`;
  }
  renderStaticText();
  bindEvents();
  init();
})();
