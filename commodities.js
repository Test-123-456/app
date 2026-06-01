/**
 * commodities.js — Master commodity database (116 items)
 *
 * Each entry defines:
 *   label       : display name in reports
 *   category    : grouping used in HTML report
 *   hsCode      : HS-6 digit code — used for UN Comtrade price lookup
 *   aliases     : keywords for AMIS.pk / PBS scraper matching
 *   pkr100kg    : emergency fallback local price PKR / 100 kg (2024 estimates)
 *   usdPerTon   : emergency fallback world price USD / metric ton
 *   localNote   : context note shown in report
 *   worldSource : citation for world reference (shown when Comtrade unavailable)
 *   hasFutures  : true = prices.js overlays a live futures price
 *   valueAdded  : true = processed / manufactured item
 *
 * Prices in reports come from:
 *   LOCAL  → AMIS.pk scrape → PBS.gov.pk scrape → pkr100kg fallback
 *   WORLD  → Yahoo Finance futures → UN Comtrade unit value → usdPerTon fallback
 *
 * To add a commodity: add one entry here — every other module reads this file.
 */

'use strict';

const DB = {

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAINS & CEREALS
  // ═══════════════════════════════════════════════════════════════════════════

  wheat: {
    label: 'Wheat', category: 'Grains & Cereals',
    hsCode: '100199',
    aliases: ['wheat', 'gandum', 'gehun'],
    pkr100kg: 3700, usdPerTon: 240,
    localNote: 'Near govt support price 2024', worldSource: 'CBOT futures / WB Pink Sheet',
    hasFutures: true,
  },
  rice_basmati: {
    label: 'Rice — Basmati', category: 'Grains & Cereals',
    hsCode: '100630',
    aliases: ['basmati', 'super kernel', 'kainat', '1121', 'pusa'],
    pkr100kg: 22000, usdPerTon: 1100,
    localNote: 'Super Kernel / 1121 milled avg', worldSource: 'USDA / ITC basmati FOB 2024',
  },
  rice_irri: {
    label: 'Rice — IRRI / Long-grain', category: 'Grains & Cereals',
    hsCode: '100630',
    aliases: ['rice', 'irri', 'chawal', 'irri-6', 'paddy'],
    pkr100kg: 9500, usdPerTon: 430,
    localNote: 'IRRI-6 milled avg', worldSource: 'CBOT Rough Rice / WB Pink Sheet',
    hasFutures: true,
  },
  corn: {
    label: 'Corn / Maize', category: 'Grains & Cereals',
    hsCode: '100590',
    aliases: ['corn', 'maize', 'makka', 'makkai'],
    pkr100kg: 4000, usdPerTon: 190,
    localNote: 'Farm-gate Punjab avg', worldSource: 'CBOT futures',
    hasFutures: true,
  },
  barley: {
    label: 'Barley', category: 'Grains & Cereals',
    hsCode: '100390',
    aliases: ['barley', 'jau'],
    pkr100kg: 3200, usdPerTon: 180,
    localNote: 'Punjab mandi avg', worldSource: 'FAO reference 2023-24',
  },
  millet: {
    label: 'Millet (Bajra)', category: 'Grains & Cereals',
    hsCode: '100890',
    aliases: ['millet', 'bajra', 'jowar'],
    pkr100kg: 3500, usdPerTon: 230,
    localNote: 'Punjab/Sindh avg', worldSource: 'FAO reference 2023-24',
  },
  sorghum: {
    label: 'Sorghum (Jowar)', category: 'Grains & Cereals',
    hsCode: '100700',
    aliases: ['sorghum', 'jowar', 'jawri'],
    pkr100kg: 3200, usdPerTon: 220,
    localNote: 'Farm-gate avg', worldSource: 'FAO reference 2023-24',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FRESH FRUITS
  // ═══════════════════════════════════════════════════════════════════════════

  mango: {
    label: 'Mango', category: 'Fresh Fruits',
    hsCode: '080450',
    aliases: ['mango', 'mangoes', 'aam', 'sindhri', 'chaunsa', 'anwar ratol', 'langra'],
    pkr100kg: 9000, usdPerTon: 950,
    localNote: 'Sindhri export grade Sindh avg', worldSource: 'FAO/ITC reference 2023-24',
  },
  kinnow: {
    label: 'Kinnow Orange', category: 'Fresh Fruits',
    hsCode: '080520',
    aliases: ['kinnow', 'kinno', 'kino', 'citrus', 'malta', 'mandarin'],
    pkr100kg: 4500, usdPerTon: 550,
    localNote: 'Peak-season Sargodha avg', worldSource: 'ITC trade data 2023',
  },
  orange: {
    label: 'Orange (Navel/Blood)', category: 'Fresh Fruits',
    hsCode: '080510',
    aliases: ['orange', 'navel orange', 'blood orange', 'narangi'],
    pkr100kg: 5000, usdPerTon: 580,
    localNote: 'Punjab/KPK avg', worldSource: 'FAO reference 2023-24',
  },
  guava: {
    label: 'Guava', category: 'Fresh Fruits',
    hsCode: '080450',
    aliases: ['guava', 'amrood', 'amrud'],
    pkr100kg: 3000, usdPerTon: 400,
    localNote: 'Allahabad Safeda / seedless avg', worldSource: 'FAO reference 2023-24',
  },
  banana: {
    label: 'Banana', category: 'Fresh Fruits',
    hsCode: '080300',
    aliases: ['banana', 'kela', 'kella'],
    pkr100kg: 3500, usdPerTon: 300,
    localNote: 'Sindh Cavendish avg', worldSource: 'FAO/WB reference 2023-24',
  },
  papaya: {
    label: 'Papaya', category: 'Fresh Fruits',
    hsCode: '080720',
    aliases: ['papaya', 'papita', 'papeeta'],
    pkr100kg: 3500, usdPerTon: 500,
    localNote: 'Sindh/Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  watermelon: {
    label: 'Watermelon', category: 'Fresh Fruits',
    hsCode: '080711',
    aliases: ['watermelon', 'tarboz', 'tarbooz'],
    pkr100kg: 2000, usdPerTon: 280,
    localNote: 'Summer season avg', worldSource: 'FAO reference 2023-24',
  },
  melon: {
    label: 'Melon / Cantaloupe', category: 'Fresh Fruits',
    hsCode: '080719',
    aliases: ['melon', 'cantaloupe', 'kharbooza', 'kharbooze'],
    pkr100kg: 2500, usdPerTon: 380,
    localNote: 'Punjab/Sindh summer avg', worldSource: 'FAO reference 2023-24',
  },
  apple: {
    label: 'Apple', category: 'Fresh Fruits',
    hsCode: '080810',
    aliases: ['apple', 'seb', 'sab'],
    pkr100kg: 8000, usdPerTon: 550,
    localNote: 'Swat/Balochistan local variety avg', worldSource: 'FAO reference 2023-24',
  },
  grape: {
    label: 'Grape', category: 'Fresh Fruits',
    hsCode: '080610',
    aliases: ['grape', 'grapes', 'angoor', 'angur'],
    pkr100kg: 8000, usdPerTon: 750,
    localNote: 'Balochistan/Swat avg', worldSource: 'FAO reference 2023-24',
  },
  pomegranate: {
    label: 'Pomegranate', category: 'Fresh Fruits',
    hsCode: '081090',
    aliases: ['pomegranate', 'anar', 'dhadam'],
    pkr100kg: 12000, usdPerTon: 900,
    localNote: 'Kandahar-variety Balochistan avg', worldSource: 'ITC reference 2023',
  },
  apricot_fresh: {
    label: 'Apricot (Fresh)', category: 'Fresh Fruits',
    hsCode: '080910',
    aliases: ['apricot', 'fresh apricot', 'khumani', 'khurmani', 'zardalu'],
    pkr100kg: 8000, usdPerTon: 700,
    localNote: 'Gilgit-Baltistan summer avg', worldSource: 'FAO reference 2023-24',
  },
  peach: {
    label: 'Peach', category: 'Fresh Fruits',
    hsCode: '080930',
    aliases: ['peach', 'aadu', 'aroo', 'shaftalu'],
    pkr100kg: 6000, usdPerTon: 600,
    localNote: 'KPK/GB avg', worldSource: 'FAO reference 2023-24',
  },
  plum: {
    label: 'Plum / Alucha', category: 'Fresh Fruits',
    hsCode: '080940',
    aliases: ['plum', 'alucha', 'alocha', 'aloo bukhara'],
    pkr100kg: 5000, usdPerTon: 550,
    localNote: 'KPK/GB avg', worldSource: 'FAO reference 2023-24',
  },
  pear: {
    label: 'Pear', category: 'Fresh Fruits',
    hsCode: '080820',
    aliases: ['pear', 'nashpati', 'amrood'],
    pkr100kg: 5000, usdPerTon: 550,
    localNote: 'KPK/Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  strawberry: {
    label: 'Strawberry', category: 'Fresh Fruits',
    hsCode: '081010',
    aliases: ['strawberry', 'strawberries', 'falsa'],
    pkr100kg: 12000, usdPerTon: 1200,
    localNote: 'Lahore/Isb peri-urban avg', worldSource: 'FAO reference 2023-24',
  },
  cherry: {
    label: 'Cherry (Gilgit)', category: 'Fresh Fruits',
    hsCode: '080920',
    aliases: ['cherry', 'cherries', 'gilas', 'gilass'],
    pkr100kg: 25000, usdPerTon: 3000,
    localNote: 'Gilgit-Baltistan premium summer', worldSource: 'ITC reference 2023',
  },
  lychee: {
    label: 'Lychee', category: 'Fresh Fruits',
    hsCode: '081090',
    aliases: ['lychee', 'litchi', 'leechi'],
    pkr100kg: 10000, usdPerTon: 1100,
    localNote: 'Punjab June harvest avg', worldSource: 'FAO reference 2023-24',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DRIED FRUITS & NUTS
  // ═══════════════════════════════════════════════════════════════════════════

  dates: {
    label: 'Dates (Dried)', category: 'Dried Fruits & Nuts',
    hsCode: '080410',
    aliases: ['dates', 'date', 'khajoor', 'khurma', 'aseel', 'fasli'],
    pkr100kg: 18000, usdPerTon: 1400,
    localNote: 'Balochistan Aseel/Fasli avg', worldSource: 'ITC dried-fruit reference 2023',
  },
  apricot_dried: {
    label: 'Apricot (Dried)', category: 'Dried Fruits & Nuts',
    hsCode: '081310',
    aliases: ['dried apricot', 'khumani dried', 'khushk khurmani'],
    pkr100kg: 35000, usdPerTon: 2800,
    localNote: 'GB sun-dried avg', worldSource: 'ITC reference 2023-24',
  },
  raisins: {
    label: 'Raisins', category: 'Dried Fruits & Nuts',
    hsCode: '080620',
    aliases: ['raisins', 'raisin', 'kishmish', 'munakka'],
    pkr100kg: 12000, usdPerTon: 1200,
    localNote: 'Balochistan/NWFP avg', worldSource: 'FAO reference 2023-24',
  },
  walnut: {
    label: 'Walnut (Shelled)', category: 'Dried Fruits & Nuts',
    hsCode: '080232',
    aliases: ['walnut', 'akhrot', 'akhrood'],
    pkr100kg: 60000, usdPerTon: 4500,
    localNote: 'GB shelled export grade avg', worldSource: 'ITC reference 2023',
  },
  pine_nuts: {
    label: 'Pine Nuts (Chilgoza)', category: 'Dried Fruits & Nuts',
    hsCode: '080290',
    aliases: ['pine nuts', 'chilgoza', 'pignolia', 'neza'],
    pkr100kg: 200000, usdPerTon: 18000,
    localNote: 'Suleiman Range hand-picked avg', worldSource: 'ITC specialty nuts 2023',
  },
  almond: {
    label: 'Almond', category: 'Dried Fruits & Nuts',
    hsCode: '080212',
    aliases: ['almond', 'almonds', 'badam'],
    pkr100kg: 80000, usdPerTon: 6500,
    localNote: 'GB/Balochistan wild almond avg', worldSource: 'ITC reference 2023',
  },
  fig_dried: {
    label: 'Fig (Dried)', category: 'Dried Fruits & Nuts',
    hsCode: '080420',
    aliases: ['fig', 'figs', 'dried fig', 'anjeer', 'injeer'],
    pkr100kg: 25000, usdPerTon: 2200,
    localNote: 'Balochistan sun-dried avg', worldSource: 'FAO/ITC reference 2023',
  },
  mulberry_dried: {
    label: 'Mulberry (Dried)', category: 'Dried Fruits & Nuts',
    hsCode: '081390',
    aliases: ['mulberry', 'mulberries', 'shahtoot', 'toot'],
    pkr100kg: 20000, usdPerTon: 2500,
    localNote: 'Punjab/KPK dried avg', worldSource: 'ITC reference 2023',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VEGETABLES
  // ═══════════════════════════════════════════════════════════════════════════

  onion: {
    label: 'Onion', category: 'Vegetables',
    hsCode: '070310',
    aliases: ['onion', 'onions', 'pyaz', 'piyaz', 'gandana'],
    pkr100kg: 3500, usdPerTon: 320,
    localNote: 'Mid-season Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  potato: {
    label: 'Potato', category: 'Vegetables',
    hsCode: '070190',
    aliases: ['potato', 'potatoes', 'aloo', 'aaloo'],
    pkr100kg: 2800, usdPerTon: 290,
    localNote: 'Punjab avg farm gate', worldSource: 'World Bank reference 2023-24',
  },
  tomato: {
    label: 'Tomato', category: 'Vegetables',
    hsCode: '070200',
    aliases: ['tomato', 'tamatar', 'tamaatar'],
    pkr100kg: 4000, usdPerTon: 480,
    localNote: 'Summer avg (winter/spring spikes)', worldSource: 'FAO reference 2023-24',
  },
  garlic: {
    label: 'Garlic', category: 'Vegetables',
    hsCode: '070320',
    aliases: ['garlic', 'lehsun', 'lasan', 'lassan'],
    pkr100kg: 35000, usdPerTon: 1200,
    localNote: 'Punjab/Balochistan bulb avg', worldSource: 'FAO reference 2023-24',
  },
  ginger: {
    label: 'Ginger (Fresh)', category: 'Vegetables',
    hsCode: '091011',
    aliases: ['ginger', 'adrak', 'adarak'],
    pkr100kg: 18000, usdPerTon: 1200,
    localNote: 'Punjab/KPK farm avg', worldSource: 'FAO reference 2023-24',
  },
  chili_fresh: {
    label: 'Chili (Fresh Green/Red)', category: 'Vegetables',
    hsCode: '070960',
    aliases: ['fresh chili', 'green chili', 'red chili fresh', 'hari mirch', 'lal mirch taza'],
    pkr100kg: 8000, usdPerTon: 800,
    localNote: 'Punjab/Sindh season avg', worldSource: 'FAO reference 2023-24',
  },
  okra: {
    label: 'Okra / Lady Finger', category: 'Vegetables',
    hsCode: '070999',
    aliases: ['okra', 'bhindi', 'lady finger', 'ladyfinger'],
    pkr100kg: 5000, usdPerTon: 700,
    localNote: 'Punjab summer avg', worldSource: 'FAO reference 2023-24',
  },
  carrot: {
    label: 'Carrot', category: 'Vegetables',
    hsCode: '070610',
    aliases: ['carrot', 'carrots', 'gajar'],
    pkr100kg: 3000, usdPerTon: 380,
    localNote: 'Punjab winter avg', worldSource: 'FAO reference 2023-24',
  },
  spinach: {
    label: 'Spinach', category: 'Vegetables',
    hsCode: '070970',
    aliases: ['spinach', 'palak', 'saag'],
    pkr100kg: 2500, usdPerTon: 550,
    localNote: 'Punjab winter avg', worldSource: 'FAO reference 2023-24',
  },
  cucumber: {
    label: 'Cucumber', category: 'Vegetables',
    hsCode: '070700',
    aliases: ['cucumber', 'kheera', 'khira'],
    pkr100kg: 3000, usdPerTon: 400,
    localNote: 'Summer season avg', worldSource: 'FAO reference 2023-24',
  },
  cauliflower: {
    label: 'Cauliflower', category: 'Vegetables',
    hsCode: '070410',
    aliases: ['cauliflower', 'phool gobi', 'gobi'],
    pkr100kg: 3000, usdPerTon: 500,
    localNote: 'Winter season avg', worldSource: 'FAO reference 2023-24',
  },
  cabbage: {
    label: 'Cabbage', category: 'Vegetables',
    hsCode: '070490',
    aliases: ['cabbage', 'bandgobi', 'band gobi', 'kobi'],
    pkr100kg: 2000, usdPerTon: 280,
    localNote: 'Winter season avg', worldSource: 'FAO reference 2023-24',
  },
  peas_fresh: {
    label: 'Peas (Fresh)', category: 'Vegetables',
    hsCode: '070810',
    aliases: ['peas', 'matar', 'fresh peas', 'green peas'],
    pkr100kg: 5000, usdPerTon: 550,
    localNote: 'Winter Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  brinjal: {
    label: 'Brinjal / Eggplant', category: 'Vegetables',
    hsCode: '070993',
    aliases: ['brinjal', 'eggplant', 'baingan', 'banjan'],
    pkr100kg: 3000, usdPerTon: 400,
    localNote: 'Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  bitter_gourd: {
    label: 'Bitter Gourd (Karela)', category: 'Vegetables',
    hsCode: '070999',
    aliases: ['bitter gourd', 'karela', 'karella'],
    pkr100kg: 6000, usdPerTon: 800,
    localNote: 'Summer season avg', worldSource: 'FAO reference 2023-24',
  },
  capsicum: {
    label: 'Capsicum / Bell Pepper', category: 'Vegetables',
    hsCode: '070960',
    aliases: ['capsicum', 'bell pepper', 'shimla mirch'],
    pkr100kg: 7000, usdPerTon: 850,
    localNote: 'Punjab/Sindh avg', worldSource: 'FAO reference 2023-24',
  },
  pumpkin: {
    label: 'Pumpkin / Squash', category: 'Vegetables',
    hsCode: '070993',
    aliases: ['pumpkin', 'squash', 'kaddu', 'loki'],
    pkr100kg: 2000, usdPerTon: 280,
    localNote: 'Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  moringa_leaves: {
    label: 'Moringa Leaves (Fresh)', category: 'Vegetables',
    hsCode: '070999',
    aliases: ['moringa', 'moringa leaves', 'sohnjana', 'drumstick leaves'],
    pkr100kg: 4000, usdPerTon: 1100,
    localNote: 'Punjab/Sindh farm avg', worldSource: 'ITC specialty reference 2023',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SPICES & HERBS
  // ═══════════════════════════════════════════════════════════════════════════

  chili_dried: {
    label: 'Chili (Dried Red)', category: 'Spices & Herbs',
    hsCode: '090421',
    aliases: ['dried chili', 'dry red chili', 'lal mirch sukhi', 'red chilli'],
    pkr100kg: 40000, usdPerTon: 2000,
    localNote: 'Kunri/Sindh premium grade avg', worldSource: 'ITC spice reference 2023-24',
  },
  cumin: {
    label: 'Cumin Seeds (Zeera)', category: 'Spices & Herbs',
    hsCode: '090930',
    aliases: ['cumin', 'zeera', 'jeera', 'cumin seeds'],
    pkr100kg: 55000, usdPerTon: 3500,
    localNote: 'Balochistan/Sindh export grade', worldSource: 'ITC spice reference 2023-24',
  },
  coriander_seeds: {
    label: 'Coriander Seeds (Dhania)', category: 'Spices & Herbs',
    hsCode: '090920',
    aliases: ['coriander', 'dhania', 'coriander seeds'],
    pkr100kg: 8000, usdPerTon: 1200,
    localNote: 'Punjab/Sindh farm avg', worldSource: 'FAO reference 2023-24',
  },
  fennel_seeds: {
    label: 'Fennel Seeds (Saunf)', category: 'Spices & Herbs',
    hsCode: '090950',
    aliases: ['fennel', 'saunf', 'fennel seeds', 'souf'],
    pkr100kg: 18000, usdPerTon: 1800,
    localNote: 'Punjab/KPK avg', worldSource: 'ITC reference 2023-24',
  },
  fenugreek_seeds: {
    label: 'Fenugreek Seeds (Methi)', category: 'Spices & Herbs',
    hsCode: '121190',
    aliases: ['fenugreek', 'methi', 'methi dana', 'fenugreek seeds'],
    pkr100kg: 8000, usdPerTon: 1100,
    localNote: 'Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  turmeric_raw: {
    label: 'Turmeric (Raw Root)', category: 'Spices & Herbs',
    hsCode: '091030',
    aliases: ['turmeric', 'haldi', 'haldee'],
    pkr100kg: 15000, usdPerTon: 1100,
    localNote: 'Sindh/Punjab raw rhizome avg', worldSource: 'ITC spice reference 2023-24',
  },
  ajwain: {
    label: 'Carom Seeds (Ajwain)', category: 'Spices & Herbs',
    hsCode: '091099',
    aliases: ['ajwain', 'carom', 'carom seeds', 'ajwan'],
    pkr100kg: 20000, usdPerTon: 1600,
    localNote: 'Punjab/Sindh avg', worldSource: 'ITC reference 2023-24',
  },
  mint_dried: {
    label: 'Mint (Dried)', category: 'Spices & Herbs',
    hsCode: '121190',
    aliases: ['dried mint', 'pudina', 'mint dry', 'peppermint dry'],
    pkr100kg: 15000, usdPerTon: 3000,
    localNote: 'Punjab dried avg', worldSource: 'ITC reference 2023-24',
  },
  dill_seeds: {
    label: 'Dill Seeds (Sowa)', category: 'Spices & Herbs',
    hsCode: '090950',
    aliases: ['dill', 'dill seeds', 'sowa', 'sooa', 'suwa'],
    pkr100kg: 12000, usdPerTon: 1400,
    localNote: 'Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  nigella_seeds: {
    label: 'Nigella / Kalonji', category: 'Spices & Herbs',
    hsCode: '121190',
    aliases: ['nigella', 'kalonji', 'black seed', 'kalaunji'],
    pkr100kg: 25000, usdPerTon: 2200,
    localNote: 'Punjab export grade avg', worldSource: 'ITC reference 2023-24',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PULSES & LEGUMES
  // ═══════════════════════════════════════════════════════════════════════════

  chickpea: {
    label: 'Chickpea (Gram)', category: 'Pulses & Legumes',
    hsCode: '071320',
    aliases: ['chickpea', 'gram', 'chana', 'desi gram', 'kabuli'],
    pkr100kg: 22000, usdPerTon: 750,
    localNote: 'Desi gram Punjab avg', worldSource: 'FAO/ITC pulse reference 2023-24',
  },
  red_lentils: {
    label: 'Red Lentils (Masoor)', category: 'Pulses & Legumes',
    hsCode: '071340',
    aliases: ['lentils', 'masoor', 'red lentil', 'masoor dal'],
    pkr100kg: 18000, usdPerTon: 650,
    localNote: 'Punjab mandi avg', worldSource: 'FAO reference 2023-24',
  },
  mung_beans: {
    label: 'Mung Beans (Moong)', category: 'Pulses & Legumes',
    hsCode: '071331',
    aliases: ['mung', 'moong', 'mung bean', 'green gram', 'moong dal'],
    pkr100kg: 20000, usdPerTon: 800,
    localNote: 'Punjab/Sindh avg', worldSource: 'FAO reference 2023-24',
  },
  black_eyed_peas: {
    label: 'Black-eyed Peas (Lobia)', category: 'Pulses & Legumes',
    hsCode: '071390',
    aliases: ['lobia', 'black eyed peas', 'cowpea', 'chawali'],
    pkr100kg: 15000, usdPerTon: 650,
    localNote: 'Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  kidney_beans: {
    label: 'Kidney Beans (Rajma)', category: 'Pulses & Legumes',
    hsCode: '071335',
    aliases: ['kidney beans', 'rajma', 'raan beans', 'red kidney'],
    pkr100kg: 20000, usdPerTon: 750,
    localNote: 'Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  broad_beans: {
    label: 'Broad Beans (Bakla)', category: 'Pulses & Legumes',
    hsCode: '071310',
    aliases: ['broad beans', 'fava beans', 'bakla', 'sem'],
    pkr100kg: 12000, usdPerTon: 550,
    localNote: 'Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  pigeon_pea: {
    label: 'Pigeon Pea (Arhar/Toor)', category: 'Pulses & Legumes',
    hsCode: '071360',
    aliases: ['pigeon pea', 'arhar', 'toor dal', 'tur'],
    pkr100kg: 18000, usdPerTon: 700,
    localNote: 'Sindh avg', worldSource: 'FAO reference 2023-24',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OILSEEDS
  // ═══════════════════════════════════════════════════════════════════════════

  sesame: {
    label: 'Sesame Seeds (Til)', category: 'Oilseeds',
    hsCode: '120740',
    aliases: ['sesame', 'til', 'teel', 'simsim', 'sesame seed'],
    pkr100kg: 60000, usdPerTon: 1500,
    localNote: 'Punjab/Sindh natural white avg', worldSource: 'ITC oilseed reference 2023-24',
  },
  sunflower_seeds: {
    label: 'Sunflower Seeds', category: 'Oilseeds',
    hsCode: '120600',
    aliases: ['sunflower', 'sunflower seeds', 'surajmukhi'],
    pkr100kg: 6000, usdPerTon: 550,
    localNote: 'Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  mustard_seeds: {
    label: 'Mustard Seeds (Sarson)', category: 'Oilseeds',
    hsCode: '120791',
    aliases: ['mustard', 'sarson', 'mustard seeds', 'rai'],
    pkr100kg: 7000, usdPerTon: 550,
    localNote: 'Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  canola: {
    label: 'Canola / Rapeseed', category: 'Oilseeds',
    hsCode: '120510',
    aliases: ['canola', 'rapeseed', 'rape seed', 'toria'],
    pkr100kg: 7500, usdPerTon: 580,
    localNote: 'Punjab avg', worldSource: 'FAO reference 2023-24',
  },
  groundnut_shell: {
    label: 'Groundnut (In-shell)', category: 'Oilseeds',
    hsCode: '120210',
    aliases: ['groundnut', 'peanut', 'moongphali', 'moong phali'],
    pkr100kg: 7000, usdPerTon: 800,
    localNote: 'Punjab in-shell avg', worldSource: 'FAO reference 2023-24',
  },
  groundnut_shelled: {
    label: 'Groundnut (Shelled)', category: 'Oilseeds',
    hsCode: '120220',
    aliases: ['shelled groundnut', 'shelled peanut', 'peanut kernels'],
    pkr100kg: 12000, usdPerTon: 1200,
    localNote: 'Punjab shelled avg', worldSource: 'FAO reference 2023-24',
  },
  cottonseed: {
    label: 'Cottonseed (Binola)', category: 'Oilseeds',
    hsCode: '120720',
    aliases: ['cottonseed', 'binola', 'cotton seed'],
    pkr100kg: 4500, usdPerTon: 350,
    localNote: 'Punjab ginning by-product avg', worldSource: 'FAO reference 2023-24',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SUGAR & SWEETENERS
  // ═══════════════════════════════════════════════════════════════════════════

  sugar: {
    label: 'Sugar (Refined)', category: 'Sugar & Sweeteners',
    hsCode: '170199',
    aliases: ['sugar', 'cheeni', 'shakkar', 'refined sugar'],
    pkr100kg: 9000, usdPerTon: 420,
    localNote: 'Ex-mill refined white avg', worldSource: 'ICE Sugar #11 futures',
    hasFutures: true,
  },
  jaggery: {
    label: 'Jaggery (Gur)', category: 'Sugar & Sweeteners',
    hsCode: '170290',
    aliases: ['jaggery', 'gur', 'gud', 'rapadura'],
    pkr100kg: 11000, usdPerTon: 500,
    localNote: 'Punjab/Sindh avg', worldSource: 'ITC reference 2023-24',
  },
  honey: {
    label: 'Honey', category: 'Sugar & Sweeteners',
    hsCode: '040900',
    aliases: ['honey', 'shehad', 'shahed'],
    pkr100kg: 60000, usdPerTon: 3200,
    localNote: 'Sidr / wild honey avg', worldSource: 'ITC specialty reference 2023',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COTTON & FIBER (raw commodity)
  // ═══════════════════════════════════════════════════════════════════════════

  cotton: {
    label: 'Cotton (Lint)', category: 'Cotton & Fiber',
    hsCode: '520100',
    aliases: ['cotton', 'kapas', 'phutti', 'cotton lint', 'rui'],
    pkr100kg: 11500, usdPerTon: 1750,
    localNote: 'Phutti/seed cotton — lint equiv ~3× raw; price shown is for lint', worldSource: 'ICE Cotton #2 futures',
    hasFutures: true,
  },
  raw_wool: {
    label: 'Raw Wool', category: 'Cotton & Fiber',
    hsCode: '510111',
    aliases: ['wool', 'raw wool', 'oon', 'pashm'],
    pkr100kg: 18000, usdPerTon: 2200,
    localNote: 'Balochistan/KPK coarse wool avg', worldSource: 'IWTO reference 2023-24',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VALUE-ADDED — CONDIMENTS & PASTES
  // ═══════════════════════════════════════════════════════════════════════════

  mango_pulp: {
    label: 'Mango Pulp / Puree', category: 'Value-Added: Foods',
    hsCode: '200980',
    aliases: ['mango pulp', 'mango puree', 'aam pulp'],
    pkr100kg: 12000, usdPerTon: 800,
    localNote: 'Aseptic pack production cost avg', worldSource: 'ITC agro-processed 2023',
    valueAdded: true,
  },
  tomato_paste: {
    label: 'Tomato Paste (28-30%)', category: 'Value-Added: Foods',
    hsCode: '200290',
    aliases: ['tomato paste', 'tamatar paste', 'tomato puree'],
    pkr100kg: 12000, usdPerTon: 900,
    localNote: 'Local factory gate avg', worldSource: 'ITC agro-processed 2023',
    valueAdded: true,
  },
  tomato_ketchup: {
    label: 'Tomato Ketchup', category: 'Value-Added: Foods',
    hsCode: '210320',
    aliases: ['ketchup', 'tomato ketchup', 'tamatar sauce'],
    pkr100kg: 15000, usdPerTon: 1100,
    localNote: 'Branded factory avg', worldSource: 'ITC agro-processed 2023',
    valueAdded: true,
  },
  chili_sauce: {
    label: 'Chili Sauce / Hot Sauce', category: 'Value-Added: Foods',
    hsCode: '210390',
    aliases: ['chili sauce', 'hot sauce', 'mirch sauce'],
    pkr100kg: 20000, usdPerTon: 1500,
    localNote: 'Small-medium factory gate avg', worldSource: 'ITC reference 2023',
    valueAdded: true,
  },
  mango_pickle: {
    label: 'Mango Pickle (Achaar)', category: 'Value-Added: Foods',
    hsCode: '200819',
    aliases: ['mango pickle', 'aam achaar', 'achaar'],
    pkr100kg: 25000, usdPerTon: 1800,
    localNote: 'Traditional recipe factory avg', worldSource: 'ITC agro-processed 2023',
    valueAdded: true,
  },
  tamarind_paste: {
    label: 'Tamarind Paste / Block', category: 'Value-Added: Foods',
    hsCode: '200819',
    aliases: ['tamarind', 'imli', 'tamarind paste'],
    pkr100kg: 8000, usdPerTon: 700,
    localNote: 'Punjab/Sindh imli avg', worldSource: 'FAO reference 2023-24',
    valueAdded: true,
  },
  date_syrup: {
    label: 'Date Syrup / Dibs', category: 'Value-Added: Foods',
    hsCode: '210690',
    aliases: ['date syrup', 'dibs', 'khajoor syrup'],
    pkr100kg: 28000, usdPerTon: 2500,
    localNote: 'Balochistan processing avg', worldSource: 'ITC reference 2023',
    valueAdded: true,
  },
  fruit_jam: {
    label: 'Fruit Jam / Preserves', category: 'Value-Added: Foods',
    hsCode: '200799',
    aliases: ['jam', 'fruit jam', 'muraba', 'murabba'],
    pkr100kg: 15000, usdPerTon: 1200,
    localNote: 'Factory packed avg', worldSource: 'ITC agro-processed 2023',
    valueAdded: true,
  },
  dried_mango: {
    label: 'Dried Mango (Slices)', category: 'Value-Added: Foods',
    hsCode: '081340',
    aliases: ['dried mango', 'aam papad', 'mango slices dry'],
    pkr100kg: 45000, usdPerTon: 3000,
    localNote: 'Sun-dried + packaged avg', worldSource: 'ITC specialty 2023',
    valueAdded: true,
  },
  rice_vermicelli: {
    label: 'Rice Vermicelli / Seviyan', category: 'Value-Added: Foods',
    hsCode: '190219',
    aliases: ['vermicelli', 'seviyan', 'sevai', 'rice noodles'],
    pkr100kg: 14000, usdPerTon: 1000,
    localNote: 'Factory gate Pakistan avg', worldSource: 'ITC agro-processed 2023',
    valueAdded: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VALUE-ADDED — POWDERS & DEHYDRATED
  // ═══════════════════════════════════════════════════════════════════════════

  onion_powder: {
    label: 'Onion Powder (Dehydrated)', category: 'Value-Added: Powders',
    hsCode: '071290',
    aliases: ['onion powder', 'dehydrated onion', 'onion flakes'],
    pkr100kg: 20000, usdPerTon: 1100,
    localNote: 'Dehydration plant gate avg', worldSource: 'ITC agro-processed 2023',
    valueAdded: true,
  },
  garlic_powder: {
    label: 'Garlic Powder (Dehydrated)', category: 'Value-Added: Powders',
    hsCode: '071290',
    aliases: ['garlic powder', 'dehydrated garlic', 'garlic flakes'],
    pkr100kg: 80000, usdPerTon: 3000,
    localNote: 'Processing plant gate avg', worldSource: 'ITC agro-processed 2023',
    valueAdded: true,
  },
  ginger_powder: {
    label: 'Ginger Powder (Dry)', category: 'Value-Added: Powders',
    hsCode: '091012',
    aliases: ['ginger powder', 'dry ginger', 'sonth', 'soonth'],
    pkr100kg: 40000, usdPerTon: 3000,
    localNote: 'Processing plant gate avg', worldSource: 'ITC spice reference 2023',
    valueAdded: true,
  },
  turmeric_powder: {
    label: 'Turmeric Powder', category: 'Value-Added: Powders',
    hsCode: '091030',
    aliases: ['turmeric powder', 'haldi powder', 'ground turmeric'],
    pkr100kg: 30000, usdPerTon: 1800,
    localNote: 'Milling plant gate avg', worldSource: 'ITC spice reference 2023',
    valueAdded: true,
  },
  chili_powder: {
    label: 'Chili Powder (Ground)', category: 'Value-Added: Powders',
    hsCode: '090422',
    aliases: ['chili powder', 'red chilli powder', 'mirch powder'],
    pkr100kg: 50000, usdPerTon: 2500,
    localNote: 'Kunri grade grinding avg', worldSource: 'ITC spice reference 2023',
    valueAdded: true,
  },
  cumin_powder: {
    label: 'Cumin Powder (Ground)', category: 'Value-Added: Powders',
    hsCode: '090930',
    aliases: ['cumin powder', 'zeera powder', 'ground cumin'],
    pkr100kg: 60000, usdPerTon: 4000,
    localNote: 'Grinding plant gate avg', worldSource: 'ITC spice reference 2023',
    valueAdded: true,
  },
  moringa_powder: {
    label: 'Moringa Leaf Powder', category: 'Value-Added: Powders',
    hsCode: '121190',
    aliases: ['moringa powder', 'moringa leaf powder', 'drumstick powder'],
    pkr100kg: 35000, usdPerTon: 4500,
    localNote: 'Spray-dried processing avg', worldSource: 'ITC specialty 2023',
    valueAdded: true,
  },
  chickpea_flour: {
    label: 'Chickpea Flour (Besan)', category: 'Value-Added: Powders',
    hsCode: '110610',
    aliases: ['besan', 'gram flour', 'chickpea flour', 'chana flour'],
    pkr100kg: 18000, usdPerTon: 950,
    localNote: 'Mill gate avg', worldSource: 'ITC agro-processed 2023',
    valueAdded: true,
  },
  wheat_flour: {
    label: 'Wheat Flour (Atta)', category: 'Value-Added: Powders',
    hsCode: '110100',
    aliases: ['flour', 'atta', 'wheat flour', 'maida'],
    pkr100kg: 5500, usdPerTon: 380,
    localNote: 'Ex-mill roller flour avg', worldSource: 'ITC agro-processed 2023',
    valueAdded: true,
  },
  corn_starch: {
    label: 'Corn Starch / Corn Flour', category: 'Value-Added: Powders',
    hsCode: '110812',
    aliases: ['corn starch', 'corn flour', 'maize starch'],
    pkr100kg: 14000, usdPerTon: 650,
    localNote: 'Factory gate avg', worldSource: 'ITC reference 2023',
    valueAdded: true,
  },
  mixed_spice: {
    label: 'Mixed Spice Blend (Masala)', category: 'Value-Added: Powders',
    hsCode: '210110',
    aliases: ['masala', 'mixed spice', 'spice blend', 'garam masala'],
    pkr100kg: 70000, usdPerTon: 3500,
    localNote: 'Branded packaged avg', worldSource: 'ITC specialty 2023',
    valueAdded: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VALUE-ADDED — OILS & FATS
  // ═══════════════════════════════════════════════════════════════════════════

  sesame_oil: {
    label: 'Sesame Oil (Cold-pressed)', category: 'Value-Added: Oils',
    hsCode: '151190',
    aliases: ['sesame oil', 'til oil', 'teel oil'],
    pkr100kg: 70000, usdPerTon: 2800,
    localNote: 'Cold-press plant gate avg', worldSource: 'ITC oilseed reference 2023',
    valueAdded: true,
  },
  mustard_oil: {
    label: 'Mustard Oil', category: 'Value-Added: Oils',
    hsCode: '151390',
    aliases: ['mustard oil', 'sarson tel', 'sarson ka tel'],
    pkr100kg: 30000, usdPerTon: 1600,
    localNote: 'Expeller plant gate avg', worldSource: 'ITC reference 2023',
    valueAdded: true,
  },
  cottonseed_oil: {
    label: 'Cottonseed Oil (Refined)', category: 'Value-Added: Oils',
    hsCode: '151219',
    aliases: ['cottonseed oil', 'binola oil', 'cotton oil'],
    pkr100kg: 25000, usdPerTon: 1000,
    localNote: 'Refinery gate avg', worldSource: 'FAO reference 2023-24',
    valueAdded: true,
  },
  rice_bran_oil: {
    label: 'Rice Bran Oil', category: 'Value-Added: Oils',
    hsCode: '151620',
    aliases: ['rice bran oil', 'rice oil'],
    pkr100kg: 28000, usdPerTon: 1300,
    localNote: 'Refinery gate avg', worldSource: 'ITC reference 2023',
    valueAdded: true,
  },
  groundnut_oil: {
    label: 'Groundnut Oil (Refined)', category: 'Value-Added: Oils',
    hsCode: '150810',
    aliases: ['groundnut oil', 'peanut oil', 'moongphali tel'],
    pkr100kg: 32000, usdPerTon: 1500,
    localNote: 'Expeller/refined plant avg', worldSource: 'FAO reference 2023-24',
    valueAdded: true,
  },
  moringa_oil: {
    label: 'Moringa Seed Oil', category: 'Value-Added: Oils',
    hsCode: '151590',
    aliases: ['moringa oil', 'ben oil', 'moringa seed oil'],
    pkr100kg: 120000, usdPerTon: 7500,
    localNote: 'Cold-press specialty avg', worldSource: 'ITC specialty 2023',
    valueAdded: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROTEIN & SEAFOOD
  // ═══════════════════════════════════════════════════════════════════════════

  buffalo_meat: {
    label: 'Buffalo Meat (Halal Frozen)', category: 'Protein & Seafood',
    hsCode: '020230',
    aliases: ['buffalo meat', 'buff', 'halal buffalo', 'boneless buffalo'],
    pkr100kg: 75000, usdPerTon: 3200,
    localNote: 'Farm-gate / cold-store avg', worldSource: 'USDA/ITC halal meat 2023-24',
    valueAdded: true,
  },
  beef_halal: {
    label: 'Beef (Halal Boneless)', category: 'Protein & Seafood',
    hsCode: '020230',
    aliases: ['beef', 'halal beef', 'boneless beef', 'gaye ka gosht'],
    pkr100kg: 80000, usdPerTon: 4000,
    localNote: 'Slaughterhouse avg', worldSource: 'USDA/ITC halal meat 2023-24',
    valueAdded: true,
  },
  mutton_lamb: {
    label: 'Mutton / Lamb (Halal)', category: 'Protein & Seafood',
    hsCode: '020430',
    aliases: ['mutton', 'lamb', 'halal mutton', 'bakra gosht'],
    pkr100kg: 120000, usdPerTon: 5500,
    localNote: 'Abattoir avg', worldSource: 'ITC halal meat reference 2023',
    valueAdded: true,
  },
  chicken_processed: {
    label: 'Chicken (Processed Halal)', category: 'Protein & Seafood',
    hsCode: '020712',
    aliases: ['chicken', 'broiler', 'halal chicken', 'murgh'],
    pkr100kg: 45000, usdPerTon: 2200,
    localNote: 'Processed poultry plant avg', worldSource: 'ITC halal meat reference 2023',
    valueAdded: true,
  },
  shrimp: {
    label: 'Shrimp / Prawns (Frozen)', category: 'Protein & Seafood',
    hsCode: '030617',
    aliases: ['shrimp', 'prawn', 'prawns', 'jhinga'],
    pkr100kg: 80000, usdPerTon: 5500,
    localNote: 'Karachi/Gwadar export grade avg', worldSource: 'FAO fishery reference 2023-24',
    valueAdded: true,
  },
  pomfret: {
    label: 'Pomfret (Silver/Black)', category: 'Protein & Seafood',
    hsCode: '030389',
    aliases: ['pomfret', 'paplet', 'pomfrito'],
    pkr100kg: 60000, usdPerTon: 4000,
    localNote: 'Karachi coast export avg', worldSource: 'FAO fishery reference 2023',
    valueAdded: true,
  },
  squid: {
    label: 'Squid / Cuttlefish (Frozen)', category: 'Protein & Seafood',
    hsCode: '030743',
    aliases: ['squid', 'cuttlefish', 'calamari'],
    pkr100kg: 40000, usdPerTon: 2800,
    localNote: 'Gwadar/Karachi export avg', worldSource: 'FAO fishery reference 2023',
    valueAdded: true,
  },
  dried_fish: {
    label: 'Dried / Salted Fish', category: 'Protein & Seafood',
    hsCode: '030559',
    aliases: ['dried fish', 'salted fish', 'machli sukhi'],
    pkr100kg: 50000, usdPerTon: 3000,
    localNote: 'Makran coast avg', worldSource: 'FAO reference 2023-24',
    valueAdded: true,
  },
  fish_meal: {
    label: 'Fish Meal (Animal Feed)', category: 'Protein & Seafood',
    hsCode: '230120',
    aliases: ['fish meal', 'fishmeal', 'machli powder'],
    pkr100kg: 20000, usdPerTon: 1200,
    localNote: 'Coastal processing plant avg', worldSource: 'FAO reference 2023-24',
    valueAdded: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DAIRY & SPECIALTY
  // ═══════════════════════════════════════════════════════════════════════════

  ghee: {
    label: 'Ghee (Clarified Butter)', category: 'Dairy & Specialty',
    hsCode: '040590',
    aliases: ['ghee', 'desi ghee', 'clarified butter'],
    pkr100kg: 60000, usdPerTon: 3200,
    localNote: 'Branded dairy plant avg', worldSource: 'ITC dairy reference 2023',
    valueAdded: true,
  },
  powdered_milk: {
    label: 'Powdered Milk (Full-fat)', category: 'Dairy & Specialty',
    hsCode: '040221',
    aliases: ['powdered milk', 'milk powder', 'dry milk', 'doodh powder'],
    pkr100kg: 65000, usdPerTon: 3300,
    localNote: 'Dairy plant gate avg', worldSource: 'FAO/WB dairy reference 2023-24',
    valueAdded: true,
  },
  camel_milk_powder: {
    label: 'Camel Milk Powder', category: 'Dairy & Specialty',
    hsCode: '040299',
    aliases: ['camel milk', 'camel milk powder', 'oont ka doodh'],
    pkr100kg: 180000, usdPerTon: 22000,
    localNote: 'Specialty spray-dried avg', worldSource: 'ITC specialty dairy 2023',
    valueAdded: true,
  },
  rose_water: {
    label: 'Rose Water (Food-grade)', category: 'Dairy & Specialty',
    hsCode: '330129',
    aliases: ['rose water', 'gulab jal', 'arq gulab'],
    pkr100kg: 15000, usdPerTon: 4500,
    localNote: 'Distillery gate avg', worldSource: 'ITC specialty reference 2023',
    valueAdded: true,
  },
  rose_oil: {
    label: 'Rose Oil / Attar', category: 'Dairy & Specialty',
    hsCode: '330129',
    aliases: ['rose oil', 'attar', 'arq', 'gulab tel', 'otto of rose'],
    pkr100kg: 3500000, usdPerTon: 180000,
    localNote: 'Distillery absolute; ~1 kg oil = 3 tons petals', worldSource: 'ITC essential oils 2023',
    valueAdded: true,
  },
  licorice_root: {
    label: 'Licorice Root (Mulethi)', category: 'Dairy & Specialty',
    hsCode: '121120',
    aliases: ['licorice', 'mulethi', 'mulehti', 'licorice root', 'jethimadh'],
    pkr100kg: 18000, usdPerTon: 2200,
    localNote: 'Punjab/Sindh dried root avg', worldSource: 'ITC herbal reference 2023',
  },
  licorice_extract: {
    label: 'Licorice Extract (Block)', category: 'Dairy & Specialty',
    hsCode: '130219',
    aliases: ['licorice extract', 'mulethi extract'],
    pkr100kg: 60000, usdPerTon: 5500,
    localNote: 'Processing plant avg', worldSource: 'ITC herbal reference 2023',
    valueAdded: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEXTILE & FIBER (value-added manufacturing)
  // ═══════════════════════════════════════════════════════════════════════════

  cotton_yarn: {
    label: 'Cotton Yarn (20s–30s count)', category: 'Textile & Fiber',
    hsCode: '520512',
    aliases: ['cotton yarn', 'yarn', 'dhaga', 'cotton thread'],
    pkr100kg: 90000, usdPerTon: 3200,
    localNote: 'Spinning mill gate avg', worldSource: 'ITC textile reference 2023',
    valueAdded: true,
  },
  cotton_fabric: {
    label: 'Cotton Fabric (Grey/Processed)', category: 'Textile & Fiber',
    hsCode: '520811',
    aliases: ['cotton fabric', 'kapra', 'grey cloth', 'processed fabric'],
    pkr100kg: 110000, usdPerTon: 4000,
    localNote: 'Weaving unit avg', worldSource: 'ITC textile reference 2023',
    valueAdded: true,
  },
  denim_fabric: {
    label: 'Denim Fabric', category: 'Textile & Fiber',
    hsCode: '521142',
    aliases: ['denim', 'denim fabric', 'jeans fabric'],
    pkr100kg: 130000, usdPerTon: 5500,
    localNote: 'Denim mill gate avg', worldSource: 'ITC textile reference 2023',
    valueAdded: true,
  },
  surgical_cotton: {
    label: 'Surgical Cotton (Absorbent)', category: 'Textile & Fiber',
    hsCode: '300510',
    aliases: ['surgical cotton', 'absorbent cotton', 'medical cotton'],
    pkr100kg: 40000, usdPerTon: 2500,
    localNote: 'Medical processing plant avg', worldSource: 'ITC reference 2023',
    valueAdded: true,
  },
  terry_towel: {
    label: 'Terry Towels (Home Textile)', category: 'Textile & Fiber',
    hsCode: '630260',
    aliases: ['towel', 'terry towel', 'bath towel', 'tauliya'],
    pkr100kg: 150000, usdPerTon: 5000,
    localNote: 'Export-grade finishing avg', worldSource: 'ITC textile reference 2023',
    valueAdded: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MANUFACTURED / SPECIALTY EXPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  football: {
    label: 'Footballs (Hand-stitched)', category: 'Manufactured Goods',
    hsCode: '950662',
    aliases: ['football', 'soccer ball', 'ball', 'football sialkot'],
    pkr100kg: 250000, usdPerTon: 8000,
    localNote: 'Sialkot hand-stitched export avg', worldSource: 'ITC sports goods 2023',
    valueAdded: true,
  },
  surgical_instruments: {
    label: 'Surgical Instruments', category: 'Manufactured Goods',
    hsCode: '902120',
    aliases: ['surgical instruments', 'scissors', 'forceps', 'scalpel'],
    pkr100kg: 500000, usdPerTon: 15000,
    localNote: 'Sialkot stainless steel instruments avg', worldSource: 'ITC medical devices 2023',
    valueAdded: true,
  },
  cutlery: {
    label: 'Stainless Steel Cutlery', category: 'Manufactured Goods',
    hsCode: '821499',
    aliases: ['cutlery', 'spoon', 'fork', 'knife set', 'bartan'],
    pkr100kg: 150000, usdPerTon: 5000,
    localNote: 'Wazirabad/Sialkot factory avg', worldSource: 'ITC reference 2023',
    valueAdded: true,
  },
  leather_goods: {
    label: 'Leather Goods (Finished)', category: 'Manufactured Goods',
    hsCode: '420212',
    aliases: ['leather', 'leather goods', 'chamra', 'finished leather'],
    pkr100kg: 200000, usdPerTon: 7000,
    localNote: 'Sialkot/Karachi tannery + finish avg', worldSource: 'ITC leather reference 2023',
    valueAdded: true,
  },
  sports_gloves: {
    label: 'Sports Gloves (Boxing/Cricket)', category: 'Manufactured Goods',
    hsCode: '420321',
    aliases: ['gloves', 'sports gloves', 'boxing gloves', 'cricket gloves'],
    pkr100kg: 300000, usdPerTon: 10000,
    localNote: 'Sialkot sports goods avg', worldSource: 'ITC sports goods 2023',
    valueAdded: true,
  },

};

// ─── Derived helpers ──────────────────────────────────────────────────────────

const ALL_KEYS    = Object.keys(DB);
const CATEGORIES  = [...new Set(Object.values(DB).map(c => c.category))];
const FUTURES_KEYS = ALL_KEYS.filter(k => DB[k].hasFutures);

module.exports = { DB, ALL_KEYS, CATEGORIES, FUTURES_KEYS };
