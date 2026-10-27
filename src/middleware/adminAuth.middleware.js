const { verifyToken } = require('../utils/jwt');

// Strict gate for every /api/admin/* route (except login itself).
// Requires a valid JWT that was issued specifically with role=admin.
function requireAdmin(req, res, next) {
  const token = req.cookies?.ds_admin_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Admin authentication required.' });

  try {
    const decoded = verifyToken(token);
    if (decoded.role !== 'admin' && decoded.role !== 'superadmin') {
      return res.status(403).json({ error: 'Not authorized for admin access.' });
    }
    req.admin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired admin session.' });
  }
}

module.exports = { requireAdmin };
