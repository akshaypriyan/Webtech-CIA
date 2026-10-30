/* seller-reports.js — mock sales report computed from SellerMock orders (no API yet). */
(function () {
  const M = window.SellerMock;
  const sales = M.countedOrders();
  const t = M.totals();

  const stats = [
    { label: 'Total Sales',   value: t.unitsSold,        hint: 'Units sold' },
    { label: 'Total Revenue', value: M.money(t.revenue), hint: 'Excludes cancelled orders' },
    { label: 'Order Count',   value: sales.length,       hint: 'Excludes cancelled orders' }
  ];
  document.getElementById('stats').innerHTML = stats.map(function (s) {
    return '<div class="card"><div class="stat__label">' + s.label + '</div>' +
           '<div class="stat__value">' + s.value + '</div>' +
           '<div class="stat__hint">' + s.hint + '</div></div>';
  }).join('');

  // Revenue grouped into weeks starting Monday (week start computed in UTC to avoid DST drift).
  function weekStart(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  const weekly = {};
  sales.forEach(function (o) { const k = weekStart(o.date); weekly[k] = (weekly[k] || 0) + M.orderTotal(o); });
  const weeks = Object.keys(weekly).sort();
  const maxWeek = Math.max.apply(null, weeks.map(function (k) { return weekly[k]; }));
  document.getElementById('weekly-chart').innerHTML = weeks.map(function (k) {
    const pct = Math.round(weekly[k] / maxWeek * 100);
    return '<div class="bar__row"><span>Week of ' + M.formatDate(k) + '</span>' +
           '<div class="bar__track"><div class="bar__fill" style="width:' + pct + '%"></div></div>' +
           '<span class="bar__value">' + M.money(weekly[k]) + '</span></div>';
  }).join('');

  const byProduct = {};
  sales.forEach(function (o) {
    const row = byProduct[o.productId] || (byProduct[o.productId] = { units: 0, revenue: 0 });
    row.units += o.quantity;
    row.revenue += M.orderTotal(o);
  });
  const ranked = Object.keys(byProduct).map(function (id) {
    return { product: M.productById(Number(id)), units: byProduct[id].units, revenue: byProduct[id].revenue };
  }).sort(function (a, b) { return b.units - a.units || b.revenue - a.revenue; });
  document.getElementById('best-sellers').innerHTML = ranked.map(function (r) {
    return '<tr><td>' + M.esc(r.product.name) + '</td><td class="num">' + r.units + '</td><td class="num">' + M.money(r.revenue) + '</td></tr>';
  }).join('');

  document.getElementById('recent-sales').innerHTML = sales.slice(0, 8).map(function (o) {
    return '<tr><td>' + M.formatDate(o.date) + '</td><td>' + M.esc(o.id) + '</td>' +
           '<td>' + M.esc(M.productById(o.productId).name) + '</td>' +
           '<td class="num">' + o.quantity + '</td><td class="num">' + M.money(M.orderTotal(o)) + '</td></tr>';
  }).join('');
})();
