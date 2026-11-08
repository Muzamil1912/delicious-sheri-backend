/**
 * Cross-origin auth cookies (Firebase / static hosts → Render API) require
 * SameSite=None; Secure. SameSite=Lax works only for same-site localhost setups,
 * but our frontends commonly call the production API even in local .env examples.
 */
function authCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    ...(maxAgeMs != null ? { maxAge: maxAgeMs } : {}),
  };
}

module.exports = { authCookieOptions };
