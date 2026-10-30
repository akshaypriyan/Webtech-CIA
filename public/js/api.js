/**
 * ==============================================================================
 * Online Marketplace - Central Client-Side API Helper & Session Management
 * ==============================================================================
 * Shared across all frontend pages (Customer, Seller, Admin, Super Admin).
 * Teammates: Import this script on every page via:
 *   <script src="js/api.js"></script>
 */

const API_BASE_URL = '/api';

/**
 * Retrieve the current JWT authentication token
 * @returns {string|null}
 */
function getToken() {
  return localStorage.getItem('token');
}

/**
 * Retrieve the current logged-in user object
 * @returns {object|null}
 */
function getUser() {
  try {
    const rawUser = localStorage.getItem('user');
    return rawUser ? JSON.parse(rawUser) : null;
  } catch (e) {
    console.error('Failed to parse user session:', e);
    return null;
  }
}

/**
 * Persist authentication session to LocalStorage
 * @param {string} token - JWT token string
 * @param {object} user - Sanitized user object { user_id, name, email, mobile, role, status }
 */
function saveSession(token, user) {
  if (token) localStorage.setItem('token', token);
  if (user) localStorage.setItem('user', JSON.stringify(user));
}

/**
 * Clear session and log out
 * @param {boolean} [redirect=true] - Whether to immediately navigate to login.html
 */
function logout(redirect = true) {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (redirect) {
    window.location.href = 'login.html';
  }
}

/**
 * Authenticated API Fetch Wrapper
 * Automatically attaches Bearer token, parses uniform JSON responses,
 * handles 401 session expirations, and throws clean errors on failure.
 *
 * @param {string} endpoint - API path (e.g. '/auth/login', '/products', or '/api/cart')
 * @param {object} [options={}] - Fetch options
 * @param {string} [options.method='GET'] - HTTP Method
 * @param {any} [options.body] - Request body object or FormData
 * @param {object} [options.headers={}] - Custom headers
 * @param {boolean} [options.auth=true] - Whether to include Bearer JWT header
 * @returns {Promise<any>} Resolves with the response payload ({ success: true, message, data })
 */
async function apiFetch(endpoint, options = {}) {
  const {
    method = 'GET',
    body = null,
    headers = {},
    auth = true
  } = options;

  // Format full URL
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = cleanPath.startsWith('/api') ? cleanPath : `${API_BASE_URL}${cleanPath}`;

  // Configure default headers
  const fetchHeaders = { ...headers };
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  if (!isFormData && body && !fetchHeaders['Content-Type']) {
    fetchHeaders['Content-Type'] = 'application/json';
  }

  // Attach JWT Bearer Token if required
  if (auth) {
    const token = getToken();
    if (token) {
      fetchHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  const fetchOptions = {
    method,
    headers: fetchHeaders
  };

  if (body) {
    fetchOptions.body = isFormData ? body : JSON.stringify(body);
  }

  try {
    const response = await fetch(url, fetchOptions);

    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { success: response.ok, message: text };
    }

    // Handle 401 Unauthorized globally
    if (response.status === 401) {
      logout(false);
      const currentPath = window.location.pathname;
      if (!currentPath.includes('login.html') && !currentPath.includes('register.html')) {
        showToast('Your session has expired. Please log in again.', 'error');
        setTimeout(() => {
          window.location.href = `login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
        }, 1200);
      }
      const authErr = new Error(data.message || 'Unauthorized session');
      authErr.status = 401;
      authErr.data = data;
      throw authErr;
    }

    // Reject on server error status or explicit success: false flag
    if (!response.ok || data.success === false) {
      const errorMessage = data.message || (data.errors ? JSON.stringify(data.errors) : `HTTP Error ${response.status}`);
      const error = new Error(errorMessage);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
}

/**
 * Route Guard Helper: Restrict page access based on user role
 * Call this at the top of restricted pages (e.g., cart.html, seller-dashboard.html, admin-dashboard.html).
 *
 * @param {...string} allowedRoles - Permitted roles (e.g., 'Customer', 'Seller', 'Admin', 'Super Admin')
 * @returns {object|null} Current user object if authorized, otherwise redirects
 */
function requireRole(...allowedRoles) {
  const user = getUser();
  const token = getToken();

  // If not logged in, redirect to login page
  if (!token || !user) {
    const currentPath = window.location.pathname;
    window.location.href = `login.html?redirect=${encodeURIComponent(currentPath)}`;
    return null;
  }

  // If specific roles required and user's role is not authorized
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    showToast(`Access denied. Your role (${user.role}) is not authorized for this page.`, 'error');
    
    // Redirect to the appropriate home dashboard for their role
    setTimeout(() => {
      switch (user.role) {
        case 'Seller':
          window.location.href = 'seller-dashboard.html';
          break;
        case 'Admin':
          window.location.href = 'admin-dashboard.html';
          break;
        case 'Super Admin':
          window.location.href = 'superadmin-dashboard.html';
          break;
        case 'Customer':
        default:
          window.location.href = 'products.html';
          break;
      }
    }, 1500);

    return null;
  }

  return user;
}

/**
 * Global Toast Notification Helper
 * Displays smooth, accessible notification popups in the top-right corner.
 *
 * @param {string} message - Message to display
 * @param {'success'|'error'|'warning'|'info'} [type='info'] - Notification style
 * @param {number} [duration=3500] - Time in milliseconds before auto-dismiss
 */
function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  toast.innerHTML = `
    <span style="font-weight: bold; font-size: 1.1rem;">${iconMap[type] || 'ℹ'}</span>
    <span style="flex: 1;">${message}</span>
    <button style="background: none; border: none; color: inherit; cursor: pointer; opacity: 0.7;" aria-label="Close">&times;</button>
  `;

  const closeBtn = toast.querySelector('button');
  const dismiss = () => {
    toast.classList.add('is-hiding');
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 250);
  };

  closeBtn.addEventListener('click', dismiss);
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}
