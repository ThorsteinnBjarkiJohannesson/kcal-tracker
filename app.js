'use strict';

// ---------- storage ----------
const DAY_START_HOUR = 4;
const KEYS = { products: 'kt.products', entries: 'kt.entries', settings: 'kt.settings', seeded: 'kt.seeded' };

const SEED_PRODUCTS = {
  '5690350286299': { name: 'Grillað lærakjöt tandoori (Matfugl)', kcal100: 162, prot100: 26, size: 350, unit: 'g', source: 'seed' },
  '7340001800975': { name: 'Barebells Milkshake Vanilla', kcal100: 58, prot100: 7.3, size: 330, unit: 'ml', source: 'seed' },
};

function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function store(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { toast('Could not save: storage is full or blocked'); }
}

let products = load(KEYS.products, {});
let entries = load(KEYS.entries, []);
let settings = { kcalGoal: 2600, protGoal: 170, apiKey: '', aiModel: 'claude-opus-5-5', aiSearch: true, aiSpend: null, ...load(KEYS.settings, {}) };
if (!load(KEYS.seeded, false)) {
  products = { ...SEED_PRODUCTS, ...products };
  store(KEYS.products, products);
  store(KEYS.seeded, true);
}
const saveProducts = () => store(KEYS.products, products);
const saveEntries = () => store(KEYS.entries, entries);
const saveSettings = () => store(KEYS.settings, settings);

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => r0(n).toLocaleString('en-GB');
const fmt1 = (n) => { const v = r1(n); return Number.isInteger(v) ? String(v) : v.toFixed(1); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const buzz = (ms = 40) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };

// A "day" runs from 04:00 to 03:59 the next morning.
function dayKey(ts) {
  const d = new Date(ts);
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
function addDays(key, n) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
}
const todayKey = () => dayKey(Date.now());

// Timestamp for a new entry: now when viewing today, otherwise the same clock time on the viewed day.
function tsForViewedDay() {
  if (viewDay === todayKey()) return Date.now();
  const now = new Date();
  const d = keyToDate(viewDay);
  d.setHours(now.getHours(), now.getMinutes(), 0, 0);
  if (now.getHours() < DAY_START_HOUR) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function dayLabel(key) {
  const t = todayKey();
  if (key === t) return 'Today';
  if (key === addDays(t, -1)) return 'Yesterday';
  return keyToDate(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function macros(kcal100, prot100, amount) {
  return { kcal: r0(kcal100 * amount / 100), prot: r1(prot100 * amount / 100) };
}

function normalizeCode(raw) {
  const code = String(raw).replace(/\D/g, '');
  return code.length === 12 ? '0' + code : code; // UPC-A -> EAN-13
}
function validEan(code) {
  if (!/^\d{8}$|^\d{13}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// ---------- state & rendering ----------
let viewDay = todayKey();

function entriesFor(key) {
  return entries.filter((e) => dayKey(e.ts) === key).sort((a, b) => b.ts - a.ts);
}

function render() {
  const today = todayKey();
  if (viewDay > today) viewDay = today;
  const list = entriesFor(viewDay);
  const kcal = list.reduce((s, e) => s + e.kcal, 0);
  const prot = list.reduce((s, e) => s + e.prot, 0);

  $('dayTitle').textContent = dayLabel(viewDay);
  $('nextDay').disabled = viewDay === today;
  $('pastBanner').hidden = viewDay === today;
  $('pastDayName').textContent = dayLabel(viewDay);

  $('kcalTotal').textContent = fmt(kcal);
  $('protTotal').textContent = fmt(prot);
  const kLeft = settings.kcalGoal - kcal;
  const pLeft = settings.protGoal - prot;
  const kl = $('kcalLeft');
  kl.textContent = kLeft >= 0 ? `${fmt(kLeft)} kcal left` : `${fmt(-kLeft)} kcal over`;
  kl.className = 'left' + (kLeft < 0 ? ' over' : '');
  const pl = $('protLeft');
  pl.textContent = pLeft > 0 ? `${fmt(pLeft)} g left` : 'Goal hit';
  pl.className = 'left' + (pLeft <= 0 ? ' done' : '');
  $('kcalBar').style.width = Math.min(100, (kcal / settings.kcalGoal) * 100) + '%';
  $('kcalBar').parentElement.classList.toggle('over', kLeft < 0);
  $('protBar').style.width = Math.min(100, (prot / settings.protGoal) * 100) + '%';
  $('kcalGoal').textContent = `of ${fmt(settings.kcalGoal)} kcal`;
  $('protGoal').textContent = `of ${fmt(settings.protGoal)} g protein`;

  const ul = $('entries');
  ul.innerHTML = list.map((e) => {
    const t = new Date(e.ts);
    const amount = e.amount != null ? ` · ${fmt(e.amount)} ${e.unit}` : '';
    const tag = e.ai ? '<span class="tag">AI</span>' : '';
    return `<li class="entry-wrap" data-id="${e.id}"><div class="entry">
      <div class="name">${esc(e.name)}${tag}</div><div class="kcal">${fmt(e.kcal)} kcal</div>
      <div class="meta">${pad(t.getHours())}:${pad(t.getMinutes())}${amount}</div><div class="prot">${fmt1(e.prot)} g protein</div>
    </div></li>`;
  }).join('');
  $('empty').hidden = list.length > 0;
  ul.querySelectorAll('.entry-wrap').forEach(attachSwipe);

  renderRecent();
}

function recentItems() {
  const seen = new Set();
  const out = [];
  const sorted = [...entries].sort((a, b) => b.ts - a.ts);
  for (const e of sorted) {
    const key = e.barcode || 'q:' + e.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= 10) break;
  }
  return out;
}

function renderRecent() {
  const items = recentItems();
  $('recentWrap').hidden = items.length === 0;
  $('recent').innerHTML = items.map((e, i) =>
    `<button class="chip" data-i="${i}"><span>${esc(e.name)}</span><small>${fmt(e.kcal)} kcal</small></button>`).join('');
  $('recent').querySelectorAll('.chip').forEach((b) => {
    b.onclick = () => relog(items[+b.dataset.i]);
  });
}

// ---------- logging ----------
function addEntry(entry) {
  entries.push(entry);
  saveEntries();
  render();
  loggedToast(entry);
}

function logProduct(code, p, amount = p.size) {
  const m = macros(p.kcal100, p.prot100, amount);
  addEntry({
    id: uid(), ts: tsForViewedDay(), name: p.name, barcode: code,
    amount, unit: p.unit, size: p.size, kcal100: p.kcal100, prot100: p.prot100, ...m,
  });
}

function relog(e) {
  if (e.barcode && products[e.barcode]) {
    const p = products[e.barcode];
    // reuse the last amount, but take nutrition values from the (possibly edited) saved product
    return logProduct(e.barcode, p, e.amount ?? p.size);
  }
  const copy = { ...e, id: uid(), ts: tsForViewedDay() };
  addEntry(copy);
}

function loggedToast(e) {
  const amount = e.amount != null ? ` ${fmt(e.amount)} ${e.unit}` : '';
  toast(
    `Logged: <b>${esc(e.name)}</b>${amount} · ${fmt(e.kcal)} kcal, ${fmt1(e.prot)} g protein`,
    [
      { label: 'Undo', fn: () => { removeEntry(e.id, false); toast('Removed', [], 1500); } },
      { label: 'Change amount', primary: true, fn: () => editEntry(e.id) },
    ],
    8000,
  );
}

function removeEntry(id, withUndo = true) {
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return;
  const [gone] = entries.splice(idx, 1);
  saveEntries();
  render();
  if (withUndo) {
    toast(`Deleted <b>${esc(gone.name)}</b>`, [{ label: 'Undo', fn: () => { entries.push(gone); saveEntries(); render(); hideToast(); } }], 6000);
  }
}

// ---------- barcode handling ----------
async function handleBarcode(raw) {
  const code = normalizeCode(raw);
  const saved = products[code] || products[code.replace(/^0/, '')];
  if (isComplete(saved)) return logProduct(code, saved);

  toast(`Looking up <b>${esc(code)}</b>…`, [], 0);
  let off = null;
  try { off = await lookupOFF(code); } catch { off = null; }
  if (isComplete(off)) {
    products[code] = off;
    saveProducts();
    logProduct(code, off);
  } else {
    hideToast();
    productForm(code, { ...(off || {}), ...(saved || {}) }, {
      note: off ? 'Open Food Facts is missing some of the data. Fill in the gaps:' : 'Not found. Enter it once and the next scan is instant:',
      logAfter: true,
    });
  }
}

function isComplete(p) {
  return !!p && !!p.name && num(p.kcal100) != null && num(p.prot100) != null && num(p.size) > 0;
}

function parseQuantity(str) {
  if (!str) return null;
  const s = String(str).toLowerCase().replace(',', '.');
  const conv = (v, u) => {
    v = parseFloat(v);
    if (!Number.isFinite(v)) return null;
    switch (u) {
      case 'kg': return { size: v * 1000, unit: 'g' };
      case 'g': case 'gr': return { size: v, unit: 'g' };
      case 'l': return { size: v * 1000, unit: 'ml' };
      case 'dl': return { size: v * 100, unit: 'ml' };
      case 'cl': return { size: v * 10, unit: 'ml' };
      case 'ml': return { size: v, unit: 'ml' };
    }
    return null;
  };
  // multipack like "6 x 330 ml": one container is what gets eaten
  let m = s.match(/(\d+)\s*[x×*]\s*([\d.]+)\s*(kg|gr|g|ml|cl|dl|l)\b/);
  if (m) return conv(m[2], m[3]);
  m = s.match(/([\d.]+)\s*(kg|gr|g|ml|cl|dl|l)\b/);
  return m ? conv(m[1], m[2]) : null;
}

async function lookupOFF(code) {
  const fields = 'product_name,product_name_is,product_name_en,generic_name,brands,nutriments,product_quantity,product_quantity_unit,quantity';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const j = await res.json();
    if (j.status !== 1 || !j.product) return null;
    const p = j.product;
    const n = p.nutriments || {};

    let kcal = num(n['energy-kcal_100g']);
    if (kcal == null && num(n.energy_100g) != null) kcal = num(n.energy_100g) / 4.184; // kJ -> kcal
    const prot = num(n.proteins_100g);

    let q = parseQuantity(p.quantity);
    const pq = num(p.product_quantity);
    if (!q && pq > 0) {
      const u = String(p.product_quantity_unit || '').toLowerCase();
      q = { size: pq, unit: u === 'ml' || u === 'l' || u === 'cl' ? 'ml' : 'g' };
    }

    let name = (p.product_name_is || p.product_name || p.product_name_en || p.generic_name || '').trim();
    const brand = String(p.brands || '').split(',')[0].trim();
    const brandWord = brand.split(/\s+/)[0].toLowerCase();
    if (name && brand && !name.toLowerCase().includes(brandWord)) name += ` (${brand})`;
    if (!name && brand) name = brand;

    return {
      name,
      kcal100: kcal != null ? r1(kcal) : null,
      prot100: prot != null ? r1(prot) : null,
      size: q ? r0(q.size) : null,
      unit: q ? q.unit : 'g',
      source: 'off',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- toast ----------
let toastTimer = null;
function toast(html, actions = [], ms = 3000) {
  clearTimeout(toastTimer);
  $('toastMsg').innerHTML = html;
  const box = $('toastActions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.textContent = a.label;
    if (a.primary) b.className = 'primary';
    b.onclick = () => { hideToast(); a.fn(); };
    box.appendChild(b);
  }
  const el = $('toast');
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  if (ms) toastTimer = setTimeout(hideToast, ms);
}
function hideToast() { clearTimeout(toastTimer); $('toast').hidden = true; }

// ---------- sheets ----------
function openSheet(html, onOpen) {
  hideToast();
  const sheet = $('sheet');
  sheet.innerHTML = html;
  sheet.hidden = false;
  $('sheetBackdrop').hidden = false;
  sheet.scrollTop = 0;
  onOpen && onOpen(sheet);
}
function closeSheet() {
  $('sheet').hidden = true;
  $('sheetBackdrop').hidden = true;
  $('sheet').innerHTML = '';
}
$('sheetBackdrop').onclick = closeSheet;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('scanner').hidden) closeScanner(); else closeSheet(); }
});

// Edit an entry: grams / pack fractions for products, kcal + protein for quick adds.
function editEntry(id) {
  const e = entries.find((x) => x.id === id);
  if (!e) return;
  const isProduct = e.kcal100 != null && e.amount != null;

  if (!isProduct) {
    openSheet(`
      <h2>Edit</h2>
      <form id="f">
        <label class="field"><span>Name</span><input id="n" value="${esc(e.name)}" autocomplete="off"></label>
        <div class="row">
          <label class="field"><span>kcal</span><input id="k" inputmode="decimal" value="${e.kcal}"></label>
          <label class="field"><span>Protein (g)</span><input id="p" inputmode="decimal" value="${fmt1(e.prot)}"></label>
        </div>
        <div class="portions">
          <button type="button" data-f="0.5">½</button><button type="button" data-f="2">×2</button>
        </div>
        <div class="actions">
          <button type="button" class="btn danger" id="del">Delete</button>
          <button class="btn primary">Save</button>
        </div>
      </form>`, (s) => {
      s.querySelectorAll('.portions button').forEach((b) => {
        b.onclick = () => {
          const f = +b.dataset.f;
          s.querySelector('#k').value = r0((num(s.querySelector('#k').value) || 0) * f);
          s.querySelector('#p').value = fmt1((num(s.querySelector('#p').value) || 0) * f);
        };
      });
      s.querySelector('#del').onclick = () => { closeSheet(); removeEntry(e.id); };
      s.querySelector('#f').onsubmit = (ev) => {
        ev.preventDefault();
        e.name = s.querySelector('#n').value.trim() || e.name;
        e.kcal = r0(num(s.querySelector('#k').value) || 0);
        e.prot = r1(num(s.querySelector('#p').value) || 0);
        saveEntries(); render(); closeSheet();
      };
    });
    return;
  }

  const size = e.size || (products[e.barcode] && products[e.barcode].size) || e.amount;
  const fractions = [[0.25, '¼ pack'], [1 / 3, '⅓ pack'], [0.5, '½ pack'], [0.75, '¾ pack'], [1, '1 pack'], [2, '2 packs']];
  openSheet(`
    <h2>${esc(e.name)}</h2>
    <p class="sub">${fmt1(e.kcal100)} kcal · ${fmt1(e.prot100)} g protein per 100 ${e.unit} · pack ${fmt(size)} ${e.unit}</p>
    <form id="f">
      <div class="portions">${fractions.map(([f, l]) => `<button type="button" data-f="${f}">${l}</button>`).join('')}</div>
      <label class="field"><span>Amount (${e.unit})</span><input id="a" inputmode="decimal" value="${fmt1(e.amount)}"></label>
      <div class="preview" id="pv"></div>
      <div class="actions">
        <button type="button" class="btn danger" id="del">Delete</button>
        <button class="btn primary">Save</button>
      </div>
    </form>`, (s) => {
    const input = s.querySelector('#a');
    const update = () => {
      const a = num(input.value) || 0;
      const m = macros(e.kcal100, e.prot100, a);
      s.querySelector('#pv').innerHTML = `<b>${fmt(m.kcal)}</b> kcal · <b class="p">${fmt1(m.prot)}</b> <span class="p">g protein</span>`;
      s.querySelectorAll('.portions button').forEach((b) => b.classList.toggle('on', Math.abs(+b.dataset.f * size - a) < 0.5));
    };
    s.querySelectorAll('.portions button').forEach((b) => {
      b.onclick = () => { input.value = fmt1(+b.dataset.f * size); update(); };
    });
    input.oninput = update;
    update();
    input.focus();
    input.select();
    s.querySelector('#del').onclick = () => { closeSheet(); removeEntry(e.id); };
    s.querySelector('#f').onsubmit = (ev) => {
      ev.preventDefault();
      const a = num(input.value);
      if (!(a > 0)) { input.focus(); return; }
      e.amount = r1(a);
      Object.assign(e, macros(e.kcal100, e.prot100, e.amount));
      saveEntries(); render(); closeSheet();
    };
  });
}

// Create or edit a saved product. With logAfter, the whole pack gets logged on save.
function productForm(code, p = {}, { note = '', logAfter = false, onDone = null } = {}) {
  let unit = p.unit === 'ml' ? 'ml' : 'g';
  openSheet(`
    <h2>${logAfter ? 'New product' : 'Edit product'}</h2>
    <p class="sub">${note ? esc(note) + '<br>' : ''}Barcode ${esc(code)}</p>
    <button type="button" class="btn ai" id="aiLabel">Photo of the label → fill in with AI</button>
    <form id="f">
      <label class="field"><span>Name</span><input id="n" value="${esc(p.name || '')}" autocomplete="off" required></label>
      <div class="row">
        <label class="field"><span>kcal per 100</span><input id="k" inputmode="decimal" value="${p.kcal100 ?? ''}" required></label>
        <label class="field"><span>Protein per 100 (g)</span><input id="p" inputmode="decimal" value="${p.prot100 ?? ''}" required></label>
      </div>
      <div class="row">
        <label class="field"><span>Pack size</span><input id="s" inputmode="decimal" value="${p.size ?? ''}" required></label>
        <label class="field"><span>Unit</span><div class="seg"><button type="button" data-u="g">g</button><button type="button" data-u="ml">ml</button></div></label>
      </div>
      <div class="actions">
        <button type="button" class="btn" id="cancel">Cancel</button>
        <button class="btn primary">${logAfter ? 'Save & log' : 'Save'}</button>
      </div>
    </form>`, (s) => {
    const segs = s.querySelectorAll('.seg button');
    const setUnit = (u) => { unit = u; segs.forEach((b) => b.classList.toggle('on', b.dataset.u === u)); };
    segs.forEach((b) => { b.onclick = () => setUnit(b.dataset.u); });
    setUnit(unit);
    s.querySelector('#cancel').onclick = closeSheet;
    s.querySelector('#aiLabel').onclick = async () => {
      const btn = s.querySelector('#aiLabel');
      const files = await pickPhotos();
      if (!files.length) return;
      btn.disabled = true;
      btn.textContent = 'Reading the label…';
      try {
        const photos = await Promise.all(files.map((f) => shrinkPhoto(f)));
        const { result } = await aiAnalyze(photos, `This is the nutrition label / package of the product with barcode ${code}. Treat it as kind "label".`, undefined, { search: false });
        const set = (sel, v) => { if (v) s.querySelector(sel).value = v; };
        set('#n', result.name);
        if (result.kcal_per_100 > 0) {
          s.querySelector('#k').value = fmt1(result.kcal_per_100);
          s.querySelector('#p').value = fmt1(result.protein_per_100); // 0 g protein is a real value here
        }
        set('#s', result.pack_size > 0 ? fmt1(result.pack_size) : '');
        setUnit(result.unit === 'ml' ? 'ml' : 'g');
        btn.textContent = result.note ? `Filled in. ${result.note}` : 'Filled in. Check the numbers and save.';
      } catch (err) {
        btn.textContent = aiErrorText(err);
      } finally {
        btn.disabled = false;
      }
    };
    const first = [...s.querySelectorAll('input')].find((i) => !i.value);
    if (first) first.focus();
    s.querySelector('#f').onsubmit = (ev) => {
      ev.preventDefault();
      const prod = {
        name: s.querySelector('#n').value.trim(),
        kcal100: num(s.querySelector('#k').value),
        prot100: num(s.querySelector('#p').value),
        size: num(s.querySelector('#s').value),
        unit,
        source: 'manual',
      };
      if (!isComplete(prod)) { toast('Fill in all four fields'); return; }
      products[code] = prod;
      saveProducts();
      closeSheet();
      if (logAfter) logProduct(code, prod);
      if (onDone) onDone();
    };
  });
}

function quickAdd() {
  openSheet(`
    <h2>Quick add</h2>
    <form id="f">
      <label class="field"><span>Name</span><input id="n" placeholder="e.g. Cheeseburger" autocomplete="off" enterkeyhint="next"></label>
      <div class="row">
        <label class="field"><span>kcal</span><input id="k" inputmode="decimal" required enterkeyhint="next"></label>
        <label class="field"><span>Protein (g)</span><input id="p" inputmode="decimal" enterkeyhint="done"></label>
      </div>
      <div class="actions">
        <button type="button" class="btn" id="cancel">Cancel</button>
        <button class="btn primary">Add</button>
      </div>
    </form>`, (s) => {
    s.querySelector('#n').focus();
    s.querySelector('#cancel').onclick = closeSheet;
    s.querySelector('#f').onsubmit = (ev) => {
      ev.preventDefault();
      const kcal = num(s.querySelector('#k').value);
      if (kcal == null) { s.querySelector('#k').focus(); return; }
      const entry = {
        id: uid(), ts: tsForViewedDay(), name: s.querySelector('#n').value.trim() || 'Quick add',
        barcode: null, amount: null, unit: null, kcal100: null, prot100: null,
        kcal: r0(kcal), prot: r1(num(s.querySelector('#p').value) || 0),
      };
      closeSheet();
      addEntry(entry);
    };
  });
}

function openSettings() {
  const codes = Object.keys(products).sort((a, b) => products[a].name.localeCompare(products[b].name));
  openSheet(`
    <h2>Settings</h2>
    <form id="f">
      <div class="row">
        <label class="field"><span>Daily kcal goal</span><input id="kg" inputmode="numeric" value="${settings.kcalGoal}"></label>
        <label class="field"><span>Daily protein goal (g)</span><input id="pg" inputmode="numeric" value="${settings.protGoal}"></label>
      </div>
      <div class="actions"><button class="btn primary">Save goals</button></div>
    </form>
    <h3>Photo AI</h3>
    <form id="aiForm">
      <label class="field"><span>Anthropic API key</span><input id="key" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(settings.apiKey)}"></label>
      <label class="field"><span>Model</span><select id="model" class="field-select">${Object.entries(AI_MODELS).map(([id, m]) =>
        `<option value="${id}"${id === settings.aiModel ? ' selected' : ''}>${m.label}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" id="search"${settings.aiSearch !== false ? ' checked' : ''}> Search the web for branded and restaurant food (1¢ a search, plus the pages it reads)</label>
      <div class="actions"><button class="btn primary">Save AI settings</button></div>
    </form>
    <p class="note">${aiSpendText()} The key is stored on this phone only and never goes into backups. Make one at console.anthropic.com and set a monthly spend limit there.</p>
    <h3>Saved products (${codes.length})</h3>
    <ul class="list">${codes.map((c) => {
      const p = products[c];
      return `<li><div class="li-main"><div>${esc(p.name)}</div><div>${fmt1(p.kcal100)} kcal · ${fmt1(p.prot100)} g prot /100 ${p.unit} · ${fmt(p.size)} ${p.unit}</div></div>
        <button data-edit="${c}">Edit</button></li>`;
    }).join('') || '<li>No products yet</li>'}</ul>
    <h3>Backup</h3>
    <div class="link-row">
      <button class="btn" id="exp">Export data</button>
      <button class="btn" id="imp">Import data</button>
      <input type="file" id="impFile" accept="application/json,.json" hidden>
    </div>
    <p class="note">Everything is stored on this phone only. Export now and then so a cleared browser doesn't wipe your history. A day starts at 04:00.</p>
    <div class="actions" style="margin-top:16px"><button class="btn" id="close">Close</button></div>
  `, (s) => {
    s.querySelector('#close').onclick = closeSheet;
    s.querySelector('#f').onsubmit = (ev) => {
      ev.preventDefault();
      const kg = num(s.querySelector('#kg').value);
      const pg = num(s.querySelector('#pg').value);
      if (kg > 0) settings.kcalGoal = r0(kg);
      if (pg > 0) settings.protGoal = r0(pg);
      saveSettings(); render(); closeSheet();
      toast('Goals saved', [], 1500);
    };
    s.querySelector('#aiForm').onsubmit = (ev) => {
      ev.preventDefault();
      settings.apiKey = s.querySelector('#key').value.trim();
      settings.aiModel = s.querySelector('#model').value;
      settings.aiSearch = s.querySelector('#search').checked;
      saveSettings(); closeSheet();
      toast('AI settings saved', [], 1500);
    };
    s.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () => {
        const c = b.dataset.edit;
        productEditor(c);
      };
    });
    s.querySelector('#exp').onclick = exportData;
    s.querySelector('#imp').onclick = () => s.querySelector('#impFile').click();
    s.querySelector('#impFile').onchange = (ev) => importData(ev.target.files[0]);
  });
}

function productEditor(code) {
  productForm(code, products[code], { onDone: openSettings });
  const actions = $('sheet').querySelector('.actions');
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn danger';
  del.textContent = 'Delete';
  del.onclick = () => {
    if (!confirm(`Delete "${products[code].name}" from saved products? Logged entries stay.`)) return;
    delete products[code];
    saveProducts();
    openSettings();
  };
  actions.prepend(del);
  $('sheet').querySelector('#cancel').onclick = openSettings;
}

function exportData() {
  const { apiKey, ...safeSettings } = settings; // never put the API key in a backup file
  const data = JSON.stringify({ app: 'kcal-tracker', version: 1, exported: new Date().toISOString(), settings: safeSettings, products, entries }, null, 1);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kcal-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importData(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'kcal-tracker' || !Array.isArray(d.entries)) throw new Error('not a backup');
    if (!confirm(`Import ${d.entries.length} entries and ${Object.keys(d.products || {}).length} products? Entries already here are kept.`)) return;
    const ids = new Set(entries.map((e) => e.id));
    entries.push(...d.entries.filter((e) => !ids.has(e.id)));
    products = { ...products, ...(d.products || {}) };
    if (d.settings) settings = { ...settings, ...d.settings, apiKey: settings.apiKey };
    saveEntries(); saveProducts(); saveSettings();
    closeSheet(); render();
    toast('Backup imported', [], 2000);
  } catch {
    toast('That file is not a Kcal backup');
  }
}

// ---------- AI photo logging ----------
// Prices in USD per million tokens; a web search costs $0.01 on top.
// The per-photo figures assume ~3,100 tokens in and ~450 out, with no search.
const AI_MODELS = {
  'claude-opus-5-5': { label: 'Opus 5.5 · most accurate · ~2¢ a photo', inPrice: 4, outPrice: 20, fallbacks: true, search: 'web_search_20260209' },
  'claude-sonnet-5-5': { label: 'Sonnet 5.5 · ~1¢ a photo', inPrice: 2, outPrice: 10, fallbacks: true, search: 'web_search_20260209' },
  'claude-haiku-5-5': { label: 'Haiku 5.5 · cheapest · ~0.05¢ a photo', inPrice: 0.10, outPrice: 0.50, fallbacks: false, search: 'web_search_20250305' },
};
const SEARCH_PRICE = 0.01;

const AI_SYSTEM = `You read food photos for a calorie and protein tracker used in Iceland. Use metric units only: grams, millilitres, kcal.

Decide which kind of photo this is:
- "label": a packaged product where the nutrition table (Næringargildi / Næringarinnihald) or the pack is visible. Read the values per 100 g or per 100 ml exactly as printed. If only kJ is printed, convert with kcal = kJ / 4.184. Read the net content (e.g. "350 g", "0,33 l", "Nettóþyngd 500 g") as pack_size, converted to g or ml. Use the product name as printed on the pack, with the brand in brackets if visible. Set eaten_amount to pack_size, and the totals to the whole pack.
- "meal": prepared food, a dish, or unpackaged food. Identify it and estimate the portion in grams from visual cues such as plate size, cutlery, hands and packaging. Always give eaten_amount, kcal_total and protein_total for what is shown, and per-100 values consistent with those totals. Name it briefly in English.

Several photos show the same item, for example the front and back of a pack.
Icelandic labels use a comma as the decimal separator ("7,3 g"); return plain numbers.
If the digits under a barcode are legible, put them in barcode, otherwise "".
confidence is "high" when the numbers were read from a label or an official source, otherwise "medium" or "low".
note is one short sentence about anything uncertain (for example "portion size guessed from the plate"), or "".
Use 0 for any number you cannot determine.

If the web_search tool is available: when the photo shows an identifiable branded product or an item from a restaurant or chain, and no nutrition table is legible in the photo, search for its official nutrition information (the manufacturer's site, the chain's nutrition page, Icelandic store listings) and use those values. Prefer official sources over user-submitted calorie databases. Do not search when a nutrition table is legible in the photo, or for generic or home-cooked food; estimate those directly. The portion in the photo still decides eaten_amount.

Finish by calling the log_food tool exactly once with the result. source is "label" when the numbers come from the photo, "web" when they come from a web page (put that page's URL in source_url), and "estimate" otherwise; source_url is "" unless source is "web".`;

const SEARCH_LOCATION = { type: 'approximate', country: 'IS', timezone: 'Atlantic/Reykjavik' };

const AI_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['label', 'meal'] },
    name: { type: 'string' },
    kcal_per_100: { type: 'number' },
    protein_per_100: { type: 'number' },
    unit: { type: 'string', enum: ['g', 'ml'] },
    pack_size: { type: 'number' },
    eaten_amount: { type: 'number' },
    kcal_total: { type: 'number' },
    protein_total: { type: 'number' },
    barcode: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    note: { type: 'string' },
    source: { type: 'string', enum: ['label', 'web', 'estimate'] },
    source_url: { type: 'string' },
  },
  required: ['kind', 'name', 'kcal_per_100', 'protein_per_100', 'unit', 'pack_size', 'eaten_amount', 'kcal_total', 'protein_total', 'barcode', 'confidence', 'note', 'source', 'source_url'],
  additionalProperties: false,
};

// The answer comes back as a strict tool call: web search always adds citations,
// and citations can't be combined with output_config.format.
const LOG_TOOL = {
  name: 'log_food',
  description: 'Records the nutrition result for the photo. Call it exactly once, as the final step.',
  strict: true,
  input_schema: AI_SCHEMA,
};

let sdkPromise = null;
const loadSdk = () => (sdkPromise ||= import('./vendor/anthropic-sdk.mjs'));

function pickPhotos() {
  return new Promise((resolve) => {
    const input = $('photoInput');
    input.value = '';
    input.onchange = () => resolve([...input.files].slice(0, 3));
    input.click();
  });
}

// Downscale to 1568 px on the long edge: keeps label text legible and the upload small.
async function shrinkPhoto(file, maxSide = 1568) {
  let img;
  try {
    img = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    img = await new Promise((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = URL.createObjectURL(file);
    });
  }
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { url, data: url.slice(url.indexOf(',') + 1) };
}

async function aiAnalyze(photos, hint = '', signal, { search = true } = {}) {
  if (!settings.apiKey) throw Object.assign(new Error('No API key'), { code: 'no-key' });
  const sdk = await loadSdk();
  const Anthropic = sdk.default;
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 120_000 });
  const model = AI_MODELS[settings.aiModel] ? settings.aiModel : 'claude-opus-5-5';
  const m = AI_MODELS[model];
  const content = [
    ...photos.map((p) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.data } })),
    { type: 'text', text: hint || 'Log what is in the photo.' },
  ];
  const usage = { input: 0, output: 0, searches: 0 };

  const run = async (withSearch) => {
    const tools = [LOG_TOOL];
    if (withSearch) tools.unshift({ type: m.search, name: 'web_search', max_uses: 3, user_location: SEARCH_LOCATION });
    const messages = [{ role: 'user', content }];
    let res;
    // A search turn can pause on the server; sending the paused turn back resumes it.
    for (let i = 0; i < 4; i++) {
      const params = { model, max_tokens: 16000, system: AI_SYSTEM, output_config: { effort: 'low' }, tools, messages };
      // Opus and Sonnet: if a safety classifier wrongly declines a food photo, the API retries on a fallback model.
      res = m.fallbacks
        ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
        : await client.messages.create(params, { signal });
      usage.input += res.usage.input_tokens || 0;
      usage.output += res.usage.output_tokens || 0;
      usage.searches += (res.usage.server_tool_use && res.usage.server_tool_use.web_search_requests) || 0;
      if (res.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: res.content });
    }
    return res;
  };

  let res;
  const wantSearch = search && settings.aiSearch !== false;
  try {
    res = await run(wantSearch);
  } catch (err) {
    // If the API won't combine search with the answer tool, still answer from the photo alone.
    if (!wantSearch || err.status !== 400 || /credit/i.test(err.message || '')) throw err;
    res = await run(false);
  }

  if (res.stop_reason === 'refusal') throw Object.assign(new Error('Refused'), { code: 'refusal' });
  const call = res.content.find((b) => b.type === 'tool_use' && b.name === 'log_food');
  if (!call) throw Object.assign(new Error('No answer'), { code: 'empty' });
  const result = typeof call.input === 'string' ? JSON.parse(call.input) : call.input;

  const sources = [];
  for (const b of res.content) {
    if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r.url && !sources.some((s) => s.url === r.url)) sources.push({ url: r.url, title: r.title || r.url });
    }
  }

  const cost = (usage.input * m.inPrice + usage.output * m.outPrice) / 1e6 + usage.searches * SEARCH_PRICE;
  const month = todayKey().slice(0, 7);
  if (!settings.aiSpend || settings.aiSpend.month !== month) settings.aiSpend = { month, usd: 0, photos: 0 };
  settings.aiSpend.usd += cost;
  settings.aiSpend.photos += 1;
  saveSettings();
  return { result, cost, searches: usage.searches, sources };
}

function aiSpendText() {
  const s = settings.aiSpend;
  if (!s || s.month !== todayKey().slice(0, 7)) return 'No AI photos this month.';
  return `This month: $${s.usd.toFixed(2)} for ${s.photos} photo${s.photos === 1 ? '' : 's'}.`;
}

function aiErrorText(err) {
  if (err && err.code === 'no-key') return 'Add your Anthropic API key in Settings first.';
  if (err && err.code === 'refusal') return 'The AI declined this photo. Try another one.';
  if (err && err.name === 'AbortError') return 'Cancelled.';
  const status = err && err.status;
  if (status === 401) return 'API key rejected. Check it in Settings.';
  if (status === 400 && /credit/i.test(err.message || '')) return 'Your Anthropic account is out of credit.';
  if (status === 429 || status === 529) return 'The AI is busy right now. Try again in a moment.';
  if (err && /connection|fetch|network/i.test(err.message || '')) return 'No connection. Try again when online.';
  return 'Could not read the photo' + (status ? ` (error ${status})` : '') + '.';
}

async function photoFlow() {
  if (!settings.apiKey) {
    openSettings();
    toast('Add your Anthropic API key under Photo AI to use photo logging', [], 4000);
    return;
  }
  const files = await pickPhotos();
  if (!files.length) return;
  const photos = await Promise.all(files.map((f) => shrinkPhoto(f)));
  const ctrl = new AbortController();
  const thumbs = `<div class="thumbs">${photos.map((p) => `<img src="${p.url}" alt="">`).join('')}</div>`;
  openSheet(`
    <h2>Photo AI</h2>
    ${thumbs}
    <div class="ai-wait"><div class="spinner"></div><span id="aiStatus">Reading the photo…${settings.aiSearch !== false ? ' It may search the web, which takes longer.' : ''}</span></div>
    <div class="actions"><button type="button" class="btn" id="cancel">Cancel</button></div>`, (s) => {
    s.querySelector('#cancel').onclick = () => { ctrl.abort(); closeSheet(); };
  });
  try {
    const res = await aiAnalyze(photos, '', ctrl.signal);
    if (ctrl.signal.aborted) return;
    aiResultSheet(res, thumbs);
  } catch (err) {
    if (ctrl.signal.aborted) return;
    const st = $('sheet').querySelector('#aiStatus');
    if (st) {
      st.textContent = aiErrorText(err);
      $('sheet').querySelector('.spinner').remove();
    }
  }
}

function sourceText(r, sources) {
  if (r.source === 'label') return 'read from the label';
  if (r.source !== 'web') return 'estimated from the photo';
  let url = /^https?:\/\//.test(r.source_url) ? r.source_url : (sources[0] && sources[0].url);
  if (!url) return 'from the web';
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  return `from <a href="${esc(url)}" target="_blank" rel="noopener">${esc(host)}</a>`;
}

// Review what the AI found, adjust if needed, then log.
function aiResultSheet({ result: r, cost, searches, sources }, thumbs) {
  const isLabel = r.kind === 'label';
  let unit = r.unit === 'ml' ? 'ml' : 'g';
  let amount = r.eaten_amount > 0 ? r.eaten_amount : (r.pack_size > 0 ? r.pack_size : 0);
  let k100 = r.kcal_per_100;
  let p100 = r.protein_per_100;
  // Fill in per-100 values from totals if the model only gave totals.
  if (!(k100 > 0) && amount > 0 && r.kcal_total > 0) {
    k100 = (r.kcal_total / amount) * 100;
    p100 = (r.protein_total / amount) * 100;
  }
  const byWeight = k100 > 0 && amount > 0;
  const barcode = normalizeCode(r.barcode || '');
  const saveCode = isLabel && validEan(barcode) ? barcode : null;
  const confClass = r.confidence === 'low' ? ' class="conf-low"' : '';

  openSheet(`
    <h2>${isLabel ? 'Label read' : 'Meal estimate'}</h2>
    ${thumbs}
    <p class="ai-meta"><span${confClass}>${esc(r.confidence)} confidence</span> · ${sourceText(r, sources)}${r.note ? ' · ' + esc(r.note) : ''}<br>
      cost $${cost.toFixed(4)}${searches ? ` (${searches} web search${searches === 1 ? '' : 'es'})` : ''}</p>
    <form id="f">
      <label class="field"><span>Name</span><input id="n" value="${esc(r.name)}" autocomplete="off"></label>
      ${byWeight ? `
      <div class="row">
        <label class="field"><span>kcal per 100</span><input id="k" inputmode="decimal" value="${fmt1(k100)}"></label>
        <label class="field"><span>Protein per 100 (g)</span><input id="p" inputmode="decimal" value="${fmt1(p100)}"></label>
      </div>
      <div class="row">
        <label class="field"><span>${isLabel ? 'Pack size / eaten' : 'Amount eaten'}</span><input id="a" inputmode="decimal" value="${fmt1(amount)}"></label>
        <label class="field"><span>Unit</span><div class="seg"><button type="button" data-u="g">g</button><button type="button" data-u="ml">ml</button></div></label>
      </div>
      <div class="portions"><button type="button" data-f="0.5">½</button><button type="button" data-f="0.75">¾</button><button type="button" data-f="1.25">+25%</button><button type="button" data-f="2">×2</button></div>
      <div class="preview" id="pv"></div>` : `
      <div class="row">
        <label class="field"><span>kcal</span><input id="kt" inputmode="decimal" value="${r0(r.kcal_total)}"></label>
        <label class="field"><span>Protein (g)</span><input id="pt" inputmode="decimal" value="${fmt1(r.protein_total)}"></label>
      </div>`}
      ${saveCode ? `<p class="note" style="margin:0 0 12px">Saved under barcode ${saveCode}, so scanning it next time is instant.</p>` : ''}
      <div class="actions">
        <button type="button" class="btn" id="cancel">Cancel</button>
        <button class="btn primary">Log it</button>
      </div>
    </form>`, (s) => {
    s.querySelector('#cancel').onclick = closeSheet;
    const val = (sel) => num(s.querySelector(sel).value);
    if (byWeight) {
      const segs = s.querySelectorAll('.seg button');
      const setUnit = (u) => { unit = u; segs.forEach((b) => b.classList.toggle('on', b.dataset.u === u)); };
      segs.forEach((b) => { b.onclick = () => setUnit(b.dataset.u); });
      setUnit(unit);
      const update = () => {
        const m = macros(val('#k') || 0, val('#p') || 0, val('#a') || 0);
        s.querySelector('#pv').innerHTML = `<b>${fmt(m.kcal)}</b> kcal · <b class="p">${fmt1(m.prot)}</b> <span class="p">g protein</span>`;
      };
      s.querySelectorAll('#k, #p, #a').forEach((i) => { i.oninput = update; });
      s.querySelectorAll('.portions button').forEach((b) => {
        b.onclick = () => { s.querySelector('#a').value = fmt1((val('#a') || 0) * +b.dataset.f); update(); };
      });
      update();
    }
    s.querySelector('#f').onsubmit = (ev) => {
      ev.preventDefault();
      const name = s.querySelector('#n').value.trim() || (isLabel ? 'Product' : 'Meal');
      if (byWeight) {
        const kcal100 = val('#k'), prot100 = val('#p') ?? 0, amt = val('#a');
        if (!(kcal100 >= 0) || !(amt > 0)) return;
        const size = isLabel && r.pack_size > 0 ? r.pack_size : amt;
        if (saveCode) {
          products[saveCode] = { name, kcal100, prot100, size, unit, source: 'ai' };
          saveProducts();
        }
        closeSheet();
        addEntry({
          id: uid(), ts: tsForViewedDay(), name, barcode: saveCode, ai: true,
          amount: r1(amt), unit, size, kcal100, prot100, ...macros(kcal100, prot100, amt),
        });
      } else {
        const kcal = val('#kt');
        if (kcal == null) return;
        const prot = val('#pt') || 0;
        closeSheet();
        addEntry({
          id: uid(), ts: tsForViewedDay(), name, barcode: null, ai: true,
          amount: null, unit: null, kcal100: null, prot100: null, kcal: r0(kcal), prot: r1(prot),
        });
      }
    };
  });
}

// ---------- swipe to delete / tap to edit ----------
function attachSwipe(wrap) {
  const row = wrap.querySelector('.entry');
  let startX = 0, startY = 0, dx = 0, active = false, horizontal = null;
  row.addEventListener('pointerdown', (e) => {
    active = true; horizontal = null; dx = 0;
    startX = e.clientX; startY = e.clientY;
    row.classList.remove('anim');
  });
  row.addEventListener('pointermove', (e) => {
    if (!active) return;
    const mx = e.clientX - startX, my = e.clientY - startY;
    if (horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      horizontal = Math.abs(mx) > Math.abs(my);
      if (horizontal) row.setPointerCapture(e.pointerId);
    }
    if (horizontal) {
      dx = Math.min(0, mx);
      row.style.transform = `translateX(${dx}px)`;
    }
  });
  const end = () => {
    if (!active) return;
    active = false;
    row.classList.add('anim');
    if (horizontal && dx < -Math.min(120, row.offsetWidth * 0.35)) {
      row.style.transform = 'translateX(-100%)';
      buzz(20);
      setTimeout(() => removeEntry(wrap.dataset.id), 180);
    } else {
      row.style.transform = '';
      if (horizontal === null) editEntry(wrap.dataset.id);
    }
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', () => { active = false; row.classList.add('anim'); row.style.transform = ''; });
}

// ---------- scanner ----------
const scanner = {
  stream: null, running: false, detector: null, zxing: null,
  canvas: document.createElement('canvas'), last: null, lastAt: 0, torchOn: false,
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function getDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const want = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((f) => supported.includes(f));
      if (want.length) {
        const det = new window.BarcodeDetector({ formats: want });
        return { type: 'native', detect: async (video) => (await det.detect(video)).map((b) => b.rawValue) };
      }
    } catch {}
  }
  if (!window.ZXing) await loadScript('vendor/zxing.min.js');
  const Z = window.ZXing;
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  const canvas = scanner.canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return {
    type: 'zxing',
    detect: async (video) => {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw) return [];
      // Decode a band through the middle of the frame, scaled to ~800 px wide.
      const cropH = Math.round(vh * 0.5), cropY = Math.round((vh - cropH) / 2);
      const scale = Math.min(1, 800 / vw);
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(cropH * scale);
      ctx.drawImage(video, 0, cropY, vw, cropH, 0, 0, canvas.width, canvas.height);
      try {
        const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
        return [reader.decodeWithState(bmp).getText()];
      } catch {
        return [];
      } finally {
        reader.reset();
      }
    },
  };
}

async function openScanner() {
  hideToast();
  const el = $('scanner');
  el.hidden = false;
  el.classList.remove('hit');
  $('scanStatus').textContent = 'Starting camera…';
  $('torch').hidden = true;
  scanner.last = null;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $('scanStatus').textContent = 'Camera needs HTTPS. Type the barcode instead.';
    return;
  }
  try {
    const [stream, detector] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      }),
      scanner.detector ? Promise.resolve(scanner.detector) : getDetector(),
    ]);
    if (el.hidden) { stream.getTracks().forEach((t) => t.stop()); return; } // closed while starting
    scanner.detector = detector;
    scanner.stream = stream;
    const video = $('video');
    video.srcObject = stream;
    await video.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.focusMode && caps.focusMode.includes('continuous')) {
      track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    }
    if (caps.torch) { $('torch').hidden = false; $('torch').classList.remove('on'); scanner.torchOn = false; }
    $('scanStatus').textContent = 'Point at a barcode';
    scanner.running = true;
    scanLoop();
  } catch (err) {
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    $('scanStatus').textContent = denied ? 'Camera blocked. Allow it in browser settings.' : 'Could not start camera';
  }
}

async function scanLoop() {
  const video = $('video');
  const interval = scanner.detector.type === 'native' ? 60 : 120;
  while (scanner.running) {
    const t0 = performance.now();
    if (video.readyState >= 2) {
      let codes = [];
      try { codes = await scanner.detector.detect(video); } catch {}
      for (const raw of codes) {
        const code = normalizeCode(raw);
        if (!validEan(code) && !/^\d{8}$/.test(code)) continue;
        // require two matching reads in a row to rule out misreads
        const now = performance.now();
        if (scanner.last === code && now - scanner.lastAt < 1500) {
          if (!scanner.running) return;
          $('scanner').classList.add('hit');
          buzz(60);
          closeScanner();
          handleBarcode(code);
          return;
        }
        scanner.last = code;
        scanner.lastAt = now;
      }
    }
    const wait = interval - (performance.now() - t0);
    await new Promise((r) => setTimeout(r, Math.max(0, wait)));
  }
}

function closeScanner() {
  scanner.running = false;
  if (scanner.stream) scanner.stream.getTracks().forEach((t) => t.stop());
  scanner.stream = null;
  $('video').srcObject = null;
  $('scanner').hidden = true;
}

$('torch').onclick = async () => {
  const track = scanner.stream && scanner.stream.getVideoTracks()[0];
  if (!track) return;
  scanner.torchOn = !scanner.torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: scanner.torchOn }] });
    $('torch').classList.toggle('on', scanner.torchOn);
  } catch { scanner.torchOn = false; }
};

$('manualCode').onclick = () => {
  closeScanner();
  openSheet(`
    <h2>Type barcode</h2>
    <form id="f">
      <label class="field"><span>Barcode (the numbers under the lines)</span><input id="c" inputmode="numeric" autocomplete="off" required></label>
      <div class="actions">
        <button type="button" class="btn" id="cancel">Cancel</button>
        <button class="btn primary">Log it</button>
      </div>
    </form>`, (s) => {
    const input = s.querySelector('#c');
    input.focus();
    s.querySelector('#cancel').onclick = closeSheet;
    s.querySelector('#f').onsubmit = (ev) => {
      ev.preventDefault();
      const code = normalizeCode(input.value);
      if (code.length < 8) { input.focus(); return; }
      closeSheet();
      handleBarcode(code);
    };
  });
};

// ---------- wiring ----------
$('scan').onclick = openScanner;
$('closeScanner').onclick = closeScanner;
$('quickAdd').onclick = quickAdd;
$('photo').onclick = photoFlow;
$('openSettings').onclick = openSettings;
$('prevDay').onclick = () => { viewDay = addDays(viewDay, -1); render(); };
$('nextDay').onclick = () => { viewDay = addDays(viewDay, 1); render(); };
$('dayTitle').onclick = () => { viewDay = todayKey(); render(); };
$('backToToday').onclick = () => { viewDay = todayKey(); render(); };

// Re-render when coming back to the app (the day may have rolled over at 04:00).
let lastToday = todayKey();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (!$('scanner').hidden) closeScanner(); return; }
  const t = todayKey();
  if (t !== lastToday) { if (viewDay === lastToday) viewDay = t; lastToday = t; }
  render();
});

render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
