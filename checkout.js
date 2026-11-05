(async () => {
  const $ = selector => document.querySelector(selector);
  const form = $('#billingForm');
  const status = $('#checkoutStatus');
  const loadStatus = $('#checkoutLoadStatus');
  const button = $('.place-order-button');
  let ready = false;
  let data;
  let subtotalCents = 0;
  let orderLines = [];
  let sending = false;
  let completed = false;
  let loading = false;
  const ATTEMPT_KEY = 'dirtytask-checkout-attempt';
  const RECEIPT_KEY = 'dirtytask-checkout-receipt';
  // Configura el numero receptor con codigo de pais, solo digitos (ej.: 502XXXXXXXX).
  const WHATSAPP_PHONE = '50231321854';
  const money = cents => new Intl.NumberFormat('es-GT', {style:'currency',currency:data.settings.currency,maximumFractionDigits:2}).format(cents/100);
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  // Install before requesting data: the form must never submit personal details through GET.
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!ready || sending || completed || !form.reportValidity()) return;
    const payment = form.querySelector('input[name="paymentMethod"]:checked');
    if (!payment || !data.payments.some(method => method.code === payment.value && method.enabled)) return;
    const department = data.departments.find(row=>row.name===$('#department').value);
    if (!department) return;
    const payload = {
      first_name:$('#firstName').value.trim(),last_name:$('#lastName').value.trim(),street:$('#streetAddress').value.trim(),
      neighborhood:$('#neighborhood').value.trim(),municipality:$('#municipality').value.trim(),department:department.name,
      phone:$('#phone').value.trim(),nit:$('#nit').value.trim(),payment_method:payment.value,
      installments:payment.value==='visa_installments'?Number($('#installmentCount').value):null,
      lines:orderLines.map(item=>({product_id:item.id,variant_id:item.variant.id,qty:item.qty})),
      expected_total_cents:subtotalCents+(department.is_metro?data.settings.shippingGuatemalaCents:data.settings.shippingOtherCents),
      expected_currency:data.settings.currency
    };
    sending=true;button.disabled=true;
    $('#retryCheckout').disabled=true;
    const controls=Array.from(form.querySelectorAll('input,select,button')).filter(control=>!control.disabled);
    controls.forEach(control=>{control.disabled=true});
    status.textContent='Enviando pedido…';status.hidden=false;
    try {
      await window.checkoutApi.prepare();
      let requestId=sessionStorage.getItem(ATTEMPT_KEY);
      if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem(ATTEMPT_KEY,requestId);}
      let receipt;
      try {receipt=await window.checkoutApi.submit(requestId,payload);}
      catch(error){
        // An interrupted response may have committed. Reuse the same request on every retry.
        try {receipt=await window.checkoutApi.receipt(requestId);} catch {throw error;}
      }
      showConfirmation(receipt,requestId,payload,true);
    } catch(error) {
      status.textContent='No se pudo confirmar el envío. '+(error.message||'Reintenta con el mismo pedido.');status.focus();
      status.after($('#retryCheckout'));
      $('#retryCheckout').hidden=false;$('#retryCheckout').textContent='Revisar disponibilidad';
    } finally {
      sending=false;
      $('#retryCheckout').disabled=false;
      if(!completed){controls.forEach(control=>{control.disabled=false});button.disabled=false;}
    }
  });
  $('#retryCheckout').addEventListener('click', () => loadCheckout());
  async function loadCheckout(){
  if(sending||completed||loading)return;
  loading=true;ready=false;
  $('#retryCheckout').textContent='Revisando…';
  const selectedDepartment=$('#department').value;
  const selectedPayment=form.querySelector('[name="paymentMethod"]:checked')?.value;
  const selectedInstallments=$('#installmentCount')?.value;
  button.disabled = true;
  $('#retryCheckout').disabled=true;
  loadStatus.dataset.state='quiet';loadStatus.textContent='Revisando precios y disponibilidad…';
  $('#department').disabled = true;
  try {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem('dirtytask-checkout-order') || '[]'); }
    catch { throw new Error('No se pudo leer tu bolsa. Vuelve al catálogo para revisarla.'); }
    const pending=sessionStorage.getItem(ATTEMPT_KEY);
    const last=sessionStorage.getItem(RECEIPT_KEY);
    if(pending || ((!Array.isArray(saved)||!saved.length)&&last)) {
      try {showConfirmation(await window.checkoutApi.receipt(pending||last),pending||last);return;}
      catch(error){if(error.code!=='P0002')throw new Error('No pudimos consultar la confirmación anterior. Reintenta desde este navegador antes de enviar otro pedido.');}
    }
    if (!Array.isArray(saved) || !saved.length) {
      $('#checkoutEmpty').hidden = false; $('#checkoutLayout').hidden=true; $('#retryCheckout').hidden=true; loadStatus.textContent = ''; return;
    }
    if (saved.length > 30) throw new Error('Tu bolsa tiene demasiadas líneas. Revísala antes de continuar.');
    data = await window.storefrontApi.readCheckout();
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
    orderLines=order;
    subtotalCents = order.reduce((sum,item) => sum+item.priceCents*item.qty,0);
    if (!Number.isSafeInteger(subtotalCents)) throw new Error('No se pudo calcular el total. Revisa la bolsa.');
    if (!data.payments.length || !data.departments.length) throw new Error('Las opciones de entrega o pago no están disponibles. Reintenta más tarde.');
    $('#orderCount').textContent = order.reduce((sum,item)=>sum+item.qty,0) + ' PIEZAS';
    $('#orderSubtotal').textContent = money(subtotalCents);
    $('.checkout-secure-note').textContent = 'PEDIDO EN GUATEMALA · ' + data.settings.currency;
    $('#checkoutItems').replaceChildren();
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
    if(data.departments.some(department=>department.name===selectedDepartment))departmentSelect.value=selectedDepartment;
    departmentSelect.disabled = false;
    const paymentList = $('.payment-method-list');
    paymentList.replaceChildren();$('#installmentField')?.remove();
    for (const [index,storedMethod] of data.payments.entries()) {
      const method={...storedMethod,label:({cash:'Efectivo',visa_installments:'Visa cuotas',visalink:'Tarjeta de crédito'})[storedMethod.code]||storedMethod.label};
      const label=node('label',undefined,'payment-method-option');
      const radio=node('input');radio.type='radio';radio.name='paymentMethod';radio.value=method.code;radio.required=true;radio.dataset.paymentLabel=method.label;
      radio.checked=selectedPayment===method.code;
      const copy=node('span',undefined,'payment-method-copy');copy.append(node('strong',method.label));
      if(method.detail)copy.append(node('small',method.detail));
      label.append(radio,copy,node('span',String(index+1).padStart(2,'0'),'payment-method-index'));paymentList.append(label);
    }
    const preserveInstallments=selectedPayment==='visa_installments'&&data.payments.some(method=>method.code==='visa_installments');
    const installmentLabel=node('label','Número de cuotas');installmentLabel.id='installmentField';installmentLabel.hidden=!preserveInstallments;
    const installmentSelect=node('select');installmentSelect.id='installmentCount';installmentSelect.disabled=true;
    for(const count of [3,6,9,12])installmentSelect.add(new Option(String(count),String(count)));
    if(selectedInstallments)installmentSelect.value=selectedInstallments;
    installmentSelect.disabled=!preserveInstallments;
    installmentLabel.append(installmentSelect);paymentList.after(installmentLabel);
    form.onchange=()=>{
      const enabled=form.querySelector('input[name="paymentMethod"]:checked')?.value==='visa_installments';
      installmentLabel.hidden=!enabled;installmentSelect.disabled=!enabled;
    };
    function updateShipping() {
      const department=data.departments.find(row=>row.name===departmentSelect.value);
      if(!department){$('#orderShipping').textContent='Pendiente';$('#orderTotal').textContent='—';$('#shippingNote').textContent='Elige tu departamento para calcular el envío.';button.disabled=true;return;}
      const shipping=department.is_metro?data.settings.shippingGuatemalaCents:data.settings.shippingOtherCents;
      if(!Number.isSafeInteger(subtotalCents+shipping)){button.disabled=true;return;}
      $('#orderShipping').textContent=money(shipping);$('#orderTotal').textContent=money(subtotalCents+shipping);
      $('#shippingNote').textContent='Envío a '+department.name+': '+money(shipping)+'.';button.disabled=false;
    }
    departmentSelect.onchange=updateShipping;
    ready=true;updateShipping();$('#checkoutLayout').hidden=false;
    loadStatus.textContent='Precios y envío consultados. Al enviar se registrará el pedido pendiente de confirmación.';
    $('#retryCheckout').hidden=true;status.hidden=true;status.textContent='';
  } catch(error) {
    ready=false;button.disabled=true;$('#checkoutLayout').hidden=true;
    loadStatus.textContent=error.message || 'No se pudo cargar el resumen. Reintenta.';
    loadStatus.dataset.state='error';
    loadStatus.after($('#retryCheckout'));
    $('#retryCheckout').hidden=false;
    const back=node('a','Volver al catálogo y revisar la bolsa');back.href='index.html#coleccion';loadStatus.append(' ',back);
  }finally{loading=false;$('#retryCheckout').disabled=false;$('#retryCheckout').textContent='Revisar disponibilidad';}
  }
  await loadCheckout();
  function whatsappOrderUrl(receipt, submitted) {
    const phone = WHATSAPP_PHONE.replace(/\D/g, '');
    if (!/^\d{10,15}$/.test(phone)) return null;
    const format = cents => new Intl.NumberFormat('es-GT', {style:'currency',currency:receipt.currency || 'GTQ'}).format(Number(cents)/100);
    const name = receipt.customer_name || [submitted?.first_name, submitted?.last_name].filter(Boolean).join(' ') || 'No especificado';
    const labels = {cash:'Efectivo contra entrega',visa_installments:'Visa cuotas',visalink:'Tarjeta de credito (Visalink)'};
    const payment = receipt.payment_method_code || submitted?.payment_method;
    const installments = receipt.installment_count || submitted?.installments;
    const lines = receipt.lines.map((line, index) => {
      const unit = Number(line.unit_price_cents);
      const price = Number.isFinite(unit) ? `\n*Precio unitario:* ${format(unit)}\n*Importe:* ${format(unit*line.qty)}` : '';
      return `${index+1}. ${line.qty}x *${line.product_name || 'Producto'}*\n*Talla:* ${line.variant_label || 'No especificada'}${line.preorder ? ' (Reserva)' : ''}${price}`;
    }).join('\n\n');
    const fields = [
      '*NUEVO PEDIDO - DIRTYTASK*',
      `*Pedido:* #${receipt.id.replace(/-/g,'').slice(-12)}`,
      '', '*PRODUCTOS*', lines,
      '', `*Subtotal:* ${format(receipt.subtotal_cents)}`,
      `*Envio:* ${format(receipt.shipping_cents)}`,
      '', '*DATOS DEL CLIENTE*',
      `*Nombre:* ${name}`,
      `*Telefono:* ${receipt.phone || submitted?.phone || 'No especificado'}`,
      `*Direccion:* ${receipt.street_address || submitted?.street || 'No especificada'}`,
      `*Colonia:* ${receipt.neighborhood || submitted?.neighborhood || 'No especificada'}`,
      `*Municipio:* ${receipt.municipality || submitted?.municipality || 'No especificado'}`,
      `*Departamento:* ${receipt.department || submitted?.department || 'No especificado'}`,
      `*NIT:* ${receipt.nit || submitted?.nit || 'CF'}`,
      `*Metodo de pago:* ${labels[payment] || payment || 'No especificado'}${installments ? ` (${installments} cuotas)` : ''}`,
      '', `*TOTAL: ${format(receipt.total_cents)}*`,
      '', 'Hola, deseo confirmar este pedido. Gracias.'
    ];
    return `https://api.whatsapp.com/send/?phone=${phone}&text=${encodeURIComponent(fields.join('\n'))}&type=phone_number&app_absent=0`;
  }

  function showConfirmation(receipt,requestId,submitted,redirectToWhatsapp=false) {
    if(!receipt?.id || !Array.isArray(receipt.lines))throw new Error('La tienda no devolvió una confirmación válida. Reintenta para consultar tu pedido.');
    completed=true;ready=false;button.disabled=true;
    const box=$('#orderConfirmation');
    const format=cents=>new Intl.NumberFormat('es-GT',{style:'currency',currency:receipt.currency}).format(Number(cents)/100);
    const method=receipt.payment_method_code||submitted?.payment_method;
    const installments=receipt.installment_count||submitted?.installments;
    const paymentLabels={cash:'Efectivo · Pago contra entrega',visa_installments:'Visa cuotas'+(installments?' · '+installments+' cuotas':''),visalink:'Tarjeta de crédito · Visalink'};
    const states={pending:'Por confirmar',confirmed:'Confirmado',preparing:'En preparación',shipped:'Enviado',delivered:'Entregado',cancelled:'Cancelado'};
    box.replaceChildren();
    const heading=node('header',undefined,'receipt-heading');
    const logo=node('img');logo.src='assets/dirtytask-gold-logo.png';logo.alt='Dirtytask';logo.width=260;logo.height=100;
    const headingCopy=node('div');headingCopy.append(node('p','COMPROBANTE DE PEDIDO','receipt-kicker'),node('h1',receipt.status==='cancelled'?'Pedido cancelado.':'Pedido recibido.'));
    heading.append(logo,headingCopy);box.append(heading);
    const meta=node('div',undefined,'receipt-meta');
    const reference=node('div');reference.append(node('span','N.º de pedido'),node('strong',receipt.id.replace(/-/g,'').slice(-12),'receipt-reference'));
    const issued=node('div');issued.append(node('span','Fecha'),node('strong',receipt.placed_at?new Intl.DateTimeFormat('es-GT',{dateStyle:'long',timeStyle:'short',timeZone:'America/Guatemala'}).format(new Date(receipt.placed_at)):'—'));
    const state=node('div');state.append(node('span','Estado del pedido'),node('strong',states[receipt.status]||receipt.status,'receipt-state'));
    meta.append(reference,issued,state);box.append(meta);
    const customerName=receipt.customer_name||(submitted?[submitted.first_name,submitted.last_name].join(' '):'');
    const details=node('div',undefined,'receipt-details');
    if(customerName){const customer=node('section');customer.append(node('h2','Cliente'),node('p',customerName),node('p','NIT: '+(receipt.nit||submitted?.nit||'Consumidor final')));details.append(customer);}
    const address=[receipt.street_address||submitted?.street,receipt.neighborhood||submitted?.neighborhood,receipt.municipality||submitted?.municipality,receipt.department||submitted?.department].filter(Boolean).join(', ');
    if(address){const delivery=node('section');delivery.append(node('h2','Entrega'),node('p',address));if(receipt.phone||submitted?.phone)delivery.append(node('p','Tel. '+(receipt.phone||submitted.phone)));details.append(delivery);}
    box.append(details);
    const table=node('table',undefined,'receipt-table');table.append(node('caption','Detalle del pedido'));
    const thead=node('thead'),headerRow=node('tr');
    for(const label of ['Producto','Cant.','Precio unit.','Importe']){const th=node('th',label);th.scope='col';headerRow.append(th);}thead.append(headerRow);table.append(thead);
    const tbody=node('tbody');
    for(const line of receipt.lines){
      const current=submitted?orderLines.find(item=>item.id===line.product_id&&item.variant.label===line.variant_label):null;
      const price=line.unit_price_cents??current?.priceCents;
      const row=node('tr'),product=node('td');product.append(node('strong',line.product_name||current?.name||'Producto del pedido'),node('span',line.variant_label+(line.preorder?' · Reserva':'')));
      row.append(product,node('td',line.qty),node('td',price!=null?format(price):'—'),node('td',price!=null?format(price*line.qty):'—'));tbody.append(row);
    }
    table.append(tbody);const tableWrap=node('div',undefined,'receipt-table-wrap');tableWrap.append(table);box.append(tableWrap);
    const bottom=node('div',undefined,'receipt-bottom'),payment=node('section',undefined,'receipt-payment');payment.append(node('h2','Método de pago'),node('p',paymentLabels[method]||'Método registrado en el pedido'));
    const totals=node('dl',undefined,'receipt-totals');
    for(const [label,value] of [['Subtotal',receipt.subtotal_cents],['Envío',receipt.shipping_cents],['Total del pedido',receipt.total_cents]]){const row=node('div');row.append(node('dt',label),node('dd',format(value)));totals.append(row);}bottom.append(payment,totals);box.append(bottom);
    const next=node('section',undefined,'receipt-next');
    const message=receipt.status==='cancelled'?['PEDIDO / CANCELADO','Pedido cancelado.','Este pedido está cancelado. Consulta con la tienda si necesitas ayuda.']:receipt.status==='delivered'?['PEDIDO / ENTREGADO','Gracias por tu compra.','Conserva este comprobante como referencia de tu pedido.']:method==='cash'?['EFECTIVO / CONTRA ENTREGA','Paga al recibir.','Tu pedido ya está registrado. Al recibir tus productos deberás cancelar el total de '+format(receipt.total_cents)+'. Te contactaremos para coordinar la entrega.']:method==='visa_installments'?['VISA / '+(installments?installments+' CUOTAS':'CUOTAS'),'Te enviaremos el enlace.','En breve te contactaremos para completar tu pago con Visa cuotas'+(installments?' en '+installments+' cuotas':'')+'. Mantente pendiente de tu teléfono; te acompañaremos hasta confirmar el pago y coordinar la entrega.']:method==='visalink'?['TARJETA DE CRÉDITO / VISALINK','Te enviaremos el enlace.','En breve te contactaremos para completar el pago con tu tarjeta de crédito. Mantente pendiente de tu teléfono; te acompañaremos hasta confirmar el pago y coordinar la entrega.']:['PEDIDO / SEGUIMIENTO','Te contactaremos.','Tu pedido ya está registrado. En breve nos comunicaremos contigo para coordinar el pago y la entrega.'];
    const nextLabel=node('p',message[0],'receipt-next-label');
    const nextCopy=node('div',undefined,'receipt-next-copy');nextCopy.append(node('h2',message[1]),node('p',message[2]));
    next.append(nextLabel,nextCopy);box.append(next);
    const foot=node('footer',undefined,'receipt-footer');
    const actions=node('div',undefined,'receipt-actions');const print=node('button','Imprimir comprobante','receipt-print');print.type='button';print.addEventListener('click',()=>window.print());const shop=node('a','Volver a la tienda','receipt-shop');shop.href='index.html#coleccion';const arrow=node('span','↗');arrow.setAttribute('aria-hidden','true');shop.append(arrow);const whatsappUrl=receipt.status!=='cancelled' ? whatsappOrderUrl(receipt,submitted) : null;
    if (whatsappUrl) {
      const whatsapp=node('a','Enviar pedido por WhatsApp','receipt-whatsapp');
      whatsapp.href=whatsappUrl;
      whatsapp.rel='noopener noreferrer';
      whatsapp.setAttribute('aria-label','Abrir WhatsApp con el detalle del pedido');
      actions.append(whatsapp);
    } else if (receipt.status!=='cancelled') {
      const hint=node('p','Para activar WhatsApp, configura WHATSAPP_PHONE en checkout.js.','receipt-whatsapp-hint');
      actions.append(hint);
    }
    actions.append(print,shop);foot.append(actions);box.append(foot);
    document.querySelectorAll('.checkout-progress > span').forEach((step,index)=>{step.classList.toggle('is-current',index===2);if(index===2)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});
    $('#checkoutLayout').hidden=true;$('#checkoutEmpty').hidden=true;loadStatus.textContent='';$('#retryCheckout').hidden=true;
    box.hidden=false;box.focus();form.reset();
    // Solo redirigir tras registrar un pedido nuevo, no al recuperar un comprobante anterior.
    if (redirectToWhatsapp && whatsappUrl) window.location.assign(whatsappUrl);
    try {
      // Subtract only purchased lines; preserve anything added in another tab.
      for(const [storage,key] of [[localStorage,'dirtytask-cart'],[sessionStorage,'dirtytask-checkout-order']]) {
        const applied=JSON.parse(storage.getItem('dirtytask-cleared-orders')||'[]');
        if(Array.isArray(applied)&&applied.includes(receipt.id))continue;
        const original=JSON.parse(storage.getItem(key)||'[]');if(!Array.isArray(original))continue;
        const remaining=receipt.lines.map(line=>({...line}));
        const updated=original.flatMap(item=>{
          if(!item||!Number.isInteger(item.qty))return [];
          const line=remaining.find(line=>line.product_id===item.id&&line.variant_label===item.size);
          const removed=Math.min(item.qty,line?.qty||0);if(line)line.qty-=removed;
          return item.qty>removed?[{...item,qty:item.qty-removed}]:[];
        });
        storage.setItem('dirtytask-cleared-orders',JSON.stringify([...(Array.isArray(applied)?applied:[]),receipt.id]));
        storage.setItem(key,JSON.stringify(updated));
      }
      sessionStorage.setItem(RECEIPT_KEY,requestId);sessionStorage.removeItem(ATTEMPT_KEY);
    } catch {
      box.append(node('p','El pedido quedó registrado, pero no se pudo actualizar la bolsa. Conserva el número de pedido antes de volver a comprar.'));
    }
  }
})();
