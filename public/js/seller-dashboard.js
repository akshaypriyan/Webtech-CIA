/* seller-dashboard.js — renders the dashboard from SellerMock (Day 1: static). */
(function () {
  const M = window.SellerMock;
  const t = M.totals();

  const stats = [
    { label: 'Total Products',  value: t.totalProducts,   hint: 'Active listings' },
    { label: 'Total Orders',    value: t.totalOrders,     hint: 'All time, incl. cancelled' },
    { label: 'Pending Orders',  value: t.pendingOrders,   hint: 'Awaiting your action' },
    { label: 'Total Revenue',   value: M.money(t.revenue), hint: 'Excludes cancelled orders' }
  ];
  document.getElementById('stats').innerHTML = stats.map(function (s) {
    return '<div class="card"><div class="stat__label">' + s.label + '</div>' +
           '<div class="stat__value">' + s.value + '</div>' +
           '<div class="stat__hint">' + s.hint + '</div></div>';
  }).join('');

  // Orders are listed newest-first in the dataset.
  document.getElementById('recent-orders').innerHTML = M.orders.slice(0, 5).map(function (o) {
    return '<tr><td>' + M.esc(o.id) + '<span class="sub">' + M.formatDate(o.date) + '</span></td>' +
           '<td>' + M.esc(M.productById(o.productId).name) + ' &times; ' + o.quantity + '</td>' +
           '<td>' + M.statusBadge(o.status) + '</td>' +
           '<td class="num">' + M.money(M.orderTotal(o)) + '</td></tr>';
  }).join('');

  const low = M.products.filter(function (p) { return p.stock <= M.LOW_STOCK_THRESHOLD; })
                        .sort(function (a, b) { return a.stock - b.stock; });
  document.getElementById('low-stock').innerHTML = low.length
    ? low.map(function (p) {
        return '<li class="list__item"><span class="product-cell">' + M.thumb(p) + '<span>' + M.esc(p.name) +
               '<span class="sub">' + p.stock + ' left</span></span></span>' + M.statusBadge(M.stockStatus(p)) + '</li>';
      }).join('')
    : '<li class="empty">All products are well stocked.</li>';

  document.getElementById('activity').innerHTML = M.activity.map(function (a) {
    return '<li class="list__item"><span>' + M.esc(a.text) + '</span><span class="list__time">' + M.esc(M.activityTime(a)) + '</span></li>';
  }).join('');
})();
