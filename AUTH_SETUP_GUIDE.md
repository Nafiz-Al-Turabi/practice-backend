# User Registration and Login

This file contains the actual code you should add for first-time authentication in this project.

Use it file by file.

## 1. Install Packages

Run:

```bash
npm install bcrypt jsonwebtoken
```

## 2. Update Environment Variables

File: [.env.example](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/.env.example:1>)

Replace it with:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:password@localhost:5432/chat_server
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=7d
```

File: [.env](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/.env:1>)

Add:

```env
JWT_SECRET=your_real_secret_key
JWT_EXPIRES_IN=7d
```

## 3. Update Prisma Schema

File: [schema.prisma](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/prisma/schema.prisma:1>)

Replace it with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Message {
  id        Int      @id @default(autoincrement())
  text      String
  userId    Int
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}

model User {
  id           Int       @id @default(autoincrement())
  username     String    @unique
  email        String    @unique
  passwordHash String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  messages     Message[]
}
```

Then run:

```bash
npx prisma migrate dev --name add_auth_fields
npx prisma generate
```

## 4. Create Token Utility

Create file: `src/utils/generateToken.js`

Code:

```js
const jwt = require('jsonwebtoken');

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
  );
}

module.exports = generateToken;
```

## 5. Create Auth Service

Create folder if missing:

- `src/services`

Create file: `src/services/authService.js`

Code:

```js
const bcrypt = require('bcrypt');

const { prisma } = require('../config/prisma');
const generateToken = require('../utils/generateToken');

async function registerUser({ username, email, password }) {
  if (!username || !email || !password) {
    const error = new Error('Username, email, and password are required');
    error.statusCode = 400;
    throw error;
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }]
    }
  });

  if (existingUser) {
    const error = new Error('User already exists with this email or username');
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash
    }
  });

  const token = generateToken(user);

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt
    },
    token
  };
}

async function loginUser({ email, password }) {
  if (!email || !password) {
    const error = new Error('Email and password are required');
    error.statusCode = 400;
    throw error;
  }

  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const token = generateToken(user);

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt
    },
    token
  };
}

async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      createdAt: true
    }
  });

  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return user;
}

module.exports = {
  registerUser,
  loginUser,
  getCurrentUser
};
```

## 6. Create Auth Controller

Create file: `src/controllers/authController.js`

Code:

```js
const {
  registerUser,
  loginUser,
  getCurrentUser
} = require('../services/authService');

async function register(req, res, next) {
  try {
    const result = await registerUser(req.body);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: result.user,
      token: result.token
    });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = await loginUser(req.body);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: result.user,
      token: result.token
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    const user = await getCurrentUser(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Current user fetched successfully',
      user
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  me
};
```

## 7. Create Auth Middleware

Create file: `src/middlewares/authMiddleware.js`

Code:

```js
const jwt = require('jsonwebtoken');

function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const error = new Error('Authorization token is missing');
      error.statusCode = 401;
      throw error;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    if (!error.statusCode) {
      error.statusCode = 401;
      error.message = 'Invalid or expired token';
    }

    next(error);
  }
}

module.exports = {
  protect
};
```

## 8. Create Auth Routes

Create file: `src/routes/authRoutes.js`

Code:

```js
const express = require('express');

const { register, login, me } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, me);

module.exports = router;
```

## 9. Connect Auth Routes

File: [index.js](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/src/routes/index.js:1>)

Replace it with:

```js
const express = require('express');

const { getRoot } = require('../controllers/healthController');
const authRoutes = require('./authRoutes');

const router = express.Router();

router.get('/', getRoot);
router.use('/auth', authRoutes);

module.exports = router;
```

## 10. API Endpoints You Will Have

After adding the files above, these routes will work:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

## 11. Request Body For Register

Use:

```json
{
  "username": "nafiz",
  "email": "nafiz@example.com",
  "password": "12345678"
}
```

## 12. Request Body For Login

Use:

```json
{
  "email": "nafiz@example.com",
  "password": "12345678"
}
```

## 13. Header For Protected Route

Use:

```http
Authorization: Bearer your_jwt_token_here
```

## 14. Folder Map

Use these paths:

- schema change: [schema.prisma](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/prisma/schema.prisma:1>)
- route mount: [index.js](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/src/routes/index.js:1>)
- env template: [.env.example](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/.env.example:1>)
- real env: [.env](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/.env:1>)
- create controller: `src/controllers/authController.js`
- create service: `src/services/authService.js`
- create middleware: `src/middlewares/authMiddleware.js`
- create routes: `src/routes/authRoutes.js`
- create util: `src/utils/generateToken.js`

## 15. Test Order

Test in this order:

1. register a user
2. login with same user
3. copy returned token
4. call `/api/auth/me` with bearer token

## 16. Important Notes

- never store plain password
- always store `passwordHash`
- never return `passwordHash` in response
- use `email` for login
- use `JWT_SECRET` in `.env`

## 17. If You Want Me To Do The Implementation

If you want, I can now create all these files directly in the project instead of only keeping the code in this Markdown file.
