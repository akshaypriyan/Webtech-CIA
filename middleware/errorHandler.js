const { sendError } = require('../utils/response');

/**
 * 404 Not Found Handler for unmatched /api routes
 */
function notFoundHandler(req, res, next) {
  return sendError(res, `API route not found: ${req.method} ${req.originalUrl}`, 404);
}

/**
 * Central Error Handling Middleware
 * Catches any unhandled errors passed through next(err) or thrown in async handlers.
 */
function errorHandler(err, req, res, next) {
  console.error('[SERVER_ERROR]', err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error occurred.';

  // Return formatted JSON error
  return sendError(
    res,
    message,
    statusCode,
    process.env.NODE_ENV === 'development' ? { stack: err.stack } : null
  );
}

module.exports = {
  notFoundHandler,
  errorHandler
};
