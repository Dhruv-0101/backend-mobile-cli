const commentController = require("../../controllers/commentController");
const isAuthenticated = require("../../middleware/isAuthenticated");

const CommentRouter = require("express").Router();

CommentRouter.post(
  "/create-comment/:postId",
  isAuthenticated,
  commentController.createComment
);
CommentRouter.get(
  "/get-comments/:postId",
  isAuthenticated,
  commentController.getCommentsForPost
);

module.exports = CommentRouter;
