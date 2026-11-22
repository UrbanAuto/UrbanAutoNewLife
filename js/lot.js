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

$('lotBtn').addEventListener('click', applyLot);
$('lotUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyLot(); });
$('lotUrl').addEventListener('paste', () => setTimeout(applyLot, 0));
