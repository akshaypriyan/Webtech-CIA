const logAction = require('../utils/logAction');

/**
 * Extracts the real client IP address from request headers or socket.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Audit Logger Middleware
 * 
 * Supports two usage styles:
 * 1. As general middleware: `app.use(auditLogger)` or `router.use(auditLogger)`
 *    Attaches `req.logAudit(action, description)` helper to the request object.
 * 
 * 2. As route decorator/factory: `router.post('/categories', auditLogger('CATEGORY_CREATE'), handler)`
 *    Automatically records an audit entry on response completion if HTTP status is < 400.
 *
 * @param {string|Function} [actionOrReq] - Action string or Express request
 * @param {string|Function} [descOrRes] - Description string/resolver or Express response
 * @param {Function} [next] - Express next middleware function
 */
function auditLogger(actionOrReq, descOrRes, next) {
  // If invoked directly as middleware: auditLogger(req, res, next)
  if (actionOrReq && actionOrReq.headers && typeof next === 'function') {
    const req = actionOrReq;
    const res = descOrRes;
    
    attachAuditHelper(req);
    return next();
  }

  // If invoked as factory: auditLogger(action, description)
  const defaultAction = typeof actionOrReq === 'string' ? actionOrReq : 'AUDIT_EVENT';
  const descriptionResolver = descOrRes;

  return (req, res, next) => {
    attachAuditHelper(req);

    // Capture response finish to log automatically on success
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        const userId = req.user ? req.user.user_id : null;
        const ip = getClientIp(req);
        
        let description = '';
        if (typeof descriptionResolver === 'function') {
          try {
            description = descriptionResolver(req, res);
          } catch (e) {
            description = `Action performed on ${req.originalUrl}`;
          }
        } else if (typeof descriptionResolver === 'string') {
          description = descriptionResolver;
        } else {
          description = `${req.method} ${req.originalUrl} by ${req.user ? req.user.role : 'Guest'}`;
        }

        await logAction(userId, defaultAction, description, ip);
      }
    });

    next();
  };
}

/**
 * Attaches req.logAudit helper to request object
 * @param {import('express').Request} req 
 */
function attachAuditHelper(req) {
  if (!req.logAudit) {
    req.clientIp = getClientIp(req);
    req.logAudit = async (action, description) => {
      const userId = req.user ? req.user.user_id : null;
      return await logAction(userId, action, description, req.clientIp);
    };
  }
}

module.exports = {
  auditLogger,
  getClientIp
};
