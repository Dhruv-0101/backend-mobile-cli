require("dotenv").config();

const bcrypt = require("bcrypt");
const db = require("../models/index");
const User = db.users;
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const JWTStrategy = require("passport-jwt").Strategy; //Strategy for jwt
const ExtractJWT = require("passport-jwt").ExtractJwt; //Extract for jwt

passport.use(
  new LocalStrategy(
    {
      usernameField: "username",
    },
    async (username, password, done) => {
      try {
        const user = await User.findFirst({ where: { username } });
        if (!user) {
          return done(null, false, { message: "Invalid login details" });
        }
        // Verify the password
        const match = await bcrypt.compare(password, user.password);
        if (match) {
          return done(null, user);
        } else {
          return done(null, false, { message: "Invalid login details" });
        }
      } catch (error) {
        return done(error);
      }
    }
  )
);

const options = {
  jwtFromRequest: ExtractJWT.fromExtractors([
    ExtractJWT.fromAuthHeaderAsBearerToken(),
    (req) => {
      let token = null;
      if (req && req.cookies) {
        token = req.cookies["token"];
      }
      return token;
    },
  ]),
  secretOrKey: process.env.JWT_SECRET,
};

// JWT Strategy
passport.use(
  new JWTStrategy(options, async (userDecoded, done) => {
    try {
      const user = await User.findUnique({ where: { id: Number(userDecoded.id) } });
      if (user) {
        return done(null, user);
      } else {
        return done(null, false);
      }
    } catch (error) {
      return done(error, false);
    }
  })
);

module.exports = passport;
