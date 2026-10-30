/* add-product.js — client-side validation and image preview only.
 * Day 1: the form never leaves the browser. Real submit (fetch + Multer upload) is later work.
 * Server-side validation will still be required; these checks are for user feedback only.
 */
(function () {
  const M = window.SellerMock;
  const form = document.getElementById('product-form');
  const preview = document.getElementById('image-preview');
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  let previewUrl = null;

  const categorySelect = document.getElementById('category');
  M.categories.forEach(function (c) {
    const opt = document.createElement('option');
    opt.textContent = c;
    categorySelect.appendChild(opt);
  });

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

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const results = Object.keys(validators).map(validateField);
    if (results.indexOf(false) !== -1) {
      const firstInvalid = form.querySelector('.invalid input, .invalid select, .invalid textarea');
      if (firstInvalid) firstInvalid.focus();
      return;
    }
    SellerUI.toast('Form is valid. Demo only — nothing was saved.');
    form.reset();
    clearPreview();
    descCount.textContent = '0';
  });

  form.addEventListener('reset', function () {
    clearPreview();
    descCount.textContent = '0';
    form.querySelectorAll('.invalid').forEach(function (f) { f.classList.remove('invalid'); });
    form.querySelectorAll('.error').forEach(function (s) { s.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach(function (i) { i.setAttribute('aria-invalid', 'false'); });
  });
})();
