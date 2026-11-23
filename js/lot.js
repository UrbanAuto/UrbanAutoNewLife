/* Заповнення калькулятора за посиланням на лот Copart.
 * Сторінку лота НЕ завантажуємо (Copart блокує такі запити) — усе беремо з самого URL:
 *   copart.com/lot/77788136/salvage-2020-toyota-highlander-hybrid-xle-ca-los-angeles
 *   → рік 2020, паливо «гібрид», локація «ca-los-angeles» → майданчик LOS ANGELES.
 * Вартість покупки й об'єм двигуна в посиланні відсутні — вводяться вручну.
 */
const US_STATES = new Set(('al ak az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd ' +
  'oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy ab bc mb nb nl ns on pe qc sk pr').split(' '));

const normName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* Паливо з назви авто (евристика — тому в інтерфейсі просимо перевірити) */
function guessFuel(slug) {
  if (/(^|-)(electric|ev|bev|tesla|bolt|leaf|ioniq-\d|mach-e|id-4|id4|e-tron|taycan|lucid|rivian|polestar|i[3-8]|ix\d?)(-|$)/.test(slug) &&
      !/hybrid|phev/.test(slug)) return 'electric';
  if (/hybrid|phev|plug-in|prime|prius|-hev(-|$)|energi|xdrive\d+e|(^|-)4xe(-|$)/.test(slug)) return 'hybrid';
  if (/diesel|tdi|turbo-diesel|duramax|cummins|power-stroke|powerstroke|-d(-|$)/.test(slug)) return 'diesel';
  return 'petrol';
}

/* Розбір посилання. Повертає null, якщо це не посилання на лот. */
function parseLotUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const auction = host.includes('iaai') ? 'iaai' : host.includes('manheim') ? 'manheim' : 'copart';
  // Copart: /lot/<id>/<slug>; IAAI: /VehicleDetail/<id>~US (у посиланні IAAI немає опису авто)
  const m = u.pathname.match(/\/lot\/(\d+)(?:\/([^/?#]*))?/i) || u.pathname.match(/\/VehicleDetail\/(\d+)()/i);
  if (!m) return null;
  const slug = (m[2] || '').toLowerCase();
  const out = { auction, lot: m[1], slug, year: null, fuel: null, site: null, siteHint: '', title: '' };
  if (!slug) return out;

  const tokens = slug.split('-').filter(Boolean);
  const yi = tokens.findIndex((t) => /^(19[89]\d|20[0-3]\d)$/.test(t));
  if (yi >= 0) out.year = Number(tokens[yi]);
  out.fuel = guessFuel(slug);

  // Локація — хвіст slug, що починається зі штату: «…-xle-ca-los-angeles».
  // 1) точний збіг зі slug у таблиці COPART_ALIASES; 2) назва міста = ключ у COPART_LOGISTICS.
  const aliases = window.COPART_ALIASES || {};
  const keys = Object.keys((window.COPART_LOGISTICS) || {});
  const byNorm = new Map(keys.map((k) => [normName(k), k]));
  const from = Math.max(yi + 1, 0);
  let lastTail = '';
  for (let i = from; i < tokens.length - 1; i++) {
    if (!US_STATES.has(tokens[i])) continue;
    const tail = tokens.slice(i).join('-');
    const city = tokens.slice(i + 1).join(' ');
    lastTail = lastTail || city;
    const hit = aliases[tail] || byNorm.get(city);
    if (hit) { out.site = hit; out.siteHint = tail; break; }
  }
  if (!out.site) out.siteHint = lastTail;
  // Назва авто: від року до початку локації
  const end = out.site ? tokens.length - out.siteHint.split('-').length : tokens.length;
  out.title = tokens.slice(Math.max(yi, 0), Math.max(end, yi + 1)).join(' ');
  return out;
}

/* ---------- Інтерфейс ---------- */
const FUEL_UA = { petrol: 'Бензин', hybrid: 'Гібрид', electric: 'Електро', diesel: 'Дизель' };

function chip(label, value, ok, note) {
  return `<li class="${ok ? 'ok' : 'warn'}"><span class="k">${label}</span><b>${value}</b>` +
    `<span class="s">${ok ? '✓' : '!'}</span>${note ? `<em>${note}</em>` : ''}</li>`;
}

function flash(el) {
  const box = el.closest('.field') || el;
  box.classList.remove('filled'); void box.offsetWidth; box.classList.add('filled');
}

/* ---------- Картка авто зверху розрахунку + скидання посилання ---------- */
const LOT_HINT = '<p class="note">Працює тільки для посилань Copart. Рік, паливо й локація беруться з посилання. Об\'єм двигуна введіть вручну.</p>';
let applying = false;   // true, поки applyLot сам змінює поля

function titleCase(slugTitle) {
  return slugTitle.split(' ').map((t) => (/\d/.test(t) || t.length <= 3 ? t.toUpperCase() : t[0].toUpperCase() + t.slice(1))).join(' ');
}

/* Дані авто з посилання — потрапляють у верхню частину скопійованого розрахунку (js/copy.js) */
window.currentLot = null;
function showBanner(p) {
  window.currentLot = {
    title: titleCase(p.title || `Лот ${p.lot}`), lot: p.lot, site: p.site, fuel: FUEL_UA[p.fuel],
    url: $('lotUrl').value.trim(),
  };
}
function hideBanner() { window.currentLot = null; }

/* Скидає посилання й картку авто (щоб розрахунок не стосувався іншого авто) */
function clearLot(reason) {
  $('lotUrl').value = '';
  hideBanner();
  $('lotInfo').innerHTML = reason
    ? `<ul class="chips"><li class="warn"><b>Посилання скинуто</b><em>${reason}</em></li></ul>` + LOT_HINT
    : LOT_HINT;
}

function applyLot() {
  const info = $('lotInfo');
  const p = parseLotUrl($('lotUrl').value);
  if (!p) {
    hideBanner();
    info.innerHTML = '<ul class="chips"><li class="warn"><b>Не вдалося розпізнати посилання.</b>' +
      '<em>Потрібен вигляд copart.com/lot/12345678/…</em></li></ul>';
    return;
  }

  applying = true;   // програмні зміни полів не повинні скидати посилання
  document.querySelector(`#auctionSeg [data-value="${p.auction}"]`).click();

  if (!p.slug) {
    applying = false;
    hideBanner();
    info.innerHTML = '<ul class="chips">' + chip('Лот', p.lot, true) +
      chip('Дані авто', 'немає в посиланні', false, 'У посиланні IAAI немає опису — оберіть локацію, рік і паливо вручну') + '</ul>';
    calculate();
    return;
  }

  document.querySelector(`#fuelSeg [data-value="${p.fuel}"]`).click();
  flash($('carYear'));
  if (p.year) { $('carYear').value = Math.min(2026, Math.max(2007, p.year)); }
  if (p.site) { $('siteName').value = p.site; flash($('siteName')); }
  applying = false;
  calculate();
  showBanner(p);

  info.innerHTML = '<ul class="chips">' +
    chip('Лот', p.lot, true) +
    chip('Авто', p.title || '—', !!p.title) +
    chip('Рік', p.year || '—', !!p.year, p.year ? '' : 'Оберіть вручну') +
    chip('Паливо', FUEL_UA[p.fuel], true, 'Перевірте — визначено за назвою') +
    chip('Локація', p.site || (p.siteHint ? p.siteHint.toUpperCase() : '—'), !!p.site,
      p.site ? '' : 'Не знайдено в списку — оберіть вручну') +
    chip('Ціна й об\'єм двигуна', 'вручну', false, 'Немає в посиланні') +
    '</ul>';
}

// Користувач вручну змінив локацію або аукціон → посилання вже не відповідає авто, скидаємо його
$('siteName').addEventListener('change', () => { if (!applying && window.currentLot) clearLot('Ви змінили локацію'); });
$('auctionSeg').addEventListener('click', () => { if (!applying && window.currentLot) clearLot('Ви змінили аукціон'); });
// Поле посилання очищено вручну → прибираємо картку
$('lotUrl').addEventListener('input', () => { if (!$('lotUrl').value.trim()) { hideBanner(); $('lotInfo').innerHTML = LOT_HINT; } });

/* ---------- Те саме для Європи: посилання → аукціон і локація відправлення ---------- */
const EU_LOT_HINT = '<p class="note">Працює тільки для посилань Copart. Аукціон і локація беруться з посилання. Вартість покупки й об\'єм двигуна введіть вручну.</p>';
let applyingEu = false;
window.currentLotEu = null;

function clearLotEu(reason) {
  $('euLotUrl').value = '';
  window.currentLotEu = null;
  $('euLotInfo').innerHTML = reason
    ? `<ul class="chips"><li class="warn"><b>Посилання скинуто</b><em>${reason}</em></li></ul>` + EU_LOT_HINT
    : EU_LOT_HINT;
}

function applyLotEu() {
  const info = $('euLotInfo');
  const p = parseLotUrl($('euLotUrl').value);
  if (!p) {
    window.currentLotEu = null;
    info.innerHTML = '<ul class="chips"><li class="warn"><b>Не вдалося розпізнати посилання.</b>' +
      '<em>Потрібен вигляд copart.com/lot/12345678/…</em></li></ul>';
    return;
  }
  applyingEu = true;   // програмні зміни полів не повинні скидати посилання
  document.querySelector(`#euAuctionSeg [data-value="${p.auction}"]`).click();
  const opt = p.site && [...$('euSite').options].find((o) => o.value === p.site);
  if (opt) { $('euSite').value = p.site; flash($('euSite')); }
  applyingEu = false;
  calcEu();

  if (!p.slug) {
    window.currentLotEu = null;
    info.innerHTML = '<ul class="chips">' + chip('Лот', p.lot, true) +
      chip('Дані авто', 'немає в посиланні', false, 'У посиланні IAAI немає опису — оберіть локацію вручну') + '</ul>';
    return;
  }
  window.currentLotEu = { title: titleCase(p.title || `Лот ${p.lot}`), lot: p.lot, site: opt ? p.site : null, fuel: FUEL_UA[p.fuel], url: $('euLotUrl').value.trim() };
  info.innerHTML = '<ul class="chips">' +
    chip('Лот', p.lot, true) +
    chip('Авто', p.title || '—', !!p.title) +
    chip('Рік', p.year || '—', !!p.year, p.year ? '' : 'Не вказано в посиланні') +
    chip('Паливо', FUEL_UA[p.fuel], true, 'Визначено за назвою — для акцизу введіть об\'єм вручну') +
    chip('Локація', opt ? p.site : (p.siteHint ? p.siteHint.toUpperCase() : '—'), !!opt, opt ? '' : 'Не знайдено в списку — оберіть вручну') +
    chip('Ціна й об\'єм двигуна', 'вручну', false, 'Немає в посиланні') +
    '</ul>';
}

// Користувач вручну змінив локацію або аукціон → посилання вже не відповідає авто, скидаємо його
$('euSite').addEventListener('change', () => { if (!applyingEu && window.currentLotEu) clearLotEu('Ви змінили локацію'); });
$('euAuctionSeg').addEventListener('click', () => { if (!applyingEu && window.currentLotEu) clearLotEu('Ви змінили аукціон'); });
$('euLotUrl').addEventListener('input', () => { if (!$('euLotUrl').value.trim()) { window.currentLotEu = null; $('euLotInfo').innerHTML = EU_LOT_HINT; } });
$('euLotBtn').addEventListener('click', applyLotEu);
$('euLotUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyLotEu(); });
$('euLotUrl').addEventListener('paste', () => setTimeout(applyLotEu, 0));

/* ---------- Канада: посилання → рік, паливо, майданчик і порт відправки ---------- */
const CA_PROVINCES = new Set(['ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'on', 'pe', 'qc', 'sk']);
const CA_LOT_HINT = '<p class="note">Працює тільки для посилань Copart. Рік, паливо, майданчик і порт відправки беруться з посилання. Вартість покупки введіть вручну.</p>';
let applyingCa = false;
window.currentLotCa = null;

const caNorm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
/* Назва майданчика → варіанти міста: «Toronto ( ON)» → toronto; «Kenny U-Pull North Bay, North Bay, ON» → kennyupullnorthbay, northbay */
function caYardCities(name) {
  const cleaned = name.replace(/\(.*?\)/g, ' ').replace(/,\s*[A-Z]{2}\s*$/, '');
  return cleaned.split(',').map(caNorm).filter(Boolean);
}
function caYardProvince(name) {
  const m = name.match(/\(\s*([A-Z]{2})\s*\)\s*$/) || name.match(/,\s*([A-Z]{2})\s*$/);
  return m ? m[1].toLowerCase() : '';
}

/* Знаходить майданчик Канади за провінцією й містом зі slug. Повертає { hub, yard } або null.
 * Якщо майданчик є в обох хабах — обираємо дешевшу «сушу»; за рівності — Toronto. */
function findCaYard(prov, cityTokens) {
  const hubs = window.CA_YARDS || {};
  for (let n = cityTokens.length; n >= 1; n--) {
    const city = caNorm(cityTokens.slice(0, n).join(''));
    if (!city) continue;
    const hits = [];
    for (const hub of Object.keys(hubs)) for (const y of hubs[hub]) {
      if (y.sedan == null || !caYardCities(y.n).includes(city)) continue;
      const p = caYardProvince(y.n);
      if (p && prov && p !== prov) continue;
      hits.push({ hub, yard: y });
    }
    if (hits.length) { hits.sort((a, b) => (a.yard.sedan - b.yard.sedan) || (a.hub === 'Toronto' ? -1 : 1)); return hits[0]; }
  }
  return null;
}

function parseCaLotUrl(raw) {
  const p = parseLotUrl(raw);
  if (!p) return null;
  const out = { lot: p.lot, slug: p.slug, year: p.year, fuel: p.fuel, title: '', prov: '', hub: null, yard: null, cityHint: '' };
  if (!p.slug) return out;
  const tokens = p.slug.split('-').filter(Boolean);
  const yi = tokens.findIndex((t) => /^(19[89]\d|20[0-3]\d)$/.test(t));
  // провінція — останній код провінції, після якого є місто
  let pi = -1;
  for (let i = tokens.length - 2; i > Math.max(yi, 0); i--) if (CA_PROVINCES.has(tokens[i])) { pi = i; break; }
  const end = pi >= 0 ? pi : tokens.length;
  out.title = tokens.slice(Math.max(yi, 0), Math.max(end, yi + 1)).join(' ');
  if (pi >= 0) {
    out.prov = tokens[pi]; out.cityHint = tokens.slice(pi + 1).join(' ');
    const hit = findCaYard(out.prov, tokens.slice(pi + 1));
    if (hit) { out.hub = hit.hub; out.yard = hit.yard; }
  }
  return out;
}

function clearLotCa(reason) {
  $('caLotUrl').value = '';
  window.currentLotCa = null;
  $('caLotInfo').innerHTML = reason
    ? `<ul class="chips"><li class="warn"><b>Посилання скинуто</b><em>${reason}</em></li></ul>` + CA_LOT_HINT
    : CA_LOT_HINT;
}

function applyLotCa() {
  const info = $('caLotInfo');
  const p = parseCaLotUrl($('caLotUrl').value);
  if (!p) {
    window.currentLotCa = null;
    info.innerHTML = '<ul class="chips"><li class="warn"><b>Не вдалося розпізнати посилання.</b>' +
      '<em>Потрібен вигляд copart.ca/lot/12345678/…</em></li></ul>';
    return;
  }
  if (!p.slug) {
    window.currentLotCa = null;
    info.innerHTML = '<ul class="chips">' + chip('Лот', p.lot, true) + chip('Дані авто', 'немає в посиланні', false, 'Оберіть майданчик, рік і паливо вручну') + '</ul>';
    return;
  }
  applyingCa = true;   // програмні зміни полів не повинні скидати посилання
  document.querySelector('#caAuctionSeg [data-value="copart"]').click();
  if (p.yard) {
    document.querySelector(`#caHubSeg [data-value="${p.hub}"]`).click();
    const opt = [...$('caYard').options].find((o) => o.value === p.yard.n);
    if (opt) { $('caYard').value = p.yard.n; flash($('caYard')); }
  }
  document.querySelector(`#caFuelSeg [data-value="${p.fuel}"]`).click();
  if (p.year) { $('caYear').value = String(p.year < 2008 ? 2007 : Math.min(2026, p.year)); flash($('caYear')); }
  applyingCa = false;
  calcCa();
  window.currentLotCa = { title: titleCase(p.title || `Лот ${p.lot}`), lot: p.lot, site: p.yard ? p.yard.n : null, fuel: FUEL_UA[p.fuel], url: $('caLotUrl').value.trim() };

  info.innerHTML = '<ul class="chips">' +
    chip('Лот', p.lot, true) +
    chip('Авто', p.title || '—', !!p.title) +
    chip('Рік', p.year || '—', !!p.year, p.year ? '' : 'Оберіть вручну') +
    chip('Паливо', FUEL_UA[p.fuel], true, 'Перевірте — визначено за назвою') +
    chip('Майданчик', p.yard ? p.yard.n : (p.cityHint ? `${p.prov} ${p.cityHint}`.toUpperCase() : '—'), !!p.yard,
      p.yard ? '' : (p.prov ? 'Не знайдено в списку Канади — оберіть вручну' : 'Немає в посиланні — оберіть вручну')) +
    (p.yard ? chip('Порт відправки', p.hub, true, 'Можна змінити вручну') : '') +
    chip('Ціна', 'вручну', false, 'Немає в посиланні') +
    '</ul>';
}

// Користувач вручну змінив майданчик, порт або аукціон → посилання вже не відповідає авто, скидаємо його
$('caYard').addEventListener('change', () => { if (!applyingCa && window.currentLotCa) clearLotCa('Ви змінили майданчик'); });
$('caHubSeg').addEventListener('click', () => { if (!applyingCa && window.currentLotCa) clearLotCa('Ви змінили порт відправки'); });
$('caAuctionSeg').addEventListener('click', () => { if (!applyingCa && window.currentLotCa) clearLotCa('Ви змінили аукціон'); });
$('caLotUrl').addEventListener('input', () => { if (!$('caLotUrl').value.trim()) { window.currentLotCa = null; $('caLotInfo').innerHTML = CA_LOT_HINT; } });
$('caLotBtn').addEventListener('click', applyLotCa);
$('caLotUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyLotCa(); });
$('caLotUrl').addEventListener('paste', () => setTimeout(applyLotCa, 0));

$('lotBtn').addEventListener('click', applyLot);
$('lotUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyLot(); });
$('lotUrl').addEventListener('paste', () => setTimeout(applyLot, 0));
