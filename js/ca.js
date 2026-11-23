/* Калькулятор для Канади. Логіка — з калькулятора CargoPlus (cargoplus.pro/calculator/ca):
 *   аукціонний збір (таблиці Copart/IAAI, PreBid/LiveBid; Impact = IAAI + $65), «суша» від майданчика до хабу (Toronto/Vancouver),
 *   морський фрахт хаб → Клайпеда, провінційний податок Канади, SWIFT 2% + $100, страхування 1%, тайтл $150,
 *   розмитнення (мито 10%, акциз, ПДВ 20% від (вартість + збір + $1800 + мито + акциз)), пенсійний фонд (довідково).
 * ЗАМІСТЬ «Експедитор $300 + Брокер $100 + Доставка до Львова $700 + Комісія $50» у суму додається, як у звичайному калькуляторі:
 *   суша + море + «Послуга компанії» ($500, SERVICE_FEE) + $1100 (експедитор + брокер + доставка до Львова/Рівного).
 * Акциз і коефіцієнт віку — ті самі функції, що в українському калькуляторі (збігаються з CargoPlus). */
const CA_COMPLEX = 1100;                 // експедитор 300 + брокер 100 + доставка до Львова/Рівного 700
const CA_HAZARD = 55;                    // надбавка експедитора для Hybrid/Electro (як у CargoPlus)
const CA_TITLE = 150;                    // переробка тайтлу (Export)
const CA_IMPACT_EXTRA = 65;
const CA_SIZES = { Toronto: [['sedan', 'SEDAN'], ['suv', 'SUV'], ['big', 'BIG SUV'], ['moto', 'MOTO / small ATV']], Vancouver: [['sedan', 'SEDAN'], ['big', 'BIG SUV']] };
const CA_SEA = { Toronto: { sedan: 1200, suv: 1350, big: 1600, moto: 725 }, Vancouver: { sedan: 1600, big: 1900 } };
const CA_SEA_HYBRID = { Toronto: 200, Vancouver: 300 };      // додається для Hybrid/Electro
const CA_COST_COLUMN = { sedan: 'sedan', suv: 'sedan', big: 'big', moto: 'moto' };   // у CargoPlus «SUV» рахується як SEDAN
const caState = { auction: 'copart', hub: 'Toronto', fuel: 'petrol' };
let caUsdUah = 41;                       // оновлюється з НБУ; потрібен лише для порога пенсійного фонду
let caCadUsd = 0;

/* Аукціонний збір за таблицями CargoPlus. Від $15 000: ціна × 6% + збір з рядка «15000+» (як у CargoPlus). */
function caAuctionFee(auction, price, liveBid) {
  const rows = window.CA_FEES[auction === 'copart' ? 'copart' : 'iaai'] || [];
  const col = liveBid ? 3 : 2;
  let fee = 0;
  if (price >= 15000) {
    const r = rows.find((x) => x[1] === null);
    if (r) fee = Math.round(price * 1.06 + r[col] - price);
  } else {
    const r = rows.find((x) => x[1] !== null && price >= x[0] && price <= x[1]);
    fee = r ? r[col] : 0;
  }
  return auction === 'impact' ? fee + CA_IMPACT_EXTRA : fee;
}

/* Майданчики хабу, для яких є вартість «суші» під обраний розмір (як у CargoPlus: без прочерків) */
function caYardsFor(hub, size) {
  const col = CA_COST_COLUMN[size];
  return (window.CA_YARDS[hub] || []).filter((y) => y[col] != null);
}

/* Пенсійний фонд: 3% від митної вартості в грн; 4% понад 549 120 грн, 5% понад 965 120 грн (довідково, у суму не входить) */
function caPension(customsValueUsd, usdUah) {
  const uah = customsValueUsd * usdUah;
  const pct = uah > 965120 ? 0.05 : uah > 549120 ? 0.04 : 0.03;
  return { pct, usd: customsValueUsd * pct };
}

/* Повний розрахунок (чиста функція — без DOM). Усі суми в USD. */
function calcCaBreakdown({ auction, hub, size, yard, price, fuel, year, volume, kwh, liveBid, insurance, swift, repair, eurUsd, usdUah }) {
  price = num(price); repair = num(repair);
  const hybridOrEv = fuel === 'hybrid' || fuel === 'electric';
  const auctionFee = caAuctionFee(auction, price, liveBid);
  const land = yard ? num(yard[CA_COST_COLUMN[size]]) : 0;
  const sea = num(CA_SEA[hub]?.[size]) + (hybridOrEv ? num(CA_SEA_HYBRID[hub]) : 0);
  const hazard = hybridOrEv ? CA_HAZARD : 0;
  const priceAndAuction = price + auctionFee;
  const customsValue = priceAndAuction + 1800;

  // акциз і ПДВ — як у CargoPlus (і в українському калькуляторі): для електро мито 0, акциз = kWh × курс EUR→USD
  let excise, duty = 0;
  if (fuel === 'electric') excise = num(kwh) * eurUsd;
  else excise = getExcise(fuel, volume, getAgeCoefficient(year));
  if (fuel !== 'electric') duty = customsValue * 0.1;
  const vat = (customsValue + duty + excise) * 0.2;
  const customs = duty + vat + excise;

  const swiftFee = swift ? priceAndAuction * 0.02 + 100 : 0;
  const insuranceFee = insurance ? priceAndAuction * 0.01 : 0;
  const taxPct = yard ? yard.t : 0, nonRefundPct = yard ? yard.r : 0;
  const caTax = priceAndAuction * taxPct;
  const nonRefund = priceAndAuction * nonRefundPct;
  const pension = caPension(customsValue, usdUah);

  const total = price + auctionFee + land + sea + swiftFee + insuranceFee + caTax + CA_TITLE + hazard + CA_COMPLEX + SERVICE_FEE + customs + repair;
  return { price, repair, auctionFee, land, sea, swiftFee, insuranceFee, caTax, taxPct, nonRefund, nonRefundPct, hazard, customs, duty, vat, excise, pension, total };
}

function caFillYears() {
  let html = '';
  for (let y = 2026; y >= 2008; y--) html += `<option value="${y}">${y}</option>`;
  $('caYear').innerHTML = html + '<option value="2007">2007 і старше</option>';
  $('caYear').value = '2026';
}

function caFillSizes() {
  const sel = $('caSize'), prev = sel.value, opts = CA_SIZES[caState.hub];
  sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  sel.value = opts.some(([v]) => v === prev) ? prev : 'sedan';
}

function caFillYards() {
  const sel = $('caYard'), prev = sel.value;
  const yards = caYardsFor(caState.hub, $('caSize').value).slice().sort((a, b) => a.n.localeCompare(b.n, 'uk-UA'));
  sel.innerHTML = yards.map((y) => `<option value="${y.n.replace(/"/g, '&quot;')}">${y.n}</option>`).join('');
  const names = yards.map((y) => y.n);
  sel.value = names.includes(prev) ? prev : (names.find((n) => /^toronto|^queensborough/i.test(n)) || names[0] || '');
}

function calcCa() {
  const size = $('caSize').value;
  const yard = caYardsFor(caState.hub, size).find((y) => y.n === $('caYard').value) || null;
  const r = calcCaBreakdown({
    auction: caState.auction, hub: caState.hub, size, yard, price: $('caPrice').value, fuel: caState.fuel, year: $('caYear').value,
    volume: $('caVolume').value, kwh: $('caBattery').value, liveBid: $('caLive').checked, insurance: $('caIns').checked, swift: $('caSwift').checked,
    repair: $('caRepair').value, eurUsd: euroToUsd, usdUah: caUsdUah,
  });
  const rows = [
    ['Вартість покупки', r.price],
    ['Аукціонний збір', r.auctionFee],
    [`Суша: ${yard ? yard.n : '—'} → ${caState.hub}`, r.land],
    [`Море: ${caState.hub} → Клайпеда`, r.sea],
    ['SWIFT', r.swiftFee],
    ['Страхування', r.insuranceFee],
    [`Податок Канади${r.taxPct ? ` (${+(r.taxPct * 100).toFixed(3)}%)` : ''}`, r.caTax],
    ['Тайтл (Export)', CA_TITLE],
    ['Експедитор, брокер, доставка до Львова', CA_COMPLEX],
    ['Послуга компанії', SERVICE_FEE],
    ['Розмитнення', r.customs],
    ['Ремонт', r.repair],
  ];
  if (r.hazard) rows.splice(8, 0, ['Небезпечний вантаж (Hybrid/Electro)', r.hazard]);
  $('caRows').innerHTML = rows.map(([k, v]) => `<div><dt></dt><dd>${usd(v)}</dd></div>`).join('');
  [...$('caRows').children].forEach((row, i) => { row.firstChild.textContent = rows[i][0]; });
  $('caDuty').textContent = usd(r.duty);
  $('caVat').textContent = usd(r.vat);
  $('caExcise').textContent = usd(r.excise);
  $('caCustomsTotal').textContent = usd(r.customs);
  $('caPension').textContent = `≈ ${usd(r.pension.usd)} · ${fmt.format(Math.round(r.pension.usd * caUsdUah))} грн (${Math.round(r.pension.pct * 100)}%)`;
  $('caTotal').textContent = usd(r.total);
  $('caNote').textContent = (r.nonRefundPct
    ? `Податок Канади: ${+(r.nonRefundPct * 100).toFixed(3)}% не повертається (≈ ${usd(r.nonRefund)}). ` : '') +
    'З Канади всі документи — Export; вартість переробки тайтлу ($150) врахована. Якщо ціна лота в CAD — переведіть у USD за актуальним курсом.';

  window.copyCa = { total: r.total, lines: [
    ['Ставка', r.price], ['Аукціонний збір', r.auctionFee], ['Суша', r.land], ['Море', r.sea], ['SWIFT', r.swiftFee], ['Страхування', r.insuranceFee],
    ['Податок Канади', r.caTax], ['Тайтл', CA_TITLE], ...(r.hazard ? [['Небезпечний вантаж', r.hazard]] : []),
    ['Експедитор, брокер, доставка', CA_COMPLEX], ['Послуга', SERVICE_FEE], ['Митниця (мита + акциз + ПДВ)', r.customs], ['Ремонт', r.repair],
  ], extra: [['Пенсійний фонд (не входить у суму)', r.pension.usd]] };
}

function caSegmented(id, key, after) {
  const box = $(id);
  box.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button'); if (!btn) return;
    box.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === btn); b.setAttribute('aria-checked', b === btn); });
    caState[key] = btn.dataset.value; after(); calcCa();
  });
}

caSegmented('caAuctionSeg', 'auction', () => {});
caSegmented('caHubSeg', 'hub', () => { caFillSizes(); caFillYards(); });
caSegmented('caFuelSeg', 'fuel', () => {
  const e = caState.fuel === 'electric';
  $('caVolumeField').classList.toggle('hidden', e); $('caBatteryField').classList.toggle('hidden', !e);
});
$('caSize').addEventListener('change', () => { caFillYards(); calcCa(); });
['caYard', 'caPrice', 'caYear', 'caVolume', 'caBattery', 'caLive', 'caIns', 'caSwift', 'caRepair'].forEach((id) => {
  $(id).addEventListener('input', calcCa); $(id).addEventListener('change', calcCa);
});

/* Курси НБУ: USD/UAH — для порога пенсійного фонду; CAD → USD — довідково */
async function caFetchRates() {
  try {
    const r = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
    if (!r.ok) return;
    const d = await r.json(), rate = (cc) => d.find((x) => x.cc === cc)?.rate;
    if (rate('USD')) caUsdUah = rate('USD');
    if (rate('CAD') && rate('USD')) caCadUsd = rate('CAD') / rate('USD');
    $('caRateNote').textContent = `Курси НБУ: 1 USD = ${caUsdUah.toFixed(2)} грн` + (caCadUsd ? ` · 1 CAD = ${caCadUsd.toFixed(4)} USD · 1 EUR = ${euroToUsd.toFixed(4)} USD` : '');
    calcCa();
  } catch { $('caRateNote').textContent = 'Курси НБУ недоступні — використовуються запасні значення.'; }
}

caFillYears(); caFillSizes(); caFillYards(); calcCa(); caFetchRates();
