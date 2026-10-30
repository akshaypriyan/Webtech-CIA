/* seller-layout.js — shared shell for the Seller Portal pages (P3).
 * Renders the sidebar into <aside id="seller-sidebar"> so the nav lives in one place,
 * marks the current page, wires the mobile menu toggle, and exposes SellerUI.toast().
 * Intentionally separate from P1's navbar.js; swap in P1's navbar later if the team prefers.
 */
(function () {
  const LINKS = [
    { href: 'seller-dashboard.html', label: 'Dashboard' },
    { href: 'seller-products.html',  label: 'My Products' },
    { href: 'add-product.html',      label: 'Add Product' },
    { href: 'seller-orders.html',    label: 'Orders' },
    { href: 'seller-reports.html',   label: 'Reports' }
  ];

  function renderSidebar() {
    const aside = document.getElementById('seller-sidebar');
    if (!aside) return;
    const current = location.pathname.split('/').pop() || 'seller-dashboard.html';

    const items = LINKS.map(function (l) {
      const active = l.href === current ? ' aria-current="page"' : '';
      return '<li><a class="sidebar__link" href="' + l.href + '"' + active + '>' + l.label + '</a></li>';
    }).join('');

    aside.innerHTML =
      '<div class="sidebar__brand">Marketplace</div>' +
      '<div class="sidebar__sub">Seller Portal</div>' +
      '<ul class="sidebar__nav">' + items + '</ul>' +
      '<p class="sidebar__foot">Day 1 preview &middot; mock data only</p>';

    const toggle = document.getElementById('menu-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        const open = aside.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
  }

  function toast(message) {
    let region = document.querySelector('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    region.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  window.SellerUI = { toast: toast };
  document.addEventListener('DOMContentLoaded', renderSidebar);
})();
