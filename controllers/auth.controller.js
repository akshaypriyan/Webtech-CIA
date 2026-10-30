const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');
const logAction = require('../utils/logAction');

/**
 * Validates email format using RFC 5322 compatible regex
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && emailRegex.test(email.trim());
}

/**
 * Validates 10-digit mobile number format
 */
function isValidMobile(mobile) {
  const mobileRegex = /^[0-9]{10}$/;
  return typeof mobile === 'string' && mobileRegex.test(mobile.trim());
}

/**
 * @desc    Register a new Customer or Seller
 * @route   POST /api/auth/register
 * @access  Public
 */
async function register(req, res, next) {
  try {
    const { name, email, password, mobile, role } = req.body;

    // 1. Check for administrative role escalation attempt
    const targetRole = role ? String(role).trim() : 'Customer';
    if (targetRole === 'Admin' || targetRole === 'Super Admin') {
      return sendError(res, 'Registration for administrative roles is not permitted.', 403);
    }

    if (targetRole !== 'Customer' && targetRole !== 'Seller') {
      return sendError(res, 'Invalid role specified. Only Customer or Seller can register.', 400);
    }

    // 2. Validate user input fields
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return sendError(res, 'Full name is required (minimum 2 characters).', 400);
    }

    if (!isValidEmail(email)) {
      return sendError(res, 'Please provide a valid email address.', 400);
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return sendError(res, 'Password must be at least 8 characters long.', 400);
    }

    if (!isValidMobile(mobile)) {
      return sendError(res, 'Mobile number must be a valid 10-digit number.', 400);
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanMobile = mobile.trim();

    // 3. Check for existing email in database
    const [existingUsers] = await pool.execute(
      'SELECT user_id FROM users WHERE email = ? LIMIT 1',
      [cleanEmail]
    );

    if (existingUsers.length > 0) {
      return sendError(res, 'Email is already registered. Please log in or use a different email.', 409);
    }

    // 4. Hash password with bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 5. Determine account status based on role
    // Customers are Active immediately; Sellers require Admin approval (Pending)
    const initialStatus = targetRole === 'Seller' ? 'Pending' : 'Active';

    // 6. Insert new user into database
    const [insertResult] = await pool.execute(
      `INSERT INTO users (name, email, password, mobile, role, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cleanName, cleanEmail, hashedPassword, cleanMobile, targetRole, initialStatus]
    );

    const newUserId = insertResult.insertId;

    // 7. If Customer, initialize an empty cart row for them
    if (targetRole === 'Customer') {
      try {
        await pool.execute('INSERT INTO cart (customer_id) VALUES (?)', [newUserId]);
      } catch (cartErr) {
        console.error(`[CART_INIT_WARN] Failed to create cart for customer ${newUserId}:`, cartErr.message);
      }
    }

    // 8. Log registration action into system_logs
    await logAction(
      newUserId,
      'REGISTER',
      `User ${cleanEmail} registered as ${targetRole} with status ${initialStatus}`,
      req.ip
    );

    const successMessage = targetRole === 'Seller'
      ? 'Seller registration submitted successfully. Your account is pending admin approval.'
      : 'Account registered successfully. You can now log in.';

    return sendSuccess(
      res,
      successMessage,
      {
        user_id: newUserId,
        name: cleanName,
        email: cleanEmail,
        mobile: cleanMobile,
        role: targetRole,
        status: initialStatus
      },
      201
    );
  } catch (error) {
    next(error);
  }
}

/**
 * @desc    Authenticate user & return JWT token
 * @route   POST /api/auth/login
 * @access  Public
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 'Email and password are required.', 400);
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Query user by email
    const [rows] = await pool.execute(
      'SELECT user_id, name, email, password, mobile, role, status FROM users WHERE email = ? LIMIT 1',
      [cleanEmail]
    );

    // Generic error message for security on invalid credentials
    if (rows.length === 0) {
      await logAction(null, 'LOGIN_FAILED', `Failed login attempt for non-existent email: ${cleanEmail}`, req.ip);
      return sendError(res, 'Invalid email or password.', 401);
    }

    const user = rows[0];

    // Compare bcrypt password
    const isMatch = await bcrypt.compare(String(password), user.password);
    if (!isMatch) {
      await logAction(user.user_id, 'LOGIN_FAILED', `Failed login attempt (wrong password) for: ${cleanEmail}`, req.ip);
      return sendError(res, 'Invalid email or password.', 401);
    }

    // Check account status
    if (user.status === 'Blocked') {
      await logAction(user.user_id, 'LOGIN_BLOCKED', `Blocked user attempted login: ${cleanEmail}`, req.ip);
      return sendError(res, 'Account blocked. Please contact marketplace support.', 403);
    }

    if (user.status === 'Pending') {
      await logAction(user.user_id, 'LOGIN_PENDING', `Pending seller attempted login: ${cleanEmail}`, req.ip);
      return sendError(res, 'Account awaiting admin approval.', 403);
    }

    if (user.status !== 'Active') {
      return sendError(res, 'Account is currently inactive.', 403);
    }

    // Generate JWT token
    const tokenPayload = {
      user_id: user.user_id,
      role: user.role,
      email: user.email
    };

    const secret = process.env.JWT_SECRET || 'supersecretjwtkey_change_in_production';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

    const token = jwt.sign(tokenPayload, secret, { expiresIn });

    // Log successful login
    await logAction(user.user_id, 'LOGIN', `User ${cleanEmail} logged in successfully`, req.ip);

    // Return token and sanitized user profile
    return sendSuccess(res, 'Login successful', {
      token,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * @desc    Get profile of currently logged-in user
 * @route   GET /api/auth/me
 * @access  Private (Requires Bearer token)
 */
async function getMe(req, res, next) {
  try {
    const userId = req.user.user_id;

    const [rows] = await pool.execute(
      'SELECT user_id, name, email, mobile, role, status, created_at FROM users WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (rows.length === 0) {
      return sendError(res, 'User account not found.', 404);
    }

    return sendSuccess(res, 'User profile retrieved successfully', rows[0]);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  getMe
};
