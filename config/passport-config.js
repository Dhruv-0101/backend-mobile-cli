require("dotenv").config();

const bcrypt = require("bcrypt");
const db = require("../models/index");
const User = db.users;
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const JWTStrategy = require("passport-jwt").Strategy; //Strategy for jwt
const ExtractJWT = require("passport-jwt").ExtractJwt; //Extract for jwt
const GoogleStrategy = require("passport-google-oauth20");

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

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:8080/api/v1/users/auth/google/callback",
      scope: ["profile", "email"],
    },
    async (accessToken, refreshToken, profile, done) => {
      console.log(profile);
      try {
        // Check if user found
        let user = await User.findFirst({ where: { googleId: profile.id } });

        // Extract email from the profile
        let email = "";
        if (Array.isArray(profile.emails) && profile.emails.length > 0) {
          email = profile.emails[0].value;
        }

        // Check if user not found
        if (!user) {
          // Create new user with email
          user = await User.create({
            data: {
              username: profile.displayName,
              googleId: profile.id,
              profilePicture: profile.photos[0].value, // Access profile picture
              authMethod: "google",
              email: email, // Save the email address
            }
          });
        }

        done(null, user);
      } catch (error) {
        done(error, null);
      }
    }
  )
);

module.exports = passport;
