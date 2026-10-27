const crypto = require('crypto');

// 4-digit delivery security code — customer gives this to the rider at the door.
function generateDeliveryCode() {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

// 6-digit OTP for the rider password-reset flow.
function generateOTP() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

module.exports = { generateDeliveryCode, generateOTP };
