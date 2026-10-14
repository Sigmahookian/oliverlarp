const { timingSafeEqual } = require("node:crypto");

function hasValidBearerToken(header, expectedToken) {
  if (!expectedToken || typeof header !== "string") return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const supplied = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

module.exports = { hasValidBearerToken };
