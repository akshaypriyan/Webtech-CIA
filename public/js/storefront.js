/**
 * ==============================================================================
 * storefront.js — Shared Storefront Helpers
 * ==============================================================================
 * Used by: index.html, products.html, product-details.html
 *
 * Provides:
 *   escapeHtml(str)           — prevents XSS when injecting text into innerHTML
 *   formatPrice(price)        — formats as ₹ with Indian number grouping
 *   renderStars(rating)       — renders filled / half / empty star icons
 *   renderProductCard(product) — returns an HTML card string for a product
 * ==============================================================================
 */

/* -----------------------------------------------------------------------
 * escapeHtml
 * Converts dangerous characters to safe HTML entities.
 * ALWAYS use this before inserting any user-supplied string into innerHTML.
 * ----------------------------------------------------------------------- */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/* -----------------------------------------------------------------------
 * formatPrice
 * Formats a numeric price value as Indian Rupee string.
 * Examples:  149.99 → "₹149.99"   |  1299 → "₹1,299.00"
 * ----------------------------------------------------------------------- */
function formatPrice(price) {
  const num = parseFloat(price);
  if (isNaN(num)) return '₹0.00';
  return '₹' + num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/* -----------------------------------------------------------------------
 * renderStars
 * Converts a numeric rating (0–5) into filled/half/empty star icons.
 * Returns an HTML string — safe to set as innerHTML.
 * ----------------------------------------------------------------------- */
function renderStars(rating) {
  const value = parseFloat(rating) || 0; // default to 0 if null / NaN
  let stars = '';

  for (let i = 1; i <= 5; i++) {
    if (value >= i) {
      // Full star
      stars += '<span class="star star-full">★</span>';
    } else if (value >= i - 0.5) {
      // Half star — uses an SVG-based half-star via CSS class
      stars += '<span class="star star-half">★</span>';
    } else {
      // Empty star
      stars += '<span class="star star-empty">☆</span>';
    }
  }

  return `<span class="stars-row" aria-label="Rating: ${value} out of 5">${stars}</span>`;
}

/* -----------------------------------------------------------------------
 * renderProductCard
 * Builds a product card HTML string.
 * All user-supplied fields are escaped to prevent XSS.
 *
 * @param {object} product — product row from /api/products
 * @returns {string} — HTML string for a .product-card element
 * ----------------------------------------------------------------------- */
function renderProductCard(product) {
  const id       = product.product_id;
  const name     = escapeHtml(product.product_name);
  const price    = formatPrice(product.price);
  const seller   = escapeHtml(product.seller_name);
  const category = escapeHtml(product.category_name);
  const stock    = parseInt(product.stock_quantity, 10);
  const rating   = parseFloat(product.avg_rating)   || 0;
  const reviews  = parseInt(product.review_count,10) || 0;

  // Inline SVG placeholder — shown when there's no product image
  // This avoids any external image requests that might fail.
  const svgPlaceholder = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
      <rect width="200" height="200" fill="#f1f5f9"/>
      <rect x="60" y="55" width="80" height="60" rx="6" fill="#cbd5e1"/>
      <circle cx="100" cy="135" r="18" fill="#cbd5e1"/>
      <rect x="80" y="153" width="40" height="12" rx="4" fill="#cbd5e1"/>
    </svg>`;

  // Use the image from DB if it exists; otherwise show SVG placeholder
  const imgContent = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${name}" loading="lazy"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <div class="product-img-placeholder" style="display:none">${svgPlaceholder}</div>`
    : `<div class="product-img-placeholder">${svgPlaceholder}</div>`;

  // Out-of-stock badge
  const stockBadge = stock === 0
    ? `<span class="product-badge badge-out-of-stock">Out of Stock</span>`
    : '';

  // Star rating row with review count
  const starsHtml = renderStars(rating);
  const reviewText = reviews > 0
    ? `${starsHtml}<span class="review-count">(${reviews})</span>`
    : `${starsHtml}<span class="review-count">No reviews yet</span>`;

  // The card links to product-details.html?id=X on click
  return `
    <a href="product-details.html?id=${id}" class="product-card" aria-label="View ${name}">
      <div class="product-card-img">
        ${imgContent}
        ${stockBadge}
      </div>
      <div class="product-card-body">
        <p class="product-card-category">${category}</p>
        <h3 class="product-card-name">${name}</h3>
        <div class="product-card-rating">${reviewText}</div>
        <div class="product-card-footer">
          <span class="product-card-price">${price}</span>
          <span class="product-card-seller">by ${seller}</span>
        </div>
      </div>
    </a>`;
}
