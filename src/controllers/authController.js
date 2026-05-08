const { registerUser, loginUser, getCurrentUser } = require("../services/authService");
const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const result = await registerUser(username, email, password);
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    res.status(200).json({
      success: true,
      message: "User logged in successfully",
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await getCurrentUser(req.user.id);
    res.status(200).json({
      success: true,
      message: "Current user fetched successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  me,
};
