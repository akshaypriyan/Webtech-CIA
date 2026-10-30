/**
 * ==============================================================================
 * Online Marketplace - Client-Side Authentication Logic
 * ==============================================================================
 * Controls registration, login, form validation, and role-based redirects.
 */

document.addEventListener('DOMContentLoaded', () => {
  // If already logged in, redirect user away from login/register
  const currentUser = typeof getUser === 'function' ? getUser() : null;
  const currentToken = typeof getToken === 'function' ? getToken() : null;
  const isAuthPage = window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html');

  if (currentUser && currentToken && isAuthPage) {
    redirectByRole(currentUser.role);
    return;
  }

  // Initialize Password Visibility Toggles
  setupPasswordToggles();

  // Initialize Login Page
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    setupLoginForm(loginForm);
  }

  // Initialize Register Page
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    setupRegisterForm(registerForm);
  }
});

/**
 * Redirect user to the corresponding dashboard based on their role
 * @param {string} role - 'Customer', 'Seller', 'Admin', or 'Super Admin'
 * @param {string} [customRedirect] - Optional custom redirect URL from query param
 */
function redirectByRole(role, customRedirect = null) {
  if (customRedirect && !customRedirect.includes('login.html') && !customRedirect.includes('register.html')) {
    window.location.href = customRedirect;
    return;
  }

  switch (role) {
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
}

/**
 * Setup Show/Hide Password buttons
 */
function setupPasswordToggles() {
  const toggleButtons = document.querySelectorAll('.toggle-password-btn');
  toggleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;

      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
        btn.setAttribute('aria-label', 'Hide password');
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
        btn.setAttribute('aria-label', 'Show password');
      }
    });
  });
}

/**
 * Setup Login Form Handler
 */
function setupLoginForm(form) {
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const submitBtn = document.getElementById('login-submit-btn');
  const alertContainer = document.getElementById('auth-alert');

  // Check URL query parameters (e.g. registered message)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('registered') === 'true') {
    showAlert(alertContainer, 'Registration successful! You can now log in with your credentials.', 'success');
  }
  const prefillEmail = urlParams.get('email');
  if (prefillEmail && emailInput) {
    emailInput.value = prefillEmail;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertContainer);

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // Client-side Validation
    if (!email) {
      showAlert(alertContainer, 'Please enter your email address.', 'danger');
      emailInput.focus();
      return;
    }

    if (!isValidEmail(email)) {
      showAlert(alertContainer, 'Please enter a valid email address.', 'danger');
      emailInput.focus();
      return;
    }

    if (!password) {
      showAlert(alertContainer, 'Please enter your password.', 'danger');
      passwordInput.focus();
      return;
    }

    // Indicate loading state
    setButtonLoading(submitBtn, true, 'Signing In...');

    try {
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false
      });

      const { token, user } = response.data;
      saveSession(token, user);

      showAlert(alertContainer, 'Login successful! Redirecting...', 'success');
      showToast(`Welcome back, ${user.name}!`, 'success');

      // Check for redirect param
      const redirectTarget = urlParams.get('redirect');

      setTimeout(() => {
        redirectByRole(user.role, redirectTarget);
      }, 1000);
    } catch (err) {
      setButtonLoading(submitBtn, false, 'Sign In');
      const errorMsg = err.message || 'Login failed. Please verify your credentials.';
      showAlert(alertContainer, errorMsg, 'danger');
      showToast(errorMsg, 'error');
    }
  });
}

/**
 * Setup Register Form Handler
 */
function setupRegisterForm(form) {
  const nameInput = document.getElementById('reg-name');
  const emailInput = document.getElementById('reg-email');
  const mobileInput = document.getElementById('reg-mobile');
  const passwordInput = document.getElementById('reg-password');
  const confirmPasswordInput = document.getElementById('reg-confirm-password');
  const submitBtn = document.getElementById('reg-submit-btn');
  const alertContainer = document.getElementById('auth-alert');

  // Setup Role Radio Cards
  const roleCards = document.querySelectorAll('.role-card-option');
  roleCards.forEach((card) => {
    card.addEventListener('click', () => {
      roleCards.forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertContainer);
    clearFieldErrors();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const mobile = mobileInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const selectedRoleInput = document.querySelector('input[name="role"]:checked');
    const role = selectedRoleInput ? selectedRoleInput.value : 'Customer';

    // Comprehensive client-side validation
    let hasError = false;

    if (!name || name.length < 2) {
      setFieldError('reg-name-error', 'Full name is required (minimum 2 characters).');
      hasError = true;
    }

    if (!isValidEmail(email)) {
      setFieldError('reg-email-error', 'Please provide a valid email address.');
      hasError = true;
    }

    if (!/^[0-9]{10}$/.test(mobile)) {
      setFieldError('reg-mobile-error', 'Please enter a valid 10-digit mobile number.');
      hasError = true;
    }

    if (!password || password.length < 8) {
      setFieldError('reg-password-error', 'Password must be at least 8 characters long.');
      hasError = true;
    }

    if (password !== confirmPassword) {
      setFieldError('reg-confirm-error', 'Passwords do not match.');
      hasError = true;
    }

    if (hasError) {
      showAlert(alertContainer, 'Please correct the highlighted errors below.', 'danger');
      return;
    }

    // Set loading state
    setButtonLoading(submitBtn, true, 'Creating Account...');

    try {
      const response = await apiFetch('/auth/register', {
        method: 'POST',
        body: { name, email, password, mobile, role },
        auth: false
      });

      const { data, message } = response;

      if (role === 'Seller') {
        showAlert(
          alertContainer,
          '✓ Registration submitted! Your seller account is pending admin approval. You will be able to log in once reviewed.',
          'info'
        );
        showToast('Seller application submitted for review.', 'info', 5000);
        form.reset();
        setButtonLoading(submitBtn, false, 'Register Account');
      } else {
        showAlert(alertContainer, '✓ Account registered successfully! Redirecting to login...', 'success');
        showToast('Account created successfully!', 'success');
        setTimeout(() => {
          window.location.href = `login.html?registered=true&email=${encodeURIComponent(email)}`;
        }, 1500);
      }
    } catch (err) {
      setButtonLoading(submitBtn, false, 'Register Account');
      const errorMsg = err.message || 'Registration failed. Please try again.';
      showAlert(alertContainer, errorMsg, 'danger');
      showToast(errorMsg, 'error');
    }
  });
}

// Helpers
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showAlert(container, message, type = 'info') {
  if (!container) return;
  container.className = `alert alert-${type}`;
  container.textContent = message;
  container.style.display = 'block';
}

function clearAlert(container) {
  if (!container) return;
  container.style.display = 'none';
  container.textContent = '';
  container.className = 'alert';
}

function setFieldError(elementId, errorText) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = errorText;
    el.classList.add('is-visible');
  }
}

function clearFieldErrors() {
  document.querySelectorAll('.form-error').forEach((el) => {
    el.textContent = '';
    el.classList.remove('is-visible');
  });
}

function setButtonLoading(button, isLoading, text) {
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = text;
  if (isLoading) {
    button.classList.add('loading');
  } else {
    button.classList.remove('loading');
  }
}
