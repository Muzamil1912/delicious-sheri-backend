const { verifyToken } = require('../utils/jwt');

// Gates every /api/riders/me/* route. Requires a JWT issued only after admin
// approval (see rider.controller.js login()) — a rider who is still "pending"
// cannot obtain one of these tokens at all.
function requireRider(req, res, next) {
  const token = req.cookies?.ds_rider_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Rider authentication required.' });

  try {
    const decoded = verifyToken(token);
    if (decoded.role !== 'rider') return res.status(403).json({ error: 'Not authorized as a rider.' });
    req.rider = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired rider session.' });
  }
}

module.exports = { requireRider };
