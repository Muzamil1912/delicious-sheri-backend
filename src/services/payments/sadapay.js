// ---------------------------------------------------------------------------
// SADAPAY ADAPTER
// ---------------------------------------------------------------------------
// SadaPay's business/merchant API is newer and less broadly published than
// JazzCash/EasyPaisa's. This adapter is written as a generic REST client
// against the shape SadaPay's business team gives partners (API key auth,
// JSON payment-intent creation, webhook confirmation) — confirm the exact
// base URL, field names, and webhook signature scheme directly with SadaPay's
// business onboarding team before going live; treat the details below as a
// structural placeholder, not a verified contract.
// ---------------------------------------------------------------------------

const BASE_URL = process.env.SADAPAY_BASE_URL || 'https://business-api.sadapay.pk/v1';

async function createPaymentIntent(order) {
  if (!process.env.SADAPAY_API_KEY || !process.env.SADAPAY_MERCHANT_ID) {
    throw Object.assign(new Error('SadaPay is not configured yet (missing API credentials).'), { status: 501 });
  }

  const response = await fetch(`${BASE_URL}/payment-intents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SADAPAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      merchantId: process.env.SADAPAY_MERCHANT_ID,
      amount: Math.round(order.total * 100),
      currency: 'PKR',
      reference: order.orderNumber,
      callbackUrl: `${process.env.CUSTOMER_URL}/checkout/callback`,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw Object.assign(new Error(`SadaPay rejected the request: ${errText}`), { status: 502 });
  }

  const intent = await response.json();
  return { redirectUrl: intent.paymentUrl, paymentRef: intent.id };
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  // Placeholder — implement per SadaPay's documented signature scheme once received.
  return Boolean(signatureHeader) && Boolean(process.env.SADAPAY_API_KEY);
}

module.exports = { createPaymentIntent, verifyWebhookSignature };
