/**
 * Prisma MongoDB IDs are ObjectId strings. Never coerce them with Number()/parseInt —
 * that yields NaN and every lookup silently fails.
 */
function asId(value) {
  if (value == null || value === '') return value;
  return String(value);
}

function asIdList(values) {
  if (!Array.isArray(values)) return [];
  return values.map(asId).filter(Boolean);
}

module.exports = { asId, asIdList };
