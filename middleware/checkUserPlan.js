const db = require("../models/index");
const asyncHandler = require("express-async-handler");

const User = db.users;
const checkUserPlan = asyncHandler(async (req, res, next) => {
  // Get the user by id
  const user = await User.findUnique({ where: { id: Number(req.user) } });

  if (!user || !user.hasSelectedPlan) {
    return res.status(401).json({
      message: "You must select a plan before creating a post",
    });
  }

  next();
});

module.exports = checkUserPlan;
