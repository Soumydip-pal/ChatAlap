import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;

if (!JWT_SECRET || !MONGODB_URI) {
  throw new Error("JWT_SECRET and MONGODB_URI are required environment variables.");
}

mongoose.set("strictQuery", true);
try {
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
} catch (error) {
  console.error("\nChatAlap could not connect to MongoDB.");
  console.error(`Configured MONGODB_URI: ${MONGODB_URI}`);
  console.error("Start MongoDB first, or set MONGODB_URI to a running MongoDB/Atlas connection string.");
  console.error("Local Windows command: npm run mongo");
  console.error(`MongoDB error: ${error.message}\n`);
  process.exit(1);
}

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: "" },
    avatar: { type: String, default: "" },
    bio: { type: String, default: "Hey, There I am using ChatAlap" },
    status: { type: String, enum: ["available", "busy", "class", "offline"], default: "available" },
    lastseen: { type: Number, default: Date.now },
  },
  { timestamps: true }
);

const chatEntrySchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "MessageThread", required: true },
    rId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedAt: { type: Number, default: Date.now },
    messageSeen: { type: Boolean, default: true },
    lastMessage: { type: String, default: "" },
  },
  { _id: false }
);

const chatListSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  chatData: { type: [chatEntrySchema], default: [] },
});

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    name: { type: String, default: "" },
    mime: { type: String, default: "" },
    size: { type: Number, default: 0 },
    type: { type: String, enum: ["image", "video", "audio", "pdf", "file"], default: "file" },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    messages: {
      type: [
        {
          sId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
          text: { type: String, default: "" },
          image: { type: String, default: "" },
          attachment: { type: attachmentSchema, default: null },
          kind: { type: String, enum: ["text", "image", "video", "audio", "pdf", "file", "system"], default: "text" },
          replyTo: {
            id: { type: String, default: "" },
            text: { type: String, default: "" },
            senderName: { type: String, default: "" },
          },
          reactions: {
            type: [
              {
                emoji: { type: String, required: true },
                userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
              },
            ],
            default: [],
          },
          pinned: { type: Boolean, default: false },
          editedAt: { type: Number, default: null },
          deletedAt: { type: Number, default: null },
          deliveredAt: { type: Number, default: Date.now },
          seenAt: { type: Number, default: null },
          createdAt: { type: Number, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const classroomMessageSchema = new mongoose.Schema(
  {
    sId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: "" },
    attachment: { type: attachmentSchema, default: null },
    createdAt: { type: Number, default: Date.now },
  },
  { _id: false }
);

const classroomSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    subject: { type: String, default: "General" },
    isPrivate: { type: Boolean, default: false },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    meetingRoomId: { type: String, required: true, unique: true },
    messages: { type: [classroomMessageSchema], default: [] },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
const ChatList = mongoose.model("ChatList", chatListSchema);
const MessageThread = mongoose.model("MessageThread", messageSchema);
const Classroom = mongoose.model("Classroom", classroomSchema);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "15mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  })
);

const io = new Server(server, {
  cors: { origin: CLIENT_URL, credentials: true },
  maxHttpBufferSize: 15 * 1024 * 1024,
});

const publicUser = (user) => ({
  id: user._id.toString(),
  username: user.username,
  email: user.email,
  name: user.name,
  avatar: user.avatar,
  bio: user.bio,
  status: user.status,
  lastseen: user.lastseen,
});

const publicMessage = (message) => ({
  id: message._id?.toString(),
  sId: message.sId.toString(),
  text: message.text,
  image: message.image,
  attachment: message.attachment,
  kind: message.kind,
  replyTo: message.replyTo,
  reactions: (message.reactions || []).map((reaction) => ({
    emoji: reaction.emoji,
    userId: reaction.userId.toString(),
  })),
  pinned: message.pinned,
  editedAt: message.editedAt,
  deletedAt: message.deletedAt,
  deliveredAt: message.deliveredAt,
  seenAt: message.seenAt,
  createdAt: message.createdAt,
});

const publicClassroomMessage = (message) => ({
  sId: message.sId.toString(),
  text: message.text,
  attachment: message.attachment,
  createdAt: message.createdAt,
});

const publicClassroom = (room, userId) => {
  const isMember = room.members.some((id) => id.equals(userId));
  const isAdmin = room.ownerId.equals(userId);
  return {
    id: room._id.toString(),
    title: room.title,
    description: room.description,
    subject: room.subject,
    isPrivate: room.isPrivate,
    ownerId: room.ownerId.toString(),
    meetingRoomId: room.meetingRoomId,
    memberCount: room.members.length,
    isMember,
    isAdmin,
    messages: isMember ? room.messages.slice(-40).map(publicClassroomMessage) : [],
  };
};

const signToken = (user) =>
  jwt.sign({ sub: user._id.toString() }, JWT_SECRET, { expiresIn: "7d" });

const getUserFromToken = async (token) => {
  const payload = jwt.verify(token, JWT_SECRET);
  return User.findById(payload.sub);
};

const authRequired = async (req, res, next) => {
  try {
    const [, token] = (req.headers.authorization || "").split(" ");
    if (!token) return res.status(401).json({ message: "Authentication required" });

    const user = await getUserFromToken(token);
    if (!user) return res.status(401).json({ message: "Authentication required" });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Session expired. Please log in again." });
  }
};

const ensureChatList = (userId) =>
  ChatList.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, chatData: [] } },
    { upsert: true, new: true }
  );

const ownsThread = async (userId, messageId) => {
  const chatList = await ChatList.findOne({ userId, "chatData.messageId": messageId });
  return Boolean(chatList);
};

const threadParticipantIds = async (messageId) => {
  const lists = await ChatList.find({ "chatData.messageId": messageId }, { userId: 1 });
  return lists.map((list) => list.userId.toString());
};

const emitThreadUpdate = async (messageId, message) => {
  const participants = await threadParticipantIds(messageId);
  io.to(`thread:${messageId}`).emit("message:new", { messageId, message });
  participants.forEach((userId) => io.to(`user:${userId}`).emit("chats:refresh"));
};

const emitMessageUpdate = async (messageId, message) => {
  const participants = await threadParticipantIds(messageId);
  io.to(`thread:${messageId}`).emit("message:update", { messageId, message });
  participants.forEach((userId) => io.to(`user:${userId}`).emit("chats:refresh"));
};

const emitClassroomRefresh = (room) => {
  room.members.forEach((memberId) => io.to(`user:${memberId.toString()}`).emit("classrooms:refresh"));
  io.emit("classrooms:refresh");
};

const emitClassroomNotification = (room, payload) => {
  room.members.forEach((memberId) => {
    io.to(`user:${memberId.toString()}`).emit("classroom:notify", {
      classroomId: room._id.toString(),
      title: room.title,
      ...payload,
    });
  });
};

const findThreadMessage = async (messageId, itemId) => {
  const thread = await MessageThread.findOne(
    { _id: messageId, "messages._id": itemId },
    { "messages.$": 1 }
  );
  return thread?.messages?.[0] || null;
};

const classifyAttachment = (mime = "") => {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "file";
};

const summarizeLastMessage = (message) => {
  if (message.text) return message.text;
  if (message.attachment?.type) return `${message.attachment.type[0].toUpperCase()}${message.attachment.type.slice(1)} file`;
  if (message.image) return "Image";
  return "Message";
};

const socketUserCount = new Map();
const callRooms = new Map();

const leaveCallRoom = (socket, roomId) => {
  if (!roomId || !callRooms.has(roomId)) return;
  const room = callRooms.get(roomId);
  room.delete(socket.id);
  socket.leave(`call:${roomId}`);
  socket.to(`call:${roomId}`).emit("call:peer-left", {
    socketId: socket.id,
    userId: socket.user._id.toString(),
  });
  if (room.size === 0) callRooms.delete(roomId);
};

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    const user = await getUserFromToken(token);
    if (!user) return next(new Error("Authentication required"));
    socket.user = user;
    next();
  } catch {
    next(new Error("Authentication required"));
  }
});

io.on("connection", async (socket) => {
  const userId = socket.user._id.toString();
  socket.join(`user:${userId}`);
  socketUserCount.set(userId, (socketUserCount.get(userId) || 0) + 1);
  socket.user.lastseen = Date.now();
  await socket.user.save();
  io.emit("presence:update", { userId, status: socket.user.status, lastseen: socket.user.lastseen, online: true });

  socket.on("thread:join", async (messageId) => {
    if (mongoose.Types.ObjectId.isValid(messageId) && (await ownsThread(socket.user._id, messageId))) {
      socket.join(`thread:${messageId}`);
    }
  });

  socket.on("thread:leave", (messageId) => socket.leave(`thread:${messageId}`));

  socket.on("thread:typing", async ({ messageId, typing }) => {
    if (!mongoose.Types.ObjectId.isValid(messageId) || !(await ownsThread(socket.user._id, messageId))) return;
    socket.to(`thread:${messageId}`).emit("thread:typing", {
      messageId,
      user: publicUser(socket.user),
      typing: Boolean(typing),
    });
  });

  socket.on("status:update", async (status) => {
    if (!["available", "busy", "class", "offline"].includes(status)) return;
    socket.user.status = status;
    socket.user.lastseen = Date.now();
    await socket.user.save();
    io.emit("presence:update", { userId, status, lastseen: socket.user.lastseen, online: status !== "offline" });
  });

  socket.on("call:join", async ({ roomId, messageId, media = "video" }) => {
    if (messageId && !(await ownsThread(socket.user._id, messageId))) return;
    const room = callRooms.get(roomId) || new Map();
    if (!room.has(socket.id) && room.size >= 5) {
      socket.emit("call:full", { roomId, limit: 5 });
      return;
    }

    const peers = [...room.entries()].map(([socketId, peer]) => ({
      socketId,
      user: peer.user,
      media: peer.media,
    }));
    room.set(socket.id, { user: publicUser(socket.user), media });
    callRooms.set(roomId, room);

    socket.join(`call:${roomId}`);
    socket.emit("call:peers", { roomId, peers, limit: 5 });
    socket.to(`call:${roomId}`).emit("call:peer-joined", {
      socketId: socket.id,
      user: publicUser(socket.user),
      media,
    });
  });

  socket.on("call:signal", ({ roomId, to, signal }) => {
    const payload = { from: socket.id, userId, signal };
    if (to) io.to(to).emit("call:signal", payload);
    else socket.to(`call:${roomId}`).emit("call:signal", payload);
  });

  socket.on("call:leave", ({ roomId }) => {
    leaveCallRoom(socket, roomId);
  });

  socket.on("classroom:join", async (classroomId) => {
    const classroom = await Classroom.findOne({ _id: classroomId, members: socket.user._id });
    if (classroom) socket.join(`classroom:${classroomId}`);
  });

  socket.on("disconnect", async () => {
    [...callRooms.keys()].forEach((roomId) => leaveCallRoom(socket, roomId));
    const count = Math.max((socketUserCount.get(userId) || 1) - 1, 0);
    if (count) socketUserCount.set(userId, count);
    else {
      socketUserCount.delete(userId);
      const user = await User.findById(userId);
      if (user) {
        user.lastseen = Date.now();
        await user.save();
        io.emit("presence:update", { userId, status: user.status, lastseen: user.lastseen, online: false });
      }
    }
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    realtime: true,
    database: mongoose.connection.readyState === 1 ? "connected" : "down",
  });
});

app.post("/api/auth/signup", async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!username || username.length < 2) {
    return res.status(400).json({ message: "Username must be at least 2 characters" });
  }
  if (!email.includes("@")) return res.status(400).json({ message: "Invalid email address" });
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  const existing = await User.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    return res.status(409).json({
      message: existing.email === email ? "Email already in use" : "Username already in use",
    });
  }

  const user = await User.create({
    username,
    email,
    passwordHash: await bcrypt.hash(password, 12),
  });
  await ensureChatList(user._id);

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = await User.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  user.lastseen = Date.now();
  user.status = user.status === "offline" ? "available" : user.status;
  await user.save();
  await ensureChatList(user._id);
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  await ensureChatList(req.user._id);
  res.json({ user: publicUser(req.user) });
});

app.patch("/api/users/profile", authRequired, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const bio = String(req.body.bio || "").trim();
  const avatar = req.body.avatar;

  if (!name) return res.status(400).json({ message: "Name is required" });
  if (bio.length > 280) return res.status(400).json({ message: "Bio must be 280 characters or less" });

  req.user.name = name;
  req.user.bio = bio || "Hey, There I am using ChatAlap";
  if (typeof avatar === "string" && avatar.startsWith("data:image/")) req.user.avatar = avatar;
  req.user.lastseen = Date.now();
  await req.user.save();
  res.json({ user: publicUser(req.user) });
});

app.patch("/api/users/status", authRequired, async (req, res) => {
  const status = String(req.body.status || "");
  if (!["available", "busy", "class", "offline"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  req.user.status = status;
  req.user.lastseen = Date.now();
  await req.user.save();
  io.emit("presence:update", {
    userId: req.user._id.toString(),
    status,
    lastseen: req.user.lastseen,
    online: status !== "offline",
  });
  res.json({ user: publicUser(req.user) });
});

app.patch("/api/users/last-seen", authRequired, async (req, res) => {
  req.user.lastseen = Date.now();
  await req.user.save();
  res.json({ ok: true });
});

app.get("/api/users/search", authRequired, async (req, res) => {
  const username = String(req.query.username || "").trim().toLowerCase();
  if (username.length < 2) return res.json({ user: null });

  const user = await User.findOne({ username });
  if (!user || user._id.equals(req.user._id)) return res.json({ user: null });
  res.json({ user: publicUser(user) });
});

app.get("/api/chats", authRequired, async (req, res) => {
  const chatList = await ensureChatList(req.user._id);
  const userIds = chatList.chatData.map((chat) => chat.rId);
  const users = await User.find({ _id: { $in: userIds } });
  const byId = new Map(users.map((user) => [user._id.toString(), publicUser(user)]));

  const chats = chatList.chatData
    .map((chat) => ({
      messageId: chat.messageId.toString(),
      rId: chat.rId.toString(),
      updatedAt: chat.updatedAt,
      messageSeen: chat.messageSeen,
      lastMessage: chat.lastMessage,
      userData: byId.get(chat.rId.toString()),
    }))
    .filter((chat) => chat.userData)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  res.json({ chats });
});

app.post("/api/chats", authRequired, async (req, res) => {
  const targetUserId = req.body.targetUserId;
  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    return res.status(400).json({ message: "Invalid user" });
  }
  if (req.user._id.equals(targetUserId)) {
    return res.status(400).json({ message: "You cannot start a chat with yourself" });
  }

  const target = await User.findById(targetUserId);
  if (!target) return res.status(404).json({ message: "User not found" });

  const currentList = await ensureChatList(req.user._id);
  const existing = currentList.chatData.find((chat) => chat.rId.equals(target._id));
  if (existing) return res.json({ messageId: existing.messageId.toString() });

  const thread = await MessageThread.create({ messages: [] });
  const now = Date.now();
  await ChatList.updateOne(
    { userId: req.user._id },
    { $push: { chatData: { messageId: thread._id, rId: target._id, updatedAt: now, messageSeen: true } } }
  );
  await ChatList.updateOne(
    { userId: target._id },
    {
      $setOnInsert: { userId: target._id },
      $push: { chatData: { messageId: thread._id, rId: req.user._id, updatedAt: now, messageSeen: true } },
    },
    { upsert: true }
  );

  io.to(`user:${target._id}`).emit("chats:refresh");
  res.status(201).json({ messageId: thread._id.toString() });
});

app.get("/api/messages/:messageId", authRequired, async (req, res) => {
  const { messageId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(messageId) || !(await ownsThread(req.user._id, messageId))) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  const thread = await MessageThread.findById(messageId);
  res.json({ messages: (thread?.messages || []).map(publicMessage) });
});

const appendMessage = async (req, res, message) => {
  const { messageId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(messageId) || !(await ownsThread(req.user._id, messageId))) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  const messageToSave = {
    _id: new mongoose.Types.ObjectId(),
    deliveredAt: Date.now(),
    ...message,
  };
  await MessageThread.updateOne({ _id: messageId }, { $push: { messages: messageToSave } });
  const lastMessage = summarizeLastMessage(messageToSave);
  const now = Date.now();

  await ChatList.updateOne(
    { userId: req.user._id, "chatData.messageId": messageId },
    {
      $set: {
        "chatData.$.lastMessage": lastMessage,
        "chatData.$.updatedAt": now,
        "chatData.$.messageSeen": true,
      },
    }
  );
  await ChatList.updateOne(
    { userId: { $ne: req.user._id }, "chatData.messageId": messageId },
    {
      $set: {
        "chatData.$.lastMessage": lastMessage,
        "chatData.$.updatedAt": now,
        "chatData.$.messageSeen": false,
      },
    }
  );

  const outgoing = publicMessage(messageToSave);
  await emitThreadUpdate(messageId, outgoing);
  res.status(201).json({ message: outgoing });
};

app.post("/api/messages/:messageId/text", authRequired, async (req, res) => {
  const text = String(req.body.text || "").trim();
  const replyTo = req.body.replyTo || {};
  if (!text) return res.status(400).json({ message: "Message cannot be empty" });
  if (text.length > 2000) return res.status(400).json({ message: "Message is too long" });
  return appendMessage(req, res, {
    sId: req.user._id,
    text,
    kind: "text",
    replyTo: {
      id: String(replyTo.id || ""),
      text: String(replyTo.text || "").slice(0, 160),
      senderName: String(replyTo.senderName || "").slice(0, 80),
    },
    createdAt: Date.now(),
  });
});

app.post("/api/messages/:messageId/image", authRequired, async (req, res) => {
  const image = String(req.body.image || "");
  if (!image.startsWith("data:image/")) return res.status(400).json({ message: "Invalid image" });
  return appendMessage(req, res, {
    sId: req.user._id,
    image,
    attachment: { url: image, name: "image", mime: "image/jpeg", type: "image" },
    kind: "image",
    createdAt: Date.now(),
  });
});

app.post("/api/messages/:messageId/file", authRequired, async (req, res) => {
  const url = String(req.body.dataUrl || "");
  const mime = String(req.body.mime || "");
  const name = String(req.body.name || "attachment").slice(0, 120);
  const size = Number(req.body.size || 0);
  if (!url.startsWith("data:")) return res.status(400).json({ message: "Invalid file" });
  if (size > 10 * 1024 * 1024) return res.status(400).json({ message: "File must be 10MB or less" });

  const type = classifyAttachment(mime);
  return appendMessage(req, res, {
    sId: req.user._id,
    attachment: { url, name, mime, size, type },
    kind: type,
    createdAt: Date.now(),
  });
});

app.patch("/api/messages/:messageId/seen", authRequired, async (req, res) => {
  const { messageId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(messageId)) return res.status(400).json({ message: "Invalid conversation" });
  if (!(await ownsThread(req.user._id, messageId))) return res.status(404).json({ message: "Conversation not found" });

  const seenAt = Date.now();
  await MessageThread.updateOne(
    { _id: messageId },
    { $set: { "messages.$[message].seenAt": seenAt } },
    { arrayFilters: [{ "message.sId": { $ne: req.user._id }, "message.seenAt": null }] }
  );

  await ChatList.updateOne(
    { userId: req.user._id, "chatData.messageId": messageId },
    { $set: { "chatData.$.messageSeen": true } }
  );
  io.to(`thread:${messageId}`).emit("message:seen", {
    messageId,
    readerId: req.user._id.toString(),
    seenAt,
  });
  res.json({ ok: true, seenAt });
});

app.patch("/api/messages/:messageId/items/:itemId", authRequired, async (req, res) => {
  const { messageId, itemId } = req.params;
  const text = String(req.body.text || "").trim();
  if (!mongoose.Types.ObjectId.isValid(messageId) || !mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ message: "Invalid message" });
  }
  if (!text) return res.status(400).json({ message: "Message cannot be empty" });
  if (text.length > 2000) return res.status(400).json({ message: "Message is too long" });
  if (!(await ownsThread(req.user._id, messageId))) return res.status(404).json({ message: "Conversation not found" });

  const message = await findThreadMessage(messageId, itemId);
  if (!message || !message.sId.equals(req.user._id)) return res.status(403).json({ message: "You can only edit your own message" });
  if (message.deletedAt) return res.status(400).json({ message: "Deleted messages cannot be edited" });

  await MessageThread.updateOne(
    { _id: messageId, "messages._id": itemId },
    { $set: { "messages.$.text": text, "messages.$.editedAt": Date.now() } }
  );
  const updated = await findThreadMessage(messageId, itemId);
  const outgoing = publicMessage(updated);
  await emitMessageUpdate(messageId, outgoing);
  res.json({ message: outgoing });
});

app.delete("/api/messages/:messageId/items/:itemId", authRequired, async (req, res) => {
  const { messageId, itemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(messageId) || !mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ message: "Invalid message" });
  }
  if (!(await ownsThread(req.user._id, messageId))) return res.status(404).json({ message: "Conversation not found" });

  const message = await findThreadMessage(messageId, itemId);
  if (!message || !message.sId.equals(req.user._id)) return res.status(403).json({ message: "You can only delete your own message" });

  await MessageThread.updateOne(
    { _id: messageId, "messages._id": itemId },
    {
      $set: {
        "messages.$.text": "This message was deleted",
        "messages.$.image": "",
        "messages.$.attachment": null,
        "messages.$.kind": "system",
        "messages.$.deletedAt": Date.now(),
      },
    }
  );
  const updated = await findThreadMessage(messageId, itemId);
  const outgoing = publicMessage(updated);
  await emitMessageUpdate(messageId, outgoing);
  res.json({ message: outgoing });
});

app.post("/api/messages/:messageId/items/:itemId/reactions", authRequired, async (req, res) => {
  const { messageId, itemId } = req.params;
  const emoji = String(req.body.emoji || "").slice(0, 8);
  if (!mongoose.Types.ObjectId.isValid(messageId) || !mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ message: "Invalid message" });
  }
  if (!emoji) return res.status(400).json({ message: "Reaction is required" });
  if (!(await ownsThread(req.user._id, messageId))) return res.status(404).json({ message: "Conversation not found" });

  const message = await findThreadMessage(messageId, itemId);
  if (!message) return res.status(404).json({ message: "Message not found" });
  const nextReactions = (message.reactions || []).filter((reaction) => !reaction.userId.equals(req.user._id));
  const alreadySame = (message.reactions || []).some(
    (reaction) => reaction.userId.equals(req.user._id) && reaction.emoji === emoji
  );
  if (!alreadySame) nextReactions.push({ emoji, userId: req.user._id });

  await MessageThread.updateOne(
    { _id: messageId, "messages._id": itemId },
    { $set: { "messages.$.reactions": nextReactions } }
  );
  const updated = await findThreadMessage(messageId, itemId);
  const outgoing = publicMessage(updated);
  await emitMessageUpdate(messageId, outgoing);
  res.json({ message: outgoing });
});

app.patch("/api/messages/:messageId/items/:itemId/pin", authRequired, async (req, res) => {
  const { messageId, itemId } = req.params;
  const pinned = Boolean(req.body.pinned);
  if (!mongoose.Types.ObjectId.isValid(messageId) || !mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ message: "Invalid message" });
  }
  if (!(await ownsThread(req.user._id, messageId))) return res.status(404).json({ message: "Conversation not found" });

  await MessageThread.updateOne(
    { _id: messageId, "messages._id": itemId },
    { $set: { "messages.$.pinned": pinned } }
  );
  const updated = await findThreadMessage(messageId, itemId);
  const outgoing = publicMessage(updated);
  await emitMessageUpdate(messageId, outgoing);
  res.json({ message: outgoing });
});

app.post("/api/ai/suggestions", authRequired, async (req, res) => {
  const text = String(req.body.text || "").trim();
  const topic = String(req.body.topic || "chat").trim();
  const base = text || topic;
  const suggestions = [
    `Thanks for sharing. I will check this and reply shortly.`,
    `Can you send one more detail about ${base.slice(0, 32)}?`,
    `Let's discuss this in a quick voice or video room.`,
  ];
  res.json({
    suggestions,
    assistantReply: `I can help draft replies, summarize shared files, and turn this chat into a classroom action item. Current focus: ${base.slice(0, 80) || "conversation"}.`,
  });
});

app.get("/api/classrooms", authRequired, async (req, res) => {
  const classrooms = await Classroom.find({
    $or: [{ isPrivate: false }, { members: req.user._id }, { ownerId: req.user._id }],
  }).sort({ updatedAt: -1 });
  res.json({
    classrooms: classrooms.map((room) => publicClassroom(room, req.user._id)),
  });
});

app.post("/api/classrooms", authRequired, async (req, res) => {
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const subject = String(req.body.subject || "General").trim();
  const isPrivate = Boolean(req.body.isPrivate);
  if (title.length < 3) return res.status(400).json({ message: "Classroom name is required" });

  const classroom = await Classroom.create({
    title,
    description,
    subject,
    isPrivate,
    ownerId: req.user._id,
    members: [req.user._id],
    meetingRoomId: `class-${new mongoose.Types.ObjectId().toString()}`,
  });
  emitClassroomRefresh(classroom);
  emitClassroomNotification(classroom, {
    type: "created",
    message: `${req.user.name || req.user.username} created ${classroom.title}`,
  });
  res.status(201).json({ classroom: publicClassroom(classroom, req.user._id) });
});

app.post("/api/classrooms/:classroomId/join", authRequired, async (req, res) => {
  const classroom = await Classroom.findById(req.params.classroomId);
  if (!classroom) return res.status(404).json({ message: "Classroom not found" });
  if (classroom.isPrivate && !classroom.ownerId.equals(req.user._id)) {
    return res.status(403).json({ message: "Only the admin can add members to this private classroom" });
  }
  await Classroom.updateOne({ _id: classroom._id }, { $addToSet: { members: req.user._id } });
  const updated = await Classroom.findById(classroom._id);
  emitClassroomRefresh(updated);
  emitClassroomNotification(updated, {
    type: "member-joined",
    message: `${req.user.name || req.user.username} joined ${updated.title}`,
  });
  res.json({ ok: true });
});

app.post("/api/classrooms/:classroomId/leave", authRequired, async (req, res) => {
  const classroom = await Classroom.findById(req.params.classroomId);
  if (!classroom) return res.status(404).json({ message: "Classroom not found" });
  if (classroom.ownerId.equals(req.user._id)) {
    return res.status(400).json({ message: "Admin cannot leave their own classroom" });
  }
  if (!classroom.members.some((id) => id.equals(req.user._id))) {
    return res.status(400).json({ message: "You are not a member of this classroom" });
  }
  await Classroom.updateOne({ _id: classroom._id }, { $pull: { members: req.user._id } });
  classroom.members = classroom.members.filter((id) => !id.equals(req.user._id));
  emitClassroomRefresh(classroom);
  emitClassroomNotification(classroom, {
    type: "member-left",
    message: `${req.user.name || req.user.username} left ${classroom.title}`,
  });
  io.to(`user:${req.user._id}`).emit("classrooms:refresh");
  res.json({ ok: true });
});

app.post("/api/classrooms/:classroomId/call", authRequired, async (req, res) => {
  const media = String(req.body.media || "video");
  if (!["audio", "video"].includes(media)) return res.status(400).json({ message: "Invalid call type" });
  const classroom = await Classroom.findOne({ _id: req.params.classroomId, members: req.user._id });
  if (!classroom) return res.status(404).json({ message: "Classroom not found" });

  classroom.members.forEach((memberId) => {
    const id = memberId.toString();
    if (id !== req.user._id.toString()) {
      io.to(`user:${id}`).emit("classroom:call", {
        classroomId: classroom._id.toString(),
        title: classroom.title,
        roomId: classroom.meetingRoomId,
        media,
        caller: publicUser(req.user),
        limit: 5,
      });
    }
  });
  emitClassroomNotification(classroom, {
    type: "call-started",
    message: `${req.user.name || req.user.username} started a ${media === "video" ? "video class" : "voice class"} in ${classroom.title}`,
  });
  res.json({ ok: true, roomId: classroom.meetingRoomId });
});

app.post("/api/classrooms/:classroomId/messages", authRequired, async (req, res) => {
  const classroom = await Classroom.findOne({ _id: req.params.classroomId, members: req.user._id });
  if (!classroom) return res.status(404).json({ message: "Classroom not found" });
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ message: "Message cannot be empty" });
  const message = { sId: req.user._id, text, createdAt: Date.now() };
  await Classroom.updateOne({ _id: classroom._id }, { $push: { messages: message } });
  const updated = await Classroom.findById(classroom._id);
  io.to(`classroom:${classroom._id}`).emit("classroom:message", {
    classroomId: classroom._id.toString(),
    message: { ...message, sId: req.user._id.toString() },
  });
  emitClassroomRefresh(updated);
  emitClassroomNotification(updated, {
    type: "message",
    message: `${req.user.name || req.user.username}: ${text.slice(0, 80)}`,
  });
  res.status(201).json({ message: { ...message, sId: req.user._id.toString() } });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Server error" });
});

server.listen(PORT, () => {
  console.log(`ChatAlap API + realtime listening on http://localhost:${PORT}`);
});
