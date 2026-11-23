/* Калькулятор для Канади. Логіка — з калькулятора CargoPlus (cargoplus.pro/calculator/ca):
 *   аукціонний збір (таблиці Copart/IAAI, завжди LiveBid; Impact = IAAI + $65), «суша» від майданчика до хабу (Toronto/Vancouver),
 *   морський фрахт хаб → Клайпеда, Material Fee $25, провінційний податок Канади, тайтл $150, комісія $50, розмитнення
 *   (мито 10%, акциз, ПДВ 20% від (вартість + збір + $1800 + мито + акциз)), .
 * Експедитор $300 + брокер $100 + доставка до Львова/Рівного $700 = $1100 (одним рядком).
 * Тільки SEDAN. «Бус» — як в українському калькуляторі: +$1500 до фрахту, +$300 до комплексу.
 * SWIFT і страхування — РІВНО як в українському калькуляторі (SWIFT = (ціна + збір) × 2.5% + $100; страхування = ціна × 1% + $150).
 * Акциз і коефіцієнт віку — ті самі функції, що в українському калькуляторі (збігаються з CargoPlus). */
const CA_COMPLEX = 1100;                 // експедитор 300 + брокер 100 + доставка до Львова/Рівного 700
const CA_HAZARD = 55;                    // надбавка експедитора для Hybrid/Electro (як у CargoPlus)
const CA_TITLE = 150;                    // переробка тайтлу (Export)
const CA_MATERIAL_FEE = 25;              // Material Fee (CargoPlus)
const CA_COMMISSION = 50;                // комісія CargoPlus
const CA_IMPACT_EXTRA = 65;
const CA_SEA = { Toronto: 1200, Vancouver: 1600 };           // SEDAN
const CA_SEA_HYBRID = { Toronto: 200, Vancouver: 300 };      // додається для Hybrid/Electro
const caState = { auction: 'copart', hub: 'Toronto', fuel: 'petrol' };
let caCadUsd = 0;

/* Аукціонний збір за таблицями CargoPlus. Від $15 000: ціна × 6% + збір з рядка «15000+» (як у CargoPlus). */
function caAuctionFee(auction, price) {
  const rows = window.CA_FEES[auction === 'copart' ? 'copart' : 'iaai'] || [];
  const col = 3;                       // LiveBid — завжди увімкнено
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

/* Майданчики хабу, для яких є вартість «суші» для SEDAN (як у CargoPlus: без прочерків) */
function caYardsFor(hub) {
  return (window.CA_YARDS[hub] || []).filter((y) => y.sedan != null);
}

/* Повний розрахунок (чиста функція — без DOM). Усі суми в USD. */
function calcCaBreakdown({ auction, hub, yard, price, fuel, year, volume, kwh, bus, extra, repair, eurUsd }) {
  price = num(price); repair = num(repair); extra = num(extra);
  const hybridOrEv = fuel === 'hybrid' || fuel === 'electric';
  const auctionFee = caAuctionFee(auction, price);
  const land = yard ? num(yard.sedan) : 0;
  const sea = num(CA_SEA[hub]) + (hybridOrEv ? num(CA_SEA_HYBRID[hub]) : 0) + (bus ? BUS_FREIGHT_EXTRA : 0);   // Бус: +$1500 до фрахту (як в Україні)
  const complex = CA_COMPLEX + (bus ? BUS_COMPLEX_EXTRA : 0);                                                  // Бус: +$300 до комплексу
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

  const swiftFee = priceAndAuction * 0.025 + 100;      // SWIFT — як в Україні
  const insuranceFee = price * 0.01 + 150;             // Страхування — як в Україні
  const taxPct = yard ? yard.t : 0;
  const caTax = priceAndAuction * taxPct;

  const total = price + auctionFee + land + sea + swiftFee + insuranceFee + caTax + CA_TITLE + hazard + complex + CA_MATERIAL_FEE + CA_COMMISSION + extra + customs + repair;
  return { price, repair, extra, auctionFee, land, sea, complex, swiftFee, insuranceFee, caTax, taxPct, hazard, customs, duty, vat, excise, total };
}

function caFillYears() {
  let html = '';
  for (let y = 2026; y >= 2008; y--) html += `<option value="${y}">${y}</option>`;
  $('caYear').innerHTML = html + '<option value="2007">2007 і старше</option>';
  $('caYear').value = '2026';
}

function caFillYards() {
  const sel = $('caYard'), prev = sel.value;
  const yards = caYardsFor(caState.hub).slice().sort((a, b) => a.n.localeCompare(b.n, 'uk-UA'));
  sel.innerHTML = yards.map((y) => `<option value="${y.n.replace(/"/g, '&quot;')}">${y.n}</option>`).join('');
  const names = yards.map((y) => y.n);
  sel.value = names.includes(prev) ? prev : (names.find((n) => /^toronto|^queensborough/i.test(n)) || names[0] || '');
}

function calcCa() {
  const yard = caYardsFor(caState.hub).find((y) => y.n === $('caYard').value) || null;
  const r = calcCaBreakdown({
    auction: caState.auction, hub: caState.hub, yard, price: $('caPrice').value, fuel: caState.fuel, year: $('caYear').value,
    volume: $('caVolume').value, kwh: $('caBattery').value, bus: $('caBus').checked, extra: $('caExtra').value,
    repair: $('caRepair').value, eurUsd: euroToUsd,
  });
  const bus = $('caBus').checked;
  const rows = [
    ['Вартість покупки', r.price],
    ['Аукціонний збір', r.auctionFee],
    [`Суша: ${yard ? yard.n : '—'} → ${caState.hub}`, r.land],
    [`Море${bus ? ' (Бус)' : ''}: ${caState.hub} → Клайпеда`, r.sea],
    ['SWIFT', r.swiftFee],
    ['Страхування', r.insuranceFee],
    [`Податок Канади${r.taxPct ? ` (${+(r.taxPct * 100).toFixed(3)}%)` : ''}`, r.caTax],
    ['Тайтл (Export)', CA_TITLE],
    ['Material Fee', CA_MATERIAL_FEE],
    ['Експедитор, брокер, доставка до Львова', r.complex],
    ['Комісія', CA_COMMISSION],
    ['Розмитнення', r.customs],
    ['Ремонт', r.repair],
  ];
  if (r.hazard) rows.splice(9, 0, ['Небезпечний вантаж (Hybrid/Electro)', r.hazard]);
  if (r.extra) rows.splice(rows.length - 1, 0, ['Додаткова комісія / послуги', r.extra]);
  $('caRows').innerHTML = rows.map(() => '<div><dt></dt><dd></dd></div>').join('');
  [...$('caRows').children].forEach((row, i) => { row.children[0].textContent = rows[i][0]; row.children[1].textContent = usd(rows[i][1]); });
  $('caDuty').textContent = usd(r.duty);
  $('caVat').textContent = usd(r.vat);
  $('caExcise').textContent = usd(r.excise);
  $('caCustomsTotal').textContent = usd(r.customs);
  $('caTotal').textContent = usd(r.total);

  window.copyCa = { total: r.total, lines: [
    ['Ставка', r.price], ['Аукціонний збір', r.auctionFee], ['Суша', r.land], ['Море', r.sea], ['SWIFT', r.swiftFee], ['Страхування', r.insuranceFee],
    ['Податок Канади', r.caTax], ['Тайтл', CA_TITLE], ['Material Fee', CA_MATERIAL_FEE], ...(r.hazard ? [['Небезпечний вантаж', r.hazard]] : []),
    ['Експедитор, брокер, доставка', r.complex], ['Комісія', CA_COMMISSION], ...(r.extra ? [['Додаткова комісія / послуги', r.extra]] : []),
    ['Митниця (мита + акциз + ПДВ)', r.customs], ['Ремонт', r.repair],
  ] };
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
caSegmented('caHubSeg', 'hub', () => { caFillYards(); });
caSegmented('caFuelSeg', 'fuel', () => {
  const e = caState.fuel === 'electric';
  $('caVolumeField').classList.toggle('hidden', e); $('caBatteryField').classList.toggle('hidden', !e);
});
['caYard', 'caPrice', 'caYear', 'caVolume', 'caBattery', 'caBus', 'caExtra', 'caRepair'].forEach((id) => {
  $(id).addEventListener('input', calcCa); $(id).addEventListener('change', calcCa);
});

/* Курс НБУ: CAD → USD — довідково (для переведення ціни лота) */
async function caFetchRates() {
  try {
    const r = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
    if (!r.ok) return;
    const d = await r.json(), rate = (cc) => d.find((x) => x.cc === cc)?.rate;
    if (rate('CAD') && rate('USD')) caCadUsd = rate('CAD') / rate('USD');
    $('caRateNote').textContent = (caCadUsd ? `Курси НБУ: 1 CAD = ${caCadUsd.toFixed(4)} USD · 1 EUR = ${euroToUsd.toFixed(4)} USD` : '');
    calcCa();
  } catch { $('caRateNote').textContent = 'Курси НБУ недоступні — використовуються запасні значення.'; }
}

caFillYears(); caFillYards(); calcCa(); caFetchRates();
