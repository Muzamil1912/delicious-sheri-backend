// ---------------------------------------------------------------------------
// EASYPAISA ADAPTER
// ---------------------------------------------------------------------------
// Modeled on EasyPaisa's Open/Inline API pattern: your server posts an order
// (storeId, amount, orderId, transaction type) and a hash computed with your
// hashKey; the customer completes payment via their EasyPaisa mobile account
// (usually an OTP step), and EasyPaisa posts a confirmation back to your
// callback URL.
//
// VERIFY BEFORE GOING LIVE: EasyPaisa issues exact endpoint URLs, hash
// algorithm, and required fields during merchant onboarding — confirm against
// that documentation before your first real transaction.
// ---------------------------------------------------------------------------

const crypto = require('crypto');

const SANDBOX_URL = 'https://easypay.easypaisa.com.pk/easypay/Index.jsf';
const PRODUCTION_URL = 'https://easypay.easypaisa.com.pk/easypay/Index.jsf'; // confirm prod host at onboarding

function buildHash(fields, hashKey) {
  const ordered = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('&');
  return crypto.createHmac('sha256', hashKey).update(ordered).digest('hex');
}

function createPaymentRequest(order) {
  if (!process.env.EASYPAISA_STORE_ID || !process.env.EASYPAISA_HASH_KEY) {
    throw Object.assign(new Error('EasyPaisa is not configured yet (missing store credentials).'), { status: 501 });
  }

  const fields = {
    storeId: process.env.EASYPAISA_STORE_ID,
    orderId: order.orderNumber,
    transactionAmount: order.total.toFixed(2),
    transactionType: 'MA', // Mobile Account
    postBackURL: `${process.env.CUSTOMER_URL}/checkout/callback`,
  };

  const hash = buildHash(fields, process.env.EASYPAISA_HASH_KEY);
  const actionUrl = process.env.EASYPAISA_ENV === 'production' ? PRODUCTION_URL : SANDBOX_URL;

  return { actionUrl, fields: { ...fields, hash }, paymentRef: order.orderNumber };
}

function verifyCallback(payload) {
  const { hash, ...rest } = payload;
  const expected = buildHash(rest, process.env.EASYPAISA_HASH_KEY);
  const isValid = expected === hash;
  const isSuccess = payload.status === 'SUCCESS' || payload.responseCode === '0000';
  return { isValid, isSuccess, orderNumber: payload.orderId };
}

module.exports = { createPaymentRequest, verifyCallback };
