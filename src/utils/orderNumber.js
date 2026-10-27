const { nanoid } = require('nanoid');

// Human-friendly, unique order number e.g. DS-73F9K2A1
function generateOrderNumber() {
  return `DS-${nanoid(8).toUpperCase()}`;
}

module.exports = { generateOrderNumber };
