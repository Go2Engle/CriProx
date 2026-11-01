'use strict';
const el = (id) => document.getElementById(id);
let state,
  index = 0,
  busy = false,
  loaded = false;
function range() {
  return { first: Number(el('first').value), last: Number(el('last').value) };
}
function validRange() {
  const { first, last } = range();
  return (
    !!state &&
    Number.isInteger(first) &&
    Number.isInteger(last) &&
    first >= 1 &&
    last >= first &&
    last <= state.settings.pageCount
  );
}
function controls() {
  for (const id of ['printer', 'copies', 'color', 'duplex', 'first', 'last', 'cancel'])
    el(id).disabled = busy;
  for (const id of ['print', 'advanced'])
    el(id).disabled = busy || !loaded || !el('printer').value || !validRange();
  el('previous').disabled = !validRange() || index <= range().first - 1;
  el('next').disabled = !validRange() || index >= range().last - 1;
}
function size() {
  if (!state) return;
  const s = state.settings,
    v = el('viewport'),
    z = el('zoom').value;
  const width =
    z === 'fit'
      ? Math.min(v.clientWidth - 40, ((v.clientHeight - 40) * s.widthMm) / s.heightMm)
      : ((s.widthMm / 25.4) * 96 * Number(z)) / 100;
  el('page').style.width = `${Math.max(1, width)}px`;
  el('page').style.height = 'auto';
}
async function show() {
  loaded = false;
  controls();
  el('page').hidden = true;
  const selected = index;
  el('page').src = state.pages[index];
  el('page-label').textContent = `Page ${index + 1} of ${state.pages.length}`;
  el('page').alt = `Prepared print page ${index + 1}`;
  try {
    await el('page').decode();
    if (index !== selected) return;
    loaded = true;
    el('page').hidden = false;
    size();
    controls();
  } catch {
    if (index === selected)
      el('error').textContent =
        'Could not display this print page. Cancel and prepare the sheets again.';
  }
}
async function submit(systemDialog) {
  if (busy || !loaded || !validRange() || !el('settings').reportValidity()) return;
  busy = true;
  controls();
  el('error').textContent = '';
  el('status').textContent = systemDialog
    ? 'Choose advanced settings in the system dialog. Its preview may be unavailable; the prepared page is shown here.'
    : 'Sending to printer…';
  try {
    const result = await window.printPreview.submit({
      printer: el('printer').value,
      copies: Number(el('copies').value),
      color: el('color').value === 'color',
      duplex: el('duplex').value,
      ...range(),
      systemDialog,
    });
    if (result?.status === 'cancelled')
      el('status').textContent = 'System dialog cancelled. You can continue reviewing here.';
  } catch (e) {
    el('error').textContent = e.message;
    el('status').textContent = '';
  } finally {
    busy = false;
    controls();
  }
}
el('settings').addEventListener('submit', (e) => {
  e.preventDefault();
  void submit(false);
});
el('advanced').onclick = () => void submit(true);
el('cancel').onclick = () => window.printPreview.cancel();
el('previous').onclick = () => {
  index--;
  void show();
};
el('next').onclick = () => {
  index++;
  void show();
};
el('zoom').onchange = size;
el('color').onchange = () => {
  el('page').style.filter = el('color').value === 'gray' ? 'grayscale(1)' : 'none';
};
for (const id of ['first', 'last'])
  el(id).oninput = () => {
    if (validRange()) {
      index = Math.max(range().first - 1, Math.min(index, range().last - 1));
      void show();
    } else controls();
  };
new ResizeObserver(size).observe(el('viewport'));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !busy) void window.printPreview.cancel();
});
window.printPreview
  .state()
  .then((s) => {
    state = s;
    const { settings } = s;
    el('summary').textContent =
      `${settings.widthMm.toFixed(1)} × ${settings.heightMm.toFixed(1)} mm · ${settings.pageCount} page${settings.pageCount === 1 ? '' : 's'}`;
    for (const printer of s.printers) {
      const option = document.createElement('option');
      option.value = printer.name;
      option.textContent = printer.label;
      el('printer').append(option);
    }
    if (!s.printers.length)
      el('error').textContent =
        'No printers found. Add a printer in your operating system, then reopen this preview.';
    el('duplex').value = settings.duplex;
    el('first').max = el('last').max = settings.pageCount;
    el('last').value = settings.pageCount;
    void show();
  })
  .catch((e) => {
    el('error').textContent = e.message;
  });
