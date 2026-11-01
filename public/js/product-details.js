/**
 * ==============================================================================
 * product-details.js — Reviews & Product Rating Interaction Module
 * ==============================================================================
 * Handles:
 *   1. Loading and rendering review summary (average, count, distribution bars)
 *   2. Loading and paginating product reviews
 *   3. Checking customer eligibility via GET /api/reviews/can-review/:productId
 *   4. Rendering interactive star input (1-5 stars) with keyboard accessibility
 *   5. Submitting new review (POST /api/reviews)
 *   6. Editing existing review (PUT /api/reviews/:id)
 *   7. Deleting review (DELETE /api/reviews/:id)
 *   8. Updating header rating & review counts dynamically without full page reload
 * ==============================================================================
 */

let currentReviewProductId = null;
let currentReviewPage = 1;
const REVIEW_PAGE_LIMIT = 5;
let currentSelectedRating = 5;
let activeEditingReviewId = null;

/**
 * Initialize Reviews on Product Details Page
 * @param {number} productId 
 */
async function initReviews(productId) {
  currentReviewProductId = productId;
  currentReviewPage = 1;
  activeEditingReviewId = null;

  await Promise.all([
    loadReviewSummary(),
    loadReviews(1),
    loadReviewFormState()
  ]);
}

/**
 * Load & Render Rating Summary & Distribution
 */
async function loadReviewSummary() {
  const summaryContainer = document.getElementById('rating-summary-container');
  if (!summaryContainer || !currentReviewProductId) return;

  try {
    const res = await apiFetch(`/reviews/product/${currentReviewProductId}?page=1&limit=1`, { auth: false });
    const { summary } = res.data;

    const avg = parseFloat(summary.average_rating) || 0;
    const total = summary.review_count || 0;
    const dist = summary.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    // Update product header rating display as well
    const headerRatingEl = document.getElementById('detail-rating');
    if (headerRatingEl) {
      const reviewTxt = total > 0 ? `${total} review${total !== 1 ? 's' : ''}` : 'No reviews yet';
      headerRatingEl.innerHTML = `${renderStars(avg)}<span class="review-count" style="margin-left:0.5rem;">${reviewTxt}</span>`;
    }

    if (total === 0) {
      summaryContainer.innerHTML = `
        <div class="card p-6 text-center border rounded mb-6" style="background: var(--neutral-50);">
          <div style="font-size: 2.2rem; margin-bottom: var(--space-2);">⭐</div>
          <h3 class="mb-1">No Reviews Yet</h3>
          <p class="text-muted" style="margin: 0; font-size: 0.95rem;">
            Be the first customer to purchase and share your feedback on this product!
          </p>
        </div>
      `;
      return;
    }

    summaryContainer.innerHTML = `
      <div class="rating-summary-card p-6 border rounded mb-6" style="background: var(--bg-surface);">
        <div class="grid grid-cols-2 gap-6 items-center">
          
          <!-- Left: Big Average & Stars -->
          <div class="text-center" style="border-right: 1px solid var(--border-subtle); padding-right: var(--space-4);">
            <div class="big-rating-number" style="font-size: 3.5rem; font-weight: 800; line-height: 1; color: var(--neutral-900); margin-bottom: var(--space-2);">
              ${avg.toFixed(1)}
            </div>
            <div class="mb-2" style="font-size: 1.3rem;">
              ${renderStars(avg)}
            </div>
            <p class="text-muted" style="margin: 0; font-size: 0.9rem;">
              Based on ${total} verified review${total !== 1 ? 's' : ''}
            </p>
          </div>

          <!-- Right: 5-Row Distribution Bars -->
          <div class="rating-distribution-stack">
            ${[5, 4, 3, 2, 1].map((star) => {
              const count = dist[star] || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return `
                <div class="distribution-row flex items-center gap-3 mb-2" style="font-size: 0.88rem;">
                  <span style="width: 32px; font-weight: 600; color: var(--neutral-700);">${star} ★</span>
                  <div class="dist-bar-track flex-1" style="height: 10px; background: var(--neutral-200); border-radius: var(--radius-full); overflow: hidden;">
                    <div class="dist-bar-fill" style="width: ${pct}%; height: 100%; background: #f59e0b; border-radius: var(--radius-full); transition: width 0.3s ease;"></div>
                  </div>
                  <span class="text-muted" style="width: 45px; text-align: right; font-size: 0.82rem;">${count}</span>
                </div>
              `;
            }).join('')}
          </div>

        </div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load review summary:', err);
  }
}

/**
 * Load Reviews with Pagination
 * @param {number} page 
 */
async function loadReviews(page = 1) {
  const listContainer = document.getElementById('reviews-list-container');
  const paginationContainer = document.getElementById('reviews-pagination-container');
  if (!listContainer || !currentReviewProductId) return;

  currentReviewPage = page;

  try {
    const res = await apiFetch(`/reviews/product/${currentReviewProductId}?page=${page}&limit=${REVIEW_PAGE_LIMIT}`, { auth: false });
    const { reviews, pagination } = res.data;

    if (reviews.length === 0) {
      listContainer.innerHTML = '';
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    listContainer.innerHTML = `
      <div class="reviews-stack flex flex-col gap-4">
        ${reviews.map((r) => `
          <div class="review-item-card p-4 border rounded" style="background: var(--bg-surface);">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span style="font-weight: 700; color: var(--neutral-900); font-size: 0.95rem;">
                  ${escapeHtml(r.reviewer_name)}
                </span>
                <span class="badge badge-success" style="font-size: 0.72rem; padding: 2px 6px;">Verified Buyer</span>
              </div>
              <span class="text-muted" style="font-size: 0.82rem;">
                ${new Date(r.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            </div>
            
            <div class="mb-2" style="font-size: 1rem;">
              ${renderStars(r.rating)}
            </div>

            <p style="margin: 0; font-size: 0.92rem; color: var(--neutral-800); line-height: 1.5; white-space: pre-line;">
              ${escapeHtml(r.comment || 'No written comment provided.')}
            </p>
          </div>
        `).join('')}
      </div>
    `;

    // Render Pagination / Load More Controls
    if (paginationContainer) {
      if (pagination.totalPages > 1) {
        paginationContainer.innerHTML = `
          <div class="flex items-center justify-between mt-4 pt-4 border-top">
            <button class="btn btn-sm btn-outline" ${page <= 1 ? 'disabled' : ''} onclick="loadReviews(${page - 1})">
              &larr; Previous
            </button>
            <span class="text-muted" style="font-size: 0.88rem;">
              Page ${pagination.page} of ${pagination.totalPages}
            </span>
            <button class="btn btn-sm btn-outline" ${page >= pagination.totalPages ? 'disabled' : ''} onclick="loadReviews(${page + 1})">
              Next &rarr;
            </button>
          </div>
        `;
      } else {
        paginationContainer.innerHTML = '';
      }
    }
  } catch (err) {
    console.error('Failed to load reviews list:', err);
    listContainer.innerHTML = `
      <div class="alert alert-danger" style="font-size: 0.88rem;">
        Failed to load reviews: ${escapeHtml(err.message || 'Server error')}
      </div>
    `;
  }
}

/**
 * Check User Review Eligibility & Render Form or Notice
 */
async function loadReviewFormState() {
  const container = document.getElementById('review-form-state-container');
  if (!container || !currentReviewProductId) return;

  const user = typeof getUser === 'function' ? getUser() : null;

  // Case 1: Guest (Not logged in)
  if (!user) {
    const returnUrl = encodeURIComponent(`product-details.html?id=${currentReviewProductId}`);
    container.innerHTML = `
      <div class="p-4 border rounded mb-6 text-center" style="background: var(--neutral-50);">
        <p style="margin: 0; font-size: 0.92rem;">
          Have you purchased this product? 
          <a href="login.html?redirect=${returnUrl}" class="font-semibold" style="color: var(--primary);">Sign in to write a customer review</a>.
        </p>
      </div>
    `;
    return;
  }

  // Case 2: Logged-in non-Customer (Seller, Admin, Super Admin)
  if (user.role !== 'Customer') {
    container.innerHTML = `
      <div class="p-3 border rounded mb-6 text-center text-muted" style="background: var(--neutral-50); font-size: 0.85rem;">
        <span>ℹ️ You are signed in as a ${escapeHtml(user.role)}. Customer reviews can only be submitted by verified customer accounts.</span>
      </div>
    `;
    return;
  }

  // Case 3: Customer role -> query GET /api/reviews/can-review/:productId
  try {
    const res = await apiFetch(`/reviews/can-review/${currentReviewProductId}`);
    const { canReview, hasReviewed, review, reason } = res.data;

    // Subcase 3a: User already reviewed -> Show their review with Edit & Delete actions
    if (hasReviewed && review) {
      container.innerHTML = `
        <div class="card p-5 border-primary rounded mb-6" style="background: var(--primary-light);">
          <div class="flex items-center justify-between mb-2">
            <div>
              <span class="badge badge-primary">Your Review</span>
              <strong style="margin-left: 8px; color: var(--neutral-900);">You reviewed this product</strong>
            </div>
            <div class="flex gap-2">
              <button type="button" class="btn btn-sm btn-secondary" onclick="openEditReview(${review.review_id}, ${review.rating}, ${escapeHtml(JSON.stringify(review.comment || ''))})">
                Edit Review
              </button>
              <button type="button" class="btn btn-sm btn-outline text-danger" onclick="deleteMyReview(${review.review_id})">
                Delete
              </button>
            </div>
          </div>
          <div class="mb-2" style="font-size: 1.1rem;">
            ${renderStars(review.rating)}
          </div>
          <p style="margin: 0; font-size: 0.95rem; color: var(--neutral-800); white-space: pre-line;">
            ${escapeHtml(review.comment || 'No comment text provided.')}
          </p>
        </div>

        <div id="inline-review-form-wrap" style="display: none;"></div>
      `;
      return;
    }

    // Subcase 3b: Eligible to review -> Show review submission form
    if (canReview) {
      renderReviewFormUI(container, null);
      return;
    }

    // Subcase 3c: Not eligible (Has not purchased)
    container.innerHTML = `
      <div class="p-4 border rounded mb-6" style="background: var(--neutral-50);">
        <div class="flex items-center gap-3">
          <span style="font-size: 1.5rem;">🛍️</span>
          <div>
            <strong style="color: var(--neutral-900);">Verified Customer Reviews</strong>
            <p class="text-muted" style="margin: 0; font-size: 0.88rem;">
              Only customers who have purchased this product can leave a review. Complete an order to share your experience!
            </p>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to verify review eligibility:', err);
    container.innerHTML = `
      <div class="alert alert-danger" style="font-size: 0.85rem;">
        Error checking review status: ${escapeHtml(err.message || 'Server error')}
      </div>
    `;
  }
}

/**
 * Render the Review Form (For Add or Edit)
 * @param {HTMLElement} mountTarget 
 * @param {object|null} existingData 
 */
function renderReviewFormUI(mountTarget, existingData = null) {
  const isEditing = Boolean(existingData && existingData.review_id);
  activeEditingReviewId = isEditing ? existingData.review_id : null;
  currentSelectedRating = isEditing ? existingData.rating : 5;

  const html = `
    <div class="card p-6 border rounded mb-6" style="background: var(--bg-surface);">
      <h3 class="mb-2">${isEditing ? '✏️ Edit Your Review' : '✍️ Write a Customer Review'}</h3>
      <p class="text-muted mb-4" style="font-size: 0.88rem;">
        Share your authentic experience with other shoppers.
      </p>

      <form id="product-review-form" novalidate>
        
        <!-- Interactive Star Selector -->
        <div class="form-group mb-4">
          <label class="form-label mb-1">Overall Rating <span class="required">*</span></label>
          <div class="interactive-star-selector flex items-center gap-1" id="star-selector-row" role="radiogroup" aria-label="Rating from 1 to 5 stars">
            ${[1, 2, 3, 4, 5].map((s) => `
              <button 
                type="button" 
                class="star-select-btn ${s <= currentSelectedRating ? 'is-active' : ''}" 
                data-star="${s}"
                aria-label="${s} star${s > 1 ? 's' : ''}"
                style="background: none; border: none; font-size: 2rem; cursor: pointer; color: ${s <= currentSelectedRating ? '#f59e0b' : '#cbd5e1'}; transition: transform 0.15s ease;"
              >★</button>
            `).join('')}
            <span id="selected-rating-label" style="margin-left: 10px; font-weight: 700; color: var(--neutral-800); font-size: 1rem;">
              ${currentSelectedRating} / 5 Stars
            </span>
          </div>
        </div>

        <!-- Comment Textarea with Character Counter -->
        <div class="form-group mb-4">
          <div class="flex items-center justify-between mb-1">
            <label for="review-comment-input" class="form-label" style="margin: 0;">
              Your Review (Optional)
            </label>
            <span id="review-char-count" class="text-muted" style="font-size: 0.78rem;">
              ${(existingData && existingData.comment ? existingData.comment.length : 0)} / 500 characters
            </span>
          </div>
          <textarea 
            id="review-comment-input" 
            class="form-input" 
            rows="4" 
            maxlength="500" 
            placeholder="What did you like or dislike about this product? How was the quality?"
          >${isEditing && existingData.comment ? escapeHtml(existingData.comment) : ''}</textarea>
          <span class="form-error" id="review-comment-error"></span>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-3">
          ${isEditing ? `
            <button type="button" class="btn btn-outline" onclick="cancelEditReview()">
              Cancel
            </button>
          ` : ''}
          <button type="submit" id="submit-review-btn" class="btn btn-primary">
            ${isEditing ? 'Update Review' : 'Submit Review'}
          </button>
        </div>

      </form>
    </div>
  `;

  mountTarget.innerHTML = html;

  // Bind star selector click & hover events
  const starButtons = mountTarget.querySelectorAll('.star-select-btn');
  const label = mountTarget.querySelector('#selected-rating-label');

  starButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentSelectedRating = parseInt(btn.getAttribute('data-star'), 10);
      updateStarDisplay(mountTarget, currentSelectedRating);
    });

    btn.addEventListener('mouseenter', () => {
      const hoverVal = parseInt(btn.getAttribute('data-star'), 10);
      updateStarDisplay(mountTarget, hoverVal);
    });
  });

  const starRow = mountTarget.querySelector('#star-selector-row');
  if (starRow) {
    starRow.addEventListener('mouseleave', () => {
      updateStarDisplay(mountTarget, currentSelectedRating);
    });
  }

  // Bind character counter
  const textarea = mountTarget.querySelector('#review-comment-input');
  const counter = mountTarget.querySelector('#review-char-count');
  if (textarea && counter) {
    textarea.addEventListener('input', () => {
      counter.textContent = `${textarea.value.length} / 500 characters`;
    });
  }

  // Bind form submit
  const form = mountTarget.querySelector('#product-review-form');
  if (form) {
    form.addEventListener('submit', handleReviewFormSubmit);
  }
}

function updateStarDisplay(container, val) {
  const starButtons = container.querySelectorAll('.star-select-btn');
  const label = container.querySelector('#selected-rating-label');
  starButtons.forEach((b) => {
    const starNum = parseInt(b.getAttribute('data-star'), 10);
    b.style.color = starNum <= val ? '#f59e0b' : '#cbd5e1';
  });
  if (label) {
    label.textContent = `${val} / 5 Stars`;
  }
}

/**
 * Handle Review Submission (POST /api/reviews or PUT /api/reviews/:id)
 */
async function handleReviewFormSubmit(e) {
  e.preventDefault();

  const commentInput = document.getElementById('review-comment-input');
  const submitBtn = document.getElementById('submit-review-btn');
  const comment = commentInput ? commentInput.value.trim() : '';

  if (currentSelectedRating < 1 || currentSelectedRating > 5) {
    showToast('Please select a rating between 1 and 5 stars.', 'warning');
    return;
  }

  if (comment.length > 500) {
    showToast('Comment cannot exceed 500 characters.', 'warning');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = activeEditingReviewId ? 'Updating...' : 'Submitting...';

  try {
    if (activeEditingReviewId) {
      // PUT update
      await apiFetch(`/reviews/${activeEditingReviewId}`, {
        method: 'PUT',
        body: { rating: currentSelectedRating, comment }
      });
      showToast('Review updated successfully!', 'success');
    } else {
      // POST new
      await apiFetch('/reviews', {
        method: 'POST',
        body: {
          product_id: currentReviewProductId,
          rating: currentSelectedRating,
          comment
        }
      });
      showToast('Review posted successfully! Thank you for your feedback.', 'success');
    }

    // Refresh review section & summary dynamically without page reload!
    await initReviews(currentReviewProductId);
  } catch (err) {
    console.error('Review submission failed:', err);
    showToast(err.message || 'Failed to submit review.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = activeEditingReviewId ? 'Update Review' : 'Submit Review';
  }
}

// Global window functions for inline actions
window.openEditReview = function(reviewId, rating, commentStr) {
  let comment = '';
  try {
    comment = JSON.parse(commentStr);
  } catch (e) {
    comment = commentStr || '';
  }

  const wrap = document.getElementById('inline-review-form-wrap');
  if (wrap) {
    wrap.style.display = 'block';
    renderReviewFormUI(wrap, { review_id: reviewId, rating, comment });
    wrap.scrollIntoView({ behavior: 'smooth' });
  }
};

window.cancelEditReview = function() {
  const wrap = document.getElementById('inline-review-form-wrap');
  if (wrap) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
  }
  activeEditingReviewId = null;
};

window.deleteMyReview = async function(reviewId) {
  if (!confirm('Are you sure you want to delete your review? This action cannot be undone.')) return;

  try {
    await apiFetch(`/reviews/${reviewId}`, { method: 'DELETE' });
    showToast('Review deleted successfully.', 'info');
    await initReviews(currentReviewProductId);
  } catch (err) {
    console.error('Failed to delete review:', err);
    showToast(err.message || 'Failed to delete review.', 'error');
  }
};
