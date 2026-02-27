#!/usr/bin/env node
/**
 * Capture screenshots of key app pages for the Guides page.
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
    // ---- Landing page (no auth) ----
    await capturePublicPages(browser);

    // ---- Employee pages ----
    await captureEmployeePages(browser);

    // ---- Admin pages ----
    await captureAdminPages(browser);

    console.log('\nAll screenshots saved to', OUTPUT_DIR);
  } finally {
    await browser.close();
  }
}

// Helper: take a full-page screenshot clipped to main content
async function screenshot(page, filename) {
  const filepath = path.join(OUTPUT_DIR, filename);

  // Wait for content to settle
  await page.waitForSelector('.main-content, .login-page', { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 500));

  await page.screenshot({ path: filepath, fullPage: true });
  const stats = fs.statSync(filepath);
  console.log(`  -> ${filename} (${Math.round(stats.size / 1024)}KB)`);
}

// Helper: extract CSRF token from the current page
async function getCsrfToken(page) {
  return page.evaluate(() => {
    const input = document.querySelector('input[name="csrf_token"]');
    return input ? input.value : null;
  });
}

async function capturePublicPages(browser) {
  console.log('Capturing public pages...');
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
  await screenshot(page, 'landing-page.png');
  await page.close();
}

async function captureEmployeePages(browser) {
  console.log('Capturing employee pages...');
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // Step 1: Log in as demo employee
  await page.goto(`${BASE_URL}/employee-dummy-login`, { waitUntil: 'networkidle0' });
  const csrfToken = await getCsrfToken(page);

  await page.evaluate((token) => {
    const form = document.querySelector('form');
    const emailInput = form.querySelector('input[name="email"]');
    emailInput.value = 'demo.employee@company.com';
    const csrfInput = form.querySelector('input[name="csrf_token"]');
    csrfInput.value = token;
  }, csrfToken);

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]')
  ]);

  // After login, we may be redirected to brokerage setup
  const currentUrl = page.url();
  if (currentUrl.includes('brokerage-accounts')) {
    // Need to set up brokerage accounts first
    console.log('  Setting up brokerage accounts...');
    await setupBrokerageAccounts(page);
  }

  // Step 2: Capture brokerage accounts page
  await page.goto(`${BASE_URL}/employee-brokerage-accounts`, { waitUntil: 'networkidle0' });
  await screenshot(page, 'brokerage-accounts.png');

  // Step 3: Capture employee dashboard
  await page.goto(`${BASE_URL}/employee-dashboard`, { waitUntil: 'networkidle0' });
  // May redirect to brokerage setup again if confirmation expired
  if (page.url().includes('brokerage-accounts')) {
    await setupBrokerageAccounts(page);
    await page.goto(`${BASE_URL}/employee-dashboard`, { waitUntil: 'networkidle0' });
  }
  await screenshot(page, 'employee-dashboard.png');

  // Step 4: Submit a trading request (for preview + result screenshots)
  const dashCsrf = await getCsrfToken(page);
  if (dashCsrf) {
    // Fill in the trading form
    await page.select('select[name="trade_type"]', 'buy').catch(() => {});
    await page.evaluate(() => {
      const radioButtons = document.querySelectorAll('input[name="trade_type"]');
      radioButtons.forEach(r => { if (r.value === 'buy') r.checked = true; });
    });
    await page.type('input[name="ticker"]', 'AAPL', { delay: 50 });
    await page.evaluate(() => {
      const sharesInput = document.querySelector('input[name="shares"]');
      if (sharesInput) { sharesInput.value = ''; }
    });
    await page.type('input[name="shares"]', '100', { delay: 50 });

    // Select first brokerage account if available
    await page.evaluate(() => {
      const select = document.querySelector('select[name="brokerage_account_id"]');
      if (select && select.options.length > 1) {
        select.selectedIndex = 1;
      }
    });

    // Submit form -> preview page
    try {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
        page.click('button[type="submit"]')
      ]);

      if (page.url().includes('preview-trade') || page.url().includes('employee-dashboard')) {
        await screenshot(page, 'trade-preview.png');

        // Accept compliance declaration and submit
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
              await screenshot(page, 'trade-result-approved.png');
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

  // Step 5: Capture history page
  await page.goto(`${BASE_URL}/employee-history`, { waitUntil: 'networkidle0' });
  if (!page.url().includes('brokerage-accounts')) {
    await screenshot(page, 'employee-history.png');
  }

  await page.close();
}

async function setupBrokerageAccounts(page) {
  // Add a brokerage account — form fields are firm_name + account_number
  const addForm = await page.$('form[action="/employee-add-brokerage"]');
  if (!addForm) {
    // Accounts may already exist, just need confirmation
    await confirmAccountsIfNeeded(page);
    return;
  }

  await page.type('input[name="firm_name"]', 'Interactive Brokers', { delay: 30 });
  await page.type('input[name="account_number"]', 'U1234567', { delay: 30 });

  // Click the Add button inside the add-brokerage form
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
  // Look for the confirm-accounts form
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

async function captureAdminPages(browser) {
  console.log('Capturing admin pages...');
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // Step 1: Log in as admin
  await page.goto(`${BASE_URL}/admin-login`, { waitUntil: 'networkidle0' });

  await page.type('input[name="username"]', process.env.ADMIN_USERNAME || 'admin', { delay: 30 });
  await page.type('input[name="password"]', process.env.ADMIN_PASSWORD || 'admin123', { delay: 30 });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('button[type="submit"]')
  ]);

  // Step 2: Capture admin pages
  const adminPages = [
    { url: '/admin-dashboard', file: 'admin-dashboard.png' },
    { url: '/admin-restricted-stocks', file: 'admin-restricted-stocks.png' },
    { url: '/admin-requests', file: 'admin-requests.png' },
    { url: '/admin-statements', file: 'admin-statements.png' }
  ];

  for (const { url, file } of adminPages) {
    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle0' });
    await screenshot(page, file);
  }

  await page.close();
}

main().catch(err => {
  console.error('Screenshot capture failed:', err.message);
  process.exit(1);
});
