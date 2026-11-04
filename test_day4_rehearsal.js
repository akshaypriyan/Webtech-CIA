/**
 * ==============================================================================
 * Day 4 Presentation Rehearsal Verification Suite (Person 4 & Team)
 * ==============================================================================
 * Validates the complete 7-step end-to-end presentation flow specified in
 * references/Marketplace_4-Day_Team_Workflow.pdf:
 *
 * 1. Super Admin creates an Admin account.
 * 2. A new Seller registers; the Admin approves them.
 * 3. The Seller adds a product.
 * 4. A Customer finds the product, adds it to the cart and places an order.
 * 5. The Seller sees the order and marks it Shipped.
 * 6. The Customer checks the order and sees the Shipped status.
 * 7. Super Admin opens the system logs and finds the activity from steps 1-6.
 * ==============================================================================
 */

const http = require('http');
const app = require('./server');
const { pool } = require('./config/db');

let server;
const PORT = process.env.TEST_PORT || 3006;

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
            data = raw ? JSON.parse(raw) : null;
          } catch (e) {
            data = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runRehearsalSuite() {
  console.log('\n======================================================');
  console.log('🎭 STARTING DAY 4 PRESENTATION REHEARSAL VERIFICATION');
  console.log('======================================================\n');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  console.log(`Test server running on port ${PORT}\n`);

  const runId = Date.now();

  try {
    // 0. Verify Seed Accounts
    console.log('0. Verifying Seed Demo Accounts (Password: Test@1234)...');
    const demoAccounts = [
      { role: 'Super Admin', email: 'superadmin@market.com' },
      { role: 'Admin', email: 'admin@market.com' },
      { role: 'Seller', email: 'seller@market.com' },
      { role: 'Customer', email: 'customer@market.com' }
    ];

    const tokens = {};
    for (const acc of demoAccounts) {
      const loginRes = await request('POST', '/api/auth/login', {
        email: acc.email,
        password: 'Test@1234'
      });
      assert(loginRes.status === 200, `Seed account ${acc.email} logged in successfully`);
      assert(loginRes.body.data.user.role === acc.role, `Account role matches ${acc.role}`);
      tokens[acc.role] = loginRes.body.data.token;
      console.log(`   ✅ ${acc.role.padEnd(12)} (${acc.email}) authenticated`);
    }

    // STEP 1: Super Admin creates an Admin account
    console.log('\nStep 1: Super Admin creates an Admin account...');
    const newAdminEmail = `demo_admin_${runId}@market.com`;
    const createAdminRes = await request(
      'POST',
      '/api/superadmin/admins',
      {
        name: 'Rehearsal Demo Admin',
        email: newAdminEmail,
        password: 'Test@1234',
        mobile: '9811122233',
        permissions: ['MANAGE_CUSTOMERS', 'MANAGE_SELLERS', 'MANAGE_PRODUCTS', 'VIEW_ANALYTICS']
      },
      tokens['Super Admin']
    );
    assert(createAdminRes.status === 201, `Super Admin created admin account (Got ${createAdminRes.status})`);
    const createdAdminId = createAdminRes.body.data.user_id;
    console.log(`   ✅ Admin created with ID #${createdAdminId} and assigned permissions`);

    // Verify newly created admin can log in
    const newAdminLogin = await request('POST', '/api/auth/login', {
      email: newAdminEmail,
      password: 'Test@1234'
    });
    assert(newAdminLogin.status === 200, 'Newly created Admin can authenticate');
    const newAdminToken = newAdminLogin.body.data.token;
    console.log('   ✅ Newly created Admin successfully logged in');

    // STEP 2: A new Seller registers; the Admin approves them
    console.log('\nStep 2: A new Seller registers; Admin approves them...');
    const newSellerEmail = `demo_seller_${runId}@market.com`;
    const sellerRegRes = await request('POST', '/api/auth/register', {
      name: 'Apex Future Electronics',
      email: newSellerEmail,
      password: 'Test@1234',
      mobile: '9822233344',
      role: 'Seller'
    });
    assert(sellerRegRes.status === 201, 'New seller registered successfully');
    assert(sellerRegRes.body.data.status === 'Pending', 'New seller status is Pending');
    const newSellerId = sellerRegRes.body.data.user_id;
    console.log(`   ✅ Seller registered (ID #${newSellerId}) in Pending state`);

    // Approve seller using the newly created admin account
    const approveSellerRes = await request(
      'PUT',
      `/api/admin/sellers/${newSellerId}/status`,
      { status: 'Active' },
      newAdminToken
    );
    assert(approveSellerRes.status === 200, 'Admin approved pending seller');
    assert(approveSellerRes.body.data.status === 'Active', 'Seller status updated to Active');
    console.log(`   ✅ Admin approved seller #${newSellerId} -> Active`);

    // STEP 3: The Seller adds a product
    console.log('\nStep 3: The Seller adds a product...');
    const newSellerLogin = await request('POST', '/api/auth/login', {
      email: newSellerEmail,
      password: 'Test@1234'
    });
    assert(newSellerLogin.status === 200, 'Approved seller logged in');
    const newSellerToken = newSellerLogin.body.data.token;

    const addProductRes = await request(
      'POST',
      '/api/seller/products',
      {
        product_name: `Ultra Smart Band Pro ${runId}`,
        category_id: 1, // Electronics
        price: '89.99',
        stock_quantity: 40,
        description: 'Next-generation fitness wearable with continuous health telemetry.'
      },
      newSellerToken
    );
    assert(addProductRes.status === 201, `Seller added product (Got ${addProductRes.status})`);
    const newProductId = addProductRes.body.data.product_id;
    console.log(`   ✅ Product listed: "${addProductRes.body.data.product_name}" (ID #${newProductId})`);

    // STEP 4: Customer finds product, adds to cart, and places an order
    console.log('\nStep 4: Customer finds product, adds to cart and places an order...');
    const findProductRes = await request('GET', `/api/products/${newProductId}`);
    assert(findProductRes.status === 200, 'Customer browsed public product');
    assert(findProductRes.body.data.product.product_id === newProductId, 'Product details verified');

    // Add to cart
    const addToCartRes = await request(
      'POST',
      '/api/cart',
      {
        product_id: newProductId,
        quantity: 2
      },
      tokens['Customer']
    );
    assert(addToCartRes.status === 200 || addToCartRes.status === 201, 'Customer added product to cart');
    console.log('   ✅ 2 units added to customer cart');

    // Checkout / Place order
    const checkoutRes = await request(
      'POST',
      '/api/orders',
      {
        shipping_address: '42 Demo Boulevard, Presentation Suite 4B, Bengaluru 560001'
      },
      tokens['Customer']
    );
    assert(checkoutRes.status === 201, `Customer placed order (Got ${checkoutRes.status})`);
    const orderData = checkoutRes.body.data;
    const orderId = orderData.order_id;
    console.log(`   ✅ Order placed successfully: ID #${orderId} (Total: $${orderData.total_amount})`);

    // STEP 5: The Seller sees the order and marks it Shipped
    console.log('\nStep 5: The Seller sees the order and marks it Shipped...');
    const sellerOrdersRes = await request('GET', '/api/seller/orders', null, newSellerToken);
    assert(sellerOrdersRes.status === 200, 'Seller retrieved incoming orders');
    const sellerOrderItems = sellerOrdersRes.body.data;
    const targetItem = sellerOrderItems.find((item) => item.product_id === newProductId);
    assert(targetItem !== undefined, 'Seller finds the customer order item in incoming orders');
    assert(targetItem.item_status === 'Processing', 'Initial item status is Processing');
    console.log(`   ✅ Seller identified order item #${targetItem.order_item_id} (Status: Processing)`);

    // Seller updates status from Processing to Shipped
    const shipRes = await request(
      'PATCH',
      `/api/seller/orders/${targetItem.order_item_id}/status`,
      { status: 'Shipped' },
      newSellerToken
    );
    assert(shipRes.status === 200, `Seller updated order item to Shipped (Got ${shipRes.status})`);
    assert(shipRes.body.data.item_status === 'Shipped', 'Item status is confirmed as Shipped');
    console.log(`   ✅ Order item #${targetItem.order_item_id} marked as Shipped`);

    // STEP 6: Customer checks the order and sees the Shipped status
    console.log('\nStep 6: Customer checks the order and sees Shipped status...');
    const customerOrderRes = await request('GET', `/api/orders/${orderId}`, null, tokens['Customer']);
    assert(customerOrderRes.status === 200, 'Customer retrieved order invoice');
    const orderedItems = customerOrderRes.body.data.items;
    const verifiedItem = orderedItems.find((i) => i.product_id === newProductId);
    assert(verifiedItem !== undefined, 'Customer finds product in order items');
    assert(verifiedItem.item_status === 'Shipped', `Customer sees item status as Shipped (Got ${verifiedItem.item_status})`);
    console.log(`   ✅ Customer verified item #${verifiedItem.order_item_id} status is "Shipped"`);

    // STEP 7: Super Admin opens system logs and finds the activity from steps 1-6
    console.log('\nStep 7: Super Admin opens system logs and verifies activity trail from steps 1-6...');
    const logsRes = await request('GET', '/api/superadmin/logs?limit=50', null, tokens['Super Admin']);
    assert(logsRes.status === 200, 'Super Admin fetched system audit logs');
    const logs = logsRes.body.data.logs || logsRes.body.data;
    assert(Array.isArray(logs) && logs.length > 0, 'Audit trail contains logged actions');

    // Verify key action logs from steps 1-6
    const hasAdminCreate = logs.some((l) => l.action === 'ADMIN_CREATE');
    const hasSellerApprove = logs.some((l) => l.action === 'SELLER_APPROVE' || l.action === 'SELLER_STATUS_UPDATE');
    const hasOrderPlaced = logs.some((l) => l.action === 'ORDER_PLACED');
    const hasOrderShipped = logs.some((l) => l.action === 'ORDER_ITEM_STATUS');

    assert(hasAdminCreate, 'Audit trail recorded ADMIN_CREATE (Step 1)');
    console.log('   ✅ Verified audit log: ADMIN_CREATE');
    assert(hasSellerApprove, 'Audit trail recorded SELLER_APPROVE (Step 2)');
    console.log('   ✅ Verified audit log: SELLER_APPROVE');
    assert(hasOrderPlaced, 'Audit trail recorded ORDER_PLACED (Step 4)');
    console.log('   ✅ Verified audit log: ORDER_PLACED');
    assert(hasOrderShipped, 'Audit trail recorded ORDER_ITEM_STATUS (Step 5)');
    console.log('   ✅ Verified audit log: ORDER_ITEM_STATUS');

    console.log('\n======================================================');
    console.log('🎉 ALL 7 PRESENTATION STEPS REHEARSED AND VERIFIED!');
    console.log('======================================================\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  }
}

runRehearsalSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Rehearsal suite failed:', err);
    process.exit(1);
  });
