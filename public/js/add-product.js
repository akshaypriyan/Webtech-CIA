/* add-product.js — create/edit product form (add-product.html[?id=PRODUCT_ID]).
 * Client-side validation gives quick feedback; the server enforces the same rules.
 * Submits FormData through apiFetch (POST to create, PUT to edit).
 */
(function () {
  if (!requireRole('Seller')) return;

  const editId = (function () {
    const raw = new URLSearchParams(window.location.search).get('id');
    return raw !== null && /^[1-9]\d{0,9}$/.test(raw) ? raw : null;
  })();
  const isEdit = editId !== null;
  let existingImage = null;
  const form = document.getElementById('product-form');
  const preview = document.getElementById('image-preview');
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  let previewUrl = null;

  const categorySelect = document.getElementById('category');
  const submitBtn = document.getElementById('submit-btn');
  const formStatus = document.getElementById('form-status');

  function setFormStatus(message, isError) {
    formStatus.hidden = !message;
    formStatus.textContent = message || '';
    formStatus.classList.toggle('form-status--error', Boolean(isError));
  }

  function addCategoryOption(id, name) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name;
    categorySelect.appendChild(opt);
  }

  async function loadCategories() {
    const res = await apiFetch('/categories?status=Active', { auth: false });
    (res.data || []).forEach(function (c) {
      if (!c.status || c.status === 'Active') addCategoryOption(c.category_id, c.category_name);
    });
  }

  const validators = {
    name: function (v) {
      v = v.trim();
      if (!v) return 'Product name is required.';
      if (v.length < 3) return 'Name must be at least 3 characters.';
      return '';
    },
    description: function (v) {
      v = v.trim();
      if (!v) return 'Description is required.';
      if (v.length < 10) return 'Description must be at least 10 characters.';
      return '';
    },
    category: function (v) { return v ? '' : 'Please choose a category.'; },
    price: function (v) {
      if (v === '') return 'Price is required.';
      if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'Enter a valid price with at most 2 decimals.';
      const n = Number(v);
      if (n <= 0) return 'Price must be greater than 0.';
      if (n > 99999.99) return 'Price cannot exceed 99,999.99.';
      return '';
    },
    stock: function (v) {
      if (v === '') return 'Stock quantity is required.';
      if (!/^\d+$/.test(v)) return 'Stock must be a whole number (0 or more).';
      if (Number(v) > 100000) return 'Stock cannot exceed 100,000.';
      return '';
    },
    image: function () {
      const file = document.getElementById('image').files[0];
      if (!file) return '';
      if (IMAGE_TYPES.indexOf(file.type) === -1) return 'Image must be a PNG, JPG or WebP file.';
      if (file.size > MAX_IMAGE_BYTES) return 'Image must be 2 MB or smaller.';
      return '';
    }
  };

  function validateField(name) {
    const input = form.elements[name];
    const message = validators[name](input.value);
    const field = input.closest('.field');
    field.classList.toggle('invalid', Boolean(message));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    document.getElementById(name + '-error').textContent = message;
    return !message;
  }

  function clearPreview() {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    preview.textContent = 'No image selected';
  }

  function showPreview() {
    clearPreview();
    const file = document.getElementById('image').files[0];
    // Always re-validate so clearing the selection also clears a previous error.
    const valid = validateField('image');
    if (!file || !valid) return;
    previewUrl = URL.createObjectURL(file);
    const img = document.createElement('img');
    img.src = previewUrl;
    img.alt = 'Preview of selected product image';
    preview.textContent = '';
    preview.appendChild(img);
  }

  Object.keys(validators).forEach(function (name) {
    const input = form.elements[name];
    input.addEventListener('blur', function () { validateField(name); });
    input.addEventListener('input', function () {
      if (input.closest('.field').classList.contains('invalid')) validateField(name);
    });
  });
  document.getElementById('image').addEventListener('change', showPreview);

  const description = document.getElementById('description');
  const descCount = document.getElementById('desc-count');
  description.addEventListener('input', function () { descCount.textContent = description.value.length; });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const results = Object.keys(validators).map(validateField);
    if (results.indexOf(false) !== -1) {
      const firstInvalid = form.querySelector('.invalid input, .invalid select, .invalid textarea');
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    const data = new FormData();
    data.append('product_name', form.elements.name.value.trim());
    data.append('description', form.elements.description.value.trim());
    data.append('category_id', form.elements.category.value);
    data.append('price', form.elements.price.value);
    data.append('stock_quantity', form.elements.stock.value);
    if (isEdit) data.append('status', form.elements.status.value);
    const file = document.getElementById('image').files[0];
    if (file) data.append('image', file);

    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Saving…' : 'Creating…';
    setFormStatus('');
    try {
      // No Content-Type header: the browser must add the multipart boundary itself.
      await apiFetch(isEdit ? '/seller/products/' + editId : '/seller/products', {
        method: isEdit ? 'PUT' : 'POST',
        body: data
      });
      SellerUI.toast(isEdit ? 'Product updated.' : 'Product created.');
      if (!isEdit) form.reset();
      setTimeout(function () { window.location.href = 'seller-products.html'; }, 700);
    } catch (err) {
      if (err.status === 401) return;
      const fieldErrors = err.data && err.data.errors;
      const apiToField = { product_name: 'name', category_id: 'category', stock_quantity: 'stock' };
      if (fieldErrors && typeof fieldErrors === 'object') {
        Object.keys(fieldErrors).forEach(function (key) {
          const name = apiToField[key] || key;
          const errEl = document.getElementById(name + '-error');
          const input = form.elements[name];
          if (!errEl || !input) return;
          errEl.textContent = String(fieldErrors[key]);
          input.closest('.field').classList.add('invalid');
          input.setAttribute('aria-invalid', 'true');
        });
      }
      setFormStatus(err.message || 'Could not save the product.', true);
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Save changes' : 'Save product';
    }
  });

  form.addEventListener('reset', function () {
    clearPreview();
    descCount.textContent = '0';
    form.querySelectorAll('.invalid').forEach(function (f) { f.classList.remove('invalid'); });
    form.querySelectorAll('.error').forEach(function (s) { s.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (i) { i.setAttribute('aria-invalid', 'false'); });
    // In edit mode, Reset means "back to the saved values", not blank.
    if (isEdit) setTimeout(function () { loadProductForEdit().catch(function () {}); }, 0);
  });

  async function loadProductForEdit() {
    const res = await apiFetch('/seller/products/' + editId);
    const p = res.data;
    form.elements.name.value = p.product_name;
    form.elements.description.value = p.description || '';
    descCount.textContent = form.elements.description.value.length;
    if (!form.querySelector('#category option[value="' + p.category_id + '"]')) {
      addCategoryOption(p.category_id, p.category_name + ' (inactive)');
    }
    form.elements.category.value = p.category_id;
    form.elements.price.value = Number(p.price).toFixed(2);
    form.elements.stock.value = p.stock_quantity;
    form.elements.status.value = p.status;
    existingImage = p.image;
    if (existingImage && /^(\/uploads\/|https?:\/\/)/i.test(existingImage)) {
      const img = document.createElement('img');
      img.src = existingImage;
      img.alt = 'Current product image';
      preview.textContent = '';
      preview.appendChild(img);
      document.getElementById('image-hint-edit').textContent = '; leave empty to keep the current image';
    }
  }

  async function init() {
    submitBtn.disabled = true;
    setFormStatus('Loading…');
    try {
      await loadCategories();
      if (isEdit) {
        document.title = 'Edit Product | Seller Portal';
        document.getElementById('page-title').textContent = 'Edit Product';
        document.getElementById('page-subtitle').textContent = 'Update your listing, price and stock.';
        document.getElementById('status-field').hidden = false;
        submitBtn.textContent = 'Save changes';
        await loadProductForEdit();
      }
      setFormStatus('');
      submitBtn.disabled = false;
    } catch (err) {
      if (err.status === 401) return;
      setFormStatus(err.status === 404 ? 'Product not found.' : (err.message || 'Could not load the form.'), true);
      if (!isEdit) submitBtn.disabled = false;
    }
  }

  init();
})();
