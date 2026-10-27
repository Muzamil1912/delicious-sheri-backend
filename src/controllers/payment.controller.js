const prisma = require('../utils/db');
const cardGateway = require('../services/payments/cardGateway');
const jazzcash = require('../services/payments/jazzcash');
const easypaisa = require('../services/payments/easypaisa');
const sadapay = require('../services/payments/sadapay');
const { tryAutoAssign } = require('../utils/autoAssign');
const { trySplitPayment } = require('./thirdPartyOrder.controller');

// Kicks off payment for an already-created (pending) order.
// Frontend calls this right after createOrder, then follows the returned
// redirectUrl (card / SadaPay) or auto-submits the returned form fields (JazzCash / EasyPaisa).
async function initiatePayment(req, res, next) {
  try {
    const { orderNumber } = req.body;
    const order = await prisma.order.findUnique({ where: { orderNumber } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentStatus === 'paid') return res.status(400).json({ error: 'Order is already paid.' });

    let result;
    switch (order.paymentMethod) {
      case 'visa':
      case 'mastercard':
      case 'debit_card':
        result = await cardGateway.createCheckoutSession(order);
        return res.json({ type: 'redirect', ...result });

      case 'jazzcash':
        result = jazzcash.createPaymentRequest(order);
        return res.json({ type: 'form_post', ...result });

      case 'easypaisa':
        result = easypaisa.createPaymentRequest(order);
        return res.json({ type: 'form_post', ...result });

      case 'sadapay':
        result = await sadapay.createPaymentIntent(order);
        return res.json({ type: 'redirect', ...result });

      case 'paypal':
      case 'payoneer':
        // Same hosted-checkout-redirect shape as the card gateway — swap in
        // the real PayPal/Payoneer SDK call here once you have credentials.
        return res.status(501).json({ error: `${order.paymentMethod} isn't wired to a real processor yet — add credentials in cardGateway.js's pattern.` });

      case 'bitcoin':
        // No redirect here — the customer submits a TxHash via POST /api/crypto/submit
        // instead, and the order stays "pending" until the admin manually verifies
        // and approves it (see crypto.controller.js).
        return res.json({ type: 'crypto', message: 'Submit your transaction hash to complete this order.' });

      case 'cod':
        return res.json({ type: 'cod', message: 'Cash on delivery — no online payment needed.' });

      default:
        return res.status(400).json({ error: 'Unsupported payment method.' });
    }
  } catch (err) {
    next(err);
  }
}

// Webhook/callback endpoints — one per gateway, since each has its own payload shape.
// These update order.paymentStatus once the gateway confirms success/failure, and
// trigger auto-assign (if that mode is on) the instant a payment actually succeeds.

async function jazzcashCallback(req, res, next) {
  try {
    const { isValid, isSuccess, orderNumber } = jazzcash.verifyCallback(req.body);
    if (!isValid) return res.status(400).json({ error: 'Invalid signature.' });

    const order = await prisma.order.update({
      where: { orderNumber },
      data: {
        paymentStatus: isSuccess ? 'paid' : 'failed',
        paymentRef: req.body.pp_RetreivalReferenceNo || null,
      },
    });
    if (isSuccess) { tryAutoAssign(order.id).catch(() => {}); trySplitPayment(order.id).catch(() => {}); }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function easypaisaCallback(req, res, next) {
  try {
    const { isValid, isSuccess, orderNumber } = easypaisa.verifyCallback(req.body);
    if (!isValid) return res.status(400).json({ error: 'Invalid signature.' });

    const order = await prisma.order.update({
      where: { orderNumber },
      data: { paymentStatus: isSuccess ? 'paid' : 'failed' },
    });
    if (isSuccess) { tryAutoAssign(order.id).catch(() => {}); trySplitPayment(order.id).catch(() => {}); }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function cardWebhook(req, res, next) {
  try {
    const signature = req.headers['x-gateway-signature'];
    const isValid = cardGateway.verifyWebhookSignature(req.rawBody, signature);
    if (!isValid) return res.status(400).json({ error: 'Invalid signature.' });

    const { metadata, status } = req.body;
    const order = await prisma.order.update({
      where: { orderNumber: metadata.orderNumber },
      data: { paymentStatus: status === 'succeeded' ? 'paid' : 'failed' },
    });
    if (status === 'succeeded') { tryAutoAssign(order.id).catch(() => {}); trySplitPayment(order.id).catch(() => {}); }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function sadapayWebhook(req, res, next) {
  try {
    const signature = req.headers['x-sadapay-signature'];
    const isValid = sadapay.verifyWebhookSignature(req.rawBody, signature);
    if (!isValid) return res.status(400).json({ error: 'Invalid signature.' });

    const { reference, status } = req.body;
    const order = await prisma.order.update({
      where: { orderNumber: reference },
      data: { paymentStatus: status === 'paid' ? 'paid' : 'failed' },
    });
    if (status === 'paid') { tryAutoAssign(order.id).catch(() => {}); trySplitPayment(order.id).catch(() => {}); }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { initiatePayment, jazzcashCallback, easypaisaCallback, cardWebhook, sadapayWebhook };
