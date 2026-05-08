const express = require('express');
const cors = require('cors');

const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy'
  });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;