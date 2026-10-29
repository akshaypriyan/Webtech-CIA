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

## 🗄️ Database Architecture (11 Tables)

- **`users`**: User credentials, contact info, role (`Customer`, `Seller`, `Admin`, `Super Admin`), and account status (`Active`, `Pending`, `Blocked`).
- **`addresses`**: Multiple shipping/billing addresses linked to users (`1:M`).
- **`categories`**: Taxonomy for catalog organization (`1:M` with products).
- **`products`**: Product details, seller ownership, pricing, stock count, and images.
- **`cart`** & **`cart_items`**: Persistent shopping carts and line items per customer.
- **`orders`** & **`order_items`**: Multi-vendor checkout snapshots, prices, shipping address, and tracking status.
- **`reviews`**: Ratings (1–5) and feedback from customers for purchased products.
- **`admin_permissions`**: Granular access control for administrators.
- **`system_logs`**: System-wide audit trail recording user ID, action, description, IP address, and timestamps.

---




## 🗓️ 5-Phase Development Roadmap

1. **Phase 1: Setup & Database Foundation (Days 1–2)**
   - Agree on relational schema and constraints.
   - Initialize Git repository, `.gitignore`, and Express project setup.
   - Establish shared CSS variables (`main.css`) and database seed records (`seed.sql`).
2. **Phase 2: Authentication & Core Standards (Days 3–4)**
   - Implement register/login endpoints and session/JWT handling.
   - Standardize client-side `fetch()` helper (`api.js`) and unified API JSON response contract.
   - Integrate RBAC middleware and centralized audit logging (`system_logs`).
3. **Phase 3: Vertical Feature Development (Days 5–8)**
   - Parallel implementation across feature branches for Members 1 through 4.
4. **Phase 4: Cross-Role Integration (Days 9–10)**
   - End-to-end user journeys: Super Admin creates Admin $\rightarrow$ Admin approves Seller $\rightarrow$ Seller lists product $\rightarrow$ Customer purchases item $\rightarrow$ Seller fulfills order $\rightarrow$ Customer tracks package $\rightarrow$ Super Admin audits activity logs.
5. **Phase 5: UI Polish, Form Validation & Final Rehearsal (Days 11–12)**
   - Client-side DOM validation, responsive testing, demo preparation.

---

