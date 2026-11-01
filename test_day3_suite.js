/**
 * Automated Verification Suite for Day 3 Profile & Reviews
 */
const http = require('http');
const app = require('./server');
const { pool } = require('./config/db');

let server;
const PORT = 3003;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let data;
          try {
            data = JSON.parse(raw);
          } catch (e) {
            data = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log('--- STARTING DAY 3 COMPREHENSIVE VERIFICATION SUITE ---\n');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Test server running on port ${PORT}\n`);

  try {
    // 1. Get Tokens for Customer & Seller
    console.log('1. Authenticating Customer and Seller...');
    const custLogin = await request('POST', '/api/auth/login', {
      email: 'customer@market.com',
      password: 'Test@1234'
    });
    assert(custLogin.status === 200, 'Customer logged in (200)');
    const customerToken = custLogin.body.data.token;

    const sellerLogin = await request('POST', '/api/auth/login', {
      email: 'seller@market.com',
      password: 'Test@1234'
    });
    assert(sellerLogin.status === 200, 'Seller logged in (200)');
    const sellerToken = sellerLogin.body.data.token;

    // 2. Profile GET
    console.log('\n2. Testing GET /api/profile...');
    const guestProf = await request('GET', '/api/profile');
    assert(guestProf.status === 401, 'Guest /api/profile rejected with 401');

    const custProf = await request('GET', '/api/profile', null, customerToken);
    assert(custProf.status === 200, 'Customer /api/profile returns 200');
    assert(custProf.body.data.user.email === 'customer@market.com', 'Returns customer user profile');
    assert(Array.isArray(custProf.body.data.addresses), 'Returns addresses array for customer');

    const sellerProf = await request('GET', '/api/profile', null, sellerToken);
    assert(sellerProf.status === 200, 'Seller /api/profile returns 200');
    assert(sellerProf.body.data.addresses.length === 0, 'Seller has empty addresses array');

    // 3. Profile PUT (Update name & mobile)
    console.log('\n3. Testing PUT /api/profile...');
    const badMobile = await request('PUT', '/api/profile', { name: 'Alex Updated', mobile: '123' }, customerToken);
    assert(badMobile.status === 400, 'Invalid mobile number rejected with 400');

    const updateProf = await request('PUT', '/api/profile', { name: 'Alex Johnson Updated', mobile: '9876543213' }, customerToken);
    assert(updateProf.status === 200, 'Valid profile update succeeded (200)');
    assert(updateProf.body.data.user.name === 'Alex Johnson Updated', 'Updated name persisted in DB');

    // 4. Profile Password Change
    console.log('\n4. Testing PUT /api/profile/password...');
    const wrongPass = await request('PUT', '/api/profile/password', { currentPassword: 'WrongPassword!', newPassword: 'NewPassword123!' }, customerToken);
    assert(wrongPass.status === 400, 'Wrong current password rejected with 400');

    const shortPass = await request('PUT', '/api/profile/password', { currentPassword: 'Test@1234', newPassword: 'short' }, customerToken);
    assert(shortPass.status === 400, 'Short new password rejected with 400');

    const samePass = await request('PUT', '/api/profile/password', { currentPassword: 'Test@1234', newPassword: 'Test@1234' }, customerToken);
    assert(samePass.status === 400, 'Identical new password rejected with 400');

    const validPass = await request('PUT', '/api/profile/password', { currentPassword: 'Test@1234', newPassword: 'NewPassword@1234' }, customerToken);
    assert(validPass.status === 200, 'Valid password change succeeded (200)');

    // Verify login with new password
    const testNewLogin = await request('POST', '/api/auth/login', { email: 'customer@market.com', password: 'NewPassword@1234' });
    assert(testNewLogin.status === 200, 'Login succeeded with newly changed password (200)');

    // Restore password to Test@1234 for consistency
    await request('PUT', '/api/profile/password', { currentPassword: 'NewPassword@1234', newPassword: 'Test@1234' }, customerToken);
    console.log('   (Password restored to Test@1234)');

    // 5. Addresses API: List, Add, Update, Default, Delete & 5-Limit
    console.log('\n5. Testing Addresses API (/api/profile/addresses)...');
    
    // Seller attempting address route -> 403
    const sellerAddr = await request('GET', '/api/profile/addresses', null, sellerToken);
    assert(sellerAddr.status === 403, 'Seller blocked from Customer-only address route with 403');

    // Customer list addresses
    const listAddr = await request('GET', '/api/profile/addresses', null, customerToken);
    assert(listAddr.status === 200, 'Customer addresses list returns 200');
    assert(listAddr.body.data.length >= 1, 'Customer has at least 1 seeded address');

    // Add address 2
    const addAddr2 = await request('POST', '/api/profile/addresses', {
      address_line: 'Suite 200, Silicon Hub',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001'
    }, customerToken);
    assert(addAddr2.status === 201, 'New address added with 201');
    const addr2Id = addAddr2.body.data.address.address_id;

    // Bad pincode (not 6 digits) -> 400
    const badPincode = await request('POST', '/api/profile/addresses', {
      address_line: 'Invalid Pin St',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '4110'
    }, customerToken);
    assert(badPincode.status === 400, 'Non-6-digit pincode rejected with 400');

    // Update address 2
    const updateAddr2 = await request('PUT', `/api/profile/addresses/${addr2Id}`, {
      address_line: 'Suite 250, Silicon Hub Revised',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411002'
    }, customerToken);
    assert(updateAddr2.status === 200, 'Address updated with 200');
    assert(updateAddr2.body.data.address.address_line === 'Suite 250, Silicon Hub Revised', 'Updated address line saved');

    // Try to update someone else's / non-existent address -> 404
    const notMyAddr = await request('PUT', `/api/profile/addresses/999999`, {
      address_line: 'Fake',
      city: 'City',
      state: 'State',
      pincode: '123456'
    }, customerToken);
    assert(notMyAddr.status === 404, 'Updating unowned or non-existent address returned 404');

    // Set default address
    const setDefault = await request('PATCH', `/api/profile/addresses/${addr2Id}/default`, null, customerToken);
    assert(setDefault.status === 200, 'Set default address succeeded with 200');

    // Add addresses until 5 limit is reached
    console.log('   Testing address limit of 5...');
    const currentAddrs = (await request('GET', '/api/profile/addresses', null, customerToken)).body.data;
    const needed = 5 - currentAddrs.length;
    const createdExtraIds = [];
    for (let i = 0; i < needed; i++) {
      const res = await request('POST', '/api/profile/addresses', {
        address_line: `Extra Address #${i+1}`,
        city: 'City',
        state: 'State',
        pincode: '500001'
      }, customerToken);
      createdExtraIds.push(res.body.data.address.address_id);
    }

    // Try to add 6th address -> 400
    const sixthAddr = await request('POST', '/api/profile/addresses', {
      address_line: 'Sixth Address Should Fail',
      city: 'City',
      state: 'State',
      pincode: '500001'
    }, customerToken);
    assert(sixthAddr.status === 400, '6th address rejected with 400 (5 address limit enforced)');

    // Delete created extra addresses
    for (const id of createdExtraIds) {
      await request('DELETE', `/api/profile/addresses/${id}`, null, customerToken);
    }
    // Delete address 2
    await request('DELETE', `/api/profile/addresses/${addr2Id}`, null, customerToken);
    console.log('   (Temporary test addresses cleaned up)');

    // 6. Reviews API: Public List & Summary
    console.log('\n6. Testing Public Reviews API (/api/reviews/product/:id)...');
    const pubReviews = await request('GET', '/api/reviews/product/1');
    assert(pubReviews.status === 200, 'Public product reviews returned 200');
    assert(pubReviews.body.data.summary.average_rating !== undefined, 'Summary includes average_rating');
    assert(pubReviews.body.data.summary.distribution !== undefined, 'Summary includes rating distribution');
    assert(pubReviews.body.data.reviews.length >= 1, 'Contains seeded review');
    assert(pubReviews.body.data.reviews[0].reviewer_name.includes('.'), 'Reviewer name formatted for privacy (e.g. Alex J.)');

    // 7. Reviews API: canReview check
    console.log('\n7. Testing GET /api/reviews/can-review/:productId...');
    
    // Product 1: Customer already reviewed
    const canRevProd1 = await request('GET', '/api/reviews/can-review/1', null, customerToken);
    assert(canRevProd1.status === 200, 'can-review for Product 1 returned 200');
    assert(canRevProd1.body.data.hasReviewed === true, 'Product 1 hasReviewed is true');
    assert(canRevProd1.body.data.canReview === false, 'Product 1 canReview is false');
    assert(canRevProd1.body.data.review !== null, 'Product 1 returns existing review data');

    // Product 2: Customer purchased in delivered order, but hasn't reviewed yet!
    const canRevProd2 = await request('GET', '/api/reviews/can-review/2', null, customerToken);
    assert(canRevProd2.status === 200, 'can-review for Product 2 returned 200');
    assert(canRevProd2.body.data.hasReviewed === false, 'Product 2 hasReviewed is false');
    assert(canRevProd2.body.data.canReview === true, 'Product 2 canReview is true (Eligible to review!)');

    // Product 3: Customer has NOT purchased
    const canRevProd3 = await request('GET', '/api/reviews/can-review/3', null, customerToken);
    assert(canRevProd3.status === 200, 'can-review for Product 3 returned 200');
    assert(canRevProd3.body.data.canReview === false, 'Product 3 canReview is false (Not purchased)');
    assert(canRevProd3.body.data.reason.includes('purchase'), 'Reason indicates purchase requirement');

    // 8. Reviews API: Submit, Validation, Purchase Gate, Duplicate & Edit/Delete
    console.log('\n8. Testing Reviews Submission & Purchase Gate...');

    // Try to review unpurchased product 3 -> 403
    const unpurchasedRev = await request('POST', '/api/reviews', { product_id: 3, rating: 5, comment: 'Nice jacket' }, customerToken);
    assert(unpurchasedRev.status === 403, 'Reviewing unpurchased product rejected with 403 Forbidden');

    // Try invalid rating (6) -> 400
    const invalidRating = await request('POST', '/api/reviews', { product_id: 2, rating: 6, comment: 'Too high' }, customerToken);
    assert(invalidRating.status === 400, 'Rating = 6 rejected with 400');

    // Submit valid review for purchased product 2 -> 201
    const validRev = await request('POST', '/api/reviews', { product_id: 2, rating: 4, comment: 'Solid mechanical switches and great RGB lighting.' }, customerToken);
    assert(validRev.status === 201, 'Valid review for purchased product submitted with 201');
    const newRevId = validRev.body.data.review.review_id;

    // Try duplicate review on product 2 -> 409
    const dupRev = await request('POST', '/api/reviews', { product_id: 2, rating: 5, comment: 'Duplicate review' }, customerToken);
    assert(dupRev.status === 409, 'Duplicate review rejected with 409 Conflict');

    // Edit own review (PUT /api/reviews/:id)
    const editRev = await request('PUT', `/api/reviews/${newRevId}`, { rating: 5, comment: 'Updated to 5 stars! Even better after custom keycaps.' }, customerToken);
    assert(editRev.status === 200, 'Editing own review returned 200');
    assert(editRev.body.data.review.rating === 5, 'Updated review rating persisted');

    // Try to edit someone else's review with seller account -> 403
    const editOther = await request('PUT', `/api/reviews/${newRevId}`, { rating: 1, comment: 'Hacked' }, sellerToken);
    assert(editOther.status === 403, 'Editing another user review rejected with 403');

    // Delete own review (DELETE /api/reviews/:id)
    const delRev = await request('DELETE', `/api/reviews/${newRevId}`, null, customerToken);
    assert(delRev.status === 200, 'Deleting own review returned 200');

    // Verify product 2 is eligible to review again after deletion
    const canRevAfterDel = await request('GET', '/api/reviews/can-review/2', null, customerToken);
    assert(canRevAfterDel.body.data.canReview === true, 'canReview is true again after review deletion');

    // 9. Products API Top Rated Sort
    console.log('\n9. Testing GET /api/products?sort=rating...');
    const topRated = await request('GET', '/api/products?sort=rating');
    assert(topRated.status === 200, 'GET /api/products?sort=rating returned 200');
    assert(topRated.body.data.products[0].product_id === 1, 'Top rated product (#1 with 5.0 stars) appears first in sort=rating');

    console.log('\n======================================================');
    console.log('🎉 ALL DAY 3 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } finally {
    if (server) server.close();
    await pool.end();
  }
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
