const crypto = require("crypto");

function generateAccVerificationToken() {
  const emailToken = crypto.randomBytes(20).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(emailToken)
    .digest("hex");
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes (matching original design)
  return { emailToken, hashedToken, expires };
}

function generatePasswordResetToken() {
  const emailToken = crypto.randomBytes(20).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(emailToken)
    .digest("hex");
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes (matching original design)
  return { emailToken, hashedToken, expires };
}

module.exports = {
  generateAccVerificationToken,
  generatePasswordResetToken,
};
