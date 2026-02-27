#!/usr/bin/env node
/**
 * Capture annotated screenshots of key app pages for the Guides page.
 *
 * Usage: Start the server first (npm start), then run:
 *   node scripts/capture-screenshots.js
 *
 * Requires: puppeteer-core (dev dependency) + Google Chrome installed
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'images', 'guides');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const VIEWPORT = { width: 1200, height: 800 };

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    await capturePublicPages(browser);
    await captureEmployeePages(browser);
    await captureAdminPages(browser);
    console.log('\nAll screenshots saved to', OUTPUT_DIR);
  } finally {
    await browser.close();
  }
}

// ─── Annotation helpers ─────────────────────────────────────────────

async function addAnnotations(page, annotations) {
  // Scroll to top so getBoundingClientRect values are page-absolute
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 200));

  await page.evaluate((items) => {
    // Remove previous badges and container
    const old = document.getElementById('annotation-layer');
    if (old) old.remove();

    // Create a fixed overlay container that covers the full document
    const layer = document.createElement('div');
    layer.id = 'annotation-layer';
    layer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';

    for (const { number, selector, offsetX = -14, offsetY = -14 } of items) {
      const target = document.querySelector(selector);
      if (!target) {
        console.warn('Annotation target not found:', selector);
        continue;
      }
      const rect = target.getBoundingClientRect();
      const scrollY = window.pageYOffset || document.documentElement.scrollTop;
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft;

      const badge = document.createElement('div');
      badge.style.cssText = [
        'position:absolute',
        'width:28px',
        'height:28px',
        'border-radius:50%',
        'background:#e53e3e',
        'color:#fff',
        'font-family:Inter,system-ui,sans-serif',
        'font-size:14px',
        'font-weight:700',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'box-shadow:0 2px 6px rgba(0,0,0,0.4)',
        'line-height:1',
        `top:${rect.top + scrollY + offsetY}px`,
        `left:${rect.left + scrollX + offsetX}px`,
      ].join(';');
      badge.textContent = String(number);
      layer.appendChild(badge);
    }

    // Insert as first child of <html> to avoid body CSS interference
    document.documentElement.appendChild(layer);
  }, annotations);
}

async function clearAnnotations(page) {
  await page.evaluate(() => {
    const layer = document.getElementById('annotation-layer');
    if (layer) layer.remove();
  });
}

// ─── Screenshot helper ──────────────────────────────────────────────

async function screenshot(page, filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  await page.waitForSelector('.main-content, .login-page', { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: filepath, fullPage: true });
  const stats = fs.statSync(filepath);
  console.log(`  -> ${filename} (${Math.round(stats.size / 1024)}KB)`);
}

async function getCsrfToken(page) {
  return page.evaluate(() => {
    const input = document.querySelector('input[name="csrf_token"]');
    return input ? input.value : null;
  });
}

// ─── Public pages ───────────────────────────────────────────────────

async function capturePublicPages(browser) {
  console.log('Capturing public pages...');
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
  await screenshot(page, 'landing-page.png');
  await page.close();
}

// ─── Employee pages ─────────────────────────────────────────────────

async function captureEmployeePages(browser) {
  console.log('Capturing employee pages...');
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // Log in
  await page.goto(`${BASE_URL}/employee-dummy-login`, { waitUntil: 'networkidle0' });
  const csrfToken = await getCsrfToken(page);
  await page.evaluate((token) => {
    const form = document.querySelector('form');
    form.querySelector('input[name="email"]').value = 'demo.employee@company.com';
    form.querySelector('input[name="csrf_token"]').value = token;
  }, csrfToken);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]')
  ]);

  if (page.url().includes('brokerage-accounts')) {
    console.log('  Setting up brokerage accounts...');
    await setupBrokerageAccounts(page);
  }

  // ── Brokerage Accounts (annotations: 1=nav, 2=firm name, 3=account number) ──
  await page.goto(`${BASE_URL}/employee-brokerage-accounts`, { waitUntil: 'networkidle0' });
  await addAnnotations(page, [
    { number: 1, selector: '.nav-link[href="/employee-brokerage-accounts"]', offsetX: -14, offsetY: -8 },
    { number: 2, selector: 'input[name="firm_name"]', offsetX: -14, offsetY: -14 },
    { number: 3, selector: 'input[name="account_number"]', offsetX: -14, offsetY: -14 },
  ]);
  await screenshot(page, 'brokerage-accounts.png');
  await clearAnnotations(page);

  // ── Employee Dashboard (annotations: 1=ticker, 2=shares, 3=trade type, 4=submit) ──
  await page.goto(`${BASE_URL}/employee-dashboard`, { waitUntil: 'networkidle0' });
  if (page.url().includes('brokerage-accounts')) {
    await setupBrokerageAccounts(page);
    await page.goto(`${BASE_URL}/employee-dashboard`, { waitUntil: 'networkidle0' });
  }
  await addAnnotations(page, [
    { number: 1, selector: 'input[name="ticker"]', offsetX: -14, offsetY: -14 },
    { number: 2, selector: 'input[name="shares"]', offsetX: -14, offsetY: -14 },
    { number: 3, selector: '.radio-option', offsetX: -14, offsetY: -8 },
    { number: 4, selector: 'button[type="submit"]', offsetX: -14, offsetY: -8 },
  ]);
  await screenshot(page, 'employee-dashboard.png');
  await clearAnnotations(page);

  // ── Submit a trade for preview + result ──
  const dashCsrf = await getCsrfToken(page);
  if (dashCsrf) {
    await page.evaluate(() => {
      const radios = document.querySelectorAll('input[name="trade_type"]');
      radios.forEach(r => { if (r.value === 'buy') r.checked = true; });
    });
    await page.type('input[name="ticker"]', 'AAPL', { delay: 50 });
    await page.evaluate(() => {
      const s = document.querySelector('input[name="shares"]');
      if (s) s.value = '';
    });
    await page.type('input[name="shares"]', '100', { delay: 50 });
    await page.evaluate(() => {
      const sel = document.querySelector('select[name="brokerage_account_id"]');
      if (sel && sel.options.length > 1) sel.selectedIndex = 1;
    });

    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
        page.click('button[type="submit"]')
      ]);

      if (page.url().includes('preview-trade') || page.url().includes('employee-dashboard')) {
        await screenshot(page, 'trade-preview.png');

        const checkbox = await page.$('input[type="checkbox"]');
        if (checkbox) await checkbox.click();

        const submitBtn = await page.$('button[type="submit"]');
        if (submitBtn) {
          try {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
              submitBtn.click()
            ]);

            if (page.url().includes('trade-result')) {
              // Annotations: 1=status banner, 2=trade details card, 3=action buttons
              await addAnnotations(page, [
                { number: 1, selector: '.alert-success, .alert-error, h2', offsetX: -14, offsetY: -8 },
                { number: 2, selector: '.card', offsetX: -14, offsetY: -14 },
                { number: 3, selector: 'a.btn', offsetX: -14, offsetY: -8 },
              ]);
              await screenshot(page, 'trade-result-approved.png');
              await clearAnnotations(page);
            }
          } catch (e) {
            console.log('  (Could not capture trade result — skipping)');
          }
        }
      }
    } catch (e) {
      console.log('  (Could not capture trade preview — skipping)');
    }
  }

  // ── History (annotations: 1=filters, 2=table, 3=export) ──
  await page.goto(`${BASE_URL}/employee-history`, { waitUntil: 'networkidle0' });
  if (!page.url().includes('brokerage-accounts')) {
    await addAnnotations(page, [
      { number: 1, selector: 'input[name="start_date"], input[type="date"]', offsetX: -14, offsetY: -14 },
      { number: 2, selector: '.modern-table, table', offsetX: -14, offsetY: -14 },
      { number: 3, selector: 'a[href*="export"]', offsetX: -14, offsetY: -8 },
    ]);
    await screenshot(page, 'employee-history.png');
    await clearAnnotations(page);
  }

  await page.close();
}

// ─── Brokerage setup ────────────────────────────────────────────────

async function setupBrokerageAccounts(page) {
  const addForm = await page.$('form[action="/employee-add-brokerage"]');
  if (!addForm) {
    await confirmAccountsIfNeeded(page);
    return;
  }
  await page.type('input[name="firm_name"]', 'Interactive Brokers', { delay: 30 });
  await page.type('input[name="account_number"]', 'U1234567', { delay: 30 });
  const addBtn = await addForm.$('button[type="submit"]');
  if (addBtn) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      addBtn.click()
    ]);
  }
  await confirmAccountsIfNeeded(page);
}

async function confirmAccountsIfNeeded(page) {
  const confirmForm = await page.$('form[action="/employee-confirm-accounts"]');
  if (confirmForm) {
    const confirmBtn = await confirmForm.$('button[type="submit"]');
    if (confirmBtn) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        confirmBtn.click()
      ]);
    }
  }
}

// ─── Admin pages ────────────────────────────────────────────────────

async function captureAdminPages(browser) {
  console.log('Capturing admin pages...');
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // Log in
  await page.goto(`${BASE_URL}/admin-login`, { waitUntil: 'networkidle0' });
  await page.type('input[name="username"]', process.env.ADMIN_USERNAME || 'admin', { delay: 30 });
  await page.type('input[name="password"]', process.env.ADMIN_PASSWORD || 'admin123', { delay: 30 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]')
  ]);

  // ── Admin Dashboard (1-4=metric cards, 5=quick actions) ──
  await page.goto(`${BASE_URL}/admin-dashboard`, { waitUntil: 'networkidle0' });
  await addAnnotations(page, [
    { number: 1, selector: '.card-metric:nth-child(1), .metrics-grid > :first-child', offsetX: -10, offsetY: -10 },
    { number: 2, selector: '.card-metric:nth-child(2), .metrics-grid > :nth-child(2)', offsetX: -10, offsetY: -10 },
    { number: 3, selector: '.card-metric:nth-child(3), .metrics-grid > :nth-child(3)', offsetX: -10, offsetY: -10 },
    { number: 4, selector: '.card-metric:nth-child(4), .metrics-grid > :nth-child(4)', offsetX: -10, offsetY: -10 },
    { number: 5, selector: '.action-list', offsetX: -14, offsetY: -14 },
  ]);
  await screenshot(page, 'admin-dashboard.png');
  await clearAnnotations(page);

  // ── Restricted Stocks (1=add input, 2=list table) ──
  await page.goto(`${BASE_URL}/admin-restricted-stocks`, { waitUntil: 'networkidle0' });
  await addAnnotations(page, [
    { number: 1, selector: 'input[name="ticker"], input[type="text"]', offsetX: -14, offsetY: -14 },
    { number: 2, selector: '.modern-table, table', offsetX: -14, offsetY: -14 },
  ]);
  await screenshot(page, 'admin-restricted-stocks.png');
  await clearAnnotations(page);

  // ── Trading Requests (1=filters, 2=table, 3=export) ──
  await page.goto(`${BASE_URL}/admin-requests`, { waitUntil: 'networkidle0' });
  await addAnnotations(page, [
    { number: 1, selector: 'input[name="employee_email"], input[type="text"]:first-of-type', offsetX: -14, offsetY: -14 },
    { number: 2, selector: '.modern-table, table', offsetX: -14, offsetY: -14 },
    { number: 3, selector: 'a[href*="export"], .btn-secondary', offsetX: -14, offsetY: -8 },
  ]);
  await screenshot(page, 'admin-requests.png');
  await clearAnnotations(page);

  // ── Statements (1=send btn, 2=scheduler btn, 3=period, 4=table) ──
  await page.goto(`${BASE_URL}/admin-statements`, { waitUntil: 'networkidle0' });
  await addAnnotations(page, [
    { number: 1, selector: '.btn-primary', offsetX: -14, offsetY: -8 },
    { number: 2, selector: '.btn-secondary, a.btn-secondary', offsetX: -14, offsetY: -8 },
    { number: 3, selector: 'select', offsetX: -14, offsetY: -14 },
    { number: 4, selector: '.modern-table, table', offsetX: -14, offsetY: -14 },
  ]);
  await screenshot(page, 'admin-statements.png');
  await clearAnnotations(page);

  await page.close();
}

main().catch(err => {
  console.error('Screenshot capture failed:', err.message);
  process.exit(1);
});
