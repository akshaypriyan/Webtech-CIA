/* seller-products.js — product table with frontend-only search, filters and delete (mock). */
(function () {
  const M = window.SellerMock;
  // Work on a copy so "delete" never mutates the shared dataset used by other scripts.
  let products = M.products.slice();

  const rows = document.getElementById('product-rows');
  const tableWrap = document.getElementById('table-wrap');
  const emptyState = document.getElementById('empty-state');
  const count = document.getElementById('result-count');
  const searchInput = document.getElementById('search');
  const categorySelect = document.getElementById('filter-category');
  const statusSelect = document.getElementById('filter-status');

  M.categories.forEach(function (c) {
    const opt = document.createElement('option');
    opt.textContent = c;
    categorySelect.appendChild(opt);
  });

  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const cat = categorySelect.value;
    const status = statusSelect.value;

    const visible = products.filter(function (p) {
      return (!q || p.name.toLowerCase().includes(q)) &&
             (!cat || p.category === cat) &&
             (!status || M.stockStatus(p) === status);
    });

    rows.innerHTML = visible.map(function (p) {
      return '<tr data-id="' + p.id + '">' +
        '<td><span class="product-cell">' + M.thumb(p) + '<span>' + M.esc(p.name) + '</span></span></td>' +
        '<td>' + M.esc(p.category) + '</td>' +
        '<td class="num">' + M.money(p.price) + '</td>' +
        '<td class="num">' + p.stock + '</td>' +
        '<td>' + M.statusBadge(M.stockStatus(p)) + '</td>' +
        '<td><div class="actions">' +
          '<button type="button" class="btn btn--secondary btn--sm" data-action="edit" aria-label="Edit ' + M.esc(p.name) + '">Edit</button>' +
          '<button type="button" class="btn btn--danger btn--sm" data-action="delete" aria-label="Delete ' + M.esc(p.name) + '">Delete</button>' +
        '</div></td></tr>';
    }).join('');

    const hasRows = visible.length > 0;
    tableWrap.hidden = !hasRows;
    emptyState.hidden = hasRows;
    if (!hasRows) {
      emptyState.innerHTML = products.length === 0
        ? '<h3>No products yet</h3><p>Add your first product to start selling.</p><a class="btn btn--primary" href="add-product.html">+ Add Product</a>'
        : '<h3>No matching products</h3><p>Try a different search or clear the filters.</p>';
    }
    count.textContent = 'Showing ' + visible.length + ' of ' + products.length + ' products';
  }

  rows.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const product = products.find(function (p) { return p.id === id; });

    if (btn.dataset.action === 'edit') {
      SellerUI.toast('Edit is a placeholder for now (' + product.name + ').');
    } else if (confirm('Delete "' + product.name + '"? (demo only — nothing is saved)')) {
      products = products.filter(function (p) { return p.id !== id; });
      render();
      SellerUI.toast('"' + product.name + '" removed from this demo view.');
    }
  });

  [searchInput, categorySelect, statusSelect].forEach(function (el) {
    el.addEventListener('input', render);
  });

  render();
})();
