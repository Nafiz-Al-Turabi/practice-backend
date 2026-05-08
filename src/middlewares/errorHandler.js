function notFound(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`
  });
}

function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: error.message || 'Internal server error'
  });
}

module.exports = {
  notFound,
  errorHandler
};