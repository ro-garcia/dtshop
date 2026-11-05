(async () => {
  const safeText = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
  const results = await Promise.allSettled([
    Promise.resolve().then(() => window.storefrontApi.readCatalog()),
    Promise.resolve().then(() => window.storefrontApi.readContent())
  ]);
  const catalogData = results[0].status === 'fulfilled' ? results[0].value : null;
  const contentData = results[1].status === 'fulfilled' ? results[1].value : null;
  const products = Object.assign(Object.create(null), Object.fromEntries((catalogData?.products || []).map(product => [product.id,product])));
  const currency = catalogData?.settings.currency || 'GTQ';
  const money = value => new Intl.NumberFormat('es-GT', {style:'currency',currency,maximumFractionDigits:2}).format(Number(value));
  mountStorefront();
  const cards = Array.from(document.querySelectorAll(".product-card"));
  const catalogPhotoCards = Array.from(document.querySelectorAll(".product-card, .editorial-product-card"));
  const filters = Array.from(document.querySelectorAll(".filter-button"));
  const searchInput = document.getElementById("productSearch");
  const sortSelect = document.getElementById("sortSelect");
  const grid = document.getElementById("productGrid");
  const resultCount = document.getElementById("resultCount");
  const emptyState = document.getElementById("emptyState");
  const productDialog = document.getElementById("productDialog");
  const cartDialog = document.getElementById("cartDialog");
  const menuToggle = document.getElementById("menuToggle");
  const primaryNav = document.getElementById("primaryNav");
  const launchItems = Array.from(document.querySelectorAll(".launch-item"));
  const sizeOptions = document.getElementById("sizeOptions");
  const addToBagButton = document.getElementById("addToBag");
  const dialogProductImage = document.getElementById("dialogProductImage");
  const viewCaption = document.getElementById("viewCaption");
  const catalogViewButtons = Array.from(document.querySelectorAll("[data-catalog-view]"));
  const instagramTrack = document.getElementById("instagramTrack");
  const instagramPrev = document.getElementById("instagramPrev");
  const instagramNext = document.getElementById("instagramNext");
  const cartLines = document.getElementById("cartLines");
  const cartEmpty = document.getElementById("cartEmpty");
  const cartFooter = document.getElementById("cartFooter");
  const bagCount = document.getElementById("bagCount");
  const openCartButton = document.getElementById("openCart");
  let activeFilter = "all";
  let activeCatalogView = "product";
  let activeProduct = null;
  let activeSize = "";
  let toastTimeout;
  let cart = [];
  try {
    const savedCart = JSON.parse(localStorage.getItem("dirtytask-cart") || "[]");
    if (Array.isArray(savedCart)) {
      const used = new Map();
      for (const item of savedCart) {
        const product = products[item?.id];
        if (!product || !product.variants.includes(item.size) || !Number.isInteger(item.qty) || item.qty < 1) continue;
        const max = product.preorder ? 99 : Math.min(99,product.stock);
        const qty = Math.min(item.qty,max-(used.get(item.id)||0));
        if (qty < 1) continue;
        const existing = cart.find(entry => entry.id === item.id && entry.size === item.size);
        if (existing) existing.qty += qty; else cart.push({id:item.id,size:item.size,qty});
        used.set(item.id,(used.get(item.id)||0)+qty);
      }
    }
  } catch (_) {
    cart = [];
  }

  const saveCart = () => {
    try { localStorage.setItem("dirtytask-cart", JSON.stringify(cart)); } catch (_) { /* The cart still works for this visit. */ }
  };
  const announce = (message) => {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  };

  function renderCart() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = cart.reduce((sum, item) => sum + products[item.id].price * item.qty, 0);
    bagCount.textContent = String(count);
    openCartButton.setAttribute("aria-label", "Abrir bolsa de compras, " + count + (count === 1 ? " artículo" : " artículos"));
    cartEmpty.hidden = count !== 0;
    cartFooter.hidden = count === 0;
    document.getElementById("cartSubtotal").textContent = money(subtotal);
    cartLines.innerHTML = cart.map((item) => {
      const product = products[item.id];
      return '<article class="cart-line" data-cart-key="' + safeText(item.id + "-" + item.size) + '">' +
        '<img class="cart-line-image" src="' + safeText(product.image) + '" alt="" loading="lazy">' +
        '<div class="cart-line-copy"><p>' + safeText(product.category) + '</p><h3>' + safeText(product.name) + '</h3><span>' + (product.preorder ? 'Reserva · ' : '') + safeText(product.variantName.charAt(0).toUpperCase() + product.variantName.slice(1)) + ' ' + safeText(item.size) + ' · ' + money(product.price) + '</span>' +
        '<div class="quantity" aria-label="Cantidad de ' + safeText(product.name) + '">' +
        '<button type="button" data-quantity="-1" data-id="' + safeText(item.id) + '" data-size="' + safeText(item.size) + '" aria-label="Quitar una unidad">−</button>' +
        '<output>' + item.qty + '</output>' +
        '<button type="button" data-quantity="1" data-id="' + safeText(item.id) + '" data-size="' + safeText(item.size) + '" aria-label="Agregar una unidad">+</button></div></div>' +
        '<div class="cart-line-end"><strong>' + money(product.price * item.qty) + '</strong>' +
        '<button class="remove-item" type="button" data-remove-id="' + safeText(item.id) + '" data-remove-size="' + safeText(item.size) + '">Quitar</button></div></article>';
    }).join("");
  }

  function updateInstagramControls() {
    const maxScroll = instagramTrack.scrollWidth - instagramTrack.clientWidth;
    instagramPrev.disabled = instagramTrack.scrollLeft <= 1;
    instagramNext.disabled = instagramTrack.scrollLeft >= maxScroll - 1;
  }
  function scrollInstagram(direction) {
    const firstTile = instagramTrack.querySelector(".instagram-tile");
    if (!firstTile) return;
    const gap = parseFloat(getComputedStyle(instagramTrack).columnGap) || 0;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    instagramTrack.scrollBy({ left: direction * (firstTile.getBoundingClientRect().width + gap), behavior });
  }
  instagramPrev.addEventListener("click", () => scrollInstagram(-1));
  instagramNext.addEventListener("click", () => scrollInstagram(1));
  instagramTrack.addEventListener("scroll", updateInstagramControls, { passive: true });
  window.addEventListener("resize", updateInstagramControls);
  updateInstagramControls();

  const tiktokTiles = Array.from(instagramTrack.querySelectorAll(".instagram-video-tile"));
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const loadTikTokPlayer = (tile) => {
    const player = tile.querySelector(".tiktok-embed-player");
    if (!player) return;
    if (!player.hasAttribute("src")) {
      const source = new URL(player.dataset.src);
      if (prefersReducedMotion.matches) {
        source.searchParams.set("autoplay", "0");
        source.searchParams.set("controls", "1");
        source.searchParams.set("play_button", "1");
      }
      player.src = source.href;
    } else if (!prefersReducedMotion.matches) {
      player.contentWindow?.postMessage({ type: "play", "x-tiktok-player": true }, "*");
    }
  };
  const pauseTikTokPlayer = (tile) => {
    const player = tile.querySelector(".tiktok-embed-player");
    if (player?.hasAttribute("src")) player.contentWindow?.postMessage({ type: "pause", "x-tiktok-player": true }, "*");
  };
  if ("IntersectionObserver" in window) {
    const tiktokObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= .35) loadTikTokPlayer(entry.target);
        else pauseTikTokPlayer(entry.target);
      });
    }, { threshold: [0, .35] });
    tiktokTiles.forEach((tile) => tiktokObserver.observe(tile));
  } else {
    tiktokTiles.forEach(loadTikTokPlayer);
  }

  function applyFilters() {
    document.querySelectorAll('[data-category-link]').forEach(link=>{
      const selected=link.dataset.categoryLink===activeFilter;
      link.classList.toggle('is-selected',selected);
      if(selected)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
    });
    if (!catalogData) {
      resultCount.textContent = 'Catálogo no disponible.';
      document.getElementById('emptyTitle').textContent = 'No pudimos cargar la colección.';
      document.getElementById('emptyCopy').textContent = 'Comprueba tu conexión y recarga la página.';
      grid.hidden = true; emptyState.hidden = false;
      return;
    }
    const query = searchInput.value.trim().toLocaleLowerCase("es");
    let visibleCount = 0;
    cards.forEach((card) => {
      const categoryMatch = activeFilter === "all" || card.dataset.category === activeFilter;
      const queryMatch = !query || card.dataset.search.toLocaleLowerCase("es").includes(query) || card.querySelector("h3").textContent.toLocaleLowerCase("es").includes(query);
      card.hidden = !(categoryMatch && queryMatch);
      if (!card.hidden) visibleCount += 1;
    });
    resultCount.textContent = visibleCount + (visibleCount === 1 ? " pieza" : " piezas");
    const totalCount = document.querySelector('[data-filter="all"] span');
    if (totalCount) totalCount.textContent = String(cards.length).padStart(2, "0");
    emptyState.hidden = visibleCount !== 0;
    grid.hidden = visibleCount === 0;
    if (visibleCount === 0) {
      const emptyTitle = document.getElementById("emptyTitle");
      const emptyCopy = document.getElementById("emptyCopy");
      if (!cards.length) {
        emptyTitle.textContent = "El catálogo está vacío.";
        emptyCopy.textContent = "Todavía no hay piezas publicadas. Vuelve pronto para descubrir novedades.";
      } else if (query) {
        emptyTitle.textContent = "No encontramos esa pieza.";
        emptyCopy.textContent = "Prueba otra palabra o revisa una subcategoría distinta.";
      } else {
        emptyTitle.textContent = 'No hay piezas en esta categoría.';
        emptyCopy.textContent = 'Explora otra categoría o vuelve a ver toda la colección.';
      }
    }
  }

  function setCatalogView(view) {
    activeCatalogView = view === "look" ? "look" : "product";
    catalogPhotoCards.forEach((card) => {
      const product = products[card.dataset.productId];
      if (!product) return;
      const showLook = activeCatalogView === "look" && Boolean(product.lookImage);
      const image = card.querySelector(".product-photo img, .editorial-product-photo img");
      const photoButton = card.querySelector(".product-photo, .editorial-product-photo");
      const index = card.querySelector(".photo-index, .editorial-view-index");
      if (!image || !photoButton) return;
      image.src = showLook ? product.lookImage : product.image;
      image.alt = showLook ? product.lookAlt : "Foto de producto: " + product.name;
      photoButton.classList.toggle("photo-product", !showLook);
      photoButton.classList.toggle("photo-look", showLook);
      photoButton.setAttribute("aria-label", showLook ? "Ver look para " + product.name : "Ver " + product.name);
      if (index) index.textContent = showLook ? "LOOK / " + String(card.dataset.order).padStart(2, "0") : "A / " + String(card.dataset.order).padStart(2, "0");
    });
    catalogViewButtons.forEach((button) => {
      const selected = button.dataset.catalogView === activeCatalogView;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    if (activeProduct && productDialog.open) setProductView();
  }
  catalogViewButtons.forEach((button) => button.addEventListener("click", () => setCatalogView(button.dataset.catalogView)));

  let savedProducts = new Set();
  try {
    const storedProducts = JSON.parse(localStorage.getItem("dirtytask-saved-products") || "[]");
    if (Array.isArray(storedProducts)) savedProducts = new Set(storedProducts.filter((id) => products[id]));
  } catch (_) {
    savedProducts = new Set();
  }
  document.querySelectorAll("[data-save-product]").forEach((button) => {
    const id = button.dataset.saveProduct;
    const updateButton = (saved) => {
      button.setAttribute("aria-pressed", String(saved));
      button.setAttribute("aria-label", (saved ? "Quitar de guardados: " : "Guardar ") + products[id].name);
    };
    updateButton(savedProducts.has(id));
    button.addEventListener("click", () => {
      if (savedProducts.has(id)) savedProducts.delete(id);
      else savedProducts.add(id);
      updateButton(savedProducts.has(id));
      try { localStorage.setItem("dirtytask-saved-products", JSON.stringify(Array.from(savedProducts))); } catch (_) { /* Save state stays active for this visit. */ }
      announce(savedProducts.has(id) ? products[id].name + " guardado." : products[id].name + " quitado de guardados.");
    });
  });

  filters.forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filters.forEach((filter) => {
      const selected = filter === button;
      filter.classList.toggle("is-active", selected);
      filter.setAttribute("aria-pressed", String(selected));
    });
    applyFilters();
  }));
  document.querySelectorAll('[data-category-link]').forEach(link=>link.addEventListener('click',()=>{
    const filter=filters.find(button=>button.dataset.filter===link.dataset.categoryLink);
    if(!filter)return;
    searchInput.value='';filter.click();
    document.getElementById('collectionTitle').focus({preventScroll:true});
  }));
  primaryNav.querySelectorAll("[data-nav-filter]").forEach((link) => link.addEventListener("click", () => {
    const filter = filters.find((button) => button.dataset.filter === link.dataset.navFilter);
    if (!filter) return;
    searchInput.value = "";
    filter.click();
  }));
  searchInput.addEventListener("input", applyFilters);
  sortSelect.addEventListener("change", () => {
    const sorted = cards.slice().sort((a, b) => {
      if (sortSelect.value === "price-asc") return Number(a.dataset.price) - Number(b.dataset.price);
      if (sortSelect.value === "price-desc") return Number(b.dataset.price) - Number(a.dataset.price);
      return Number(a.dataset.order) - Number(b.dataset.order);
    });
    sorted.forEach((card) => grid.appendChild(card));
  });
  document.getElementById("resetFilters").addEventListener("click", () => {
    activeFilter = "all";
    searchInput.value = "";
    filters.forEach((filter) => {
      const selected = filter.dataset.filter === "all";
      filter.classList.toggle("is-active", selected);
      filter.setAttribute("aria-pressed", String(selected));
    });
    applyFilters();
    searchInput.focus();
  });

  function openProduct(id) {
    const product = products[id];
    if (!product) return;
    activeProduct = id;
    activeSize = "";
    setProductView();
    document.getElementById("dialogProductName").textContent = product.name;
    document.getElementById("dialogProductCategory").textContent = product.category;
    document.getElementById("dialogProductPrice").textContent = money(product.price);
    document.getElementById("dialogProductDescription").textContent = product.description;
    document.getElementById("selectedSizeLabel").textContent = "—";
    addToBagButton.disabled = true;
    addToBagButton.textContent = "Elige " + (product.variantName === "talla" ? "una talla" : "una variante");
    document.getElementById("variantLegend").firstChild.nodeValue = product.variantName === "talla" ? "Elige talla " : "Elige variante ";
    sizeOptions.innerHTML = product.variants.map((size) => '<button class="size-option" type="button" aria-pressed="false" data-size-choice="' + safeText(size) + '"' + (!product.preorder && product.stock < 1 ? ' disabled' : '') + '>' + safeText(size) + '</button>').join("");
    productDialog.showModal();
  }
  function setProductView() {
    const product = products[activeProduct];
    if (!product) return;
    const showLook = activeCatalogView === "look" && Boolean(product.lookImage);
    dialogProductImage.src = showLook ? product.lookImage : product.image;
    dialogProductImage.alt = showLook ? product.lookAlt : "Foto de producto de Dirtytask: " + product.name;
    viewCaption.textContent = showLook ? "LOOK / ESTILISMO" : "PRODUCT / FOTO DE LA PIEZA";
    document.getElementById("productNote").textContent = "Consulta disponibilidad, tallas y entrega con Dirtytask por Instagram.";
  }
  document.querySelectorAll("[data-open-product]").forEach((button) => button.addEventListener("click", () => openProduct(button.dataset.openProduct)));
  document.querySelector("[data-close-product]").addEventListener("click", () => productDialog.close());
  sizeOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-size-choice]");
    if (!button) return;
    if (button.disabled || (!products[activeProduct]?.preorder && products[activeProduct]?.stock < 1)) return;
    activeSize = button.dataset.sizeChoice;
    sizeOptions.querySelectorAll("[data-size-choice]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
    document.getElementById("selectedSizeLabel").textContent = activeSize;
    addToBagButton.disabled = false;
    addToBagButton.textContent = (products[activeProduct].preorder ? "Reservar · " : "Añadir a la bolsa · ") + money(products[activeProduct].price);
  });
  addToBagButton.addEventListener("click", () => {
    if (!activeProduct || !activeSize) return;
    const product = products[activeProduct];
    const total = cart.filter(item => item.id === activeProduct).reduce((sum,item) => sum+item.qty,0);
    if (total >= (product.preorder ? 99 : Math.min(99,product.stock))) return announce('No hay más unidades disponibles para agregar.');
    const existing = cart.find((item) => item.id === activeProduct && item.size === activeSize);
    if (existing) existing.qty += 1;
    else cart.push({ id: activeProduct, size: activeSize, qty: 1 });
    const name = products[activeProduct].name;
    saveCart();
    renderCart();
    productDialog.close();
    announce(products[activeProduct].preorder
      ? "Reserva para " + name + " · talla " + activeSize + " agregada a la bolsa."
      : name + " · " + products[activeProduct].variantName + " " + activeSize + " añadida a la bolsa.");
  });

  openCartButton.addEventListener("click", () => cartDialog.showModal());
  document.querySelector("[data-close-cart]").addEventListener("click", () => cartDialog.close());
  document.getElementById("continueShopping").addEventListener("click", () => cartDialog.close());
  cartLines.addEventListener("click", (event) => {
    const quantityButton = event.target.closest("[data-quantity]");
    const removeButton = event.target.closest("[data-remove-id]");
    if (quantityButton) {
      const item = cart.find((entry) => entry.id === quantityButton.dataset.id && entry.size === quantityButton.dataset.size);
      if (!item) return;
      const product = products[item.id];
      const total = cart.filter(entry => entry.id === item.id).reduce((sum,entry) => sum+entry.qty,0);
      if (Number(quantityButton.dataset.quantity)>0 && total >= (product.preorder ? 99 : Math.min(99,product.stock))) return announce('No hay más unidades disponibles para agregar.');
      item.qty += Number(quantityButton.dataset.quantity);
      if (item.qty <= 0) cart = cart.filter((entry) => entry !== item);
    } else if (removeButton) {
      cart = cart.filter((entry) => !(entry.id === removeButton.dataset.removeId && entry.size === removeButton.dataset.removeSize));
    } else return;
    saveCart();
    renderCart();
  });
  document.getElementById("checkoutButton").addEventListener("click", () => {
    if (!cart.length) return;
    const order = cart.map((item) => {
      const product = products[item.id];
      return {
        id: item.id,
        variantId: product.variantRecords.find(variant => variant.label === item.size)?.id,
        name: product.name,
        category: product.category,
        variantName: product.variantName,
        price: product.price,
        image: product.image,
        preorder: Boolean(product.preorder),
        size: item.size,
        qty: item.qty
      };
    });
    try {
      sessionStorage.setItem("dirtytask-checkout-order", JSON.stringify(order));
      window.location.href = "checkout.html";
    } catch (_) {
      announce("No pudimos abrir el checkout. Revisa la configuración de almacenamiento de tu navegador.");
    }
  });
  [productDialog, cartDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!expanded));
    menuToggle.setAttribute("aria-label", expanded ? "Abrir navegación" : "Cerrar navegación");
    primaryNav.classList.toggle("is-open", !expanded);
  });
  primaryNav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir navegación");
    primaryNav.classList.remove("is-open");
  }));
  launchItems.forEach((item) => item.addEventListener("toggle", () => {
    if (item.open) launchItems.forEach((other) => { if (other !== item) other.open = false; });
  }));

  function mountStorefront() {
    const photo = product => '<img src="' + safeText(product.image || 'assets/dirtytask-logo.png') + '" alt="' + safeText(product.name) + '" loading="lazy">';
    const published = (catalogData?.products || []).filter(product => product.published);
    const categories=catalogData?.categories||[];
    document.getElementById('categorias').hidden=!categories.length;
    document.getElementById('categoryGrid').innerHTML=categories.map(category=>{
      const items=published.filter(product=>product.categoryCode===category.code);
      const image=items.find(product=>product.image&&!product.image.endsWith('dirtytask-logo.png'))?.image;
      return '<a class="category-card'+(image?'':' category-card-text')+'" href="#coleccion" data-category-link="'+safeText(category.code)+'">'+
        (image?'<div class="category-photo"><img src="'+safeText(image)+'" alt="" loading="lazy"></div>':'<div class="category-photo category-photo-empty" aria-hidden="true"><span>'+safeText(category.label.slice(0,1))+'</span></div>')+
        '<div class="category-meta"><p class="category-count">'+(items.length?items.length+' '+(items.length===1?'pieza':'piezas'):'Sin piezas por ahora')+'</p><h3>'+safeText(category.label)+'</h3><span class="category-action">Ver categoría <span class="category-arrow" aria-hidden="true">↗</span></span></div></a>';
    }).join('');
    document.getElementById('catalogCurrency').textContent = 'PRECIOS / ' + currency;
    if (catalogData) {
      document.querySelector('.filter-list').innerHTML = '<button class="filter-button is-active" type="button" data-filter="all" aria-pressed="true">Todo <span>00</span></button>' +
        catalogData.categories.map(category => '<button class="filter-button" type="button" data-filter="' + safeText(category.code) + '" aria-pressed="false">' + safeText(category.label) + '</button>').join('');
      document.querySelector('.nav-subcategories').innerHTML = catalogData.categories.map(category => '<a href="#coleccion" data-nav-filter="' + safeText(category.code) + '">' + safeText(category.label) + '</a>').join('');
    }
    document.getElementById('productGrid').innerHTML = published.map((product,index) =>
      '<article class="product-card" data-product-id="' + safeText(product.id) + '" data-category="' + safeText(product.categoryCode) + '" data-search="' + safeText(product.name+' '+product.category) + '" data-price="' + product.price + '" data-order="' + index + '">' +
      '<button class="product-photo photo-product" type="button" data-open-product="' + safeText(product.id) + '" aria-label="Ver ' + safeText(product.name) + '">' + photo(product) + '<span class="photo-index">A / '+String(index+1).padStart(2,'0')+'</span></button>' +
      '<div class="product-meta"><span>'+safeText(product.category)+'</span><span>'+(product.preorder?'PREVENTA':product.stock?'DISPONIBLE':'AGOTADO')+'</span></div>' +
      '<div class="product-title-row"><h3>'+safeText(product.name)+'</h3><span>'+safeText(money(product.price))+'</span></div>'+
      '<button class="quick-add" type="button" data-open-product="'+safeText(product.id)+'">Ver pieza <span>+</span></button></article>').join('');
    document.getElementById('new-in').hidden = !published.length;
    document.querySelector('.editorial-grid').innerHTML = '<div class="editorial-top-products">' + published.slice(-4).reverse().map((product,index) =>
      '<article class="editorial-product-card" data-product-id="'+safeText(product.id)+'" data-order="'+(index+1)+'"><div class="editorial-photo-wrap">' +
      '<button class="editorial-product-photo photo-product" type="button" data-open-product="'+safeText(product.id)+'" aria-label="Ver '+safeText(product.name)+'">'+photo(product)+'</button>'+
      '<button class="editorial-save" type="button" data-save-product="'+safeText(product.id)+'" aria-pressed="false" aria-label="Guardar '+safeText(product.name)+'">♡</button></div>'+
      '<div class="editorial-product-meta"><h3>'+safeText(product.name)+'</h3><span>'+safeText(money(product.price))+'</span></div></article>').join('')+'</div>';
    const launches = catalogData?.launches || [];
    document.querySelector('.drop-open').textContent = launches.length ? launches.length+' LANZAMIENTOS' : catalogData ? 'SIN LANZAMIENTOS' : 'NO DISPONIBLE';
    document.querySelector('.launch-list').innerHTML = launches.map((launch,index) =>
      '<details class="launch-item"><summary class="launch-summary"><span class="launch-summary-image"><img src="'+safeText(launch.image || 'assets/dirtytask-logo.png')+'" alt="" loading="lazy"></span><span class="launch-summary-copy"><span class="launch-summary-overline">DROP / '+String(index+1).padStart(2,'0')+'</span><strong class="launch-summary-title">'+safeText(launch.name)+'</strong><span class="launch-summary-meta">'+safeText(launch.launchDate || 'Fecha por confirmar')+'</span></span><span class="launch-summary-action">'+(launch.status==='open'?'Reservas abiertas':'Próximamente')+' <i>+</i></span></summary>'+
      '<div class="drop-layout"><div class="drop-visual"><img src="'+safeText(launch.image || 'assets/dirtytask-logo.png')+'" alt="'+safeText(launch.name)+'" loading="lazy"></div>'+
      '<div class="drop-content"><p class="drop-description">Llegada: '+safeText(launch.arrivalDate || 'Por confirmar')+'</p><div class="drop-product-list">'+launch.productIds.map(id => {
        const product=products[id];
        return '<div class="drop-product"><h3>'+safeText(product.name)+'</h3><strong>'+safeText(money(product.price))+'</strong><button type="button" data-open-product="'+safeText(id)+'">Ver pieza <span>+</span></button></div>';
      }).join('')+'</div></div></div></details>').join('') || '<p class="drop-empty">'+(catalogData?'No hay drops publicados.':'No se pudieron consultar los lanzamientos.')+'</p>';
    const contentStatus = document.getElementById('publicContentStatus');
    document.querySelector('.hero-copy').setAttribute('aria-busy', 'false');
    document.querySelector('.instagram-caption').setAttribute('aria-busy', 'false');
    if (!contentData) {
      contentStatus.textContent = 'No se pudo cargar el contenido. Recarga la página para actualizarlo.';
      return;
    }
    document.querySelector('.hero-copy').textContent = contentData.heroCopy;
    const heroImage=document.querySelector('.hero-image');
    heroImage.src=contentData.heroImage || 'assets/campaign-city.jpg';
    heroImage.alt='Portada de Dirtytask Clothing Store';
    document.querySelector('.instagram-caption').textContent = contentData.feedCopy;
    document.querySelectorAll('a[href]').forEach(anchor => {
      try {
        const host = new URL(anchor.href).hostname.replace(/^www\./,'');
        if (host==='instagram.com' && contentData.instagramUrl) anchor.href=contentData.instagramUrl;
        if (host==='tiktok.com' && contentData.tiktokUrl) anchor.href=contentData.tiktokUrl;
      } catch {}
    });
    document.getElementById('instagramTrack').innerHTML = contentData.videos.map(video => {
      const tiktok = window.storefrontApi.socialUrl(video.url,'tiktok.com');
      const instagram = window.storefrontApi.socialUrl(video.url,'instagram.com');
      const id = tiktok && new URL(tiktok).pathname.match(/^\/@[\w.-]+\/video\/(\d{8,22})$/)?.[1];
      if (id) return '<article class="instagram-tile instagram-video-tile"><iframe class="tiktok-embed-player" data-src="https://www.tiktok.com/player/v1/'+id+'?autoplay=1&amp;muted=1&amp;loop=1&amp;controls=0" title="Video de Dirtytask en TikTok" loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe><a class="instagram-tile-type" href="'+safeText(tiktok)+'" target="_blank" rel="noopener noreferrer">TIKTOK</a></article>';
      if (instagram && /^\/(?:reel|p)\/[\w-]+\/?$/.test(new URL(instagram).pathname)) return '<a class="instagram-tile" href="'+safeText(instagram)+'" target="_blank" rel="noopener noreferrer"><span class="instagram-tile-type">Ver video en Instagram ↗</span></a>';
      return '';
    }).join('');
    contentStatus.textContent = document.getElementById('instagramTrack').children.length ? '' : 'Todavía no hay videos publicados.';
  }

  applyFilters();
  renderCart();
  openCartButton.disabled = !catalogData;
  if (catalogData) saveCart();
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-ready");
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
  }
})();
