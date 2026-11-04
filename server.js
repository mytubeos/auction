const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log(' Connected to MongoDB Atlas'))
    .catch(err => console.error('MongoDB Connection Error:', err));
} else {
  console.log('Running with in-memory storage (MONGODB_URI not provided)');
}

// State Schema
const AuctionStateSchema = new mongoose.Schema({
  key: { type: String, default: 'current_auction', unique: true },
  data: { type: Object, required: true },
  updatedAt: { type: Date, default: Date.now }
});
const AuctionState = mongoose.models.AuctionState || mongoose.model('AuctionState', AuctionStateSchema);

let inMemoryState = null;

// REST API
app.get('/api/state', async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const doc = await AuctionState.findOne({ key: 'current_auction' });
      return res.json(doc ? doc.data : inMemoryState || {});
    }
    res.json(inMemoryState || {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/state', async (req, res) => {
  try {
    inMemoryState = req.body;
    if (mongoose.connection.readyState === 1) {
      await AuctionState.findOneAndUpdate(
        { key: 'current_auction' },
        { data: req.body, updatedAt: new Date() },
        { upsert: true, new: true }
      );
    }
    io.emit('stateUpdate', inMemoryState);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Socket.io for Real-time instant bidding
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  if (inMemoryState) {
    socket.emit('stateUpdate', inMemoryState);
  }

  socket.on('bidAction', async (bidData) => {
    // Broadcast instantly to all connected phones
    io.emit('bidReceived', bidData);
  });

  socket.on('syncState', async (fullState) => {
    inMemoryState = fullState;
    if (mongoose.connection.readyState === 1) {
      try {
        await AuctionState.findOneAndUpdate(
          { key: 'current_auction' },
          { data: fullState, updatedAt: new Date() },
          { upsert: true }
        );
      } catch (err) {
        console.error('Error saving state:', err);
      }
    }
    socket.broadcast.emit('stateUpdate', fullState);
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(` GCSPL Mega Auction Server running on port ${PORT}`);
});
