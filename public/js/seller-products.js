/* seller-products.js — product table backed by /api/seller/products (search, filters, edit, delete). */
(function () {
  if (!requireRole('Seller')) return;

  const LOW_STOCK_CLASSES = { 'In Stock': 'badge--in-stock', 'Low Stock': 'badge--low-stock', 'Out of Stock': 'badge--out-of-stock' };

  const rows = document.getElementById('product-rows');
  const tableWrap = document.getElementById('table-wrap');
  const emptyState = document.getElementById('empty-state');
  const count = document.getElementById('result-count');
  const searchInput = document.getElementById('search');
  const categorySelect = document.getElementById('filter-category');
  const stockSelect = document.getElementById('filter-stock');
  const statusSelect = document.getElementById('filter-status');

  let products = [];
  let totalCount = 0;
  let searchTimer = null;
  let requestSeq = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function money(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function badge(label, className) {
    return el('span', 'badge ' + (className || 'badge--unknown'), label);
  }

  function isSafeImage(src) {
    return typeof src === 'string' && (src.indexOf('/uploads/') === 0 || /^https?:\/\//i.test(src));
  }

  function thumb(p) {
    if (isSafeImage(p.image)) {
      const img = el('img', 'thumb');
      img.src = p.image;
      img.alt = '';
      img.loading = 'lazy';
      img.addEventListener('error', function () { img.replaceWith(initialsThumb(p)); });
      return img;
    }
    return initialsThumb(p);
  }

  function initialsThumb(p) {
    const initials = p.product_name.split(' ').filter(Boolean).map(function (w) { return w[0]; }).join('').slice(0, 2);
    const span = el('span', 'thumb', initials);
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function actionButton(label, action, cls, ariaLabel) {
    const b = el('button', 'btn ' + cls + ' btn--sm', label);
    b.type = 'button';
    b.dataset.action = action;
    b.setAttribute('aria-label', ariaLabel);
    return b;
  }

  function rowFor(p) {
    const tr = document.createElement('tr');
    tr.dataset.id = p.product_id;

    const nameCell = el('td');
    const wrap = el('span', 'product-cell');
    wrap.appendChild(thumb(p));
    const nameWrap = el('span');
    nameWrap.appendChild(el('span', '', p.product_name));
    if (p.status === 'Inactive') {
      nameWrap.appendChild(document.createTextNode(' '));
      nameWrap.appendChild(badge('Inactive', 'badge--cancelled'));
    }
    wrap.appendChild(nameWrap);
    nameCell.appendChild(wrap);
    tr.appendChild(nameCell);

    tr.appendChild(el('td', '', p.category_name));
    tr.appendChild(el('td', 'num', money(p.price)));
    tr.appendChild(el('td', 'num', String(p.stock_quantity)));

    const stockCell = el('td');
    stockCell.appendChild(badge(p.stock_status, LOW_STOCK_CLASSES[p.stock_status]));
    tr.appendChild(stockCell);

    const actionsCell = el('td');
    const actions = el('div', 'actions');
    actions.appendChild(actionButton('Edit', 'edit', 'btn--secondary', 'Edit ' + p.product_name));
    actions.appendChild(actionButton('Delete', 'delete', 'btn--danger', 'Delete ' + p.product_name));
    actionsCell.appendChild(actions);
    tr.appendChild(actionsCell);
    return tr;
  }

  function hasFilters() {
    return Boolean(searchInput.value.trim() || categorySelect.value || stockSelect.value || statusSelect.value);
  }

  function showMessage(title, text, withAddLink, isError) {
    tableWrap.hidden = true;
    emptyState.hidden = false;
    emptyState.className = 'empty' + (isError ? ' empty--error' : '');
    emptyState.textContent = '';
    emptyState.appendChild(el('h3', '', title));
    emptyState.appendChild(el('p', '', text));
    if (withAddLink) {
      const a = el('a', 'btn btn--primary', '+ Add Product');
      a.href = 'add-product.html';
      emptyState.appendChild(a);
    }
    if (isError) {
      const retry = el('button', 'btn btn--secondary', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', loadProducts);
      emptyState.appendChild(retry);
    }
  }

  function render() {
    rows.textContent = '';
    if (products.length === 0) {
      if (hasFilters()) showMessage('No matching products', 'Try a different search or clear the filters.', false, false);
      else showMessage('No products yet', 'Add your first product to start selling.', true, false);
    } else {
      products.forEach(function (p) { rows.appendChild(rowFor(p)); });
      tableWrap.hidden = false;
      emptyState.hidden = true;
    }
    count.textContent = 'Showing ' + products.length + (hasFilters() ? '' : ' of ' + totalCount) + ' products';
  }

  async function loadProducts() {
    const seq = ++requestSeq;
    const params = new URLSearchParams();
    if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
    if (categorySelect.value) params.set('category_id', categorySelect.value);
    if (stockSelect.value) params.set('stock', stockSelect.value);
    if (statusSelect.value) params.set('status', statusSelect.value);

    showMessage('Loading products…', 'Please wait.', false, false);
    count.textContent = '';
    try {
      const res = await apiFetch('/seller/products' + (params.toString() ? '?' + params.toString() : ''));
      if (seq !== requestSeq) return; // a newer request superseded this one
      products = res.data || [];
      if (!hasFilters()) totalCount = products.length;
      render();
    } catch (err) {
      if (seq !== requestSeq || err.status === 401) return;
      products = [];
      showMessage('Could not load products', err.message || 'Something went wrong.', false, true);
    }
  }

  async function loadCategories() {
    try {
      const res = await apiFetch('/categories?status=Active', { auth: false });
      (res.data || []).forEach(function (c) {
        if (c.status && c.status !== 'Active') return;
        const opt = el('option', '', c.category_name);
        opt.value = c.category_id;
        categorySelect.appendChild(opt);
      });
    } catch (err) {
      SellerUI.toast('Could not load categories for the filter.');
    }
  }

  rows.addEventListener('click', async function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const product = products.find(function (p) { return p.product_id === id; });
    if (!product) return;

    if (btn.dataset.action === 'edit') {
      window.location.href = 'add-product.html?id=' + encodeURIComponent(id);
      return;
    }

    if (!confirm('Delete "' + product.product_name + '"?\n\nProducts with order history are deactivated instead of deleted.')) return;
    btn.disabled = true;
    try {
      const res = await apiFetch('/seller/products/' + id, { method: 'DELETE' });
      const deactivated = res.data && res.data.action === 'deactivated';
      SellerUI.toast(deactivated
        ? '"' + product.product_name + '" has order history and was deactivated.'
        : '"' + product.product_name + '" was deleted.');
      await loadProducts();
    } catch (err) {
      btn.disabled = false;
      if (err.status !== 401) SellerUI.toast(err.message || 'Could not delete the product.');
    }
  });

  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadProducts, 300);
  });
  [categorySelect, stockSelect, statusSelect].forEach(function (s) { s.addEventListener('change', loadProducts); });

  loadCategories();
  loadProducts();
})();
