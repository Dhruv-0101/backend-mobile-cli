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
const otplib = require("otplib");
const qrcode = require("qrcode");

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

    if (user.isTwoFactorEnabled) {
      const tempToken = jwt.sign(
        { id: user.id, is2FA: true },
        process.env.JWT_SECRET,
        {
          expiresIn: "5m",
        },
      );
      return res.json({
        status: "2fa_required",
        message: "Two-factor authentication is required.",
        tempToken,
      });
    }

    // Generate access token (expires in 15 minutes) and refresh token (expires in 7 days)
    const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET + "_refresh",
      {
        expiresIn: "7d",
      },
    );

    // Update lastLogin and store refresh token
    await User.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        refreshToken: refreshToken,
      },
    });

    // Send the response with tokens
    res
      .cookie("token", accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 1 day
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      })
      .json({
        status: "success",
        message: "Login Success",
        username: user.username,
        email: user.email,
        id: user.id,
        isAdmin: user.isAdmin,
        profilePicture: user.profilePicture,
        token: accessToken,
        refreshToken: refreshToken,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        hasSelectedPlan: user.hasSelectedPlan,
        planId: user.planId,
      });
  })(req, res, next);
});

const googleMobileLoginCtrl = asyncHandler(async (req, res, next) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ message: "Google ID token is required" });
  }

  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`,
    );
    if (!response.ok) {
      return res.status(401).json({ message: "Invalid Google token" });
    }
    const payload = await response.json();

    const webClientId = process.env.GOOGLE_CLIENT_ID;
    const androidClientId =
      "42825930077-g6a62r4e3oqb9ani3p453i118o8ahf5a.apps.googleusercontent.com";
    if (payload.aud !== webClientId && payload.aud !== androidClientId) {
      return res.status(401).json({ message: "Token audience mismatch" });
    }

    let user = await User.findFirst({
      where: {
        OR: [{ googleId: payload.sub }, { email: payload.email }],
      },
    });

    if (user) {
      if (!user.googleId) {
        user = await User.update({
          where: { id: user.id },
          data: {
            googleId: payload.sub,
            authMethod: "google",
            profilePicture: user.profilePicture || payload.picture,
          },
        });
      }
    } else {
      user = await User.create({
        data: {
          username: payload.name || payload.email.split("@")[0],
          email: payload.email,
          googleId: payload.sub,
          profilePicture: payload.picture,
          authMethod: "google",
          isEmailVerified:
            payload.email_verified === "true" ||
            payload.email_verified === true,
        },
      });
    }

    if (user.isTwoFactorEnabled) {
      const tempToken = jwt.sign(
        { id: user.id, is2FA: true },
        process.env.JWT_SECRET,
        {
          expiresIn: "5m",
        },
      );
      return res.json({
        status: "2fa_required",
        message: "Two-factor authentication is required.",
        tempToken,
      });
    }

    const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET + "_refresh",
      {
        expiresIn: "7d",
      },
    );

    await User.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        refreshToken: refreshToken,
      },
    });

    res
      .cookie("token", accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({
        status: "success",
        message: "Google Login Success",
        username: user.username,
        email: user.email,
        id: user.id,
        isAdmin: user.isAdmin,
        profilePicture: user.profilePicture,
        token: accessToken,
        refreshToken: refreshToken,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        hasSelectedPlan: user.hasSelectedPlan,
        planId: user.planId,
      });
  } catch (error) {
    next(error);
  }
});

const setup2FACtrl = asyncHandler(async (req, res) => {
  const userId = req.user;

  const user = await User.findUnique({ where: { id: Number(userId) } });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const secret = otplib.generateSecret();
  const otpAuthUri = otplib.generateURI({
    issuer: "BlogMapp",
    label: user.username,
    secret,
  });
  const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUri);

  res.json({
    secret,
    qrCodeDataUrl,
  });
});

const enable2FACtrl = asyncHandler(async (req, res) => {
  const userId = req.user;
  const { secret, code } = req.body;

  if (!secret || !code) {
    return res
      .status(400)
      .json({ message: "Secret and verification code are required" });
  }

  const isValid = await otplib.verify({ token: code, secret });
  if (!isValid) {
    return res
      .status(400)
      .json({ message: "Invalid verification code. Please try again." });
  }

  await User.update({
    where: { id: Number(userId) },
    data: {
      twoFactorSecret: secret,
      isTwoFactorEnabled: true,
    },
  });

  res.json({
    status: "success",
    message: "Two-Factor Authentication has been successfully enabled!",
  });
});

const disable2FACtrl = asyncHandler(async (req, res) => {
  const userId = req.user;
  const { code } = req.body;

  const user = await User.findUnique({ where: { id: Number(userId) } });
  if (!user || !user.isTwoFactorEnabled) {
    return res.status(400).json({ message: "2FA is not enabled" });
  }

  const isValid = await otplib.verify({
    token: code,
    secret: user.twoFactorSecret,
  });
  if (!isValid) {
    return res
      .status(400)
      .json({ message: "Invalid verification code. Please try again." });
  }

  await User.update({
    where: { id: Number(userId) },
    data: {
      twoFactorSecret: null,
      isTwoFactorEnabled: false,
    },
  });

  res.json({
    status: "success",
    message: "Two-Factor Authentication has been disabled.",
  });
});

const verify2FACtrl = asyncHandler(async (req, res) => {
  const { tempToken, code } = req.body;

  if (!tempToken || !code) {
    return res
      .status(400)
      .json({ message: "Temporary token and 2FA code are required" });
  }

  try {
    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (!decoded.is2FA) {
      return res.status(401).json({ message: "Invalid temporary token" });
    }

    const user = await User.findUnique({ where: { id: Number(decoded.id) } });
    if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({
        message: "Two-Factor authentication is not set up for this user",
      });
    }

    const isValid = await otplib.verify({
      token: code,
      secret: user.twoFactorSecret,
    });
    if (!isValid) {
      return res
        .status(400)
        .json({ message: "Invalid 2FA code. Please try again." });
    }

    const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET + "_refresh",
      {
        expiresIn: "7d",
      },
    );

    await User.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date(),
        refreshToken: refreshToken,
      },
    });

    res
      .cookie("token", accessToken, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
      })
      .cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({
        status: "success",
        message: "Login Success",
        username: user.username,
        email: user.email,
        id: user.id,
        isAdmin: user.isAdmin,
        token: accessToken,
        refreshToken: refreshToken,
        isTwoFactorEnabled: user.isTwoFactorEnabled,
        profilePicture: user.profilePicture,
        hasSelectedPlan: user.hasSelectedPlan,
        planId: user.planId,
      });
  } catch (err) {
    return res
      .status(401)
      .json({ message: "Session expired or invalid token" });
  }
});

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
      isTwoFactorEnabled: true,
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
    return res
      .status(200)
      .json({ message: "You are already following this user" });
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
  const userId = req.user;
  if (userId) {
    await User.update({
      where: { id: Number(userId) },
      data: { refreshToken: null },
    });
  }
  // Clear the token cookies
  res.cookie("token", "", { maxAge: 1 });
  res.cookie("refreshToken", "", { maxAge: 1 });
  res.status(200).json({ message: "Logout success" });
});

const refreshTokenCtrl = asyncHandler(async (req, res) => {
  let refreshToken = req.body.refreshToken || req.cookies.refreshToken;

  if (!refreshToken) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      refreshToken = authHeader.split(" ")[1];
    }
  }

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token is required" });
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_SECRET + "_refresh",
    );
    const user = await User.findUnique({ where: { id: Number(decoded.id) } });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.refreshToken !== refreshToken) {
      // Reuse detected - clear DB refresh token to invalidate all sessions
      await User.update({
        where: { id: user.id },
        data: { refreshToken: null },
      });
      return res
        .status(403)
        .json({ message: "Token reuse detected! Please log in again." });
    }

    // Generate new rotated pair
    const newAccessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    const newRefreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET + "_refresh",
      { expiresIn: "7d" },
    );

    // Store new refresh token
    await User.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    res
      .cookie("token", newAccessToken, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
      })
      .cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })
      .json({
        status: "success",
        token: newAccessToken,
        refreshToken: newRefreshToken,
      });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired refresh token",
      error: error.message,
    });
  }
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
      0,
    );

    return res.status(200).json({ totalEarnings });
  } catch (error) {
    console.error("Error calculating total earnings:", error);
    return res
      .status(500)
      .json({ message: "Error calculating total earnings" });
  }
};

module.exports = {
  registerUserCtrl,
  login,
  googleMobileLoginCtrl,
  profile,
  followUser,
  unfollowUser,
  checkFollowing,
  logout,
  refreshTokenCtrl,
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
  setup2FACtrl,
  enable2FACtrl,
  disable2FACtrl,
  verify2FACtrl,
};
