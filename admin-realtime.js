// Realtime invalidates modules; existing APIs remain the source of truth.
(() => {
  'use strict';
  const routes = {
    category: ['catalog'], product: ['catalog'], product_variant: ['catalog'],
    product_media: ['catalog'], launch: ['catalog', 'finance'], launch_product: ['catalog'],
    inventory_movement: ['catalog'], shop_order: ['orders', 'finance'],
    shop_order_line: ['orders'], order_status_event: ['orders'],
    customer: ['orders', 'finance'], department: ['orders'],
    money_account: ['finance'], cash_sale: ['finance'], cash_sale_line: ['finance'],
    cash_sale_adjustment: ['finance'], settlement: ['finance'], settlement_allocation: ['finance'],
    attachment: ['finance'], receipt: ['finance'], account_transfer: ['finance'],
    ledger_entry: ['finance'], obligation: ['finance'], obligation_movement: ['finance'],
    bank: ['finance'], operation_request: ['finance'], account_reconciliation: ['finance'],
    app_user: ['finance']
  };
  const roots = {
    catalog: '#view-products, #view-drops, #view-stats, #view-overview, #editorDialog',
    orders: '#view-orders', finance: '#view-accounting, .acc-dialog'
  };
  const adapters = new Map();
  let jobs = new Map(), generation = 0, channelSequence = 0, channel = null, retryTimer = null;
  let reconnectDelay = 1000, connection = 'closed', suspended = false;
  const active = () => !suspended && Boolean(window.adminIdentity);
  const available = () => active() && navigator.onLine !== false && !document.hidden;

  function showStatus() {
    const status = document.querySelector('#adminRealtimeStatus');
    if (!status) return;
    status.hidden = !active();
    const failed = [...jobs.values()].some(job => job.failed);
    const pending = [...jobs.values()].some(job => job.pending || job.running);
    status.dataset.state = failed || connection === 'error' ? 'error' : 'quiet';
    status.textContent = navigator.onLine === false ? 'Sin conexión. Los datos se actualizarán al reconectar.'
      : connection === 'error' ? 'Reconectando actualizaciones automáticas… Puedes usar los botones de actualizar.'
      : connection !== 'connected' ? 'Conectando actualizaciones automáticas…'
      : failed ? 'No se pudo actualizar una sección. Se reintentará automáticamente.'
      : pending ? 'Cambios pendientes de actualizar…'
      : 'Actualizaciones automáticas conectadas.';
  }
  function canApply(name) {
    if (!available()) return false;
    if (name === 'catalog' && document.querySelector('#editorDialog[open]')) return false;
    if (name === 'finance' && document.querySelector('.acc-dialog[open]')) return false;
    const focus = document.activeElement;
    return !(focus?.matches('input, textarea, select, [contenteditable="true"]') && focus.closest(roots[name]));
  }
  function jobFor(name) {
    if (!jobs.has(name)) jobs.set(name, {pending:false, running:false, timer:null, failed:false, delay:1000});
    return jobs.get(name);
  }
  function schedule(name, delay = 300) {
    if (!active() || !adapters.has(name)) return;
    const job = jobFor(name);
    if (job.timer !== null || job.running || !job.pending) return;
    const epoch = generation;
    job.timer = setTimeout(() => {
      job.timer = null;
      if (epoch === generation) void flush(name, job, epoch);
    }, delay);
  }
  function request(name) {
    if (!active() || !Object.hasOwn(roots, name)) return;
    jobFor(name).pending = true;
    schedule(name);
    showStatus();
  }
  function requestAll() { for (const name of adapters.keys()) request(name); }
  async function flush(name, job, epoch) {
    const adapter = adapters.get(name);
    if (!available()) return; // visibility/online events resume this pending job.
    if (!canApply(name) || adapter.blocked?.()) { schedule(name, 500); return; }
    job.pending = false;
    job.running = true;
    const context = {
      isCurrent: () => active() && generation === epoch,
      canApply: () => active() && generation === epoch && canApply(name)
    };
    let delay = 300;
    try {
      const applied = await adapter.refresh(context);
      if (!context.isCurrent()) return;
      if (applied === false) { job.pending = true; delay = 500; }
      job.failed = false;
      job.delay = 1000;
    } catch (_) {
      if (!context.isCurrent()) return;
      job.pending = true;
      job.failed = true;
      delay = job.delay;
      job.delay = Math.min(job.delay * 2, 30000);
    } finally {
      job.running = false;
      if (context.isCurrent()) { schedule(name, delay); showStatus(); }
    }
  }
  function removeChannel() {
    const old = channel;
    channel = null;
    if (old) {
      try { Promise.resolve(window.dirtytaskSupabase.removeChannel(old)).catch(() => {}); }
      catch (_) { /* A stale socket must not prevent local cleanup. */ }
    }
  }
  function reconnect(epoch) {
    if (retryTimer !== null || !active()) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (generation === epoch && available()) { removeChannel(); connect(); }
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  }
  function connect() {
    if (!active() || !window.dirtytaskSupabase || channel) return;
    const epoch = generation;
    connection = 'connecting';
    try {
      // removeChannel is asynchronous; a fresh topic cannot reuse its closing channel.
      const next = window.dirtytaskSupabase.channel(`admin-updates-${epoch}-${++channelSequence}`);
      channel = next;
      for (const [table, modules] of Object.entries(routes)) {
        next.on('postgres_changes', {event:'*', schema:'dtshop', table}, () => {
          if (epoch !== generation || channel !== next || !active()) return;
          modules.forEach(request);
        });
      }
      next.subscribe(state => {
        if (epoch !== generation || channel !== next || !active()) return;
        if (state === 'SUBSCRIBED') {
          connection = 'connected';
          reconnectDelay = 1000;
          clearTimeout(retryTimer); retryTimer = null;
          requestAll(); // Also covers changes between initial reads and subscribing.
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) {
          connection = 'error';
          reconnect(epoch);
        }
        showStatus();
      });
    } catch (_) { connection = 'error'; removeChannel(); reconnect(epoch); }
    showStatus();
  }
  function stop() {
    generation++;
    clearTimeout(retryTimer); retryTimer = null;
    for (const job of jobs.values()) clearTimeout(job.timer);
    jobs = new Map();
    removeChannel();
    connection = 'closed';
    showStatus();
  }
  function resume() {
    if (!available()) { showStatus(); return; }
    if (connection === 'error') { clearTimeout(retryTimer); retryTimer = null; removeChannel(); }
    connect();
    requestAll();
  }
  window.adminRealtime = Object.freeze({
    register(name, adapter) {
      if (!Object.hasOwn(roots, name)) throw new Error('Módulo Realtime desconocido.');
      adapters.set(name, adapter);
      if (active()) request(name);
    },
    request, canApply
  });
  document.addEventListener('dirtytask:auth', () => { stop(); if (active()) connect(); });
  document.addEventListener('visibilitychange', resume);
  document.addEventListener('focusout', () => { for (const name of jobs.keys()) schedule(name); });
  document.addEventListener('close', () => { for (const name of jobs.keys()) schedule(name); }, true);
  window.addEventListener('online', resume);
  window.addEventListener('offline', showStatus);
  window.addEventListener('pagehide', () => { suspended = true; stop(); });
  window.addEventListener('pageshow', () => { suspended = false; resume(); });
  if (active()) connect();
})();
