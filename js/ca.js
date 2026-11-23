/* Калькулятор для Канади. Логіка — з калькулятора CargoPlus (cargoplus.pro/calculator/ca):
 *   аукціонний збір (таблиці Copart/IAAI, завжди LiveBid; Impact = IAAI + $65), «суша» від майданчика до хабу (Toronto/Vancouver),
 *   морський фрахт хаб → Клайпеда, Material Fee $25, провінційний податок Канади, тайтл $150, комісія $50, розмитнення
 *   (мито 10%, акциз, ПДВ 20% від (вартість + збір + $1800 + мито + акциз)), .
 * «Логістика» (одним рядком) = суша + море + Material Fee $25 + комісія CargoPlus $50 + $1100 (просто надбавка до логістики) + $55 для Hybrid/Electro.
 * «Послуга компанії» — фіксовані $500 (SERVICE_FEE), як в Україні.
 * Тільки SEDAN. «Бус» — як в українському калькуляторі: +$1500 до фрахту й +$300; обидві суми входять у «Логістику».
 * SWIFT і страхування — РІВНО як в українському калькуляторі (SWIFT = (ціна + збір) × 2.5% + $100; страхування = ціна × 1% + $150).
 * Акциз і коефіцієнт віку — ті самі функції, що в українському калькуляторі (збігаються з CargoPlus). */
const CA_LOGISTICS_ADDON = 1100;         // фіксована надбавка до суми логістики (ні до чого більше не прив'язана)
const CA_HAZARD = 55;                    // надбавка експедитора для Hybrid/Electro (як у CargoPlus)
const CA_TITLE = 150;                    // переробка тайтлу (Export)
const CA_MATERIAL_FEE = 25;              // Material Fee (CargoPlus)
const CA_COMMISSION = 50;                // комісія CargoPlus
const CA_IMPACT_EXTRA = 65;
const CA_SEA = { Toronto: 1200, Vancouver: 1600 };           // SEDAN
const CA_SEA_HYBRID = { Toronto: 200, Vancouver: 300 };      // додається для Hybrid/Electro
const caState = { auction: 'copart', hub: 'Toronto', fuel: 'petrol' };

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
function calcCaBreakdown({ auction, hub, yard, price, fuel, year, volume, kwh, bus, repair, eurUsd }) {
  price = num(price); repair = num(repair);
  const hybridOrEv = fuel === 'hybrid' || fuel === 'electric';
  const auctionFee = caAuctionFee(auction, price);
  const land = yard ? num(yard.sedan) : 0;
  const sea = num(CA_SEA[hub]) + (hybridOrEv ? num(CA_SEA_HYBRID[hub]) : 0) + (bus ? BUS_FREIGHT_EXTRA : 0);   // Бус: +$1500 до фрахту (як в Україні)
  const addon = CA_LOGISTICS_ADDON + (bus ? BUS_COMPLEX_EXTRA : 0);                                             // Бус: +$300 (як в Україні)
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

  // «Логістика» одним рядком: суша + море + Material Fee + комісія CargoPlus + $1100 (+ $55 Hybrid/Electro; Бус: +$1500 у море й +$300)
  const logistics = land + sea + CA_MATERIAL_FEE + CA_COMMISSION + addon + hazard;
  const total = price + auctionFee + logistics + swiftFee + insuranceFee + caTax + CA_TITLE + SERVICE_FEE + customs + repair;
  return { price, repair, auctionFee, land, sea, addon, logistics, swiftFee, insuranceFee, caTax, taxPct, hazard, customs, duty, vat, excise, total };
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
    volume: $('caVolume').value, kwh: $('caBattery').value, bus: $('caBus').checked,
    repair: $('caRepair').value, eurUsd: euroToUsd,
  });
  const bus = $('caBus').checked;
  const rows = [
    ['Вартість покупки', r.price],
    ['Аукціонний збір', r.auctionFee],
    [bus ? 'Логістика (Бус)' : 'Логістика', r.logistics],
    ['SWIFT', r.swiftFee],
    ['Страхування', r.insuranceFee],
    [`Податок Канади${r.taxPct ? ` (${+(r.taxPct * 100).toFixed(3)}%)` : ''}`, r.caTax],
    ['Тайтл (Export)', CA_TITLE],
    ['Послуга компанії', SERVICE_FEE],
    ['Розмитнення', r.customs],
    ['Ремонт', r.repair],
  ];
  $('caRows').innerHTML = rows.map(() => '<div><dt></dt><dd></dd></div>').join('');
  [...$('caRows').children].forEach((row, i) => { row.children[0].textContent = rows[i][0]; row.children[1].textContent = usd(rows[i][1]); });
  $('caDuty').textContent = usd(r.duty);
  $('caVat').textContent = usd(r.vat);
  $('caExcise').textContent = usd(r.excise);
  $('caCustomsTotal').textContent = usd(r.customs);
  $('caTotal').textContent = usd(r.total);

  window.copyCa = { total: r.total, lines: [
    ['Ставка', r.price], ['Аукціонний збір', r.auctionFee], ['SWIFT', r.swiftFee], ['Страхування', r.insuranceFee],
    ['Податок Канади', r.caTax], ['Тайтл', CA_TITLE], ['Фрахт', r.logistics], ['Послуга', SERVICE_FEE],
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
/* Ставка в CAD ↔ вартість покупки в USD за курсом (за замовчуванням 1.3 CAD за $1): змінили одне поле — друге перераховується */
const CA_DEFAULT_RATE = 1.3;
const caRate = () => { const r = Number($('caCadRate').value); return Number.isFinite(r) && r > 0 ? r : CA_DEFAULT_RATE; };
const caRound2 = (v) => Math.round(v * 100) / 100;
function caUsdToCad() { $('caCad').value = num($('caPrice').value) ? String(caRound2(num($('caPrice').value) * caRate())) : ''; }
$('caCad').addEventListener('input', () => { $('caPrice').value = num($('caCad').value) ? String(caRound2(num($('caCad').value) / caRate())) : ''; calcCa(); });
$('caPrice').addEventListener('input', caUsdToCad);
$('caCadRate').addEventListener('input', () => { caUsdToCad(); calcCa(); });

['caYard', 'caPrice', 'caYear', 'caVolume', 'caBattery', 'caBus', 'caRepair'].forEach((id) => {
  $(id).addEventListener('input', calcCa); $(id).addEventListener('change', calcCa);
});

caFillYears(); caFillYards(); calcCa();
