const { verifyToken } = require('../utils/jwt');

// Optional customer auth — attaches req.user if a valid token cookie/header is present,
// but does not block guest checkout.
function attachUserIfPresent(req, res, next) {
  const token = req.cookies?.ds_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next();
  try {
    const decoded = verifyToken(token);
    req.user = decoded;
  } catch (e) {
    // invalid/expired token — treat as guest, do not throw
  }
  next();
}

function requireCustomer(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
}

module.exports = { attachUserIfPresent, requireCustomer };
