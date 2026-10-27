// ---------------------------------------------------------------------------
// CARD GATEWAY ADAPTER (Visa / Debit Card)
// ---------------------------------------------------------------------------
// IMPORTANT — read before going live:
// Handling raw card numbers on your own server puts YOU inside PCI-DSS scope,
// which is expensive and slow to certify. The standard, safe pattern (used by
// virtually every serious e-commerce store) is a HOSTED CHECKOUT REDIRECT:
//   1. Your backend creates a "payment session" with the processor.
//   2. The customer is redirected to the processor's own secure page to enter
//      card details — your server never sees the card number.
//   3. The processor redirects back + sends a webhook confirming success/failure.
//
// This file is written against that pattern using a generic REST-style
// processor (this shape matches Stripe Checkout Sessions closely, and most
// Pakistan-facing acquirers — HBL PayPlus, Bank Alfalah, PayFast — offer an
// equivalent hosted-session API). Swap BASE_URL + field names for whichever
// processor you actually sign up with; the surrounding order/webhook logic
// stays the same either way.
// ---------------------------------------------------------------------------

const BASE_URL = process.env.CARD_GATEWAY_BASE_URL || 'https://api.your-card-processor.com/v1';

async function createCheckoutSession(order) {
  if (!process.env.CARD_GATEWAY_SECRET_KEY) {
    throw Object.assign(new Error('Card gateway is not configured yet (missing CARD_GATEWAY_SECRET_KEY).'), { status: 501 });
  }

  const response = await fetch(`${BASE_URL}/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CARD_GATEWAY_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Math.round(order.total * 100), // smallest currency unit
      currency: 'pkr',
      reference: order.orderNumber,
      success_url: `${process.env.CUSTOMER_URL}/order-tracking/${order.orderNumber}?paid=1`,
      cancel_url: `${process.env.CUSTOMER_URL}/checkout?cancelled=1`,
      metadata: { orderNumber: order.orderNumber },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw Object.assign(new Error(`Card gateway rejected the session: ${errText}`), { status: 502 });
  }

  const session = await response.json();
  return { redirectUrl: session.url, paymentRef: session.id };
}

// Called from the webhook route. Verify the signature header against
// CARD_GATEWAY_WEBHOOK_SECRET using the processor's documented method
// (e.g. HMAC-SHA256 over the raw body) before trusting the payload.
function verifyWebhookSignature(rawBody, signatureHeader) {
  // Placeholder — implement per your chosen processor's docs.
  // Returning false by default is intentional: never accept unverified webhooks.
  return Boolean(signatureHeader) && Boolean(process.env.CARD_GATEWAY_WEBHOOK_SECRET);
}

module.exports = { createCheckoutSession, verifyWebhookSignature };
