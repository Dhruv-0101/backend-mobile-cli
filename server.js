require("dotenv").config();
const cors = require("cors");

const express = require("express");
const cookieParser = require("cookie-parser");

const { globalErrhandler, notFound } = require("./middleware/globalErrhandler");
const UserRouter = require("./routes/User/userRoutes");
const CategoryRouter = require("./routes/Category/categoryRoutes");
const PostRouter = require("./routes/Post/PostRoutes");
const CommentRouter = require("./routes/Comments/CommentsRouter");
const PlanRouter = require("./routes/Plan/PlanRoutes");
const passport = require("./config/passport-config");
const bodyParser = require("body-parser");

const crypto = require("node:crypto");
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}

const app = express();

app.use(
  cors({
    origin: "http://localhost:5174",
    credentials: true,
  })
);

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

app.use(cookieParser()); // automatically parses the cookie

// routers
app.use("/api/v1/users", UserRouter);
app.use("/api/v1/category", CategoryRouter);
app.use("/api/v1/post", PostRouter);
app.use("/api/v1/comment", CommentRouter);
app.use("/api/v1/plan", PlanRouter);

app.use(notFound); // 404 handler
app.use(globalErrhandler); // Global error handler

//port
const PORT = process.env.PORT || 8080;

//server
app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});
