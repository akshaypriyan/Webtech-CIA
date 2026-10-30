/* seller-data.js — Day 1 MOCK DATA for the Seller Portal (P3).
 *
 * Everything here is illustrative. It is the single source of truth for all five
 * seller pages so numbers stay consistent. In later days these arrays are replaced
 * by fetch() calls to /api/seller/*; the render code should not need to change shape
 * much, which is why field names follow the likely DB columns (name, price, stock...).
 */
(function () {
  const LOW_STOCK_THRESHOLD = 10;

  const categories = ['Audio', 'Accessories', 'Computers', 'Gaming', 'Home Office'];

  const products = [
    { id: 1, name: 'Wireless Headphones', category: 'Audio',       price: 79.99,  stock: 42, color: 'blue', description: 'Over-ear Bluetooth headphones with 30h battery.' },
    { id: 2, name: 'Mechanical Keyboard', category: 'Accessories', price: 119.00, stock: 8,  color: 'purple', description: 'Hot-swappable 75% keyboard with tactile switches.' },
    { id: 3, name: 'USB-C Hub',           category: 'Accessories', price: 39.50,  stock: 0,  color: 'orange', description: '7-in-1 hub: HDMI, USB-A, SD and 100W pass-through.' },
    { id: 4, name: 'Laptop Stand',        category: 'Home Office', price: 29.99,  stock: 65, color: 'green', description: 'Adjustable aluminium stand for 10–17 inch laptops.' },
    { id: 5, name: 'Bluetooth Speaker',   category: 'Audio',       price: 54.00,  stock: 5,  color: 'red', description: 'Portable waterproof speaker with 12h playtime.' }
  ];

  // Orders contain only this seller's items (one product per row, as in order_items).
  const orders = [
    { id: 'SO-1012', productId: 1, quantity: 2, date: '2026-10-29', customer: 'Aisha K.',   reference: 'ORD-5021', status: 'Pending' },
    { id: 'SO-1011', productId: 5, quantity: 1, date: '2026-10-29', customer: 'Daniel R.',  reference: 'ORD-5019', status: 'Pending' },
    { id: 'SO-1010', productId: 2, quantity: 1, date: '2026-10-28', customer: 'Meera S.',   reference: 'ORD-5014', status: 'Processing' },
    { id: 'SO-1009', productId: 4, quantity: 3, date: '2026-10-27', customer: 'Tom W.',     reference: 'ORD-5008', status: 'Shipped' },
    { id: 'SO-1008', productId: 1, quantity: 1, date: '2026-10-26', customer: 'Lina P.',    reference: 'ORD-5003', status: 'Delivered' },
    { id: 'SO-1007', productId: 3, quantity: 2, date: '2026-10-24', customer: 'Omar H.',    reference: 'ORD-4996', status: 'Delivered' },
    { id: 'SO-1006', productId: 2, quantity: 1, date: '2026-10-22', customer: 'Grace L.',   reference: 'ORD-4990', status: 'Cancelled' },
    { id: 'SO-1005', productId: 5, quantity: 2, date: '2026-10-20', customer: 'Ravi N.',    reference: 'ORD-4977', status: 'Delivered' },
    { id: 'SO-1004', productId: 4, quantity: 1, date: '2026-10-18', customer: 'Sofia M.',   reference: 'ORD-4968', status: 'Delivered' },
    { id: 'SO-1003', productId: 1, quantity: 3, date: '2026-10-15', customer: 'Chen Y.',    reference: 'ORD-4950', status: 'Delivered' },
    { id: 'SO-1002', productId: 3, quantity: 1, date: '2026-10-12', customer: 'Hannah B.',  reference: 'ORD-4931', status: 'Delivered' },
    { id: 'SO-1001', productId: 2, quantity: 2, date: '2026-10-08', customer: 'Yusuf A.',   reference: 'ORD-4912', status: 'Delivered' }
  ];

  // The mock "current day". Activity labels (Today/Yesterday/…) are derived from this,
  // so they stay consistent with the order dates above. Remove once real timestamps exist.
  const MOCK_TODAY = '2026-10-30';

  const activity = [
    { text: 'New order SO-1012 received for Wireless Headphones', date: '2026-10-29', time: '09:14' },
    { text: 'New order SO-1011 received for Bluetooth Speaker',   date: '2026-10-29', time: '08:02' },
    { text: 'SO-1009 marked as Shipped',                          date: '2026-10-28' },
    { text: 'USB-C Hub went out of stock',                        date: '2026-10-27' },
    { text: 'Order SO-1006 was cancelled by the customer',        date: '2026-10-22' }
  ];

  /* ---------- helpers ---------- */
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function productById(id) { return products.find(function (p) { return p.id === id; }); }
  function stockStatus(p) {
    if (p.stock <= 0) return 'Out of Stock';
    if (p.stock <= LOW_STOCK_THRESHOLD) return 'Low Stock';
    return 'In Stock';
  }
  function activityTime(a) {
    const days = Math.round((Date.parse(MOCK_TODAY) - Date.parse(a.date)) / 86400000);
    let label;
    if (days === 0) label = 'Today';
    else if (days === 1) label = 'Yesterday';
    else if (days > 1 && days < 7) label = days + ' days ago';
    else return formatDate(a.date);
    return a.time ? label + ', ' + a.time : label;
  }
  function orderTotal(o) { return productById(o.productId).price * o.quantity; }
  // Cancelled orders do not count towards sales/revenue.
  function countedOrders() { return orders.filter(function (o) { return o.status !== 'Cancelled'; }); }
  function totals() {
    const counted = countedOrders();
    return {
      totalProducts: products.length,
      totalOrders: orders.length,
      pendingOrders: orders.filter(function (o) { return o.status === 'Pending'; }).length,
      unitsSold: counted.reduce(function (s, o) { return s + o.quantity; }, 0),
      revenue: counted.reduce(function (s, o) { return s + orderTotal(o); }, 0)
    };
  }
  // CSS classes are only ever picked from these allowlists, never built from data strings.
  const THUMB_CLASSES = { blue: 'thumb--blue', purple: 'thumb--purple', orange: 'thumb--orange', green: 'thumb--green', red: 'thumb--red' };
  const STATUS_CLASSES = {
    'Pending': 'badge--pending', 'Processing': 'badge--processing', 'Shipped': 'badge--shipped',
    'Delivered': 'badge--delivered', 'Cancelled': 'badge--cancelled',
    'In Stock': 'badge--in-stock', 'Low Stock': 'badge--low-stock', 'Out of Stock': 'badge--out-of-stock'
  };

  function thumb(p) {
    const initials = p.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2);
    const cls = Object.prototype.hasOwnProperty.call(THUMB_CLASSES, p.color) ? THUMB_CLASSES[p.color] : '';
    return '<span class="thumb ' + cls + '" aria-hidden="true">' + esc(initials) + '</span>';
  }
  function statusBadge(label) {
    const known = Object.prototype.hasOwnProperty.call(STATUS_CLASSES, label);
    return '<span class="badge ' + (known ? STATUS_CLASSES[label] : 'badge--unknown') + '">' + esc(label) + '</span>';
  }

  window.SellerMock = {
    LOW_STOCK_THRESHOLD: LOW_STOCK_THRESHOLD,
    categories: categories,
    products: products,
    orders: orders,
    activity: activity,
    esc: esc, money: money, formatDate: formatDate, activityTime: activityTime,
    productById: productById, stockStatus: stockStatus, orderTotal: orderTotal,
    countedOrders: countedOrders, totals: totals, thumb: thumb, statusBadge: statusBadge
  };
})();
