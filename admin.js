(() => {
  const STORAGE_KEY = "dirtytask-admin-data";
  // Authentication is managed by admin-auth.js; local demo tokens grant no access.
  let categoryLabels = Object.create(null);
  let categoriesReady = false;
  let categoriesMessage = 'Las categorías se cargarán al iniciar sesión.';
  let categoriesRequest = 0;

  const demoProductIds = new Set(["tee-noche", "tee-grateful", "tee-solar", "clogs-pokemon", "sneakers-adidas", "tumbler-ripndip", "preorder-pikachu", "preorder-jigglypuff", "preorder-gengar", "denim-wide-leg", "overshirt-canvas", "bomber-afterhours", "hoodie-cloud", "hoodie-signal", "tee-afterhours", "tee-static", "crewneck-crossfade"]);
  const seed = {
    products: [],
    launches: [],
    content: {
      heroCopy: "Streetwear, cultura sneaker y piezas con actitud. Encuentra tu próximo outfit y descubre la selección de Dirtytask Store. También te traemos la prenda que tú quieras.",
      feedCopy: "Las mejores marcas de todo el mundo en Guatemala.",
      instagramUrl: "https://www.instagram.com/dirtytask/?hl=es",
      tiktokUrl: "https://www.tiktok.com/@dirtytask",
      videos: ["https://www.tiktok.com/@dirtytask/video/7326274171879591173", "https://www.tiktok.com/@dirtytask/video/7322528374738488581", "https://www.tiktok.com/@dirtytask/video/7265850704454077702", "https://www.tiktok.com/@dirtytask/video/7689297049241603335", "https://www.tiktok.com/@dirtytask/video/7663144684067343624", "https://www.tiktok.com/@dirtytask/video/7662516090895043848"]
    },
    settings: { shippingGuatemala: 25, shippingOther: 35, payments: { cash: true, visaInstallments: true, visalink: true } },
    profile: { displayName: "Administrador", avatar: "" },
    orders: []
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const formatMoney = (value) => "Q " + new Intl.NumberFormat("es-GT", { maximumFractionDigits: 0 }).format(Number(value) || 0);
  const slug = (value) => String(value || "producto").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "producto";
  const nextDropId = () => {
    const existingIds = new Set(state.launches.map((launch) => launch.id));
    for (let index = 1; ; index += 1) {
      const id = "drop-" + String(index).padStart(2, "0");
      if (!existingIds.has(id)) return id;
    }
  };
  const validAsset = (value) => /^assets\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/i.test(value || "");
  const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
  const MAX_COMPRESSED_IMAGE_BYTES = 128 * 1024;
  const MAX_IMAGE_DATA_LENGTH = 180000;
  const isDeviceImage = (value) => typeof value === "string" && value.length <= MAX_IMAGE_DATA_LENGTH && /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  const validProductImage = (value) => validAsset(value) || isDeviceImage(value);
  const validSocialUrl = (value, host) => {
    try {
      const url = new URL(String(value));
      return url.protocol === "https:" && (url.hostname === host || url.hostname === "www." + host) ? url.href : null;
    } catch (_) { return null; }
  };
  const normalizeVideoUrl = (value) => {
    try {
      const url = new URL(String(value));
      if (url.protocol !== "https:") return null;
      const path = url.pathname.replace(/\/$/, "");
      if (/^(?:www\.)?tiktok\.com$/i.test(url.hostname) && /^\/@[\w.-]+\/video\/\d{8,22}$/.test(path)) return "https://www.tiktok.com" + path;
      if (/^(?:www\.)?instagram\.com$/i.test(url.hostname) && /^\/(?:reel|p)\/[\w-]+$/i.test(path)) return "https://www.instagram.com" + path + "/";
    } catch (_) { return null; }
    return null;
  };
  const normalizeState = (raw) => {
    const value = raw && typeof raw === "object" ? raw : {};
    const products = [];
    if (Array.isArray(value.products)) {
      value.products.forEach((saved) => {
        if (!saved || typeof saved.id !== "string" || !/^[a-z0-9-]{2,50}$/.test(saved.id) || demoProductIds.has(saved.id)) return;
        const existing = products.find((product) => product.id === saved.id);
        const clean = {
          ...saved,
          name: String(saved.name || "Producto nuevo").slice(0, 80),
          category: typeof saved.category === "string" ? saved.category : "",
          price: Number.isFinite(Number(saved.price)) && Number(saved.price) >= 0 ? Number(saved.price) : 0,
          image: validProductImage(saved.image) ? saved.image : "",
          lookImage: validProductImage(saved.lookImage) ? saved.lookImage : "",
          variants: Array.isArray(saved.variants) ? saved.variants.map((item) => String(item).slice(0, 12)).filter(Boolean).slice(0, 20) : ["Única"],
          stock: Math.max(0, Number.parseInt(saved.stock, 10) || 0),
          status: ["active", "draft", "archived"].includes(saved.status) ? saved.status : "draft",
          published: Boolean(saved.published),
          preorder: Boolean(saved.preorder),
          description: String(saved.description || "").slice(0, 240)
        };
        if (existing) Object.assign(existing, clean); else products.push(clean);
      });
    }
    const launches = Array.isArray(value.launches) ? value.launches.map((launch, index) => ({
      id: /^[a-z0-9-]{2,50}$/.test(launch?.id || "") ? launch.id : "drop-" + String(index + 1).padStart(2, "0"),
      name: String(launch?.name || "Nuevo lanzamiento").slice(0, 90),
      launchDate: String(launch?.launchDate || "").slice(0, 40),
      arrivalDate: String(launch?.arrivalDate || "").slice(0, 60),
      image: validProductImage(launch?.image) ? launch.image : "",
      status: ["open", "upcoming", "closed"].includes(launch?.status) ? launch.status : "upcoming",
      productIds: Array.isArray(launch?.productIds) ? launch.productIds.filter((id) => products.some((product) => product.id === id)).slice(0, 12) : []
    })).filter((launch) => !(launch.id === "drop-02" && /crocs/i.test(launch.name))) : [];
    const content = { ...seed.content, ...(value.content || {}) };
    content.heroCopy = String(content.heroCopy || "").slice(0, 240);
    content.feedCopy = String(content.feedCopy || "").slice(0, 140);
    content.instagramUrl = validSocialUrl(content.instagramUrl, "instagram.com") || seed.content.instagramUrl;
    content.tiktokUrl = validSocialUrl(content.tiktokUrl, "tiktok.com") || seed.content.tiktokUrl;
    content.videos = Array.isArray(content.videos) ? content.videos.map(normalizeVideoUrl).filter(Boolean).slice(0, 12) : clone(seed.content.videos);
    const settings = { ...seed.settings, ...(value.settings || {}) };
    settings.shippingGuatemala = Math.max(0, Number(settings.shippingGuatemala) || 0);
    settings.shippingOther = Math.max(0, Number(settings.shippingOther) || 0);
    settings.payments = { ...seed.settings.payments, ...(settings.payments || {}) };
    const profile = { ...seed.profile, ...(value.profile || {}) };
    profile.displayName = String(profile.displayName || "").replace(/\s+/g, " ").trim().slice(0, 60) || seed.profile.displayName;
    profile.avatar = isDeviceImage(profile.avatar) ? profile.avatar : "";
    return { products, launches, content, settings, profile, orders: Array.isArray(value.orders) ? value.orders : [] };
  };

  let state;
  try { state = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")); }
  catch (_) { state = normalizeState(null); }
  window.adminCatalog = { products: () => structuredClone(state.products), launches: () => structuredClone(state.launches) };
  const loginScreen = $("#loginScreen");
  const adminApp = $("#adminApp");
  const loginForm = $("#loginForm");
  const loginError = $("#loginError");
  const editorDialog = $("#editorDialog");
  const editorForm = $("#editorForm");
  let currentEditor = null;

  function setLoggedIn(loggedIn) {
    loginScreen.hidden = loggedIn;
    adminApp.hidden = !loggedIn;
    if (loggedIn) renderAll();
  }
  setLoggedIn(false);
  document.addEventListener("dirtytask:auth", (event) => {
    if (!event.detail) {
      document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
    }
    setLoggedIn(Boolean(event.detail));
    applyRoleControls();
    if (event.detail){ loadCategories(), loadProducts(); }
    else { categoriesRequest++; categoriesReady = false; categoryLabels = Object.create(null); }
  });
  const opsControls = '#addVideoButton, #videoList input, [data-remove-video], #addProductButton, #addDropButton, [data-edit-product], [data-edit-drop], #contentForm input, #contentForm textarea, #contentForm button, #saveContentButton, #saveSettingsButton, #shippingForm input, #paymentForm input, #profileForm input, #profileForm button';
  function applyRoleControls() {
    const finance = window.adminIdentity?.role === 'partner_finance';
    document.querySelectorAll(opsControls).forEach(control => {
      control.disabled = finance;
      control.title = finance ? 'Edición a cargo del socio de operaciones.' : '';
    });
  }
  // Identity fields remain local-demo settings until profile editing is integrated.
  document.addEventListener('click', event => {
    if (window.adminIdentity?.role === 'partner_finance' && event.target.closest(opsControls)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);

function productFromDatabase(row) {
  // Copiamos las variantes antes de ordenarlas.
  const variantRows = [...(row.product_variant || [])];

  // Orden numérico; si empatan, ordenamos por etiqueta.
  variantRows.sort((a, b) =>
    a.sort_order - b.sort_order || a.label.localeCompare(b.label)
  );

  // Cada variante es un objeto; la pantalla necesita sus etiquetas.
  const variantLabels = variantRows.map(variant => variant.label);

  // Cada producto puede tener una imagen principal y una del look.
  const media = row.product_media || [];
  const mainPhoto = media.find(photo => photo.kind === 'product');
  const lookPhoto = media.find(photo => photo.kind === 'look');

  // Convierte una ruta de Storage en URL pública, si existe la ruta.
  function imageUrl(storageKey) {
    if (!storageKey) return '';

    const { data } = window.dirtytaskSupabase.storage
      .from('dtshop-products')
      .getPublicUrl(storageKey);

    return data.publicUrl;
  }

  // Devolvemos un objeto nuevo con los nombres que usa el administrador.
  return {
    id: row.id,
    name: row.name,
    category: row.category_code,
    description: row.description || '',
    price: Number(row.price_cents) / 100,
    stock: row.stock,
    status: row.status,
    published: row.published,
    preorder: row.preorder,
    variantName: row.variant_label,
    variants: variantLabels,
    variantRecords: variantRows,
    image: imageUrl(mainPhoto?.storage_key),
    lookImage: imageUrl(lookPhoto?.storage_key)
  };
}


async function loadProducts() {
  //quien inicia la consulta
  const userId = window.adminIdentity?.id;
  if (!userId) return;
  try {
    const products = await window.catalogApi.listProducts();
     if (window.adminIdentity?.id !== userId) return;
     console.log("Productos cargados desde Supabase:", products);
     console.table(products);
  } catch (error) {
    if (window.adminIdentity?.id !== userId) return;
    console.error("Error al cargar productos desde Supabase:", error);
  }
}


  async function loadCategories() {
    const ticket = ++categoriesRequest;
    categoriesReady = false;
    categoriesMessage = 'Cargando categorías de Supabase…';
    updateCategoryField();
    try {
      const rows = await window.catalogApi.listCategories();
      if (ticket !== categoriesRequest) return;
      categoryLabels = Object.fromEntries(rows.map(row => [row.code, row.label]));
      categoriesReady = rows.length > 0;
      categoriesMessage = rows.length ? 'Categorías sincronizadas con Supabase. El producto aún se guarda en este navegador.' : 'No hay categorías. Agrega registros en dtshop.category y reintenta.';
      renderProducts(); renderStatistics(); renderOverview();
      applyRoleControls();
    } catch (_) {
      if (ticket !== categoriesRequest) return;
      categoryLabels = Object.create(null);
      categoriesMessage = 'No se pudieron cargar las categorías. Revisa la conexión y los permisos de dtshop.category.';
    }
    updateCategoryField();
  }
  function updateCategoryField() {
    if (currentEditor?.type !== 'product') return;
    const select = editorForm.querySelector('[name="category"]');
    if (!select) return;
    const selected = select.value || select.dataset.previous || '';
    select.dataset.previous = selected;
    select.innerHTML = '<option value="">Selecciona una categoría</option>' + Object.entries(categoryLabels)
      .map(([code,label]) => '<option value="' + escapeHtml(code) + '">' + escapeHtml(label) + '</option>').join('');
    select.value = Object.hasOwn(categoryLabels, selected) ? selected : '';
    select.disabled = !categoriesReady;
    select.required = true;
    $('#categoryStatus').textContent = categoriesMessage;
  }
  $('#editorFields').addEventListener('click', event => {
    if (event.target.closest('#retryCategories')) loadCategories();
  });

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      document.dispatchEvent(new CustomEvent("dirtytask:admin-data-updated"));
      return true;
    } catch (_) {
      window.alert("No se pudieron guardar los cambios en este navegador.");
      return false;
    }
  }
  function productStatus(product) {
    return product.status === "active" ? '<span class="status-pill status-active">Activo</span>' : product.status === "archived" ? '<span class="status-pill status-archived">Archivado</span>' : '<span class="status-pill status-draft">Borrador</span>';
  }
  function renderProducts() {
    const query = $("#productSearchAdmin").value.trim().toLocaleLowerCase("es");
    const filter = $("#productStatusFilter").value;
    const visible = state.products.filter((product) => {
      const text = [product.name, product.id, categoryLabels[product.category]].join(" ").toLocaleLowerCase("es");
      return (!query || text.includes(query)) && (filter === "all" || product.status === filter);
    });
    $("#productTableBody").innerHTML = visible.map((product) => '<tr>' +
      '<td><div class="table-product">' + (product.image ? '<img src="' + escapeHtml(product.image) + '" alt="">' : '') + '<span><strong>' + escapeHtml(product.name) + '</strong><small>' + escapeHtml(product.id) + (product.preorder ? ' · PREVENTA' : '') + '</small></span></div></td>' +
      '<td>' + escapeHtml(categoryLabels[product.category] || product.category) + '</td><td class="table-price">' + formatMoney(product.price) + '</td><td class="table-stock">' + Number(product.stock || 0) + '</td><td>' + productStatus(product) + '</td>' +
      '<td><div class="table-actions"><button class="table-action" type="button" data-edit-product="' + escapeHtml(product.id) + '">Editar</button></div></td></tr>').join("");
    if (!visible.length) $("#productTableBody").innerHTML = '<tr><td colspan="6">No hay productos cargados. Crea el primero cuando el catálogo real esté listo.</td></tr>';
    $("#productTableCount").textContent = visible.length + (visible.length === 1 ? " producto" : " productos");
    $("#productCount").textContent = String(state.products.length);
  }
  function renderDrops() {
    const list = $("#dropAdminList");
    if (!state.launches.length) {
      list.innerHTML = '<div class="empty-admin"><span class="empty-admin-icon">✳</span><h2>No hay lanzamientos programados.</h2><p>Crea un drop para anunciar sus modelos, fecha de salida y llegada a Guatemala.</p></div>';
    } else {
      list.innerHTML = state.launches.map((launch) => {
        const productNames = launch.productIds.map((id) => state.products.find((product) => product.id === id)?.name).filter(Boolean);
        const status = launch.status === "open" ? '<span class="status-pill status-active">Reservas abiertas</span>' : launch.status === "closed" ? '<span class="status-pill status-archived">Cerrado</span>' : '<span class="status-pill status-draft">Próximamente</span>';
        return '<article class="drop-admin-card"><div class="drop-admin-main">' + (launch.image ? '<img src="' + escapeHtml(launch.image) + '" alt="">' : '') + '<div><p class="admin-kicker">' + escapeHtml(launch.id) + ' / DIRTYTASK</p><h3>' + escapeHtml(launch.name) + '</h3><p>SALE / ' + escapeHtml(launch.launchDate || "Por definir") + ' · LLEGA / ' + escapeHtml(launch.arrivalDate || "Por definir") + '</p></div></div><div class="drop-admin-side">' + status + '<button class="table-action" type="button" data-edit-drop="' + escapeHtml(launch.id) + '">Editar</button></div><div class="drop-models">MODELOS / ' + escapeHtml(productNames.join(" · ") || "Sin productos vinculados") + '</div></article>';
      }).join("");
    }
    $("#dropCount").textContent = String(state.launches.filter((launch) => launch.status === "open").length);
  }
  function renderOverview() {
    const activeProducts = state.products.filter((product) => product.status === "active");
    const storefrontProducts = activeProducts.filter((product) => product.published);
    const openDrops = state.launches.filter((launch) => launch.status === "open");
    $("#metricProducts").textContent = String(storefrontProducts.length);
    $("#metricDrops").textContent = String(openDrops.length);
    $("#metricOrders").textContent = "0";
    $("#metricInventory").textContent = String(activeProducts.reduce((sum, product) => sum + Number(product.stock || 0), 0));
    $("#recentProducts").innerHTML = storefrontProducts.slice(0, 4).map((product) => '<div class="mini-product">' + (product.image ? '<img src="' + escapeHtml(product.image) + '" alt="">' : '') + '<span><strong>' + escapeHtml(product.name) + '</strong><small>' + escapeHtml(categoryLabels[product.category]) + '</small></span><b>' + formatMoney(product.price) + '</b></div>').join("") || '<p class="field-hint">Sin productos publicados.</p>';
    $("#recentDrops").innerHTML = state.launches.slice(0, 4).map((launch) => '<div class="drop-overview-item"><span><strong>' + escapeHtml(launch.name) + '</strong><small>' + escapeHtml(launch.launchDate || "Fecha por definir") + '</small></span>' + (launch.status === "open" ? '<span class="status-pill status-active">Abierto</span>' : '<span class="status-pill status-draft">Programado</span>') + '</div>').join("") || '<p class="field-hint">Sin lanzamientos programados.</p>';
    $("#todayDate").textContent = new Intl.DateTimeFormat("es-GT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date()).toUpperCase();
  }
  function renderStatistics() {
    const published = state.products.filter((product) => product.status === "active" && product.published);
    const drafts = state.products.filter((product) => product.status === "draft");
    const active = state.products.filter((product) => product.status === "active");
    const inventory = active.reduce((sum, product) => sum + Number(product.stock || 0), 0);
    const averagePrice = published.length ? published.reduce((sum, product) => sum + Number(product.price || 0), 0) / published.length : 0;
    $("#statsPublished").textContent = String(published.length);
    $("#statsDrafts").textContent = String(drafts.length);
    $("#statsInventory").textContent = new Intl.NumberFormat("es-GT").format(inventory);
    $("#statsAveragePrice").textContent = formatMoney(averagePrice);

    const categories = Object.entries(categoryLabels).map(([key, label]) => {
      const items = published.filter((product) => product.category === key);
      const average = items.length ? items.reduce((sum, product) => sum + Number(product.price || 0), 0) / items.length : 0;
      return { key, label, count: items.length, average };
    });
    const maxCategoryCount = Math.max(1, ...categories.map((category) => category.count));
    $("#statsCategoryList").innerHTML = categories.map((category) => '<div class="stats-category-row"><div class="stats-category-top"><span>' + escapeHtml(category.label) + '</span><strong>' + category.count + (category.count === 1 ? " producto" : " productos") + '</strong></div><div class="stats-bar"><i style="width:' + Math.round(category.count / maxCategoryCount * 100) + '%"></i></div><small>' + (category.count ? "Precio promedio / " + formatMoney(category.average) : "Sin productos publicados") + '</small></div>').join("");

    const statuses = [
      { key: "active", label: "Activos", count: state.products.filter((product) => product.status === "active").length, className: "status-active" },
      { key: "draft", label: "Borradores", count: drafts.length, className: "status-draft" },
      { key: "archived", label: "Archivados", count: state.products.filter((product) => product.status === "archived").length, className: "status-archived" }
    ];
    const maxStatusCount = Math.max(1, ...statuses.map((status) => status.count));
    $("#statsStatusList").innerHTML = statuses.map((status) => '<div class="stats-status-row"><div class="stats-category-top"><span><i class="stats-status-dot ' + status.className + '"></i>' + status.label + '</span><strong>' + status.count + '</strong></div><div class="stats-bar stats-bar-neutral"><i style="width:' + Math.round(status.count / maxStatusCount * 100) + '%"></i></div></div>').join("");

    const launchStatus = [
      { key: "open", label: "Reservas abiertas" },
      { key: "upcoming", label: "Próximamente" },
      { key: "closed", label: "Cerrados" }
    ];
    const launchRows = launchStatus.map((entry) => {
      const launches = state.launches.filter((launch) => launch.status === entry.key);
      const models = launches.reduce((sum, launch) => sum + launch.productIds.length, 0);
      return '<div class="stats-launch-row"><span><strong>' + entry.label + '</strong><small>' + models + (models === 1 ? " modelo vinculado" : " modelos vinculados") + '</small></span><b>' + launches.length + '</b></div>';
    });
    $("#statsLaunchList").innerHTML = launchRows.join("") || '<p class="field-hint">Sin lanzamientos registrados.</p>';
  }
  function renderVideos() {
    $("#videoList").innerHTML = state.content.videos.map((url, index) => '<label class="video-row"><span class="video-index">' + String(index + 1).padStart(2, "0") + '</span><input type="url" data-video-index="' + index + '" aria-label="URL del video ' + (index + 1) + '" value="' + escapeHtml(url) + '"><button type="button" data-remove-video="' + index + '" aria-label="Quitar video">×</button></label>').join("");
  }
  function renderContent() {
    const form = $("#contentForm");
    form.elements.heroCopy.value = state.content.heroCopy;
    form.elements.feedCopy.value = state.content.feedCopy;
    form.elements.instagramUrl.value = state.content.instagramUrl;
    form.elements.tiktokUrl.value = state.content.tiktokUrl;
    renderVideos(); applyRoleControls();
  }
  function profileInitials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toLocaleUpperCase("es");
    return (parts[0] || "DT").slice(0, 2).toLocaleUpperCase("es");
  }
  function renderProfile() {
    const name = window.adminIdentity?.display_name || state.profile.displayName;
    const avatar = window.adminIdentity ? "" : state.profile.avatar;
    const initials = profileInitials(name);
    const form = $("#profileForm");
    if (document.activeElement !== form.elements.displayName) form.elements.displayName.value = name;
    const preview = $("#profileAvatarPreview");
    preview.innerHTML = avatar ? '<img alt="" src="' + escapeHtml(avatar) + '">' : escapeHtml(initials);
    const accountAvatar = $("#accountAvatar");
    accountAvatar.innerHTML = avatar ? '<img alt="" src="' + escapeHtml(avatar) + '">' : escapeHtml(initials);
    accountAvatar.setAttribute("aria-label", "Editar usuario, " + name);
    $("#welcomeName").textContent = "Bienvenido: " + name + (window.adminIdentity?.role === "partner_finance" ? " · Finanzas" : window.adminIdentity ? " · Operaciones" : "");
  }
  function renderSettings() {
    const shipping = $("#shippingForm");
    shipping.elements.shippingGuatemala.value = state.settings.shippingGuatemala;
    shipping.elements.shippingOther.value = state.settings.shippingOther;
    const payments = $("#paymentForm");
    payments.elements.cash.checked = Boolean(state.settings.payments.cash);
    payments.elements.visaInstallments.checked = Boolean(state.settings.payments.visaInstallments);
    payments.elements.visalink.checked = Boolean(state.settings.payments.visalink);
    renderProfile();
  }
  function renderAll() {
    renderOverview(); renderProducts(); renderDrops(); renderStatistics(); renderContent(); renderSettings(); applyRoleControls();
  }

  function switchView(name) {
    const id = ["overview", "products", "drops", "stats", "orders", "accounting", "content", "settings"].includes(name) ? name : "overview";
    $$(".admin-view").forEach((view) => { view.hidden = view.id !== "view-" + id; });
    $$(".admin-nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === id));
    const title = { overview: "Resumen", products: "Productos", drops: "Lanzamientos", stats: "Estadísticas", orders: "Pedidos", accounting: "Contabilidad", content: "Contenido", settings: "Configuración" }[id];
    $("#viewTitle").textContent = title;
    if (id === "products") renderProducts();
    if (id === "drops") renderDrops();
    if (id === "stats") renderStatistics();
  }
  $$(".admin-nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$('[data-open-view]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.openView)));
  $("#productSearchAdmin").addEventListener("input", renderProducts);
  $("#productStatusFilter").addEventListener("change", renderProducts);

  function field(label, name, value, options = {}) {
    const className = options.wide ? "field-wide" : "";
    const type = options.type || "text";
    let input;
    if (options.select) {
      input = '<select name="' + name + '">' + options.select.map(([key, text]) => '<option value="' + escapeHtml(key) + '"' + (String(key) === String(value) ? " selected" : "") + '>' + escapeHtml(text) + '</option>').join("") + '</select>';
    } else if (options.textarea) {
      input = '<textarea name="' + name + '" maxlength="' + (options.maxlength || 240) + '">' + escapeHtml(value) + '</textarea>';
    } else {
      input = '<input type="' + type + '" name="' + name + '" value="' + escapeHtml(value) + '"' + (options.required ? " required" : "") + (options.min != null ? ' min="' + options.min + '"' : "") + (options.step ? ' step="' + options.step + '"' : "") + (options.readonly ? " readonly" : "") + '>';
    }
    return '<label class="' + className + '">' + escapeHtml(label) + input + '</label>';
  }
  function checkField(label, name, value) {
    return '<label class="check-row"><input type="checkbox" name="' + name + '"' + (value ? " checked" : "") + '>' + escapeHtml(label) + '</label>';
  }
  function renderModelPicker(products, launch) {
    const selectedIds = new Set(launch.productIds);
    const eligibleProducts = products.filter((product) => product.status !== "archived" || selectedIds.has(product.id));
    const choices = eligibleProducts.slice().sort((a, b) => Number(selectedIds.has(b.id)) - Number(selectedIds.has(a.id))).map((product) => {
      const archived = product.status === "archived";
      const badge = archived ? "ARCHIVADO" : product.preorder ? "PREVENTA" : product.status === "active" && product.published ? "PUBLICADO" : "BORRADOR";
      const searchText = (product.name + " " + (categoryLabels[product.category] || "")).toLocaleLowerCase("es");
      return '<label class="model-choice" data-model-name="' + escapeHtml(searchText) + '">' +
        '<input type="checkbox" name="productIds" value="' + escapeHtml(product.id) + '"' + (selectedIds.has(product.id) ? " checked" : "") + (archived && !selectedIds.has(product.id) ? " disabled" : "") + '>' +
        '<img src="' + escapeHtml(product.image) + '" alt="" loading="lazy">' +
        '<span class="model-choice-copy"><strong>' + escapeHtml(product.name) + '</strong><small>' + escapeHtml(categoryLabels[product.category] || product.category) + " · " + badge + '</small></span>' +
        '<b>' + formatMoney(product.price) + '</b></label>';
    }).join("");
    return '<div class="model-picker field-wide">' +
      '<div class="model-picker-heading"><span>Modelos incluidos</span><span class="model-selection-count" id="modelSelectionCount">0 / 12</span></div>' +
      '<p class="model-picker-hint">Busca y marca cada modelo que formará parte del lanzamiento. Puedes incluir hasta 12.</p>' +
      '<div class="model-picker-toolbar"><label class="model-picker-search"><span aria-hidden="true">⌕</span><input id="modelPickerSearch" type="search" placeholder="Buscar por nombre o categoría" aria-label="Buscar modelos"></label><div class="model-picker-actions"><button class="table-action model-picker-toggle" id="selectVisibleModels" type="button">Seleccionar visibles</button><button class="table-action model-picker-toggle" id="clearVisibleModels" type="button">Quitar visibles</button></div></div>' +
      '<div class="model-picker-list" id="modelPickerList">' + choices + '<p class="model-picker-empty" id="modelPickerEmpty" hidden>No encontramos modelos con esa búsqueda.</p></div>' +
      '<div class="model-selected"><span class="model-selected-label">Seleccionados</span><div class="model-selected-chips" id="modelSelectedChips"></div></div>' +
    '</div>';
  }
  function renderImagePicker(name, label, selectedPath) {
    return '<fieldset class="image-picker field-wide" data-image-picker="' + name + '">' +
      '<legend>' + escapeHtml(label) + '</legend>' +
      '<input type="hidden" name="' + name + '" value="' + escapeHtml(selectedPath || '') + '">' +
      '<input type="file" data-device-image aria-label="' + escapeHtml(label) + '" accept="image/jpeg,image/png,image/webp">' +
      '<p class="image-picker-status" role="status" aria-live="polite"></p>' +
    '</fieldset>';
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
      reader.readAsDataURL(blob);
    });
  }
  async function compressDeviceImage(file) {
    if (!/^image\/(?:jpeg|png|webp)$/i.test(file.type)) throw new Error("Elige una imagen JPG, PNG o WEBP.");
    if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("La imagen supera el límite de 15 MB.");
    if (typeof createImageBitmap !== "function") throw new Error("Este navegador no permite optimizar la imagen.");
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar la imagen.");
      for (const maxSide of [1400, 1200, 1000, 800]) {
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        for (const quality of [0.82, 0.72, 0.62, 0.52]) {
          const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
          if (!blob) throw new Error("No se pudo convertir la imagen a WEBP.");
          if (blob.size <= MAX_COMPRESSED_IMAGE_BYTES) return await blobToDataUrl(blob);
        }
      }
      throw new Error("No se pudo reducir la imagen lo suficiente. Prueba con una foto más pequeña.");
    } finally {
      if (typeof bitmap.close === "function") bitmap.close();
    }
  }
  async function importDeviceImage(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const picker = input.closest(".image-picker");
    const status = picker.querySelector(".image-picker-status");
    input.disabled = true;
    status.textContent = "Optimizando imagen…";
    try {
      const dataUrl = await compressDeviceImage(file);
      picker.querySelector('input[type="hidden"]').value = dataUrl;
      status.textContent = "";
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "No se pudo cargar esa imagen.";
    } finally {
      input.disabled = false;
      // Keep the selected filename visible in the native file control.
    }
  }
  function updateModelPickerSelection() {
    const list = $("#modelPickerList");
    if (!list) return;
    const selected = Array.from(list.querySelectorAll('input[name="productIds"]:checked'));
    const byId = new Map(state.products.map((product) => [product.id, product]));
    $("#modelSelectionCount").textContent = selected.length + " / 12";
    $("#modelSelectedChips").innerHTML = selected.map((input) => {
      const product = byId.get(input.value);
      return '<button class="model-chip" type="button" data-remove-model="' + escapeHtml(input.value) + '" aria-label="Quitar ' + escapeHtml(product?.name || input.value) + '"><span>' + escapeHtml(product?.name || input.value) + '</span><b aria-hidden="true">×</b></button>';
    }).join("") || '<span class="model-selected-empty">Aún no has agregado modelos.</span>';
    const visible = Array.from(list.querySelectorAll(".model-choice:not([hidden]) input[name='productIds']:not(:disabled)"));
    const selectedVisible = visible.filter((input) => input.checked).length;
    const remaining = Math.max(0, 12 - selected.length);
    const selectButton = $("#selectVisibleModels");
    const clearButton = $("#clearVisibleModels");
    selectButton.disabled = visible.length === 0 || remaining === 0 || selectedVisible === visible.length;
    clearButton.disabled = selectedVisible === 0;
    selectButton.title = selectButton.disabled && remaining === 0 ? "Ya seleccionaste el máximo de 12 modelos." : "";
  }
  $("#editorFields").addEventListener("input", (event) => {
    if (event.target.id !== "modelPickerSearch") return;
    const query = event.target.value.trim().toLocaleLowerCase("es");
    const rows = Array.from($("#modelPickerList").querySelectorAll(".model-choice"));
    let matches = 0;
    rows.forEach((row) => {
      row.hidden = !row.dataset.modelName.includes(query);
      if (!row.hidden) matches += 1;
    });
    $("#modelPickerEmpty").hidden = matches > 0;
    updateModelPickerSelection();
  });
  $("#editorFields").addEventListener("change", (event) => {
    if (event.target.matches("[data-device-image]")) {
      importDeviceImage(event.target);
      return;
    }
    if (!event.target.matches('input[name="productIds"]')) return;
    const selectedCount = $("#modelPickerList").querySelectorAll('input[name="productIds"]:checked').length;
    if (selectedCount > 12) {
      event.target.checked = false;
      showEditorError("Puedes incluir hasta 12 modelos por lanzamiento.");
    } else {
      $("#editorMessage").hidden = true;
    }
    updateModelPickerSelection();
  });
  $("#editorFields").addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-model]");
    if (removeButton) {
      const input = Array.from($("#modelPickerList").querySelectorAll('input[name="productIds"]')).find((entry) => entry.value === removeButton.dataset.removeModel);
      if (input) input.checked = false;
      $("#editorMessage").hidden = true;
      updateModelPickerSelection();
      return;
    }
    if (!$("#modelPickerList")) return;
    const visible = Array.from($("#modelPickerList").querySelectorAll(".model-choice:not([hidden]) input[name='productIds']:not(:disabled)"));
    if (event.target.closest("#selectVisibleModels")) {
      $("#editorMessage").hidden = true;
      const selectedCount = $("#modelPickerList").querySelectorAll('input[name="productIds"]:checked').length;
      const remaining = Math.max(0, 12 - selectedCount);
      const unselected = visible.filter((input) => !input.checked);
      unselected.slice(0, remaining).forEach((input) => { input.checked = true; });
      if (unselected.length > remaining) showEditorError("Se seleccionaron modelos hasta el límite de 12. Filtra la lista para elegir otros.");
      updateModelPickerSelection();
      return;
    }
    if (!event.target.closest("#clearVisibleModels")) return;
    $("#editorMessage").hidden = true;
    visible.filter((input) => input.checked).forEach((input) => { input.checked = false; });
    updateModelPickerSelection();
  });
  function openEditor(type, item = null) {
    currentEditor = { type, id: item?.id || null };
    $("#editorMessage").hidden = true;
    $("#editorKicker").textContent = type === "product" ? "CATÁLOGO / EDICIÓN" : "CALENDARIO / EDICIÓN";
    $("#editorTitle").textContent = item ? (type === "product" ? "Editar producto" : "Editar lanzamiento") : (type === "product" ? "Nuevo producto" : "Nuevo lanzamiento");
    $("#deleteEntryButton").hidden = !item;
    $("#deleteEntryButton").textContent = type === "product" ? "Archivar producto" : "Eliminar lanzamiento";
    if (type === "product") {
      const product = item || { id: "", name: "", category: "tshirts", price: 0, image: "", lookImage: "", variantName: "talla", variants: ["S", "M", "L", "XL"], description: "", stock: 0, status: "draft", published: false, preorder: false };
      $("#editorFields").innerHTML = field("Identificador", "id", product.id || slug(product.name), { required: true, readonly: Boolean(item) }) +
        field("Nombre del producto", "name", product.name, { required: true }) +
        field("Categoría", "category", product.category, { select: [[product.category, categoryLabels[product.category] || product.category]] }) +
        '<div class="field-hint"><p id="categoryStatus" role="status"></p><button id="retryCategories" type="button" class="admin-button admin-button-quiet">Actualizar categorías</button></div>' +
        field("Precio (GTQ)", "price", product.price, { type: "number", min: 0, step: 1, required: true }) +
        renderImagePicker("image", "Foto del producto", product.image) +
        renderImagePicker("lookImage", "Foto del Look", product.lookImage) +
        field("Tipo de variante", "variantName", product.variantName || "talla", { select: [["talla", "Talla"], ["variante", "Variante"]] }) +
        field("Tallas o variantes · separadas por coma", "variants", (product.variants || []).join(", "), { wide: true }) +
        field("Unidades registradas", "stock", product.stock || 0, { type: "number", min: 0, step: 1 }) +
        field("Estado", "status", product.status, { select: [["active", "Activo"], ["draft", "Borrador"], ["archived", "Archivado"]] }) +
        field("Descripción", "description", product.description || "", { textarea: true, wide: true }) +
        checkField("Visible en el catálogo", "published", product.published) + checkField("Producto de preventa", "preorder", product.preorder);
      updateCategoryField();
    } else {
      const launch = item || { id: nextDropId(), name: "", launchDate: "", arrivalDate: "", image: "", status: "upcoming", productIds: [] };
      const products = state.products.filter((product) => product.status !== "archived" || launch.productIds.includes(product.id));
      $("#editorFields").innerHTML = field("Identificador", "id", launch.id || nextDropId(), { required: true, readonly: Boolean(item) }) +
        field("Nombre del lanzamiento", "name", launch.name, { required: true }) +
        field("Fecha de lanzamiento", "launchDate", launch.launchDate, { type: "date" }) +
        field("Llegada a Guatemala", "arrivalDate", launch.arrivalDate) +
        field("Estado", "status", launch.status, { select: [["upcoming", "Próximamente"], ["open", "Reservas abiertas"], ["closed", "Cerrado"]] }) +
        renderImagePicker("image", "Imagen del lanzamiento", launch.image) +
        renderModelPicker(products, launch);
      updateModelPickerSelection();
    }
    editorDialog.showModal();
  }
  $("#addProductButton").addEventListener("click", () => openEditor("product"));
  $("#addDropButton").addEventListener("click", () => openEditor("drop"));
  $("#productTableBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-product]");
    if (button) openEditor("product", state.products.find((product) => product.id === button.dataset.editProduct));
  });
  $("#dropAdminList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-drop]");
    if (button) openEditor("drop", state.launches.find((launch) => launch.id === button.dataset.editDrop));
  });
  function closeEditor() { editorDialog.close(); currentEditor = null; }
  $("#closeEditor").addEventListener("click", closeEditor);
  $("#cancelEditor").addEventListener("click", closeEditor);
  editorDialog.addEventListener("click", (event) => { if (event.target === editorDialog) closeEditor(); });
  $("#deleteEntryButton").addEventListener("click", () => {
    if (!currentEditor?.id) return;
    if (currentEditor.type === "product") {
      const product = state.products.find((entry) => entry.id === currentEditor.id);
      if (product) { product.status = "archived"; product.published = false; }
    } else state.launches = state.launches.filter((entry) => entry.id !== currentEditor.id);
    persist(); renderAll(); closeEditor();
  });
  editorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!currentEditor) return;
    if (editorForm.querySelector("[data-device-image]:disabled")) return showEditorError("Espera a que termine de procesarse la imagen.");
    const form = new FormData(editorForm);
    const id = String(form.get("id") || "").trim();
    const existing = currentEditor.id;
    if (!/^[a-z0-9-]{2,50}$/.test(id)) return showEditorError("Usa un identificador simple: letras minúsculas, números y guiones.");
    if (currentEditor.type === "product") {
      if (!categoriesReady || !Object.hasOwn(categoryLabels, String(form.get("category") || ""))) return showEditorError("Selecciona una categoría válida de Supabase.");
      const image = String(form.get("image") || "").trim();
      const lookImage = String(form.get("lookImage") || "").trim();
      if (!validProductImage(image) || (lookImage && !validProductImage(lookImage))) return showEditorError("Selecciona una imagen JPG, PNG o WEBP válida.");
      if (!existing && state.products.some((product) => product.id === id)) return showEditorError("Ya existe un producto con ese identificador.");
      const variants = String(form.get("variants") || "Única").split(",").map((value) => value.trim()).filter(Boolean).slice(0, 20);
      if (!variants.length) return showEditorError("Agrega al menos una talla o variante.");
      const original = state.products.find((product) => product.id === existing);
      const product = {
        id, name: String(form.get("name") || "").trim().slice(0, 80), category: String(form.get("category") || "tshirts"),
        price: Math.max(0, Number(form.get("price")) || 0), image, lookImage,
        variantName: String(form.get("variantName") || original?.variantName || "talla"), variants,
        description: String(form.get("description") || "").trim().slice(0, 240), stock: Math.max(0, Number.parseInt(form.get("stock"), 10) || 0),
        status: String(form.get("status") || "draft"), published: form.has("published"), preorder: form.has("preorder")
      };
      if (!product.name) return showEditorError("Agrega el nombre del producto.");
      if (existing) state.products = state.products.map((entry) => entry.id === existing ? product : entry); else state.products.unshift(product);
    } else {
      if (!existing && state.launches.some((launch) => launch.id === id)) return showEditorError("Ya existe un lanzamiento con ese identificador.");
      const image = String(form.get("image") || "").trim();
      if (!validProductImage(image)) return showEditorError("Selecciona una imagen JPG, PNG o WEBP válida.");
      const launch = { id, name: String(form.get("name") || "").trim().slice(0, 90), launchDate: String(form.get("launchDate") || ""), arrivalDate: String(form.get("arrivalDate") || "").trim().slice(0, 60), image, status: String(form.get("status") || "upcoming"), productIds: Array.from(editorForm.querySelectorAll('input[name="productIds"]:checked')).map((input) => input.value).slice(0, 12) };
      if (!launch.name) return showEditorError("Agrega el nombre del lanzamiento.");
      if (existing) state.launches = state.launches.map((entry) => entry.id === existing ? launch : entry); else state.launches.unshift(launch);
    }
    persist(); renderAll(); closeEditor();
  });
  function showEditorError(message) { $("#editorMessage").textContent = message; $("#editorMessage").hidden = false; }

  $("#contentForm").addEventListener("submit", (event) => { event.preventDefault(); saveContent(); });
  $("#saveContentButton").addEventListener("click", saveContent);
  function saveContent() {
    const form = $("#contentForm");
    const videos = $$("[data-video-index]").map((input) => normalizeVideoUrl(input.value)).filter(Boolean);
    const instagramUrl = validSocialUrl(form.elements.instagramUrl.value, "instagram.com");
    const tiktokUrl = validSocialUrl(form.elements.tiktokUrl.value, "tiktok.com");
    if (!instagramUrl || !tiktokUrl) return window.alert("Verifica los enlaces de Instagram y TikTok de Dirtytask.");
    state.content = {
      heroCopy: form.elements.heroCopy.value.trim().slice(0, 240), feedCopy: form.elements.feedCopy.value.trim().slice(0, 140),
      instagramUrl, tiktokUrl,
      videos: videos.length ? videos : clone(seed.content.videos)
    };
    persist(); renderContent(); announceSaved();
  }
  $("#addVideoButton").addEventListener("click", () => {
    if (state.content.videos.length >= 12) return window.alert("Puedes agregar hasta 12 videos.");
    state.content.videos.push("https://www.tiktok.com/@dirtytask/video/7326274171879591173"); renderVideos();
  });
  $("#videoList").addEventListener("input", () => {
    const videos = $$("[data-video-index]").map((input) => normalizeVideoUrl(input.value)).filter(Boolean);
    if (videos.length) { state.content.videos = videos; persist(); }
  });
  $("#videoList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-video]");
    if (!button) return;
    state.content.videos.splice(Number(button.dataset.removeVideo), 1); persist(); renderVideos();
  });
  $("#profileForm").addEventListener("submit", (event) => { event.preventDefault(); saveSettings(); });
  $("#shippingForm").addEventListener("submit", (event) => { event.preventDefault(); saveSettings(); });
  $("#paymentForm").addEventListener("submit", (event) => { event.preventDefault(); saveSettings(); });
  $("#saveSettingsButton").addEventListener("click", saveSettings);
  $("#accountAvatar").addEventListener("click", () => { switchView("settings"); $("#profileForm").elements.displayName.focus(); });
  $("#profileAvatarInput").addEventListener("change", async (event) => {
    const input = event.currentTarget;
    const file = input.files && input.files[0];
    const status = $("#profileAvatarStatus");
    if (!file) return;
    input.disabled = true;
    status.textContent = "Optimizando imagen…";
    try {
      const dataUrl = await compressDeviceImage(file);
      if (!isDeviceImage(dataUrl)) throw new Error("No se pudo preparar la imagen.");
      const previous = state.profile.avatar;
      state.profile.avatar = dataUrl;
      if (!persist()) {
        state.profile.avatar = previous;
        status.textContent = "No se pudo guardar la imagen en este navegador.";
      } else {
        renderProfile();
        status.textContent = "Imagen actualizada.";
      }
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "No se pudo cargar esa imagen.";
    } finally {
      input.disabled = false;
      input.value = "";
    }
  });
  $("#clearProfileAvatar").addEventListener("click", () => {
    state.profile.avatar = "";
    $("#profileAvatarStatus").textContent = state.profile.displayName ? "Imagen quitada." : "";
    persist();
    renderProfile();
  });
  function saveSettings() {
    const shipping = $("#shippingForm"); const payments = $("#paymentForm"); const profileForm = $("#profileForm");
    const displayName = String(profileForm.elements.displayName.value || "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (displayName.length < 2) {
      window.alert("Escribe un nombre de al menos 2 caracteres.");
      profileForm.elements.displayName.focus();
      return;
    }
    if (![payments.elements.cash.checked, payments.elements.visaInstallments.checked, payments.elements.visalink.checked].some(Boolean)) {
      window.alert("Deja al menos un método de pago disponible.");
      renderSettings();
      return;
    }
    state.profile.displayName = displayName;
    state.settings = {
      shippingGuatemala: Math.max(0, Number(shipping.elements.shippingGuatemala.value) || 0),
      shippingOther: Math.max(0, Number(shipping.elements.shippingOther.value) || 0),
      payments: { cash: payments.elements.cash.checked, visaInstallments: payments.elements.visaInstallments.checked, visalink: payments.elements.visalink.checked }
    };
    if (!persist()) return;
    renderProfile();
    announceSaved();
  }
  function announceSaved() {
    const welcome = $("#welcomeName");
    const previous = welcome.textContent;
    welcome.textContent = "Guardado en este navegador";
    setTimeout(() => { if (welcome.isConnected) welcome.textContent = previous; }, 2200);
  }
  $$('input[name="shippingGuatemala"], input[name="shippingOther"], input[name="cash"], input[name="visaInstallments"], input[name="visalink"]').forEach((input) => input.addEventListener("change", saveSettings));
  $$('[data-video-index]').forEach((input) => input.addEventListener("change", saveContent));
})();
