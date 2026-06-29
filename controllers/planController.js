const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const asyncHandler = require("express-async-handler");
const db = require("../models/index");
const Plan = db.plans;
const Payment = db.payments;
const User = db.users;

const createPlan = asyncHandler(async (req, res) => {
  const userId = req.user;
  const { planName, features, price } = req.body;

  const planFound = await Plan.findFirst({ where: { planName } });
  if (planFound) {
    throw new Error("Plan already exists");
  }

  const planCount = await Plan.count();
  if (planCount >= 2) {
    throw new Error("You cannot add more than two plans");
  }

  const planCreated = await Plan.create({
    data: {
      planName,
      features: features.split(","),
      price: parseFloat(price),
      userId: Number(userId),
    },
  });

  // Send the response
  res.json({
    status: "success",
    message: "Plan created successfully",
    planCreated,
  });
});

const listPlans = asyncHandler(async (req, res) => {
  const plans = await Plan.findMany();
  res.json({
    status: "success",
    message: "Plans fetched successfully",
    plans: plans,
  });
});

const createPayment = async (userId, planId) => {
  const plan = await Plan.findUnique({ where: { id: Number(planId) } });
  if (!plan) throw new Error("Plan not found");

  // Calculate the expiration date
  const expirationDate = new Date();
  expirationDate.setMonth(expirationDate.getMonth() + 1);

  // Create a payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: plan.price * 100,
    currency: "usd",
    description: "for blogy project",
    shipping: {
      name: "Dummy",
      address: {
        line1: "510 Townsend St",
        postal_code: "98140",
        city: "San Francisco",
        state: "CA",
        country: "US",
      },
    },
    metadata: { userId: String(userId), planId: String(planId) },
  });

  // Save payment details to the database
  const payment = await Payment.create({
    data: {
      userId: Number(userId),
      reference: paymentIntent.id,
      currency: "usd",
      status: "pending",
      planId: Number(planId),
      amount: plan.price,
      expirationDate,
    },
  });

  return { clientSecret: paymentIntent.client_secret, payment };
};

const createPaymentController = async (req, res) => {
  const userId = req.user;
  const planId = req.params.planId;

  if (!userId || !planId) {
    return res.status(400).json({ message: "userId and planId are required" });
  }

  const { clientSecret, payment } = await createPayment(userId, planId);

  return res.status(200).json({ clientSecret, payment });
};

const verifyPaymentController = asyncHandler(async (req, res) => {
  const paymentId = req.params.paymentId;
  console.log(paymentId);

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentId);
  console.log(paymentIntent);

  if (paymentIntent.status === "succeeded") {
    // Get the data from the metadata
    const metadata = paymentIntent?.metadata;
    console.log(metadata);
    const planId = metadata?.planId;
    console.log(planId);
    const userId = metadata?.userId;
    console.log(userId);
    // Find the user
    const userFound = await User.findUnique({ where: { id: Number(userId) } });
    if (!userFound) {
      return res.status(404).json({ message: "User not found" });
    }
    console.log(userFound);

    // Get the payment details
    const amount = paymentIntent?.amount / 100;
    const currency = paymentIntent?.currency;

    // Update the existing payment record or create if not exists
    let payment = await Payment.findFirst({ where: { reference: paymentId } });
    if (!payment) {
      payment = await Payment.create({
        data: {
          userId: Number(userId),
          planId: Number(planId),
          status: "success",
          amount,
          currency,
          reference: paymentId,
          expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default fallback expiration
        },
      });
    } else {
      payment = await Payment.update({
        where: { id: payment.id },
        data: { status: "success" },
      });
    }

    // Update the user profile
    const updatedUser = await User.update({
      where: { id: Number(userId) },
      data: {
        hasSelectedPlan: true,
        planId: Number(planId),
      },
    });

    // Send the response
    res.json({
      status: true,
      message: "Payment verified, user updated",
      user: updatedUser,
    });
  } else {
    res.status(400).json({ message: "Payment not successful" });
  }
});

const updateUserFreePlan = asyncHandler(async (req, res) => {
  const user = await User.findUnique({ where: { id: Number(req.user) } });
  if (!user) {
    return res.status(404).json({ status: false, message: "User not found" });
  }

  await User.update({
    where: { id: Number(req.user) },
    data: { hasSelectedPlan: true },
  });

  res.json({
    status: true,
    message: "Payment verified, user updated",
  });
});

module.exports = {
  createPlan,
  listPlans,
  createPaymentController,
  verifyPaymentController,
  updateUserFreePlan,
};
