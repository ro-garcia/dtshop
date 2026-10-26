(() => {
  const products = {
    "tee-noche": {
      name: "Playera gráfica RIPNDIP",
      category: "RIPNDIP / PLAYERA",
      variantName: "talla",
      price: 299,
      image: "assets/ripndip-tee.jpg",
      lookImage: "assets/look-daylight.jpg",
      lookAlt: "Persona con una prenda gráfica negra puesta en un look urbano.",
      description: "Playera negra con gráfica ilustrada de RIPNDIP. Consulta disponibilidad y tallas con Dirtytask."
    },
    "tee-grateful": {
      name: "Playera gráfica negra",
      category: "GRÁFICA / PLAYERA",
      variantName: "talla",
      price: 349,
      image: "assets/grateful-tee.jpg",
      lookImage: "assets/beard-black-tee.jpg",
      lookAlt: "Persona con una playera negra en un look urbano.",
      description: "Playera negra con gráfico circular de estilo psicodélico. Consulta las tallas disponibles con Dirtytask."
    },
    "tee-solar": {
      name: "Playera gráfica ilustrada",
      category: "GRÁFICA / PLAYERA",
      variantName: "talla",
      price: 299,
      image: "assets/graphic-tee.jpg",
      lookImage: "assets/look-white-hoodie.jpg",
      lookAlt: "Persona con una prenda clara en un look urbano.",
      description: "Playera con ilustración azul y amarilla. Consulta disponibilidad y tallas con Dirtytask."
    },
    "clogs-pokemon": {
      name: "Clogs Crocs x Pokémon",
      category: "CROCS X POKÉMON / CLOGS",
      variantName: "talla",
      price: 699,
      image: "assets/pokemon-clogs.jpg",
      lookImage: "assets/look-daylight.jpg",
      lookAlt: "Look streetwear completo con calzado puesto.",
      description: "Clogs de Pikachu, Jigglypuff y Gengar de la colección Crocs x Pokémon."
    },
    "sneakers-adidas": {
      name: "Sneakers Adidas",
      category: "ADIDAS / SNEAKERS",
      variantName: "talla",
      price: 1190,
      image: "assets/adidas-sneakers.jpg",
      lookImage: "assets/leather-denim.jpg",
      lookAlt: "Look urbano completo con sneakers blancos puestos.",
      description: "Par blanco con detalles negros, mostrado en una foto publicada por Dirtytask. Modelo exacto, tallas y precio deben confirmarse con la tienda."
    },
    "tumbler-ripndip": {
      name: "Vaso térmico RIPNDIP",
      category: "RIPNDIP / ACCESORIOS",
      variantName: "variante",
      price: 399,
      image: "assets/ripndip-tumbler.jpg",
      lookImage: "assets/campaign-city.jpg",
      lookAlt: "Look urbano para combinar accesorios streetwear.",
      description: "Vaso térmico azul con ilustración de gato. Consulta disponibilidad con Dirtytask."
    },
    "preorder-pikachu": {
      name: "Pikachu Classic Clog",
      category: "CROCS X POKÉMON / PREVENTA",
      variantName: "talla",
      preorder: true,
      price: 899,
      image: "assets/pokemon-clogs.jpg",
      lookImage: "assets/look-daylight.jpg",
      lookAlt: "Look streetwear completo con calzado puesto.",
      description: "Pikachu Classic Clog de la colección Crocs x Pokémon. Consulta tallas y fecha de llegada con Dirtytask."
    },
    "preorder-jigglypuff": {
      name: "Jigglypuff Classic Clog",
      category: "CROCS X POKÉMON / PREVENTA",
      variantName: "talla",
      preorder: true,
      price: 899,
      image: "assets/pokemon-clogs.jpg",
      lookImage: "assets/look-daylight.jpg",
      lookAlt: "Look streetwear completo con calzado puesto.",
      description: "Jigglypuff Classic Clog de la colección Crocs x Pokémon. Consulta tallas y fecha de llegada con Dirtytask."
    },
    "preorder-gengar": {
      name: "Gengar Classic Clog",
      category: "CROCS X POKÉMON / PREVENTA",
      variantName: "talla",
      preorder: true,
      price: 949,
      image: "assets/pokemon-clogs.jpg",
      lookImage: "assets/look-daylight.jpg",
      lookAlt: "Look streetwear completo con calzado puesto.",
      description: "Gengar Classic Clog de la colección Crocs x Pokémon. Consulta tallas y fecha de llegada con Dirtytask."
    },
    "denim-wide-leg": {
      name: "Denim Wide Leg 502",
      category: "DENIM / PANTALÓN",
      variantName: "talla",
      price: 790,
      image: "assets/leather-denim.jpg",
      lookImage: "assets/look-daylight.jpg",
      lookAlt: "Pantalón amplio dentro de un look streetwear.",
      description: "Denim de corte amplio con silueta relajada para llevarlo todos los días."
    },
    "overshirt-canvas": {
      name: "Utility Canvas Jacket",
      category: "UTILITY / CHAQUETA",
      variantName: "talla",
      price: 890,
      image: "assets/tan-jacket.jpg",
      lookImage: "assets/campaign-city.jpg",
      lookAlt: "Chaqueta utilitaria dentro de un look urbano.",
      description: "Chaqueta utilitaria en tono arena, con una silueta versátil para combinar en capas."
    },
    "bomber-afterhours": {
      name: "Bomber Afterhours",
      category: "AFTERHOURS / BOMBER",
      variantName: "talla",
      price: 990,
      image: "assets/red-jacket.jpg",
      lookImage: "assets/leather-denim.jpg",
      lookAlt: "Bomber de color dentro de un look streetwear.",
      description: "Bomber de corte relajado con color protagonista y acabado urbano."
    },
    "hoodie-cloud": {
      name: "Hoodie Cloud Wash",
      category: "CLOUD WASH / HOODIE",
      variantName: "talla",
      price: 690,
      image: "assets/look-white-hoodie.jpg",
      lookImage: "assets/look-daylight.jpg",
      lookAlt: "Hoodie claro combinado en un look urbano.",
      description: "Hoodie de tacto cómodo y volumen relajado, ideal para llevar en capas."
    },
    "hoodie-signal": {
      name: "Hoodie Signal",
      category: "SIGNAL / HOODIE",
      variantName: "talla",
      price: 720,
      image: "assets/look-daylight.jpg",
      lookImage: "assets/look-white-hoodie.jpg",
      lookAlt: "Hoodie gráfico combinado en un look de calle.",
      description: "Hoodie gráfico de inspiración nocturna con ajuste relajado."
    },
    "tee-afterhours": {
      name: "Afterhours Graphic Tee",
      category: "AFTERHOURS / T-SHIRT",
      variantName: "talla",
      price: 380,
      image: "assets/ripndip-tee.jpg",
      lookImage: "assets/beard-black-tee.jpg",
      lookAlt: "Playera gráfica oscura dentro de un look urbano.",
      description: "Playera gráfica de algodón con una silueta clásica y fácil de combinar."
    },
    "tee-static": {
      name: "Static Print Tee",
      category: "STATIC / T-SHIRT",
      variantName: "talla",
      price: 350,
      image: "assets/graphic-tee.jpg",
      lookImage: "assets/look-white-hoodie.jpg",
      lookAlt: "Playera gráfica en un look streetwear.",
      description: "Playera de fit relajado con una gráfica ilustrada de alto contraste."
    },
    "crewneck-crossfade": {
      name: "Crossfade Crewneck",
      category: "CROSSFADE / CREWNECK",
      variantName: "talla",
      price: 790,
      image: "assets/grateful-tee.jpg",
      lookImage: "assets/red-jacket.jpg",
      lookAlt: "Prenda gráfica combinada en un look urbano.",
      description: "Crewneck de peso medio con gráfico frontal y corte amplio."
    }
  };
  products["tee-noche"].variants = ["S", "M", "L", "XL", "XXL"];
  products["tee-grateful"].variants = ["S", "M", "L", "XL", "XXL"];
  products["tee-solar"].variants = ["S", "M", "L", "XL", "XXL"];
  products["clogs-pokemon"].variants = ["37", "38", "39", "40", "41", "42", "43"];
  products["sneakers-adidas"].variants = ["37", "38", "39", "40", "41", "42", "43"];
  products["tumbler-ripndip"].variants = ["Única"];
  products["preorder-pikachu"].variants = ["37", "38", "39", "40", "41", "42", "43"];
  products["preorder-jigglypuff"].variants = ["37", "38", "39", "40", "41", "42", "43"];
  products["preorder-gengar"].variants = ["37", "38", "39", "40", "41", "42", "43"];
  products["denim-wide-leg"].variants = ["28", "30", "32", "34", "36"];
  products["overshirt-canvas"].variants = ["S", "M", "L", "XL"];
  products["bomber-afterhours"].variants = ["S", "M", "L", "XL"];
  products["hoodie-cloud"].variants = ["S", "M", "L", "XL"];
  products["hoodie-signal"].variants = ["S", "M", "L", "XL"];
  products["tee-afterhours"].variants = ["S", "M", "L", "XL"];
  products["tee-static"].variants = ["S", "M", "L", "XL"];
  products["crewneck-crossfade"].variants = ["S", "M", "L", "XL"];
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
    const savedCart = JSON.parse(localStorage.getItem("dirtytask-demo-cart") || "[]");
    if (Array.isArray(savedCart)) cart = savedCart.filter((item) => products[item.id] && products[item.id].variants.includes(item.size) && Number.isFinite(item.qty) && item.qty > 0);
  } catch (_) {
    cart = [];
  }

  const money = (value) => "Q " + new Intl.NumberFormat("es-GT", { maximumFractionDigits: 0 }).format(Number(value));
  const safeText = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[char]);
  const saveCart = () => {
    try { localStorage.setItem("dirtytask-demo-cart", JSON.stringify(cart)); } catch (_) { /* The cart still works for this visit. */ }
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
    const query = searchInput.value.trim().toLocaleLowerCase("es");
    let visibleCount = 0;
    cards.forEach((card) => {
      const categoryMatch = activeFilter === "all" || card.dataset.category === activeFilter;
      const queryMatch = !query || card.dataset.search.toLocaleLowerCase("es").includes(query) || card.querySelector("h3").textContent.toLocaleLowerCase("es").includes(query);
      card.hidden = !(categoryMatch && queryMatch);
      if (!card.hidden) visibleCount += 1;
    });
    resultCount.textContent = visibleCount + (visibleCount === 1 ? " pieza" : " piezas");
    emptyState.hidden = visibleCount !== 0;
    grid.hidden = visibleCount === 0;
    if (visibleCount === 0) {
      const emptyTitle = document.getElementById("emptyTitle");
      const emptyCopy = document.getElementById("emptyCopy");
      if (query) {
        emptyTitle.textContent = "No encontramos esa pieza.";
        emptyCopy.textContent = "Prueba otra palabra o revisa una subcategoría distinta.";
      } else if (activeFilter === "hoodies") {
        emptyTitle.textContent = "Hoodies: próximamente.";
        emptyCopy.textContent = "Próximamente habrá más hoodies en esta subcategoría.";
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
    addToBagButton.innerHTML = "Elige " + (product.variantName === "talla" ? "una talla" : "una variante") + " <span aria-hidden=\"true\">↗</span>";
    document.getElementById("variantLegend").firstChild.nodeValue = product.variantName === "talla" ? "Elige talla " : "Elige variante ";
    sizeOptions.innerHTML = product.variants.map((size) => '<button class="size-option" type="button" aria-pressed="false" data-size-choice="' + size + '">' + size + '</button>').join("");
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
    activeSize = button.dataset.sizeChoice;
    sizeOptions.querySelectorAll("[data-size-choice]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
    document.getElementById("selectedSizeLabel").textContent = activeSize;
    addToBagButton.disabled = false;
    addToBagButton.innerHTML = (products[activeProduct].preorder ? "Reservar · " : "Añadir a la bolsa · ") + money(products[activeProduct].price) + " <span aria-hidden=\"true\">↗</span>";
  });
  addToBagButton.addEventListener("click", () => {
    if (!activeProduct || !activeSize) return;
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

  renderCart();
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
