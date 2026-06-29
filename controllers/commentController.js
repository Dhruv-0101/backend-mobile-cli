const asyncHandler = require("express-async-handler");
const db = require("../models/index");
const Comment = db.comments;
const Post = db.posts;

const createComment = asyncHandler(async (req, res) => {
  const postId = req.params.postId;
  const { content } = req.body;
  console.log(postId);
  const post = await Post.findUnique({
    where: { id: Number(postId) },
  });
  if (!post) {
    throw new Error("Post not found");
  }

  // Create the comment
  const commentCreated = await Comment.create({
    data: {
      content,
      userId: Number(req.user),
      postId: Number(postId),
    },
  });

  // Send the response
  res.json({
    status: "success",
    message: "Comment created successfully",
    commentCreated,
  });
});

const getCommentsForPost = asyncHandler(async (req, res) => {
  const postId = req.params.postId;

  const comments = await Comment.findMany({
    where: { postId: Number(postId) },
    include: {
      user: {
        select: {
          username: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const formattedComments = comments.map((c) => ({
    id: c.id,
    content: c.content,
    userId: c.userId,
    postId: c.postId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    user: c.user,
  }));

  res.json({
    status: "success",
    message: "Comments fetched successfully",
    comments: formattedComments,
  });
});

module.exports = { createComment, getCommentsForPost };
