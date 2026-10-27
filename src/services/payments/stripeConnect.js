// ---------------------------------------------------------------------------
// STRIPE CONNECT — AUTOMATED SPLIT PAYMENTS
// ---------------------------------------------------------------------------
// This is real, working Stripe Connect code (destination-charge pattern) —
// but it can only actually split money once you have:
//   1. A real Stripe account with Connect enabled.
//   2. Each vendor onboarded as a Stripe Connected Account (their
//      stripeConnectedAccountId stored on the Vendor record — see
//      Admin → Vendors). Stripe's own onboarding flow (Account Links) issues
//      this ID; that flow isn't built here, since it requires your live
//      Stripe dashboard/API keys to test against.
//   3. STRIPE_SECRET_KEY set in backend/.env.
// Until all three are true, initiatePayment() falls back to the generic
// cardGateway.js flow (no split) so checkout still works — see
// payment.controller.js for that fallback logic.
// ---------------------------------------------------------------------------

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Creates a Checkout Session that, on the destination account, automatically
// keeps `applicationFeeAmount` (the platform's margin) and sends the rest to
// the vendor's connected account — Stripe does the split at settlement time,
// nothing further needs to happen on our end once the charge succeeds.
async function createSplitCheckoutSession(order, vendorStripeAccountId, vendorCostAmount, platformMarginAmount) {
  const stripe = getStripeClient();
  if (!stripe) {
    throw Object.assign(new Error('Stripe is not configured yet (missing STRIPE_SECRET_KEY).'), { status: 501 });
  }

  const totalCents = Math.round((vendorCostAmount + platformMarginAmount) * 100);
  const marginCents = Math.round(platformMarginAmount * 100);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'pkr',
          product_data: { name: `Delicious Sheri order ${order.orderNumber}` },
          unit_amount: totalCents,
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: marginCents,
      transfer_data: { destination: vendorStripeAccountId },
    },
    success_url: `${process.env.CUSTOMER_URL}/order-tracking/${order.orderNumber}?paid=1`,
    cancel_url: `${process.env.CUSTOMER_URL}/checkout?cancelled=1`,
    metadata: { orderNumber: order.orderNumber },
  });

  return { redirectUrl: session.url, paymentRef: session.id };
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  const stripe = getStripeClient();
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return null;
  try {
    return stripe.webhooks.constructEvent(rawBody, signatureHeader, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = { getStripeClient, createSplitCheckoutSession, verifyWebhookSignature };
