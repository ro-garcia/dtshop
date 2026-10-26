(() => {
  const layout = document.getElementById("checkoutLayout");
  const emptyState = document.getElementById("checkoutEmpty");
  const itemsElement = document.getElementById("checkoutItems");
  const subtotalElement = document.getElementById("orderSubtotal");
  const shippingElement = document.getElementById("orderShipping");
  const totalElement = document.getElementById("orderTotal");
  const countElement = document.getElementById("orderCount");
  const departmentSelect = document.getElementById("department");
  const shippingNote = document.getElementById("shippingNote");
  const form = document.getElementById("billingForm");
  const status = document.getElementById("checkoutStatus");
  const money = (value) => "Q " + new Intl.NumberFormat("es-GT", { maximumFractionDigits: 0 }).format(value);
  const validImage = (value) => typeof value === "string" && /^assets\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/i.test(value);

  let order = [];
  try {
    const savedOrder = JSON.parse(sessionStorage.getItem("dirtytask-checkout-order") || "[]");
    if (Array.isArray(savedOrder)) {
      order = savedOrder.filter((item) => item &&
        typeof item.id === "string" && /^[a-z0-9-]+$/i.test(item.id) &&
        typeof item.name === "string" && item.name.length <= 100 &&
        typeof item.category === "string" && item.category.length <= 100 &&
        typeof item.variantName === "string" && item.variantName.length <= 30 &&
        Number.isSafeInteger(item.price) && item.price >= 0 &&
        validImage(item.image) &&
        typeof item.size === "string" && item.size.length <= 20 &&
        Number.isSafeInteger(item.qty) && item.qty > 0 && item.qty <= 99
      ).map((item) => ({ ...item, preorder: Boolean(item.preorder) }));
    }
  } catch (_) {
    order = [];
  }

  if (!order.length) {
    emptyState.hidden = false;
  } else {
    layout.hidden = false;
    const itemCount = order.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = order.reduce((sum, item) => sum + item.price * item.qty, 0);
    countElement.textContent = itemCount + (itemCount === 1 ? " PIEZA" : " PIEZAS");
    subtotalElement.textContent = money(subtotal);

    const updateShipping = () => {
      const department = departmentSelect.value;
      if (!department) {
        shippingElement.textContent = "Pendiente";
        totalElement.textContent = "—";
        shippingNote.textContent = "Elige tu departamento para calcular el envío.";
        return;
      }
      const shipping = department === "Guatemala" ? 25 : 35;
      shippingElement.textContent = money(shipping);
      totalElement.textContent = money(subtotal + shipping);
      shippingNote.textContent = department === "Guatemala"
        ? "Envío al departamento de Guatemala: Q 25."
        : "Envío a " + department + ": Q 35.";
    };
    departmentSelect.addEventListener("change", updateShipping);
    updateShipping();

    order.forEach((item) => {
      const row = document.createElement("li");
      row.className = "checkout-item";

      const image = document.createElement("img");
      image.src = item.image;
      image.alt = "";
      image.loading = "lazy";

      const copy = document.createElement("div");
      copy.className = "checkout-item-copy";
      const category = document.createElement("small");
      category.textContent = (item.preorder ? "RESERVA / " : "") + item.category;
      const title = document.createElement("h3");
      title.textContent = item.name;
      const variant = document.createElement("span");
      variant.textContent = item.variantName.charAt(0).toUpperCase() + item.variantName.slice(1) + " " + item.size + " · Cant. " + item.qty;
      copy.append(category, title, variant);

      const lineTotal = document.createElement("strong");
      lineTotal.textContent = money(item.price * item.qty);
      row.append(image, copy, lineTotal);
      itemsElement.append(row);
    });
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    status.replaceChildren();
    const selectedPayment = form.querySelector('input[name="paymentMethod"]:checked');
    const paymentLabel = selectedPayment ? selectedPayment.dataset.paymentLabel : "";
    status.append(document.createTextNode("Método seleccionado: " + paymentLabel + ". Aún no se envió ningún pedido. Esta página no procesa pedidos ni comparte tus datos. Para confirmar disponibilidad, envío y pago, contacta a Dirtytask."));
    const contact = document.createElement("a");
    contact.href = "https://www.instagram.com/dirtytask/?hl=es";
    contact.target = "_blank";
    contact.rel = "noopener noreferrer";
    contact.textContent = "Abrir Instagram de Dirtytask";
    status.append(contact);
    status.hidden = false;
    status.focus();
  });
})();
