/* seller-reports.js — sales report from /api/seller/reports (summary, weekly revenue, best sellers, recent sales). */
(function () {
  if (!requireRole('Seller')) return;

  const statsEl = document.getElementById('stats');
  const weeklyEl = document.getElementById('weekly-chart');
  const bestEl = document.getElementById('best-sellers');
  const recentEl = document.getElementById('recent-sales');
  const statusEl = document.getElementById('report-status');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function num(n) { n = Number(n); return Number.isFinite(n) ? n : 0; }
  function money(n) {
    return '$' + num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function cell(text, className) { return el('td', className || '', text); }
  function emptyRow(tbody, cols, text) {
    const tr = document.createElement('tr');
    const td = cell(text);
    td.colSpan = cols;
    td.className = 'sub';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  function renderStats(s) {
    const stats = [
      { label: 'Total Sales',   value: String(num(s.units_sold)),     hint: 'Units sold' },
      { label: 'Total Revenue', value: money(s.total_revenue),   hint: 'Excludes cancelled items' },
      { label: 'Order Count',   value: String(num(s.order_count)),    hint: 'Orders containing your products' }
    ];
    statsEl.textContent = '';
    stats.forEach(function (st) {
      const card = el('div', 'card');
      card.appendChild(el('div', 'stat__label', st.label));
      card.appendChild(el('div', 'stat__value', st.value));
      card.appendChild(el('div', 'stat__hint', st.hint));
      statsEl.appendChild(card);
    });
  }

  function renderWeekly(weeks) {
    weeklyEl.textContent = '';
    if (!weeks.length) { weeklyEl.appendChild(el('p', 'sub', hasRange() ? 'No sales in this period.' : 'No sales yet.')); return; }
    const max = Math.max.apply(null, weeks.map(function (w) { return num(w.revenue); }));
    weeks.forEach(function (w) {
      const row = el('div', 'bar__row');
      row.appendChild(el('span', '', 'Week of ' + formatDate(w.week_start)));
      const track = el('div', 'bar__track');
      const fill = el('div', 'bar__fill');
      // Any week with revenue keeps a visible sliver so small bars never vanish.
      fill.style.width = (num(w.revenue) > 0 && max > 0 ? Math.max(3, Math.round(num(w.revenue) / max * 100)) : 0) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'bar__value', money(w.revenue)));
      weeklyEl.appendChild(row);
    });
  }

  function renderBest(list) {
    bestEl.textContent = '';
    if (!list.length) { emptyRow(bestEl, 3, hasRange() ? 'No sales in this period.' : 'No sales yet.'); return; }
    list.forEach(function (r) {
      const tr = document.createElement('tr');
      tr.appendChild(cell(r.product_name));
      tr.appendChild(cell(String(num(r.units)), 'num'));
      tr.appendChild(cell(money(r.revenue), 'num'));
      bestEl.appendChild(tr);
    });
  }

  function renderRecent(list) {
    recentEl.textContent = '';
    if (!list.length) { emptyRow(recentEl, 5, hasRange() ? 'No sales in this period.' : 'No sales yet.'); return; }
    list.forEach(function (r) {
      const tr = document.createElement('tr');
      tr.appendChild(cell(formatDate(r.order_date)));
      tr.appendChild(cell('ORD-' + r.order_id));
      tr.appendChild(cell(r.product_name));
      tr.appendChild(cell(String(num(r.quantity)), 'num'));
      tr.appendChild(cell(money(r.revenue), 'num'));
      recentEl.appendChild(tr);
    });
  }

  const fromInput = document.getElementById('range-from');
  const toInput = document.getElementById('range-to');
  let activeRange = '';
  function hasRange() { return activeRange !== ''; }

  async function load() {
    statusEl.classList.remove('form-status--error');
    statusEl.textContent = 'Loading report…';
    try {
      const res = await apiFetch('/seller/reports' + activeRange);
      const d = res.data;
      renderStats(d.summary);
      renderWeekly(d.weekly);
      renderBest(d.best_sellers);
      renderRecent(d.recent_sales);
      statusEl.textContent = num(d.summary.order_count) === 0
        ? (hasRange() ? 'No sales in the selected period.' : 'No sales recorded yet. Cancelled items are never counted.')
        : '';
    } catch (err) {
      if (err.status === 401) return;
      statsEl.textContent = '';
      weeklyEl.textContent = '';
      bestEl.textContent = '';
      recentEl.textContent = '';
      statusEl.classList.add('form-status--error');
      statusEl.textContent = '';
      statusEl.appendChild(document.createTextNode('Could not load the report: ' + (err.message || 'Something went wrong.') + ' '));
      const retry = el('button', 'btn btn--secondary btn--sm', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', load);
      statusEl.appendChild(retry);
    }
  }

  document.getElementById('range-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (fromInput.value && toInput.value && fromInput.value > toInput.value) {
      statusEl.classList.add('form-status--error');
      statusEl.textContent = 'The "From" date cannot be after the "To" date.';
      return;
    }
    const params = new URLSearchParams();
    if (fromInput.value) params.set('from', fromInput.value);
    if (toInput.value) params.set('to', toInput.value);
    activeRange = params.toString() ? '?' + params.toString() : '';
    load();
  });
  document.getElementById('range-clear').addEventListener('click', function () {
    fromInput.value = '';
    toInput.value = '';
    activeRange = '';
    load();
  });

  load();
})();
