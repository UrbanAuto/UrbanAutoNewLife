/* Urban Auto — калькулятор повної вартості авто.
 * Усі формули перенесені 1:1 з app.js проєкту NewLifeUrbanAuto-main 2.
 * Дані локацій: js/data/{copart,iaai,manheim}-data.js (з тих самих файлів проєкту).
 */

/* ---------- Константи (app.js, рядки 1–8) ---------- */
const SERVICE_FEE = 500;          // Послуга компанії
const BEP_FEE = 650;              // БЕП
const BUS_FREIGHT_EXTRA = 1500;   // Бус: надбавка до фрахту (app.js)
const BUS_COMPLEX_EXTRA = 300;    // Бус: надбавка до Комплексу (app.js)
const COMPLEX_BY_CITY = { lviv: 1100, kyiv: 1300 }; // змінено за запитом (в app.js було 1050 / 1250) // Комплекс залежно від міста

/* Режим «Бус»:
 *  'add'      — як в app.js: +1500 до логістики і +300 до Комплексу (за замовчуванням)
 *  'multiply' — множить логістику на 2 (як в описі завдання)
 */
const BUS_MODE = 'add';

let euroToUsd = 1.04; // запасний курс; оновлюється з НБУ (app.js, fetchExchangeRates)

/* ---------- Аукціонні збори (app.js, auctionFeeRules) ---------- */
const FEE_COPART = [
  [199.99, 205], [299.99, 240], [349.99, 265], [399.99, 280], [449.99, 305],
  [499.99, 315], [549.99, 340], [599.99, 350], [699.99, 420], [799.99, 445],
  [899.99, 465], [999.99, 480], [1199.99, 520], [1299.99, 540], [1399.99, 555],
  [1499.99, 570], [1599.99, 595], [1699.99, 610], [1799.99, 630], [1999.99, 700],
  [2399.99, 685], [2499.99, 720], [2999.99, 755], [3499.99, 800], [3999.99, 850],
  [4499.99, 910], [4999.99, 935], [5499.99, 960], [5999.99, 960], [6499.99, 985],
  [6999.99, 985], [7499.99, 1050], [7999.99, 1050], [8499.99, 1105], [8999.99, 1105],
  [9999.99, 1105], [10499.99, 1195], [10999.99, 1195], [11499.99, 1195], [11999.99, 1195],
  [12499.99, 1205], [14999.99, 1220],
];
const FEE_IAAI = [
  [199.99, 260], [299.99, 295], [349.99, 320], [399.99, 335], [449.99, 360],
  [499.99, 370], [549.99, 395], [599.99, 405], [699.99, 405], [799.99, 430],
  [899.99, 450], [999.99, 465], [1199.99, 505], [1299.99, 525], [1399.99, 540],
  [1499.99, 555], [1599.99, 580], [1699.99, 595], [1799.99, 615], [1999.99, 635],
  [2399.99, 670], [2499.99, 705], [2999.99, 740], [3499.99, 785], [3999.99, 835],
  [4499.99, 895], [4999.99, 920], [5499.99, 970], [5999.99, 970], [6499.99, 1035],
  [6999.99, 1035], [7499.99, 1090], [7999.99, 1090], [8499.99, 1150], [9999.99, 1150],
  [11499.99, 1180], [11999.99, 1190], [12499.99, 1205], [14999.99, 1220],
];
const FEE_RULES = { copart: FEE_COPART, iaai: FEE_IAAI };

function getAuctionFee(auction, price) {
  if (auction === 'manheim') {
    // Manheim = збір Copart з постійною корекцією −$40 (app.js)
    return Math.max(0, getAuctionFee('copart', price) - 40);
  }
  const found = (FEE_RULES[auction] || []).find(([max]) => price <= max);
  // Понад $15 000: 6% + $345
  return found ? found[1] : Math.round(price * 0.06 + 345);
}

/* ---------- Логістика (app.js, getFreight) ---------- */
const LOGISTICS = {
  copart: window.COPART_LOGISTICS || {},
  iaai: window.IAAI_LOGISTICS || {},
  manheim: window.MANHEIM_LOGISTICS || {},
};

/* ---------- Розмитнення ---------- */
// Акциз, EUR→USD (app.js, getExcise). Бензин/Гібрид: 50 €/л, >3 л ×2. Дизель: 75 €/л, >3.5 л ×2.
function getExcise(fuel, volumeCm3, ageCoeff) {
  const liters = num(volumeCm3) / 1000;
  const age = Math.max(1, num(ageCoeff));
  let eur;
  if (fuel === 'diesel') eur = 75 * liters * (liters > 3.5 ? 2 : 1) * age;
  else if (fuel === 'petrol' || fuel === 'hybrid') eur = 50 * liters * (liters > 3 ? 2 : 1) * age;
  else return 0;
  return eur * euroToUsd;
}

// Коефіцієнт віку: поточний рік − рік випуску, мінімум 1, максимум 15.
// ЗМІНЕНО відносно app.js (там було жорстко 2025 − рік); тепер збігається з CargoPlus (2020 → 6 у 2026 р.).
function getAgeCoefficient(year) {
  year = Number(year);
  if (!Number.isFinite(year)) return 1;
  return Math.min(15, Math.max(1, new Date().getFullYear() - year));
}

/* ---------- Допоміжне ---------- */
const $ = (id) => document.getElementById(id);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const fmt = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });
const usd = (v) => `$${fmt.format(Math.round(v))}`;

const state = { auction: 'copart', fuel: 'petrol' };

/* ---------- Розрахунок (app.js, calculate) ---------- */
function calculate() {
  const carPrice = num($('carPrice').value);
  const repair = num($('repair').value);
  const bus = $('bus').checked;
  const isElectric = state.fuel === 'electric';

  const auctionFee = getAuctionFee(state.auction, carPrice);

  const baseFreight = num(LOGISTICS[state.auction][$('siteName').value]);
  let freight = baseFreight;
  let complex = COMPLEX_BY_CITY[$('destination').value] || 0;
  if (bus) {
    if (BUS_MODE === 'multiply') freight = baseFreight * 2;
    else { freight = baseFreight + BUS_FREIGHT_EXTRA; complex += BUS_COMPLEX_EXTRA; }
  }

  const swift = (carPrice + auctionFee) * 0.025 + 100;   // SWIFT
  const insurance = carPrice * 0.01 + 150;               // Страхування
  const dangerous = state.fuel === 'electric' || state.fuel === 'hybrid' ? 100 : 0; // Небезпечний вантаж

  const priceAndAuction = carPrice + auctionFee;
  const customsValue = priceAndAuction + 1800;

  let excise = getExcise(state.fuel, $('engineVolume').value, getAgeCoefficient($('carYear').value));
  let duty = 0, vat = 0;
  if (isElectric) {
    // Електро: мито 0; акциз = kWh × курс EUR→USD; ПДВ = (митна вартість + акциз) × 20%
    excise = num($('batteryKwh').value) * euroToUsd;
    vat = (customsValue + excise) * 0.2;
  } else {
    // Мито 10%; ПДВ 20% від (вартість + збір + мито + акциз + 1800)
    duty = customsValue * 0.1;
    vat = (priceAndAuction + duty + excise + 1800) * 0.2;
  }
  const customs = duty + vat + excise;

  const total = carPrice + repair + freight + swift + insurance + SERVICE_FEE + BEP_FEE +
    complex + dangerous + auctionFee + customs;

  const rows = [
    ['Вартість покупки', carPrice],
    ['Аукціонний збір', auctionFee],
    [bus ? 'Логістика (Бус)' : 'Логістика', freight],
    ['Розмитнення', customs],
    ['SWIFT', swift],
    ['Страхування', insurance],
    ['Ремонт', repair],
    ['Послуга компанії', SERVICE_FEE],
    ['БЕП', BEP_FEE],
    ['Комплекс', complex],
  ];
  if (dangerous) rows.push(['Небезпечний вантаж', dangerous]);

  $('rows').innerHTML = rows
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${usd(v)}</dd></div>`).join('');
  $('duty').textContent = usd(duty);
  $('vat').textContent = usd(vat);
  $('excise').textContent = usd(excise);
  $('customsTotal').textContent = usd(customs);
  $('total').textContent = usd(total);

  // Дані для кнопки «Копіювати» (js/copy.js)
  window.copyUa = { total, lines: [
    ['Ставка', carPrice], ['Аукціонний збір', auctionFee], ['SWIFT', swift], ['Страхування', insurance],
    ...(dangerous ? [['Небезпечний вантаж', dangerous]] : []),
    ['Фрахт', freight], ['БЕП', BEP_FEE], ['Комплекс', complex], ['Послуга', SERVICE_FEE],
    ['Митниця (мита + акциз + ПДВ)', customs], ['Ремонт', repair],
  ] };
}

/* ---------- UI ---------- */
function fillSites() {
  const sel = $('siteName');
  const prev = sel.value;
  const names = Object.keys(LOGISTICS[state.auction]).sort((a, b) => a.localeCompare(b, 'uk-UA'));
  sel.innerHTML = names.map((n) => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');
  const preferred = names.find((n) => n.toUpperCase() === 'LOS ANGELES');
  sel.value = names.includes(prev) ? prev : preferred || names[0];
}

function fillYears() {
  let html = '';
  for (let y = 2026; y >= 2008; y--) html += `<option value="${y}">${y}</option>`;
  html += '<option value="2007">2007 і старше</option>';
  $('carYear').innerHTML = html;
}

function syncFuel() {
  const e = state.fuel === 'electric';
  $('volumeField').classList.toggle('hidden', e);
  $('batteryField').classList.toggle('hidden', !e);
  $('customsBox').querySelectorAll('dd')[0].parentElement.classList.toggle('muted', e);
}

function segmented(id, key, after) {
  const box = $(id);
  box.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    box.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b === btn);
      b.setAttribute('aria-checked', b === btn);
    });
    state[key] = btn.dataset.value;
    after();
    calculate();
  });
}

segmented('auctionSeg', 'auction', fillSites);
segmented('fuelSeg', 'fuel', syncFuel);
['carPrice', 'repair', 'siteName', 'carYear', 'engineVolume', 'batteryKwh', 'destination', 'bus']
  .forEach((id) => { $(id).addEventListener('input', calculate); $(id).addEventListener('change', calculate); });

/* Курс EUR→USD з НБУ (app.js, fetchExchangeRates); за помилки лишається запасний */
async function fetchRates() {
  try {
    const r = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
    if (!r.ok) return;
    const data = await r.json();
    const u = data.find((x) => x.cc === 'USD');
    const e = data.find((x) => x.cc === 'EUR');
    if (u?.rate && e?.rate) {
      euroToUsd = e.rate / u.rate;
      $('rateNote').textContent = `Курс EUR/USD (НБУ): ${euroToUsd.toFixed(3)}`;
      calculate();
    }
  } catch { /* лишаємо запасний курс */ }
}

fillSites();
fillYears();
$('carYear').value = '2026';
syncFuel();
$('rateNote').textContent = `Курс EUR/USD: ${euroToUsd} (запасний)`;
calculate();
fetchRates();
