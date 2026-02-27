#!/usr/bin/env node
/**
 * Migrate historical Pre-Trade Approvals from SharePoint List into our database.
 *
 * The SharePoint list was created by Microsoft Forms before this app existed.
 * This script:
 *   1. Fetches all records from the SharePoint list via Graph API
 *   2. Resolves company names to ticker symbols via Yahoo Finance search API
 *   3. Validates tickers via our existing Yahoo Finance v8/chart endpoint
 *   4. Inserts records into the trading_requests table
 *
 * Usage:
 *   node scripts/migrate-pretrade-approvals.js --dry-run   # Preview without inserting
 *   node scripts/migrate-pretrade-approvals.js              # Execute migration
 *   node scripts/migrate-pretrade-approvals.js --verbose    # Extra logging
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const GraphAPIService = require('../src/services/GraphAPIService');
const database = require('../src/models/database');

const SHAREPOINT_LIST_ID = '632800d9-24d6-4d0f-8f40-e4260e6ec762';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// ─── Manual mappings for names that won't auto-resolve ──────────────

const MANUAL_MAPPINGS = {
  // Test entries — skip
  'TEST': null,
  'Test': null,
  'Test 2': null,
  'Test3': null,

  // Private/unlisted companies — skip
  'Grand Venture': null,
  'Tecogent': 'TGEN',                       // Tecogen (typo in original)

  // Typos
  'Roblux': 'RBLX',                        // Roblox
  'sezzel': 'SEZL',                        // Sezzle
  'Repimune Group Inc': 'REPL',            // Replimune Group (typo)
  'REPLMUNE GRP INC': 'REPL',             // Replimune Group (abbrev)

  // Names that resolve to wrong exchange — force primary listing
  'Greenbrier Companies Inc': 'GBX',       // NYSE (not G90.MU)
  'Energy Fuels Inc': 'UUUU',             // NYSE (not VO51.DU)
  'MP Materials Corp': 'MP',               // NYSE (not 1MP.MI)
  'BWX Technologies Inc': 'BWXT',          // NYSE (not 4BW.MU)
  'Comfort Systems USA Inc': 'FIX',        // NYSE (not 9CF.MU)
  'Cloudflare Inc': 'NET',                 // NYSE (not 8CF.HA)
  'Celestica Inc': 'CLS',                  // NYSE (not CLS.NE)
  'GE Vernova Inc': 'GEV',                // NYSE (not Y5C.SG)
  'Abivax SA': 'ABVX',                    // NASDAQ (not 2X1.SG)
  'Cooper-Standard Holdings Inc': 'CPS',   // NYSE (not C31.SG)
  'Hims & Hers Health Inc': 'HIMS',        // NYSE (not HIMS.MX)
  'Astera Labs Inc': 'ALAB',              // NASDAQ (not ALAB.MX)
  'Zoomd Technologies Ltd': 'ZOMD.V',       // TSXV
  'Circle': 'CRCL',                         // Circle

  // Known name mismatches
  'Pinduoduo': 'PDD',                      // PDD Holdings
  'Dirextion Daily FTSE China Bull 3x Shares': 'YINN', // ETF (typo in "Direxion")
  'APPLOVING': 'APP',                      // AppLovin
  'AMPX': 'AMPX',                          // Amprius Technologies
  'BITMINE IMMERSION': 'BIMI',             // BitMine Immersion Technologies
  'BitMine Immersion Technologies, Inc': 'BIMI',
  'Bitmine Immersion Technologies Inc': 'BIMI',
  'TSSI, Inc': 'TSSI',
  'TSSI, INC': 'TSSI',

  // Non-US primary listings
  'Ping An': '2318.HK',                    // HKEX
  'China Taiping': '0966.HK',              // HKEX
  'Wuxi Apptec': '2359.HK',               // HKEX
  'PetroChina Co Ltd': '0857.HK',          // HKEX
  'HKT Trust and HKT Ltd': '6823.HK',     // HKEX
  'Scottish Mortgage': 'SMT.L',            // LSE
  'L\'Oreal': 'OR.PA',                     // Euronext Paris
  'LVMH': 'MC.PA',                         // Euronext Paris
  'PARROT': 'PARRO.PA',                    // Euronext Paris

  // US primary listings that resolve correctly but adding for safety
  'Elbit Systems Ltd': 'ESLT',             // NASDAQ
};

// ─── Yahoo Finance Search API ───────────────────────────────────────

async function searchYahooFinance(query) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&listsCount=0`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradingApproval/1.0)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return [];
    const data = await response.json();
    return data.quotes || [];
  } catch {
    return [];
  }
}

async function validateTicker(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradingApproval/1.0)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta || !meta.currency) return null;
    return {
      symbol: meta.symbol,
      longName: meta.longName || meta.shortName || ticker,
      currency: meta.currency,
      exchange: meta.exchangeName,
      price: meta.regularMarketPrice || meta.previousClose,
    };
  } catch {
    return null;
  }
}

// ─── Ticker resolution ──────────────────────────────────────────────

const resolvedCache = new Map();

async function resolveTickerFromName(companyName) {
  const trimmed = companyName.trim();

  // Check cache
  if (resolvedCache.has(trimmed)) return resolvedCache.get(trimmed);

  // Check manual mappings (case-sensitive first, then case-insensitive)
  if (trimmed in MANUAL_MAPPINGS) {
    const mapped = MANUAL_MAPPINGS[trimmed];
    if (mapped === null) {
      resolvedCache.set(trimmed, null);
      return null;
    }
    // Validate the manual ticker
    const info = await validateTicker(mapped);
    await delay(300);
    const result = info ? { ticker: info.symbol, longName: info.longName, currency: info.currency, exchange: info.exchange } : null;
    resolvedCache.set(trimmed, result);
    return result;
  }

  // Check if the name itself is already a valid ticker (e.g. "SNOWFLAKE" → SNOW, "TESLA" → TSLA)
  // First try the name as-is if it looks like a ticker (all caps, short)
  if (trimmed === trimmed.toUpperCase() && trimmed.length <= 6 && /^[A-Z]+$/.test(trimmed)) {
    const directInfo = await validateTicker(trimmed);
    await delay(300);
    if (directInfo) {
      const result = { ticker: directInfo.symbol, longName: directInfo.longName, currency: directInfo.currency, exchange: directInfo.exchange };
      resolvedCache.set(trimmed, result);
      return result;
    }
  }

  // Search Yahoo Finance
  if (VERBOSE) console.log(`    Searching Yahoo Finance for: "${trimmed}"`);
  const candidates = await searchYahooFinance(trimmed);
  await delay(500);

  // Filter to equities/ETFs and pick best match
  const equityCandidates = candidates.filter(c =>
    c.quoteType === 'EQUITY' || c.quoteType === 'ETF'
  );

  if (equityCandidates.length === 0) {
    if (VERBOSE) console.log(`    No equity matches found for "${trimmed}"`);
    resolvedCache.set(trimmed, null);
    return null;
  }

  // Score candidates: prefer exact name match, then major exchanges
  const scored = equityCandidates.map(c => {
    let score = 0;
    const cName = (c.longname || c.shortname || '').toLowerCase();
    const qName = trimmed.toLowerCase();

    // Exact match
    if (cName === qName) score += 100;
    // Starts with query
    else if (cName.startsWith(qName)) score += 50;
    // Contains query
    else if (cName.includes(qName)) score += 30;
    // Query contains candidate name
    else if (qName.includes(cName)) score += 20;

    // Prefer major US exchanges
    const exchange = (c.exchDisp || c.exchange || '').toUpperCase();
    if (exchange.includes('NASDAQ') || exchange.includes('NYSE') || exchange === 'NMS' || exchange === 'NYQ') score += 15;
    // Hong Kong exchange
    if (exchange.includes('HKSE') || exchange.includes('HKG') || exchange.includes('HONG KONG')) score += 10;
    // Other major exchanges
    if (exchange.includes('LSE') || exchange.includes('PARIS') || exchange.includes('EURONEXT')) score += 5;

    // Prefer EQUITY over ETF
    if (c.quoteType === 'EQUITY') score += 5;

    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (VERBOSE) {
    console.log(`    Best match: ${best.symbol} "${best.longname || best.shortname}" (score=${best.score})`);
  }

  // Validate the resolved ticker
  const info = await validateTicker(best.symbol);
  await delay(300);

  if (!info) {
    if (VERBOSE) console.log(`    Validation failed for ${best.symbol}`);
    resolvedCache.set(trimmed, null);
    return null;
  }

  const result = {
    ticker: info.symbol,
    longName: info.longName,
    currency: info.currency,
    exchange: info.exchange,
  };
  resolvedCache.set(trimmed, result);
  return result;
}

// ─── SharePoint data fetch ──────────────────────────────────────────

async function fetchAllSharePointRecords() {
  const siteId = await GraphAPIService.getSharePointSiteId();
  const fields = 'Title,RequestorEmail,TradeName,TradeDirection,NumberofShares_x002f_FaceAmounto,Status,SubmissionID,Created';
  let allItems = [];
  let url = `/sites/${siteId}/lists/${SHAREPOINT_LIST_ID}/items?$expand=fields($select=${fields})&$top=200`;

  while (url) {
    const page = await GraphAPIService.graphRequest('GET', url);
    allItems = allItems.concat(page.value || []);
    const next = page['@odata.nextLink'];
    url = next ? next.replace('https://graph.microsoft.com/v1.0', '') : null;
  }

  return allItems.map(item => {
    const f = item.fields || {};
    return {
      created: f.Created || item.createdDateTime,
      email: f.RequestorEmail || '',
      tradeName: f.TradeName || '',
      direction: f.TradeDirection || '',
      shares: f.NumberofShares_x002f_FaceAmounto || '',
      status: f.Status || '',
      submissionId: f.SubmissionID || null,
    };
  });
}

// ─── Database insertion ─────────────────────────────────────────────

async function insertTradingRequest(record, tickerInfo) {
  const uuid = uuidv4();
  const customId = uuid.substring(0, 7).toUpperCase();

  const sql = `
    INSERT INTO trading_requests (
      uuid, custom_id, employee_email, stock_name, ticker, shares,
      share_price, total_value, currency, share_price_usd,
      total_value_usd, exchange_rate, trading_type, status,
      rejection_reason, instrument_type, created_at, processed_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING uuid
  `;

  const params = [
    uuid,
    customId,
    record.email.toLowerCase(),
    tickerInfo.longName || record.tradeName,
    tickerInfo.ticker,
    parseInt(record.shares, 10) || 0,
    null,                           // share_price (historical, unknown)
    null,                           // total_value
    tickerInfo.currency || 'USD',   // currency
    null,                           // share_price_usd
    null,                           // total_value_usd
    null,                           // exchange_rate
    record.direction.toLowerCase(), // trading_type
    record.status.toLowerCase(),    // status
    null,                           // rejection_reason
    'equity',                       // instrument_type
    record.created,                 // created_at (original timestamp)
    record.created,                 // processed_at (same as created)
  ];

  const pool = database.getPool();
  const result = await pool.query(sql, params);
  return result.rows[0]?.uuid || uuid;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Pre-Trade Approvals Migration ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  // Step 1: Fetch records from SharePoint
  console.log('1. Fetching records from SharePoint list...');
  const records = await fetchAllSharePointRecords();
  console.log(`   Found ${records.length} records\n`);

  // Step 2: Collect unique trade names
  const uniqueNames = [...new Set(records.map(r => r.tradeName.trim()).filter(Boolean))];
  console.log(`2. Resolving tickers for ${uniqueNames.length} unique trade names...\n`);

  // Step 3: Resolve tickers
  const tickerMap = new Map();
  const skipped = [];
  const failed = [];

  for (const name of uniqueNames) {
    process.stdout.write(`   Resolving: ${name.padEnd(50)}`);
    const result = await resolveTickerFromName(name);
    if (result === null) {
      // Check if it was a deliberate skip (test/private)
      const trimmed = name.trim();
      if (trimmed in MANUAL_MAPPINGS && MANUAL_MAPPINGS[trimmed] === null) {
        process.stdout.write(`→ SKIP (test/private)\n`);
        skipped.push(name);
      } else {
        process.stdout.write(`→ FAILED\n`);
        failed.push(name);
      }
    } else {
      process.stdout.write(`→ ${result.ticker} (${result.longName})\n`);
      tickerMap.set(name, result);
    }
  }

  // Step 4: Print resolution summary
  console.log(`\n3. Resolution summary:`);
  console.log(`   Resolved:  ${tickerMap.size}`);
  console.log(`   Skipped:   ${skipped.length} (${skipped.join(', ') || 'none'})`);
  console.log(`   Failed:    ${failed.length} (${failed.join(', ') || 'none'})`);

  // Print full mapping table
  console.log(`\n   ┌──────────────────────────────────────────────┬────────────┬──────────────────────────────────────────┐`);
  console.log(`   │ Trade Name                                   │ Ticker     │ Resolved Name                            │`);
  console.log(`   ├──────────────────────────────────────────────┼────────────┼──────────────────────────────────────────┤`);
  for (const [name, info] of tickerMap) {
    console.log(`   │ ${name.padEnd(44)} │ ${info.ticker.padEnd(10)} │ ${(info.longName || '').substring(0, 40).padEnd(40)} │`);
  }
  console.log(`   └──────────────────────────────────────────────┴────────────┴──────────────────────────────────────────┘`);

  // Step 5: Migrate records
  const migratable = records.filter(r => {
    const name = r.tradeName.trim();
    return tickerMap.has(name) && r.email && r.shares;
  });

  console.log(`\n4. ${DRY_RUN ? 'Would migrate' : 'Migrating'} ${migratable.length} records (skipping ${records.length - migratable.length})...\n`);

  if (DRY_RUN) {
    // Show what would be inserted
    for (const record of migratable) {
      const info = tickerMap.get(record.tradeName.trim());
      console.log(`   [DRY] ${record.created.substring(0, 10)} | ${record.email.padEnd(35)} | ${info.ticker.padEnd(10)} | ${record.direction.padEnd(4)} | ${record.shares.toString().padEnd(6)} | ${record.status}`);
    }
    console.log(`\n   Dry run complete. Run without --dry-run to execute migration.`);
    return;
  }

  // Initialize database
  await database.init();

  let migrated = 0;
  let errors = 0;

  for (const record of migratable) {
    const info = tickerMap.get(record.tradeName.trim());
    try {
      const uuid = await insertTradingRequest(record, info);
      migrated++;
      if (VERBOSE) {
        console.log(`   OK: ${uuid.substring(0, 8)} | ${record.email} | ${info.ticker} | ${record.direction} ${record.shares}`);
      }
    } catch (err) {
      errors++;
      console.error(`   ERROR: ${record.email} | ${record.tradeName} | ${err.message}`);
    }
  }

  console.log(`\n5. Migration complete!`);
  console.log(`   Migrated: ${migrated}`);
  console.log(`   Errors:   ${errors}`);
  console.log(`   Skipped:  ${records.length - migratable.length}`);
}

// ─── Retroactive short-term trade flagging ──────────────────────────

const FLAG_SHORT_TERM = process.argv.includes('--flag-short-term');

async function flagShortTermTrades() {
  console.log(`=== Retroactive Short-Term Trade Flagging ===\n`);

  await database.init();
  const pool = database.getPool();

  // Get all trades ordered by employee, ticker, date
  const { rows } = await pool.query(`
    SELECT uuid, employee_email, ticker, trading_type, shares, status, created_at
    FROM trading_requests
    ORDER BY employee_email, ticker, created_at
  `);

  console.log(`Scanning ${rows.length} trades for 30-day short-term patterns...\n`);

  let flagged = 0;
  const flaggedDetails = [];

  for (let i = 0; i < rows.length; i++) {
    const current = rows[i];
    if (current.status !== 'approved') continue;

    // Look backward for opposite-direction trades within 30 days by same employee+ticker
    for (let j = i - 1; j >= 0; j--) {
      const prior = rows[j];

      // Different employee or ticker — stop looking
      if (prior.employee_email !== current.employee_email || prior.ticker !== current.ticker) break;

      // Same direction — skip
      if (prior.trading_type === current.trading_type) continue;

      // Check if prior trade is approved
      if (prior.status !== 'approved') continue;

      // Check 30-day window
      const daysBetween = Math.ceil(
        (new Date(current.created_at) - new Date(prior.created_at)) / (1000 * 60 * 60 * 24)
      );

      if (daysBetween <= 30) {
        const priorAction = prior.trading_type === 'buy' ? 'Bought' : 'Sold';
        const currentAction = current.trading_type === 'buy' ? 'bought' : 'sold';
        const priorDate = new Date(prior.created_at).toLocaleDateString('en-GB');
        const currentDate = new Date(current.created_at).toLocaleDateString('en-GB');
        const reason = `Short-term trading (historical): ${priorAction} ${prior.shares} shares of ${current.ticker} on ${priorDate}, then ${currentAction} ${current.shares} shares on ${currentDate} (${daysBetween} days later). Flagged per 30-day holding requirement.`;

        if (!DRY_RUN) {
          await pool.query(`
            UPDATE trading_requests
            SET escalated = true, escalation_reason = $1, escalated_at = created_at
            WHERE uuid = $2 AND escalated = false
          `, [reason, current.uuid]);
        }

        flagged++;
        flaggedDetails.push({
          uuid: current.uuid.substring(0, 8),
          email: current.employee_email,
          ticker: current.ticker,
          action: `${prior.trading_type}→${current.trading_type}`,
          days: daysBetween,
        });

        console.log(`   ${DRY_RUN ? '[DRY] ' : ''}FLAGGED: ${current.employee_email.padEnd(35)} | ${current.ticker.padEnd(10)} | ${prior.trading_type}→${current.trading_type} | ${daysBetween} days apart`);
        break; // Only flag once per trade
      }
    }
  }

  console.log(`\n${DRY_RUN ? 'Would flag' : 'Flagged'}: ${flagged} trades`);
  if (DRY_RUN && flagged > 0) {
    console.log('Run without --dry-run to apply flags.');
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const entryPoint = FLAG_SHORT_TERM ? flagShortTermTrades : main;

entryPoint().catch(err => {
  console.error('\nFatal error:', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
}).then(() => {
  process.exit(0);
});
