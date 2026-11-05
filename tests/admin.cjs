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
    const overflow = async label => {
      const sizes = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
      assert.ok(sizes[0] <= sizes[1] + 1, `${label}: horizontal overflow ${sizes}`);
    };
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await overflow(`login ${width}`);
    }
    assert.ok(await page.locator('#loginEmail').isEditable(), 'Email must be editable on a public host');
    assert.ok(await page.locator('#loginPassword').isEditable(), 'Password must be editable on a public host');
    await page.locator('#loginEmail').fill('demo@example.com');
    await page.locator('#loginPassword').fill('demo-test');
    await page.locator('.login-submit').click();
    await page.locator('#adminApp').waitFor({state:'visible'});
    assert.ok(await page.locator('#adminApp').isVisible(), 'Authenticated panel opens');
    await page.reload();
    await page.locator('#adminApp').waitFor({state:'visible'});
    assert.ok(await page.locator('#adminApp').isVisible(), 'Authenticated session survives reload');
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      for (const view of ['overview', 'products', 'drops', 'stats', 'orders', 'accounting', 'content', 'settings']) {
        await page.locator(`[data-view="${view}"]`).click();
        assert.ok(await page.locator(`#view-${view}`).isVisible(), `${view} opens its own section`);
        await overflow(`${view} ${width}`);
      }
    }
    await page.locator('[data-view="products"]').click();
    await page.locator('#addProductButton').click();
    assert.ok(await page.locator('#editorDialog').isVisible());
    assert.equal(await page.locator('.image-picker img').count(), 0, 'Image fields must not show thumbnails');
    for (const name of ['image', 'lookImage']) {
      await page.locator(`[data-image-picker="${name}"] input[type="file"]`).setInputFiles(path.join(__dirname, '..', 'assets/graphic-tee.jpg'));
      await page.waitForFunction(name => document.querySelector(`[data-image-picker="${name}"] input[type="hidden"]`)?.value.startsWith('data:image/webp;'), name);
    }
    await page.locator('#editorFields input[name="id"]').fill('upload-test');
    await page.locator('#editorFields input[name="name"]').fill('Upload test');
    await page.locator('#editorForm button[type="submit"]').click();
    assert.ok(await page.locator('#editorDialog').isHidden(), 'Uploaded product saves');
    await page.reload();
    await page.locator('#adminApp').waitFor({state:'visible'});
    const savedImage = await page.evaluate(() => JSON.parse(localStorage.getItem('dirtytask-admin-data')).products.find(p => p.id === 'upload-test').image);
    assert.ok(savedImage.startsWith('data:image/webp;'), 'Uploaded image persists');
    await page.locator('[data-view="products"]').click();
    await page.locator('[data-edit-product="upload-test"]').click();
    await page.locator('#editorFields input[name="name"]').fill('Upload edited');
    await page.locator('#editorForm button[type="submit"]').click();
    assert.ok(await page.locator('#editorDialog').isHidden(), 'Existing image permits editing without choosing another file');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dirtytask-admin-data')).products.find(p => p.id === 'upload-test').image), savedImage);
    await page.locator('[data-view="drops"]').click();
    await page.locator('#addDropButton').click();
    assert.equal(await page.locator('.image-picker img').count(), 0);
    await page.locator('[data-image-picker="image"] input[type="file"]').setInputFiles(path.join(__dirname, '..', 'assets/graphic-tee.jpg'));
    await page.waitForFunction(() => document.querySelector('[data-image-picker="image"] input[type="hidden"]')?.value.startsWith('data:image/webp;'));
    await page.locator('#editorFields input[name="name"]').fill('Upload launch');
    await page.locator('#editorForm button[type="submit"]').click();
    assert.ok(await page.locator('#editorDialog').isHidden(), 'Uploaded launch saves');
    await page.reload();
    await page.locator('#adminApp').waitFor({state:'visible'});
    await page.locator('[data-view="drops"]').click();
    assert.ok((await page.locator('.drop-admin-main img').first().getAttribute('src')).startsWith('data:image/webp;'), 'Launch image survives reload');
    await page.locator('[data-view="products"]').click();
    await page.locator('#addProductButton').click();
    await page.locator('#cancelEditor').click();
    await page.locator('#logoutButton').click();
    assert.ok(await page.locator('#loginScreen').isVisible(), 'Logout returns to login');
    await page.reload();
    await page.locator('#loginScreen').waitFor({state:'visible'});
    assert.ok(await page.locator('#loginScreen').isVisible(), 'Logout clears session');
    assert.deepEqual(errors, [], 'No JavaScript errors');
    console.log('PASS: authenticated session, responsive views, file-only uploads, product/launch persistence and editing without replacing images');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
