(() => {
  const STORAGE_KEY = "listing-tool-demo-v1";

  const GARMENTS = [
    {
      id: "denim-jacket",
      type: "jacket",
      name: "Vintage denim jacket",
      views: "front/back",
      photoCount: 2,
      palette: {
        studio: "#e4ebf1",
        studio2: "#f7f8f8",
        paper: "#f3f0ea",
        paper2: "#e6e0d4",
        cloth: "#3e6288",
        deep: "#2a4766",
        stitch: "#d5e1ec",
        metal: "#c6a15a",
        twill: true
      },
      spec: {
        brand: "Levi Strauss & Co.",
        category: "Jackets & Coats",
        size: "Men's M",
        color: "Medium indigo",
        condition: "Pre-owned — very good",
        materials: "100% cotton denim; brass buttons"
      },
      title: "Vintage Levi's Type III Trucker Jacket — Medium Indigo, Men's M",
      blurb: "Vintage Levi's Type III trucker in a medium indigo wash, men's size M. Button front, two chest pockets, and side tabs. The cotton denim is softly faded along the seams, and the brass buttons are still in place."
    },
    {
      id: "wool-overcoat",
      type: "coat",
      name: "Camel wool overcoat",
      views: "front/back",
      photoCount: 2,
      palette: {
        studio: "#f3efe8",
        studio2: "#faf8f4",
        paper: "#f6f1e8",
        paper2: "#e7dccb",
        cloth: "#c6a36a",
        deep: "#9a7840",
        stitch: "#f0e4cc",
        metal: "#5e4a32",
        twill: false
      },
      spec: {
        brand: "London Fog",
        category: "Coats & Jackets",
        size: "Women's 10",
        color: "Camel",
        condition: "Pre-owned — excellent",
        materials: "Wool blend shell; acetate lining"
      },
      title: "Vintage London Fog Camel Overcoat — Women's 10",
      blurb: "Vintage London Fog camel overcoat, women's size 10. Notched lapels, a single-breasted front, and a welt pocket at each hip. The wool-blend shell holds a clean line, with light wear at the cuffs."
    },
    {
      id: "silk-blouse",
      type: "blouse",
      name: "Ivory silk blouse",
      views: "front/detail",
      photoCount: 2,
      palette: {
        studio: "#f6f3ee",
        studio2: "#fbfaf7",
        paper: "#f7f4ef",
        paper2: "#ece4d8",
        cloth: "#f4efe6",
        deep: "#e4d9c8",
        stitch: "#b7aa9a",
        metal: "#f7f4ef",
        twill: false
      },
      spec: {
        brand: "No visible label",
        category: "Tops & Blouses",
        size: "S",
        color: "Ivory",
        condition: "Pre-owned — good",
        materials: "Silk"
      },
      title: "Vintage Ivory Silk Blouse — Size S, No Visible Brand",
      blurb: "Vintage ivory silk blouse, size S, with a soft point collar and covered buttons. The silk has a light drape and a small side vent. No brand label was visible on the sample photos."
    }
  ];

  const STAGED = [
    ["flatlay", "Flat lay"],
    ["onmodel", "On model"],
    ["detail", "Detail"],
    ["back", "Back"],
    ["styled", "Styled"],
    ["hardware", "Hardware"]
  ];

  const STEPS = [
    ["Extract garment spec", "Vision reads brand, category, size, color, condition, and materials from the sample photos."],
    ["Write listing copy", "A title and HTML description are drafted from that spec."],
    ["Stage images", "Flat lay, on-model, detail, back, styled, and hardware frames are composed."]
  ];

  const state = {
    selectedId: null,
    pendingId: null,
    listings: [],
    modal: null,
    note: "",
    gen: { token: 0, running: false, step: 0 }
  };

  const app = document.getElementById("app");
  const modalRoot = document.getElementById("modal-root");
  let lastRoute = null;
  let booted = false;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function garmentById(id) {
    return GARMENTS.find((garment) => garment.id === id) || null;
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (garmentById(data.selectedId)) state.selectedId = data.selectedId;
      if (garmentById(data.pendingId)) state.pendingId = data.pendingId;
      if (Array.isArray(data.listings)) {
        state.listings = data.listings.filter((row) => {
          return garmentById(row.garmentId) && (row.status === "draft" || row.status === "published");
        });
      }
    } catch (err) {
      /* Session storage can be unavailable; the demo still runs in memory. */
    }
  }

  function persist() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        selectedId: state.selectedId,
        pendingId: state.pendingId,
        listings: state.listings
      }));
    } catch (err) {
      /* Ignore quota or private-mode failures. */
    }
  }

  function route() {
    const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
    const name = parts[0] || "home";
    const known = ["home", "new", "generating", "review", "listings", "settings"];
    return {
      name: known.includes(name) ? name : "home",
      id: parts[1] || null
    };
  }

  function descriptionHtml(garment) {
    const spec = garment.spec;
    const items = ["brand", "category", "size", "color", "condition", "materials"]
      .map((key) => `<li>${escapeHtml(key[0].toUpperCase() + key.slice(1))}: ${escapeHtml(spec[key])}</li>`)
      .join("");
    return `<p>${escapeHtml(garment.blurb)}</p><ul>${items}</ul><p>Sample listing for this interactive demo. Measurements and flaws are illustrative.</p>`;
  }

  function listingFor(garmentId) {
    return state.listings.find((row) => row.garmentId === garmentId) || null;
  }

  function formatWhen(ts) {
    const delta = Date.now() - ts;
    if (delta < 60000) return "Just now";
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function pathFor(type) {
    if (type === "coat") {
      return "M66 114 L42 138 L56 208 L76 196 L66 286 L174 286 L164 196 L184 208 L198 138 L174 114 Q120 90 66 114 Z";
    }
    if (type === "blouse") {
      return "M76 122 L54 142 L68 198 L86 188 L80 228 Q120 242 160 228 L154 188 L172 198 L186 142 L164 122 Q120 104 76 122 Z";
    }
    return "M70 118 L48 140 L62 210 L82 198 L74 246 L166 246 L158 198 L178 210 L192 140 L170 118 Q120 96 70 118 Z";
  }

  function hanger() {
    return `<g fill="none" stroke="#2c2c2c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M128 36a8 8 0 0 1-8 14"/><path d="M120 50v14"/><path d="M76 78h88l-14 16H90z"/></g>`;
  }

  function formNeck() {
    return `<g fill="#dddcd7"><ellipse cx="120" cy="92" rx="11" ry="8"/><path d="M109 96h22l6 22h-34z"/></g>`;
  }

  function plant() {
    return `<g transform="translate(188 36)"><rect x="4" y="40" width="22" height="14" rx="2" fill="#d9d0c3"/><rect x="12" y="28" width="6" height="14" fill="#c9bbaa"/><path d="M15 30C7 18 5 8 15 4c10 4 8 14 0 26z" fill="#6d8b70"/></g>`;
  }

  function garmentArt(garment, view, uid) {
    const palette = garment.palette;
    const body = pathFor(garment.type);
    const clip = `${uid}-clip`;
    const texture = palette.twill
      ? `<g clip-path="url(#${clip})" stroke="rgba(255,255,255,.2)" stroke-width="2" fill="none">${Array.from({ length: 16 }, (_, i) => `<path d="M${-20 + i * 18} 70 L${40 + i * 18} 300"/>`).join("")}</g>`
      : "";
    const pockets = garment.type === "jacket"
      ? `<g fill="none" stroke="${palette.stitch}" stroke-width="1.3"><rect x="86" y="158" width="24" height="18" rx="2"/><rect x="130" y="158" width="24" height="18" rx="2"/></g>`
      : garment.type === "coat"
        ? `<g fill="none" stroke="${palette.stitch}" stroke-width="1.3"><path d="M86 196h28l-4 16H90z"/><path d="M126 196h28l-4 16h-20z"/></g>`
        : "";
    const collar = garment.type === "blouse"
      ? `<path d="M100 124 L120 146 L140 124 L132 116 Q120 124 108 116 Z" fill="${palette.deep}"/>`
      : `<path d="M98 120 L120 146 L142 120 L134 112 Q120 122 106 112 Z" fill="${palette.deep}"/>`;
    const buttons = view === "back"
      ? ""
      : [0, 1, 2, 3].slice(0, garment.type === "coat" ? 3 : 4).map((i) => {
        const y = garment.type === "coat" ? 168 + i * 28 : 150 + i * 22;
        const ring = garment.type === "blouse"
          ? `<circle cx="120" cy="${y}" r="4.2" fill="${palette.cloth}" stroke="${palette.stitch}" stroke-width="1.2"/>`
          : `<circle cx="120" cy="${y}" r="3.4" fill="${palette.metal}"/>`;
        return ring;
      }).join("");
    const backSeam = view === "back"
      ? `<g fill="none" stroke="${palette.deep}" stroke-width="1.4" opacity=".8"><path d="M120 128 V${garment.type === "coat" ? 276 : garment.type === "blouse" ? 220 : 238}"/><path d="M88 136 Q120 126 152 136"/></g>`
      : "";
    return `<defs><clipPath id="${clip}"><path d="${body}"/></clipPath></defs>
      <path d="${body}" fill="${palette.cloth}"/>
      ${texture}
      ${pockets}
      ${collar}
      ${buttons}
      ${backSeam}`;
  }

  function scene(garment, view) {
    const palette = garment.palette;
    const uid = `${garment.id}-${view}`.replace(/[^a-z0-9-]/g, "");
    const grad = `${uid}-bg`;
    const paper = view === "flatlay" || view === "styled";
    const c1 = paper ? palette.paper : palette.studio;
    const c2 = paper ? palette.paper2 : palette.studio2;
    let inner = "";
    if (view === "detail") {
      inner = `<rect width="240" height="320" fill="${palette.cloth}"/>
        <g stroke="${palette.stitch}" stroke-width="1.5" fill="none" opacity=".9">
          <path d="M16 78 H224"/><path d="M16 108 H224"/><path d="M16 210 H224"/>
        </g>
        ${palette.twill ? `<g stroke="rgba(255,255,255,.22)" stroke-width="2">${Array.from({ length: 14 }, (_, i) => `<path d="M${-30 + i * 22} 0 L${30 + i * 22} 320"/>`).join("")}</g>` : ""}
        <circle cx="120" cy="160" r="26" fill="${garment.type === "blouse" ? palette.deep : palette.metal}"/>
        <circle cx="120" cy="160" r="8" fill="${palette.deep}"/>`;
    } else if (view === "hardware") {
      inner = `<rect width="240" height="320" fill="${palette.cloth}"/>
        ${[0, 1, 2].map((i) => `<circle cx="120" cy="${110 + i * 52}" r="16" fill="${garment.type === "blouse" ? palette.deep : palette.metal}" stroke="${palette.stitch}" stroke-width="2"/>`).join("")}`;
    } else {
      const showHanger = view === "front" || view === "back";
      const showForm = view === "onmodel" || view === "styled";
      inner = `${showForm ? formNeck() : ""}
        ${showHanger ? hanger() : ""}
        <ellipse cx="120" cy="${garment.type === "coat" ? 300 : 286}" rx="74" ry="8" fill="#000" opacity=".06"/>
        ${garmentArt(garment, view === "back" ? "back" : "front", uid)}
        ${view === "styled" ? plant() : ""}`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 320" role="img" aria-hidden="true" focusable="false">
      <defs><linearGradient id="${grad}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
      <rect width="240" height="320" fill="${view === "detail" || view === "hardware" ? palette.cloth : `url(#${grad})`}"/>
      ${inner}
    </svg>`;
  }

  function setNav(name) {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      const key = link.dataset.nav;
      const on = key === name || (key === "new" && name === "generating");
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function page(html) {
    return `<div class="page">${html}</div>`;
  }

  function viewHome() {
    return page(`
      <h1>AI-assisted listing automation</h1>
      <p class="lede">Upload a couple of photos of a garment. The app extracts a structured spec, generates editorial-quality images, writes the listing copy and HTML description, and publishes to eBay (Etsy coming later).</p>
      <div class="steps">
        <article class="step-card"><span class="n">1. Capture</span><p>Hanger shots in good light. No styling required.</p></article>
        <article class="step-card"><span class="n">2. Generate</span><p>Vision + LLM extract the garment, write the listing, and produce 5-6 staged images.</p></article>
        <article class="step-card"><span class="n">3. Approve &amp; publish</span><p>Review in a single screen, then publish to eBay or save as draft.</p></article>
      </div>
      <a class="btn" href="#/new">Start a new listing →</a>
    `);
  }

  function viewNew() {
    const selected = garmentById(state.selectedId);
    const hint = selected
      ? `${selected.photoCount} sample photos selected`
      : "No file chosen";
    const cards = GARMENTS.map((garment) => {
      const pressed = garment.id === state.selectedId;
      return `<button type="button" class="sample${pressed ? " is-selected" : ""}" data-action="select" data-id="${garment.id}" aria-pressed="${pressed ? "true" : "false"}">
        <span class="pair">
          <span class="frame">${scene(garment, "front")}</span>
          <span class="frame">${scene(garment, garment.id === "silk-blouse" ? "detail" : "back")}</span>
        </span>
        <span class="label">${escapeHtml(garment.name)} — ${escapeHtml(garment.views)}</span>
        <span class="meta">${garment.photoCount} sample photos</span>
      </button>`;
    }).join("");
    return page(`
      <h1>New listing</h1>
      <p class="lede">Upload 1–6 photos of the garment. Hanger shots are fine.</p>
      <div class="file-row">
        <button type="button" class="btn file" data-action="choose-files">Choose Files</button>
        <p class="file-hint" id="file-hint">${escapeHtml(hint)}</p>
      </div>
      <p class="note" id="upload-note" role="status">${escapeHtml(state.note)}</p>
      <h2 class="section-label">Sample photos</h2>
      <p class="section-help">This demo does not accept uploads. Select one sample set to continue.</p>
      <div class="samples" id="samples">${cards}</div>
      <div class="draft-row">
        <button type="button" class="btn" data-action="create-draft" ${selected ? "" : "disabled"}>Create draft</button>
      </div>
    `);
  }

  function viewGenerating() {
    const garment = garmentById(state.selectedId);
    const items = STEPS.map((step, index) => {
      const cls = index < state.gen.step ? "is-done" : index === state.gen.step ? "is-active" : "";
      return `<li data-step="${index}" class="${cls}"><span class="mark" aria-hidden="true"></span><div><strong>${step[0]}</strong><p>${step[1]}</p></div></li>`;
    }).join("");
    const pct = state.gen.step >= 3 ? 100 : Math.round((state.gen.step / 3) * 100);
    return page(`
      <p class="kicker">Generating</p>
      <h1>Building the sample listing</h1>
      <p class="lede">${garment ? escapeHtml(garment.name) + ". " : ""}A short preview of vision extract, copy, and staged images. Nothing leaves this page.</p>
      <div class="track" aria-hidden="true"><span style="width:${pct}%"></span></div>
      <ol class="gen-list">${items}</ol>
      <p class="sr-only" id="gen-status" aria-live="polite"></p>
    `);
  }

  function viewReview(id) {
    let garment = null;
    if (id) {
      const row = state.listings.find((item) => item.id === id);
      garment = row ? garmentById(row.garmentId) : null;
    } else {
      garment = garmentById(state.pendingId);
    }
    if (!garment) {
      return page(`
        <p class="kicker">Review</p>
        <h1>No sample listing yet</h1>
        <p class="lede">Choose a sample photo set and create a draft to see a garment spec, listing copy, and staged images.</p>
        <div class="empty-actions"><a class="btn" href="#/new">New listing</a></div>
      `);
    }
    const saved = listingFor(garment.id);
    const html = descriptionHtml(garment);
    const specLabels = {
      brand: "Brand",
      category: "Category",
      size: "Size",
      color: "Color",
      condition: "Condition",
      materials: "Materials"
    };
    const spec = Object.entries(specLabels).map(([key, label]) => {
      return `<div><dt>${label}</dt><dd>${escapeHtml(garment.spec[key])}</dd></div>`;
    }).join("");
    const frames = STAGED.map(([view, label]) => {
      return `<figure><div class="frame">${scene(garment, view)}</div><figcaption>${label}</figcaption></figure>`;
    }).join("");
    const flag = saved
      ? `In this demo session: ${saved.status === "published" ? "Published" : "Draft"}.`
      : "Not saved in this demo session yet.";
    return page(`
      <p class="kicker">Sample listing</p>
      <h1>Review</h1>
      <p class="lede">Sample garment only. Saving or publishing updates this demo session and does not create an eBay listing.</p>
      <div class="actions">
        <button type="button" class="btn ghost" data-action="save-draft" data-id="${garment.id}">Save as draft</button>
        <button type="button" class="btn" data-action="publish" data-id="${garment.id}">Publish to eBay</button>
      </div>
      <p class="session-flag">${flag}</p>
      <section class="block">
        <h2>Garment spec</h2>
        <dl class="spec">${spec}</dl>
      </section>
      <section class="block">
        <h2>Title</h2>
        <p class="title-line">${escapeHtml(garment.title)}</p>
      </section>
      <section class="block">
        <h2>HTML description</h2>
        <div class="prose">${html}</div>
        <details class="src">
          <summary>HTML source</summary>
          <pre>${escapeHtml(html)}</pre>
        </details>
      </section>
      <section class="block">
        <h2>Staged images</h2>
        <p class="section-help">Six sample frames in the layout the app produces. These illustrations stand in for generated photos.</p>
        <div class="staged">${frames}</div>
      </section>
    `);
  }

  function viewListings() {
    if (!state.listings.length) {
      return page(`
        <h1>Listings</h1>
        <p class="lede">No listings yet. Start a new listing to walk through one sample garment. Nothing here is saved on a server.</p>
        <div class="empty-actions"><a class="btn" href="#/new">Start a new listing →</a></div>
      `);
    }
    const rows = state.listings.map((row) => {
      const garment = garmentById(row.garmentId);
      if (!garment) return "";
      const status = row.status === "published" ? "Published" : "Draft";
      return `<tr>
        <td><a href="#/review/${escapeHtml(row.id)}">${escapeHtml(garment.title)}</a></td>
        <td>${escapeHtml(garment.spec.category)}</td>
        <td><span class="badge${row.status === "published" ? " published" : ""}">${status}</span></td>
        <td>${escapeHtml(formatWhen(row.updatedAt))}</td>
      </tr>`;
    }).join("");
    return page(`
      <h1>Listings</h1>
      <p class="lede">Sample items from this browser session. Statuses are local flags, not marketplace records.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="fine">Open a title to review it again. A second pass replaces that sample’s draft or published flag.</p>
    `);
  }

  function viewSettings() {
    return page(`
      <h1>Settings</h1>
      <p class="lede">Settings are unavailable in this demo. eBay account connection, shipping defaults, and image style live in the private app.</p>
    `);
  }

  const views = {
    home: viewHome,
    new: viewNew,
    generating: viewGenerating,
    review: viewReview,
    listings: viewListings,
    settings: viewSettings
  };

  const titles = {
    home: "Listing Tool · Interactive demo",
    new: "New listing · Listing Tool demo",
    generating: "Generating · Listing Tool demo",
    review: "Review · Listing Tool demo",
    listings: "Listings · Listing Tool demo",
    settings: "Settings · Listing Tool demo"
  };

  function paintSteps() {
    const status = document.getElementById("gen-status");
    document.querySelectorAll("[data-step]").forEach((item) => {
      const index = Number(item.dataset.step);
      item.classList.toggle("is-done", index < state.gen.step);
      item.classList.toggle("is-active", index === state.gen.step && state.gen.step < 3);
    });
    const bar = document.querySelector(".track > span");
    if (bar) {
      const pct = state.gen.step >= 3 ? 100 : Math.round((state.gen.step / 3) * 100);
      bar.style.width = `${pct}%`;
    }
    if (status && state.gen.step > 0 && state.gen.step <= 3) {
      status.textContent = state.gen.step >= 3
        ? "Sample listing ready."
        : `${STEPS[state.gen.step - 1][0]} complete.`;
    }
  }

  function beginGeneration() {
    if (!garmentById(state.selectedId)) {
      location.hash = "#/new";
      return;
    }
    if (state.gen.running) return;
    state.gen.running = true;
    state.gen.step = 0;
    const token = ++state.gen.token;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gaps = reduce ? [40, 40, 40, 60] : [850, 900, 950, 550];
    const advance = (step) => {
      if (token !== state.gen.token || route().name !== "generating") {
        state.gen.running = false;
        return;
      }
      state.gen.step = step;
      paintSteps();
      if (step < 3) {
        window.setTimeout(() => advance(step + 1), gaps[step]);
      } else {
        window.setTimeout(() => {
          if (token !== state.gen.token) return;
          state.pendingId = state.selectedId;
          state.gen.running = false;
          persist();
          location.hash = "#/review";
        }, gaps[3]);
      }
    };
    window.setTimeout(() => advance(1), gaps[0]);
  }

  function upsert(garmentId, status) {
    const garment = garmentById(garmentId);
    if (!garment) return;
    const existing = listingFor(garmentId);
    const row = {
      id: existing ? existing.id : `sample-${garmentId}`,
      garmentId,
      status,
      updatedAt: Date.now()
    };
    state.listings = [row, ...state.listings.filter((item) => item.garmentId !== garmentId)];
    state.pendingId = garmentId;
    state.modal = { status };
    persist();
    renderModal();
  }

  function renderModal() {
    if (!state.modal) {
      modalRoot.innerHTML = "";
      return;
    }
    const published = state.modal.status === "published";
    const detail = published
      ? "This sample was marked published in your browser session. No eBay listing was created."
      : "This sample was marked as a draft in your browser session. Nothing was stored on a server or sent to eBay.";
    modalRoot.innerHTML = `
      <div class="overlay" data-action="close-modal">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title">Demo only — no listing was created</h2>
          <p>${detail}</p>
          <div class="actions">
            <button type="button" class="btn" data-action="close-modal" id="modal-dismiss">View listings</button>
          </div>
        </div>
      </div>`;
    const dismiss = document.getElementById("modal-dismiss");
    if (dismiss) dismiss.focus();
  }

  function closeModal() {
    state.modal = null;
    if (location.hash !== "#/listings") location.hash = "#/listings";
    render();
  }

  function render() {
    const current = route();
    document.title = titles[current.name];
    setNav(current.name);
    app.innerHTML = views[current.name](current.id);
    const heading = app.querySelector("h1");
    if (heading && booted && lastRoute !== current.name) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    lastRoute = current.name;
    if (current.name === "generating") beginGeneration();
    if (!state.modal) modalRoot.innerHTML = "";
  }

  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "select") {
      const id = target.dataset.id;
      state.selectedId = id;
      state.note = "";
      persist();
      render();
      const again = app.querySelector(`[data-action="select"][data-id="${id}"]`);
      if (again) again.focus();
      return;
    }
    if (action === "choose-files") {
      state.note = "File upload is off in this demo. Select a sample photo set below.";
      render();
      const samples = document.getElementById("samples");
      if (samples) samples.scrollIntoView({ block: "nearest" });
      return;
    }
    if (action === "create-draft") {
      if (!garmentById(state.selectedId)) return;
      state.gen.running = false;
      state.gen.token += 1;
      location.hash = "#/generating";
      return;
    }
    if (action === "save-draft" || action === "publish") {
      upsert(target.dataset.id, action === "publish" ? "published" : "draft");
      return;
    }
    if (action === "close-modal") {
      if (target.classList.contains("overlay") && event.target !== target) return;
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.modal) closeModal();
  });

  window.addEventListener("hashchange", () => {
    if (route().name !== "generating") {
      state.gen.token += 1;
      state.gen.running = false;
    }
    render();
  });

  loadSession();
  if (!location.hash) location.hash = "#/";
  render();
  booted = true;
})();
