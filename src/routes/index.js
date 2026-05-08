const express = require('express');

const { getRoot } = require('../controllers/healthController');
const authRoutes = require('./authRoutes');

const router = express.Router();

router.get('/', getRoot);
router.use('/auth', authRoutes);

module.exports = router;