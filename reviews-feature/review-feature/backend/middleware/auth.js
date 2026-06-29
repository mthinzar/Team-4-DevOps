const jwt = require('jsonwebtoken');

/**
 * Expects: Authorization: Bearer <token>
 * On success attaches req.user = { id, role } and calls next().
 *
 * This is written against a plain { id, role } JWT payload so it will work
 * unchanged once May's real login system issues the tokens — just make
 * sure her login endpoint signs tokens with at least those two fields.
 */
function protect(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided.' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

module.exports = { protect };
