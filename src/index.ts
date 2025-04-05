import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './database';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import Notification from './models/Notification';
import User from './models/User'; // Ensure this path is correct and the User model exists
import morgan from 'morgan'; // Logging middleware

dotenv.config(); // Load environment variables

const app = express();
const PORT = process.env.PORT || 5001;

app.use(express.urlencoded({ extended: true })); // For form-data bodies
app.use(express.json());
app.use(morgan('combined')); // Logging middleware

// Log and set up static folder for uploads
const uploadsPath = path.join(__dirname, '..', 'uploads');
console.log("Serving static files from:", uploadsPath); // Debugging path
app.use('/uploads', express.static(uploadsPath));

// Setup server and socket.io
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
  },
});

const users: { [userId: string]: string } = {}; // userId to socketId mapping

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
}));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on('register', (userId: string) => {
    users[userId] = socket.id;
    console.log(`User ${userId} connected with socket ID ${socket.id}`);
  });


  const updateUserCount = async () => {
    const userCount = await User.countDocuments();
    io.emit("userCountUpdate", userCount);
  };
  
  // Listen for new user additions
  User.watch().on("change", async () => {
    await updateUserCount();
  });

  socket.on('disconnect', async () => {
    //await updateUserCount(); // Send the latest count on connection
    for (const [userId, socketId] of Object.entries(users)) {
      if (socketId === socket.id) {
        delete users[userId];
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
  });
});


// Connect to the database
connectDB();

const getUserCount = async () => {
  return await User.countDocuments();
};

// API route to fetch user count when the page is refreshed
app.get("/user-count", async (req, res) => {
  try {
    const count = await getUserCount();
    res.json({ userCount: count });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user count" });
  }
});

// Routes
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/consultants', require('./routes/consultRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/admin-services', require('./routes/adminServiceRoutes'));
app.use('/api/chat', require('./routes/chatRoute'));
app.use('/api/join', require('./routes/joinRoute'));
app.use('/api/cronjobs', require('./routes/cronRoute'));
app.use('/api/userbadge', require('./routes/badgeRoute'));

export { io, users };

// Start server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
