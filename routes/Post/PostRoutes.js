const PostController = require("../../controllers/postController");
const isAuthenticated = require("../../middleware/isAuthenticated");
const postimageupload = require("../../config/PostImageConfig");
const isAccountVerified = require("../../middleware/isAccountVerified");
const checkUserPlan = require("../../middleware/checkUserPlan");

const PostRouter = require("express").Router();

PostRouter.post(
  "/create-post",
  isAuthenticated,
  isAccountVerified,
  checkUserPlan,
  postimageupload.single("image"),
  PostController.createPost
);
PostRouter.get("/get-posts", PostController.fetchAllPosts);
PostRouter.get(
  "/get-single-post/:postId",
  isAuthenticated,
  PostController.getPost
);
PostRouter.put(
  "/update-single-post/:postId",
  isAuthenticated,
  postimageupload.single("image"),
  PostController.updatePostController
);
PostRouter.delete(
  "/delete-single-post/:postId",
  isAuthenticated,
  PostController.deletePost
);
PostRouter.post("/like-post/:postId", isAuthenticated, PostController.likePost);
PostRouter.post(
  "/dislike-post/:postId",
  isAuthenticated,
  PostController.dislikePost
);
PostRouter.get("/like-count/:postId", PostController.getLikesCount);
PostRouter.get("/dislike-count/:postId", PostController.GetDisLikeCount);
PostRouter.get(
  "/my-posts",
  isAuthenticated,
  PostController.getUserPostsController
);
PostRouter.get(
  "/my-posts-views",
  isAuthenticated,
  PostController.getTotalPostViews
);
PostRouter.get(
  "/my-posts-count",
  isAuthenticated,
  PostController.getUserPostsCount
);
PostRouter.get(
  "/my-posts-like",
  isAuthenticated,
  PostController.getUserPostLikes
);
PostRouter.get(
  "/my-posts-dislike",
  isAuthenticated,
  PostController.getUserPostDisLikes
);
//getUserPostEarnings
PostRouter.get(
  "/get-user-post-earnings",
  isAuthenticated,
  PostController.getUserPostEarnings
);

PostRouter.get(
  "/get-user-post-comments",
  isAuthenticated,
  PostController.fetchUserPostsWithCommentsCount
);
PostRouter.get(
  "/get-user-post-rankings",
  PostController.getAllUsersEarningsAndRankings
);
PostRouter.get(
  "/get-user-notification",
  isAuthenticated,
  PostController.getNotificationsForUser
);
PostRouter.put(
  "/update-user-notification/:notificationId",
  isAuthenticated,
  PostController.updateNotificationsForUser
);
module.exports = PostRouter;
