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
    assert.equal(await page.locator('#viewTitle').textContent(), 'Contabilidad');
    await page.locator('[data-cash-tab="accounts"]').click();
    await page.locator('[data-cash-action="account"]').click();
    await page.locator('#cashForm [name="name"]').fill('Test USD');
    await page.locator('#cashForm [name="bank"]').fill('Test bank');
    await page.locator('#cashForm [name="currency"]').selectOption('USD');
    await page.locator('#cashForm [name="openingBalance"]').fill('2000');
    await page.locator('#cashForm [type="submit"]').click();
    await page.locator('[data-cash-tab="debt"]').click();
    assert.equal(await page.locator('.acc-obligation').count(), 3);
    await page.locator('[data-acc-action="create"]').click();
    const form = page.locator('#accForm');
    await form.locator('[name="bank"]').fill('Banco de prueba');
    await form.locator('[name="reference"]').fill('TEST-USD');
    await form.locator('[name="name"]').fill('Equipo nuevo');
    await form.locator('[name="currency"]').selectOption('USD');
    await form.locator('[name="openingBalance"]').fill('1000');
    await form.locator('[name="installment"]').fill('100');
    await form.locator('[name="dueDay"]').fill('31');
    await form.locator('[type="submit"]').click();
    assert.equal(await page.locator('.acc-obligation').count(), 4);
    assert.match(await page.locator('.acc-kpis').textContent(), /1,000/);
    await page.locator('#accDetail [data-acc-action="movement"]').click();
    await form.locator('[name="total"]').fill('100');
    assert.equal(await form.locator('[name="principal"]').count(), 0, 'No breakdown required');
    await form.locator('[name="statementBalance"]').fill('920');
    await form.locator('[name="receipt"]').setInputFiles(path.join(__dirname, '..', 'assets/graphic-tee.jpg'));
    await form.locator('[name="notes"]').fill('<script>bad</script>');
    await form.locator('[type="submit"]').click();
    assert.ok(await page.locator('.acc-dialog:not(.cash-dialog)').isHidden());
    assert.match(await page.locator('#accDetail').textContent(), /920/);
    assert.match(await page.locator('#accDetail').textContent(), /Cuota cubierta/);
    assert.equal(await page.locator('#accDetail script').count(), 0);
    await page.locator('[data-acc-action="attachment"]').click();
    await page.locator('.acc-receipt').waitFor();
    assert.ok(await page.locator('.acc-receipt').evaluate(img => img.complete && img.naturalWidth > 0));
    await page.locator('.acc-dialog:not(.cash-dialog) [aria-label="Cerrar"]').click();
    await page.locator('#accDetail [data-acc-action="movement"]').click();
    await form.locator('[name="type"]').selectOption('principal');
    assert.ok(await form.locator('[name="statementBalance"]').isHidden());
    await form.locator('[name="total"]').fill('921');
    await form.locator('[type="submit"]').click();
    assert.match(await page.locator('#accFormError').textContent(), /supera/);
    await form.locator('[name="total"]').fill('50');
    await form.locator('[type="submit"]').click();
    assert.match(await page.locator('#accDetail').textContent(), /870/);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-acc-action="json"]').click();
    const downloaded = await downloadPromise;
    const exported = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
    assert.equal(exported.obligations.length, 4);
    assert.equal(exported.movements.length, 5);
    assert.equal(exported.moneyUnit, 'minor');
    assert.equal(exported.movements.at(-2).statementBalance, 92000);
    assert.ok(exported.movements.at(-2).attachment.id);
    const csvPromise = page.waitForEvent('download');
    await page.locator('[data-acc-action="movements-csv"]').click();
    const csvFile = await csvPromise;
    const csvContent = await readFile(await csvFile.path(), 'utf8');
    assert.match(csvContent, /"statementBalance"/);
    assert.match(csvContent, /"principalKnown"/);
    assert.match(csvContent, /"sourceAccountId"/);
    assert.match(csvContent, /"sequence"/);

    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow at ${width}`);
      await page.locator('#accDetail [data-acc-action="movement"]').click();
      assert.ok(await page.locator('.acc-dialog:not(.cash-dialog)').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `modal overflow at ${width}`);
      await page.locator('.acc-dialog:not(.cash-dialog) [data-close]').click();
    }
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'ditshop-accounting-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 375, height: 820 });
    await page.screenshot({ path: path.join(require('node:os').tmpdir(), 'ditshop-accounting-mobile.png'), fullPage: true });
    await page.reload();
    await page.locator('#adminApp').waitFor({state:'visible'});
    await page.locator('[data-view="accounting"]').click();
    assert.equal(await page.locator('.acc-obligation').count(), 3, 'reload restores minimal fixtures');
    assert.deepEqual(errors, []);
    console.log('PASS: accounting navigation, creation, split payments, principal, receipt, export, responsive layouts and reset');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
