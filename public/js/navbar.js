/**
 * ==============================================================================
 * Online Marketplace - Dynamic Shared Navbar
 * ==============================================================================
 * Automatically renders a responsive, role-tailored navigation bar into
 * any container with the ID `navbar` (e.g., <div id="navbar"></div>).
 */

(function () {
  function renderNavbar() {
    const navbarContainer = document.getElementById('navbar');
    if (!navbarContainer) return;

    const user = typeof getUser === 'function' ? getUser() : null;
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';

    // Helper for active link class
    const isActive = (href) => (currentPath === href ? 'active' : '');

    let navLinksHtml = '';
    let authSectionHtml = '';

    if (!user) {
      // -------------------------------------------------------------------------
      // GUEST NAVIGATION (Public Visitor)
      // -------------------------------------------------------------------------
      navLinksHtml = `
        <li><a href="index.html" class="nav-link ${isActive('index.html')}">Home</a></li>
        <li><a href="products.html" class="nav-link ${isActive('products.html')}">Products</a></li>
      `;

      authSectionHtml = `
        <div class="nav-auth-group">
          <a href="login.html" class="btn btn-secondary btn-sm">Log In</a>
          <a href="register.html" class="btn btn-primary btn-sm">Register</a>
        </div>
      `;
    } else if (user.role === 'Customer') {
      // -------------------------------------------------------------------------
      // CUSTOMER NAVIGATION
      // -------------------------------------------------------------------------
      navLinksHtml = `
        <li><a href="products.html" class="nav-link ${isActive('products.html')}">Products</a></li>
        <li><a href="cart.html" class="nav-link ${isActive('cart.html')}">Cart</a></li>
        <li><a href="my-orders.html" class="nav-link ${isActive('my-orders.html')}">My Orders</a></li>
        <li><a href="profile.html" class="nav-link ${isActive('profile.html')}">Profile</a></li>
      `;

      authSectionHtml = `
        <div class="nav-auth-group">
          <div class="user-badge">
            <span>${escapeHtml(user.name.split(' ')[0])}</span>
            <span class="user-role-pill">Customer</span>
          </div>
          <button id="nav-logout-btn" class="btn btn-secondary btn-sm">Log Out</button>
        </div>
      `;
    } else if (user.role === 'Seller') {
      // -------------------------------------------------------------------------
      // SELLER NAVIGATION
      // -------------------------------------------------------------------------
      navLinksHtml = `
        <li><a href="seller-dashboard.html" class="nav-link ${isActive('seller-dashboard.html')}">Dashboard</a></li>
        <li><a href="seller-products.html" class="nav-link ${isActive('seller-products.html')}">My Products</a></li>
        <li><a href="seller-orders.html" class="nav-link ${isActive('seller-orders.html')}">Orders</a></li>
        <li><a href="seller-reports.html" class="nav-link ${isActive('seller-reports.html')}">Reports</a></li>
      `;

      authSectionHtml = `
        <div class="nav-auth-group">
          <div class="user-badge">
            <span>${escapeHtml(user.name.split(' ')[0])}</span>
            <span class="user-role-pill" style="background:#e0f2fe; color:#0369a1;">Seller</span>
          </div>
          <button id="nav-logout-btn" class="btn btn-secondary btn-sm">Log Out</button>
        </div>
      `;
    } else if (user.role === 'Admin') {
      // -------------------------------------------------------------------------
      // ADMIN NAVIGATION
      // -------------------------------------------------------------------------
      navLinksHtml = `
        <li><a href="admin-dashboard.html" class="nav-link ${isActive('admin-dashboard.html')}">Admin Dashboard</a></li>
        <li><a href="manage-customers.html" class="nav-link ${isActive('manage-customers.html')}">Customers</a></li>
        <li><a href="manage-sellers.html" class="nav-link ${isActive('manage-sellers.html')}">Sellers</a></li>
        <li><a href="manage-products.html" class="nav-link ${isActive('manage-products.html')}">Products</a></li>
        <li><a href="manage-categories.html" class="nav-link ${isActive('manage-categories.html')}">Categories</a></li>
      `;

      authSectionHtml = `
        <div class="nav-auth-group">
          <div class="user-badge">
            <span>${escapeHtml(user.name.split(' ')[0])}</span>
            <span class="user-role-pill" style="background:#fef3c7; color:#b45309;">Admin</span>
          </div>
          <button id="nav-logout-btn" class="btn btn-secondary btn-sm">Log Out</button>
        </div>
      `;
    } else if (user.role === 'Super Admin') {
      // -------------------------------------------------------------------------
      // SUPER ADMIN NAVIGATION
      // -------------------------------------------------------------------------
      navLinksHtml = `
        <li><a href="superadmin-dashboard.html" class="nav-link ${isActive('superadmin-dashboard.html')}">Super Admin</a></li>
        <li><a href="manage-admins.html" class="nav-link ${isActive('manage-admins.html')}">Manage Admins</a></li>
        <li><a href="system-logs.html" class="nav-link ${isActive('system-logs.html')}">System Logs</a></li>
        <li><a href="system-settings.html" class="nav-link ${isActive('system-settings.html')}">Settings</a></li>
      `;

      authSectionHtml = `
        <div class="nav-auth-group">
          <div class="user-badge">
            <span>${escapeHtml(user.name.split(' ')[0])}</span>
            <span class="user-role-pill" style="background:#fce7f3; color:#be185d;">Super Admin</span>
          </div>
          <button id="nav-logout-btn" class="btn btn-secondary btn-sm">Log Out</button>
        </div>
      `;
    }

    navbarContainer.innerHTML = `
      <header class="site-header">
        <div class="container">
          <nav class="navbar" aria-label="Main Navigation">
            <a href="index.html" class="brand-logo">
              <div class="brand-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
              </div>
              <span>Market<span class="brand-highlight">Hub</span></span>
            </a>

            <button class="nav-toggle-btn" id="nav-toggle" aria-label="Toggle Navigation Menu">
              ☰
            </button>

            <ul class="nav-menu" id="nav-menu">
              ${navLinksHtml}
              ${authSectionHtml}
            </ul>
          </nav>
        </div>
      </header>
    `;

    // Bind logout button click
    const logoutBtn = document.getElementById('nav-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof logout === 'function') {
          showToast('Logging out...', 'info', 1000);
          setTimeout(() => logout(true), 600);
        } else {
          localStorage.clear();
          window.location.href = 'login.html';
        }
      });
    }

    // Bind mobile menu toggle
    const toggleBtn = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    if (toggleBtn && navMenu) {
      toggleBtn.addEventListener('click', () => {
        navMenu.classList.toggle('is-open');
        toggleBtn.textContent = navMenu.classList.contains('is-open') ? '✕' : '☰';
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize navbar on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderNavbar);
  } else {
    renderNavbar();
  }
})();
