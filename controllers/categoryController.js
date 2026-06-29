const asyncHandler = require("express-async-handler");
const db = require("../models/index");

const Category = db.categories;

const createCategory = asyncHandler(async (req, res) => {
  const { categoryName, description } = req.body;

  const categoryFound = await Category.findFirst({
    where: { categoryName },
  });
  if (categoryFound) {
    throw new Error("Category already exists");
  }

  // Create the category
  const categoryCreated = await Category.create({
    data: {
      categoryName,
      description,
      userId: Number(req.user),
    },
  });

  res.json({
    status: "success",
    message: "Category created successfully",
    categoryCreated,
  });
});

const fetchAllCategories = asyncHandler(async (req, res) => {
  const categories = await Category.findMany();
  res.json({
    status: "success",
    message: "Categories fetched successfully",
    categories,
  });
});

const getCategory = asyncHandler(async (req, res) => {
  const categoryId = req.params.categoryId;
  const categoryFound = await Category.findUnique({
    where: { id: Number(categoryId) },
  });
  if (!categoryFound) {
    throw new Error("Category not found");
  }
  res.json({
    status: "success",
    message: "Category fetched successfully",
    categoryFound,
  });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const categoryId = req.params.categoryId;
  const categoryFound = await Category.findUnique({
    where: { id: Number(categoryId) },
  });
  if (!categoryFound) {
    throw new Error("Category not found");
  }
  await Category.delete({
    where: { id: Number(categoryId) },
  });
  res.json({
    status: "success",
    message: "Category deleted successfully",
  });
});

const updateCategory = asyncHandler(async (req, res) => {
  const categoryId = req.params.categoryId;
  const { categoryName, description } = req.body;

  let category = await Category.findUnique({
    where: { id: Number(categoryId) },
  });
  if (!category) {
    throw new Error("Category not found");
  }

  // Update the category
  category = await Category.update({
    where: { id: Number(categoryId) },
    data: {
      categoryName,
      description,
    },
  });

  res.json({
    status: "success",
    message: "Category updated successfully",
    categoryUpdated: category,
  });
});

const getCategoryPostCounts = asyncHandler(async (req, res) => {
  try {
    // Find all categories with post counts
    const categories = await Category.findMany({
      include: {
        _count: {
          select: { posts: true },
        },
      },
    });

    const formattedCategories = categories.map((cat) => ({
      id: cat.id,
      categoryName: cat.categoryName,
      description: cat.description,
      userId: cat.userId,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
      postCount: cat._count.posts,
    }));

    return res.status(200).json({ categories: formattedCategories });
  } catch (error) {
    console.error("Error fetching categories post counts:", error);
    return res
      .status(500)
      .json({ message: "Error fetching categories post counts" });
  }
});

module.exports = {
  createCategory,
  fetchAllCategories,
  getCategory,
  deleteCategory,
  updateCategory,
  getCategoryPostCounts,
};
