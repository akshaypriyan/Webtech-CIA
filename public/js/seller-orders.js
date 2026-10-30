/* seller-orders.js — mock order list with frontend-only search and status filter. */
(function () {
  const M = window.SellerMock;
  const rows = document.getElementById('order-rows');
  const tableWrap = document.getElementById('table-wrap');
  const emptyState = document.getElementById('empty-state');
  const count = document.getElementById('result-count');
  const searchInput = document.getElementById('search');
  const statusSelect = document.getElementById('filter-status');

  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const status = statusSelect.value;

    const visible = M.orders.filter(function (o) {
      const product = M.productById(o.productId).name;
      const haystack = [o.id, product, o.customer, o.reference].join(' ').toLowerCase();
      return (!q || haystack.includes(q)) && (!status || o.status === status);
    });

    rows.innerHTML = visible.map(function (o) {
      return '<tr>' +
        '<td>' + M.esc(o.id) + '</td>' +
        '<td>' + M.esc(M.productById(o.productId).name) + '</td>' +
        '<td class="num">' + o.quantity + '</td>' +
        '<td>' + M.formatDate(o.date) + '</td>' +
        '<td>' + M.esc(o.customer) + '<span class="sub">' + M.esc(o.reference) + '</span></td>' +
        '<td>' + M.statusBadge(o.status) + '</td></tr>';
    }).join('');

    const hasRows = visible.length > 0;
    tableWrap.hidden = !hasRows;
    emptyState.hidden = hasRows;
    count.textContent = 'Showing ' + visible.length + ' of ' + M.orders.length + ' orders';
  }

  searchInput.addEventListener('input', render);
  statusSelect.addEventListener('input', render);
  render();
})();
