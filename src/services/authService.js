const bcrypt = require("bcrypt");
const { prisma } = require("../config/prisma");
const generateToken = require("../utils/generateToken");

const registerUser = async (username, email, password) => {
  if (!username || !email || !password) {
    const error = new Error("All fields are required");
    error.statusCode = 400;
    throw error;
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
  });

  if (existingUser) {
    const error = new Error("User with this email or username already exists");
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      email,
      type: "user",
      passwordHash: hashedPassword,
    },
  });

  const token = generateToken(user);
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      createAt: user.createdAt,
    },
    token,
  };
};

const loginUser = async (email, password) => {
  if (!email || !password) {
    const error = new Error("Email and password are required");
    error.statusCode = 400;
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  const isPasswordValid = user && (await bcrypt.compare(password, user.passwordHash));

  if (!isPasswordValid) {
    const error = new Error("password is incorrect");
    error.statusCode = 401;
    throw error;
  }

  const token = generateToken(user);
  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
    },
    token,
  };
};

const getCurrentUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      createdAt: true,
    },
  });
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }
  return user;
};

module.exports = {
  registerUser,
  loginUser,
  getCurrentUser,
};
