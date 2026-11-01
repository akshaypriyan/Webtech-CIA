const express = require('express');
const router = express.Router();
const addressController = require('../controllers/address.controller');
const { authenticate } = require('../middleware/auth');

// All address routes require an authenticated user
router.use(authenticate);

// GET /api/addresses - Fetch all saved addresses for current user
router.get('/', addressController.getUserAddresses);

// POST /api/addresses - Save a new shipping address
router.post('/', addressController.addAddress);

// DELETE /api/addresses/:id - Delete an address
router.delete('/:id', addressController.deleteAddress);

module.exports = router;
