const passport = require("passport");
const db = require("../models/index");
const User = db.users;

const isAuthenticated = (req, res, next) => {
  passport.authenticate(
    "jwt",
    { session: false },
    async (error, user, info) => {
      try {
        if (error || !user) {
          return res.status(401).json({
            message: info ? info.message : "Login required, no token found",
            error: error ? error.message : undefined,
          });
        }
        // Find the user
        const foundUser = await User.findUnique({ where: { id: Number(user.id) } });
        if (!foundUser) {
          return res.status(401).json({
            message: "User not found",
          });
        }
        // Place the user in the req obj
        req.user = foundUser.id;
        console.log("User authenticated:", req.user);
        // Call next
        return next();
      } catch (err) {
        return res.status(500).json({
          message: "Internal server error",
          error: err.message,
        });
      }
    }
  )(req, res, next);
};

module.exports = isAuthenticated;
