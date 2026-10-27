// ---------------------------------------------------------------------------
// SMS SERVICE — DEV SIMULATOR
// ---------------------------------------------------------------------------
// No real SMS is sent by this file. Sending real SMS requires your own account
// with a provider like Twilio, Vonage, or a local Pakistani aggregator — none
// of which can be substituted by code alone (same situation as the payment
// gateways: the integration point is ready, the credentials are yours to get).
//
// In dev mode this just logs the message to the console so you can test the
// OTP/delivery-code flows end-to-end without a real SMS bill. Swap the body
// of sendSMS() for a real provider call (e.g. Twilio's client.messages.create)
// once you have credentials — nothing else in the app needs to change, since
// every caller only depends on this function's signature.
// ---------------------------------------------------------------------------

async function sendSMS(phone, message) {
  if (process.env.SMS_PROVIDER === 'twilio') {
    // Example shape once you have a Twilio account — uncomment and fill in:
    //
    // const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    // await twilio.messages.create({ to: phone, from: process.env.TWILIO_FROM_NUMBER, body: message });
    // return { simulated: false };
    throw new Error('SMS_PROVIDER=twilio is set but the Twilio call is not configured yet — see comment in smsService.js');
  }

  // --- Dev simulator (default) ---
  console.log(`\n📱 [SMS SIMULATOR] To: ${phone}\n   Message: ${message}\n`);
  return { simulated: true };
}

module.exports = { sendSMS };
