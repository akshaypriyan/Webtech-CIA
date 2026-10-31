require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function seedDatabase() {
  console.log(' Starting Database Seeding Process...');

  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'marketplace_db'
  };

  let connection;

  try {
    connection = await mysql.createConnection(dbConfig);
    console.log(` Connected to MySQL database "${dbConfig.database}"`);

    // 1. Ensure Default Categories Exist
    console.log('\n Verifying Categories...');
    const categories = [
      { name: 'Electronics', desc: 'Smartphones, audio, tech gadgets, laptops and gaming gear.' },
      { name: 'Fashion', desc: 'Men and women apparel, activewear, footwear and luxury accessories.' },
      { name: 'Home & Kitchen', desc: 'Appliances, cookware, interior decor, bedding and smart home gear.' },
      { name: 'Books', desc: 'Tech textbooks, literature, business manuals and self-help bestsellers.' },
      { name: 'Beauty', desc: 'Clean skincare, cosmetics, salon hair care and luxury perfumes.' },
      { name: 'Sports', desc: 'Fitness equipment, athletic wear, camping gear and accessories.' }
    ];

    for (const cat of categories) {
      const [existing] = await connection.execute(
        'SELECT category_id FROM categories WHERE category_name = ?',
        [cat.name]
      );
      if (existing.length === 0) {
        await connection.execute(
          'INSERT INTO categories (category_name, description, status) VALUES (?, ?, ?)',
          [cat.name, cat.desc, 'Active']
        );
        console.log(`   + Created category: "${cat.name}"`);
      } else {
        console.log(`   * Category exists: "${cat.name}"`);
      }
    }

    // 2. Hash Seed Password ("Test@1234")
    const seedPasswordPlain = 'Test@1234';
    const hashedPassword = await bcrypt.hash(seedPasswordPlain, 10);

    // 3. Seed Users
    console.log('\n Verifying Seed Users...');
    const seedUsers = [
      {
        name: 'System Super Admin',
        email: 'superadmin@market.com',
        mobile: '9876543210',
        role: 'Super Admin',
        status: 'Active'
      },
      {
        name: 'Marketplace Operations Admin',
        email: 'admin@market.com',
        mobile: '9876543211',
        role: 'Admin',
        status: 'Active'
      },
      {
        name: 'Apex Retail Store',
        email: 'seller@market.com',
        mobile: '9876543212',
        role: 'Seller',
        status: 'Active'
      },
      {
        name: 'Alex Johnson',
        email: 'customer@market.com',
        mobile: '9876543213',
        role: 'Customer',
        status: 'Active'
      }
    ];

    const userMap = {};

    for (const u of seedUsers) {
      const [existing] = await connection.execute(
        'SELECT user_id, role, status FROM users WHERE email = ?',
        [u.email]
      );

      let userId;
      if (existing.length === 0) {
        const [result] = await connection.execute(
          `INSERT INTO users (name, email, password, mobile, role, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [u.name, u.email, hashedPassword, u.mobile, u.role, u.status]
        );
        userId = result.insertId;
        console.log(`   + Created user: ${u.email} [${u.role}] (ID: ${userId})`);
      } else {
        userId = existing[0].user_id;
        console.log(`   * User exists: ${u.email} [${u.role}] (ID: ${userId})`);
      }
      userMap[u.role] = userId;

      // Ensure Customer has an active Cart
      if (u.role === 'Customer') {
        const [cartRow] = await connection.execute(
          'SELECT cart_id FROM cart WHERE customer_id = ?',
          [userId]
        );
        if (cartRow.length === 0) {
          await connection.execute('INSERT INTO cart (customer_id) VALUES (?)', [userId]);
          console.log(`     + Created shopping cart for customer (User ID: ${userId})`);
        }
      }

      // Ensure Admin has standard permissions
      if (u.role === 'Admin') {
        const adminPermissions = [
          'MANAGE_CUSTOMERS',
          'MANAGE_SELLERS',
          'MANAGE_PRODUCTS',
          'MANAGE_CATEGORIES',
          'VIEW_ANALYTICS'
        ];
        for (const perm of adminPermissions) {
          await connection.execute(
            `INSERT IGNORE INTO admin_permissions (admin_id, permission_name) VALUES (?, ?)`,
            [userId, perm]
          );
        }
      }
    }

    // 4. Seed Sample Products for Seller
    // Idempotent: skip if a product with the same name + seller_id already exists.
    console.log('\n Verifying Sample Products for Seller...');
    const sellerId = userMap['Seller'];

    // Map categories by name → category_id
    const [catRows] = await connection.execute('SELECT category_id, category_name FROM categories');
    const catMap = {};
    catRows.forEach(c => { catMap[c.category_name] = c.category_id; });

    // ----------------------------------------------------------------
    // 12 sample products across all 6 categories (6 original + 6 new)
    // ----------------------------------------------------------------
    const sampleProducts = [
      // ---- Electronics (2) ----
      {
        name: 'Pro Wireless Noise-Cancelling Headphones',
        desc: 'Over-ear bluetooth 5.3 headphones with 40h battery life and active noise suppression.',
        price: 149.99,
        stock: 35,
        category: 'Electronics',
        image: null
      },
      {
        name: 'Custom Mechanical RGB Gaming Keyboard',
        desc: 'Hot-swappable linear switches, aircraft-grade aluminum frame, and customizable RGB.',
        price: 89.50,
        stock: 50,
        category: 'Electronics',
        image: null
      },
      // ---- Fashion (2) ----
      {
        name: 'Classic Vintage Leather Bomber Jacket',
        desc: 'Handcrafted genuine lambskin leather jacket with premium quilted satin lining.',
        price: 189.00,
        stock: 20,
        category: 'Fashion',
        image: null
      },
      {
        name: 'Slim Fit Premium Cotton Chino Trousers',
        desc: 'Stretch-comfort slim-fit chinos in versatile neutral tones, perfect for office or casual wear.',
        price: 49.99,
        stock: 80,
        category: 'Fashion',
        image: null
      },
      // ---- Home & Kitchen (2) ----
      {
        name: 'Digital Touchscreen Rapid Air Fryer (5.8 Qt)',
        desc: '8 preset cooking modes, dishwasher-safe nonstick basket, 360-degree heat circulation.',
        price: 99.99,
        stock: 25,
        category: 'Home & Kitchen',
        image: null
      },
      {
        name: 'Stainless Steel Vacuum Insulated Water Bottle (1L)',
        desc: 'Triple-wall vacuum insulation keeps drinks cold 36h or hot 18h. BPA-free, leak-proof lid.',
        price: 34.00,
        stock: 120,
        category: 'Home & Kitchen',
        image: null
      },
      // ---- Books (2) ----
      {
        name: 'Clean Code: Handbook of Software Craftsmanship',
        desc: 'Renowned best-practices guide for writing maintainable, readable, and resilient code.',
        price: 38.50,
        stock: 60,
        category: 'Books',
        image: null
      },
      {
        name: 'The Pragmatic Programmer: Your Journey to Mastery',
        desc: '20th anniversary edition covering agile practices, career growth, and timeless coding wisdom.',
        price: 42.00,
        stock: 45,
        category: 'Books',
        image: null
      },
      // ---- Beauty (2) ----
      {
        name: 'Hydrating Botanical Vitamin C Facial Serum',
        desc: 'Brightening antioxidant complex with pure hyaluronic acid and aloe vera extracts.',
        price: 26.00,
        stock: 45,
        category: 'Beauty',
        image: null
      },
      {
        name: 'Natural Argan Oil Hair Repair Mask',
        desc: 'Deep conditioning treatment with Moroccan argan oil for frizz control and intense shine.',
        price: 18.50,
        stock: 70,
        category: 'Beauty',
        image: null
      },
      // ---- Sports (2) ----
      {
        name: 'Adjustable Neoprene Dumbbell Set (5-25 kg)',
        desc: 'Space-saving adjustable dumbbells with anti-roll base. Suitable for home gym workouts.',
        price: 129.00,
        stock: 30,
        category: 'Sports',
        image: null
      },
      {
        name: 'Lightweight Marathon Running Shoes',
        desc: 'Ultra-responsive foam midsole with breathable mesh upper. Ideal for long-distance road running.',
        price: 110.00,
        stock: 55,
        category: 'Sports',
        image: null
      }
    ];

    for (const prod of sampleProducts) {
      const categoryId = catMap[prod.category];
      if (!categoryId) {
        console.log(`   ! Skipping "${prod.name}" — category "${prod.category}" not found`);
        continue;
      }

      // Idempotent check: skip if product with same name + seller_id exists
      const [existingProd] = await connection.execute(
        'SELECT product_id FROM products WHERE product_name = ? AND seller_id = ?',
        [prod.name, sellerId]
      );

      if (existingProd.length === 0) {
        await connection.execute(
          `INSERT INTO products (seller_id, category_id, product_name, description, price, stock_quantity, image, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`,
          [sellerId, categoryId, prod.name, prod.desc, prod.price, prod.stock, prod.image]
        );
        console.log(`   + Created product: "${prod.name}" ($${prod.price})`);
      } else {
        console.log(`   * Product exists: "${prod.name}"`);
      }
    }

    // 5. Insert system audit log entry
    await connection.execute(
      `INSERT INTO system_logs (user_id, action, description, ip_address)
       VALUES (?, 'SYSTEM_SEED', 'Database seeded with default categories, roles, and sample products', '127.0.0.1')`,
      [userMap['Super Admin'] || null]
    );

    console.log('\n Database seeding finished successfully!');
    console.log('--------------------------------------------------');
    console.log('Seeded Accounts (Password for all: Test@1234):');
    console.log(' • Super Admin : superadmin@market.com');
    console.log(' • Admin       : admin@market.com');
    console.log(' • Seller      : seller@market.com');
    console.log(' • Customer    : customer@market.com');
    console.log('--------------------------------------------------\n');
  } catch (err) {
    console.error(' Seeding failed:', err.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

seedDatabase();
