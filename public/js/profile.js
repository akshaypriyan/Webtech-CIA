/**
 * ==============================================================================
 * Online Marketplace — Client-Side Profile & Address Management
 * ==============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // Page guard: must be authenticated
  const currentUser = typeof requireRole === 'function' ? requireRole() : null;
  if (!currentUser) return;

  // Initialize Password Show/Hide Toggles
  setupPasswordToggles();

  // Initialize Page Modules
  loadUserProfile();
  setupProfileForm();
  setupPasswordForm();

  // If user is a Customer, initialize Address Management
  if (currentUser.role === 'Customer') {
    const addrSec = document.getElementById('addresses-section');
    if (addrSec) addrSec.style.display = 'block';
    loadAddresses();
    setupAddressCRUD();
  }
});

let localUser = null;
let savedAddresses = [];

/**
 * Setup Show/Hide Password buttons
 */
function setupPasswordToggles() {
  document.querySelectorAll('.toggle-password-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    });
  });
}

/**
 * Load User Profile from GET /api/profile
 */
async function loadUserProfile() {
  try {
    const res = await apiFetch('/profile');
    localUser = res.data.user;

    // Populate read-only fields
    const emailEl = document.getElementById('profile-email');
    const roleEl = document.getElementById('profile-role');
    const nameEl = document.getElementById('profile-name');
    const mobileEl = document.getElementById('profile-mobile');
    const statusTextEl = document.getElementById('user-status-text');
    const roleBadgeContainer = document.getElementById('role-badge-container');

    if (emailEl) emailEl.value = localUser.email || '';
    if (roleEl) roleEl.value = localUser.role || '';
    if (nameEl) nameEl.value = localUser.name || '';
    if (mobileEl) mobileEl.value = localUser.mobile || '';
    if (statusTextEl) statusTextEl.textContent = `Status: ${localUser.status || 'Active'}`;

    if (roleBadgeContainer) {
      const roleColor = {
        'Customer': 'background:#eef2ff; color:#4338ca;',
        'Seller': 'background:#e0f2fe; color:#0369a1;',
        'Admin': 'background:#fef3c7; color:#b45309;',
        'Super Admin': 'background:#fce7f3; color:#be185d;'
      }[localUser.role] || '';

      roleBadgeContainer.innerHTML = `
        <span class="user-role-pill" style="${roleColor} font-size: 0.9rem; padding: 4px 12px;">
          ${escapeHtml(localUser.role)}
        </span>
      `;
    }
  } catch (err) {
    console.error('Failed to load profile:', err);
    showToast(err.message || 'Error loading profile data', 'error');
  }
}

/**
 * Setup Personal Details Form (PUT /api/profile)
 */
function setupProfileForm() {
  const form = document.getElementById('profile-details-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const nameInput = document.getElementById('profile-name');
    const mobileInput = document.getElementById('profile-mobile');
    const saveBtn = document.getElementById('save-profile-btn');

    const name = nameInput.value.trim();
    const mobile = mobileInput.value.trim();

    let hasError = false;

    if (!name || name.length < 2 || name.length > 60) {
      setError('profile-name-error', 'Full name must be between 2 and 60 characters.');
      hasError = true;
    }

    if (!/^\d{10}$/.test(mobile)) {
      setError('profile-mobile-error', 'Mobile number must be exactly 10 digits.');
      hasError = true;
    }

    if (hasError) return;

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const res = await apiFetch('/profile', {
        method: 'PUT',
        body: { name, mobile }
      });

      // Update cached session
      const cached = getUser();
      if (cached) {
        cached.name = res.data.user.name;
        cached.mobile = res.data.user.mobile;
        saveSession(getToken(), cached);
      }

      showToast('Profile updated successfully!', 'success');
      saveBtn.textContent = 'Save Changes';
    } catch (err) {
      console.error('Profile update failed:', err);
      showToast(err.message || 'Failed to update profile.', 'error');
      saveBtn.textContent = 'Save Changes';
    } finally {
      saveBtn.disabled = false;
    }
  });
}

/**
 * Setup Password Form (PUT /api/profile/password)
 */
function setupPasswordForm() {
  const form = document.getElementById('profile-password-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const currInput = document.getElementById('current-password');
    const newInput = document.getElementById('new-password');
    const confInput = document.getElementById('confirm-password');
    const btn = document.getElementById('change-password-btn');

    const currentPassword = currInput.value;
    const newPassword = newInput.value;
    const confirmPassword = confInput.value;

    let hasError = false;

    if (!currentPassword) {
      setError('current-password-error', 'Please enter your current password.');
      hasError = true;
    }

    if (!newPassword || newPassword.length < 8) {
      setError('new-password-error', 'New password must be at least 8 characters long.');
      hasError = true;
    }

    if (newPassword !== confirmPassword) {
      setError('confirm-password-error', 'Passwords do not match.');
      hasError = true;
    }

    if (currentPassword && newPassword && currentPassword === newPassword) {
      setError('new-password-error', 'New password must be different from your current password.');
      hasError = true;
    }

    if (hasError) return;

    btn.disabled = true;
    btn.textContent = 'Updating Password...';

    try {
      await apiFetch('/profile/password', {
        method: 'PUT',
        body: { currentPassword, newPassword }
      });

      showToast('Password changed successfully!', 'success');
      form.reset();
    } catch (err) {
      console.error('Password change failed:', err);
      setError('current-password-error', err.message || 'Failed to update password.');
      showToast(err.message || 'Failed to update password.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  });
}

/**
 * Load Customer Addresses from GET /api/profile/addresses
 */
async function loadAddresses() {
  const container = document.getElementById('addresses-list-container');
  const toggleBtn = document.getElementById('toggle-add-address-btn');
  if (!container) return;

  try {
    const res = await apiFetch('/profile/addresses');
    savedAddresses = res.data || [];

    // Check 5 address limit
    if (toggleBtn) {
      if (savedAddresses.length >= 5) {
        toggleBtn.disabled = true;
        toggleBtn.textContent = 'Limit Reached (Max 5)';
        toggleBtn.title = 'Maximum of 5 shipping addresses allowed.';
      } else {
        toggleBtn.disabled = false;
        toggleBtn.textContent = '+ Add New Address';
        toggleBtn.title = '';
      }
    }

    if (savedAddresses.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box text-center py-6 border rounded" style="background: var(--neutral-50);">
          <div style="font-size: 2.2rem; margin-bottom: var(--space-2);">📍</div>
          <h4 class="mb-1">No Saved Addresses</h4>
          <p class="text-muted" style="margin-bottom: var(--space-3); font-size: 0.9rem;">
            You have not added any shipping addresses yet. Add one for smooth checkouts.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="addresses-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--space-4);">
        ${savedAddresses.map((addr) => `
          <div class="address-card p-4 border rounded ${addr.is_default ? 'border-primary' : ''}" 
               style="background: var(--bg-surface); position: relative; display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div class="flex items-center justify-between mb-2">
                <strong style="color: var(--neutral-900);">Address #${addr.address_id}</strong>
                ${addr.is_default ? '<span class="badge badge-success">Default</span>' : ''}
              </div>
              <p style="margin: 0 0 6px 0; font-size: 0.92rem; line-height: 1.4;">
                ${escapeHtml(addr.address_line)}
              </p>
              <p class="text-muted" style="margin: 0; font-size: 0.85rem;">
                ${escapeHtml(addr.city)}, ${escapeHtml(addr.state)} &bull; ${escapeHtml(addr.pincode)}
              </p>
            </div>

            <div class="mt-4 pt-3 border-top flex items-center justify-between gap-2 flex-wrap" style="border-color: var(--border-subtle);">
              ${!addr.is_default ? `
                <button type="button" class="btn btn-sm btn-outline" onclick="setDefaultAddress(${addr.address_id})">
                  Set Default
                </button>
              ` : '<span></span>'}
              <div class="flex gap-2">
                <button type="button" class="btn btn-sm btn-secondary" onclick="openEditAddress(${addr.address_id})">
                  Edit
                </button>
                <button type="button" class="btn btn-sm btn-outline text-danger" onclick="deleteAddressItem(${addr.address_id})">
                  Delete
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    console.error('Failed to load addresses:', err);
    container.innerHTML = `
      <div class="alert alert-danger" style="font-size: 0.88rem;">
        Failed to load addresses: ${escapeHtml(err.message || 'Server error')}
      </div>
    `;
  }
}

/**
 * Setup Address CRUD Handlers
 */
function setupAddressCRUD() {
  const toggleBtn = document.getElementById('toggle-add-address-btn');
  const formContainer = document.getElementById('address-form-container');
  const form = document.getElementById('address-crud-form');
  const cancelBtn = document.getElementById('cancel-address-btn');

  if (toggleBtn && formContainer) {
    toggleBtn.addEventListener('click', () => {
      resetAddressForm();
      formContainer.style.display = formContainer.style.display === 'none' ? 'block' : 'none';
      if (formContainer.style.display === 'block') {
        document.getElementById('addr-line').focus();
      }
    });
  }

  if (cancelBtn && formContainer) {
    cancelBtn.addEventListener('click', () => {
      formContainer.style.display = 'none';
      resetAddressForm();
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();

      const editId = document.getElementById('edit-address-id').value;
      const line = document.getElementById('addr-line').value.trim();
      const city = document.getElementById('addr-city').value.trim();
      const state = document.getElementById('addr-state').value.trim();
      const pincode = document.getElementById('addr-pincode').value.trim();
      const submitBtn = document.getElementById('save-address-btn');

      let hasError = false;

      if (!line) {
        setError('addr-line-error', 'Street address is required.');
        hasError = true;
      }
      if (!city) {
        setError('addr-city-error', 'City is required.');
        hasError = true;
      }
      if (!state) {
        setError('addr-state-error', 'State is required.');
        hasError = true;
      }
      if (!/^\d{6}$/.test(pincode)) {
        setError('addr-pincode-error', 'PIN code must be exactly 6 digits.');
        hasError = true;
      }

      if (hasError) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        if (editId) {
          // PUT update
          await apiFetch(`/profile/addresses/${editId}`, {
            method: 'PUT',
            body: { address_line: line, city, state, pincode }
          });
          showToast('Address updated successfully!', 'success');
        } else {
          // POST create
          await apiFetch('/profile/addresses', {
            method: 'POST',
            body: { address_line: line, city, state, pincode }
          });
          showToast('New address saved successfully!', 'success');
        }

        formContainer.style.display = 'none';
        resetAddressForm();
        await loadAddresses();
      } catch (err) {
        console.error('Failed to save address:', err);
        showToast(err.message || 'Failed to save address.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Address';
      }
    });
  }
}

function resetAddressForm() {
  document.getElementById('edit-address-id').value = '';
  document.getElementById('address-form-title').textContent = 'Add Shipping Address';
  document.getElementById('addr-line').value = '';
  document.getElementById('addr-city').value = '';
  document.getElementById('addr-state').value = '';
  document.getElementById('addr-pincode').value = '';
  clearErrors();
}

// Global window functions for inline onclick bindings
window.openEditAddress = function(id) {
  const addr = savedAddresses.find((a) => a.address_id === id);
  if (!addr) return;

  const formContainer = document.getElementById('address-form-container');
  formContainer.style.display = 'block';

  document.getElementById('edit-address-id').value = addr.address_id;
  document.getElementById('address-form-title').textContent = `Edit Address #${addr.address_id}`;
  document.getElementById('addr-line').value = addr.address_line;
  document.getElementById('addr-city').value = addr.city;
  document.getElementById('addr-state').value = addr.state;
  document.getElementById('addr-pincode').value = addr.pincode;

  clearErrors();
  document.getElementById('addr-line').focus();
};

window.setDefaultAddress = async function(id) {
  try {
    await apiFetch(`/profile/addresses/${id}/default`, { method: 'PATCH' });
    showToast('Default address updated!', 'success');
    await loadAddresses();
  } catch (err) {
    console.error('Failed to set default address:', err);
    showToast(err.message || 'Failed to update default address.', 'error');
  }
};

window.deleteAddressItem = async function(id) {
  if (!confirm('Are you sure you want to delete this address?')) return;

  try {
    await apiFetch(`/profile/addresses/${id}`, { method: 'DELETE' });
    showToast('Address deleted successfully.', 'info');
    await loadAddresses();
  } catch (err) {
    console.error('Failed to delete address:', err);
    showToast(err.message || 'Failed to delete address.', 'error');
  }
};

// Error display helpers
function setError(elementId, msg) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = msg;
    el.classList.add('is-visible');
  }
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach((el) => {
    el.textContent = '';
    el.classList.remove('is-visible');
  });
}
