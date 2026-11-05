(async () => {
  const $ = selector => document.querySelector(selector);
  const form = $('#billingForm');
  const status = $('#checkoutStatus');
  const loadStatus = $('#checkoutLoadStatus');
  const button = $('.place-order-button');
  let ready = false;
  let data;
  let contactUrl = 'https://www.instagram.com/dirtytask/';
  let subtotalCents = 0;
  const money = cents => new Intl.NumberFormat('es-GT', {style:'currency',currency:data.settings.currency,maximumFractionDigits:2}).format(cents/100);
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  // Install before requesting data: the form must never submit personal details through GET.
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!ready || !form.reportValidity()) return;
    const payment = form.querySelector('input[name="paymentMethod"]:checked');
    if (!payment || !data.payments.some(method => method.code === payment.value && method.enabled)) return;
    status.replaceChildren(document.createTextNode('Método seleccionado: ' + payment.dataset.paymentLabel + '. Este resumen no registra pedidos ni procesa pagos. Confirma disponibilidad y entrega con Dirtytask. '));
    const contact = node('a','Abrir Instagram de Dirtytask');
    contact.href = contactUrl; contact.target = '_blank'; contact.rel = 'noopener noreferrer';
    status.append(contact); status.hidden = false; status.focus();
  });
  $('#retryCheckout').addEventListener('click', () => window.location.reload());
  button.disabled = true;
  $('#department').disabled = true;
  try {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem('dirtytask-checkout-order') || '[]'); }
    catch { throw new Error('No se pudo leer tu bolsa. Vuelve al catálogo para revisarla.'); }
    if (!Array.isArray(saved) || !saved.length) {
      $('#checkoutEmpty').hidden = false; loadStatus.textContent = ''; return;
    }
    if (saved.length > 30) throw new Error('Tu bolsa tiene demasiadas líneas. Revísala antes de continuar.');
    const results = await Promise.allSettled([window.storefrontApi.readCheckout(), window.storefrontApi.readContent()]);
    if (results[0].status !== 'fulfilled') throw new Error('No pudimos consultar los precios y el envío. Comprueba tu conexión y reintenta.');
    data = results[0].value;
    if (results[1].status === 'fulfilled' && results[1].value.instagramUrl) contactUrl = results[1].value.instagramUrl;
    const catalog = new Map(data.products.map(product => [product.id,product]));
    const used = new Map(); const lineKeys = new Set();
    const order = saved.map(item => {
      const product = catalog.get(item?.id);
      const variant = product?.variantRecords.find(variant => variant.label === item.size);
      const key = JSON.stringify([item?.id,item?.size]);
      if (!product || !variant || (item.variantId && item.variantId !== variant.id) || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99 || lineKeys.has(key)) {
        throw new Error('Una pieza o talla de tu bolsa ya no está disponible. Vuelve al catálogo y revisa la bolsa.');
      }
      lineKeys.add(key);
      const quantity = (used.get(product.id) || 0) + item.qty;
      if (quantity > 99 || (!product.preorder && quantity > product.stock)) throw new Error('Cambió la disponibilidad de una pieza. Vuelve al catálogo y ajusta la bolsa.');
      used.set(product.id,quantity);
      // Stored names, prices, images and category labels are never used to calculate the summary.
      return {...product, variant, qty:item.qty};
    });
    subtotalCents = order.reduce((sum,item) => sum+item.priceCents*item.qty,0);
    if (!Number.isSafeInteger(subtotalCents)) throw new Error('No se pudo calcular el total. Revisa la bolsa.');
    if (!data.payments.length || !data.departments.length) throw new Error('Las opciones de entrega o pago no están disponibles. Reintenta más tarde.');
    $('#orderCount').textContent = order.reduce((sum,item)=>sum+item.qty,0) + ' PIEZAS';
    $('#orderSubtotal').textContent = money(subtotalCents);
    $('.checkout-secure-note').textContent = 'PEDIDO EN GUATEMALA · ' + data.settings.currency;
    for (const item of order) {
      const row = node('li',undefined,'checkout-item');
      const image = node('img');image.src=item.image;image.alt='';image.loading='lazy';
      const copy = node('div',undefined,'checkout-item-copy');
      copy.append(node('small',(item.preorder?'RESERVA / ':'')+item.category),node('h3',item.name),
        node('span',item.variantName+' '+item.variant.label+' · Cant. '+item.qty));
      row.append(image,copy,node('strong',money(item.priceCents*item.qty)));
      $('#checkoutItems').append(row);
    }
    const departmentSelect = $('#department');
    departmentSelect.replaceChildren(new Option('Elige un departamento',''));
    for (const department of data.departments) departmentSelect.add(new Option(department.name,department.name));
    departmentSelect.disabled = false;
    const paymentList = $('.payment-method-list');
    for (const [index,method] of data.payments.entries()) {
      const label=node('label',undefined,'payment-method-option');
      const radio=node('input');radio.type='radio';radio.name='paymentMethod';radio.value=method.code;radio.required=true;radio.dataset.paymentLabel=method.label;
      const copy=node('span',undefined,'payment-method-copy');copy.append(node('strong',method.label));
      if(method.detail)copy.append(node('small',method.detail));
      label.append(radio,copy,node('span',String(index+1).padStart(2,'0'),'payment-method-index'));paymentList.append(label);
    }
    function updateShipping() {
      const department=data.departments.find(row=>row.name===departmentSelect.value);
      if(!department){$('#orderShipping').textContent='Pendiente';$('#orderTotal').textContent='—';$('#shippingNote').textContent='Elige tu departamento para calcular el envío.';button.disabled=true;return;}
      const shipping=department.is_metro?data.settings.shippingGuatemalaCents:data.settings.shippingOtherCents;
      if(!Number.isSafeInteger(subtotalCents+shipping)){button.disabled=true;return;}
      $('#orderShipping').textContent=money(shipping);$('#orderTotal').textContent=money(subtotalCents+shipping);
      $('#shippingNote').textContent='Envío a '+department.name+': '+money(shipping)+'.';button.disabled=false;
    }
    departmentSelect.addEventListener('change',updateShipping);
    ready=true;updateShipping();$('#checkoutLayout').hidden=false;
    loadStatus.textContent='Precios y envío consultados. La disponibilidad se confirma con Dirtytask.';
  } catch(error) {
    ready=false;button.disabled=true;$('#checkoutLayout').hidden=true;
    loadStatus.textContent=error.message || 'No se pudo cargar el resumen. Reintenta.';
    $('#retryCheckout').hidden=false;
    const back=node('a','Volver al catálogo y revisar la bolsa');back.href='index.html#coleccion';loadStatus.append(' ',back);
  }
})();
