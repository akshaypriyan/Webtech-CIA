/**
 * ============================================================
 * Profile Routes — /api/profile
 * ============================================================
 * All routes require authentication.
 * Address sub-routes are additionally restricted to Customers.
 *
 * NOTE: Do NOT add GET/POST/DELETE address routes here.
 *   P2 already owns those at /api/addresses.
 *   We only add PUT (edit) and PATCH (set-default), which P2 didn't build.
 * ============================================================
 */

const express           = require('express');
const router            = express.Router();
const profileController = require('../controllers/profile.controller');
const { authenticate }  = require('../middleware/auth');
const { authorizeRoles} = require('../middleware/roles');

// Apply authentication to ALL profile routes
router.use(authenticate);

// ---- Basic profile endpoints (any authenticated role) ----
router.get('/',          profileController.getProfile);      // GET  /api/profile
router.put('/',          profileController.updateProfile);   // PUT  /api/profile
router.put('/password',  profileController.changePassword);  // PUT  /api/profile/password

// ---- Address management (Customer role only) ----
router.get(
  '/addresses',
  authorizeRoles('Customer'),
  profileController.getAddresses         // GET  /api/profile/addresses
);
router.post(
  '/addresses',
  authorizeRoles('Customer'),
  profileController.addAddress           // POST /api/profile/addresses
);
router.put(
  '/addresses/:id',
  authorizeRoles('Customer'),
  profileController.updateAddress        // PUT  /api/profile/addresses/:id
);
router.delete(
  '/addresses/:id',
  authorizeRoles('Customer'),
  profileController.deleteAddress        // DELETE /api/profile/addresses/:id
);
router.patch(
  '/addresses/:id/default',
  authorizeRoles('Customer'),
  profileController.setDefaultAddress    // PATCH /api/profile/addresses/:id/default
);

module.exports = router;
