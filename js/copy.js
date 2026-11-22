/* Копіювання розрахунку в буфер обміну у форматі:
 * =========================
 * Ставка : $14 700.00
 * ...
 *
 * РАЗОМ ПІД КЛЮЧ: $28 465.00
 */
function copyMoney(v) {
  const [i, f] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}$${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${f}`;
}

function buildCopyText(data) {
  const car = data.car;   // дані авто з посилання Copart (тільки для України)
  const carLines = car ? [
    `Авто : ${car.title}`,
    `Лот : ${car.lot}${car.site ? ` (${car.site})` : ''}`,
    `Посилання : ${car.url}`,
  ] : [];
  // Дані авто — над лінією, розрахунок — під нею
  const lines = [...carLines, '=========================', ...data.lines.map(([k, v]) => `${k} : ${copyMoney(v)}`)];
  lines.push('', `РАЗОМ ПІД КЛЮЧ: ${copyMoney(data.total)}`);
  if (data.extra && data.extra.length) lines.push('', ...data.extra.map(([k, v]) => `${k} : ${copyMoney(v)}`));
  return lines.join('\n');
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* пробуємо запасний спосіб */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('.copy-btn'); if (!btn) return;
  const data = btn.dataset.copy === 'eu' ? window.copyEu : { ...window.copyUa, car: window.currentLot };
  if (!data || !data.lines) return;
  const ok = await copyText(buildCopyText(data));
  const old = btn.dataset.label || (btn.dataset.label = btn.textContent);
  btn.textContent = ok ? 'Скопійовано ✓' : 'Не вдалося скопіювати';
  btn.classList.toggle('done', ok);
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1800);
});
