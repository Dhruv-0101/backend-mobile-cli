const userController = require("../../controllers/userController");
const isAuthenticated = require("../../middleware/isAuthenticated");
const profileimageupload = require("../../config/ProfileImageConfig");

const UserRouter = require("express").Router();

UserRouter.post("/create-user", userController.registerUserCtrl);
UserRouter.post("/login-user", userController.login);
UserRouter.post("/auth/google-mobile", userController.googleMobileLoginCtrl);
UserRouter.get("/auth/google", userController.googleAuthMiddleware);
UserRouter.get("/auth/google/callback", userController.googleAuthCallback);
UserRouter.get("/checkAuthenticated", userController.checkAuthenticated);
UserRouter.get("/profile", isAuthenticated, userController.profile);
UserRouter.post(
  "/follow-user/:followerId",
  isAuthenticated,
  userController.followUser
);
UserRouter.post(
  "/unfollow-user/:followerId",
  isAuthenticated,
  userController.unfollowUser
);
UserRouter.get(
  "/get-user-follow/:followerId",
  isAuthenticated,
  userController.checkFollowing
);
UserRouter.post("/logout", isAuthenticated, userController.logout);
UserRouter.post("/refresh-token", userController.refreshTokenCtrl);
UserRouter.post(
  "/email-verify",
  isAuthenticated,
  userController.verifyEmailAccount
);
UserRouter.post(
  "/email-verification/:verifyToken",
  isAuthenticated,
  userController.verifyEmailAcc
);
UserRouter.post("/resetpssword-email", userController.forgotPassword);
UserRouter.post("/password-reset/:verifyToken", userController.resetPassword);
UserRouter.put(
  "/upload-profilephoto",
  profileimageupload.single("image"),
  isAuthenticated,
  userController.updateProfilePic
);
UserRouter.put("/update-email", isAuthenticated, userController.updateEmail);
UserRouter.get("/get-followers", isAuthenticated, userController.GetFollowers);
UserRouter.get(
  "/get-following",
  isAuthenticated,
  userController.getFollowingByUserId
);
UserRouter.get(
  "/get-followers-dashboard-count",
  isAuthenticated,
  userController.getFollowersCount
);
UserRouter.get(
  "/get-followings-dashboard-count",
  isAuthenticated,
  userController.getFollowingsCount
);
UserRouter.get(
  "/get-earning-dashboard",
  isAuthenticated,
  userController.userEarnings
);

//-------------------for two-step authentication---------------------//

UserRouter.post(
  "/register-passkey",
  isAuthenticated,
  userController.registerUserPasskeyCtrl
);
UserRouter.post(
  "/register-passkey-verify",
  isAuthenticated,
  userController.registerPasskeyVerifyCtrl
);
UserRouter.post(
  "/login-passkey",
  userController.loginUserPassKey
);
UserRouter.post(
  "/login-passkey-verify",
  userController.loginPassKeyVerifyCtrl
);

module.exports = UserRouter;
