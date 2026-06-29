const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const db = {
  prisma,
  users: prisma.user,
  categories: prisma.category,
  posts: prisma.post,
  comments: prisma.comment,
  plans: prisma.plan,
  postviewers: prisma.postViewer,
  likedislike: prisma.likeDislike,
  followunfollow: prisma.followUnfollow,
  payments: prisma.payment,
  notifications: prisma.notification,
  challenges: prisma.challenge,
};

module.exports = db;
