# Socket.IO Message Setup Guide

This file contains the actual code you should add for real-time messaging with Socket.IO in this project.

Use it file by file.

## 1. Install Packages

Run:

```bash
npm install socket.io
```

If your frontend will connect with Socket.IO, install this there too:

```bash
npm install socket.io-client
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
CLIENT_URL=http://localhost:3000
```

File: `.env`

Add:

```env
CLIENT_URL=http://localhost:3000
```

If you have multiple frontend origins, you can keep them comma separated:

```env
CLIENT_URL=http://localhost:3000,http://localhost:5173
```

## 3. Update Prisma Schema

For real messaging, the current `Message` model is too small. You need conversations and participants.

File: [schema.prisma](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/prisma/schema.prisma:1>)

Replace it with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model User {
  id                       Int                       @id @default(autoincrement())
  username                 String                    @unique
  email                    String                    @unique
  passwordHash             String
  createdAt                DateTime                  @default(now())
  updatedAt                DateTime                  @updatedAt
  sentMessages             Message[]                 @relation("MessageSender")
  conversationParticipants ConversationParticipant[]
}

model Conversation {
  id           Int                       @id @default(autoincrement())
  title        String?
  isGroup      Boolean                   @default(false)
  createdAt    DateTime                  @default(now())
  updatedAt    DateTime                  @updatedAt
  participants ConversationParticipant[]
  messages     Message[]
}

model ConversationParticipant {
  id             Int          @id @default(autoincrement())
  conversationId Int
  userId         Int
  joinedAt       DateTime     @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([conversationId, userId])
}

model Message {
  id             Int          @id @default(autoincrement())
  conversationId Int
  senderId       Int
  text           String
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User         @relation("MessageSender", fields: [senderId], references: [id], onDelete: Cascade)
}
```

Then run:

```bash
npx prisma migrate dev --name add_conversation_and_socket_messages
npx prisma generate
```

## 4. Update Express CORS

Socket.IO and your API should use the same allowed frontend origin.

File: [app.js](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/src/app.js:1>)

Replace it with:

```js
const express = require('express');
const cors = require('cors');

const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((origin) => origin.trim())
  : '*';

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);
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
```

## 5. Create Conversation Service

Create file: `src/services/conversationService.js`

Code:

```js
const { prisma } = require('../config/prisma');

const conversationInclude = {
  participants: {
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true
        }
      }
    }
  },
  messages: {
    orderBy: {
      createdAt: 'desc'
    },
    take: 1,
    include: {
      sender: {
        select: {
          id: true,
          username: true,
          email: true
        }
      }
    }
  }
};

async function assertConversationParticipant(userId, conversationId) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId
      }
    }
  });

  if (!participant) {
    const error = new Error('You are not a participant of this conversation');
    error.statusCode = 403;
    throw error;
  }
}

async function createDirectConversation(currentUserId, participantId) {
  if (!participantId) {
    const error = new Error('participantId is required');
    error.statusCode = 400;
    throw error;
  }

  if (currentUserId === participantId) {
    const error = new Error('You cannot create a direct conversation with yourself');
    error.statusCode = 400;
    throw error;
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: participantId },
    select: {
      id: true
    }
  });

  if (!targetUser) {
    const error = new Error('Participant user not found');
    error.statusCode = 404;
    throw error;
  }

  const existingConversations = await prisma.conversation.findMany({
    where: {
      isGroup: false,
      participants: {
        some: {
          userId: currentUserId
        }
      },
      AND: [
        {
          participants: {
            some: {
              userId: participantId
            }
          }
        }
      ]
    },
    include: {
      participants: true
    }
  });

  const existingConversation = existingConversations.find(
    (conversation) => conversation.participants.length === 2
  );

  if (existingConversation) {
    return prisma.conversation.findUnique({
      where: { id: existingConversation.id },
      include: conversationInclude
    });
  }

  return prisma.conversation.create({
    data: {
      isGroup: false,
      participants: {
        create: [
          {
            userId: currentUserId
          },
          {
            userId: participantId
          }
        ]
      }
    },
    include: conversationInclude
  });
}

async function getUserConversations(userId) {
  return prisma.conversation.findMany({
    where: {
      participants: {
        some: {
          userId
        }
      }
    },
    orderBy: {
      updatedAt: 'desc'
    },
    include: conversationInclude
  });
}

async function getConversationMessages(userId, conversationId, limit = 50) {
  await assertConversationParticipant(userId, conversationId);

  return prisma.message.findMany({
    where: {
      conversationId
    },
    orderBy: {
      createdAt: 'asc'
    },
    take: limit,
    include: {
      sender: {
        select: {
          id: true,
          username: true,
          email: true
        }
      }
    }
  });
}

module.exports = {
  assertConversationParticipant,
  createDirectConversation,
  getUserConversations,
  getConversationMessages
};
```

## 6. Create Message Service

Create file: `src/services/messageService.js`

Code:

```js
const { prisma } = require('../config/prisma');
const { assertConversationParticipant } = require('./conversationService');

async function createMessage(userId, conversationId, text) {
  if (!text || !text.trim()) {
    const error = new Error('Message text is required');
    error.statusCode = 400;
    throw error;
  }

  await assertConversationParticipant(userId, conversationId);

  return prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId,
        senderId: userId,
        text: text.trim()
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });

    await tx.conversation.update({
      where: {
        id: conversationId
      },
      data: {
        updatedAt: new Date()
      }
    });

    return message;
  });
}

module.exports = {
  createMessage
};
```

## 7. Create Conversation Controller

Create file: `src/controllers/conversationController.js`

Code:

```js
const {
  createDirectConversation,
  getUserConversations,
  getConversationMessages
} = require('../services/conversationService');

async function createDirect(req, res, next) {
  try {
    const participantId = Number(req.body.participantId);

    const conversation = await createDirectConversation(req.user.id, participantId);

    res.status(201).json({
      success: true,
      message: 'Conversation ready',
      conversation
    });
  } catch (error) {
    next(error);
  }
}

async function listMine(req, res, next) {
  try {
    const conversations = await getUserConversations(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Conversations fetched successfully',
      conversations
    });
  } catch (error) {
    next(error);
  }
}

async function listMessages(req, res, next) {
  try {
    const conversationId = Number(req.params.conversationId);
    const limit = Number(req.query.limit || 50);

    const messages = await getConversationMessages(req.user.id, conversationId, limit);

    res.status(200).json({
      success: true,
      message: 'Messages fetched successfully',
      messages
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createDirect,
  listMine,
  listMessages
};
```

## 8. Create Conversation Routes

Create file: `src/routes/conversationRoutes.js`

Code:

```js
const express = require('express');

const protect = require('../middlewares/authMiddleware');
const {
  createDirect,
  listMine,
  listMessages
} = require('../controllers/conversationController');

const router = express.Router();

router.use(protect);

router.get('/', listMine);
router.post('/direct', createDirect);
router.get('/:conversationId/messages', listMessages);

module.exports = router;
```

## 9. Connect Conversation Routes

File: [index.js](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/src/routes/index.js:1>)

Replace it with:

```js
const express = require('express');

const { getRoot } = require('../controllers/healthController');
const authRoutes = require('./authRoutes');
const conversationRoutes = require('./conversationRoutes');

const router = express.Router();

router.get('/', getRoot);
router.use('/auth', authRoutes);
router.use('/conversations', conversationRoutes);

module.exports = router;
```

## 10. Create Socket Auth Middleware

Create folder if missing:

- `src/socket`

Create file: `src/socket/socketAuth.js`

Code:

```js
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma');

async function socketAuth(socket, next) {
  try {
    const handshakeToken = socket.handshake.auth && socket.handshake.auth.token;
    const headerToken = socket.handshake.headers.authorization
      ? socket.handshake.headers.authorization.replace('Bearer ', '')
      : null;

    const token = handshakeToken || headerToken;

    if (!token) {
      return next(new Error('Socket token is missing'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.id
      },
      select: {
        id: true,
        username: true,
        email: true
      }
    });

    if (!user) {
      return next(new Error('Socket user not found'));
    }

    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Socket authentication failed'));
  }
}

module.exports = socketAuth;
```

## 11. Create Message Socket Handlers

Create file: `src/socket/messageSocket.js`

Code:

```js
const socketAuth = require('./socketAuth');
const { createMessage } = require('../services/messageService');
const { assertConversationParticipant } = require('../services/conversationService');

function getConversationRoom(conversationId) {
  return `conversation:${conversationId}`;
}

function getUserRoom(userId) {
  return `user:${userId}`;
}

function safeAck(ack, payload) {
  if (typeof ack === 'function') {
    ack(payload);
  }
}

function registerMessageSocket(io) {
  io.use(socketAuth);

  io.on('connection', (socket) => {
    socket.join(getUserRoom(socket.user.id));

    socket.on('conversation:join', async (payload, ack) => {
      try {
        const conversationId = Number(payload.conversationId);

        await assertConversationParticipant(socket.user.id, conversationId);

        socket.join(getConversationRoom(conversationId));

        safeAck(ack, {
          success: true,
          message: 'Joined conversation successfully',
          conversationId
        });
      } catch (error) {
        safeAck(ack, {
          success: false,
          message: error.message
        });
      }
    });

    socket.on('conversation:leave', (payload, ack) => {
      const conversationId = Number(payload.conversationId);

      socket.leave(getConversationRoom(conversationId));

      safeAck(ack, {
        success: true,
        message: 'Left conversation successfully',
        conversationId
      });
    });

    socket.on('message:send', async (payload, ack) => {
      try {
        const conversationId = Number(payload.conversationId);
        const message = await createMessage(socket.user.id, conversationId, payload.text);

        io.to(getConversationRoom(conversationId)).emit('message:new', {
          success: true,
          message
        });

        safeAck(ack, {
          success: true,
          message: 'Message sent successfully',
          data: message
        });
      } catch (error) {
        safeAck(ack, {
          success: false,
          message: error.message
        });
      }
    });

    socket.on('message:typing:start', async (payload) => {
      try {
        const conversationId = Number(payload.conversationId);

        await assertConversationParticipant(socket.user.id, conversationId);

        socket.to(getConversationRoom(conversationId)).emit('message:typing', {
          conversationId,
          isTyping: true,
          user: socket.user
        });
      } catch (error) {
        socket.emit('message:error', {
          message: error.message
        });
      }
    });

    socket.on('message:typing:stop', async (payload) => {
      try {
        const conversationId = Number(payload.conversationId);

        await assertConversationParticipant(socket.user.id, conversationId);

        socket.to(getConversationRoom(conversationId)).emit('message:typing', {
          conversationId,
          isTyping: false,
          user: socket.user
        });
      } catch (error) {
        socket.emit('message:error', {
          message: error.message
        });
      }
    });
  });
}

module.exports = registerMessageSocket;
```

## 12. Update Server To Use HTTP Server And Socket.IO

File: [server.js](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/src/server.js:1>)

Replace it with:

```js
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const app = require('./app');
const { connectPrisma } = require('./config/prisma');
const registerMessageSocket = require('./socket/messageSocket');

const port = process.env.PORT || 5000;

const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map((origin) => origin.trim())
  : '*';

async function startServer() {
  await connectPrisma();

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true
    }
  });

  registerMessageSocket(io);

  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
```

## 13. REST Endpoints You Will Have

After adding the files above, these routes will work:

- `GET /api/conversations`
- `POST /api/conversations/direct`
- `GET /api/conversations/:conversationId/messages`

## 14. Request Body To Create Direct Conversation

Use:

```json
{
  "participantId": 2
}
```

## 15. Header For Conversation Routes

Use:

```http
Authorization: Bearer your_jwt_token_here
```

## 16. Socket Connection Example

Frontend example:

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: yourJwtToken
  },
  withCredentials: true
});

socket.on('connect', () => {
  console.log('Socket connected:', socket.id);
});

socket.on('message:new', (payload) => {
  console.log('New message:', payload.message);
});

socket.on('message:typing', (payload) => {
  console.log('Typing event:', payload);
});

socket.on('message:error', (payload) => {
  console.error(payload.message);
});
```

## 17. Socket Events

Client emits:

- `conversation:join`
- `conversation:leave`
- `message:send`
- `message:typing:start`
- `message:typing:stop`

Server emits:

- `message:new`
- `message:typing`
- `message:error`

## 18. Client Payload Examples

Join room:

```js
socket.emit('conversation:join', { conversationId: 1 }, (response) => {
  console.log(response);
});
```

Send message:

```js
socket.emit(
  'message:send',
  {
    conversationId: 1,
    text: 'Hello from socket'
  },
  (response) => {
    console.log(response);
  }
);
```

Typing start:

```js
socket.emit('message:typing:start', {
  conversationId: 1
});
```

Typing stop:

```js
socket.emit('message:typing:stop', {
  conversationId: 1
});
```

## 19. Suggested Flow

Use this order in frontend:

1. register or login user
2. keep returned JWT token
3. call `GET /api/conversations`
4. create direct conversation if needed
5. call `GET /api/conversations/:conversationId/messages`
6. connect socket with JWT token
7. emit `conversation:join`
8. emit `message:send`
9. listen for `message:new`

## 20. Important Notes

- every socket user must be authenticated with JWT
- every conversation join should verify membership
- never trust `conversationId` from client without checking database access
- use REST for initial conversation list and message history
- use Socket.IO for real-time send and receive
- keep room name pattern consistent, like `conversation:1`
- if the user is not in the room, they will not receive `message:new`

## 21. Folder Map

Use these paths:

- schema change: [schema.prisma](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/prisma/schema.prisma:1>)
- express app update: [app.js](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/src/app.js:1>)
- server update: [server.js](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/src/server.js:1>)
- route mount: [index.js](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/src/routes/index.js:1>)
- env template: [.env.example](</C:/Projects_Of_Nafiz/A-Socket iO/chat-server/.env.example:1>)
- create controller: `src/controllers/conversationController.js`
- create service: `src/services/conversationService.js`
- create service: `src/services/messageService.js`
- create routes: `src/routes/conversationRoutes.js`
- create socket auth: `src/socket/socketAuth.js`
- create socket handlers: `src/socket/messageSocket.js`

## 22. If You Want Me To Do The Implementation

If you want, I can now create all these files directly in the project instead of only keeping the code in this Markdown file.
