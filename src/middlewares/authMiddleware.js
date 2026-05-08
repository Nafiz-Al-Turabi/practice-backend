const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const error = new Error("Authorization token is missing");
      error.statusCode = 401;
      throw error;
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 401;
      error.message = "Invalid or expired token";
    }
    next(error);
  }
};

module.exports = protect;
