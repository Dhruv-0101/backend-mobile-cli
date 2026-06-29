const db = require("../models/index");
const asyncHandler = require("express-async-handler");
const User = db.users;

const isAccountVerified = asyncHandler(async (req, res, next) => {
  const userId = req.user;
  const user = await User.findUnique({ where: { id: Number(userId) } });

  if (!user || !user.isEmailVerified) {
    return res.status(401).json({
      message: "Action denied, email not verified",
    });
  }
  next();
});
module.exports = isAccountVerified;
