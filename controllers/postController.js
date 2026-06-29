const asyncHandler = require("express-async-handler");
const db = require("../models/index");
const sendNotification = require("../utils/sendNotification");

const Post = db.posts;
const Category = db.categories;
const User = db.users;
const Comment = db.comments;
const LikeDisLike = db.likedislike;
const PostViewer = db.postviewers;
const Notification = db.notifications;
const FolloUnFollow = db.followunfollow;

const createPost = asyncHandler(async (req, res) => {
  const { description, category } = req.body;

  // Find the category
  const categoryFound = await Category.findUnique({
    where: { id: Number(category) },
  });
  if (!categoryFound) {
    throw new Error("Category not found");
  }

  // Find the user
  const userFound = await User.findUnique({
    where: { id: Number(req.user) },
  });
  if (!userFound) {
    throw new Error("User not found");
  }

  // Create the post
  const postCreated = await Post.create({
    data: {
      description,
      image: req?.file?.path,
      userId: Number(req.user),
      categoryId: Number(category),
    },
  });

  // Find all follower entries from the followunfollow table where the userId matches the current user (being followed)
  const followerEntries = await FolloUnFollow.findMany({
    where: { userId: Number(req.user) },
  });
  
  // Extract follower IDs
  const followerIds = followerEntries.map((entry) => entry.followerId).filter(Boolean);

  // Find all users who are followers
  const followers = await User.findMany({
    where: {
      id: { in: followerIds },
    },
  });

  // Send notifications to each follower and create a notification entry
  for (const follower of followers) {
    if (follower.email) {
      await sendNotification(follower.email, postCreated.id);
    }

    // Create a notification for each follower
    await Notification.create({
      data: {
        userId: follower.id,
        postId: postCreated.id,
        message: `📢 New post created by ${userFound.username}. <a href="http://localhost:5173/posts/${postCreated.id}" target="_blank" style="color: blue; text-decoration: underline;">View post</a>`,
      },
    });
  }

  res.json({
    status: "success",
    message: "Post created successfully and notifications sent to followers",
    postCreated,
  });
});

const fetchAllPosts = asyncHandler(async (req, res) => {
  const { category, title, page = 1, limit = 10 } = req.query;

  let where = {};
  if (category) {
    where.categoryId = Number(category);
  }
  if (title) {
    where.description = { contains: title, mode: "insensitive" };
  }

  const limitNum = Number(limit);
  const skipNum = (Number(page) - 1) * limitNum;

  // Query posts with pagination and filtering
  const posts = await Post.findMany({
    where,
    include: {
      category: {
        include: {
          user: {
            select: {
              username: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limitNum,
    skip: skipNum,
  });

  const count = await Post.count({ where });

  // Calculate pagination metadata
  const totalPages = Math.ceil(count / limitNum);

  res.json({
    status: "success",
    message: "Posts fetched successfully",
    posts,
    currentPage: Number(page),
    perPage: limitNum,
    totalPages,
  });
});

const getPost = asyncHandler(async (req, res) => {
  const postId = req.params.postId;
  const userId = req.user;

  const postFound = await Post.findUnique({
    where: { id: Number(postId) },
    include: {
      user: {
        select: {
          username: true,
        },
      },
    },
  });

  if (!postFound) {
    throw new Error("Post not found");
  }

  const viewerExists = await PostViewer.findFirst({
    where: {
      userId: Number(userId),
      postId: Number(postId),
    },
  });

  if (!viewerExists) {
    await PostViewer.create({
      data: {
        userId: Number(userId),
        postId: Number(postId),
      },
    });
  }

  const comments = await Comment.findMany({
    where: { postId: Number(postId) },
    include: {
      user: {
        select: {
          username: true,
        },
      },
    },
  });

  // Unique viewers count
  const viewers = await PostViewer.findMany({
    where: { postId: Number(postId) },
    select: { userId: true },
    distinct: ["userId"],
  });
  const viewersCount = viewers.length;

  res.json({
    status: "success",
    message: "Post fetched successfully",
    postFound,
    comments,
    viewersCount,
  });
});

const updatePostController = asyncHandler(async (req, res) => {
  const postId = req.params.postId;
  const { description, category } = req.body;

  // Check if the post exists and belongs to the user
  const post = await Post.findFirst({
    where: { id: Number(postId), userId: Number(req.user) },
  });
  if (!post) {
    res.status(404);
    throw new Error("Post not found or user not authorized to update this post");
  }

  const updateData = {};

  // If a category is provided, check if it exists
  if (category) {
    const categoryFound = await Category.findUnique({
      where: { id: Number(category) },
    });
    if (!categoryFound) {
      res.status(404);
      throw new Error("Category not found");
    }
    updateData.categoryId = Number(category);
  }

  if (req?.file?.path) {
    updateData.image = req.file.path;
  }
  if (description) {
    updateData.description = description;
  }

  const updatedPost = await Post.update({
    where: { id: post.id },
    data: updateData,
  });

  res.json({
    status: "success",
    message: "Post updated successfully",
    post: updatedPost,
  });
});

const deletePost = asyncHandler(async (req, res) => {
  const postId = req.params.postId;

  const postFound = await Post.findUnique({
    where: { id: Number(postId) },
  });

  if (!postFound) {
    return res.status(404).json({
      status: "error",
      message: "Post not found",
    });
  }

  await Post.delete({
    where: { id: Number(postId) },
  });

  res.json({
    status: "success",
    message: "Post deleted successfully",
  });
});

const likePost = asyncHandler(async (req, res) => {
  const userId = req.user;
  const postId = req.params.postId;

  // Check if there is an existing like for the user and post
  let existingLike = await LikeDisLike.findFirst({
    where: { userId: Number(userId), postId: Number(postId) },
  });

  // If there is an existing like, return success message
  if (existingLike && existingLike.liked) {
    const likeCount = await LikeDisLike.count({
      where: { postId: Number(postId), liked: true },
    });
    return res
      .status(400)
      .json({ likeCount: likeCount, message: "User already liked the post" });
  }

  // If no existing like found, create a new entry with 'liked' set to true
  if (!existingLike) {
    existingLike = await LikeDisLike.create({
      data: {
        userId: Number(userId),
        postId: Number(postId),
        liked: true,
      },
    });
  } else {
    // Update the existing entry to set 'liked' to true
    existingLike = await LikeDisLike.update({
      where: { id: existingLike.id },
      data: { liked: true },
    });
  }

  // Count the number of likes after creating or updating the like entry
  const likeCount = await LikeDisLike.count({
    where: { postId: Number(postId), liked: true },
  });

  res.status(201).json({
    likeCount: likeCount,
    message: "Post liked successfully",
  });
});

const dislikePost = asyncHandler(async (req, res) => {
  const userId = req.user;
  const postId = req.params.postId;

  // Check if there is an existing dislike for the user and post
  let existingDislike = await LikeDisLike.findFirst({
    where: { userId: Number(userId), postId: Number(postId) },
  });

  // If there is an existing dislike, return success message
  if (existingDislike && !existingDislike.liked) {
    const dislikeCount = await LikeDisLike.count({
      where: { postId: Number(postId), liked: false },
    });
    return res.status(400).json({
      dislikeCount: dislikeCount,
      message: "User already disliked the post",
    });
  }

  // If no existing dislike found, create a new entry with 'liked' set to false
  if (!existingDislike) {
    existingDislike = await LikeDisLike.create({
      data: {
        userId: Number(userId),
        postId: Number(postId),
        liked: false,
      },
    });
  } else {
    // Update the existing entry to set 'liked' to false
    existingDislike = await LikeDisLike.update({
      where: { id: existingDislike.id },
      data: { liked: false },
    });
  }

  // Count the number of dislikes after creating or updating the dislike entry
  const dislikeCount = await LikeDisLike.count({
    where: { postId: Number(postId), liked: false },
  });

  res.status(201).json({
    dislikeCount: dislikeCount,
    message: "Post disliked successfully",
  });
});

const getLikesCount = asyncHandler(async (req, res) => {
  const postId = req.params.postId;

  const likesCount = await LikeDisLike.count({
    where: { postId: Number(postId), liked: true },
  });

  res.status(200).json({
    likesCount: likesCount,
    message: "Likes count fetched successfully",
  });
});

const GetDisLikeCount = asyncHandler(async (req, res) => {
  const postId = req.params.postId;

  const dislikesCount = await LikeDisLike.count({
    where: { postId: Number(postId), liked: false },
  });

  res.status(200).json({
    dislikesCount: dislikesCount,
    message: "Likes count fetched successfully",
  });
});

const getUserPostsController = async (req, res) => {
  const userId = req.user;

  try {
    // Get the start date of the current month and the first date of the upcoming month
    const currentMonthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    );
    const upcomingMonthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      1
    );

    // Retrieve all posts belonging to the user
    const userPosts = await Post.findMany({
      where: { userId: Number(userId) },
    });

    if (!userPosts || userPosts.length === 0) {
      return res
        .status(404)
        .json({ message: "User not found or user has no posts" });
    }

    const responseData = [];

    // Iterate over each post
    for (const post of userPosts) {
      // Find all views for the post within the current month
      const viewsThisMonth = await PostViewer.findMany({
        where: {
          postId: post.id,
          createdAt: {
            gte: currentMonthStart,
            lt: upcomingMonthStart,
          },
        },
      });

      // Calculate the total views count for the current month
      const viewsCount = viewsThisMonth.length;

      // Calculate monthly earnings based on the views count
      const earningPerView = 0.01; // Example earning rate
      const monthlyEarnings = viewsCount * earningPerView;

      let postTotalEarnings = post.totalEarnings;
      // Check if today is the first day of the upcoming month
      const today = new Date();
      if (
        today.getDate() === upcomingMonthStart.getDate() &&
        today.getMonth() === upcomingMonthStart.getMonth() &&
        today.getFullYear() === upcomingMonthStart.getFullYear()
      ) {
        postTotalEarnings = post.totalEarnings + monthlyEarnings;
      }

      // Update the post with the calculated earnings for the current month
      const updatedPost = await Post.update({
        where: { id: post.id },
        data: {
          thisMonthEarnings: monthlyEarnings,
          viewsCount: post.viewsCount + viewsCount,
          lastCalculatedViewsCount: viewsCount,
          totalEarnings: postTotalEarnings,
        },
      });

      // Collect data for the report
      responseData.push({
        postId: post.id,
        totalViewsCount: viewsCount,
        monthlyEarnings,
        totalEarnings: postTotalEarnings,
      });

      console.log(`Earnings calculated for post ID ${post.id}`);
    }

    console.log(`Earnings calculation completed for user ID: ${userId}`);

    const freshUserPosts = await Post.findMany({
      where: { userId: Number(userId) },
    });

    // Return both user posts
    return res.status(200).json({
      userPosts: freshUserPosts,
    });
  } catch (error) {
    console.error("Error calculating earnings:", error);
    return res.status(500).json({ message: "Error calculating earnings" });
  }
};

const getTotalPostViews = asyncHandler(async (req, res) => {
  const userId = req.user;

  // Find all posts for the user
  const userPosts = await Post.findMany({
    where: { userId: Number(userId) },
  });

  if (!userPosts || userPosts.length === 0) {
    return res
      .status(404)
      .json({ message: "User not found or user has no posts" });
  }

  let totalUserViews = 0;

  // Iterate over each post to count views
  for (const post of userPosts) {
    const postViewsCount = await PostViewer.count({
      where: { postId: post.id },
    });
    totalUserViews += postViewsCount;
  }

  return res.status(200).json({ totalUserViews });
});

const getUserPostsCount = asyncHandler(async (req, res) => {
  const userId = req.user;

  // Count posts for the given user
  const postsCount = await Post.count({
    where: { userId: Number(userId) },
  });

  return res.status(200).json({ postsCount });
});

const getUserPostLikes = asyncHandler(async (req, res) => {
  const userId = req.user;

  // Find all posts for the user
  const userPosts = await Post.findMany({
    where: { userId: Number(userId) },
  });

  if (!userPosts || userPosts.length === 0) {
    return res
      .status(404)
      .json({ message: "User not found or user has no posts" });
  }

  let totalLikesCount = 0;

  // Iterate over each post to count likes
  for (const post of userPosts) {
    const postLikesCount = await LikeDisLike.count({
      where: { postId: post.id, liked: true },
    });
    totalLikesCount += postLikesCount;
  }

  return res.status(200).json({ totalLikesCount });
});

const getUserPostDisLikes = asyncHandler(async (req, res) => {
  const userId = req.user;

  // Find all posts for the user
  const userPosts = await Post.findMany({
    where: { userId: Number(userId) },
  });

  if (!userPosts || userPosts.length === 0) {
    return res
      .status(404)
      .json({ message: "User not found or user has no posts" });
  }

  let totalLikesCount = 0;

  for (const post of userPosts) {
    const postLikesCount = await LikeDisLike.count({
      where: { postId: post.id, liked: false },
    });
    totalLikesCount += postLikesCount;
  }

  return res.status(200).json({ totalDisLikesCount: totalLikesCount });
});

const EARNING_RATE_PER_VIEW = 0.01;

const getUserPostEarnings = asyncHandler(async (req, res) => {
  const userId = req.user;

  // Find all posts for the user
  const userPosts = await Post.findMany({
    where: { userId: Number(userId) },
  });

  if (!userPosts || userPosts.length === 0) {
    return res
      .status(404)
      .json({ message: "User not found or user has no posts" });
  }

  let totalEarnings = 0;
  const postsData = [];

  for (const post of userPosts) {
    const postViewsCount = await PostViewer.count({
      where: { postId: post.id },
    });

    const postEarnings = postViewsCount * EARNING_RATE_PER_VIEW;
    totalEarnings += postEarnings;

    postsData.push({
      postId: post.id,
      description: post.description,
      viewsCount: postViewsCount,
      earnings: postEarnings,
    });
  }

  return res.status(200).json({ totalEarnings, posts: postsData });
});

const getAllUsersEarningsAndRankings = asyncHandler(async (req, res) => {
  try {
    const users = await User.findMany();
    const usersData = [];

    for (const user of users) {
      const userPosts = await Post.findMany({
        where: { userId: user.id },
      });

      if (!userPosts || userPosts.length === 0) {
        continue;
      }

      let totalEarnings = 0;

      for (const post of userPosts) {
        const postViewsCount = await PostViewer.count({
          where: { postId: post.id },
        });

        const postEarnings = postViewsCount * EARNING_RATE_PER_VIEW;
        totalEarnings += postEarnings;
      }

      usersData.push({
        userId: user.id,
        username: user.username,
        totalEarnings: totalEarnings,
        totalPosts: userPosts.length,
        profilePicture: user.profilePicture,
      });
    }

    // Sort users based on total earnings in descending order
    usersData.sort((a, b) => b.totalEarnings - a.totalEarnings);

    // Assign ranks
    let rank = 1;
    for (let i = 0; i < usersData.length; i++) {
      if (
        i > 0 &&
        usersData[i].totalEarnings < usersData[i - 1].totalEarnings
      ) {
        rank = i + 1;
      }
      usersData[i].rank = rank;
    }

    res.json(usersData);
  } catch (error) {
    console.error("Error retrieving user earnings rankings:", error);
    res.status(500).json({ error: "An internal server error occurred" });
  }
});

const fetchUserPostsWithCommentsCount = asyncHandler(async (req, res) => {
  const userId = req.user;

  const userPosts = await Post.findMany({
    where: { userId: Number(userId) },
  });

  let totalCommentCount = 0;

  for (const post of userPosts) {
    const commentCount = await Comment.count({
      where: { postId: post.id },
    });
    totalCommentCount += commentCount;
  }

  res.status(200).json({ totalCommentCount });
});

const getNotificationsForUser = asyncHandler(async (req, res) => {
  const userId = req.user;

  const notifications = await Notification.findMany({
    where: { userId: Number(userId), isRead: false },
    orderBy: {
      createdAt: "desc",
    },
  });

  const unreadCount = await Notification.count({
    where: { userId: Number(userId), isRead: false },
  });

  res.json({
    status: "success",
    unreadCount,
    notifications,
  });
});

const updateNotificationsForUser = asyncHandler(async (req, res) => {
  const userId = req.user;
  const notificationId = req.params.notificationId;

  const updateResult = await Notification.updateMany({
    where: {
      userId: Number(userId),
      id: Number(notificationId),
    },
    data: { isRead: true },
  });

  if (updateResult.count === 0) {
    return res.status(404).json({
      status: "failure",
      message: "No notifications found to update",
    });
  }

  res.json({
    status: "success",
    message: "Notifications updated successfully",
    updatedRows: updateResult.count,
  });
});

module.exports = {
  createPost,
  fetchAllPosts,
  getPost,
  deletePost,
  likePost,
  dislikePost,
  getLikesCount,
  GetDisLikeCount,
  getUserPostsController,
  getTotalPostViews,
  getUserPostsCount,
  getUserPostLikes,
  getUserPostDisLikes,
  getUserPostEarnings,
  getAllUsersEarningsAndRankings,
  updatePostController,
  fetchUserPostsWithCommentsCount,
  getNotificationsForUser,
  updateNotificationsForUser,
};
