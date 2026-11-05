const { chromium } = require('playwright');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({contentType:'text/javascript',body:require('./auth-fixture.cjs')});
    if (url.pathname === '/supabase-config.js') return route.fulfill({contentType:'text/javascript',body:'window.DIRTYTASK_SUPABASE={url:"https://example.supabase.co",publishableKey:"sb_publishable_test"};'});
    if (url.origin !== 'https://admin-test.example') return route.abort();
    const file = path.join(__dirname, '..', decodeURIComponent(url.pathname));
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg' };
    try { await route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] || 'application/octet-stream' }); }
    catch { await route.fulfill({ status: 404, body: '' }); }
  });
  try {
    await page.goto('https://admin-test.example/admin.html');
    await page.locator('#loginEmail').fill('demo@example.com');
    await page.locator('#loginPassword').fill('demo');
    await page.locator('.login-submit').click();
    await page.locator('#adminApp').waitFor({state:'visible'});
    await page.locator('[data-view="accounting"]').click();
    await page.locator('#cashRoot .cash-account-cards').waitFor();
    const tab = async name => { await page.locator(`[data-cash-tab="${name}"]`).click(); await page.locator('#cashRoot h1').waitFor(); };
    await tab('sales');
    await page.locator('[data-cash-action="sale"]').click();
    const form = page.locator('#cashForm');
    await form.locator('[name="reference"]').fill('TEST-SALE');
    await form.locator('[name="channel"]').selectOption('physical');
    await form.locator('[name="shippingMode"]').selectOption('included');
    await form.locator('[name="lineName"]').fill('Reserva de prueba');
    await form.locator('[name="price"]').fill('200');
    await form.locator('[type="submit"]').click();
    await page.locator('[data-cash-action="collect"]').click();
    await form.locator('[name="amount"]').fill('100');
    await form.locator('[name="receipt"]').setInputFiles(path.join(__dirname, '..', 'assets/graphic-tee.jpg'));
    await form.locator('[type="submit"]').click();
    await page.locator('[data-cash-action="collect"]').click();
    await form.locator('[name="accountId"]').selectOption({ label: 'Caja de tienda · GTQ' });
    await form.locator('[name="amount"]').fill('100');
    await form.locator('[type="submit"]').click();
    assert.match(await page.locator('#cashRoot').innerText(), /Pagada/);
    await page.locator('#cashRoot [data-cash-action="file"]').last().click();
    await page.locator('.cash-dialog .acc-receipt').waitFor();
    await page.locator('.cash-dialog [aria-label="Cerrar"]').click();
    await tab('courier');
    await page.locator('[data-cash-action="confirm"]').click();
    await form.locator('[name="service"]').fill('60');
    await form.locator('[name="received"]').fill('210');
    await form.locator('[type="submit"]').click();
    assert.equal(await page.locator('[data-cash-action="confirm"]').count(), 0);
    await tab('entries');
    await page.locator('[data-cash-action="expense"]').click();
    await form.locator('[name="amount"]').fill('50');
    await form.locator('[name="concept"]').fill('Campaña de prueba');
    await form.locator('[type="submit"]').click();
    assert.match(await page.locator('#cashRoot .paper-ledger').innerText(), /Campaña de prueba/);
    await tab('accounts');
    await page.locator('[data-cash-action="transfer"]').click();
    await form.locator('[name="toId"]').selectOption({ label: 'Caja de tienda · GTQ' });
    await form.locator('[name="amount"]').fill('20');
    await form.locator('[name="concept"]').fill('Cambio para caja');
    await form.locator('[type="submit"]').click();
    await page.locator('[data-cash-tab="debt"]').click();
    await page.locator('#accDetail [data-acc-action="movement"]').click();
    const debt = page.locator('#accForm');
    await debt.locator('[name="total"]').fill('100');
    assert.equal(await debt.locator('[name="principal"]').count(), 0);
    await debt.locator('[type="submit"]').click();
    assert.match(await page.locator('#accDetail').innerText(), /por actualizar/);
    await tab('accounts');
    assert.match(await page.locator('#cashRoot .paper-ledger').innerText(), /Cuota pagada/);
    const exportPromise = page.waitForEvent('download');
    await page.locator('[data-cash-action="export-json"]').click();
    const downloaded = await exportPromise;
    const exported = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
    assert.equal(exported.sales.length, 5);
    assert.equal(exported.receipts.filter(r => r.saleId === exported.sales.at(-1).id).length, 2);
    assert.equal(exported.settlements.filter(s => s.status === 'confirmed').length, 2);
    assert.ok(exported.entries.some(e => e.sourceType === 'obligation'));
    await page.locator('#cashExportEntity').selectOption('settlementAllocations');
    const csvPromise = page.waitForEvent('download');
    await page.locator('[data-cash-action="export-csv"]').click();
    const csvDownload = await csvPromise;
    const csvText = await readFile(await csvDownload.path(), 'utf8');
    assert.match(csvText, /"settlementId"/);
    assert.match(csvText, /"saleId"/);
    assert.match(csvText, /"net"/);

    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ['summary', 'accounts', 'sales', 'courier', 'entries']) {
        await tab(name);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} overflow ${width}`);
      }
    }
    await tab('accounts');
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'ditshop-cash-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 375, height: 820 });
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'ditshop-cash-mobile.png'), fullPage: true });
    await page.reload();
    await page.locator('#adminApp').waitFor({state:'visible'});
    await page.locator('[data-view="accounting"]').click();
    await tab('sales');
    assert.equal(await page.locator('[data-cash-action="sale-detail"]').count(), 4);
    assert.deepEqual(errors, []);
    console.log('PASS: cash sales, split receipts, attachment, grouped settlement, expense, transfer, debt account link, export, layouts and reset');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
