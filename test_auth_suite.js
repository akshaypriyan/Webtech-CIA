/**
 * Automated Verification Suite for Day 1 Auth & Foundation
 */
const http = require('http');
const app = require('./server');
const { pool } = require('./config/db');

let server;
const PORT = 3001; // use separate port for test server if needed, or app

function makeRequest(method, path, body = null, token = null) {
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
  console.log('--- STARTING DAY 1 COMPREHENSIVE VERIFICATION SUITE ---\n');

  // Start an explicit HTTP server on port 3001 using the Express app
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`Test server running on port ${PORT}\n`);

  try {
    const timestamp = Date.now();
    const testCustomerEmail = `testcust_${timestamp}@test.com`;
    const testSellerEmail = `testseller_${timestamp}@test.com`;

    // TEST 1: Register Customer
    console.log('1. Testing Customer Registration...');
    const regCustRes = await makeRequest('POST', '/api/auth/register', {
      name: 'Test Customer',
      email: testCustomerEmail,
      password: 'Password123!',
      mobile: '9123456780',
      role: 'Customer'
    });
    assert(regCustRes.status === 201, `Customer registration status is 201 (Got ${regCustRes.status})`);
    assert(regCustRes.body.success === true, 'Response success is true');
    assert(regCustRes.body.data.role === 'Customer', 'User role is Customer');
    assert(regCustRes.body.data.status === 'Active', 'Customer status is Active');

    // Verify Customer Cart exists in DB
    const custId = regCustRes.body.data.user_id;
    const [cartRows] = await pool.execute('SELECT cart_id FROM cart WHERE customer_id = ?', [custId]);
    assert(cartRows.length === 1, 'Empty cart row automatically created for customer in database');

    // TEST 2: Register Seller (Pending status)
    console.log('\n2. Testing Seller Registration (Pending Status)...');
    const regSellerRes = await makeRequest('POST', '/api/auth/register', {
      name: 'Test Seller Store',
      email: testSellerEmail,
      password: 'Password123!',
      mobile: '9123456781',
      role: 'Seller'
    });
    assert(regSellerRes.status === 201, `Seller registration status is 201 (Got ${regSellerRes.status})`);
    assert(regSellerRes.body.data.role === 'Seller', 'User role is Seller');
    assert(regSellerRes.body.data.status === 'Pending', 'Seller status is Pending');

    // TEST 3: Reject Admin Registration (403)
    console.log('\n3. Testing Admin Role Escalation Rejection...');
    const regAdminRes = await makeRequest('POST', '/api/auth/register', {
      name: 'Hacker Admin',
      email: `hacker_${timestamp}@test.com`,
      password: 'Password123!',
      mobile: '9123456782',
      role: 'Admin'
    });
    assert(regAdminRes.status === 403, `Admin registration rejected with 403 (Got ${regAdminRes.status})`);
    assert(regAdminRes.body.success === false, 'Admin registration success is false');

    // TEST 4: Duplicate Email Rejection (409)
    console.log('\n4. Testing Duplicate Email Conflict (409)...');
    const regDupRes = await makeRequest('POST', '/api/auth/register', {
      name: 'Duplicate Alex',
      email: testCustomerEmail,
      password: 'Password123!',
      mobile: '9123456783',
      role: 'Customer'
    });
    assert(regDupRes.status === 409, `Duplicate email returned 409 Conflict (Got ${regDupRes.status})`);

    // TEST 5: Input Validations (Short password, invalid mobile, bad email)
    console.log('\n5. Testing Input Field Validation...');
    const shortPassRes = await makeRequest('POST', '/api/auth/register', {
      name: 'Short Pass',
      email: `short_${timestamp}@test.com`,
      password: 'short',
      mobile: '9123456784',
      role: 'Customer'
    });
    assert(shortPassRes.status === 400, 'Password < 8 chars rejected with 400');

    const badMobileRes = await makeRequest('POST', '/api/auth/register', {
      name: 'Bad Mobile',
      email: `mobile_${timestamp}@test.com`,
      password: 'Password123!',
      mobile: '123',
      role: 'Customer'
    });
    assert(badMobileRes.status === 400, 'Invalid mobile number rejected with 400');

    // TEST 6: Login Seeded Customer
    console.log('\n6. Testing Login for Seeded Customer...');
    const loginCustRes = await makeRequest('POST', '/api/auth/login', {
      email: 'customer@market.com',
      password: 'Test@1234'
    });
    assert(loginCustRes.status === 200, 'Customer login succeeded with 200');
    assert(loginCustRes.body.data.token != null, 'JWT token returned in login response');
    assert(loginCustRes.body.data.user.role === 'Customer', 'Customer role returned correctly');
    const customerToken = loginCustRes.body.data.token;

    // TEST 7: Login Seeded Seller (Active)
    console.log('\n7. Testing Login for Seeded Seller (Active)...');
    const loginSellerRes = await makeRequest('POST', '/api/auth/login', {
      email: 'seller@market.com',
      password: 'Test@1234'
    });
    assert(loginSellerRes.status === 200, 'Seller login succeeded with 200');
    assert(loginSellerRes.body.data.user.role === 'Seller', 'Seller role returned correctly');

    // TEST 8: Login Seeded Admin & Super Admin
    console.log('\n8. Testing Login for Admin and Super Admin...');
    const loginAdminRes = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@market.com',
      password: 'Test@1234'
    });
    assert(loginAdminRes.status === 200, 'Admin login succeeded with 200');

    const loginSuperAdminRes = await makeRequest('POST', '/api/auth/login', {
      email: 'superadmin@market.com',
      password: 'Test@1234'
    });
    assert(loginSuperAdminRes.status === 200, 'Super Admin login succeeded with 200');

    // TEST 9: Login Attempt by Pending Seller
    console.log('\n9. Testing Login Attempt by Pending Seller...');
    const loginPendingRes = await makeRequest('POST', '/api/auth/login', {
      email: testSellerEmail,
      password: 'Password123!',
      role: 'Seller'
    });
    assert(loginPendingRes.status === 403, `Pending seller blocked with 403 (Got ${loginPendingRes.status})`);
    assert(loginPendingRes.body.message.includes('awaiting admin approval'), 'Pending message returned correctly');

    // TEST 10: Login Attempt by Blocked User
    console.log('\n10. Testing Login Attempt by Blocked User...');
    // Create a blocked user directly for testing
    const blockedEmail = `blocked_${timestamp}@test.com`;
    await pool.execute(
      `INSERT INTO users (name, email, password, mobile, role, status)
       VALUES ('Blocked Test', ?, 'fakehashedpass', '9000000000', 'Customer', 'Blocked')`,
      [blockedEmail]
    );
    const loginBlockedRes = await makeRequest('POST', '/api/auth/login', {
      email: blockedEmail,
      password: 'Test@1234'
    });
    // Regardless of password check or status, blocked user must be rejected with 403 or 401
    // In our code: password checked first; if matched -> 403 'Account blocked'. Let's verify with matching bcrypt pass
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('Test@1234', 10);
    await pool.execute('UPDATE users SET password = ? WHERE email = ?', [hash, blockedEmail]);
    const loginBlockedRes2 = await makeRequest('POST', '/api/auth/login', {
      email: blockedEmail,
      password: 'Test@1234'
    });
    assert(loginBlockedRes2.status === 403, `Blocked user rejected with 403 (Got ${loginBlockedRes2.status})`);
    assert(loginBlockedRes2.body.message.includes('Account blocked'), 'Blocked user error message returned');

    // TEST 11: Wrong Password & Unknown Email (401 Generic)
    console.log('\n11. Testing Invalid Credentials (401 Generic Security Response)...');
    const wrongPassRes = await makeRequest('POST', '/api/auth/login', {
      email: 'customer@market.com',
      password: 'WrongPassword999'
    });
    assert(wrongPassRes.status === 401, 'Wrong password rejected with 401');
    assert(wrongPassRes.body.message === 'Invalid email or password.', 'Generic error message for wrong password');

    const unknownEmailRes = await makeRequest('POST', '/api/auth/login', {
      email: 'nonexistent_user_9999@market.com',
      password: 'Test@1234'
    });
    assert(unknownEmailRes.status === 401, 'Non-existent user rejected with 401');
    assert(unknownEmailRes.body.message === 'Invalid email or password.', 'Generic error message for non-existent user');

    // TEST 12: GET /api/auth/me (Protected Route)
    console.log('\n12. Testing GET /api/auth/me Profile Route...');
    // Without token
    const noTokenRes = await makeRequest('GET', '/api/auth/me');
    assert(noTokenRes.status === 401, 'Unauthorized request without Bearer token rejected with 401');

    // With invalid token
    const badTokenRes = await makeRequest('GET', '/api/auth/me', null, 'malformed.fake.jwt');
    assert(badTokenRes.status === 401, 'Request with invalid token rejected with 401');

    // With valid customer token
    const meRes = await makeRequest('GET', '/api/auth/me', null, customerToken);
    assert(meRes.status === 200, 'Authenticated /me request succeeded with 200');
    assert(meRes.body.data.email === 'customer@market.com', 'Returned profile matches authenticated customer');
    assert(meRes.body.data.password === undefined, 'Password omitted from /me profile');

    // TEST 13: 404 Handler for undefined /api route
    console.log('\n13. Testing Undefined API Route 404...');
    const notFoundRes = await makeRequest('GET', '/api/undefined-endpoint-xyz');
    assert(notFoundRes.status === 404, 'Undefined API route returned 404');
    assert(notFoundRes.body.success === false, '404 returns uniform JSON structure');

    // TEST 14: System Logs Audit Trail Verification
    console.log('\n14. Verifying Audit Logs in system_logs...');
    const [logRows] = await pool.execute(
      `SELECT action, description FROM system_logs ORDER BY log_id DESC LIMIT 5`
    );
    assert(logRows.length > 0, 'Audit entries successfully written to system_logs');
    console.log('Recent audit actions in system_logs:');
    logRows.forEach((r) => console.log(`   - [${r.action}] ${r.description}`));

    console.log('\n======================================================');
    console.log('🎉 ALL 14 DAY 1 VERIFICATION TESTS PASSED SUCCESSFULLY!');
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
