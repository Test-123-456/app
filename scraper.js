/**
 * scraper.js — Scrapes daily/weekly Pakistan local prices
 *
 * Sources tried in order:
 *   1. AMIS.pk  — Agricultural Market Information Service (daily mandi prices)
 *   2. PBS.gov.pk SPI — Pakistan Bureau of Statistics Sensitive Price Indicator (weekly)
 *
 * Returns prices normalised to PKR / 100 kg for every commodity in
 * commodities.js.  On failure it falls back to the pkr100kg value
 * from the master DB (clearly flagged as 'fallback' in the report).
 */

'use strict';

require('dotenv').config();
const axios    = require('axios');
const cheerio  = require('cheerio');
const XLSX     = require('xlsx');
const { DB }   = require('./commodities');

const TIMEOUT_MS = 20_000;
const HEADERS = {
  'User-Agent'      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept'          : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language' : 'en-US,en;q=0.9',
};

const AMIS_URLS = [
  'http://www.amis.pk/',
  'https://www.amis.pk/',
  'http://amis.pk/',
  'http://www.amis.pk/Default.aspx',
  'http://www.amis.pk/MarketReport.aspx',
];

// PBS Sensitive Price Indicator — 51 essential items, published weekly (Excel download)
const PBS_SPI_PAGE = 'https://www.pbs.gov.pk/content/weekly-sensitive-price-indicator';

// ─── Matching helpers ─────────────────────────────────────────────────────────

const normalise = str => (str || '').toLowerCase().replace(/\s+/g, ' ').trim();

function matchCommodity(text) {
  const n = normalise(text);
  for (const [key, meta] of Object.entries(DB)) {
    if (meta.aliases.some(a => n.includes(a))) return key;
  }
  return null;
}

/**
 * Extract an average price from strings like "3,500", "3500-3700", "3,500 / 3,800".
 * Returns the average of any numbers found, or null.
 */
function extractPrice(text) {
  const nums = (text || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const valid = nums.map(Number).filter(n => n > 50 && n < 1_000_000);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Detect if prices in a table appear to be per-maund (40 kg) and
 * return the factor needed to convert to per-100-kg.
 */
function conversionFactor(headerText) {
  const h = normalise(headerText || '');
  if (h.includes('maund') || h.includes('mann') || h.includes('40 kg') || h.includes('40kg')) return 2.5;
  return 1; // assume PKR/100 kg (quintal) by default
}

// ─── AMIS.pk parser ───────────────────────────────────────────────────────────

function parseAmisDocument($) {
  const found = {};

  // Strategy 1 — HTML table scan
  $('table').each((_, table) => {
    const $t         = $(table);
    const headerText = $t.find('th').map((_, th) => $(th).text()).get().join(' ');
    const factor     = conversionFactor(headerText);

    $t.find('tr').each((_, row) => {
      const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get();
      if (cells.length < 2) return;

      const key = matchCommodity(cells[0]);
      if (!key || found[key]) return;

      for (let i = 1; i < cells.length; i++) {
        const price = extractPrice(cells[i]);
        if (price && price > 100) {
          found[key] = { pkr100kg: Math.round(price * factor), confidence: 'live', note: 'AMIS.pk table' };
          break;
        }
      }
    });
  });

  // Strategy 2 — full page text scan for any commodity not yet found
  if (Object.keys(found).length < 5) {
    const pageText = $.root().text();
    for (const [key, meta] of Object.entries(DB)) {
      if (found[key]) continue;
      for (const alias of meta.aliases) {
        const re = new RegExp(`${alias}[^0-9]{0,40}([0-9][0-9,]{2,})`, 'i');
        const m  = pageText.match(re);
        if (m) {
          const price = extractPrice(m[1]);
          if (price && price > 100 && price < 1_000_000) {
            found[key] = { pkr100kg: Math.round(price), confidence: 'live', note: 'AMIS.pk text scan' };
            break;
          }
        }
      }
    }
  }

  return found;
}

// ─── PBS SPI Excel parser ─────────────────────────────────────────────────────

/**
 * Map from PBS SPI Annex description (lowercased substring) → { key, factor }
 *
 *   key    : commodity key in DB
 *   factor : multiply PBS price by this to get PKR / 100 kg
 *              PBS gives PKR/kg  → factor = 100
 *              PBS gives PKR/20kg bag → factor = 5   (price / 20 * 100)
 *
 * Notes:
 *  • "Wheat Flour Bag" is FLOUR (not grain) — skipped to avoid apples-to-oranges.
 *  • Prices here are PBS SPI weekly *retail* averages across 7+ cities.
 *    They are real government statistics but slightly higher than farm-gate/mandi.
 */
const PBS_MAP = {
  'rice basmati broken'  : { key: 'rice_basmati', factor: 100 },
  'rice irri'            : { key: 'rice_irri',    factor: 100 },
  'pulse masoor'         : { key: 'red_lentils',  factor: 100 },
  'pulse moong'          : { key: 'mung_beans',   factor: 100 },
  'pulse gram'           : { key: 'chickpea',     factor: 100 },
  'potatoes'             : { key: 'potato',       factor: 100 },
  'onions'               : { key: 'onion',        factor: 100 },
  'tomatoes'             : { key: 'tomato',       factor: 100 },
  'sugar refined'        : { key: 'sugar',        factor: 100 },
  'gur'                  : { key: 'jaggery',      factor: 100 },
  'garlic'               : { key: 'garlic',       factor: 100 },
};

/**
 * Parse the PBS SPI Annex Excel buffer.
 *
 * Spreadsheet layout (Appendix-A sheet):
 *   Col 0  : SL. No.
 *   Col 1  : DESCRIPTION
 *   Col 2  : UNIT
 *   Col 3,4,5 : Islamabad MIN, AVG, MAX
 *   Col 6,7,8 : Rawalpindi MIN, AVG, MAX
 *   …repeating for each city (7+ cities)
 *   Last col  : SL. No. (repeated)
 *
 * We average the AVG columns (4, 7, 10, 13, …) across all cities,
 * ignoring zero values (city didn't report that week).
 */
function parsePbsExcel(buffer) {
  const found = {};
  let wb;
  try { wb = XLSX.read(buffer, { type: 'buffer' }); } catch { return found; }

  const sheetName = wb.SheetNames.find(n => /appendix.?a/i.test(n)) || wb.SheetNames[0];
  const ws   = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  for (const row of data) {
    if (!row[1] || typeof row[1] !== 'string') continue;
    const desc = row[1].toLowerCase().trim();

    for (const [pattern, { key, factor }] of Object.entries(PBS_MAP)) {
      if (!desc.includes(pattern)) continue;

      // Collect national-average prices from AVG columns (4, 7, 10, …)
      const avgs = [];
      for (let col = 4; col < row.length - 1; col += 3) {
        const v = parseFloat(row[col]);
        if (v > 0) avgs.push(v);
      }
      if (avgs.length === 0) break;

      const nationalAvg = avgs.reduce((a, b) => a + b, 0) / avgs.length;
      const pkr100kg    = Math.round(nationalAvg * factor);

      // Sanity check: must be a plausible PKR/100kg value
      if (pkr100kg > 100 && pkr100kg < 10_000_000) {
        found[key] = {
          pkr100kg,
          confidence : 'live',
          note       : `PBS SPI weekly retail avg (${avgs.length} cities)`,
        };
      }
      break;
    }
  }

  return found;
}

// ─── AMIS Daily Market Changes ────────────────────────────────────────────────

/**
 * Priority-ordered matching table for AMIS Daily Market Changes commodity names.
 * { skip: true } = commodity listed in non-weight units (dozens, pieces) — skip it.
 * The first matching entry wins, so put more-specific patterns before broader ones.
 */
const AMIS_DAILY_MAP = [
  // Non-weight units — skip entirely (cannot convert to PKR/100kg)
  { skip: true, patterns: ['dozen', '100pcs', '100 pcs', '/pcs', 'per pcs'] },
  // Fresh Fruits (multiple varieties collapse to one key — we average them)
  { key: 'mango',          patterns: ['mango', 'sindhri', 'chaunsa', 'chounsa', 'anwar ratol', 'langra', 'dasehra'] },
  { key: 'apple',          patterns: ['apple', 'ammre', 'seb '] },
  { key: 'peach',          patterns: ['peach', 'aadu', 'shaftalu'] },
  { key: 'plum',           patterns: ['plum', 'alucha', 'alocha', 'aloo bukhara'] },
  { key: 'apricot_fresh',  patterns: ['apricot', 'khurmani', 'zardalu', 'khumani'] },
  { key: 'cherry',         patterns: ['cherry', 'gilas'] },
  { key: 'grape',          patterns: ['grape', 'angoor'] },
  { key: 'pomegranate',    patterns: ['pomegranate', 'anar'] },
  { key: 'guava',          patterns: ['guava', 'amrood', 'amrud'] },
  { key: 'papaya',         patterns: ['papaya', 'papita', 'پپیتا', 'papeeta'] },
  { key: 'watermelon',     patterns: ['watermelon', 'tarboz', 'tarbooz'] },
  { key: 'melon',          patterns: ['melon', 'kharbooza', 'kharbooze', 'kharboze'] },
  { key: 'pear',           patterns: ['pear', 'nashpati'] },
  { key: 'kinnow',         patterns: ['kinnow', 'kinno', 'kino'] },
  { key: 'orange',         patterns: ['orange', 'narangi', 'navel orange'] },
  { key: 'lychee',         patterns: ['lychee', 'litchi', 'leechi'] },
  { key: 'strawberry',     patterns: ['strawberry'] },
  { key: 'dates',          patterns: ['dates', 'aseel', 'fasli', 'khajoor', 'khurma'] },
  { key: 'fig_dried',      patterns: ['fig', 'anjeer', 'injeer'] },
  { key: 'mulberry_dried', patterns: ['mulberry', 'shahtoot', 'toot'] },
  { key: 'banana',         patterns: ['banana', 'kela', 'kella'] },
  // Vegetables
  { key: 'onion',          patterns: ['onion', 'pyaz', 'piyaz', 'gandana'] },
  { key: 'tomato',         patterns: ['tomato', 'tamatar'] },
  { key: 'potato',         patterns: ['potato', 'aloo', 'aaloo'] },
  { skip: true,            patterns: ['garlic (china)', 'garlic china', 'chinese garlic'] }, // imported product — different economics
  { key: 'garlic',         patterns: ['garlic', 'lehsun', 'lasan', 'lassan'] },
  { key: 'ginger',         patterns: ['ginger', 'adrak', 'adarak'] },
  { key: 'okra',           patterns: ['lady finger', 'ladyfinger', 'okra', 'bhindi'] },
  { key: 'bitter_gourd',   patterns: ['bitter gourd', 'bitter gourd', 'karela', 'karella', 'کریلا'] },
  { key: 'capsicum',       patterns: ['capsicum', 'shimla mirch', 'bell pepper'] },
  { key: 'chili_fresh',    patterns: ['green chili', 'green chilli', 'hari mirch', 'lal mirch taza', 'red chili fresh'] },
  { key: 'brinjal',        patterns: ['brinjal', 'baingan', 'banjan', 'eggplant'] },
  { key: 'cucumber',       patterns: ['cucumber', 'kheera', 'khira'] },
  { key: 'carrot',         patterns: ['carrot', 'gajar'] },
  { key: 'cauliflower',    patterns: ['cauliflower', 'phool gobi'] },
  { key: 'cabbage',        patterns: ['cabbage', 'band gobi', 'bandgobi', 'kobi'] },
  { key: 'peas_fresh',     patterns: ['peas', 'matar'] },
  { key: 'pumpkin',        patterns: ['pumpkin', 'bottle gourd', 'kaddu', 'loki', 'tinda', 'zucchini', 'ghia tori', 'کدو'] },
  { key: 'spinach',        patterns: ['spinach', 'palak'] },
  { key: 'moringa_leaves', patterns: ['moringa', 'sohnjana', 'drumstick'] },
  { key: 'chili_dried',    patterns: ['dry chili', 'dried chili', 'sukhi mirch'] },
  // Grains
  { key: 'corn',           patterns: ['maize', 'makka', 'makkai'] },
  { key: 'wheat',          patterns: ['wheat', 'gandum', 'gehun'] },
  // Sweeteners
  { key: 'jaggery',        patterns: [' gur', 'jaggery', 'gud '] },
  { key: 'sugar',          patterns: ['sugar', 'cheeni', 'shakkar'] },
  // Oilseeds & Spices
  { key: 'sesame',         patterns: ['sesame', ' til ', 'teel'] },
  { key: 'groundnut_shell',patterns: ['groundnut', 'peanut', 'moongphali'] },
  { key: 'turmeric_raw',   patterns: ['turmeric', 'haldi'] },
  { key: 'coriander_seeds',patterns: ['coriander', 'dhania'] },
  { key: 'cumin',          patterns: ['cumin', 'zeera', 'jeera'] },
];

const AMIS_DAILY_URL = 'http://www.amis.pk/Daily%20Market%20Changes.aspx';

function matchAmisDaily(text) {
  const n = ` ${(text || '').toLowerCase().trim()} `;
  for (const entry of AMIS_DAILY_MAP) {
    if (entry.patterns.some(p => n.includes(p))) {
      return entry.skip ? '__skip__' : entry.key;
    }
  }
  return null;
}

/**
 * Scrape today's mandi wholesale prices from AMIS Daily Market Changes.
 * The page lists 50-60 commodities across multiple cities; we average them
 * by commodity key to get a single national-average PKR/100kg price.
 */
async function scrapeAmisDaily(log, warn) {
  try {
    log(`AMIS Daily: fetching ${AMIS_DAILY_URL} …`);
    const { data } = await axios.get(AMIS_DAILY_URL, {
      headers: HEADERS, timeout: TIMEOUT_MS, maxRedirects: 5,
    });
    const $ = cheerio.load(data);

    // Find the table with the most data rows
    let bestTable = null, bestCount = 0;
    $('table').each((_, table) => {
      const rows = $(table).find('tr').length;
      if (rows > bestCount) { bestCount = rows; bestTable = table; }
    });

    if (!bestTable || bestCount < 5) {
      warn('AMIS Daily: no data table found on page');
      return { found: {}, cityPrices: {} };
    }

    // Detect unit from header (maund → ×2.5, default assume PKR/100kg)
    const headerText = $(bestTable).find('th').map((_, th) => $(th).text()).get().join(' ');
    const factor     = conversionFactor(headerText);

    // Accumulate: key → { sum, count, cities: { cityName: { sum, count } } }
    // AMIS Daily layout: CityName(col0) | CropName(col1) | Price(col2) | Yesterday | Change
    const acc = {};

    $(bestTable).find('tr').each((_, row) => {
      const cells = $(row).find('td').map((_, td) => $(td).text().trim()).get();
      if (cells.length < 2) return;

      // Try columns 0..2 as potential commodity name columns
      for (let nameCol = 0; nameCol < Math.min(cells.length, 3); nameCol++) {
        const key = matchAmisDaily(cells[nameCol]);
        if (!key) continue;
        if (key === '__skip__') return; // non-weight unit — skip entire row

        // City name lives in the column immediately before the commodity column
        const cityName = nameCol > 0 ? cells[nameCol - 1].trim() : null;

        // First valid numeric value in remaining cells is today's price
        for (let i = nameCol + 1; i < cells.length; i++) {
          const price = extractPrice(cells[i]);
          if (price && price > 100 && price < 5_000_000) {
            const p = Math.round(price * factor);
            if (!acc[key]) acc[key] = { sum: 0, count: 0, cities: {} };
            acc[key].sum   += p;
            acc[key].count += 1;
            // Per-city tracking (multiple rows for same city+key are averaged)
            if (cityName) {
              if (!acc[key].cities[cityName]) acc[key].cities[cityName] = { sum: 0, count: 0 };
              acc[key].cities[cityName].sum   += p;
              acc[key].cities[cityName].count += 1;
            }
            break;
          }
        }
        break; // matched — stop scanning columns in this row
      }
    });

    // Convert accumulated sums → averages; build cityPrices map in parallel
    const found      = {};
    const cityPrices = {}; // key → { cityName: pkr100kg }

    for (const [key, { sum, count, cities }] of Object.entries(acc)) {
      if (count === 0) continue;
      const avg = sum / count;
      if (avg < 50 || avg > 5_000_000) continue; // sanity check

      found[key] = {
        pkr100kg   : Math.round(avg),
        confidence : 'live',
        note       : `AMIS Daily Market Changes — avg of ${count} city report${count !== 1 ? 's' : ''}`,
        dataUrl    : AMIS_DAILY_URL,
      };

      // Per-city averages for spot arbitrage
      const cityEntries = Object.entries(cities);
      if (cityEntries.length >= 1) {
        cityPrices[key] = {};
        for (const [city, { sum: cs, count: cc }] of cityEntries) {
          cityPrices[key][city] = Math.round(cs / cc);
        }
      }
    }

    const count = Object.keys(found).length;
    if (count > 0) {
      log(`AMIS Daily: ${count} commodities with live mandi prices (${Object.keys(cityPrices).length} with city breakdown)`);
    } else {
      warn('AMIS Daily: parsed 0 prices — table layout may have changed');
    }
    return { found, cityPrices };

  } catch (err) {
    warn(`AMIS Daily: fetch failed — ${err.message}`);
    return { found: {}, cityPrices: {} };
  }
}

// ─── AMIS scraper ─────────────────────────────────────────────────────────────

async function scrapeAmis(log, warn) {
  for (const url of AMIS_URLS) {
    try {
      log(`AMIS: trying ${url}`);
      const { data } = await axios.get(url, { headers: HEADERS, timeout: TIMEOUT_MS, maxRedirects: 5 });
      const $        = cheerio.load(data);
      const result   = parseAmisDocument($);
      const count    = Object.keys(result).length;

      if (count >= 3) {
        // Attach source URL to every price so the HTML report can link to it
        for (const v of Object.values(result)) v.dataUrl = url;
        log(`AMIS: scraped ${count} prices from ${url}`);
        return { prices: result, usedUrl: url };
      }
      warn(`AMIS: only ${count} prices at ${url} — trying next.`);
    } catch (err) {
      warn(`AMIS: ${url} → ${err.message}`);
    }
  }
  return { prices: {}, usedUrl: null };
}

// ─── PBS Excel scraper ────────────────────────────────────────────────────────

/**
 * Downloads the latest PBS SPI Annex Excel from pbs.gov.pk and extracts
 * real weekly retail prices for mapped commodities.
 *
 * Steps:
 *  1. Fetch the SPI landing page to find the current Annex .xlsx link
 *  2. Download the Excel file
 *  3. Parse with xlsx → extract national averages
 */
async function scrapePbsExcel(log, warn) {
  const SPI_PAGE = 'https://www.pbs.gov.pk/content/weekly-sensitive-price-indicator';
  let excelUrl   = null;

  try {
    log('PBS: fetching SPI page to find latest Excel link…');
    const { data: html } = await axios.get(SPI_PAGE, {
      headers: HEADERS, timeout: TIMEOUT_MS, maxRedirects: 5,
    });

    // Find the "Annex" Excel link — the one with commodity-level price data
    const match = html.match(/href=["']([^"']*Annex[^"']*\.xlsx)["']/i)
                || html.match(/href=["']([^"']*\.xlsx)["']/i);
    if (!match) { warn('PBS: no .xlsx link found on SPI page'); return {}; }

    excelUrl = match[1].startsWith('http') ? match[1] : `https://www.pbs.gov.pk${match[1]}`;
    log(`PBS: downloading Excel → ${excelUrl}`);
  } catch (err) {
    warn(`PBS: SPI page fetch failed — ${err.message}`);
    return {};
  }

  try {
    const { data: buffer } = await axios.get(excelUrl, {
      responseType : 'arraybuffer',
      headers      : HEADERS,
      timeout      : TIMEOUT_MS,
    });

    const result = parsePbsExcel(Buffer.from(buffer));
    const count  = Object.keys(result).length;

    if (count > 0) {
      for (const v of Object.values(result)) v.dataUrl = excelUrl;
      log(`PBS Excel: extracted ${count} real prices from ${excelUrl}`);
    } else {
      warn('PBS Excel: parsed 0 prices — column layout may have changed');
    }
    return result;

  } catch (err) {
    warn(`PBS Excel download/parse failed — ${err.message}`);
    return {};
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scrape local Pakistan mandi/retail prices.
 * Tries AMIS.pk first, then PBS.gov.pk for any gaps.
 * Falls back to DB reference prices for anything not scraped.
 *
 * Returns:
 *   {
 *     source    : 'https://...' | 'fallback',
 *     scrapedAt : ISO string,
 *     prices    : {
 *       wheat : { pkr100kg, confidence: 'live'|'fallback', note },
 *       ...
 *     }
 *   }
 */
async function scrapeAmisPrices() {
  const log  = m => console.log(`[scraper] ${m}`);
  const warn = m => console.warn(`[scraper] WARN: ${m}`);

  log('Starting local price scrape (AMIS Daily → PBS → AMIS main page)...');

  // 1. AMIS Daily Market Changes — most comprehensive (~53 commodities, updated daily)
  //    Wholesale mandi prices, averaged across all reporting cities.
  const { found: dailyPrices, cityPrices } = await scrapeAmisDaily(log, warn);
  const dailyCount  = Object.keys(dailyPrices).length;

  // 2. PBS SPI Excel — government weekly retail prices for 11 staples
  //    Only fills gaps not covered by AMIS Daily.
  const pbsPrices = await scrapePbsExcel(log, warn);
  let pbsAdded = 0;
  for (const [key, val] of Object.entries(pbsPrices)) {
    if (!dailyPrices[key]) {
      dailyPrices[key] = val;
      pbsAdded++;
    }
  }
  if (pbsAdded > 0) log(`PBS filled ${pbsAdded} gap(s) not in AMIS Daily.`);

  // 3. Main AMIS page — fallback for remaining gaps
  const { prices: amisMainPrices, usedUrl: amisMainUrl } = await scrapeAmis(log, warn);
  let amisMainAdded = 0;
  for (const [key, val] of Object.entries(amisMainPrices)) {
    if (!dailyPrices[key]) {
      dailyPrices[key] = val;
      amisMainAdded++;
    }
  }
  if (amisMainAdded > 0) log(`AMIS main page added ${amisMainAdded} further price(s).`);

  const scraped = dailyPrices;

  // 4. DB fallback for any commodity not found on any live source
  const prices = {};
  let fallbackCount = 0;
  for (const [key, meta] of Object.entries(DB)) {
    if (scraped[key]) {
      prices[key] = scraped[key];
    } else {
      prices[key] = { pkr100kg: meta.pkr100kg, confidence: 'fallback', note: meta.localNote, dataUrl: null };
      fallbackCount++;
    }
  }

  const liveCount = Object.values(prices).filter(p => p.confidence === 'live').length;

  if (liveCount === 0) {
    warn('All local scrapers failed — full fallback dataset in use.');
  } else {
    log(`Live prices: ${liveCount} total (${dailyCount} AMIS Daily, ${pbsAdded} PBS, ${amisMainAdded} AMIS main).`);
    if (fallbackCount > 0) log(`${fallbackCount} commodities using DB reference prices (not found on any live source).`);
  }

  const primarySource = dailyCount > 0
    ? AMIS_DAILY_URL
    : (amisMainUrl || (pbsAdded > 0 ? 'PBS.gov.pk' : 'fallback'));

  return {
    source    : primarySource,
    scrapedAt : new Date().toISOString(),
    liveCount,
    prices,
    cityPrices,   // per-city mandi prices for spot arbitrage { key: { city: pkr100kg } }
  };
}

module.exports = { scrapeAmisPrices };
