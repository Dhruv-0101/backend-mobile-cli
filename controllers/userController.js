require("dotenv").config();
const db = require("../models/index");
const User = db.users;
const Post = db.posts;
const FollowUnfollow = db.followunfollow;
const Challenge = db.challenges;

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const crypto = require("crypto");
const passport = require("passport");

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const sendAccVerificationEmail = require("../utils/sendAccVerificationEmail");
const sendPasswordEmail = require("../utils/sendPasswordEmail");
const {
  generateAccVerificationToken,
  generatePasswordResetToken,
} = require("../utils/tokenHelpers");

const registerUserCtrl = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  // Check if username or email already exist
  const userFound = await User.findFirst({ where: { username } });
  if (userFound) {
    throw new Error("User already exists");
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Register the user
  const userRegistered = await User.create({
    data: {
      username,
      email,
      password: hashedPassword,
    },
  });

  // Send the response
  res.status(201).json({
    status: "success",
    message: "User registered successfully",
    userRegistered,
  });
});

const login = asyncHandler(async (req, res, next) => {
  passport.authenticate("local", async (err, user, info) => {
    if (err) return next(err);

    // Check if user not found
    if (!user) {
      return res.status(401).json({ message: info.message });
    }

    // Generate token
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);

    // Update lastLogin
    await User.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Send the response with token
    res
      .cookie("token", token, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      })
      .json({
        status: "success",
        message: "Login Success",
        username: user.username,
        email: user.email,
        id: user.id,
        token: token,
      });
  })(req, res, next);
});

const googleAuthMiddleware = passport.authenticate("google", {
  scope: ["profile", "email"],
});

const googleAuthCallback = asyncHandler(async (req, res, next) => {
  passport.authenticate(
    "google",
    {
      failureRedirect: "/login",
      session: false,
    },
    async (err, user, info) => {
      try {
        if (err) return next(err);

        if (!user) {
          return res.redirect("http://localhost:5173/login?error=Google auth failed");
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
          expiresIn: "3d",
        });

        // Set the cookie
        res.cookie("token", token, {
          httpOnly: true,
          secure: false,
          sameSite: "strict",
          maxAge: 24 * 60 * 60 * 1000, // 1 day
        });

        res.redirect("http://localhost:5173/dashboard");
      } catch (error) {
        next(error);
      }
    }
  )(req, res, next);
});

const checkAuthenticated = async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ isAuthenticated: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findUnique({ where: { id: Number(decoded.id) } });

    if (!user) {
      return res.status(401).json({ isAuthenticated: false });
    }

    return res.status(200).json({
      isAuthenticated: true,
      id: user.id,
      username: user.username,
      profilePicture: user.profilePicture,
    });
  } catch (error) {
    return res.status(401).json({ isAuthenticated: false });
  }
};

const profile = async (req, res) => {
  const userId = req.user;
  const user = await User.findUnique({
    where: { id: Number(userId) },
    select: {
      id: true,
      username: true,
      profilePicture: true,
      email: true,
      googleId: true,
      authMethod: true,
      totalEarnings: true,
      nextEarningDate: true,
      isEmailVerified: true,
      hasSelectedPlan: true,
      lastLogin: true,
      isAdmin: true,
      planId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({ user });
};

const followUser = asyncHandler(async (req, res) => {
  const userId = req.user;
  const followerId = req.params.followerId;

  if (Number(userId) === Number(followerId)) {
    return res.status(400).json({ message: "You cannot follow yourself" });
  }

  // Check if already following (userId is the user being followed, followerId is the user following)
  const existingFollow = await FollowUnfollow.findFirst({
    where: {
      userId: Number(followerId),
      followerId: Number(userId),
    },
  });

  if (existingFollow) {
    return res.status(200).json({ message: "You are already following this user" });
  }

  await FollowUnfollow.create({
    data: {
      userId: Number(followerId),
      followerId: Number(userId),
    },
  });

  res.status(201).json({ message: "Followed successfully" });
});

const unfollowUser = async (req, res) => {
  const userId = req.user;
  const followerId = req.params.followerId;

  const existingFollow = await FollowUnfollow.findFirst({
    where: {
      userId: Number(followerId),
      followerId: Number(userId),
    },
  });
  if (!existingFollow) {
    return res.status(400).json({ message: "You are not following this user" });
  }

  // If the relationship exists, delete it
  await FollowUnfollow.deleteMany({
    where: {
      userId: Number(followerId),
      followerId: Number(userId),
    },
  });

  res.status(200).json({ message: "Unfollowed successfully" });
};

const isFollowing = async (userId, followerId) => {
  // Check if the follow relationship exists
  const existingFollow = await FollowUnfollow.findFirst({
    where: {
      userId: Number(followerId),
      followerId: Number(userId),
    },
  });
  return !!existingFollow;
};

const checkFollowing = async (req, res) => {
  const userId = req.user;
  const followerId = req?.params?.followerId;
  console.log(followerId);

  const isUserFollowing = await isFollowing(userId, followerId);
  res
    .status(200)
    .json({ data: userId, following: isUserFollowing, message: "success" });
};

const logout = asyncHandler(async (req, res) => {
  // Clear the token cookie
  res.cookie("token", "", { maxAge: 1 });
  res.status(200).json({ message: "Logout success" });
});

const verifyEmailAccount = asyncHandler(async (req, res) => {
  // Find the logged-in user
  const userId = req.user;
  const user = await User.findUnique({ where: { id: Number(userId) } });
  if (!user) {
    res.status(404);
    throw new Error("User not found, please login");
  }

  // Check if user email exists
  if (!user.email) {
    res.status(400);
    throw new Error("Email not found");
  }

  // Generate verification token using helper utility
  const { emailToken, hashedToken, expires } = generateAccVerificationToken();

  // Save changes to the database
  await User.update({
    where: { id: user.id },
    data: {
      accountVerificationToken: hashedToken,
      accountVerificationExpires: expires,
    },
  });

  // Send the email
  sendAccVerificationEmail(user.email, emailToken);

  res.json({
    message: `Account verification email sent to ${user.email}. Token expires in 10 minutes`,
  });
});

const verifyEmailAcc = asyncHandler(async (req, res) => {
  const userId = req.user;
  const verifyToken = req.params.verifyToken;

  // Find the user by the user ID
  const userFound = await User.findUnique({ where: { id: Number(userId) } });

  // If the user is not found, handle it gracefully
  if (!userFound) {
    return res.status(400).json({ message: "User not found" });
  }

  // If the user's email is already verified, send a success response
  if (userFound.isEmailVerified) {
    return res.json({ message: "Account already verified" });
  }

  // Convert the token to the format saved in the database
  const cryptoToken = crypto
    .createHash("sha256")
    .update(verifyToken)
    .digest("hex");

  // Check if the token matches the saved token and is not expired
  if (
    userFound.accountVerificationToken !== cryptoToken ||
    !userFound.accountVerificationExpires ||
    userFound.accountVerificationExpires < new Date()
  ) {
    return res.status(400).json({
      message: "Account verification token is invalid or has expired",
    });
  }

  // Update the user's verification status
  await User.update({
    where: { id: userFound.id },
    data: {
      isEmailVerified: true,
      accountVerificationToken: null,
      accountVerificationExpires: null,
    },
  });

  // Send a success response
  res.json({ message: "Account successfully verified" });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  // Find the user by email
  const user = await User.findFirst({ where: { email } });
  if (!user) {
    throw new Error(`User with email ${email} is not found in our database`);
  }

  // Check if user registered with a social login
  if (user.authMethod !== "local") {
    throw new Error("Please login with your social account");
  }

  // Generate a password reset token
  const { emailToken, hashedToken, expires } = generatePasswordResetToken();

  // Save the token data to user record
  await User.update({
    where: { id: user.id },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpires: expires,
    },
  });

  // Send the password reset email
  sendPasswordEmail(user.email, emailToken);

  res.json({
    message: `Password reset email sent to ${email}`,
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const verifyToken = req.params.verifyToken;
  const { password } = req.body;

  const cryptoToken = crypto
    .createHash("sha256")
    .update(verifyToken)
    .digest("hex");

  const userFound = await User.findFirst({
    where: {
      passwordResetToken: cryptoToken,
      passwordResetExpires: { gt: new Date() },
    },
  });

  if (!userFound) {
    throw new Error("Password reset token is invalid or has expired");
  }

  // Hash the new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  await User.update({
    where: { id: userFound.id },
    data: {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });

  // Send a success response
  res.json({ message: "Password successfully reset" });
});

const updateProfilePic = asyncHandler(async (req, res) => {
  const userId = req.user;

  const updateResult = await User.update({
    where: { id: Number(userId) },
    data: { profilePicture: req.file.path },
  });

  if (!updateResult) {
    throw new Error("User not found or profile picture not updated");
  }

  // Send the success response
  res.json({
    message: "Profile picture updated successfully",
  });
});

const updateEmail = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const userId = req.user;

  const user = await User.findUnique({ where: { id: Number(userId) } });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // Generate verification token using helper utility
  const { emailToken, hashedToken, expires } = generateAccVerificationToken();

  await User.update({
    where: { id: user.id },
    data: {
      email: email,
      isEmailVerified: false,
      accountVerificationToken: hashedToken,
      accountVerificationExpires: expires,
    },
  });

  // Send the verification email
  sendAccVerificationEmail(email, emailToken);

  res.json({
    message: `Account verification email sent to ${email}, token expires in 10 minutes`,
  });
});

const GetFollowers = async (req, res) => {
  const userId = req.user;

  // Find followers where followunfollows.userId equals this userId
  const followRelations = await FollowUnfollow.findMany({
    where: { userId: Number(userId) },
    include: {
      follower: {
        select: {
          id: true,
          username: true,
          email: true,
          profilePicture: true,
        },
      },
    },
  });

  const followers = followRelations.map((rel) => rel.follower).filter(Boolean);

  res.status(200).json({ followers });
};

const getFollowingByUserId = async (req, res) => {
  const userId = req.user;

  // Find following where followunfollows.followerId equals this userId
  const followRelations = await FollowUnfollow.findMany({
    where: { followerId: Number(userId) },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          profilePicture: true,
          email: true,
        },
      },
    },
  });

  const following = followRelations.map((rel) => rel.user).filter(Boolean);

  res.status(200).json({ following });
};

const getFollowersCount = asyncHandler(async (req, res) => {
  const userId = req.user;

  // Count followers for the given user (where userId matches the followed user)
  const followersCount = await FollowUnfollow.count({
    where: { userId: Number(userId) },
  });

  return res.status(200).json({ followersCount });
});

const getFollowingsCount = asyncHandler(async (req, res) => {
  const userId = req.user;

  // Count following (where followerId matches this user)
  const followersCount = await FollowUnfollow.count({
    where: { followerId: Number(userId) },
  });

  return res.status(200).json({ followersCount: followersCount });
});

const userEarnings = async (req, res) => {
  const userId = req.user;

  try {
    // Retrieve all posts belonging to the user
    const userPosts = await Post.findMany({
      where: { userId: Number(userId) },
    });

    if (!userPosts || userPosts.length === 0) {
      return res
        .status(404)
        .json({ message: "User not found or user has no posts" });
    }

    // Calculate total earnings
    const totalEarnings = userPosts.reduce(
      (accum, post) => accum + post.totalEarnings,
      0
    );

    return res.status(200).json({ totalEarnings });
  } catch (error) {
    console.error("Error calculating total earnings:", error);
    return res
      .status(500)
      .json({ message: "Error calculating total earnings" });
  }
};

//-----------------------for multiple passkey two step authentication---------------------//

const registerUserPasskeyCtrl = asyncHandler(async (req, res) => {
  const userId = req.user;

  // Check if user exists
  const user = await User.findUnique({ where: { id: Number(userId) } });
  if (!user) {
    return res.status(404).json({ error: "User not found!" });
  }

  // Generate the registration options
  const challengePayload = await generateRegistrationOptions({
    rpID: "localhost",
    rpName: "My Localhost Machine",
    attestationType: "none",
    userName: user.username,
    timeout: 30_000,
  });

  // Store the challenge in the database
  await Challenge.create({
    data: {
      userId: Number(userId),
      challenge: challengePayload.challenge,
      loginpasskey: false,
    },
  });

  return res.json({ options: challengePayload });
});

const registerPasskeyVerifyCtrl = asyncHandler(async (req, res) => {
  const userId = req.user;
  const { cred } = req.body;

  const userFound = await User.findUnique({ where: { id: Number(userId) } });
  if (!userFound) {
    throw new Error("User not found");
  }

  // Retrieve the challenge from the database
  const challenge = await Challenge.findFirst({
    where: { userId: Number(userId), loginpasskey: false },
    orderBy: { createdAt: "desc" }, // Get the most recent challenge
  });
  if (!challenge) {
    throw new Error("Challenge not found");
  }

  // Verify the registration response using the retrieved challenge
  const verificationResult = await verifyRegistrationResponse({
    expectedChallenge: challenge.challenge,
    expectedOrigin: "http://localhost:5173",
    expectedRPID: "localhost",
    response: cred,
  });

  if (!verificationResult.verified) {
    return res.json({ error: "Could not verify" });
  }

  // Update the challenge entry with the passkey data
  await Challenge.update({
    where: { id: challenge.id },
    data: {
      passkey: {
        ...verificationResult.registrationInfo,
        credentialPublicKey: Buffer.from(
          verificationResult.registrationInfo.credentialPublicKey
        ).toString("base64"), // Convert Buffer to Base64 string
      },
    },
  });

  res.json({ verified: true });
});

const loginUserPassKey = asyncHandler(async (req, res) => {
  const { username } = req.body;

  const user = await User.findFirst({ where: { username } });
  if (!user) {
    return res.status(404).json({ error: "User not found!" });
  }

  await Challenge.deleteMany({
    where: {
      passkey: null,
    },
  });

  const opts = await generateAuthenticationOptions({
    rpID: "localhost",
  });

  // Store the challenge in the database
  await Challenge.create({
    data: {
      userId: user.id,
      challenge: opts.challenge,
      loginpasskey: true,
    },
  });

  return res.json({ options: opts });
});

const loginPassKeyVerifyCtrl = asyncHandler(async (req, res) => {
  const { username, cred } = req.body;

  const user = await User.findFirst({ where: { username } });
  if (!user) {
    return res.status(404).json({ error: "User not found!" });
  }

  // Retrieve the challenge record for the user
  const challenge = await Challenge.findFirst({
    where: { userId: user.id, loginpasskey: true },
  });
  if (!challenge) {
    return res.status(404).json({ error: "Challenge data not found!" });
  }

  await Challenge.deleteMany({
    where: {
      passkey: null,
    },
  });

  // Retrieve all stored passkeys for the user
  const passkeys = await Challenge.findMany({
    where: { userId: user.id, loginpasskey: false },
  });
  if (!passkeys || passkeys.length === 0) {
    return res.status(404).json({ error: "Passkey data not found!" });
  }

  let verified = false;

  for (const challengepasskey of passkeys) {
    const passkey = challengepasskey.passkey;
    passkey.credentialPublicKey = Buffer.from(
      passkey.credentialPublicKey,
      "base64"
    );

    const result = await verifyAuthenticationResponse({
      expectedChallenge: challenge.challenge,
      expectedOrigin: "http://localhost:5173",
      expectedRPID: "localhost",
      response: cred,
      authenticator: {
        credentialID: passkey.credentialID,
        credentialPublicKey: passkey.credentialPublicKey,
        counter: passkey.counter,
      },
    });
    console.log(result);

    if (result.verified) {
      verified = true;
    }
  }
  console.log(verified);

  if (!verified) {
    return res.json({ error: "Authentication verification failed" });
  } else {
    await Challenge.deleteMany({
      where: { userId: user.id, loginpasskey: true, id: challenge.id },
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "3d",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    res.json({ success: true });
  }
});

module.exports = {
  registerUserCtrl,
  login,
  googleAuthMiddleware,
  googleAuthCallback,
  checkAuthenticated,
  profile,
  followUser,
  unfollowUser,
  checkFollowing,
  logout,
  verifyEmailAccount,
  verifyEmailAcc,
  forgotPassword,
  resetPassword,
  updateProfilePic,
  updateEmail,
  GetFollowers,
  getFollowingByUserId,
  getFollowersCount,
  getFollowingsCount,
  userEarnings,
  registerUserPasskeyCtrl,
  registerPasskeyVerifyCtrl,
  loginUserPassKey,
  loginPassKeyVerifyCtrl,
};
