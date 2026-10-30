# Online Marketplace Web Application

A full-stack, multi-role e-commerce web platform developed with **HTML5/CSS3**, **Vanilla JavaScript (DOM & Fetch API)**, **Node.js (Express)**, and **MySQL**.

---

## 📌 Project Overview

This project implements an Online Marketplace supporting four distinct user roles:
1. **Customer**: Browse products, manage cart, place orders, track shipments, cancel eligible orders, write reviews, and update profile/addresses.
2. **Seller**: Register/login, manage inventory (add/update/delete products), view incoming customer orders for seller's products, update fulfillment statuses, and inspect sales reports.
3. **Admin**: Moderate customers and sellers (approve/reject/block/unblock), oversee categories and product listings, inspect orders, and view marketplace-wide performance metrics.
4. **Super Admin**: Manage administrator accounts, assign granular permissions, review system-wide audit logs (`system_logs`) with filters, and configure system settings.

---

## 👥 4-Person Team Work Distribution

The project is divided into **4 vertical feature slices** so every team member builds full-stack components (HTML/CSS, DOM manipulation, AJAX/Fetch, Node.js REST APIs, and MySQL queries):

| Member | Domain & Ownership | Pages Assigned | REST API Modules | MySQL Tables |
| :--- | :--- | :--- | :--- | :--- |
| **Member 1** | **Auth, Public Storefront & Customer Profiles** | `index.html`<br>`login.html`<br>`register.html`<br>`products.html`<br>`product-details.html`<br>`profile.html` | `/api/auth/*`<br>`/api/products/*`<br>`/api/profile/*`<br>`/api/reviews/*` | `users`<br>`addresses`<br>`reviews` |
| **Member 2** | **Shopping Cart, Checkout & Customer Orders** | `cart.html`<br>`checkout.html`<br>`my-orders.html`<br>`customer-dashboard.html` | `/api/cart/*`<br>`/api/orders/*`<br>`/api/customer/orders/*` | `cart`<br>`cart_items`<br>`orders`<br>`order_items` |
| **Member 3** | **Seller Portal, Inventory & Fulfillment** | `seller-dashboard.html`<br>`seller-products.html`<br>`add-product.html`<br>`seller-orders.html`<br>`seller-reports.html` | `/api/seller/products/*`<br>`/api/seller/orders/*`<br>`/api/seller/reports/*` | `products` (Seller CRUD)<br>`order_items` (Seller items) |
| **Member 4** | **Admin & Super Admin Governance & System Logs** | `admin-dashboard.html`<br>`manage-customers.html`<br>`manage-sellers.html`<br>`manage-products.html`<br>`manage-categories.html`<br>`admin-reports.html`<br>`superadmin-dashboard.html`<br>`manage-admins.html`<br>`system-logs.html`<br>`system-settings.html` | `/api/admin/*`<br>`/api/superadmin/*`<br>`/api/categories/*`<br>`auditLogger` middleware | `categories`<br>`admin_permissions`<br>`system_logs`<br>Platform status controls |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **MySQL**: MySQL 8.0+ or MariaDB 10.5+ running locally (default port: `3306`)

### 2. Clone and Setup Environment
```bash
# Clone the repository
git clone https://github.com/akshaypriyan/Webtech-CIA.git
cd Webtech-CIA

# Switch to the foundation branch
git checkout feature/p1-foundation-auth

# Install dependencies
npm install

# Create local environment config
cp .env.example .env
```

Edit `.env` with your local MySQL credentials:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=marketplace_db
JWT_SECRET=supersecretjwtkey_change_in_production
JWT_EXPIRES_IN=7d
```

### 3. Initialize Database & Schema
Open MySQL CLI or your GUI (Workbench / phpMyAdmin / DBeaver) and run `database/schema.sql`:
```bash
mysql -u root -p < database/schema.sql
```
*(Alternatively, copy and paste the contents of `database/schema.sql` into MySQL Workbench or your SQL console).*

### 4. Seed the Database
Populate standard categories, seed accounts with bcrypt-hashed passwords, and sample products:
```bash
npm run seed
```

### 5. Start the Application
```bash
# For development with nodemon auto-restart:
npm run dev

# Or standard production start:
npm start
```
Visit the application in your browser:
- **Storefront & Landing**: [http://localhost:3000](http://localhost:3000)
- **Login Page**: [http://localhost:3000/login.html](http://localhost:3000/login.html)
- **Register Page**: [http://localhost:3000/register.html](http://localhost:3000/register.html)
- **API Health Check**: [http://localhost:3000/api/health](http://localhost:3000/api/health)

### 6. Run Automated Verification Tests
```bash
npm test
```

---

## 🔑 Seeded Demo Credentials

All seeded accounts share the default test password: **`Test@1234`**

| Role | Email | Password | Initial Status | Permissions / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin@market.com` | `Test@1234` | `Active` | Full platform access, admin management, `system_logs` audit inspection |
| **Admin** | `admin@market.com` | `Test@1234` | `Active` | Seller approval, customer moderation, catalog curation |
| **Seller** | `seller@market.com` | `Test@1234` | `Active` | Seeded store with 6 active demo products ready for storefront testing |
| **Customer** | `customer@market.com` | `Test@1234` | `Active` | Customer account with initialized shopping cart |

---

## 🗄️ Database Architecture (11 Tables, InnoDB, utf8mb4)

```
users ────────────┬──── addresses (1:M, CASCADE)
                  ├──── cart ──── cart_items (1:1 cart, 1:M items)
                  ├──── orders ──── order_items (1:M orders, 1:M items)
                  ├──── products (Seller 1:M)
                  ├──── reviews (Customer 1:M)
                  ├──── admin_permissions (Admin 1:M)
                  └──── system_logs (Audit trail, SET NULL on delete)

categories ──────────── products (1:M, RESTRICT)
```

1. **`users`**: Account ID, name, email (UNIQUE), bcrypt password, mobile, `role` (Customer, Seller, Admin, Super Admin), `status` (Active, Pending, Blocked).
2. **`addresses`**: User shipping/billing addresses (`user_id` FK, ON DELETE CASCADE).
3. **`categories`**: Taxonomy (`category_name` UNIQUE, description, status).
4. **`products`**: Catalog items (`seller_id` FK users, `category_id` FK, price, stock_quantity >= 0, image, status). Indexes on `seller_id`, `category_id`.
5. **`cart`**: Single persistent cart per customer (`customer_id` FK UNIQUE, ON DELETE CASCADE).
6. **`cart_items`**: Cart line items (`cart_id` FK, `product_id` FK, quantity > 0, price, UNIQUE(`cart_id`, `product_id`)).
7. **`orders`**: Customer orders (`customer_id` FK, total_amount, shipping_address, order_status, payment_status, order_date). Index on `customer_id`.
8. **`order_items`**: Multi-vendor line items (`order_id` FK, `product_id` FK, `seller_id` FK, quantity, price, subtotal, item_status). Index on `seller_id`.
9. **`reviews`**: 1–5 star customer reviews (`customer_id` FK, `product_id` FK, rating CHECK 1–5, comment, UNIQUE(`customer_id`, `product_id`)).
10. **`admin_permissions`**: Granular authorizations for admins (`admin_id` FK, `permission_name`, UNIQUE(`admin_id`, `permission_name`)).
11. **`system_logs`**: System audit log (`user_id` FK SET NULL, action, description, ip_address, created_at). Index on `created_at`.

---

## 📐 Teammate API & Architecture Conventions

All team members must adhere to these conventions to maintain clean integration across branches.

### 1. Unified REST API Response Structure
Always use the standardized helpers from `utils/response.js`:

```javascript
const { sendSuccess, sendError } = require('../utils/response');

// Success Response (HTTP 200/201)
return sendSuccess(res, 'Items retrieved successfully', data, 200);
// Result: { "success": true, "message": "...", "data": ... }

// Error Response (HTTP 400/401/403/404/409/500)
return sendError(res, 'Product not found', 404);
// Result: { "success": false, "message": "..." }
```

### 2. Protecting Backend Endpoints (Authentication & RBAC)
Use `authenticate` and `authorizeRoles` from `middleware/`:

```javascript
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/roles');

// Any logged-in user:
router.get('/my-data', authenticate, myController);

// Restricted to specific roles (e.g., Seller only):
router.post('/add-product', authenticate, authorizeRoles('Seller'), addProductController);

// Restricted to Admins:
router.delete('/user/:id', authenticate, authorizeRoles('Admin', 'Super Admin'), deleteUserController);
```
Inside your controllers, `req.user` contains: `{ user_id, role, email }`.

### 3. Non-Blocking Audit Logging
Whenever sensitive or significant actions occur, call `logAction`:

```javascript
const logAction = require('../utils/logAction');

// logAction(userId, action, description, ip) -> never throws
await logAction(req.user.user_id, 'ORDER_PLACED', `Order #${orderId} created ($${total})`, req.ip);
```

### 4. Client-Side API Helper (`public/js/api.js`)
On every HTML page, include:
```html
<script src="js/api.js"></script>
<script src="js/navbar.js"></script>
```

Available frontend helper functions:
- `apiFetch(path, { method, body, auth })`: Automatically attaches JWT Bearer token from localStorage, parses JSON, shows errors, and handles expired 401 sessions by redirecting to `login.html`.
  ```javascript
  // GET request (authorized by default):
  const res = await apiFetch('/cart');
  console.log(res.data);

  // POST request:
  const res = await apiFetch('/cart/add', {
    method: 'POST',
    body: { product_id: 1, quantity: 2 }
  });
  ```
- `requireRole(...roles)`: Call at the top of your role-protected pages. Redirects guests to `login.html` and unauthorized roles to their home dashboard.
  ```javascript
  const user = requireRole('Seller');
  // Returns current user object { user_id, name, email, role }
  ```
- `getUser()` / `getToken()` / `logout()`: Inspect or clear authentication state.
- `showToast(message, type, duration)`: Display visual alert toasts (`'success'`, `'error'`, `'warning'`, `'info'`).

### 5. Dynamic Shared Navbar
Add `<div id="navbar"></div>` anywhere in your HTML `<body>`. The navbar will dynamically adjust links based on whether the visitor is a Guest, Customer, Seller, Admin, or Super Admin.

---

## 🗓️ 5-Phase Development Roadmap

1. **Phase 1: Setup & Database Foundation (Days 1–2)**
   - Complete multi-role schema (11 tables) and initial seed data.
   - Project skeleton, Express server, and unified utilities.
   - Master design system, responsive CSS tokens, shared navbar, and API fetch helper.
   - Member 1 Authentication endpoints and client login/register pages.
2. **Phase 2: Core Vertical Slices (Days 3–6)**
   - Member 1: Storefront catalog, product detail pages, customer profiles, and product reviews.
   - Member 2: Shopping cart line-items, checkout flows, and customer order tracking.
   - Member 3: Seller inventory portal (CRUD), order item fulfillment, and sales reports.
   - Member 4: Admin customer/seller moderation, category management, and Super Admin audit logs.
3. **Phase 3: Cross-Role Integration (Days 7–9)**
   - End-to-end integration: Super Admin creates Admin $\rightarrow$ Admin approves Seller $\rightarrow$ Seller adds product $\rightarrow$ Customer purchases item $\rightarrow$ Seller fulfills order item $\rightarrow$ Customer leaves review $\rightarrow$ Audit trail verifies all operations.
4. **Phase 4: Polish & UX Edge Cases (Days 10–11)**
   - Client-side DOM validation, search/filtering, toast feedback, and empty-state styling.
5. **Phase 5: Final Rehearsal & Delivery (Day 12)**
   - Seed verification, end-to-end demo walkthrough, documentation wrap-up.

---
