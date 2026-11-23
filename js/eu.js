/* Калькулятор для Європи (доставка в Краків). Логіка з проєкту «Calculator Eu» (app.js).
 * Таблиці аукціонних зборів Copart/IAAI ідентичні українським — використовуємо getAuctionFee() з app.js
 * (Manheim: збір Copart −$40, як в українському калькуляторі).
 *
 * ВИПРАВЛЕНО відносно оригіналу:
 *  1) акциз: ставки були переплутані (≤2.0 л → 18.6%); у Польщі 3.1% до 2000 см³ і 18.6% понад 2000 см³.
 *     База акцизу — митна вартість + мито (а не 50% ціни без доплат), як у Польщі;
 *  2) БЕП 660 EUR додавався до суми в USD без конвертації — тепер × курс EUR→USD;
 *  3) «Послуга компанії» фіксована $500; замість неї введено поле «Ремонт», що додається до суми;
 *  4) порожній/нульовий курс підміняється запасним 1.08 (а не 1).
 * Розмитнення (мито, ПДВ) — рівно як в оригіналі.
 */
const EU_SERVICE = 500;           // Послуга компанії (фіксована), $
const EU_FILING = 150;            // Подача на 50%, $
const EU_BEP_EUR = 660;           // БЕП, €
const EU_KRAKOW_EUR = 500;        // Доставка в Краків, €
const EU_AUCTION_EXTRA = 50;      // Надбавка до аукціонного збору, $
const EU_FALLBACK_RATE = 1.08;
let usdToPln = 4.0;               // оновлюється з NBP

const EU_LOGISTICS = {
  copart: window.EU_COPART_LOGISTICS || {},
  iaai: window.EU_IAAI_LOGISTICS || {},
  manheim: window.EU_MANHEIM_LOGISTICS || {},
};
const euState = { auction: 'copart' };

/* Акциз Польщі (орієнтовно): 3.1% до 2000 см³ включно, 18.6% понад 2000 см³.
 * База — митна вартість + мито. Повертає ставку (0, якщо об'єм не вказано) і суму в USD. */
function euExcise(volumeLiters, customsValueWithDuty) {
  const cm3 = Math.round(num(volumeLiters) * 1000);
  if (cm3 <= 0) return { rate: 0, usd: 0 };
  const rate = cm3 <= 2000 ? 0.031 : 0.186;
  return { rate, usd: customsValueWithDuty * rate };
}

/* Повний розрахунок (чиста функція — без DOM). Усі суми в USD. */
function calcEuBreakdown({ auction, site, price, repair, volume, rate }) {
  price = num(price); repair = num(repair);
  rate = num(rate) || EU_FALLBACK_RATE;
  const auctionFee = getAuctionFee(auction, price) + EU_AUCTION_EXTRA;
  const freight = num(EU_LOGISTICS[auction]?.[site]);
  const insurance = (price + auctionFee) * 0.01;
  const bep = EU_BEP_EUR * rate;
  const krakow = EU_KRAKOW_EUR * rate;

  // Розмитнення (формула з оригіналу): декларація на 50% вартості + $900 транспорт до кордону
  const base = price + auctionFee;
  const w = base * 0.5 + 900;
  const duty = w * 0.1;                 // ввізне мито 10%
  const vat = (w + duty) * 0.21;        // ПДВ 21% (порт Клайпеда)
  const customs = duty + vat;

  const excise = euExcise(volume, w + duty);   // орієнтовно, у суму не входить
  const total = price + auctionFee + freight + EU_FILING + EU_SERVICE + repair + insurance + bep + krakow + customs;
  return { price, repair, auctionFee, freight, insurance, bep, krakow, duty, vat, customs, excise, total };
}

function fillEuSites() {
  const sel = $('euSite'), prev = sel.value;
  const names = Object.keys(EU_LOGISTICS[euState.auction]).sort((a, b) => a.localeCompare(b, 'uk-UA'));
  sel.innerHTML = names.map((n) => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');
  sel.value = names.includes(prev) ? prev : (names.find((n) => /^los angeles/i.test(n)) || names[0]);
}

function calcEu() {
  const r = calcEuBreakdown({
    auction: euState.auction, site: $('euSite').value, price: $('euPrice').value,
    repair: $('euRepair').value, volume: $('euVolume').value, rate: $('euRate').value,
  });
  const rows = [
    ['Вартість покупки', r.price],
    ['Аукціонний збір', r.auctionFee],
    ['Фрахт', r.freight],
    ['Подача на 50%', EU_FILING],
    ['БЕП (660 €)', r.bep],
    ['Послуга компанії', EU_SERVICE],
    ['Страхування', r.insurance],
    ['Ремонт', r.repair],
    ['Доставка в Краків (500 €)', r.krakow],
    ['Розмитнення', r.customs],
  ];
  $('euRows').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${usd(v)}</dd></div>`).join('');
  $('euDuty').textContent = usd(r.duty);
  $('euVat').textContent = usd(r.vat);
  $('euExcise').textContent = r.excise.rate
    ? `≈ ${usd(r.excise.usd)} · ${fmt.format(Math.round(r.excise.usd * usdToPln))} PLN (${(r.excise.rate * 100).toFixed(1)}%)`
    : '— (вкажіть об\'єм)';
  $('euCustomsTotal').textContent = usd(r.customs);
  $('euTotal').textContent = usd(r.total);

  // Дані для кнопки «Копіювати» (js/copy.js)
  window.copyEu = { total: r.total, lines: [
    ['Ставка', r.price], ['Аукціонний збір', r.auctionFee], ['Фрахт', r.freight], ['Подача на 50%', EU_FILING],
    ['БЕП', r.bep], ['Послуга', EU_SERVICE], ['Страхування', r.insurance], ['Доставка в Краків', r.krakow],
    ['Митниця (мито + ПДВ)', r.customs], ['Ремонт', r.repair],
  ], extra: r.excise.rate ? [['Акциз (орієнтовно, не входить у суму)', r.excise.usd]] : [] };
}

async function fetchNbp() {
  try {
    const [e, u] = await Promise.all([
      fetch('https://api.nbp.pl/api/exchangerates/rates/a/eur/?format=json'),
      fetch('https://api.nbp.pl/api/exchangerates/rates/a/usd/?format=json'),
    ]);
    if (!e.ok || !u.ok) throw new Error();
    const ed = await e.json(), ud = await u.json();
    const eur = Number(ed.rates[0].mid), usdMid = Number(ud.rates[0].mid);
    if (!(eur > 0 && usdMid > 0)) throw new Error();
    usdToPln = usdMid;
    $('euRate').value = (eur / usdMid).toFixed(4);
    $('euRateInfo').textContent = `Курс NBP на ${ed.rates[0].effectiveDate}: 1 EUR = ${(eur / usdMid).toFixed(4)} USD`;
    calcEu();
  } catch { await fetchNbu(); }
}

/* Запасне джерело, якщо NBP недоступний (браузер блокує запит): курси НБУ — EUR/USD та PLN */
async function fetchNbu() {
  try {
    const r = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
    if (!r.ok) throw new Error();
    const d = await r.json();
    const rate = (cc) => d.find((x) => x.cc === cc)?.rate;
    const eur = rate('EUR'), u = rate('USD'), pln = rate('PLN');
    if (!(eur > 0 && u > 0)) throw new Error();
    if (pln > 0) usdToPln = u / pln;
    $('euRate').value = (eur / u).toFixed(4);
    $('euRateInfo').textContent = `Курс НБУ: 1 EUR = ${(eur / u).toFixed(4)} USD (NBP недоступний)`;
    calcEu();
  } catch { $('euRateInfo').textContent = 'Курси недоступні — використовується значення з поля.'; }
}

$('euAuctionSeg').addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b) return;
  $('euAuctionSeg').querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
  euState.auction = b.dataset.value; fillEuSites(); calcEu();
});
['euSite', 'euPrice', 'euVolume', 'euRepair', 'euRate'].forEach((id) => {
  $(id).addEventListener('input', calcEu); $(id).addEventListener('change', calcEu);
});

/* Перемикач Україна / Європа (вибір запам'ятовується) */
function setMode(mode) {
  const eu = mode === 'eu', ca = mode === 'ca';
  $('modeSwitch').querySelectorAll('button').forEach((x) => {
    const on = x.dataset.mode === mode; x.classList.toggle('on', on); x.setAttribute('aria-selected', on);
  });
  $('uaView').hidden = eu || ca; $('euView').hidden = !eu; $('caView').hidden = !ca;
  document.title = eu ? 'Urban Auto — Європа' : ca ? 'Urban Auto — Канада' : 'Urban Auto — Калькулятор авто з США';
  try { localStorage.setItem('ua-mode', mode); } catch (e) { /* ігноруємо */ }
}
$('modeSwitch').addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (b) setMode(b.dataset.mode);
});

fillEuSites(); calcEu(); fetchNbp();
try { const m = localStorage.getItem('ua-mode'); if (m === 'eu' || m === 'ca') setMode(m); } catch (e) { /* ігноруємо */ }
