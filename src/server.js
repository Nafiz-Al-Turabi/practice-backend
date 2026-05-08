require('dotenv').config();

const app = require('./app');
const { connectPrisma } = require('./config/prisma');

const port = process.env.PORT || 5000;

async function startServer() {
  await connectPrisma();

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});