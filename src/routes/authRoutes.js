const express = require("express");

const protect = require("../middlewares/authMiddleware");
const { register, login, me } = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, me);

module.exports = router;
