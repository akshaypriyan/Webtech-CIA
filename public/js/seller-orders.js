/* seller-orders.js — the seller's order items from /api/seller/orders, with search, status filter and Mark as Shipped. */
(function () {
  if (!requireRole('Seller')) return;

  const BADGES = {
    'Pending': 'badge--pending', 'Processing': 'badge--processing', 'Shipped': 'badge--shipped',
    'Delivered': 'badge--delivered', 'Cancelled': 'badge--cancelled'
  };

  const rows = document.getElementById('order-rows');
  const tableWrap = document.getElementById('table-wrap');
  const emptyState = document.getElementById('empty-state');
  const count = document.getElementById('result-count');
  const searchInput = document.getElementById('search');
  const statusSelect = document.getElementById('filter-status');

  let orders = [];
  let totalCount = 0;
  let searchTimer = null;
  let requestSeq = 0;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatDate(value) {
    const d = new Date(value);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function hasFilters() {
    return Boolean(searchInput.value.trim() || statusSelect.value);
  }

  function rowFor(o) {
    const tr = document.createElement('tr');
    tr.dataset.id = o.order_item_id;

    tr.appendChild(el('td', '', 'ORD-' + o.order_id));
    tr.appendChild(el('td', '', o.product_name));
    tr.appendChild(el('td', 'num', String(o.quantity)));
    tr.appendChild(el('td', '', formatDate(o.order_date)));

    const customer = el('td', '', o.customer_name);
    customer.appendChild(el('span', 'sub', o.customer_email));
    tr.appendChild(customer);

    const statusCell = el('td');
    statusCell.appendChild(el('span', 'badge ' + (BADGES[o.item_status] || 'badge--unknown'), o.item_status));
    tr.appendChild(statusCell);

    const actionCell = el('td');
    if (o.allowed_transitions.indexOf('Shipped') !== -1) {
      const b = el('button', 'btn btn--primary btn--sm', 'Mark as Shipped');
      b.type = 'button';
      b.dataset.action = 'ship';
      b.setAttribute('aria-label', 'Mark ' + o.product_name + ' in order ORD-' + o.order_id + ' as shipped');
      actionCell.appendChild(b);
    } else {
      actionCell.appendChild(el('span', 'sub', '—'));
    }
    tr.appendChild(actionCell);
    return tr;
  }

  function showMessage(title, text, isError) {
    tableWrap.hidden = true;
    emptyState.hidden = false;
    emptyState.className = 'empty' + (isError ? ' empty--error' : '');
    emptyState.textContent = '';
    emptyState.appendChild(el('h3', '', title));
    emptyState.appendChild(el('p', '', text));
    if (isError) {
      const retry = el('button', 'btn btn--secondary', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', loadOrders);
      emptyState.appendChild(retry);
    }
  }

  function render() {
    rows.textContent = '';
    if (orders.length === 0) {
      if (hasFilters()) showMessage('No matching orders', 'Try a different search or status filter.', false);
      else showMessage('No orders yet', 'Orders containing your products will appear here.', false);
    } else {
      orders.forEach(function (o) { rows.appendChild(rowFor(o)); });
      tableWrap.hidden = false;
      emptyState.hidden = true;
    }
    count.textContent = 'Showing ' + orders.length + (hasFilters() ? '' : ' of ' + totalCount) + ' orders';
  }

  async function loadOrders() {
    const seq = ++requestSeq;
    const params = new URLSearchParams();
    if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
    if (statusSelect.value) params.set('status', statusSelect.value);

    showMessage('Loading orders…', 'Please wait.', false);
    count.textContent = '';
    try {
      const res = await apiFetch('/seller/orders' + (params.toString() ? '?' + params.toString() : ''));
      if (seq !== requestSeq) return;
      orders = res.data || [];
      if (!hasFilters()) totalCount = orders.length;
      render();
    } catch (err) {
      if (seq !== requestSeq || err.status === 401) return;
      orders = [];
      showMessage('Could not load orders', err.message || 'Something went wrong.', true);
    }
  }

  rows.addEventListener('click', async function (e) {
    const btn = e.target.closest('button[data-action="ship"]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const order = orders.find(function (o) { return o.order_item_id === id; });
    if (!order) return;
    if (!confirm('Mark "' + order.product_name + '" (ORD-' + order.order_id + ') as shipped?')) return;

    btn.disabled = true;
    btn.textContent = 'Updating…';
    try {
      await apiFetch('/seller/orders/' + id + '/status', { method: 'PATCH', body: { status: 'Shipped' } });
      SellerUI.toast('ORD-' + order.order_id + ' marked as Shipped.');
    } catch (err) {
      if (err.status !== 401) SellerUI.toast(err.message || 'Could not update the order.');
    }
    // Reload either way so the table reflects the real current status (e.g. after a 409).
    await loadOrders();
  });

  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadOrders, 300);
  });
  statusSelect.addEventListener('change', loadOrders);

  loadOrders();
})();
