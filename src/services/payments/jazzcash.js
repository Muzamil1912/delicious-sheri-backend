// ---------------------------------------------------------------------------
// JAZZCASH ADAPTER
// ---------------------------------------------------------------------------
// Modeled on JazzCash's published Mobile Wallet / Card (HashRequest) integration
// pattern: a form of fields is built, a SecureHash (HMAC-SHA256, salted) is
// computed over them, and the customer is redirected to JazzCash's payment page.
// JazzCash confirms the transaction back via pp_ReturnURL + a server-to-server
// callback.
//
// VERIFY BEFORE GOING LIVE: exact field names, hash field order, and endpoint
// URLs must be confirmed against the current merchant integration guide you
// receive when you onboard with JazzCash — these details do change between
// sandbox and production, and across API versions.
// ---------------------------------------------------------------------------

const crypto = require('crypto');

const SANDBOX_URL = 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';
const PRODUCTION_URL = 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';

function buildSecureHash(fields, integritySalt) {
  // JazzCash's documented approach: sort pp_ fields alphabetically by key,
  // concatenate values with '&', prefix with the integrity salt, then HMAC-SHA256.
  const sortedKeys = Object.keys(fields).sort();
  const concatenated = sortedKeys.map((k) => fields[k]).join('&');
  const hashString = `${integritySalt}&${concatenated}`;
  return crypto.createHmac('sha256', integritySalt).update(hashString).digest('hex');
}

function createPaymentRequest(order) {
  if (!process.env.JAZZCASH_MERCHANT_ID || !process.env.JAZZCASH_INTEGRITY_SALT) {
    throw Object.assign(new Error('JazzCash is not configured yet (missing merchant credentials).'), { status: 501 });
  }

  const now = new Date();
  const txnDateTime = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const expiry = new Date(now.getTime() + 60 * 60 * 1000)
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);

  const fields = {
    pp_Version: '1.1',
    pp_TxnType: 'MWALLET',
    pp_Language: 'EN',
    pp_MerchantID: process.env.JAZZCASH_MERCHANT_ID,
    pp_Password: process.env.JAZZCASH_PASSWORD,
    pp_TxnRefNo: order.orderNumber,
    pp_Amount: String(Math.round(order.total * 100)),
    pp_TxnCurrency: 'PKR',
    pp_TxnDateTime: txnDateTime,
    pp_BillReference: order.orderNumber,
    pp_Description: `Delicious Sheri order ${order.orderNumber}`,
    pp_TxnExpiryDateTime: expiry,
    pp_ReturnURL: process.env.JAZZCASH_RETURN_URL,
  };

  const secureHash = buildSecureHash(fields, process.env.JAZZCASH_INTEGRITY_SALT);
  const actionUrl = process.env.JAZZCASH_ENV === 'production' ? PRODUCTION_URL : SANDBOX_URL;

  // The frontend should auto-submit these fields as a POST form to actionUrl.
  return { actionUrl, fields: { ...fields, pp_SecureHash: secureHash }, paymentRef: order.orderNumber };
}

function verifyCallback(payload) {
  const { pp_SecureHash, ...rest } = payload;
  const expected = buildSecureHash(rest, process.env.JAZZCASH_INTEGRITY_SALT);
  const isValid = expected === pp_SecureHash;
  const isSuccess = payload.pp_ResponseCode === '000';
  return { isValid, isSuccess, orderNumber: payload.pp_TxnRefNo };
}

module.exports = { createPaymentRequest, verifyCallback };
