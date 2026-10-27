// Fixed-margin pricing for dropshipped/third-party products.
//
// If a product has marginAmount set (a fixed currency amount, not a
// percentage), its customer-facing price is ALWAYS costPrice + marginAmount —
// computed here, server-side, every time costPrice changes. The admin's
// margin is never derived from or exposed alongside the price on any public
// endpoint (see product.controller.js's public serializer).
function computePrice(costPrice, marginAmount, fallbackPrice) {
  if (costPrice != null && marginAmount != null) {
    return Math.round((costPrice + marginAmount) * 100) / 100;
  }
  // Not a margin-tracked product (e.g. a plain bakery item) — price is
  // whatever the admin manually set, unchanged.
  return fallbackPrice;
}

module.exports = { computePrice };
