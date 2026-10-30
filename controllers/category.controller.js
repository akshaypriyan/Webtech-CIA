const { pool } = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * @desc    Get all categories (with product count)
 * @route   GET /api/categories
 * @access  Public (Storefront, Seller & Admin)
 */
async function getAllCategories(req, res, next) {
  try {
    const { status, search } = req.query;

    let sql = `
      SELECT 
        c.category_id,
        c.category_name,
        c.description,
        c.status,
        COUNT(p.product_id) AS product_count
      FROM categories c
      LEFT JOIN products p ON c.category_id = p.category_id
      WHERE 1=1
    `;
    const params = [];

    // Filter by status if specified (e.g. 'Active', 'Inactive'), otherwise return all
    if (status && ['Active', 'Inactive'].includes(status)) {
      sql += ' AND c.status = ?';
      params.push(status);
    }

    // Search by category name or description
    if (search && search.trim()) {
      sql += ' AND (c.category_name LIKE ? OR c.description LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    sql += ' GROUP BY c.category_id, c.category_name, c.description, c.status ORDER BY c.category_name ASC';

    const [rows] = await pool.execute(sql, params);

    return sendSuccess(res, 'Categories retrieved successfully', rows);
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Get single category by ID
 * @route   GET /api/categories/:id
 * @access  Public
 */
async function getCategoryById(req, res, next) {
  try {
    const { id } = req.params;
    const categoryId = parseInt(id, 10);

    if (isNaN(categoryId) || categoryId <= 0) {
      return sendError(res, 'Invalid category ID specified.', 400);
    }

    const sql = `
      SELECT 
        c.category_id,
        c.category_name,
        c.description,
        c.status,
        COUNT(p.product_id) AS product_count
      FROM categories c
      LEFT JOIN products p ON c.category_id = p.category_id
      WHERE c.category_id = ?
      GROUP BY c.category_id, c.category_name, c.description, c.status
    `;

    const [rows] = await pool.execute(sql, [categoryId]);

    if (rows.length === 0) {
      return sendError(res, 'Category not found.', 404);
    }

    return sendSuccess(res, 'Category details retrieved successfully', rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Create a new category
 * @route   POST /api/categories
 * @access  Private (Admin & Super Admin)
 */
async function createCategory(req, res, next) {
  try {
    const { category_name, description, status } = req.body;

    // 1. Validation
    if (!category_name || typeof category_name !== 'string' || !category_name.trim()) {
      return sendError(res, 'Category name is required.', 400);
    }

    const cleanName = category_name.trim();
    if (cleanName.length > 100) {
      return sendError(res, 'Category name must not exceed 100 characters.', 400);
    }

    const cleanDesc = description && typeof description === 'string' ? description.trim() : null;
    const cleanStatus = status && ['Active', 'Inactive'].includes(status) ? status : 'Active';

    // 2. Check for duplicate category name
    const [existing] = await pool.execute(
      'SELECT category_id FROM categories WHERE LOWER(category_name) = LOWER(?)',
      [cleanName]
    );

    if (existing.length > 0) {
      return sendError(res, `A category with the name "${cleanName}" already exists.`, 409);
    }

    // 3. Insert category
    const [result] = await pool.execute(
      'INSERT INTO categories (category_name, description, status) VALUES (?, ?, ?)',
      [cleanName, cleanDesc, cleanStatus]
    );

    const newCategory = {
      category_id: result.insertId,
      category_name: cleanName,
      description: cleanDesc,
      status: cleanStatus,
      product_count: 0
    };

    // 4. Record audit log
    if (req.logAudit) {
      await req.logAudit('CATEGORY_CREATE', `Created category "${cleanName}" (ID: ${result.insertId})`);
    }

    return sendSuccess(res, 'Category created successfully.', newCategory, 201);
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Update an existing category
 * @route   PUT /api/categories/:id
 * @access  Private (Admin & Super Admin)
 */
async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const categoryId = parseInt(id, 10);

    if (isNaN(categoryId) || categoryId <= 0) {
      return sendError(res, 'Invalid category ID specified.', 400);
    }

    const { category_name, description, status } = req.body;

    // 1. Check if category exists
    const [existingRows] = await pool.execute(
      'SELECT category_id, category_name, description, status FROM categories WHERE category_id = ?',
      [categoryId]
    );

    if (existingRows.length === 0) {
      return sendError(res, 'Category not found.', 404);
    }

    const currentCategory = existingRows[0];

    // 2. Validate input fields
    const updatedName = category_name !== undefined ? String(category_name).trim() : currentCategory.category_name;
    if (!updatedName) {
      return sendError(res, 'Category name cannot be empty.', 400);
    }
    if (updatedName.length > 100) {
      return sendError(res, 'Category name must not exceed 100 characters.', 400);
    }

    const updatedDesc = description !== undefined ? (description ? String(description).trim() : null) : currentCategory.description;
    
    let updatedStatus = currentCategory.status;
    if (status !== undefined) {
      if (!['Active', 'Inactive'].includes(status)) {
        return sendError(res, 'Status must be either "Active" or "Inactive".', 400);
      }
      updatedStatus = status;
    }

    // 3. Check name collision if name has changed
    if (updatedName.toLowerCase() !== currentCategory.category_name.toLowerCase()) {
      const [duplicate] = await pool.execute(
        'SELECT category_id FROM categories WHERE LOWER(category_name) = LOWER(?) AND category_id != ?',
        [updatedName, categoryId]
      );
      if (duplicate.length > 0) {
        return sendError(res, `Another category with the name "${updatedName}" already exists.`, 409);
      }
    }

    // 4. Update category in database
    await pool.execute(
      'UPDATE categories SET category_name = ?, description = ?, status = ? WHERE category_id = ?',
      [updatedName, updatedDesc, updatedStatus, categoryId]
    );

    const updatedCategory = {
      category_id: categoryId,
      category_name: updatedName,
      description: updatedDesc,
      status: updatedStatus
    };

    // 5. Record audit log
    if (req.logAudit) {
      await req.logAudit('CATEGORY_UPDATE', `Updated category "${updatedName}" (ID: ${categoryId})`);
    }

    return sendSuccess(res, 'Category updated successfully.', updatedCategory, 200);
  } catch (err) {
    next(err);
  }
}

/**
 * @desc    Delete a category
 * @route   DELETE /api/categories/:id
 * @access  Private (Admin & Super Admin)
 */
async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    const categoryId = parseInt(id, 10);

    if (isNaN(categoryId) || categoryId <= 0) {
      return sendError(res, 'Invalid category ID specified.', 400);
    }

    // 1. Check if category exists
    const [existing] = await pool.execute(
      'SELECT category_id, category_name FROM categories WHERE category_id = ?',
      [categoryId]
    );

    if (existing.length === 0) {
      return sendError(res, 'Category not found.', 404);
    }

    const categoryName = existing[0].category_name;

    // 2. Count associated products
    const [prodCountRows] = await pool.execute(
      'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
      [categoryId]
    );
    const linkedProducts = prodCountRows[0].count;

    // 3. Delete category (Foreign keys set null on products automatically)
    await pool.execute('DELETE FROM categories WHERE category_id = ?', [categoryId]);

    // 4. Record audit log
    if (req.logAudit) {
      await req.logAudit(
        'CATEGORY_DELETE',
        `Deleted category "${categoryName}" (ID: ${categoryId}, orphaned ${linkedProducts} products)`
      );
    }

    return sendSuccess(res, `Category "${categoryName}" deleted successfully.`, {
      category_id: categoryId,
      affected_products: linkedProducts
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
};
