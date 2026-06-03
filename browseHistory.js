/**
 * browseHistory.js — AMIS Historical Price Scraper + Interactive Planner Generator
 *
 * Data source: http://www.amis.pk/ViewPrices.aspx?searchType=0&commodityId=X
 *   • One page per commodity, one date at a time
 *   • Table: City | Graph | Min | Max | FQP | Quantity  (PKR/100 kg, "1 Quintal = 100 Kg")
 *   • Date input field: ctl00$cphPage$DateTextBox  (MM/DD/YYYY format)
 *   • Submit button:    ctl00$cphPage$ReminderButton = "Show prices"
 *
 * Usage:
 *   node browseHistory.js                — fetch last 60 days for key commodities + generate planner
 *   node browseHistory.js --days=90      — fetch last 90 days
 *   node browseHistory.js --all          — fetch ALL 132 commodities (slow)
 *   node browseHistory.js --plan-only    — regenerate HTML from existing data, no scrape
 *   node browseHistory.js --probe        — list all available commodities and exit
 */

'use strict';

require('dotenv').config();
const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');

const BASE_URL  = 'http://www.amis.pk';
const BROWSE_URL = `${BASE_URL}/BrowsePrices.aspx?searchType=0`;
const VIEW_URL  = `${BASE_URL}/ViewPrices.aspx`;
const DATA_FILE      = path.join(__dirname, 'data', 'price-history.json');
const ARRIVAL_FILE   = path.join(__dirname, 'data', 'arrival-history.json');
const UPLOAD_FILE    = path.join(__dirname, 'data', 'upload-times.json');
const CHANGES_FILE   = path.join(__dirname, 'data', 'daily-changes.json');
const PLAN_FILE      = path.join(__dirname, 'reports', 'planner.html');
const ARRIVAL_URL    = `${BASE_URL}/Arrivalreports/ArrivalDatewise.aspx`;
const RATE_STATS_URL = `${BASE_URL}/RateStatistics.aspx`;
const CHANGES_URL    = `${BASE_URL}/Daily%20Market%20Changes.aspx`;
const DELAY_MS  = 700;
const TIMEOUT   = 20_000;

const HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Accept'         : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer'        : BASE_URL,
};

const log   = m => console.log(`[browse] ${m}`);
const warn  = m => console.warn(`[browse] WARN: ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TARGET_MAP = {
  okra          : ['lady finger','okra','bhindi'],
  tomato        : ['tomato'],
  onion         : ['onion','green onion'],
  potato        : ['potato fresh','potato store'],
  garlic        : ['garlic (local)','garlic local'],
  ginger        : ['ginger (thai)','ginger thai','ginger'],
  bitter_gourd  : ['bitter gourd'],
  brinjal       : ['brinjal'],
  capsicum      : ['capsicum'],
  chili_fresh   : ['green chilli','green chili'],
  pumpkin       : ['pumpkin','bottle gourd'],
  cucumber      : ['cucumber'],
  carrot        : ['carrot'],
  cauliflower   : ['cauliflower'],
  cabbage       : ['cabbage'],
  peas_fresh    : ['peas'],
  spinach       : ['spinach'],
  mango         : ['mango (sindhri)','mango sindhri','mango (chounsa)','mango chounsa','mango (anwer ratol)','mango desi','mango saharni'],
  apple         : ['apple (golden)','apple (ammre)','apple golden'],
  peach         : ['peach'],
  plum          : ['plum'],
  apricot_fresh : ['apricot white','apricot yellow'],
  watermelon    : ['watermelon'],
  melon         : ['melon'],
  wheat         : ['wheat'],
  sugar         : ['sugar'],
  jaggery       : ['jaggery','jaman'],
  sesame        : ['sesame'],
  rice_basmati  : ['paddy basmati','rice basmati'],
  rice_irri     : ['paddy (irri)','rice (irri)'],
  chickpea      : ['gram white (local)','gram pulse'],
};

const ROAD_KM = {
  'Lahore|Rawalpindi':380,'Lahore|Faisalabad':130,'Lahore|Gujranwala':75,
  'Lahore|Sahiwal':190,'Lahore|Khanewal':310,'Lahore|Lodhran':380,
  'Lahore|Kahrorpacca':430,'Lahore|Chichawatni':240,'Lahore|Chakwal':135,
  'Lahore|Jhang':205,'Lahore|Okara':120,'Lahore|Hafizabad':95,
  'Lahore|TTSingh':185,'Lahore|RahimYarKhan':560,'Lahore|Chiniot':165,
  'Lahore|Jhelum':265,'Lahore|Hasanabdal':310,'Lahore|Hazro':340,
  'Lahore|Multan':340,'Lahore|Bahawalpur':440,'Lahore|Sargodha':200,
  'Lahore|Gujrat':130,'Lahore|Sialkot':120,'Lahore|Narowal':140,
  'Lahore|Sheikhupura':35,'Lahore|Nankana':65,'Lahore|Kasur':55,
  'Rawalpindi|Sahiwal':480,'Rawalpindi|Khanewal':570,'Rawalpindi|Lodhran':620,
  'Rawalpindi|Kahrorpacca':665,'Rawalpindi|Chichawatni':520,'Rawalpindi|Chakwal':95,
  'Rawalpindi|Jhang':300,'Rawalpindi|Okara':400,'Rawalpindi|Hafizabad':330,
  'Rawalpindi|TTSingh':470,'Rawalpindi|RahimYarKhan':840,'Rawalpindi|Chiniot':340,
  'Rawalpindi|Jhelum':100,'Rawalpindi|Hasanabdal':60,'Rawalpindi|Hazro':75,
  'Rawalpindi|Faisalabad':270,'Rawalpindi|Multan':600,'Rawalpindi|Sargodha':190,
  'Sahiwal|Khanewal':130,'Sahiwal|Lodhran':195,'Sahiwal|Kahrorpacca':240,
  'Sahiwal|Chichawatni':55,'Sahiwal|Chakwal':290,'Sahiwal|Jhang':165,
  'Sahiwal|Okara':75,'Sahiwal|Hafizabad':210,'Sahiwal|TTSingh':100,
  'Sahiwal|RahimYarKhan':380,'Sahiwal|Chiniot':165,'Sahiwal|Faisalabad':155,
  'Khanewal|Lodhran':75,'Khanewal|Kahrorpacca':120,'Khanewal|Chichawatni':80,
  'Khanewal|Chakwal':385,'Khanewal|Jhang':195,'Khanewal|Okara':190,
  'Khanewal|TTSingh':80,'Khanewal|RahimYarKhan':265,'Khanewal|Chiniot':200,
  'Khanewal|Multan':55,'Khanewal|Faisalabad':230,
  'Lodhran|Kahrorpacca':45,'Lodhran|Chichawatni':150,'Lodhran|Chakwal':460,
  'Lodhran|Jhang':270,'Lodhran|RahimYarKhan':195,'Lodhran|Multan':80,
  'Lodhran|Bahawalpur':115,
  'Kahrorpacca|Chichawatni':190,'Kahrorpacca|Chakwal':500,'Kahrorpacca|Jhang':310,
  'Kahrorpacca|RahimYarKhan':155,'Kahrorpacca|Bahawalpur':60,
  'Chichawatni|Chakwal':340,'Chichawatni|Jhang':130,'Chichawatni|Okara':130,
  'Chichawatni|TTSingh':50,'Chichawatni|Faisalabad':175,
  'Chakwal|Jhang':200,'Chakwal|Jhelum':80,'Chakwal|Hasanabdal':45,
  'Jhang|Chiniot':55,'Jhang|TTSingh':75,'Jhang|Faisalabad':90,
  'Okara|Hafizabad':195,'Okara|TTSingh':105,'Okara|Faisalabad':120,
  'Hafizabad|Chiniot':70,'Hafizabad|Jhang':110,'Hafizabad|Gujranwala':55,
  'TTSingh|RahimYarKhan':290,'TTSingh|Chiniot':130,'TTSingh|Faisalabad':55,
  'Jhelum|Hasanabdal':65,'Hasanabdal|Hazro':25,
  'Faisalabad|Sargodha':80,'Faisalabad|Chiniot':35,'Faisalabad|Multan':230,
  'Multan|Bahawalpur':100,'Multan|RahimYarKhan':200,'Multan|Khanewal':55,
  'Sargodha|Chiniot':60,'Sargodha|Jhang':90,'Gujranwala|Sialkot':80,
  'Gujranwala|Gujrat':55,'Gujrat|Jhelum':75,'Sialkot|Narowal':60,
  // ── Extended city coverage ────────────────────────────────────────────────
  // Rawalpindi / Attock area
  'GujarKhan|Rawalpindi':65,'GujarKhan|Jhelum':85,
  'TALAGANG|Chakwal':45,'TALAGANG|Rawalpindi':125,
  // Gujrat / Mandi Bahauddin
  'LalaMusa|Gujrat':30,'LalaMusa|MandiBahaudin':20,
  'MandiBahaudin|Gujrat':45,'MandiBahaudin|Gujranwala':70,'MandiBahaudin|Sargodha':100,
  'Sraialamgir|Gujrat':35,'Sraialamgir|Jhelum':45,
  'Qadirpurrawan|Gujranwala':40,'Qadirpurrawan|Gujrat':35,
  // Sialkot / Narowal
  'Daska|Sialkot':25,'Daska|Gujranwala':40,
  'Sambrial|Sialkot':20,'Sambrial|Daska':15,
  'Pasroor|Sialkot':30,'Pasroor|Narowal':50,
  'Shakargarh|Narowal':35,'Shakargarh|Sialkot':65,
  // Lahore / Sheikhupura belt
  'Sanglahill|Sheikhupura':15,'Sanglahill|Lahore':45,
  'Muridke|Lahore':30,'Muridke|Sheikhupura':15,'Muridke|Gujranwala':45,
  'Safdarabad|Sheikhupura':40,'Safdarabad|Hafizabad':35,
  'Farooqabad|Sheikhupura':40,'Farooqabad|Hafizabad':55,
  // Hafizabad / Chiniot
  'Pindibhattian|Hafizabad':25,'Pindibhattian|Chiniot':45,
  // Sargodha belt
  'Jauharabad|Sargodha':90,'Jauharabad|Lahore':190,
  'Bhalwal|Sargodha':25,'Bhalwal|Chiniot':80,
  'kotmoman|Sargodha':50,'kotmoman|Bhalwal':30,
  'Sillanwali|Sargodha':50,
  'Phularwan|Sargodha':40,
  // Mianwali / Bhakhar / Layyah
  'Mianwali|Sargodha':180,'Mianwali|Bhakhar':80,'Mianwali|TALAGANG':110,
  'Bhakhar|Layyah':110,'Bhakhar|Kalurkot':40,
  'Kalurkot|Mianwali':60,
  // Faisalabad belt
  'ChackJhumra|Faisalabad':30,'ChackJhumra|Chiniot':65,
  'Jaranwala|Faisalabad':40,'Jaranwala|TTSingh':45,
  'Summandri|Faisalabad':35,'Summandri|Jhang':65,
  'Tandlianwala|Faisalabad':45,'Tandlianwala|TTSingh':35,
  'Mamunkanjan|Faisalabad':55,'Mamunkanjan|Sahiwal':75,
  'Kamalia|TTSingh':40,'Kamalia|Sahiwal':75,
  'PirMahal|Jhang':60,'PirMahal|TTSingh':50,
  'Shorkot|Jhang':35,'Shorkot|TTSingh':40,
  // Kasur / Lahore south
  'Chunian|Kasur':40,'Chunian|Okara':75,
  'HujraShahmuqeem|Kasur':30,'HujraShahmuqeem|Okara':60,
  'Khudian|Kasur':25,'Khudian|Lahore':70,
  'PhoolNagar|Kasur':35,'PhoolNagar|Lahore':55,
  'Kotradhakishan|Kasur':30,
  'Patoki|Kasur':25,'Patoki|Okara':75,
  // Okara belt
  'Depalpur|Okara':30,'Depalpur|Lahore':100,
  'Basirpur|Kasur':35,'Basirpur|Okara':45,
  'RenalaKhurd|Okara':25,'RenalaKhurd|Sahiwal':70,
  'Kanganpur|Sahiwal':50,'Kanganpur|Okara':55,
  // Sahiwal / Pakpattan
  'PakPattan|Sahiwal':70,'PakPattan|Okara':100,
  'ArifWala|PakPattan':40,'ArifWala|Sahiwal':80,
  'Pinanwal|TTSingh':30,'Pinanwal|Sahiwal':110,
  // Khanewal / Multan area
  'Burewala|Sahiwal':100,'Burewala|Khanewal':65,
  'Vehari|Multan':70,'Vehari|Burewala':25,
  'Mailsi|Vehari':35,'Mailsi|Lodhran':80,
  'MianChannu|Khanewal':30,'MianChannu|Multan':85,
  'KabirWala|Khanewal':40,'KabirWala|Multan':65,
  'Jahanian|Khanewal':60,'Jahanian|Multan':95,
  'Abdulhakim|Khanewal':40,'Abdulhakim|Multan':85,
  'DunyaPur|Lodhran':30,'DunyaPur|Multan':80,
  'jalalpurpirwala|Multan':65,'jalalpurpirwala|DunyaPur':35,
  // DG Khan / Muzaffargarh / Layyah
  'MuzafarGhar|Multan':35,'MuzafarGhar|Layyah':60,
  'KotAdu|MuzafarGhar':60,'KotAdu|Layyah':60,
  'DGKHAN|MuzafarGhar':80,'DGKHAN|KotAdu':120,
  'Layyah|Bhakhar':110,
  'RajanPur|RahimYarKhan':100,'RajanPur|MuzafarGhar':120,
  'JamPur|RajanPur':60,'JamPur|MuzafarGhar':80,
  'Taunsasharif|DGKHAN':60,'Taunsasharif|KotAdu':85,
  // Rahim Yar Khan area
  'LiaqatPur|RahimYarKhan':50,
  'SadiqAbad|RahimYarKhan':80,'SadiqAbad|LiaqatPur':30,
  'KhanPur|RahimYarKhan':90,'KhanPur|SadiqAbad':50,
  'Khanpur|RahimYarKhan':90,'Khanpur|SadiqAbad':50,
  // Bahawalpur division (also fix capitalisation alias)
  'BahawalPur|Multan':100,'BahawalPur|RahimYarKhan':200,'BahawalPur|Lodhran':115,
  'Chistian|BahawalPur':100,'Chistian|RahimYarKhan':100,
  'HaroonAbad|BahawalPur':70,'HaroonAbad|BahawalNagar':40,
  'BahawalNagar|BahawalPur':110,'BahawalNagar|Chistian':50,
  'AhmadPurEast|BahawalPur':55,'AhmadPurEast|RahimYarKhan':125,
  'Fortabas|BahawalNagar':25,'Fortabas|BahawalPur':90,
  'Yazman|BahawalPur':65,'Yazman|BahawalNagar':65,
  'KachaKhu|RahimYarKhan':40,'KachaKhu|SadiqAbad':55,
};

function getDistance(a, b) {
  return ROAD_KM[`${a}|${b}`] || ROAD_KM[`${b}|${a}`] || null;
}

function toAmisFmt(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function toIsoDate(d) { return d.toISOString().slice(0, 10); }

function parseCityName(raw) {
  return (raw || '').replace(/^\d+\s*/, '').trim();
}

async function discoverCommodities() {
  log('Discovering commodity list from BrowsePrices.aspx…');
  const { data } = await axios.get(BROWSE_URL, { headers: HEADERS, timeout: TIMEOUT, maxRedirects: 5 });
  const $ = cheerio.load(data);
  const list = [];
  $('a[href*="ViewPrices"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const name = $(el).text().trim();
    const m    = href.match(/commodityId=(\d+)/);
    if (m && name) list.push({ id: m[1], name, key: guessKey(name) });
  });
  log(`  Found ${list.length} commodities.`);
  return list;
}

function guessKey(name) {
  const n = name.toLowerCase();
  for (const [key, patterns] of Object.entries(TARGET_MAP)) {
    if (patterns.some(p => n.includes(p))) return key;
  }
  return null;
}

async function fetchCommodityPage(commodityId) {
  const url = `${VIEW_URL}?searchType=0&commodityId=${commodityId}`;
  const { data } = await axios.get(url, { headers: HEADERS, timeout: TIMEOUT, maxRedirects: 5 });
  const $ = cheerio.load(data);
  const viewState       = $('input[name="__VIEWSTATE"]').val()       || '';
  const eventValidation = $('input[name="__EVENTVALIDATION"]').val() || '';
  const viewStateGen    = $('input[name="__VIEWSTATEGENERATOR"]').val() || '';
  const dateRaw = $('input[id*="DateTextBox"]').val() || '';
  return { viewState, eventValidation, viewStateGen, url, defaultDate: dateRaw, $, data };
}

async function fetchCommodityForDate(commodityId, dateStr, pageState) {
  const url = `${VIEW_URL}?searchType=0&commodityId=${commodityId}`;
  const body = new URLSearchParams({
    '__VIEWSTATE'          : pageState.viewState,
    '__EVENTVALIDATION'    : pageState.eventValidation,
    '__VIEWSTATEGENERATOR' : pageState.viewStateGen,
    '__EVENTTARGET'        : '',
    '__EVENTARGUMENT'      : '',
    'ctl00$cphPage$DateTextBox'   : dateStr,
    'ctl00$cphPage$ReminderButton': 'Show prices',
  }).toString();
  const { data } = await axios.post(url, body, {
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: TIMEOUT, maxRedirects: 5,
  });
  return data;
}

function parseViewTable(html) {
  const $ = cheerio.load(html);
  const records = [];
  let targetTable = null;
  $('table').each((_, t) => {
    const text = $(t).text();
    if (text.includes('Min') && text.includes('Max') && text.includes('FQP')) targetTable = t;
  });
  if (!targetTable) return records;
  const headerRow = $(targetTable).find('tr').first();
  const headers   = headerRow.find('th,td').map((_, c) => $(c).text().trim().toLowerCase()).get();
  let minCol = headers.findIndex(h => h === 'min');
  let maxCol = headers.findIndex(h => h === 'max');
  let fqpCol = headers.findIndex(h => h.startsWith('fqp') || h === 'fqp');
  if (minCol < 0) { minCol = 2; maxCol = 3; fqpCol = 4; }
  $(targetTable).find('tr').each((i, row) => {
    const cells = $(row).find('td').map((_, c) => $(c).text().trim()).get();
    if (cells.length < 4) return;
    const city = parseCityName(cells[0]);
    if (!city || /graph|min|max|fqp|qty|dated/i.test(city)) return;
    const parseP = s => { const n = parseFloat((s||'').replace(/,/g,'')); return (!isNaN(n)&&n>50&&n<2_000_000)?Math.round(n):null; };
    const fqp = parseP(cells[fqpCol]);
    if (!fqp) return;
    records.push({ city, min: parseP(cells[minCol]), max: parseP(cells[maxCol]), fqp });
  });
  return records;
}

async function scrapeHistory(days, fetchAll) {
  let commodities;
  try { commodities = await discoverCommodities(); }
  catch (err) { warn(`Cannot reach AMIS: ${err.message}`); return []; }
  const targets = fetchAll ? commodities : commodities.filter(c => c.key !== null);
  log(`Scraping ${targets.length} commodity${targets.length !== 1 ? 'ies' : ''} × ${days} days…`);
  const allRecords = [];
  const today = new Date();
  for (let ci = 0; ci < targets.length; ci++) {
    const { id, name, key } = targets[ci];
    log(`[${ci + 1}/${targets.length}] ${name} (id=${id})…`);
    let pageState;
    try {
      pageState = await fetchCommodityPage(id);
      const todayRecords = parseViewTable(pageState.data);
      const todayIso = toIsoDate(today);
      for (const r of todayRecords) allRecords.push({ date: todayIso, commodityId: id, commodity: name, key: key || name, ...r });
      if (todayRecords.length > 0) log(`  Today: ${todayRecords.length} city prices`);
    } catch (err) { warn(`  GET failed: ${err.message}`); await sleep(2000); continue; }
    let successDays = 0;
    for (let d = 1; d < days; d++) {
      const date    = new Date(today.getTime() - d * 86_400_000);
      const dateStr = toAmisFmt(date);
      const isoDate = toIsoDate(date);
      try {
        const html    = await fetchCommodityForDate(id, dateStr, pageState);
        const records = parseViewTable(html);
        for (const r of records) allRecords.push({ date: isoDate, commodityId: id, commodity: name, key: key || name, ...r });
        if (records.length > 0) successDays++;
      } catch (err) { warn(`  ${dateStr}: ${err.message}`); }
      await sleep(DELAY_MS);
    }
    log(`  Historical: ${successDays}/${days - 1} days with data`);
    await sleep(DELAY_MS * 2);
  }
  log(`Total scraped: ${allRecords.length} price points`);
  return allRecords;
}

function loadExisting() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).records || [];
  } catch { return []; }
}

function mergeAndSave(freshRecords, existing) {
  const key = r => `${r.date}|${r.commodity}|${r.city}`;
  const seen = new Set(existing.map(key));
  const added = freshRecords.filter(r => !seen.has(key(r)));
  const merged = [...existing, ...added].sort((a, b) => b.date.localeCompare(a.date) || a.commodity.localeCompare(b.commodity));
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), records: merged }, null, 2), 'utf8');
  log(`Saved ${merged.length} records (+${added.length} new) → ${DATA_FILE}`);
  return merged;
}

// ─── Step 4b: Arrivals scraper ────────────────────────────────────────────────

async function scrapeArrivals(days) {
  log('Scraping AMIS arrival reports…');
  let sessionCookie;
  let vs, vsg, cityCount;

  try {
    const getResp = await axios.get(ARRIVAL_URL, {
      headers: { ...HEADERS, Referer: ARRIVAL_URL },
      timeout: TIMEOUT,
    });
    sessionCookie = (getResp.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');
    const $ = cheerio.load(getResp.data);
    vs  = $('input[name=__VIEWSTATE]').val();
    vsg = $('input[name=__VIEWSTATEGENERATOR]').val();
    cityCount = 0;
    $('input[name*="ctl09$divDropDown"]').each((_, el) => {
      const label = $('label[for="' + $(el).attr('id') + '"]').text().trim();
      if (label && label !== '(Select All)') cityCount++;
    });
    if (!vs || cityCount < 10) throw new Error('Could not parse form state');
    log(`  Arrival form: ${cityCount} cities, ViewState ${vs.length} chars`);
  } catch (err) {
    warn(`Cannot reach AMIS Arrivals: ${err.message}`);
    return [];
  }

  const today  = new Date();
  const dStart = new Date(Date.now() - days * 86_400_000);
  const fmt    = d => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;

  const commIndices = Array.from({ length: 18 }, (_, i) => i).join(',');
  const cityIndices = Array.from({ length: cityCount }, (_, i) => i).join(',');

  const params = new URLSearchParams();
  params.set('__EVENTTARGET', '');  params.set('__EVENTARGUMENT', '');
  params.set('__VIEWSTATE', vs);    params.set('__VIEWSTATEGENERATOR', vsg);
  params.set('ReportViewer1$ctl03$ctl00', ''); params.set('ReportViewer1$ctl03$ctl01', '');
  params.set('ReportViewer1$isReportViewerInVs', '');
  params.set('ReportViewer1$ctl14', ''); params.set('ReportViewer1$ctl15', '');
  params.set('ReportViewer1$AsyncWait$HiddenCancelField', 'False');
  params.set('ReportViewer1$ctl08$ctl03$txtValue', fmt(dStart));
  params.set('ReportViewer1$ctl08$ctl05$txtValue', fmt(today));
  params.set('ReportViewer1$ctl08$ctl07$txtValue', 'Select All');
  params.set('ReportViewer1$ctl08$ctl07$divDropDown$ctl00', 'on');
  for (let i = 2; i <= 19; i++) params.set(`ReportViewer1$ctl08$ctl07$divDropDown$ctl${String(i).padStart(2,'0')}`, 'on');
  params.set('ReportViewer1$ctl08$ctl07$divDropDown$ctl01$HiddenIndices', commIndices);
  params.set('ReportViewer1$ctl08$ctl09$txtValue', 'Select All');
  params.set('ReportViewer1$ctl08$ctl09$divDropDown$ctl00', 'on');
  for (let i = 2; i <= cityCount + 1; i++) params.set(`ReportViewer1$ctl08$ctl09$divDropDown$ctl${i}`, 'on');
  params.set('ReportViewer1$ctl08$ctl09$divDropDown$ctl01$HiddenIndices', cityIndices);
  params.set('ReportViewer1$ctl08$ctl00', 'View Report');
  params.set('ReportViewer1$ToggleParam$store', ''); params.set('ReportViewer1$ToggleParam$collapse', 'false');
  params.set('ReportViewer1$ctl12$ClientClickedId', '');
  params.set('ReportViewer1$ctl11$store', ''); params.set('ReportViewer1$ctl11$collapse', 'false');
  params.set('ReportViewer1$ctl13$VisibilityState$ctl00', 'None');
  params.set('ReportViewer1$ctl13$ScrollPosition', '');
  params.set('ReportViewer1$ctl13$ReportControl$ctl02', ''); params.set('ReportViewer1$ctl13$ReportControl$ctl03', '');
  params.set('ReportViewer1$ctl13$ReportControl$ctl04', '100');

  let reportSession, controlId;
  try {
    const postResp = await axios.post(ARRIVAL_URL, params.toString(), {
      headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookie, Referer: ARRIVAL_URL },
      timeout: 30_000,
    });
    const rsMatch = postResp.data.match(/ReportSession=([a-z0-9]+)/);
    const ciMatch = postResp.data.match(/ControlID=([a-f0-9]+)/);
    reportSession = rsMatch?.[1];
    controlId     = ciMatch?.[1];
    if (!reportSession) throw new Error('No ReportSession in POST response');
    log(`  ReportSession: ${reportSession}`);
  } catch (err) {
    warn(`Arrival POST failed: ${err.message}`);
    return [];
  }

  const csvUrl = `${BASE_URL}/Reserved.ReportViewerWebControl.axd?ReportSession=${reportSession}&Culture=1033&CultureOverrides=True&UICulture=1033&UICultureOverrides=True&ReportStack=1&ControlID=${controlId}&OpType=Export&FileName=DatewiseArrival&ContentDisposition=OnlyHtmlInline&Format=CSV`;

  try {
    const csvResp = await axios.get(csvUrl, {
      headers: { ...HEADERS, Cookie: sessionCookie, Referer: ARRIVAL_URL },
      timeout: 60_000,
    });
    const lines = csvResp.data.split('\n').filter(l => l.trim());
    const records = [];
    for (const line of lines.slice(1)) {       // skip header
      const [city, dateRaw, commodity, qtyRaw] = line.split(',');
      if (!city || !dateRaw || !commodity) continue;
      const qty = parseInt(qtyRaw || '0');
      // Convert MM/DD/YYYY → YYYY-MM-DD
      const [mm, dd, yyyy] = dateRaw.trim().split('/');
      if (!yyyy) continue;
      const date = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
      records.push({ date, city: city.trim(), commodity: commodity.trim(), qty });
    }
    log(`  Arrivals scraped: ${records.length} records (${lines.length - 1} raw rows)`);
    return records;
  } catch (err) {
    warn(`Arrival CSV export failed: ${err.message}`);
    return [];
  }
}

function loadExistingArrivals() {
  try {
    if (!fs.existsSync(ARRIVAL_FILE)) return [];
    return JSON.parse(fs.readFileSync(ARRIVAL_FILE, 'utf8')).records || [];
  } catch { return []; }
}

function mergeAndSaveArrivals(freshRecords, existing) {
  const key = r => `${r.date}|${r.commodity}|${r.city}`;
  const seen = new Set(existing.map(key));
  const added = freshRecords.filter(r => !seen.has(key(r)));
  const merged = [...existing, ...added].sort((a, b) => b.date.localeCompare(a.date));
  const dir = path.dirname(ARRIVAL_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ARRIVAL_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), records: merged }, null, 2), 'utf8');
  log(`Arrivals saved ${merged.length} records (+${added.length} new) → ${ARRIVAL_FILE}`);
  return merged;
}

// ─── Step 4c: Daily Rate Upload Time scraper ──────────────────────────────────

async function scrapeRateStats() {
  log('Scraping rate upload times…');
  try {
    const r = await axios.get(RATE_STATS_URL, { headers: HEADERS, timeout: TIMEOUT });
    const $ = cheerio.load(r.data);
    const today = new Date().toISOString().slice(0, 10);
    const uploadTimes = [];
    $('#ctl00_cphPage_GridView1 tr').slice(1).each((i, row) => {
      const cells = $(row).find('td').map((j, c) => $(c).text().trim()).get();
      if (cells.length < 3) return;
      const city = cells[1].trim();
      // "02 Jun 2026 08:32:20" → extract "HH:MM"
      const m = cells[2].match(/(\d{2}:\d{2}):\d{2}\s*$/);
      if (!m) return;
      uploadTimes.push({ city, time: m[1] });
    });
    log(`  Upload times scraped: ${uploadTimes.length} cities`);
    return { date: today, uploadTimes };
  } catch (err) {
    warn(`Rate stats scrape failed: ${err.message}`);
    return null;
  }
}

function loadUploadTimes() {
  try {
    if (!fs.existsSync(UPLOAD_FILE)) return null;
    return JSON.parse(fs.readFileSync(UPLOAD_FILE, 'utf8'));
  } catch { return null; }
}

function saveUploadTimes(data) {
  const dir = path.dirname(UPLOAD_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(UPLOAD_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), ...data }, null, 2), 'utf8');
  return data;
}

// ─── Step 4d: Daily Market Changes scraper ────────────────────────────────────

async function scrapeDailyChanges() {
  log('Scraping daily market changes…');
  try {
    const r = await axios.get(CHANGES_URL, { headers: HEADERS, timeout: TIMEOUT });
    const $ = cheerio.load(r.data);
    const today = new Date().toISOString().slice(0, 10);
    const records = [];
    $('#ctl00_cphPage_GridView1 tr').slice(1).each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length < 5) return;
      const city      = $(cells[0]).text().trim();
      const commodity = $(cells[1]).text().trim();
      const todayP    = parseInt($(cells[2]).text().trim()) || 0;
      const yesterP   = parseInt($(cells[3]).text().trim()) || 0;
      const change    = parseInt($(cells[4]).text().trim()) || 0;
      const img       = $(cells[5]).find('img').attr('src') || '';
      const dir       = img.includes('green-up') ? 'up' : img.includes('red-down') ? 'down' : 'flat';
      if (!city || !commodity || !todayP) return;
      records.push({ city, commodity, today: todayP, yesterday: yesterP, change, dir });
    });
    log(`  Daily changes scraped: ${records.length} rows`);
    return { date: today, records };
  } catch (err) {
    warn(`Daily changes scrape failed: ${err.message}`);
    return null;
  }
}

function loadDailyChanges() {
  try {
    if (!fs.existsSync(CHANGES_FILE)) return null;
    return JSON.parse(fs.readFileSync(CHANGES_FILE, 'utf8'));
  } catch { return null; }
}

function saveDailyChanges(data) {
  const dir = path.dirname(CHANGES_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CHANGES_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), ...data }, null, 2), 'utf8');
  return data;
}

// ─── Step 5: Generate interactive planner HTML ────────────────────────────────

function generatePlannerHtml(records, arrivalRecords, uploadData, changesData) {
  const priceMap = {};
  const citySet  = new Set();
  for (const r of records) {
    if (!r.commodity || !r.city || !r.fqp) continue;
    citySet.add(r.city);
    if (!priceMap[r.commodity]) priceMap[r.commodity] = {};
    if (!priceMap[r.commodity][r.city]) priceMap[r.commodity][r.city] = [];
    priceMap[r.commodity][r.city].push({ date: r.date, p: r.fqp, min: r.min||null, max: r.max||null });
  }
  for (const cm of Object.values(priceMap)) {
    for (const arr of Object.values(cm)) {
      const seen = {};
      for (const pt of arr) seen[pt.date] = pt;
      arr.length = 0;
      arr.push(...Object.values(seen).sort((a,b) => a.date.localeCompare(b.date)));
    }
  }
  // ── Cross-city outlier filter ────────────────────────────────────────────────
  // For each commodity × date, compute peer median across all cities.
  // Flag records where fqp > 5× median or < 0.2× median — these are almost always
  // reporter data-entry errors (extra/missing zero, e.g. ₨670 instead of ₨67).
  // Require ≥4 peer cities so thin-market commodities aren't over-flagged.
  let nFlagged = 0;
  {
    // Build peer index: 'comm|date' → [fqp, ...]
    const peer = {};
    for (const [comm, cities] of Object.entries(priceMap))
      for (const pts of Object.values(cities))
        for (const pt of pts) {
          const k = comm + '|' + pt.date;
          (peer[k] = peer[k] || []).push(pt.p);
        }
    // Compute medians
    const med = {};
    for (const [k, arr] of Object.entries(peer)) {
      if (arr.length < 4) continue;
      arr.sort((a, b) => a - b);
      const m = Math.floor(arr.length / 2);
      med[k] = arr.length % 2 ? arr[m] : (arr[m-1] + arr[m]) / 2;
    }
    // Stamp outliers
    for (const [comm, cities] of Object.entries(priceMap))
      for (const pts of Object.values(cities))
        for (const pt of pts) {
          const m = med[comm + '|' + pt.date];
          if (m && (pt.p > m * 5 || pt.p < m * 0.2)) { pt.flagged = true; nFlagged++; }
        }
    if (nFlagged) console.log(`[build] Cross-city outlier filter: ${nFlagged} suspect prices flagged`);
  }

  const commodities = Object.keys(priceMap).sort();
  const cities      = [...citySet].sort();

  // ── Track Record: top daily picks vs next-day actuals (last 60 days) ──────────
  const trackRecord = (() => {
    // Build fast date-indexed lookup (skip flagged)
    const idx = {};
    for (const [comm, citiesMap] of Object.entries(priceMap)) {
      idx[comm] = {};
      for (const [city, pts] of Object.entries(citiesMap)) {
        idx[comm][city] = {};
        for (const pt of pts) if (!pt.flagged) idx[comm][city][pt.date] = pt;
      }
    }
    // Sorted unique dates
    const allD = [...new Set(Object.values(priceMap).flatMap(cm => Object.values(cm).flatMap(pts => pts.map(p => p.date))))].sort();
    const cutoff = new Date(Date.now() - 60 * 86400000).toISOString().slice(0,10);
    const picks = [];
    for (let di = 0; di < allD.length - 1; di++) {
      const date = allD[di];
      if (date < cutoff) continue;
      const nextDate = allD[di + 1];
      if ((new Date(nextDate) - new Date(date)) > 3 * 86400000) continue; // skip big gaps
      const routes = [];
      for (const comm of commodities) {
        const cm = idx[comm] || {};
        const activeCities = Object.keys(cm).filter(c => cm[c][date]);
        for (const buyCity of activeCities) {
          const buyP = cm[buyCity][date].p;
          for (const sellCity of activeCities) {
            if (buyCity === sellCity) continue;
            const sellP = cm[sellCity][date].p;
            const spPct = (sellP - buyP) / buyP * 100;
            if (spPct < 5) continue;
            routes.push({ comm, buyCity, sellCity, buyP, predictedSellP: sellP, spPct });
          }
        }
      }
      // Top 8 by spread, deduplicated
      routes.sort((a, b) => b.spPct - a.spPct);
      const seen = new Set(); let count = 0;
      for (const r of routes) {
        if (count >= 8) break;
        const key = r.comm + '|' + r.buyCity + '|' + r.sellCity;
        if (seen.has(key)) continue;
        seen.add(key); count++;
        const nxt = idx[r.comm]?.[r.sellCity]?.[nextDate];
        if (!nxt) continue;
        const predictedNet = r.predictedSellP - r.buyP;
        const actualNet    = nxt.p - r.buyP;
        picks.push({ date, nextDate, comm: r.comm, buyCity: r.buyCity, sellCity: r.sellCity,
          buyP: r.buyP, predictedSellP: r.predictedSellP, actualSellP: nxt.p,
          predictedNet, actualNet, spPct: Math.round(r.spPct * 10) / 10 });
      }
    }
    return picks;
  })();
  console.log(`[build] Track record: ${trackRecord.length} pick outcomes computed`);

  const embeddedData = JSON.stringify({ commodities, cities, priceMap, updatedAt: new Date().toISOString(), suspectPrices: nFlagged, trackRecord });
  const embeddedRoad = JSON.stringify(ROAD_KM);

  // Build arrival map: arrivalMap[arrComm][city] = [{date, qty}] (last 30 days only, sorted asc)
  const arrivalMap = {};
  const arrCutoff  = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  for (const r of (arrivalRecords || [])) {
    if (!r.date || !r.city || !r.commodity || r.date < arrCutoff) continue;
    if (!arrivalMap[r.commodity]) arrivalMap[r.commodity] = {};
    if (!arrivalMap[r.commodity][r.city]) arrivalMap[r.commodity][r.city] = [];
    arrivalMap[r.commodity][r.city].push({ date: r.date, qty: r.qty });
  }
  for (const cm of Object.values(arrivalMap)) {
    for (const arr of Object.values(cm)) {
      const seen = {};
      for (const pt of arr) if (!seen[pt.date] || pt.qty > seen[pt.date].qty) seen[pt.date] = pt;
      arr.length = 0;
      arr.push(...Object.values(seen).sort((a, b) => a.date.localeCompare(b.date)));
    }
  }
  const arrivalComms = Object.keys(arrivalMap).sort();
  const embeddedArrivals = JSON.stringify({ arrivalComms, arrivalMap, arrUpdatedAt: new Date().toISOString() });

  // Build live data: upload times + daily changes (today only)
  const todayStr = new Date().toISOString().slice(0, 10);
  // uploadMap: normalised-city-lowercase → "HH:MM"
  const uploadMap = {};
  if (uploadData && uploadData.date === todayStr && uploadData.uploadTimes) {
    for (const { city, time } of uploadData.uploadTimes) uploadMap[city.toLowerCase()] = time;
  }
  // Daily changes records (today only, prices in PKR/100kg)
  const dailyChanges = (changesData && changesData.date === todayStr)
    ? (changesData.records || []) : [];
  const embeddedLive = JSON.stringify({ uploadMap, dailyChanges, liveDate: todayStr,
    uploadUpdatedAt: uploadData?.updatedAt || null,
    changesUpdatedAt: changesData?.updatedAt || null });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pakistan Domestic Arbitrage Planner</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<style>
:root{--green:#01411C;--mid:#2E8B57;--bg:#f1f5f9;--card:#fff;--bdr:#e2e8f0;--txt:#1e293b;--muted:#64748b;--up:#15803d;--dn:#dc2626;--flat:#94a3b8}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--txt);font-size:14px}
a{color:var(--mid)}
header{background:var(--green);color:#fff;padding:14px 24px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
header h1{font-size:1.1em;font-weight:700}
header small{opacity:.75;font-size:.78em;display:block;margin-top:2px}
.hdr-right{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
.hbadge{background:rgba(255,255,255,.18);border-radius:12px;padding:3px 10px;font-size:.75em;font-weight:600}
.tabs{background:var(--green);display:flex;padding:0 20px;gap:2px;overflow-x:auto}
.tab{padding:9px 16px;cursor:pointer;font-size:.82em;font-weight:600;color:rgba(255,255,255,.6);border-bottom:3px solid transparent;transition:.15s;white-space:nowrap}
.tab.active,.tab:hover{color:#fff}.tab.active{border-color:#4ade80}
.panel{display:none}.panel.active{display:block}
.ctr{max-width:1400px;margin:0 auto;padding:16px 14px 56px}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:12px 14px;margin-bottom:14px}
.cg{display:flex;flex-direction:column;gap:4px;min-width:110px}
.cg label{font-size:.7em;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
select,input[type=number],input[type=date]{padding:6px 8px;border:1px solid var(--bdr);border-radius:6px;font-size:.84em;background:#fff;color:var(--txt);width:100%}
select:focus,input:focus{outline:2px solid var(--mid);outline-offset:1px}
.btn{padding:7px 16px;background:var(--green);color:#fff;border:none;border-radius:6px;font-weight:700;font-size:.84em;cursor:pointer;white-space:nowrap;align-self:flex-end}
.btn:hover{background:var(--mid)}
.btn2{padding:6px 14px;background:#e2e8f0;color:var(--txt);border:none;border-radius:6px;font-weight:600;font-size:.82em;cursor:pointer;align-self:flex-end}
.btn2:hover{background:#cbd5e1}
.btn-wa{padding:5px 10px;background:#25d366;color:#fff;border:none;border-radius:5px;font-size:.75em;font-weight:700;cursor:pointer}
.btn-wa:hover{background:#128c7e}
.btn-csv{padding:7px 14px;background:#0ea5e9;color:#fff;border:none;border-radius:6px;font-size:.82em;font-weight:700;cursor:pointer;align-self:flex-end}
.btn-csv:hover{background:#0284c7}
.qwin{display:flex;gap:4px;flex-wrap:wrap;align-self:flex-end}
.qwin button{padding:5px 10px;border:1px solid var(--bdr);background:#fff;border-radius:5px;font-size:.78em;cursor:pointer;font-weight:600}
.qwin button.on{background:var(--green);color:#fff;border-color:var(--green)}
.tw{overflow-x:auto;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:18px}
table{width:100%;border-collapse:collapse;background:var(--card);font-size:.82em}
thead{background:var(--green);color:#fff}
th{padding:9px 10px;text-align:left;font-size:.73em;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;cursor:pointer;user-select:none}
th:hover{background:var(--mid)}
tbody tr{border-bottom:1px solid var(--bdr)}
tbody tr:hover{background:#f8fafc}
td{padding:7px 10px;vertical-align:middle}
.chip{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.7em;font-weight:700;white-space:nowrap}
.go{background:#dcfce7;color:#15803d}.marg{background:#fef9c3;color:#854d0e}
.no{background:#fee2e2;color:#991b1b}.uk{background:#f1f5f9;color:#475569}
.con-h{background:#dcfce7;color:#166534}.con-m{background:#fef9c3;color:#92400e}.con-l{background:#fee2e2;color:#991b1b}
.pill{display:inline-block;background:#dbeafe;color:#1e3a8a;border-radius:4px;padding:1px 7px;font-size:.8em;font-weight:700;white-space:nowrap}
.pill-g{background:#dcfce7;color:#15803d}
.sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-bottom:16px}
.sb{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:12px 14px;position:relative}
.sb-lbl{font-size:.68em;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:700;padding-right:38px}
.sb-val{font-size:1.45em;font-weight:800;color:var(--green);margin-top:3px;line-height:1.1}
.sb-unit{font-size:.62em;font-weight:400;color:var(--muted)}
.sb-sub{font-size:.71em;color:var(--muted);margin-top:2px}
.tr-badge{position:absolute;top:10px;right:10px;font-size:.88em;font-weight:800}
.t-up{color:var(--up)}.t-dn{color:var(--dn)}.t-fl{color:var(--flat)}
.vol-b{display:inline-block;padding:2px 7px;border-radius:4px;font-size:.64em;font-weight:700;margin-top:4px}
.vol-h{background:#fee2e2;color:#991b1b}.vol-m{background:#fef9c3;color:#854d0e}.vol-s{background:#dcfce7;color:#15803d}
.chart-box{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:14px;margin-bottom:14px}
.chart-box h4{font-size:.8em;font-weight:700;color:var(--green);margin-bottom:10px}
.sec{font-size:.72em;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.07em;margin:20px 0 10px;padding-bottom:5px;border-bottom:2px solid var(--mid)}
.cp-wrap{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:16px;margin-bottom:14px}
.cp-row{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px}
.cp-city{flex:1;min-width:140px}
.cp-city label{font-size:.7em;font-weight:700;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:4px}
.cp-city select{font-size:1em;padding:8px;font-weight:700;border:2px solid var(--mid);border-radius:8px;background:#fff;width:100%}
.cp-vs{font-size:1.5em;color:var(--muted);font-weight:200;padding-bottom:4px}
.cp-meta{font-size:.8em;color:var(--muted);background:#f8fafc;border-radius:6px;padding:8px 12px;display:flex;gap:16px;flex-wrap:wrap}
.cp-meta strong{color:var(--txt)}
.card{background:var(--card);border:1px solid var(--bdr);border-radius:8px;padding:14px;margin-bottom:14px}
.card h3{font-size:.88em;font-weight:700;color:var(--green);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--bdr);display:flex;justify-content:space-between;align-items:center}
.rr{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid #f1f5f9}
.rr:last-child{border:none}
.rr .l{color:var(--muted);font-size:.84em}.rr .v{font-weight:600;font-size:.84em;text-align:right}
.res{background:#f8fafc;border:1px solid var(--bdr);border-radius:6px;padding:12px;margin-top:10px}
.pos{color:#15803d;font-weight:700}.neg{color:#dc2626;font-weight:700}.big{font-size:1.1em}
.optrow{display:grid;grid-template-columns:32px 1fr auto auto;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--bdr);background:var(--card)}
.optrow:last-child{border:none}
.orank{font-size:1.1em;font-weight:800;color:var(--muted)}.odesc{font-size:.82em;line-height:1.5}
.oprofit{font-weight:700;font-size:.95em;text-align:right;white-space:nowrap}
.note{font-size:.75em;color:var(--muted);background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:8px 12px;margin-bottom:14px;line-height:1.6}
</style>
</head>
<body>
<header>
  <div>
    <h1>🚚 Pakistan Domestic Arbitrage Planner</h1>
    <small>AMIS.pk wholesale mandi prices · <a href="http://www.amis.pk/BrowsePrices.aspx?searchType=0" target="_blank" style="color:#86efac">amis.pk ↗</a> · All prices <strong style="color:#fff">₨/kg</strong></small>
  </div>
  <div class="hdr-right">
    <span class="hbadge" id="hbRecords">—</span>
    <span class="hbadge" id="hbCities">—</span>
    <span class="hbadge" id="hbComm">—</span>
    <span class="hbadge" id="hbDate">—</span>
    <span class="hbadge" id="hbUpload" style="display:none">—</span>
    <span class="hbadge" id="hbFlagged" style="display:none;background:#7f1d1d;color:#fca5a5">—</span>
  </div>
</header>
<!-- GLOBAL TRUCK SELECTOR -->
<div style="background:#1e293b;border-bottom:1px solid #334155;padding:6px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:.85em">
  <span style="color:#94a3b8;font-weight:600;white-space:nowrap">🚛 Vehicle:</span>
  <select id="gTruck" onchange="setTruck()" style="padding:3px 8px;border-radius:5px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:.9em">
    <option value="shehzore">Shehzore 1.3t — ₨4.00/100kg·km</option>
    <option value="mazda_t3">Mazda T3500 2t — ₨3.34/100kg·km</option>
    <option value="mazda_20">Mazda 20ft 4.5t — ₨1.67/100kg·km</option>
    <option value="bedford">Bedford 9t — ₨0.90/100kg·km</option>
    <option value="custom">Custom rate…</option>
  </select>
  <span id="gCustomRate" style="display:none;align-items:center;gap:4px">
    <label style="color:#94a3b8">₨/100kg·km:</label>
    <input type="number" id="gCustomRateVal" value="9.93" step="0.01" min="0.1" onchange="setTruck()" style="width:70px;padding:3px 6px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0">
  </span>
  <span id="gCustomPayload" style="display:none;align-items:center;gap:4px">
    <label style="color:#94a3b8">Payload t:</label>
    <input type="number" id="gCustomPayloadVal" value="1.3" step="0.1" min="0.1" onchange="setTruck()" style="width:60px;padding:3px 6px;border-radius:4px;border:1px solid #475569;background:#0f172a;color:#e2e8f0">
  </span>
  <span id="gTruckInfo" style="color:#4ade80;font-weight:600">₨4.00/100kg·km</span>
  <span style="color:#64748b;font-size:.8em">· Fuel only + 20% levy &nbsp;|&nbsp; Shehzore: ₨390÷9km/l=₨43.3/km ÷ 1,300kg × 100 × 1.20 = ₨4.00</span>
</div>
<div class="tabs">
  <div class="tab active" onclick="tab('prices')">📍 Prices</div>
  <div class="tab"        onclick="tab('pair')">🏙️ City Pair</div>
  <div class="tab"        onclick="tab('arb')">⚖️ Arbitrage</div>
  <div class="tab"        onclick="tab('route')">🚛 Route Planner</div>
  <div class="tab"        onclick="tab('whatif')">🔮 What-If</div>
  <div class="tab"        onclick="tab('brief')" style="background:#166534;color:#fff">📊 Briefing</div>
  <div class="tab"        onclick="tab('paper')" style="background:#1e3a5f;color:#fff">📜 Paper Trade</div>
  <div class="tab"        onclick="tab('track')" style="background:#3b0764;color:#fff">🎯 Track Record</div>
</div>

<!-- PRICES -->
<div id="p-prices" class="panel active"><div class="ctr">
  <div class="bar">
    <div class="cg" style="min-width:170px"><label>City</label>
      <select id="pCity" onchange="renderPrices()"><option value="all">All cities</option></select></div>
    <div class="cg" style="min-width:190px"><label>Commodity</label><select id="pComm" onchange="renderPrices()"></select></div>
    <div class="cg"><label>From</label><input type="date" id="pFrom" onchange="renderPrices()"></div>
    <div class="cg"><label>To</label>  <input type="date" id="pTo"   onchange="renderPrices()"></div>
    <div class="cg"><label>Quick</label>
      <div class="qwin">
        <button id="qw7"  onclick="setWin(7)">7d</button>
        <button id="qw30" onclick="setWin(30)" class="on">30d</button>
        <button id="qw60" onclick="setWin(60)">60d</button>
        <button id="qwA"  onclick="setWin(0)">All</button>
      </div></div>
    <div class="cg"><label>Sort</label>
      <select id="pSort" onchange="renderPrices()">
        <option value="def">Default</option>
        <option value="asc">Range ↑ narrowest</option>
        <option value="desc">Range ↓ widest</option>
        <option value="fresh">Freshest first</option>
      </select></div>
    <div class="cg"><label>Max age</label>
      <select id="pMaxAge" onchange="renderPrices()">
        <option value="99">Show all</option>
        <option value="1">Today only</option>
        <option value="2">≤ 2d old</option>
        <option value="3">≤ 3d old</option>
        <option value="5">≤ 5d old</option>
      </select></div>
    <button class="btn-csv" onclick="downloadCsv()">⬇ Excel</button>
  </div>
  <div id="pStats" class="sg"></div>
  <div class="chart-box"><h4 id="chartTitle">Price trend (₨/kg)</h4><canvas id="priceChart" height="160"></canvas></div>
  <div class="sec">Price table — FQP in ₨/kg</div>
  <div class="tw" id="pTable"></div>
</div></div>

<!-- CITY PAIR -->
<div id="p-pair" class="panel"><div class="ctr">
  <div class="cp-wrap">
    <div style="display:flex;gap:6px;margin-bottom:10px">
      <button id="modePair" class="btn" onclick="setCpMode('pair')">⇄ City Pair</button>
      <button id="mode1c"   class="btn2" onclick="setCpMode('1city')">📥 1-City</button>
    </div>
    <div class="cp-row">
      <div class="cp-city"><label id="cpALbl">City A</label><select id="cpA" onchange="renderPair()"></select></div>
      <div class="cp-vs" id="cpVs">⇄</div>
      <div class="cp-city" id="cpCityBBox"><label>City B</label><select id="cpB" onchange="renderPair()"></select></div>
      <div class="cg" id="cpDirBox" style="display:none"><label>Direction</label>
        <select id="cpDir" onchange="renderPair()">
          <option value="import">📥 Import into city</option>
          <option value="export">📦 Export from city</option>
        </select></div>
      <div class="cg" style="min-width:100px"><label>Window</label>
        <select id="cpDays" onchange="renderPair()">
          <option value="7">7d</option><option value="14">14d</option>
          <option value="30" selected>30d</option><option value="60">60d</option><option value="0">All</option>
        </select></div>
      <div class="cg" style="min-width:75px"><label>Tons</label>
        <input type="number" id="cpTons" value="5" min="1" step="0.5" onchange="renderPair()"></div>
    </div>
    <div class="cp-meta" id="cpMeta">Select two cities above.</div>
  </div>
  <!-- Pair mode output -->
  <div id="pairSections">
    <div class="sec" id="secAB">A → B</div>
    <div class="tw" id="cpTblAB"></div>
    <div class="sec" id="secBA">B → A</div>
    <div class="tw" id="cpTblBA"></div>
    <div class="sec">⚡ Best Round Trips — Top 10</div>
    <div style="border:1px solid var(--bdr);border-radius:8px;overflow:hidden;background:var(--card)" id="cpOpt">
      <p style="padding:16px;color:var(--muted)">Set both cities to see round-trip combinations.</p>
    </div>
  </div>
  <!-- 1-City mode output -->
  <div id="oneCitySection" style="display:none">
    <div class="sec" id="sec1c">Best imports</div>
    <div class="tw" id="cp1Tbl"></div>
  </div>
</div></div>

<!-- ARBITRAGE -->
<div id="p-arb" class="panel"><div class="ctr">
  <div class="note">
    <strong>Spread</strong> = sell price − buy price (₨/kg, avg over window). &nbsp;
    <strong>Truck/kg</strong> = distance × rate set by the 🚛 Vehicle selector above (PKR/100kg). &nbsp;
    <strong>Net/kg</strong> = Spread − Truck cost. &nbsp;
    <strong>Max viable km</strong> = Spread ÷ truck rate — how far you could go before profit hits zero. Higher = safer trade. &nbsp;
    <strong>Consistent</strong> = % of days in window where both cities had prices AND the spread beat truck cost — only counts days with matching data on both sides, so stale cities (shown as <em>Xd old</em>) may have fewer matching days than fresh ones. &nbsp;
    Click column headers to sort.
  </div>
  <div class="bar">
    <div class="cg" style="min-width:190px"><label>Commodity</label>
      <select id="aComm" onchange="renderArb()"><option value="all">— All —</option></select></div>
    <div class="cg"><label>Window</label>
      <select id="aDays" onchange="renderArb()">
        <option value="7">7d</option><option value="14">14d</option>
        <option value="30" selected>30d</option><option value="60">60d</option><option value="0">All</option>
      </select></div>
    <div class="cg"><label>Min spread %</label>
      <input type="number" id="aMinPct" value="10" min="0" style="width:80px" onchange="renderArb()"></div>
    <div class="cg"><label>Show</label>
      <select id="aFilt" onchange="renderArb()">
        <option value="profitable">✅ Profitable (known)</option>
        <option value="known">Known routes (all)</option>
        <option value="all">All (incl. unknown dist)</option>
      </select></div>
    <div class="cg"><label title="How many of the last X days was this route profitable? Confirms one-off vs sustained opportunity.">Verify last</label>
      <select id="aVerify" onchange="renderArb()" style="cursor:help">
        <option value="3">3 days</option>
        <option value="7" selected>7 days</option>
        <option value="14">14 days</option>
        <option value="0">Off</option>
      </select></div>
  </div>
  <div id="aStats" class="sg"></div>
  <div class="tw" id="aTable"></div>
</div></div>

<!-- ROUTE PLANNER -->
<div id="p-route" class="panel"><div class="ctr">
  <div class="note">All fuel/cost inputs optional. Distance auto-fills. <strong>Optimize</strong> ranks best outbound + return combo.</div>
  <div class="card">
    <h3>🗺️ Route &amp; Vehicle</h3>
    <div class="bar" style="margin-bottom:10px">
      <div class="cg" style="min-width:150px"><label>From</label><select id="rFrom" onchange="autoFillDist()"></select></div>
      <div class="cg" style="min-width:150px"><label>To</label>  <select id="rTo"   onchange="autoFillDist()"></select></div>
      <div class="cg"><label>Dist km</label><input type="number" id="rDist" min="1" style="width:80px"></div>
      <div class="cg"><label>Diesel ₨/L</label><input type="number" id="rFuel" value="295" style="width:80px"></div>
      <div class="cg"><label>km/litre</label><input type="number" id="rKml" value="8" step="0.5" style="width:70px"></div>
      <div class="cg"><label>Tons</label><input type="number" id="rTons" value="5" step="0.5" style="width:70px"></div>
      <div class="cg"><label>Driver ₨</label><input type="number" id="rDriver" value="3000" style="width:90px"></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" onclick="calcRoute()">Calculate Costs</button>
      <button class="btn2" onclick="optimize()">⚡ Optimize Round Trip</button>
    </div>
    <div id="rDistInfo" style="margin-top:8px;font-size:.78em;color:var(--muted)"></div>
    <div id="rCostBox" class="res" style="display:none"></div>
  </div>
  <div class="card">
    <h3>📦 Specific Commodity P&amp;L</h3>
    <div class="bar" style="margin-bottom:10px">
      <div class="cg" style="min-width:170px"><label>Outbound commodity</label><select id="rCOut"></select></div>
      <div class="cg" style="min-width:170px"><label>Return commodity</label><select id="rCRet"><option value="">— empty return —</option></select></div>
      <div class="cg"><label>Window</label>
        <select id="rPDays"><option value="7">7d</option><option value="14">14d</option><option value="30" selected>30d</option></select></div>
    </div>
    <button class="btn" onclick="calcPnl()">Calculate P&amp;L</button>
    <div id="rPnlBox" class="res" style="display:none"></div>
  </div>
  <div class="card" id="optCard" style="display:none">
    <h3>⚡ Round-Trip Optimizer — Top 10
      <button class="btn-wa" onclick="copyOptWa()">📲 WhatsApp</button>
    </h3>
    <p id="optMeta" style="font-size:.78em;color:var(--muted);margin-bottom:8px"></p>
    <div id="optRows" style="border:1px solid var(--bdr);border-radius:8px;overflow:hidden"></div>
  </div>
</div></div>

<!-- WHAT-IF -->
<div id="p-whatif" class="panel"><div class="ctr">
  <div class="note">Manual scenario — enter any numbers to test a deal. Buy/sell in ₨/kg. All other fields optional.</div>
  <div class="card"><h3>🔮 Scenario Calculator</h3>
    <div class="bar">
      <div class="cg"><label>Buy ₨/kg</label><input type="number" id="wiBuy"  step="0.1" oninput="calcWI()"></div>
      <div class="cg"><label>Sell ₨/kg</label><input type="number" id="wiSell" step="0.1" oninput="calcWI()"></div>
      <div class="cg"><label>Tons</label><input type="number" id="wiQty" value="5" step="0.5" oninput="calcWI()"></div>
      <div class="cg"><label>Distance km</label><input type="number" id="wiDist" oninput="calcWI()"></div>
      <div class="cg"><label>Diesel ₨/L</label><input type="number" id="wiFuel" value="295" oninput="calcWI()"></div>
      <div class="cg"><label>km/litre</label><input type="number" id="wiKml" value="8" step="0.5" oninput="calcWI()"></div>
      <div class="cg"><label>Other costs ₨</label><input type="number" id="wiExtra" value="3000" oninput="calcWI()"></div>
      <div class="cg"><label>Legs</label>
        <select id="wiRt" onchange="calcWI()">
          <option value="1">One-way</option>
          <option value="2">Round-trip fuel</option>
        </select></div>
    </div>
    <div id="wiResult" class="res"><p style="color:var(--muted);text-align:center">Enter buy and sell prices above.</p></div>
  </div>
  <div class="card"><h3>📊 Historical city-pair spread</h3>
    <div class="bar" style="margin-bottom:10px">
      <div class="cg" style="min-width:170px"><label>Commodity</label><select id="wiComm" onchange="renderWiHist()"></select></div>
      <div class="cg" style="min-width:130px"><label>Buy city</label><select id="wiFrom" onchange="renderWiHist()"></select></div>
      <div class="cg" style="min-width:130px"><label>Sell city</label><select id="wiTo"   onchange="renderWiHist()"></select></div>
      <div class="cg"><label>Days</label>
        <select id="wiDays" onchange="renderWiHist()">
          <option value="14">14d</option><option value="30" selected>30d</option>
          <option value="60">60d</option><option value="0">All</option>
        </select></div>
    </div>
    <div class="tw" id="wiHistTbl"></div>
  </div>
</div></div>

<!-- BRIEFING -->
<div id="p-brief" class="panel">
  <div class="ctr">
    <div id="bfContent"><p style="padding:32px;color:var(--muted);text-align:center">Click the 📊 Briefing tab to run analysis.</p></div>
  </div>
</div>

<!-- PAPER TRADE -->
<div id="p-paper" class="panel">
  <div class="ctr">
    <h3 style="margin:16px 0 8px;color:var(--fg)">📜 Paper Trading Simulator</h3>
    <p style="color:var(--muted);font-size:.88em;margin-bottom:12px">Buy at today's spot price in the buy city. Sell at today's sell city spot price. Capital is locked in transit for the settlement period before it can be redeployed. Uses your truck type from the selector above.</p>
    <div class="bar" style="flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <div class="cg"><label>Start Capital (₨)</label><input type="number" id="ptCapital" value="500000" step="50000" style="width:120px"></div>
      <div class="cg"><label>From date</label><input type="date" id="ptFrom" style="width:140px"></div>
      <div class="cg"><label>To date</label><input type="date" id="ptTo" style="width:140px"></div>
      <div class="cg"><label>Trades/day</label>
        <select id="ptTrades">
          <option value="1">1</option>
          <option value="2" selected>2</option>
          <option value="3">3</option>
        </select></div>
      <div class="cg"><label>Min net profit/kg</label><input type="number" id="ptMinNet" value="50" step="10" style="width:80px"></div>
      <div class="cg"><label title="How many days capital is locked while goods are in transit">Transit days</label>
        <select id="ptSellWin">
          <option value="1">1 day</option>
          <option value="2" selected>2 days</option>
          <option value="3">3 days</option>
        </select></div>
      <div class="cg"><label title="How much of your balance to risk each day">Risk mode</label>
        <select id="ptRisk">
          <option value="aggressive">Aggressive — 100% deployed</option>
          <option value="moderate" selected>Moderate — 70% deployed</option>
          <option value="conservative">Conservative — 50% deployed</option>
          <option value="smart">Smart — auto based on confidence</option>
        </select></div>
      <button class="btn" onclick="runPaperTrade()" style="background:#1e3a5f;color:#fff;padding:6px 18px">▶ Run Simulation</button>
    </div>
    <div id="ptSummary"></div>
    <div id="ptChart" style="margin:16px 0"><canvas id="ptEquityChart" height="120"></canvas></div>
    <div id="ptLog"></div>
  </div>
</div>

<!-- TRACK RECORD -->
<div id="p-track" class="panel">
  <div class="ctr">
    <h3 style="margin:16px 0 8px;color:var(--fg)">🎯 Track Record — Did the bot's picks work out?</h3>
    <p style="color:var(--muted);font-size:.88em;margin-bottom:12px">For each day, the top 8 arbitrage spreads are identified. The next day's actual sell price is checked to see if the spread held. No truck costs — pure price movement accuracy.</p>
    <div class="bar" style="flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <div class="cg"><label>Look back</label>
        <select id="trDays" onchange="renderTrackRecord()">
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30" selected>30 days</option>
          <option value="60">60 days</option>
        </select></div>
      <div class="cg"><label>Commodity</label>
        <select id="trComm" onchange="renderTrackRecord()"><option value="all">All</option></select></div>
      <div class="cg"><label>Min spread</label>
        <select id="trMinSp" onchange="renderTrackRecord()">
          <option value="5">≥ 5%</option>
          <option value="10">≥ 10%</option>
          <option value="20">≥ 20%</option>
        </select></div>
    </div>
    <div id="trScoreCards" class="sbs" style="margin-bottom:16px"></div>
    <div id="trTable"></div>
  </div>
</div>

<script>
const D   = ${embeddedData};
const RD  = ${embeddedRoad};
const AR   = ${embeddedArrivals};
const LIVE = ${embeddedLive};
const $    = id => document.getElementById(id);
const esc = s  => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const pkr = n  => n==null?'—':(n<0?'-₨':'₨')+Math.abs(Math.round(n)).toLocaleString();
// Build full distance matrix via Floyd-Warshall so indirect routes (e.g. Jhelum→Lahore→Khanewal) work
const _RDfull=(function(rd){
  const cities=new Set();
  for(const k of Object.keys(rd)){const[a,b]=k.split('|');cities.add(a);cities.add(b);}
  const ca=[...cities],n=ca.length,idx={};
  ca.forEach((c,i)=>idx[c]=i);
  const m=Array.from({length:n},()=>Array(n).fill(Infinity));
  for(let i=0;i<n;i++) m[i][i]=0;
  for(const[k,v] of Object.entries(rd)){const[a,b]=k.split('|');const i=idx[a],j=idx[b];m[i][j]=v;m[j][i]=v;}
  for(let k=0;k<n;k++) for(let i=0;i<n;i++) for(let j=0;j<n;j++)
    if(m[i][k]+m[k][j]<m[i][j]) m[i][j]=m[i][k]+m[k][j];
  const r={};
  for(let i=0;i<n;i++) for(let j=i+1;j<n;j++) if(m[i][j]<Infinity) r[ca[i]+'|'+ca[j]]=m[i][j];
  return r;
})(RD);
const dist=(a,b)=>_RDfull[a+'|'+b]||_RDfull[b+'|'+a]||null;

// ── TRUCK PRESETS ─────────────────────────────────────────────────────────────
// Truck rates: fuel cost per km ÷ payload (kg) × 100, then +20% levy
// Diesel = ₨390/l
// Shehzore: 390÷9km/l=₨43.33/km ÷ 1,300kg × 100 = ₨3.33/100kg·km × 1.20 = ₨4.00
// Mazda T3500: 390÷7km/l=₨55.71/km ÷ 2,000kg × 100 = ₨2.79/100kg·km × 1.20 = ₨3.34
// Mazda 20ft: from route data (Lahore→Karachi ₨75k/1200km/4500kg) = ₨1.39 × 1.20 = ₨1.67
// Bedford: estimated ₨0.75 × 1.20 = ₨0.90
const TRUCKS=[
  {id:'shehzore', label:'Shehzore (1.3t)',  payload:1.3, rate:4.00},
  {id:'mazda_t3',  label:'Mazda T3500 (2t)', payload:2.0, rate:3.34},
  {id:'mazda_20',  label:'Mazda 20ft (4.5t)',payload:4.5, rate:1.67},
  {id:'bedford',   label:'Bedford (9t)',      payload:9.0, rate:0.90},
  {id:'custom',    label:'Custom',            payload:null,rate:null },
];
let _truckRate=4.00;  // default: Shehzore (fuel + 20% levy)
const trk100 = km => Math.round(_truckRate*km);   // PKR/100kg for km distance
const brkKm  = sp => sp>0?Math.round(sp/_truckRate):0; // max km spread covers

function setTruck(){
  const id=$('gTruck').value;
  const t=TRUCKS.find(x=>x.id===id);
  $('gCustomRate').style.display=id==='custom'?'inline-block':'none';
  $('gCustomPayload').style.display=id==='custom'?'inline-block':'none';
  if(id==='custom'){
    _truckRate=parseFloat($('gCustomRateVal').value)||9.93;
    const pl=parseFloat($('gCustomPayloadVal').value)||1.3;
    if($('cpTons'))$('cpTons').value=pl.toFixed(1);
  } else {
    _truckRate=t.rate;
    if(t.payload&&$('cpTons'))$('cpTons').value=t.payload.toFixed(1);
  }
  $('gTruckInfo').textContent='₨'+_truckRate.toFixed(2)+'/100kg·km';
  if(typeof renderArb==='function') renderArb();
  if(typeof renderPair==='function') renderPair();
  if($('p-brief')?.classList.contains('active')) renderBriefing();
}

function avgPx(comm,city,days){
  const s=D.priceMap[comm]?.[city]; if(!s||!s.length) return null;
  const cut=days>0?new Date(Date.now()-days*86400000).toISOString().slice(0,10):'';
  const f=days>0?s.filter(p=>p.date>=cut&&!p.flagged):s.filter(p=>!p.flagged);
  return f.length?f.reduce((a,x)=>a+x.p,0)/f.length:null;
}
function latPx(comm,city){const s=D.priceMap[comm]?.[city];return s&&s.length?s.filter(p=>!p.flagged).at(-1)?.p??null:null;}
function latDate(comm,city){const s=D.priceMap[comm]?.[city];return s&&s.length?s.filter(p=>!p.flagged).at(-1)?.date??null:null;}
const TODAY=new Date().toISOString().slice(0,10);
function ageTag(comm,city){
  const d=latDate(comm,city); if(!d) return '';
  const days=Math.round((new Date(TODAY)-new Date(d))/86400000);
  if(days===0) return '';
  const col=days<=1?'var(--muted)':'var(--dn)';
  // ≤7 days: show "3d old"; older: show actual date "Apr 15" so user doesn't do maths
  const label=days<=7?days+'d old':new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  return \`<br><small style="color:\${col};font-size:.7em">\${label}</small>\`;
}
// Upload time tag — shows "📤 06:37" when city submitted rates today
const _uploadMapNorm={}; // city lowercase → time "HH:MM"
for(const[k,v] of Object.entries(LIVE.uploadMap)) _uploadMapNorm[k.toLowerCase()]=v;
function uploadTime(city){return _uploadMapNorm[city.toLowerCase()]||null;}
function uploadTag(city){
  const t=uploadTime(city); if(!t) return '';
  const[h,m]=t.split(':').map(Number);
  const mins=h*60+m;
  // before 9AM=fresh(green), 9-12=ok(muted), after 12=late(orange)
  const col=mins<9*60?'var(--up)':mins<12*60?'var(--muted)':'#f59e0b';
  return \`<br><small style="color:\${col};font-size:.68em" title="Rate submitted at \${t} today">📤\${t}</small>\`;
}
function oldPx(comm,city,n){
  const s=D.priceMap[comm]?.[city]; if(!s||!s.length) return null;
  const cut=new Date(Date.now()-n*86400000).toISOString().slice(0,10);
  return [...s].reverse().find(p=>p.date<=cut&&!p.flagged)?.p??null;
}
function trend(comm,city){
  const l=latPx(comm,city),o=oldPx(comm,city,7);
  if(l==null||o==null||o===0) return{a:'→',c:'t-fl',p:null};
  const d=(l-o)/o*100;
  return d>5?{a:'↑',c:'t-up',p:d}:d<-5?{a:'↓',c:'t-dn',p:d}:{a:'→',c:'t-fl',p:d};
}
function vol(comm,city,days){
  const s=D.priceMap[comm]?.[city]; if(!s||s.length<4) return null;
  const cut=days>0?new Date(Date.now()-days*86400000).toISOString().slice(0,10):'';
  const f=days>0?s.filter(p=>p.date>=cut):s; if(f.length<4) return null;
  const pr=f.map(p=>p.p),mean=pr.reduce((a,v)=>a+v,0)/pr.length;
  const cv=Math.sqrt(pr.reduce((a,v)=>a+(v-mean)**2,0)/pr.length)/mean*100;
  return cv>20?{b:'HIGH',c:'vol-h',cv}:cv>10?{b:'MOD',c:'vol-m',cv}:{b:'STABLE',c:'vol-s',cv};
}
function conPct(comm,buyC,sellC,days){
  const bd=D.priceMap[comm]?.[buyC]||[],sd=D.priceMap[comm]?.[sellC]||[];
  const cut=days>0?new Date(Date.now()-days*86400000).toISOString().slice(0,10):'';
  const bm={}; for(const p of bd) if(!cut||p.date>=cut) bm[p.date]=p.p;
  const km=dist(buyC,sellC),tk=km?trk100(km):0;
  let tot=0,pr=0;
  for(const p of sd){if(cut&&p.date<cut)continue;const bp=bm[p.date];if(!bp)continue;tot++;if(p.p-bp>tk)pr++;}
  return tot>=3?Math.round(pr/tot*100):null;
}

// Recent confirmation: how many of the last N days was this route profitable after truck cost?
// Returns {hit, total} or null if <1 matching day
function recentCons(comm,buyC,sellC,days){
  const bd=D.priceMap[comm]?.[buyC]||[],sd=D.priceMap[comm]?.[sellC]||[];
  const cut=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
  const bm={}; for(const p of bd) if(p.date>=cut) bm[p.date]=p.p;
  const km=dist(buyC,sellC),tk=km?trk100(km):0;
  let tot=0,pr=0;
  for(const p of sd){if(p.date<cut)continue;const bp=bm[p.date];if(!bp)continue;tot++;if(p.p-bp>tk)pr++;}
  return tot>=1?{hit:pr,total:tot}:null;
}

// Format recent consistency as a coloured badge: "5/7d"
function rcBadge(rc,days){
  if(!rc) return \`<span style="color:var(--muted)">—/\${days}d</span>\`;
  const pct=rc.hit/rc.total;
  const cls=pct>=0.6?'con-h':pct>=0.3?'con-m':'con-l';
  return \`<span class="chip \${cls}">\${rc.hit}/\${rc.total}d</span>\`;
}

// ── Supply / Arrivals ─────────────────────────────────────────────────────────
// Map from AMIS arrival commodity name → price commodity name patterns (lowercase)
const ARR_PRICE_MAP={
  'Tomato':['tomato'],'Potato':['potato fresh','potato store','potato'],
  'Onion':['onion','green onion'],'Apple':['apple (golden)','apple (ammre)','apple golden'],
  'Mango':['mango (sindhri)','mango sindhri','mango (chounsa)','mango chounsa','mango desi','mango saharni'],
  'Chilli(Green)':['green chilli','green chili'],
  'Gram':['gram white (local)','gram pulse'],'Wheat':['wheat'],
  'Rice':['paddy basmati','rice basmati','paddy (irri)','rice (irri)'],
  'Paddy':['paddy basmati','paddy (irri)'],
  'Maize':['maize'],'Banana':['banana'],'Citrus Fruit':['citrus fruit'],
  'Masoor':['masoor'],'Mash':['mash'],'Moong':['moong'],
};
// reverse map: price comm (lowercase) → arrival comm name
const _arrRevMap={};
for(const[ak,pats] of Object.entries(ARR_PRICE_MAP)) for(const p of pats) _arrRevMap[p]=ak;

// Get arrival commodity name for a price commodity name
function arrCommFor(priceComm){ return _arrRevMap[priceComm.toLowerCase()]||null; }

// Recent arrivals for a city+arrComm over last N days (returns {qty7,avg30,level} or null)
function supplyOf(arrComm,city,days7){
  const series=AR.arrivalMap[arrComm]?.[city]; if(!series||!series.length) return null;
  const cut7=new Date(Date.now()-days7*86400000).toISOString().slice(0,10);
  const cut30=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const recent=series.filter(p=>p.date>=cut7);
  const month=series.filter(p=>p.date>=cut30);
  if(!recent.length) return null;
  const qty7=recent.reduce((s,p)=>s+p.qty,0);
  const avg30=month.length?month.reduce((s,p)=>s+p.qty,0)/month.length:qty7/days7;
  // Percentile: compare recent daily avg vs 30d daily avg
  const dailyRecent=qty7/days7, dailyAvg30=avg30;
  const ratio=dailyAvg30>0?dailyRecent/dailyAvg30:1;
  const level=ratio>=1.3?'H':ratio>=0.7?'M':'L';
  return{qty7,dailyRecent:Math.round(dailyRecent),level,ratio:+ratio.toFixed(2)};
}

// Supply badge HTML for a city, for use in arb table (role='buy'|'sell')
function supplyBadge(arrComm,city,role){
  if(!arrComm) return '';
  const s=supplyOf(arrComm,city,7); if(!s) return '';
  // For buy city: HIGH supply = good (cheap/plentiful) → green
  // For sell city: LOW supply = good (scarcity = high sell price) → green
  const good=(role==='buy'?s.level==='H':s.level==='L');
  const ok=(role==='buy'?s.level==='M':s.level==='M');
  const cls=good?'con-h':ok?'':'con-l';
  const icon=s.level==='H'?'↑':s.level==='L'?'↓':'→';
  const label=s.dailyRecent>=1000?(s.dailyRecent/1000).toFixed(1)+'k':s.dailyRecent;
  return \`<br><small class="chip \${cls}" style="font-size:.62em;padding:1px 5px" title="\${s.qty7} Mnd/7d vs avg \${Math.round(s.ratio*100)}% of 30d">\${icon}\${label}Mnd</small>\`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init(){
  const pts=D.commodities.reduce((s,c)=>s+Object.values(D.priceMap[c]||{}).reduce((ss,a)=>ss+a.length,0),0);
  $('hbRecords').textContent=pts.toLocaleString()+' pts';
  $('hbCities').textContent=D.cities.length+' cities';
  $('hbComm').textContent=D.commodities.length+' commodities';
  $('hbDate').textContent='Updated '+D.updatedAt.slice(0,10);
  if(D.suspectPrices>0){
    const hbf=$('hbFlagged');
    if(hbf){hbf.style.display='';hbf.textContent=D.suspectPrices+' suspect prices filtered ⚠️';}
  }
  const upCnt=Object.keys(LIVE.uploadMap).length;
  if(upCnt>0){const hbu=$('hbUpload');hbu.style.display='';hbu.textContent=upCnt+' cities today 📤';}
  const cO=D.commodities.map(c=>\`<option value="\${esc(c)}">\${esc(c)}</option>\`).join('');
  const ctO=D.cities.map(c=>\`<option value="\${esc(c)}">\${esc(c)}</option>\`).join('');
  $('pCity').innerHTML='<option value="all">All cities</option>'+ctO;
  $('pComm').innerHTML='<option value="all">— All commodities —</option>'+cO;
  $('aComm').innerHTML='<option value="all">— All commodities —</option>'+cO;
  $('cpA').innerHTML=ctO; $('cpB').innerHTML=ctO;
  ['rFrom','rTo','wiFrom','wiTo'].forEach(id=>$(id).innerHTML=ctO);
  ['rCOut','wiComm'].forEach(id=>$(id).innerHTML=cO);
  $('rCRet').innerHTML='<option value="">— empty return —</option>'+cO;
  const today=new Date().toISOString().slice(0,10);
  $('pFrom').value=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  $('pTo').value=today;
  if(D.cities.includes('Lahore')){$('rFrom').value='Lahore';$('wiFrom').value='Lahore';$('cpA').value='Lahore';}
  if(D.cities.includes('Rawalpindi')){$('rTo').value='Rawalpindi';$('wiTo').value='Rawalpindi';}
  if(D.cities.includes('Khanewal'))$('cpB').value='Khanewal';
  else if(D.cities.length>1)$('cpB').value=D.cities.find(c=>c!==$('cpA').value)||D.cities[1];
  // Populate Track Record commodity dropdown
  const trComm=$('trComm');
  if(trComm){
    const trComms=[...new Set((D.trackRecord||[]).map(p=>p.comm))].sort();
    trComms.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;trComm.appendChild(o);});
  }
  autoFillDist(); renderPrices(); renderArb(); renderPair(); renderWiHist(); initPtDates();
}

function tab(n){
  const ns=['prices','pair','arb','route','whatif','brief','paper','track'];
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',ns[i]===n));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='p-'+n));
  if(n==='brief') renderBriefing();
  if(n==='track') renderTrackRecord();
}

function setWin(d){
  const today=new Date().toISOString().slice(0,10);
  $('pTo').value=today;
  $('pFrom').value=d>0?new Date(Date.now()-d*86400000).toISOString().slice(0,10):'';
  ['qw7','qw30','qw60','qwA'].forEach((id,i)=>$(id).classList.toggle('on',[7,30,60,0][i]===d));
  renderPrices();
}

// ── PRICES ────────────────────────────────────────────────────────────────────
const CLR=['#01411C','#0ea5e9','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#f97316','#ef4444'];
let _chart=null;

function renderPrices(){
  const comm=$('pComm')?.value,city=$('pCity')?.value;
  const from=$('pFrom')?.value||'',to=$('pTo')?.value||'';
  if(!comm) return;

  // ── ALL COMMODITIES mode ──────────────────────────────────────────────────────
  if(comm==='all'){
    if(city==='all'){
      $('pStats').innerHTML='<p style="padding:10px;color:var(--muted)">Select a specific city to see all commodities.</p>';
      if(_chart){_chart.destroy();_chart=null;}
      $('pTable').innerHTML='';
      return;
    }
    // Scorecards — one per commodity that has data for this city
    const pSort=$('pSort')?.value||'def',pMaxAge=parseInt($('pMaxAge')?.value||'99');
    let commsToShow=D.commodities.filter(cm_name=>{
      const pts=(D.priceMap[cm_name]?.[city]||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to));
      if(!pts.length) return false;
      return pMaxAge>=99||ageD(cm_name,city)<=pMaxAge;
    });
    // Pre-compute price range (max-min) for each commodity — used for sort
    const _wRangeC={};
    for(const c of commsToShow){
      const pts=(D.priceMap[c]?.[city]||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to));
      if(!pts.length){_wRangeC[c]=0;continue;}
      const pr=pts.map(p=>p.p);
      _wRangeC[c]=Math.max(...pr)-Math.min(...pr);
    }
    if(pSort==='asc') commsToShow.sort((a,b)=>(_wRangeC[a]||0)-(_wRangeC[b]||0));
    else if(pSort==='desc') commsToShow.sort((a,b)=>(_wRangeC[b]||0)-(_wRangeC[a]||0));
    else if(pSort==='fresh') commsToShow.sort((a,b)=>ageD(a,city)-ageD(b,city));
    $('pStats').innerHTML=commsToShow.map((cm_name,i)=>{
      const pts=(D.priceMap[cm_name]?.[city]||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to));
      const pr=pts.map(p=>p.p),avg=pr.reduce((s,v)=>s+v,0)/pr.length;
      const wmn=Math.min(...pr),wmx=Math.max(...pr);
      // Latest reading's daily low/high (AMIS reports a range per day)
      const latPt=pts[pts.length-1];
      const latLo=latPt?.min??latPt?.p,latHi=latPt?.max??latPt?.p;
      const tr=trend(cm_name,city),vl=vol(cm_name,city,0);
      const ts=tr.p!=null?\`\${tr.a} \${Math.abs(tr.p).toFixed(1)}%\`:tr.a;
      const vs=vl?\`<span class="vol-b \${vl.c}">\${vl.b}</span>\`:'';
      return \`<div class="sb" style="border-left:3px solid \${CLR[i%CLR.length]}">
        <div class="sb-lbl">\${esc(cm_name)}\${ageTag(cm_name,city)}\${uploadTag(city)}</div>
        <span class="tr-badge \${tr.c}">\${ts}</span>
        <div class="sb-val">\${latLo===latHi?'₨'+(latLo/100).toFixed(2):'₨'+(latLo/100).toFixed(2)+' – ₨'+(latHi/100).toFixed(2)}</div>
        <div class="sb-sub">avg ₨\${(avg/100).toFixed(2)} /kg\${wmn<wmx?' · window ₨'+(wmn/100).toFixed(0)+'–₨'+(wmx/100).toFixed(0):''}</div>
        \${vs}
      </div>\`;
    }).join('');
    // Chart — top 8 commodities from filtered+sorted list
    const topComms=commsToShow.slice(0,8);
    const allDates=[...new Set(topComms.flatMap(c=>(D.priceMap[c]?.[city]||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to)).map(p=>p.date)))].sort();
    $('chartTitle').textContent='All commodities — '+city+' (₨/kg)';
    if(_chart){_chart.destroy();_chart=null;}
    if(allDates.length){
      _chart=new Chart($('priceChart'),{type:'line',
        data:{labels:allDates,datasets:topComms.map((c,i)=>({
          label:c,spanGaps:true,tension:.3,pointRadius:allDates.length>30?2:4,
          borderColor:CLR[i%CLR.length],backgroundColor:CLR[i%CLR.length]+'22',
          data:allDates.map(d=>{const pt=(D.priceMap[c]?.[city]||[]).find(p=>p.date===d);return pt?+(pt.p/100).toFixed(2):null;})
        }))},
        options:{responsive:true,animation:false,
          plugins:{legend:{display:true,labels:{font:{size:9},boxWidth:12}}},
          scales:{x:{ticks:{maxTicksLimit:12,font:{size:10}},grid:{color:'#f1f5f9'}},
                  y:{ticks:{callback:v=>'₨'+v,font:{size:10}},grid:{color:'#f1f5f9'}}}}});
    }
    // Wide table: rows = commodities (in sorted order), cols = dates
    const allCommsWithData=commsToShow; // already filtered & sorted
    const _allDatesC=[...new Set(allCommsWithData.flatMap(c=>(D.priceMap[c]?.[city]||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to)).map(p=>p.date)))];
    // Only show dates where ≥2 commodities have data — removes sparse old dates
    const _minComms=Math.min(2,allCommsWithData.length);
    const dates=_allDatesC.filter(d=>allCommsWithData.filter(c=>(D.priceMap[c]?.[city]||[]).some(p=>p.date===d)).length>=_minComms).sort();
    if(!dates.length){$('pTable').innerHTML='<p style="padding:16px;color:var(--muted)">No data for '+city+'.</p>';return;}
    $('chartTitle').textContent='All commodities — '+city+' (₨/kg, top 8 shown in chart)';
    const head='<tr><th>Commodity</th>'+dates.map(d=>\`<th>\${d}</th>\`).join('')+'</tr>';
    const trows=allCommsWithData.map(cm_name=>{
      const data=D.priceMap[cm_name]?.[city]||[];
      const cells=dates.map(d=>{
        const pt=data.find(p=>p.date===d);
        return pt?\`<td>₨\${(pt.p/100).toFixed(2)}\`+
          (pt.min?\`<br><small style="color:var(--muted)">\${(pt.min/100).toFixed(2)}–\${((pt.max||pt.min)/100).toFixed(2)}</small>\`:'')+
          '</td>':'<td style="color:var(--muted)">—</td>';
      }).join('');
      return \`<tr><td><strong>\${esc(cm_name)}</strong></td>\${cells}</tr>\`;
    }).join('');
    $('pTable').innerHTML=\`<table><thead>\${head}</thead><tbody>\${trows}</tbody></table>\`;
    return;
  }

  // ── SINGLE COMMODITY mode ─────────────────────────────────────────────────────
  const cm=D.priceMap[comm]||{};
  const show=city==='all'?Object.keys(cm):[city];
  const winD=from?Math.round((new Date(to||new Date())-new Date(from))/86400000):0;

  const pSort2=$('pSort')?.value||'def',pMaxAge2=parseInt($('pMaxAge')?.value||'99');
  let citiesToShow=show.filter(c=>{
    const pts=(cm[c]||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to));
    if(!pts.length) return false;
    return pMaxAge2>=99||ageD(comm,c)<=pMaxAge2;
  });
  // Pre-compute price range (max-min) for each city — used for sort
  const _wRange={};
  for(const c of citiesToShow){
    const pts=(cm[c]||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to));
    if(!pts.length){_wRange[c]=0;continue;}
    const pr=pts.map(p=>p.p);
    _wRange[c]=Math.max(...pr)-Math.min(...pr);
  }
  if(pSort2==='asc') citiesToShow.sort((a,b)=>(_wRange[a]||0)-(_wRange[b]||0));
  else if(pSort2==='desc') citiesToShow.sort((a,b)=>(_wRange[b]||0)-(_wRange[a]||0));
  else if(pSort2==='fresh') citiesToShow.sort((a,b)=>ageD(comm,a)-ageD(comm,b));
  $('pStats').innerHTML=citiesToShow.map((c,i)=>{
    const pts=(cm[c]||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to));
    const vpts=pts.filter(p=>!p.flagged),usePts=vpts.length?vpts:pts;
    const latFlagged=pts.length&&pts[pts.length-1].flagged;
    const pr=usePts.map(p=>p.p),avg=pr.reduce((s,v)=>s+v,0)/pr.length;
    const wmn=Math.min(...pr),wmx=Math.max(...pr);
    // Latest reading's daily low/high (AMIS reports a range per day)
    const latPt=usePts[usePts.length-1];
    const latLo=latPt?.min??latPt?.p,latHi=latPt?.max??latPt?.p;
    const tr=trend(comm,c),vl=vol(comm,c,winD);
    const ts=tr.p!=null?\`\${tr.a} \${Math.abs(tr.p).toFixed(1)}%\`:tr.a;
    const vs=vl?\`<span class="vol-b \${vl.c}">\${vl.b} \${vl.cv.toFixed(0)}%</span>\`:'';
    const flagNote=latFlagged?\` <span title="Latest reading suspect (>5× peer median)" style="color:#f59e0b">⚠</span>\`:'';
    return \`<div class="sb" style="border-left:3px solid \${CLR[i%CLR.length]}\${latFlagged?';opacity:.8':''}">
      <div class="sb-lbl">\${esc(c)}\${ageTag(comm,c)}\${uploadTag(c)}\${flagNote}</div>
      <span class="tr-badge \${tr.c}">\${ts}</span>
      <div class="sb-val">\${latLo===latHi?'₨'+(latLo/100).toFixed(2):'₨'+(latLo/100).toFixed(2)+' – ₨'+(latHi/100).toFixed(2)}</div>
      <div class="sb-sub">avg ₨\${(avg/100).toFixed(2)} /kg\${wmn<wmx?' · window ₨'+(wmn/100).toFixed(0)+'–₨'+(wmx/100).toFixed(0):''}</div>
      <div class="sb-sub">\${vpts.length<pts.length?pts.length+' readings ('+( pts.length-vpts.length)+' suspect)':pts.length+' readings'}</div>
      \${vs}
    </div>\`;
  }).join('');

  const allDates=[...new Set(citiesToShow.flatMap(c=>(cm[c]||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to)).map(p=>p.date)))].sort();
  $('chartTitle').textContent=comm+(city!=='all'?' — '+city:' — all cities')+' (₨/kg)';
  if(_chart){_chart.destroy();_chart=null;}
  if(allDates.length){
    _chart=new Chart($('priceChart'),{type:'line',
      data:{labels:allDates,datasets:citiesToShow.slice(0,8).map((c,i)=>({
        label:c,spanGaps:true,tension:.3,
        pointRadius:allDates.length>30?2:4,
        borderColor:CLR[i%CLR.length],backgroundColor:CLR[i%CLR.length]+'22',
        data:allDates.map(d=>{const pt=(cm[c]||[]).find(p=>p.date===d);return pt?+(pt.p/100).toFixed(2):null;})
      }))},
      options:{responsive:true,animation:false,
        plugins:{legend:{display:citiesToShow.length>1}},
        scales:{
          x:{ticks:{maxTicksLimit:12,font:{size:10}},grid:{color:'#f1f5f9'}},
          y:{ticks:{callback:v=>'₨'+v,font:{size:10}},grid:{color:'#f1f5f9'}}
        }}});
  }

  const fC=citiesToShow; // already filtered & sorted by the sort control above
  const _allDates=[...new Set(fC.flatMap(c=>(cm[c]||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to)).map(p=>p.date)))];
  // Only show dates where ≥2 cities have data — removes sparse/isolated old readings
  const _minCities=Math.min(2,fC.length);
  const dates=_allDates.filter(d=>fC.filter(c=>(cm[c]||[]).some(p=>p.date===d)).length>=_minCities).sort((a,b)=>b.localeCompare(a));
  if(!dates.length){$('pTable').innerHTML='<p style="padding:16px;color:var(--muted)">No data.</p>';return;}
  const head='<tr><th>Date</th>'+fC.map(c=>\`<th>\${esc(c)}</th>\`).join('')+'</tr>';
  const rows=dates.map(date=>{
    const cells=fC.map(c=>{
      const pt=(cm[c]||[]).find(p=>p.date===date); if(!pt) return '<td style="color:var(--muted)">—</td>';
      const prev=(cm[c]||[]).slice().reverse().find(p=>p.date<date&&!p.flagged);
      const chg=(!pt.flagged&&prev)?((pt.p-prev.p)/prev.p*100):null;
      const cs=chg!=null?\`<small style="color:\${chg>2?'var(--up)':chg<-2?'var(--dn)':'var(--muted)'}">\${chg>0?'▲':'▼'}\${Math.abs(chg).toFixed(1)}%</small>\`:'';
      const flagBadge=pt.flagged?\`<span title="Suspect: ₨\${(pt.p/100).toFixed(0)}/kg is >5× or <0.2× the peer median on this date. Possible data-entry error — excluded from route calculations." style="color:#f59e0b;cursor:help"> ⚠</span>\`:'';
      const tdBg=pt.flagged?'background:rgba(245,158,11,.07);':'';
      return \`<td style="\${tdBg}">₨\${(pt.p/100).toFixed(2)}\${flagBadge}\${cs}\${pt.min?\`<br><small style="color:var(--muted)">\${(pt.min/100).toFixed(2)}–\${((pt.max||pt.min)/100).toFixed(2)}</small>\`:''}</td>\`;
    }).join('');
    return \`<tr><td>\${date}</td>\${cells}</tr>\`;
  }).join('');
  $('pTable').innerHTML=\`<table><thead>\${head}</thead><tbody>\${rows}</tbody></table>\`;
}

function downloadCsv(){
  const comm=$('pComm')?.value,city=$('pCity')?.value;
  const from=$('pFrom')?.value||'',to=$('pTo')?.value||'';
  const allComm=comm==='all',allCity=city==='all';
  const comms=allComm?D.commodities:[comm];
  const cityList=allCity?D.cities:[city];

  // Collect dates in range
  const dateSet=new Set();
  for(const cm_name of comms)
    for(const c of cityList)
      for(const pt of (D.priceMap[cm_name]?.[c]||[]).filter(p=>(!from||p.date>=from)&&(!to||p.date<=to)))
        dateSet.add(pt.date);
  const dates=[...dateSet].sort().reverse(); // descending: newest left → oldest right
  if(!dates.length){alert('No data for the selected filters.');return;}

  // Decide row-label columns
  const labelCols=allComm&&!allCity?['Commodity']:
                  !allComm&&allCity?['City']:
                  !allComm&&!allCity?['Commodity']:  // single comm+city: label by commodity
                  ['Commodity','City'];

  // Build data rows: array of {labels:[], data:[]}
  const dataRows=[];
  function addItem(labels, priceData){
    const vals=dates.flatMap(d=>{
      const pt=priceData.find(p=>p.date===d);
      // Fall back to FQP (pt.p) when min/max not reported by AMIS
      const lo=pt?(pt.min!=null?pt.min:pt.p):null;
      const hi=pt?(pt.max!=null?pt.max:pt.p):null;
      return [lo!=null?(lo/100).toFixed(2):'', hi!=null?(hi/100).toFixed(2):''];
    });
    if(vals.every(v=>!v)) return;
    dataRows.push({labels,vals});
  }
  if(allComm&&!allCity)      comms.forEach(c=>addItem([c],D.priceMap[c]?.[city]||[]));
  else if(!allComm&&allCity) cityList.forEach(c=>addItem([c],D.priceMap[comm]?.[c]||[]));
  else if(!allComm&&!allCity) addItem([comm],D.priceMap[comm]?.[city]||[]);
  else comms.forEach(cm=>cityList.forEach(c=>addItem([cm,c],D.priceMap[cm]?.[c]||[])));

  if(!dataRows.length){alert('No data for the selected filters.');return;}

  // Colours
  const HDR='#1a3a5c',HDR2='#2e5f8a',ODD='#ffffff',EVEN='#eef4fb',TXT='#ffffff';

  // Build HTML Excel table
  const TH =v=>\`<th style="background:\${HDR};color:\${TXT};padding:5px 8px;border:1px solid #888;font-size:11pt;text-align:center;font-weight:bold">\${v}</th>\`;
  const TH2=v=>\`<th style="background:\${HDR2};color:\${TXT};padding:4px 8px;border:1px solid #888;font-size:10pt;text-align:center">\${v}</th>\`;
  const TH3=v=>\`<th style="background:#3a74a8;color:\${TXT};padding:3px 8px;border:1px solid #888;font-size:9pt;text-align:center">\${v}</th>\`;
  const THLBL=(v,rs)=>\`<th style="background:\${HDR};color:\${TXT};padding:5px 8px;border:1px solid #888;font-size:11pt;text-align:left;font-weight:bold" rowspan="\${rs}">\${v}</th>\`;

  // Group dates by month for 3-level header: Month → Day → Low/High
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthGroups=[]; // [{month:'May 2026', dates:[...]}, ...]
  for(const d of dates){
    const [y,m,day]=d.split('-');
    const mName=MONTHS[parseInt(m)-1]+' '+y;
    const last=monthGroups[monthGroups.length-1];
    if(last&&last.name===mName) last.dates.push(d);
    else monthGroups.push({name:mName,dates:[d]});
  }

  // Row 1: label cols (rowspan=3) + month headers (colspan = dates×2 per month)
  const hdr1=labelCols.map(l=>THLBL(esc(l),3)).join('')+
    monthGroups.map(mg=>TH(mg.name).replace('>',\` colspan="\${mg.dates.length*2}">\`)).join('');
  // Row 2: day numbers (colspan=2 each)
  const hdr2=dates.map(d=>TH2(parseInt(d.split('-')[2])+'').replace('>',\` colspan="2">\`)).join('');
  // Row 3: Low / High per date
  const hdr3=dates.map(()=>TH3('Low')+TH3('High')).join('');

  const bodyRows=dataRows.map((r,i)=>{
    const bg=i%2===0?ODD:EVEN;
    const TD =v=>\`<td style="background:\${bg};padding:5px 8px;border:1px solid #ddd;font-size:10pt;font-weight:bold">\${esc(v)}</td>\`;
    const TDN=v=>\`<td style="background:\${bg};padding:5px 8px;border:1px solid #ddd;font-size:10pt;text-align:right">\${v}</td>\`;
    return \`<tr>\${r.labels.map(TD).join('')}\${r.vals.map(TDN).join('')}</tr>\`;
  }).join('\\n');

  const title=(!allComm&&!allCity?comm+' — '+city:
               !allCity?city:
               !allComm?comm:'All commodities')+
    (from?\` · \${from} to \${to||'today'}\`:'');

  const html=\`<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Prices</x:Name><x:WorksheetOptions><x:DisplayGridlines/>
<x:FreezePanes/><x:FrozenNoSplit/>
<x:SplitHorizontal>3</x:SplitHorizontal><x:TopRowBottomPane>3</x:TopRowBottomPane>
<x:SplitVertical>\${labelCols.length}</x:SplitVertical><x:LeftColumnRightPane>\${labelCols.length}</x:LeftColumnRightPane>
<x:ActivePane>0</x:ActivePane>
</x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  body{font-family:Arial,sans-serif}
  h2{color:\${HDR};margin-bottom:8px}
  table{border-collapse:collapse;font-size:10pt}
  p{color:#666;font-size:9pt;margin-top:6px}
</style></head>
<body>
<h2>AMIS Pakistan Prices (₨/kg) — \${esc(title)}</h2>
<table>
<thead>
<tr>\${hdr1}</tr>
<tr>\${hdr2}</tr>
<tr>\${hdr3}</tr>
</thead>
<tbody>
\${bodyRows}
</tbody>
</table>
<p>Source: amis.pk · Generated \${new Date().toLocaleDateString('en-PK')} · Low = min quoted, High = max quoted (PKR per kg)</p>
</body></html>\`;

  const label=(!allCity?city:(!allComm?comm.replace(/[^a-z0-9]/gi,'-').toLowerCase():'all'));
  const blob=new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=\`prices-\${label}-\${from||'all'}.xls\`;a.click();
}

// ── CITY PAIR ─────────────────────────────────────────────────────────────────
let _cpMode='pair';
function setCpMode(m){
  _cpMode=m;
  const p=m==='pair';
  $('modePair').className=p?'btn on':'btn2';
  $('mode1c').className=p?'btn2':'btn on';
  $('cpCityBBox').style.display=p?'':'none';
  $('cpVs').style.display=p?'':'none';
  $('cpDirBox').style.display=p?'none':'';
  $('cpALbl').textContent=p?'City A':'City';
  $('pairSections').style.display=p?'':'none';
  $('oneCitySection').style.display=p?'none':'';
  $('cpMeta').innerHTML=p?'Select two cities above.':'';
  renderPair();
}

function renderOneCity(city,dir,days,tons){
  const isImport=dir==='import';
  const rows=[];
  for(const comm of D.commodities){
    const cityP=avgPx(comm,city,days); if(!cityP) continue;
    for(const other of D.cities){
      if(other===city) continue;
      const otherP=avgPx(comm,other,days); if(!otherP) continue;
      const[buyC,buyP,sellC,sellP]=isImport?[other,otherP,city,cityP]:[city,cityP,other,otherP];
      if(buyP>=sellP) continue;
      const sp=sellP-buyP,spPct=(sp/buyP)*100; if(spPct<5) continue;
      const d=dist(buyC,sellC),tk=d!=null?trk100(d):null;
      const net=tk!=null?sp-tk:null;
      if(net==null||net<=0) continue;
      const netT=Math.round(net*tons*10),con=conPct(comm,buyC,sellC,days);
      rows.push({comm,buyC,buyP,sellC,sellP,sp,spPct,d,tk,net,netT,con});
    }
  }
  rows.sort((a,b)=>b.net-a.net);
  const label=isImport?\`📥 Best to import into \${esc(city)}\`:\`📦 Best to export from \${esc(city)}\`;
  $('sec1c').textContent=label+\` — \${rows.length} profitable routes\`;
  if(!rows.length){$('cp1Tbl').innerHTML='<p style="padding:16px;color:var(--muted)">No profitable routes with known distances found. Try wider window.</p>';return;}
  // Pre-compute track record badges per route (last 30 days)
  const _trMap={};
  for(const p of (D.trackRecord||[])){
    const k=p.comm+'|'+p.buyCity+'|'+p.sellCity;
    if(!_trMap[k]) _trMap[k]={h:0,t:0};
    _trMap[k].t++; if(p.actualNet>0) _trMap[k].h++;
  }
  const trs=rows.slice(0,60).map(r=>{
    const bk=brkKm(r.sp);
    const cs=r.con!=null?\`<span class="chip \${r.con>=70?'con-h':r.con>=40?'con-m':'con-l'}">\${r.con}%</span>\`:'—';
    const trk=_trMap[r.comm+'|'+r.buyC+'|'+r.sellC];
    const trkBadge=trk&&trk.t>=2?\`<br><small style="color:\${trk.h/trk.t>=0.6?'var(--up)':'#f59e0b'}" title="Track record: \${trk.h}/\${trk.t} days profitable next day">🎯\${trk.h}/\${trk.t}</small>\`:'';
    return \`<tr>
      <td><strong>\${esc(r.comm)}</strong></td>
      <td><span class="pill">\${esc(isImport?r.buyC:r.sellC)}</span>\${trkBadge}</td>
      <td>₨\${(r.buyP/100).toFixed(2)}\${ageTag(r.comm,r.buyC)}</td>
      <td>₨\${(r.sellP/100).toFixed(2)}\${ageTag(r.comm,r.sellC)}</td>
      <td>₨\${(r.sp/100).toFixed(2)} <small style="color:var(--muted)">(\${r.spPct.toFixed(0)}%)</small></td>
      <td>\${r.d} km</td><td>₨\${(r.tk/100).toFixed(2)}</td>
      <td><strong class="pos">₨\${(r.net/100).toFixed(2)}</strong></td>
      <td><strong class="pos">\${pkr(r.netT)}</strong></td>
      <td style="color:var(--muted)">\${bk>0?bk+' km':'—'}</td>
      <td>\${cs}</td>
      <td><button class="btn-wa" onclick='cpWa(\${JSON.stringify(r.comm)},\${JSON.stringify(r.buyC)},\${JSON.stringify(r.sellC)},\${(r.buyP/100).toFixed(2)},\${(r.sellP/100).toFixed(2)},\${r.netT})'>📲</button></td>
    </tr>\`;
  }).join('');
  const cityHdr=isImport?'Source City':'Dest City';
  $('cp1Tbl').innerHTML=\`<table><thead><tr>
    <th>Commodity</th><th>\${cityHdr}</th><th>Buy ₨/kg</th><th>Sell ₨/kg</th>
    <th>Spread/kg</th><th>km</th><th>Truck/kg</th><th>Net/kg</th>
    <th>Net \${tons}t</th>
    <th title="How far you could truck it before profit hits zero = Spread ÷ truck rate (set by Vehicle selector). Higher = safer trade. Any Pakistan route is under ~1,500 km." style="cursor:help">Max viable km</th>
    <th title="% of days where both cities had prices AND spread beat truck. 100% with stale data means every overlapping day was profitable — missing recent days are excluded." style="cursor:help">Consistent</th>
    <th></th>
  </tr></thead><tbody>\${trs}</tbody></table>
  \${rows.length>60?\`<p style="padding:8px 16px;color:var(--muted);font-size:.85em">Showing top 60 of \${rows.length} routes.</p>\`:''}\`;
}

function renderPair(){
  const days=parseInt($('cpDays')?.value||'30'),tons=parseFloat($('cpTons')?.value||'5');
  if(_cpMode==='1city'){
    const city=$('cpA')?.value,dir=$('cpDir')?.value||'import';
    if(!city) return;
    $('cpMeta').innerHTML=\`<span><strong>Window:</strong> \${days>0?days+'d avg':'All data'}</span><span><strong>Load:</strong> \${tons}t</span>\`;
    renderOneCity(city,dir,days,tons);
    return;
  }
  const cA=$('cpA')?.value,cB=$('cpB')?.value;
  if(!cA||!cB||cA===cB){$('cpMeta').innerHTML='<em>Select two different cities.</em>';return;}
  const km=dist(cA,cB),tk=km?trk100(km):null;
  $('secAB').textContent=cA+' → '+cB+' (Buy in '+cA+', Sell in '+cB+')';
  $('secBA').textContent=cB+' → '+cA+' (Buy in '+cB+', Sell in '+cA+')';
  $('cpMeta').innerHTML=[
    km?\`<span><strong>Distance:</strong> \${km} km</span>\`:'<span>Distance not in DB — add manually in route planner</span>',
    tk?\`<span><strong>Truck cost:</strong> ₨\${(tk/100).toFixed(2)}/kg</span>\`:'',
    \`<span><strong>Window:</strong> \${days>0?days+'d avg':'All data'}</span>\`,
    \`<span><strong>Load:</strong> \${tons}t</span>\`,
  ].filter(Boolean).join('');

  function dirTbl(buyC,sellC){
    const rows=[];
    for(const comm of D.commodities){
      const bP=avgPx(comm,buyC,days),sP=avgPx(comm,sellC,days);
      if(!bP||!sP||sP<=bP) continue;
      const sp=sP-bP,spPct=(sp/bP)*100;
      const net=tk!=null?sp-tk:null,netT=net!=null?Math.round(net*tons*10):null;
      const con=conPct(comm,buyC,sellC,days);
      rows.push({comm,bP,sP,sp,spPct,net,netT,con});
    }
    rows.sort((a,b)=>(b.net??b.sp)-(a.net??a.sp));
    if(!rows.length) return '<p style="padding:12px;color:var(--muted)">No positive spreads found for these cities.</p>';
    const trs=rows.slice(0,30).map(r=>{
      const bk=brkKm(r.sp);
      const cs=r.con!=null?\`<span class="chip \${r.con>=70?'con-h':r.con>=40?'con-m':'con-l'}">\${r.con}%</span>\`:'—';
      const ns=r.net!=null?(r.net>=0?\`<strong class="pos">₨\${(r.net/100).toFixed(2)}</strong>\`:\`<span class="neg">-₨\${(Math.abs(r.net)/100).toFixed(2)}</span>\`):'—';
      const ts=r.netT!=null?(r.netT>=0?\`<strong class="pos">\${pkr(r.netT)}</strong>\`:\`<span class="neg">\${pkr(r.netT)}</span>\`):'—';
      return \`<tr>
        <td><strong>\${esc(r.comm)}</strong></td>
        <td>₨\${(r.bP/100).toFixed(2)}\${ageTag(r.comm,buyC)}</td><td>₨\${(r.sP/100).toFixed(2)}\${ageTag(r.comm,sellC)}</td>
        <td>₨\${(r.sp/100).toFixed(2)} <small style="color:var(--muted)">(\${r.spPct.toFixed(0)}%)</small></td>
        <td>\${ns}</td><td>\${ts}</td>
        <td style="color:var(--muted)">\${bk>0?bk+' km':'—'}</td>
        <td>\${cs}</td>
        <td><button class="btn-wa" onclick='cpWa(\${JSON.stringify(r.comm)},\${JSON.stringify(buyC)},\${JSON.stringify(sellC)},\${(r.bP/100).toFixed(2)},\${(r.sP/100).toFixed(2)},\${r.netT??0})'>📲</button></td>
      </tr>\`;
    }).join('');
    return \`<table><thead><tr>
      <th>Commodity</th><th>Buy ₨/kg (\${esc(buyC)})</th><th>Sell ₨/kg (\${esc(sellC)})</th>
      <th>Spread/kg</th><th>Net/kg</th><th>Net \${tons}t</th>
      <th title="How far you could truck it before profit hits zero = Spread ÷ truck rate (set by Vehicle selector). Higher = safer trade. Any Pakistan route is under ~1,500 km." style="cursor:help">Max viable km</th>
      <th title="% of days where both cities had prices AND spread beat truck. 100% with stale data means every overlapping day was profitable — missing recent days are excluded." style="cursor:help">Consistent</th>
      <th></th>
    </tr></thead><tbody>\${trs}</tbody></table>\`;
  }
  $('cpTblAB').innerHTML=dirTbl(cA,cB);
  $('cpTblBA').innerHTML=dirTbl(cB,cA);

  const tOW=tk?tk*tons*10+3000:3000,fOW=tk?tk*tons*10:0;
  const res=[];
  for(const cO of D.commodities){
    const bO=avgPx(cO,cA,days),sO=avgPx(cO,cB,days); if(!bO||!sO) continue;
    const nO=(sO-bO)*tons*10-tOW;
    res.push({cO,cR:null,nO,nR:0,tot:nO});
    for(const cR of D.commodities){
      const bR=avgPx(cR,cB,days),sR=avgPx(cR,cA,days); if(!bR||!sR) continue;
      res.push({cO,cR,nO,nR:(sR-bR)*tons*10-fOW,tot:nO+(sR-bR)*tons*10-fOW});
    }
  }
  res.sort((a,b)=>b.tot-a.tot);
  $('cpOpt').innerHTML=res.slice(0,10).map((r,i)=>\`
    <div class="optrow">
      <div class="orank">#\${i+1}</div>
      <div class="odesc">
        <strong>Out:</strong> \${esc(r.cO)} &nbsp;·&nbsp; <strong>Return:</strong> \${r.cR?esc(r.cR):'<em style="color:var(--muted)">empty</em>'}
        <br><small style="color:var(--muted)">Out: \${pkr(r.nO)} · Return: \${r.cR?pkr(r.nR):'₨0'}</small>
      </div>
      <div class="oprofit \${r.tot>=0?'pos':'neg'}">\${pkr(r.tot)}</div>
      <button class="btn-wa" onclick='rtWa(\${JSON.stringify(r.cO)},\${r.cR?JSON.stringify(r.cR):null},\${JSON.stringify(cA)},\${JSON.stringify(cB)},\${r.tot})'>📲</button>
    </div>\`).join('')||'<p style="padding:16px;color:var(--muted)">Not enough data.</p>';
}
function cpWa(comm,buyC,sellC,bkg,skg,nT){
  const t=\`🚛 *\${comm}*\\nBuy \${buyC}: ₨\${bkg}/kg\\nSell \${sellC}: ₨\${skg}/kg\\nNet profit: \${nT>=0?'₨'+Math.round(nT).toLocaleString():'-₨'+Math.abs(Math.round(nT)).toLocaleString()}\\namis.pk\`;
  navigator.clipboard.writeText(t).then(()=>alert('Copied!')).catch(()=>prompt('Copy:',t));
}
function rtWa(cO,cR,cA,cB,tot){
  const t=\`🚛 Round trip \${cA}↔\${cB}\\nOut: \${cO}\\n\${cR?'Return: '+cR:'Return: empty'}\\nProfit: \${pkr(tot)}\\namis.pk\`;
  navigator.clipboard.writeText(t).then(()=>alert('Copied!')).catch(()=>prompt('Copy:',t));
}

// ── SMART BRIEFING ────────────────────────────────────────────────────────────

function linSlope(pts){
  const n=pts.length; if(n<3) return null;
  let sx=0,sy=0,sxy=0,sxx=0;
  for(let i=0;i<n;i++){sx+=i;sy+=pts[i].p;sxy+=i*pts[i].p;sxx+=i*i;}
  const d=n*sxx-sx*sx; return d?(n*sxy-sx*sy)/d:null;
}

function recentPts(comm,city,days){
  const s=D.priceMap[comm]?.[city]; if(!s) return [];
  const cut=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
  return s.filter(p=>p.date>=cut);
}

function trendPct7(comm,city){
  const pts=recentPts(comm,city,10); if(pts.length<3) return null;
  const slope=linSlope(pts); if(slope===null) return null;
  const mean=pts.reduce((a,p)=>a+p.p,0)/pts.length;
  return mean>0?slope*(pts.length-1)/mean*100:null;
}

function getAvgRange(comm,city,recentDaysAgo,oldDaysAgo){
  const s=D.priceMap[comm]?.[city]; if(!s) return null;
  const d1=new Date(Date.now()-recentDaysAgo*86400000).toISOString().slice(0,10);
  const d2=new Date(Date.now()-oldDaysAgo*86400000).toISOString().slice(0,10);
  const pts=s.filter(p=>p.date>=d2&&p.date<=d1);
  if(!pts.length) return null;
  return pts.reduce((a,p)=>a+p.p,0)/pts.length;
}

function spreadTrend7(comm,buyC,sellC){
  const rB=getAvgRange(comm,buyC,0,4),rS=getAvgRange(comm,sellC,0,4);
  const oB=getAvgRange(comm,buyC,7,11),oS=getAvgRange(comm,sellC,7,11);
  if(!rB||!rS||!oB||!oS) return null;
  const rSp=rS-rB,oSp=oS-oB;
  if(oSp<=0) return null;
  return(rSp-oSp)/Math.abs(oSp)*100;
}

function priceAlert(comm,city){
  const all=D.priceMap[comm]?.[city]; if(!all||all.length<8) return null;
  const vals=all.slice(-30).map(p=>p.p);
  const cur=vals[vals.length-1];
  const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
  const std=Math.sqrt(vals.reduce((a,v)=>a+(v-mean)**2,0)/vals.length);
  if(std<1) return null;
  const z=(cur-mean)/std; if(Math.abs(z)<1.8) return null;
  return{z:+z.toFixed(1),pct:Math.round((cur-mean)/mean*100),dir:z>0?'above':'below',comm,city};
}

function ageD(comm,city){
  const d=latDate(comm,city); if(!d) return 99;
  return Math.round((new Date(TODAY)-new Date(d))/86400000);
}

function routeScore(net,con,maxAge,spTrend){
  if(net<=0) return 0;
  const profitPts=Math.min(net/200,40);
  const conPts=(con!=null?con:40)*0.30;
  const trendPts=spTrend!=null?Math.max(-10,Math.min(10,spTrend/5)):0;
  const base=profitPts+conPts+trendPts;
  // Freshness multiplier — stale data tanks the score regardless of profit
  const fm=maxAge===0?1.0:maxAge===1?0.85:maxAge===2?0.60:maxAge===3?0.35:0.10;
  return Math.round(base*fm);
}

// ── TRACK RECORD ──────────────────────────────────────────────────────────────
function renderTrackRecord(){
  const picks=D.trackRecord||[];
  if(!picks.length){
    $('trScoreCards').innerHTML='';
    $('trTable').innerHTML=\`<p style="padding:24px;color:var(--muted)">No track record data yet — needs at least 2 days of price history.</p>\`;
    return;
  }
  const days=parseInt($('trDays')?.value||'30');
  const comm=$('trComm')?.value||'all';
  const minSp=parseFloat($('trMinSp')?.value||'5');
  const cutoff=new Date(Date.now()-days*86400000).toISOString().slice(0,10);
  const filt=picks.filter(p=>p.date>=cutoff&&(comm==='all'||p.comm===comm)&&p.spPct>=minSp);
  if(!filt.length){
    $('trScoreCards').innerHTML='';
    $('trTable').innerHTML=\`<p style="padding:24px;color:var(--muted)">No picks match the selected filters.</p>\`;
    return;
  }
  const hits=filt.filter(p=>p.actualNet>0);
  const hitRate=hits.length/filt.length*100;
  const avgPred=filt.reduce((s,p)=>s+p.predictedNet,0)/filt.length;
  const avgAct=filt.reduce((s,p)=>s+p.actualNet,0)/filt.length;
  const accuracy=avgPred>0?avgAct/avgPred*100:null;
  // Per-route hit rates for badge
  const routeHits={},routeTotal={};
  for(const p of filt){
    const k=p.comm+'|'+p.buyCity+'|'+p.sellCity;
    routeHits[k]=(routeHits[k]||0)+(p.actualNet>0?1:0);
    routeTotal[k]=(routeTotal[k]||0)+1;
  }
  const bestRoute=Object.entries(routeTotal).sort((a,b)=>(routeHits[b[0]]/b[1])-(routeHits[a[0]]/a[1]))[0];
  const brParts=bestRoute?bestRoute[0].split('|'):null;
  const brRate=bestRoute?(routeHits[bestRoute[0]]/bestRoute[1]*100).toFixed(0)+'%':null;
  const clrHit=hitRate>=60?'var(--up)':'var(--dn)';
  const clrAcc=accuracy!=null&&accuracy>=80?'var(--up)':accuracy!=null&&accuracy>=50?'#f59e0b':'var(--dn)';
  $('trScoreCards').innerHTML=\`
    <div class="sb"><div class="sb-lbl">Hit Rate</div>
      <div class="sb-val" style="color:\${clrHit}">\${hitRate.toFixed(0)}%</div>
      <div class="sb-sub">\${hits.length} profitable of \${filt.length} picks</div></div>
    <div class="sb"><div class="sb-lbl">Avg Predicted</div>
      <div class="sb-val">₨\${(avgPred/100).toFixed(2)}/kg</div>
      <div class="sb-sub">spread identified</div></div>
    <div class="sb"><div class="sb-lbl">Avg Actual</div>
      <div class="sb-val" style="color:\${avgAct>=0?'var(--up)':'var(--dn)'}">₨\${(avgAct/100).toFixed(2)}/kg</div>
      <div class="sb-sub">next-day realised</div></div>
    <div class="sb"><div class="sb-lbl">Price Accuracy</div>
      <div class="sb-val" style="color:\${clrAcc}">\${accuracy!=null?accuracy.toFixed(0)+'%':'—'}</div>
      <div class="sb-sub">of predicted gain held</div></div>
    \${brParts?\`<div class="sb"><div class="sb-lbl">Best Route</div>
      <div class="sb-val" style="font-size:.9em;color:var(--up)">\${esc(brParts[0])}</div>
      <div class="sb-sub">\${esc(brParts[1])}→\${esc(brParts[2])} · \${brRate} hit rate</div></div>\`:''}
  \`;
  // Table: recent first
  const sorted=[...filt].sort((a,b)=>b.date.localeCompare(a.date)||b.spPct-a.spPct);
  const rows=sorted.map(p=>{
    const hit=p.actualNet>0;
    const slip=p.actualNet-p.predictedNet;
    const bigSlip=Math.abs(slip)>p.predictedNet*0.5&&p.predictedNet>0;
    const verdict=hit?(bigSlip?'⚠️ Got less':'✅'):'❌';
    const bg=hit?(bigSlip?'rgba(245,158,11,.06)':'rgba(22,101,52,.06)'):'rgba(185,28,28,.06)';
    const actCol=hit?'var(--up)':'var(--dn)';
    const slipCol=slip>=0?'var(--up)':'var(--dn)';
    return \`<tr style="background:\${bg}">
      <td style="white-space:nowrap">\${p.date}</td>
      <td><strong>\${esc(p.comm)}</strong></td>
      <td>\${esc(p.buyCity)} → \${esc(p.sellCity)}</td>
      <td>₨\${(p.buyP/100).toFixed(2)}</td>
      <td>₨\${(p.predictedSellP/100).toFixed(2)}</td>
      <td>₨\${(p.actualSellP/100).toFixed(2)}</td>
      <td style="color:\${actCol};font-weight:700">\${p.actualNet>=0?'+':''}₨\${(p.actualNet/100).toFixed(2)}</td>
      <td style="color:\${slipCol}">\${slip>=0?'+':''}₨\${(slip/100).toFixed(2)}</td>
      <td style="font-size:1.15em;text-align:center">\${verdict}</td>
    </tr>\`;
  }).join('');
  $('trTable').innerHTML=\`<div style="overflow-x:auto"><table>
    <thead><tr>
      <th>Date</th><th>Commodity</th><th>Route</th>
      <th>Buy ₨/kg</th><th>Predicted Sell</th><th>Actual Sell</th>
      <th>Net ₨/kg</th><th>vs Predicted</th><th>Result</th>
    </tr></thead>
    <tbody>\${rows}</tbody>
  </table></div>
  <p style="padding:8px 0;color:var(--muted);font-size:.8em">
    ✅ Profitable next day · ⚠️ Profitable but got ≤50% of predicted · ❌ Loss. No truck costs included — pure price movement.
  </p>\`;
}

let _bfWaText='';

function renderBriefing(){
  $('bfContent').innerHTML=\`<p style="padding:40px;color:var(--muted);text-align:center">⏳ Analysing \${D.commodities.length} commodities across \${D.cities.length} cities…</p>\`;
  setTimeout(()=>{
    const days=30,mp=5;
    const routes=[];
    for(const comm of D.commodities){
      const cm=D.priceMap[comm]||{},cities=Object.keys(cm);
      for(let i=0;i<cities.length;i++) for(let j=i+1;j<cities.length;j++){
        const cA=cities[i],cB=cities[j];
        const pA=avgPx(comm,cA,days),pB=avgPx(comm,cB,days);
        if(!pA||!pB) continue;
        const[buyC,buyP,sellC,sellP]=pA<=pB?[cA,pA,cB,pB]:[cB,pB,cA,pA];
        const sp=sellP-buyP; if(sp/buyP*100<mp) continue;
        const d=dist(buyC,sellC),tk=d!=null?trk100(d):null;
        const net=tk!=null?sp-tk:null; if(net==null||net<=0) continue;
        const con=conPct(comm,buyC,sellC,days);
        const rc=recentCons(comm,buyC,sellC,7);
        const ageA=ageD(comm,buyC),ageB=ageD(comm,sellC),maxAge=Math.max(ageA,ageB);
        const spTrend=spreadTrend7(comm,buyC,sellC);
        const score=routeScore(net,con,maxAge,spTrend);
        const buyT=trendPct7(comm,buyC),sellT=trendPct7(comm,sellC);
        routes.push({comm,buyC,buyP,sellC,sellP,sp,net,con,rc,ageA,ageB,maxAge,spTrend,score,buyT,sellT,d});
      }
    }
    // Sort: fresh first (0-1d), then recent (2-3d), then stale (4d+) — score within each tier
    const freshTier=r=>r.maxAge<=1?0:r.maxAge<=3?1:2;
    routes.sort((a,b)=>{
      const td=freshTier(a)-freshTier(b);
      return td!==0?td:b.score-a.score;
    });

    const alerts=[];
    for(const comm of D.commodities)
      for(const city of D.cities){const a=priceAlert(comm,city);if(a)alerts.push(a);}
    alerts.sort((a,b)=>Math.abs(b.z)-Math.abs(a.z));

    const improving=routes.filter(r=>r.spTrend!=null&&r.spTrend>15).sort((a,b)=>b.spTrend-a.spTrend).slice(0,6);
    const cooling  =routes.filter(r=>r.spTrend!=null&&r.spTrend<-20).sort((a,b)=>a.spTrend-b.spTrend).slice(0,5);
    const top=routes.slice(0,10);

    const truck=$('gTruck')?.options[$('gTruck')?.selectedIndex]?.text?.split('—')[0]?.trim()||'';
    const today2=new Date().toLocaleDateString('en-PK',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const tArr=p=>p==null?'<span style="color:var(--muted)">—</span>':p>5?\`<span class="pos">↑\${p.toFixed(0)}%</span>\`:p<-5?\`<span class="neg">↓\${Math.abs(p).toFixed(0)}%</span>\`:'<span style="color:var(--muted)">→</span>';
    const spArr=p=>p==null?'<span style="color:var(--muted)">—</span>':p>0?\`<span class="pos">↑+\${p.toFixed(0)}%</span>\`:\`<span class="neg">↓\${p.toFixed(0)}%</span>\`;
    const scoreCls=s=>s>=70?'go':s>=45?'marg':'no';
    const conBadge=c=>c!=null?\`<span class="chip \${c>=70?'con-h':c>=40?'con-m':'con-l'}">\${c}%</span>\`:'<span style="color:var(--muted)">—</span>';

    const card=(r,i)=>\`
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:7px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="background:#1a3a5c;color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-size:.75em;font-weight:700;flex-shrink:0">\${i+1}</span>
          <div style="flex:1;min-width:180px">
            <strong>\${esc(r.comm)}</strong>
            &nbsp;<span class="pill">\${esc(r.buyC)}</span> → <span class="pill pill-g">\${esc(r.sellC)}</span>
            \${r.maxAge>0?\`<span style="color:var(--dn);font-size:.75em;margin-left:4px">\${r.maxAge}d old</span>\`:''}
            \${r.d!=null?\`<span style="color:var(--muted);font-size:.78em;margin-left:6px">\${r.d}km</span>\`:''}
          </div>
          <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:.88em">
            <div><div style="font-size:.7em;color:var(--muted)">Net/kg</div><strong class="pos">₨\${(r.net/100).toFixed(2)}</strong></div>
            <div><div style="font-size:.7em;color:var(--muted)">30d consist.</div>\${conBadge(r.con)}</div>
            <div><div style="font-size:.7em;color:var(--muted)">Last 7d</div>\${rcBadge(r.rc,7)}</div>
            <div><div style="font-size:.7em;color:var(--muted)">Spread Δ7d</div>\${spArr(r.spTrend)}</div>
            <div><div style="font-size:.7em;color:var(--muted)">Buy trend</div>\${tArr(r.buyT)}</div>
            <div><div style="font-size:.7em;color:var(--muted)">Sell trend</div>\${tArr(r.sellT)}</div>
            <div><div style="font-size:.7em;color:var(--muted)">Score</div><span class="chip \${scoreCls(r.score)}">\${r.score}</span></div>
          </div>
        </div>
      </div>\`;

    // WhatsApp text
    let wa=\`🌾 *AMIS Briefing — \${new Date().toLocaleDateString('en-PK',{day:'numeric',month:'short',year:'numeric'})}*\\n\`;
    wa+=\`🚛 \${truck} · ₨\${_truckRate.toFixed(2)}/100kg·km\\n\\n\`;
    wa+=\`🏆 *Top Routes*\\n\`;
    top.slice(0,5).forEach((r,i)=>{
      wa+=\`\${i+1}. \${r.comm} | \${r.buyC}→\${r.sellC} | ₨\${(r.net/100).toFixed(0)}/kg\`;
      if(r.rc!=null) wa+=\` | \${r.rc.hit}/\${r.rc.total}d✓\`;
      else if(r.con!=null) wa+=\` | \${r.con}%\`;
      if(r.spTrend!=null) wa+=\` | \${r.spTrend>0?'↑+':'↓'}\${Math.abs(r.spTrend).toFixed(0)}%\`;
      if(r.maxAge>0) wa+=\` ⚠️\${r.maxAge}d old\`;
      wa+=\`\\n\`;
    });
    if(improving.length){wa+=\`\\n📈 *Spread Improving*\\n\`;improving.slice(0,4).forEach(r=>{wa+=\`• \${r.comm} \${r.buyC}→\${r.sellC}: +\${r.spTrend.toFixed(0)}%\\n\`;});}
    if(cooling.length){wa+=\`\\n📉 *Cooling Down*\\n\`;cooling.slice(0,4).forEach(r=>{wa+=\`• \${r.comm} \${r.buyC}→\${r.sellC}: \${r.spTrend.toFixed(0)}%\\n\`;});}
    if(alerts.length){wa+=\`\\n🚨 *Unusual Prices*\\n\`;alerts.slice(0,4).forEach(a=>{wa+=\`• \${a.comm} \${a.city}: \${Math.abs(a.pct)}% \${a.dir} avg (z=\${a.z})\\n\`;});}
    wa+=\`\\nSource: amis.pk\`;
    _bfWaText=wa;

    const secHdr=(icon,title,sub,clr,bg,border)=>\`
      <div style="background:\${bg};border:1px solid \${border};border-radius:8px;padding:10px 14px;margin:18px 0 10px">
        <strong style="color:\${clr}">\${icon} \${title}</strong>
        <span style="color:var(--muted);font-size:.78em;margin-left:8px">\${sub}</span>
      </div>\`;

    $('bfContent').innerHTML=\`
      <div style="max-width:940px;margin:0 auto">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div>
            <h2 style="margin:0;color:#1a3a5c">📊 Smart Briefing</h2>
            <p style="margin:4px 0 0;color:var(--muted);font-size:.82em">\${today2} · \${routes.length} profitable routes found · \${truck}</p>
          </div>
          <button class="btn" onclick="copyWa()" id="waBtn">📲 Copy for WhatsApp</button>
        </div>

        \${secHdr('🏆','Top \${top.length} Routes by Score','Score = profit (40pts) + consistency (30pts) + data freshness (20pts) + spread trend (±10pts)','#166534','#f0fdf4','#86efac')}
        \${top.map((r,i)=>card(r,i)).join('')}

        \${improving.length?secHdr('📈','Spread Improving This Week','Spread widened >15% vs 7 days ago — opportunity growing, act soon','#1e3a8a','#eff6ff','#93c5fd'):''}
        \${improving.map(r=>\`<div style="padding:8px 14px;border-left:3px solid #3b82f6;margin-bottom:5px;background:#fff;border-radius:0 6px 6px 0">
          <strong>\${esc(r.comm)}</strong> · <span class="pill">\${esc(r.buyC)}</span> → <span class="pill pill-g">\${esc(r.sellC)}</span>
          &nbsp;<span class="pos">↑ +\${r.spTrend.toFixed(0)}%</span> this week &nbsp;·&nbsp; ₨\${(r.net/100).toFixed(0)}/kg net
          \${r.maxAge>0?\`&nbsp;<span style="color:var(--dn);font-size:.8em">\${r.maxAge}d old</span>\`:''}
        </div>\`).join('')}

        \${cooling.length?secHdr('📉','Cooling Down','Spread narrowed >20% this week — window closing','#991b1b','#fef2f2','#fca5a5'):''}
        \${cooling.map(r=>\`<div style="padding:8px 14px;border-left:3px solid #ef4444;margin-bottom:5px;background:#fff;border-radius:0 6px 6px 0">
          <strong>\${esc(r.comm)}</strong> · <span class="pill">\${esc(r.buyC)}</span> → <span class="pill pill-g">\${esc(r.sellC)}</span>
          &nbsp;<span class="neg">↓ \${r.spTrend.toFixed(0)}%</span> this week &nbsp;·&nbsp; ₨\${(r.net/100).toFixed(0)}/kg net
        </div>\`).join('')}

        \${secHdr('🚨','Unusual Price Movements','Price is >1.8 standard deviations from its own 30-day average — unexpected highs or lows','#92400e','#fffbeb','#fcd34d')}
        \${alerts.length?\`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:7px;margin-bottom:16px">
          \${alerts.slice(0,12).map(a=>\`
            <div style="background:#fff;border:1px solid \${a.dir==='above'?'#fca5a5':'#93c5fd'};border-radius:6px;padding:7px 11px">
              <strong>\${esc(a.comm)}</strong> · \${esc(a.city)}<br>
              <span class="\${a.dir==='above'?'neg':'pos'}">\${a.dir==='above'?'▲':'▼'} \${Math.abs(a.pct)}% \${a.dir} 30d avg</span>
              <span style="color:var(--muted);font-size:.78em"> z=\${a.z}</span>
            </div>\`).join('')}
        </div>\`:'<p style="color:var(--muted);padding:6px 0 12px">No unusual price movements detected.</p>'}

        \${(()=>{
          // ── Today's Movers (from Daily Market Changes page) ──
          const ch=LIVE.dailyChanges||[];
          if(!ch.length) return '';
          const sorted=[...ch].sort((a,b)=>Math.abs(b.change)-Math.abs(a.change)).slice(0,30);
          const ups=sorted.filter(r=>r.dir==='up').slice(0,8);
          const dns=sorted.filter(r=>r.dir==='down').slice(0,8);
          const row=r=>\`<div style="padding:5px 10px;border-left:3px solid \${r.dir==='up'?'var(--up)':'var(--dn)'};margin-bottom:4px;background:#fff;border-radius:0 6px 6px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div style="flex:1;min-width:130px"><strong>\${esc(r.commodity)}</strong> · <span style="color:var(--muted);font-size:.82em">\${esc(r.city)}</span></div>
            <div style="font-size:.85em">₨\${(r.today/100).toFixed(2)}/kg</div>
            <div style="\${r.dir==='up'?'color:var(--up)':'color:var(--dn)'};font-weight:600;font-size:.85em">\${r.dir==='up'?'▲':'▼'} ₨\${(Math.abs(r.change)/100).toFixed(2)} (\${r.yesterday>0?(Math.abs(r.change)/r.yesterday*100).toFixed(1)+'%':'—'})</div>
          </div>\`;
          return \`
            \${secHdr('📊',"Today's Market Movers","Biggest price changes vs yesterday (AMIS Daily Market Changes)",'#065f46','#ecfdf5','#6ee7b7')}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
              <div>
                <div style="font-size:.75em;font-weight:700;color:var(--up);margin-bottom:5px;letter-spacing:.05em">▲ RISING</div>
                \${ups.map(row).join('')}
              </div>
              <div>
                <div style="font-size:.75em;font-weight:700;color:var(--dn);margin-bottom:5px;letter-spacing:.05em">▼ FALLING</div>
                \${dns.map(row).join('')}
              </div>
            </div>\`;
        })()}

        \${(()=>{
          // ── Rate Submission Status ──
          const up=Object.entries(LIVE.uploadMap);
          if(!up.length) return '';
          const sorted=[...up].sort((a,b)=>a[1].localeCompare(b[1]));
          const chips=sorted.map(([city,time])=>{
            const[h,m]=time.split(':').map(Number);
            const mins=h*60+m;
            const col=mins<9*60?'#dcfce7;color:#166534':mins<12*60?'#f1f5f9;color:#475569':'#fef3c7;color:#92400e';
            return \`<span style="display:inline-flex;align-items:center;gap:3px;background:\${col};border-radius:99px;padding:2px 8px;font-size:.72em;margin:2px">\${esc(city[0].toUpperCase()+city.slice(1))} <span style="font-weight:700">\${time}</span></span>\`;
          }).join('');
          return \`
            \${secHdr('📤','Rate Submission Times',"When each city uploaded today's rates (green = before 9 AM, yellow = after 12 PM)",'#1e3a8a','#eff6ff','#93c5fd')}
            <div style="margin-bottom:16px;line-height:2">\${chips}</div>\`;
        })()}

        <div style="color:var(--muted);font-size:.78em;margin-top:16px;padding:10px 12px;background:#f8fafc;border-radius:6px">
          <strong>How scores work:</strong> Profit pts (0–40) + Consistency (0–30) + Data freshness (0–20, −5 per stale day) + Spread trend (±10) ·
          <strong>Spread Δ7d:</strong> recent 4-day avg spread vs 7–11 days ago ·
          <strong>Trend:</strong> 7-day linear regression on price ·
          <strong>Alerts:</strong> z-score &gt;1.8 on last 30 days
        </div>
      </div>\`;
  },80);
}

function copyWa(){
  if(!_bfWaText){alert('Open the Briefing tab first.');return;}
  navigator.clipboard.writeText(_bfWaText)
    .then(()=>{const b=$('waBtn');if(b){b.textContent='✅ Copied!';setTimeout(()=>b.textContent='📲 Copy for WhatsApp',2500);}})
    .catch(()=>{prompt('Copy this:',_bfWaText);});
}

// ── PAPER TRADE ───────────────────────────────────────────────────────────────
let _ptChart=null;

function initPtDates(){
  const today=TODAY;
  const d30=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  if($('ptFrom')&&!$('ptFrom').value){$('ptFrom').value=d30;$('ptTo').value=today;}
}

function runPaperTrade(){
  initPtDates();
  const startCap=parseFloat($('ptCapital').value)||500000;
  const fromDate=$('ptFrom').value;
  const toDate=$('ptTo').value||TODAY;
  const nTrades=parseInt($('ptTrades').value)||2;
  const minNetRs=parseFloat($('ptMinNet').value)||0;
  const settleDays=parseInt($('ptSellWin').value)||2; // days capital is locked in transit
  const riskMode=$('ptRisk')?.value||'moderate';
  // payload selected per-trade based on available capital (see bestTruck logic below)

  // Collect all dates in range
  const dateSet=new Set();
  for(const comm of D.commodities)
    for(const city of D.cities)
      for(const p of (D.priceMap[comm]?.[city]||[]))
        if(p.date>=fromDate&&p.date<=toDate) dateSet.add(p.date);
  const allDates=[...dateSet].sort();
  if(allDates.length<2){$('ptSummary').innerHTML='<p style="color:var(--dn)">Not enough data in date range.</p>';return;}

  // Portfolio state
  let available=startCap;
  // inTransit holds full trade details so we can display open positions
  // deployedCapital = actual cash outlay (buyCost+truckCost); profit only books on settlement
  const inTransit=[]; // [{settleDate,returnAmt,deployedCapital,comm,buyC,sellC,qty,profit,buyDate,buyP,sellP}]
  // During transit: track capital AT COST so balance stays flat until goods sell
  // Capital at cost: available cash + what's deployed on trucks (no unrealised profit)
  // Profit only enters this number when a position settles (goods arrive and are sold)
  const getTotal=()=>available+inTransit.reduce((s,x)=>s+x.deployedCapital,0);

  const trades=[];
  const equity=[];   // one entry per date, no duplicates
  const diary=[];    // full day-by-day log including idle days

  for(let di=0;di<allDates.length;di++){
    const buyDate=allDates[di];
    const availAtOpen=available;

    // Settle matured in-transit lots — P&L recognised HERE (on arrival day, not purchase day)
    const settledToday=[];
    let dayPL=0; // P&L is from settlements, not from today's purchases
    for(let k=inTransit.length-1;k>=0;k--){
      if(inTransit[k].settleDate<=buyDate){
        available+=inTransit[k].returnAmt;
        dayPL+=inTransit[k].profit;   // book profit when goods arrive, not when dispatched
        settledToday.push(Object.assign({},inTransit[k]));
        inTransit.splice(k,1);
      }
    }

    // Find best routes using THIS DAY'S spot prices only — no look-ahead
    const routes=[];
    for(const comm of D.commodities){
      const cm=D.priceMap[comm]||{};
      const cities=Object.keys(cm).filter(c=>cm[c].some(p=>p.date===buyDate));
      for(let i=0;i<cities.length;i++) for(let j=i+1;j<cities.length;j++){
        const cA=cities[i],cB=cities[j];
        const pA=cm[cA].find(p=>p.date===buyDate&&!p.flagged)?.p;
        const pB=cm[cB].find(p=>p.date===buyDate&&!p.flagged)?.p;
        if(!pA||!pB) continue;
        const[buyC,buyP,sellC,sellP]=pA<=pB?[cA,pA,cB,pB]:[cB,pB,cA,pA];
        const d=dist(buyC,sellC); if(!d) continue;
        const tk=trk100(d);
        const net=(sellP-buyP-tk)/100; // ₨/kg net after truck
        if(net<minNetRs) continue;
        routes.push({comm,buyC,buyP,sellC,sellP,net,d,tk});
      }
    }
    routes.sort((a,b)=>b.net-a.net);
    const selected=routes.slice(0,nTrades);

    let routeReason='',deployPct=1.0;
    const deployedToday=[];

    if(!selected.length){
      routeReason='No routes ≥ ₨'+minNetRs.toFixed(0)+'/kg';
    } else if(available<1){
      routeReason='All capital on trucks — waiting on settlements';
    } else {
      // Risk mode: fraction of available cash to deploy today
      if(riskMode==='moderate') deployPct=0.70;
      else if(riskMode==='conservative') deployPct=0.50;
      else if(riskMode==='smart'){
        const scores=selected.map(r=>{
          const rc=recentCons(r.comm,r.buyC,r.sellC,7);
          const conScore=rc?rc.hit/rc.total:0.3;
          const fresh=ageD(r.comm,r.buyC)<=1&&ageD(r.comm,r.sellC)<=1;
          return conScore*(fresh?1.2:0.7);
        });
        const avgScore=scores.reduce((a,b)=>a+b,0)/scores.length;
        deployPct=Math.min(0.85,Math.max(0.20,avgScore*0.85));
        selected.forEach((r,i)=>r._conf=scores[i]);
      }

      // allocPerTrade sized so that buyCost + truckCost never exceeds available
      const deployable=available*deployPct;
      const allocPerTrade=deployable/selected.length;
      // Use real calendar arithmetic — never clamp to data range
      const _sd=new Date(buyDate+'T00:00:00Z');
      _sd.setUTCDate(_sd.getUTCDate()+settleDays);
      const sellDate=_sd.toISOString().slice(0,10);

      for(const r of selected){
        const buyPriceRs=r.buyP/100;
        // Auto-select best truck: iterate all types, pick whichever maximises total P&L
        // Minimum fill thresholds — don't assign tiny loads to large trucks
        const TRUCK_MIN_KG={shehzore:0,mazda_t3:500,mazda_20:1200,bedford:3000};
        let bestPf=-Infinity,qty=0,tkRs=0,truckLabel='Shehzore';
        for(const _t of TRUCKS){
          if(!_t.payload||!_t.rate) continue;
          const _tRs=_t.rate*r.d/100;
          const _tQty=Math.min(Math.floor(allocPerTrade/(buyPriceRs+_tRs)),Math.round(_t.payload*1000));
          if(_tQty<=0) continue;
          // Skip truck if load is below its minimum sensible fill
          if(_tQty<(TRUCK_MIN_KG[_t.id]??0)) continue;
          const _tPf=_tQty*(r.sellP/100-buyPriceRs-_tRs);
          if(_tPf>bestPf){bestPf=_tPf;qty=_tQty;tkRs=_tRs;truckLabel=_t.label;}
        }
        if(qty<=0) continue;
        const buyCost=qty*buyPriceRs;
        const truckCostRs=qty*tkRs;
        const sellRevRs=qty*(r.sellP/100); // locked-in sell price from today's data
        const profit=sellRevRs-buyCost-truckCostRs;

        available-=(buyCost+truckCostRs);
        inTransit.push({settleDate:sellDate,returnAmt:sellRevRs,deployedCapital:buyCost+truckCostRs,
          comm:r.comm,buyC:r.buyC,sellC:r.sellC,qty,profit,buyDate,buyP:buyPriceRs,sellP:r.sellP/100,truckLabel});
        deployedToday.push({comm:r.comm,buyC:r.buyC,sellC:r.sellC,qty,profit,sellDate,net:r.net,capitalOut:buyCost+truckCostRs,truckLabel});
        // dayPL NOT updated here — profit only recognised on settle day

        const conf=riskMode==='smart'?Math.round((r._conf||0)*100):null;
        trades.push({buyDate,sellDate,comm:r.comm,buyC:r.buyC,sellC:r.sellC,
          buyP:buyPriceRs,sellP:r.sellP/100,qty,buyCost,truckCostRs,sellRevRs,profit,
          balance:getTotal(),deployPct,conf,truckLabel});
      }
    }

    diary.push({date:buyDate,availAtOpen,settled:settledToday,deployed:deployedToday,routeReason,totalEquity:getTotal(),dayPL});
    equity.push({date:buyDate,v:getTotal(),dayPL,deployPct});
  }

  // Positions still on trucks at simulation end (sell date = last date, settle on close)
  const openPositions=[...inTransit];
  renderPaperResult({trades,equity,startCap,balance:getTotal(),fromDate,toDate,diary,openPositions,minNetRs});
}

function renderPaperResult({trades,equity,startCap,balance,fromDate,toDate,diary,openPositions,minNetRs}){
  const totalPL=balance-startCap;
  const wins=trades.filter(t=>t.profit>0).length;
  const pct=trades.length?Math.round(wins/trades.length*100):0;
  const best=trades.length?trades.reduce((a,b)=>b.profit>a.profit?b:a):null;
  const worst=trades.length?trades.reduce((a,b)=>b.profit<a.profit?b:a):null;
  const clr=totalPL>=0?'var(--up)':'var(--dn)';

  $('ptSummary').innerHTML=\`
    <div class="sg" style="margin-bottom:12px">
      <div class="sb"><div class="sb-lbl">Final Balance</div><div class="sb-val" style="color:\${clr}">₨\${Math.round(balance).toLocaleString()}</div><div class="sb-sub">\${totalPL>=0?'+':''}\${Math.round(totalPL).toLocaleString()}</div></div>
      <div class="sb"><div class="sb-lbl">Total Trades</div><div class="sb-val">\${trades.length}</div><div class="sb-sub">\${fromDate} → \${toDate}</div></div>
      <div class="sb"><div class="sb-lbl">Win Rate</div><div class="sb-val">\${pct}%</div><div class="sb-sub">\${wins} wins / \${trades.length-wins} losses</div></div>
      <div class="sb"><div class="sb-lbl">Return</div><div class="sb-val" style="color:\${clr}">\${((totalPL/startCap)*100).toFixed(1)}%</div><div class="sb-sub">on ₨\${startCap.toLocaleString()}</div></div>
      \${best?\`<div class="sb"><div class="sb-lbl">Best Trade</div><div class="sb-val" style="color:var(--up);font-size:.95em">₨\${Math.round(best.profit).toLocaleString()}</div><div class="sb-sub">\${esc(best.comm)} \${esc(best.buyC)}→\${esc(best.sellC)} on \${best.buyDate}</div></div>\`:''}
      \${worst?\`<div class="sb"><div class="sb-lbl">Worst Trade</div><div class="sb-val" style="color:var(--dn);font-size:.95em">₨\${Math.round(worst.profit).toLocaleString()}</div><div class="sb-sub">\${esc(worst.comm)} \${esc(worst.buyC)}→\${esc(worst.sellC)} on \${worst.buyDate}</div></div>\`:''}
    </div>\`;

  // Equity chart
  if(_ptChart){_ptChart.destroy();_ptChart=null;}
  _ptChart=new Chart($('ptEquityChart'),{type:'line',
    data:{labels:equity.map(e=>e.date),datasets:[{
      label:'Portfolio Value',spanGaps:true,tension:.3,
      borderColor:'#3b82f6',backgroundColor:'#3b82f622',fill:true,pointRadius:1,
      data:equity.map(e=>Math.round(e.v))
    },{
      label:'Start Capital',borderColor:'#94a3b8',borderDash:[4,4],pointRadius:0,
      data:equity.map(()=>startCap)
    }]},
    options:{responsive:true,animation:false,
      plugins:{legend:{display:true,labels:{font:{size:9},boxWidth:10}}},
      scales:{x:{ticks:{maxTicksLimit:10,font:{size:9}}},
              y:{min:0,ticks:{callback:v=>v>=1000000?'₨'+(v/1000000).toFixed(1)+'M':'₨'+Math.round(v/1000)+'k',font:{size:9}}}}}});

  // Open Positions — capital still on trucks at end of simulation
  const openHtml=(openPositions&&openPositions.length)?\`
    <div class="sec" style="color:#f59e0b">🚚 Open Positions — Still In Transit</div>
    <div class="tw" style="margin-bottom:20px"><table>
    <thead><tr><th>Buy Date</th><th>Settle Date</th><th>Commodity</th><th>Buy City</th><th></th><th>Sell City</th><th>Qty</th><th>Buy ₨/kg</th><th>Sell ₨/kg</th><th>Expected P&amp;L</th></tr></thead>
    <tbody>\${openPositions.map(p=>\`<tr>
      <td>\${p.buyDate}</td><td>\${p.settleDate}</td>
      <td><strong>\${esc(p.comm)}</strong></td>
      <td><span class="pill">\${esc(p.buyC)}</span></td><td style="color:var(--muted)">→</td>
      <td><span class="pill pill-g">\${esc(p.sellC)}</span></td>
      <td>\${Math.round(p.qty).toLocaleString()} kg</td>
      <td>₨\${p.buyP.toFixed(2)}</td><td>₨\${p.sellP.toFixed(2)}</td>
      <td style="color:var(--up);font-weight:600">+₨\${Math.round(p.profit).toLocaleString()}</td>
    </tr>\`).join('')}</tbody></table></div>\`:'';

  // Day-by-Day Diary — every date in range, including idle days
  const diaryRows=(diary||[]).map(d=>{
    const hasSettle=d.settled&&d.settled.length>0;
    const hasDeploy=d.deployed&&d.deployed.length>0;
    const settleText=hasSettle
      ? d.settled.map(s=>\`<span style="font-size:.78em;color:var(--up)">+₨\${Math.round(s.returnAmt).toLocaleString()} \${esc(s.comm||'')} \${esc(s.buyC||'')}→\${esc(s.sellC||'')}</span>\`).join('<br>')
      : '<span style="color:var(--muted);font-size:.8em">—</span>';
    const totalCapOut=hasDeploy?d.deployed.reduce((s,dp)=>s+(dp.capitalOut||0),0):0;
    const actText=hasDeploy
      ? d.deployed.map(dp=>\`<span style="font-size:.78em"><strong>\${esc(dp.comm)}</strong> <span class="pill">\${esc(dp.buyC)}</span>→<span class="pill pill-g">\${esc(dp.sellC)}</span> \${Math.round(dp.qty).toLocaleString()} kg · ₨\${dp.net.toFixed(0)}/kg · settles \${dp.sellDate} · <span style="color:#f59e0b">−₨\${Math.round(dp.capitalOut||0).toLocaleString()}</span></span>\`).join('<br>')
        +\`<br><span style="font-size:.75em;color:#f59e0b;font-weight:600">Total deployed: ₨\${Math.round(totalCapOut).toLocaleString()}</span>\`
      : \`<span style="font-size:.8em;color:var(--muted)">\${esc(d.routeReason||'—')}</span>\`;
    const plColor=(d.dayPL||0)>=0?'var(--up)':'var(--dn)';
    const plText=hasDeploy
      ? \`<span style="color:\${plColor};font-weight:600">\${(d.dayPL||0)>=0?'+':''}₨\${Math.round(d.dayPL||0).toLocaleString()}</span>\`
      : '<span style="color:var(--muted)">—</span>';
    return \`<tr style="\${hasDeploy?'background:rgba(34,197,94,.06)':''}">
      <td style="white-space:nowrap">\${d.date}</td>
      <td>\${settleText}</td>
      <td>\${actText}</td>
      <td>\${plText}</td>
      <td style="font-size:.8em;color:var(--muted)">₨\${Math.round(d.totalEquity||0).toLocaleString()}</td>
    </tr>\`;
  }).join('');

  $('ptLog').innerHTML=\`
    \${openHtml}
    <div class="sec">Daily History</div>
    <div class="tw" style="margin-bottom:20px"><table>
    <thead><tr><th>Date</th><th>Settled In</th><th>Activity</th><th>Day P&amp;L</th><th>Portfolio</th></tr></thead>
    <tbody>\${diaryRows}</tbody></table></div>

    <div class="sec">Full Trade Log</div><div class="tw">
    <table><thead><tr>
      <th>Buy Date</th><th>Sell Date</th><th>Commodity</th><th>Buy City</th><th></th><th>Sell City</th>
      <th>Qty</th><th>Buy ₨/kg</th><th>Sell ₨/kg</th><th>Net ₨/kg</th><th>Truck</th><th>Truck Cost</th><th>Buy Total</th><th>Revenue</th>
      \${trades[0]?.conf!=null?'<th>Confidence</th>':''}
      <th>P&amp;L</th><th>Balance</th>
    </tr></thead><tbody>\${trades.map(t=>{
      const c=t.profit>=0?'var(--up)':'var(--dn)';
      const netKg=(t.sellP-t.buyP-t.truckCostRs/t.qty);
      return \`<tr>
        <td>\${t.buyDate}</td><td>\${t.sellDate}</td>
        <td><strong>\${esc(t.comm)}</strong></td>
        <td><span class="pill">\${esc(t.buyC)}</span></td><td style="color:var(--muted)">→</td>
        <td><span class="pill pill-g">\${esc(t.sellC)}</span></td>
        <td>\${Math.round(t.qty).toLocaleString()} kg</td>
        <td>₨\${t.buyP.toFixed(2)}</td><td>₨\${t.sellP.toFixed(2)}</td>
        <td style="color:var(--up);font-size:.85em">+₨\${netKg.toFixed(1)}</td>
        <td style="font-size:.78em;color:var(--muted)">\${t.truckLabel||'—'}</td>
        <td>₨\${Math.round(t.truckCostRs).toLocaleString()}</td>
        \${t.conf!=null?\`<td><span class="chip \${t.conf>=70?'con-h':t.conf>=40?'con-m':'con-l'}">\${t.conf}%</span></td>\`:''}
        <td>₨\${Math.round(t.buyCost).toLocaleString()}</td>
        <td style="color:var(--up)">₨\${Math.round(t.sellRevRs).toLocaleString()}</td>
        <td style="color:\${c};font-weight:600">\${t.profit>=0?'+':''}₨\${Math.round(t.profit).toLocaleString()}</td>
        <td style="color:\${c}">₨\${Math.round(t.balance).toLocaleString()}</td>
      </tr>\`;
    }).join('')}</tbody></table></div>\`;
}

// ── ARBITRAGE ─────────────────────────────────────────────────────────────────
let _as={col:'net',dir:-1};
function renderArb(sc){
  if(sc){if(_as.col===sc)_as.dir*=-1;else{_as.col=sc;_as.dir=-1;}}
  const cf=$('aComm')?.value||'all',days=parseInt($('aDays')?.value||'30');
  const mp=parseFloat($('aMinPct')?.value||'10'),filt=$('aFilt')?.value||'profitable';
  const vd=parseInt($('aVerify')?.value||'7');  // verify window (days)
  const comms=cf==='all'?D.commodities:[cf],rows=[];
  for(const comm of comms){
    const cm=D.priceMap[comm]||{},cities=Object.keys(cm);
    for(let i=0;i<cities.length;i++) for(let j=i+1;j<cities.length;j++){
      const cA=cities[i],cB=cities[j],pA=avgPx(comm,cA,days),pB=avgPx(comm,cB,days);
      if(!pA||!pB) continue;
      const[buyC,buyP,sellC,sellP]=pA<=pB?[cA,pA,cB,pB]:[cB,pB,cA,pA];
      const sp=sellP-buyP,spPct=(sp/buyP)*100; if(spPct<mp) continue;
      const d=dist(buyC,sellC),tk=d!=null?trk100(d):null;
      const net=tk!=null?sp-tk:null,bk=brkKm(sp),con=conPct(comm,buyC,sellC,days);
      const rc=vd>0?recentCons(comm,buyC,sellC,vd):null;
      const via=net!=null?net>0:null;
      if(filt==='profitable'&&via!==true) continue;
      if(filt==='known'&&via===null) continue;
      const maxAge=Math.max(ageD(comm,buyC),ageD(comm,sellC));
      const arrComm=arrCommFor(comm);
      rows.push({comm,buyC,buyP,sellC,sellP,sp,spPct,d,tk,net,bk,con,rc,via,maxAge,arrComm});
    }
  }
  const sf={comm:(a,b)=>a.comm.localeCompare(b.comm)*_as.dir,
    sp:(a,b)=>(a.sp-b.sp)*_as.dir,net:(a,b)=>((a.net??a.sp)-(b.net??b.sp))*_as.dir,
    bk:(a,b)=>(a.bk-b.bk)*_as.dir,con:(a,b)=>((a.con??0)-(b.con??0))*_as.dir,
    rc:(a,b)=>((a.rc?.hit/a.rc?.total||0)-(b.rc?.hit/b.rc?.total||0))*_as.dir};
  const freshTierA=r=>r.maxAge<=1?0:r.maxAge<=3?1:2;
  rows.sort((a,b)=>{
    if(a.via&&!b.via)return -1;if(!a.via&&b.via)return 1;
    // Fresh tier is always primary — 0-1d before 2-3d before 4d+
    const td=freshTierA(a)-freshTierA(b);
    if(td!==0) return td;
    // Within same tier, sort by selected column
    return sf[_as.col]?sf[_as.col](a,b):(b.net??b.sp)-(a.net??a.sp);
  });
  const viab=rows.filter(r=>r.via===true).length;
  $('aStats').innerHTML=\`
    <div class="sb"><div class="sb-lbl">Profitable</div><div class="sb-val" style="font-size:1.3em">\${viab}</div><div class="sb-sub">after truck</div></div>
    <div class="sb"><div class="sb-lbl">Total</div><div class="sb-val" style="font-size:1.3em">\${rows.length}</div><div class="sb-sub">above \${mp}% spread</div></div>
    <div class="sb"><div class="sb-lbl">Commodities</div><div class="sb-val" style="font-size:1.3em">\${[...new Set(rows.map(r=>r.comm))].length}</div><div class="sb-sub">with spreads</div></div>
  \`;
  if(!rows.length){$('aTable').innerHTML='<p style="padding:16px;color:var(--muted)">No spreads found.</p>';return;}
  const MAX_ROWS=200;
  const shown=rows.slice(0,MAX_ROWS);
  const capMsg=rows.length>MAX_ROWS?\`<p style="padding:8px 16px;color:var(--muted);font-size:.85em">Showing top \${MAX_ROWS} of \${rows.length.toLocaleString()} routes — use filters to narrow.</p>\`:'';
  const th=(l,c,tip='')=>\`<th onclick="renderArb('\${c}')" \${tip?'title="'+tip+'" style="cursor:help"':''}>\${l}\${_as.col===c?(_as.dir>0?' ↑':' ↓'):''}</th>\`;
  const trs=shown.map(r=>{
    const sig=r.via===true?'<span class="chip go">✅ GO</span>':r.via===false?(r.net>-500?'<span class="chip marg">MARGINAL</span>':'<span class="chip no">NO GO</span>'):'<span class="chip uk">NO DIST</span>';
    const ns=r.net!=null?(r.net>=0?\`<strong class="pos">₨\${(r.net/100).toFixed(2)}</strong>\`:\`<span class="neg">-₨\${(Math.abs(r.net)/100).toFixed(2)}</span>\`):'—';
    const cs=r.con!=null?\`<span class="chip \${r.con>=70?'con-h':r.con>=40?'con-m':'con-l'}">\${r.con}%</span>\`:'—';
    const rv=vd>0?rcBadge(r.rc,vd):'';
    const buySup=supplyBadge(r.arrComm,r.buyC,'buy');
    const sellSup=supplyBadge(r.arrComm,r.sellC,'sell');
    return \`<tr>
      <td><strong>\${esc(r.comm)}</strong></td>
      <td><span class="pill">\${esc(r.buyC)}</span>\${buySup}\${uploadTag(r.buyC)}</td><td style="color:var(--muted)">→</td>
      <td><span class="pill pill-g">\${esc(r.sellC)}</span>\${sellSup}\${uploadTag(r.sellC)}</td>
      <td>₨\${(r.buyP/100).toFixed(2)}\${ageTag(r.comm,r.buyC)}</td><td>₨\${(r.sellP/100).toFixed(2)}\${ageTag(r.comm,r.sellC)}</td>
      <td>₨\${(r.sp/100).toFixed(2)} <small style="color:var(--muted)">(\${r.spPct.toFixed(0)}%)</small></td>
      <td>\${r.d!=null?r.d+' km':'—'}</td><td>\${r.tk!=null?'₨'+(r.tk/100).toFixed(2):'—'}</td>
      <td>\${ns}</td><td style="color:var(--muted)">\${r.bk>0?r.bk+' km':'—'}</td>
      <td>\${cs}\${rv?\`<br><small style="color:var(--muted)">last \${vd}d: \${rv}</small>\`:''}</td>
      <td>\${sig}</td>
      <td><button class="btn-wa" onclick='cpWa(\${JSON.stringify(r.comm)},\${JSON.stringify(r.buyC)},\${JSON.stringify(r.sellC)},\${(r.buyP/100).toFixed(2)},\${(r.sellP/100).toFixed(2)},\${Math.round((r.net??r.sp)*50)})'>📲</button></td>
    </tr>\`;
  }).join('');
  $('aTable').innerHTML=\`<table><thead><tr>
    \${th('Commodity','comm')}<th title="↑/↓ Maunds/day arrived in last 7d vs 30d avg. 🟢=high supply (buy=good/cheap, sell=risky/glut). 🔴=low supply (buy=risky/dear, sell=good/scarcity). Hover chip for detail." style="cursor:help">Buy City</th><th></th>
    <th title="Supply at sell city: 🟢=low arrivals=scarcity=high sell price. 🔴=high arrivals=glut." style="cursor:help">Sell City</th>
    <th>Buy ₨/kg</th><th>Sell ₨/kg</th>\${th('Spread/kg','sp')}
    <th>km</th><th>Truck/kg</th>\${th('Net/kg','net')}
    \${th('Max viable km','bk','How far you could truck it before profit hits zero = Spread ÷ truck rate (set by Vehicle selector). Higher = safer trade. Any Pakistan route is under ~1,500 km.')}
    \${th('Consistent','con','Overall %: days in window where spread beat truck cost. Below: days in the verify window (set via Verify last selector) — confirms it was not a one-off.')}
    <th>Signal</th><th></th>
  </tr></thead><tbody>\${trs}</tbody></table>\${capMsg}\`;
}

// ── ROUTE PLANNER ─────────────────────────────────────────────────────────────
function autoFillDist(){
  const f=$('rFrom')?.value,t=$('rTo')?.value; if(!f||!t) return;
  const d=dist(f,t);
  $('rDist').value=d||'';
  $('rDistInfo').textContent=d?f+' → '+t+': '+d+' km':'Not in database — enter manually.';
}
function costs(){
  const d=parseFloat($('rDist')?.value||0),fp=parseFloat($('rFuel')?.value||295);
  const kml=parseFloat($('rKml')?.value||8),ton=parseFloat($('rTons')?.value||5);
  const drv=parseFloat($('rDriver')?.value||0); if(!d) return null;
  const fOW=(d/kml)*fp;
  return{d,fp,kml,ton,drv,fOW,fRT:fOW*2,totOW:fOW+drv,p100:Math.round((fOW+drv)/(ton*10))};
}
function calcRoute(){
  const c=costs(); if(!c){alert('Enter distance.');return;}
  $('rCostBox').style.display='block';
  $('rCostBox').innerHTML=\`
    <div class="rr"><span class="l">One-way fuel (\${c.d}km @ \${c.kml}km/L × ₨\${c.fp}/L)</span><span class="v">₨\${Math.round(c.fOW).toLocaleString()}</span></div>
    <div class="rr"><span class="l">Driver / misc</span><span class="v">₨\${c.drv.toLocaleString()}</span></div>
    <div class="rr"><span class="l"><strong>Total one-way cost</strong></span><span class="v pos">₨\${Math.round(c.totOW).toLocaleString()}</span></div>
    <div class="rr"><span class="l">Cost per kg (÷ \${c.ton}t)</span><span class="v">₨\${(c.p100/100).toFixed(2)}/kg</span></div>
    <div class="rr"><span class="l">Round-trip fuel</span><span class="v">₨\${Math.round(c.fRT).toLocaleString()}</span></div>
  \`;
}
let _optBuf=null;
function calcPnl(){
  const c=costs(),out=$('rCOut')?.value,ret=$('rCRet')?.value;
  const pd=parseInt($('rPDays')?.value||'30'),fr=$('rFrom')?.value,to=$('rTo')?.value;
  if(!c||!fr||!to||!out){alert('Set route and commodity.');return;}
  const bO=avgPx(out,fr,pd),sO=avgPx(out,to,pd);
  if(!bO||!sO){$('rPnlBox').style.display='block';$('rPnlBox').innerHTML='<p style="color:var(--muted)">No price data for this route.</p>';return;}
  const gO=(sO-bO)*c.ton*10,nO=gO-c.totOW;
  let rH='',nR=0;
  if(ret){
    const bR=avgPx(ret,to,pd),sR=avgPx(ret,fr,pd);
    if(bR&&sR){
      const gR=(sR-bR)*c.ton*10; nR=gR-c.fOW;
      rH=\`<div class="rr"><span class="l">Return buy \${esc(ret)} in \${esc(to)}</span><span class="v">₨\${(bR/100).toFixed(2)}/kg</span></div>
        <div class="rr"><span class="l">Return sell \${esc(ret)} in \${esc(fr)}</span><span class="v">₨\${(sR/100).toFixed(2)}/kg</span></div>
        <div class="rr"><span class="l">Return gross</span><span class="v">₨\${Math.round(gR).toLocaleString()}</span></div>
        <div class="rr"><span class="l">Return fuel</span><span class="v">-₨\${Math.round(c.fOW).toLocaleString()}</span></div>
        <div class="rr"><span class="l">Return net</span><span class="v \${nR>=0?'pos':'neg'}">\${pkr(nR)}</span></div>\`;
    }
  }
  const tot=nO+nR;
  $('rPnlBox').style.display='block';
  $('rPnlBox').innerHTML=\`
    <div class="rr"><span class="l">Buy \${esc(out)} in \${esc(fr)} (\${pd}d avg)</span><span class="v">₨\${(bO/100).toFixed(2)}/kg</span></div>
    <div class="rr"><span class="l">Sell \${esc(out)} in \${esc(to)}</span><span class="v">₨\${(sO/100).toFixed(2)}/kg</span></div>
    <div class="rr"><span class="l">Outbound gross (\${c.ton}t)</span><span class="v">₨\${Math.round(gO).toLocaleString()}</span></div>
    <div class="rr"><span class="l">Fuel + driver</span><span class="v">-₨\${Math.round(c.totOW).toLocaleString()}</span></div>
    <div class="rr"><span class="l">Outbound net</span><span class="v \${nO>=0?'pos':'neg'}">\${pkr(nO)}</span></div>
    \${rH}
    <div class="rr" style="border-top:2px solid var(--bdr);margin-top:6px;padding-top:6px">
      <span class="l big"><strong>TOTAL NET PROFIT</strong></span>
      <span class="v big \${tot>=0?'pos':'neg'}">\${pkr(tot)}</span>
    </div>
    <div style="margin-top:6px;font-size:.72em;color:var(--muted)">\${pd}-day avg. Verify before loading.</div>
  \`;
}
function optimize(){
  const c=costs(),fr=$('rFrom')?.value,to=$('rTo')?.value;
  const pd=parseInt($('rPDays')?.value||'30');
  if(!c||!fr||!to){alert('Set route.');return;}
  const res=[];
  for(const cO of D.commodities){
    const bO=avgPx(cO,fr,pd),sO=avgPx(cO,to,pd); if(!bO||!sO) continue;
    const nO=(sO-bO)*c.ton*10-c.totOW;
    res.push({cO,cR:null,nO,nR:0,tot:nO});
    for(const cR of D.commodities){
      const bR=avgPx(cR,to,pd),sR=avgPx(cR,fr,pd); if(!bR||!sR) continue;
      const nR=(sR-bR)*c.ton*10-c.fOW;
      res.push({cO,cR,nO,nR,tot:nO+nR});
    }
  }
  res.sort((a,b)=>b.tot-a.tot);
  _optBuf={fr,to,c,top:res.slice(0,10)};
  $('optMeta').innerHTML=\`\${fr} ↔ \${to} · \${c.ton}t · \${pd}d avg · \${c.d}km\`;
  $('optCard').style.display='block';
  $('optRows').innerHTML=_optBuf.top.map((r,i)=>\`
    <div class="optrow">
      <div class="orank">#\${i+1}</div>
      <div class="odesc">
        <strong>Out:</strong> \${esc(r.cO)} &nbsp;·&nbsp; <strong>Return:</strong> \${r.cR?esc(r.cR):'<em style="color:var(--muted)">empty</em>'}
        <br><small style="color:var(--muted)">Out: \${pkr(r.nO)} · Ret: \${r.cR?pkr(r.nR):'₨0'}</small>
      </div>
      <div class="oprofit \${r.tot>=0?'pos':'neg'}">\${pkr(r.tot)}</div>
      <button class="btn-wa" onclick='rtWa(\${JSON.stringify(r.cO)},\${r.cR?JSON.stringify(r.cR):null},\${JSON.stringify(fr)},\${JSON.stringify(to)},\${r.tot})'>📲</button>
    </div>\`).join('');
}
function copyOptWa(){
  if(!_optBuf) return;
  const r=_optBuf.top[0];
  rtWa(r.cO,r.cR,_optBuf.fr,_optBuf.to,r.tot);
}

// ── WHAT-IF ───────────────────────────────────────────────────────────────────
function calcWI(){
  const buy=parseFloat($('wiBuy')?.value||0),sell=parseFloat($('wiSell')?.value||0);
  const qty=parseFloat($('wiQty')?.value||5),d=parseFloat($('wiDist')?.value||0);
  const fp=parseFloat($('wiFuel')?.value||295),kml=parseFloat($('wiKml')?.value||8);
  const xtra=parseFloat($('wiExtra')?.value||0),legs=parseInt($('wiRt')?.value||1);
  if(!buy||!sell){$('wiResult').innerHTML='<p style="color:var(--muted);text-align:center">Enter buy and sell prices.</p>';return;}
  const gross=(sell-buy)*100*qty*10,fuel=d>0?(d*legs/kml)*fp:0,total=fuel+xtra,net=gross-total;
  $('wiResult').innerHTML=\`
    <div class="rr"><span class="l">Buy price</span><span class="v">₨\${buy}/kg</span></div>
    <div class="rr"><span class="l">Sell price</span><span class="v">₨\${sell}/kg</span></div>
    <div class="rr"><span class="l">Margin per kg</span><span class="v">₨\${(sell-buy).toFixed(2)}</span></div>
    <div class="rr"><span class="l">Gross (\${qty}t = \${qty*10}×100kg)</span><span class="v">₨\${Math.round(gross).toLocaleString()}</span></div>
    \${d>0?\`<div class="rr"><span class="l">Fuel (\${d*legs}km)</span><span class="v">-₨\${Math.round(fuel).toLocaleString()}</span></div>\`:''}
    \${xtra>0?\`<div class="rr"><span class="l">Driver/other</span><span class="v">-₨\${Math.round(xtra).toLocaleString()}</span></div>\`:''}
    <div class="rr" style="border-top:2px solid var(--bdr);margin-top:4px;padding-top:4px">
      <span class="l big"><strong>NET PROFIT</strong></span>
      <span class="v big \${net>=0?'pos':'neg'}">\${pkr(net)}</span>
    </div>
    <div class="rr"><span class="l">Net per kg</span><span class="v">₨\${(net/(qty*1000)).toFixed(2)}</span></div>
    \${total>0?\`<div class="rr"><span class="l">ROI on costs</span><span class="v">\${((net/total)*100).toFixed(1)}%</span></div>\`:''}
  \`;
}
function renderWiHist(){
  const comm=$('wiComm')?.value,fr=$('wiFrom')?.value,to=$('wiTo')?.value;
  const days=parseInt($('wiDays')?.value||'30');
  if(!comm||!fr||!to) return;
  const sf=(D.priceMap[comm]||{})[fr]||[],st=(D.priceMap[comm]||{})[to]||[];
  const cut=days>0?new Date(Date.now()-days*86400000).toISOString().slice(0,10):'';
  const ff=days>0?sf.filter(p=>p.date>=cut):sf,ft=days>0?st.filter(p=>p.date>=cut):st;
  const dates=[...new Set([...ff.map(p=>p.date),...ft.map(p=>p.date)])].sort((a,b)=>b.localeCompare(a));
  if(!dates.length){$('wiHistTbl').innerHTML='<p style="padding:12px;color:var(--muted)">No data.</p>';return;}
  const km=dist(fr,to),tk=km?trk100(km):null;
  const rows=dates.map(date=>{
    const pf=ff.find(p=>p.date===date)?.p,pt=ft.find(p=>p.date===date)?.p;
    const sp=(pf&&pt)?pt-pf:null,net=(sp!=null&&tk!=null)?sp-tk:null;
    const cls=net==null?'':net>0?'color:var(--up)':'color:var(--dn)';
    return \`<tr>
      <td>\${date}</td>
      <td>\${pf?'₨'+(pf/100).toFixed(2):'—'}</td>
      <td>\${pt?'₨'+(pt/100).toFixed(2):'—'}</td>
      <td>\${sp!=null?'₨'+(sp/100).toFixed(2):'—'}</td>
      <td>\${tk!=null?'₨'+(tk/100).toFixed(2):'—'}</td>
      <td style="\${cls}">\${net!=null?'₨'+(net/100).toFixed(2):'—'}</td>
    </tr>\`;
  }).join('');
  $('wiHistTbl').innerHTML=\`<table><thead><tr>
    <th>Date</th><th>Buy ₨/kg (\${esc(fr)})</th><th>Sell ₨/kg (\${esc(to)})</th>
    <th>Spread/kg</th><th>Truck/kg</th><th>Net/kg</th>
  </tr></thead><tbody>\${rows}</tbody></table>\`;
}

document.addEventListener('DOMContentLoaded', init);
</script>
</body>
</html>`;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const args      = process.argv.slice(2);
  const probeOnly = args.includes('--probe');
  const planOnly  = args.includes('--plan-only');
  const fetchAll  = args.includes('--all');
  const daysArg   = args.find(a => /^--days[=\s]/.test(a));
  const days      = daysArg ? parseInt(daysArg.replace(/^--days[=\s]/, '')) : 60;
  const pruneArg  = args.find(a => /^--prune[=\s]/.test(a));
  const pruneDays = pruneArg ? parseInt(pruneArg.replace(/^--prune[=\s]/, '')) : 0;

  console.log('\n' + '─'.repeat(58));
  console.log('  🚚  AMIS Historical Arbitrage Planner');
  console.log('─'.repeat(58) + '\n');

  if (probeOnly) {
    try {
      const list = await discoverCommodities();
      console.log('\nAll commodities:');
      list.forEach(c => console.log(`  id=${c.id.padEnd(4)} key=${(c.key||'—').padEnd(18)} ${c.name}`));
    } catch (err) { warn(err.message); }
    return;
  }

  let records = loadExisting();
  log(`Existing records: ${records.length}`);

  let arrivalRecords = loadExistingArrivals();
  log(`Existing arrival records: ${arrivalRecords.length}`);

  let uploadData  = loadUploadTimes();
  let changesData = loadDailyChanges();

  if (!planOnly) {
    const fresh = await scrapeHistory(days, fetchAll);
    if (fresh.length > 0) records = mergeAndSave(fresh, records);
    else log('No new records scraped — generating planner from existing data.');

    // Scrape arrivals: last 14 days (more than price days to build a good avg baseline)
    const freshArrivals = await scrapeArrivals(Math.max(days, 14));
    if (freshArrivals.length > 0) arrivalRecords = mergeAndSaveArrivals(freshArrivals, arrivalRecords);
    else log('No new arrival records scraped.');

    // Scrape rate upload times (today only — always refresh)
    const freshUpload = await scrapeRateStats();
    if (freshUpload) { saveUploadTimes(freshUpload); uploadData = freshUpload; }

    // Scrape daily market changes (today only — always refresh)
    const freshChanges = await scrapeDailyChanges();
    if (freshChanges) { saveDailyChanges(freshChanges); changesData = freshChanges; }
  }

  // Prune old records to keep file size manageable (--prune=90 keeps last 90 days)
  if (pruneDays > 0) {
    const cutoff = new Date(Date.now() - pruneDays * 86400000).toISOString().slice(0, 10);
    const before = records.length;
    records = records.filter(r => r.date >= cutoff);
    if (records.length < before) {
      log(`Pruned ${before - records.length} records older than ${cutoff} (keeping last ${pruneDays} days)`);
      mergeAndSave([], records); // re-save pruned data
    }
    // Prune arrivals too (keep 30 days — plenty for % calc)
    const arrivalCutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const arrBefore = arrivalRecords.length;
    arrivalRecords = arrivalRecords.filter(r => r.date >= arrivalCutoff);
    if (arrivalRecords.length < arrBefore) {
      log(`Pruned ${arrBefore - arrivalRecords.length} arrival records older than ${arrivalCutoff}`);
      mergeAndSaveArrivals([], arrivalRecords);
    }
  }

  if (records.length === 0) {
    warn('No data available. The planner will open but show empty tables.');
    warn('Run again without --plan-only once AMIS is reachable.');
  }

  log('Generating planner.html…');
  const html = generatePlannerHtml(records, arrivalRecords, uploadData, changesData);
  const dir  = path.dirname(PLAN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PLAN_FILE, html, 'utf8');

  console.log('\n' + '─'.repeat(58));
  console.log(`  ✅  Planner ready → ${PLAN_FILE}`);
  console.log('─'.repeat(58) + '\n');
}

main().catch(err => { console.error('[browse] Fatal:', err.message); process.exit(1); });

module.exports = { generatePlannerHtml, scrapeHistory, loadExisting, mergeAndSave, scrapeArrivals, loadExistingArrivals, mergeAndSaveArrivals, scrapeRateStats, scrapeDailyChanges, loadUploadTimes, saveUploadTimes, loadDailyChanges, saveDailyChanges };
