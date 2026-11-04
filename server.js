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
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('MongoDB Connection Error:', err));
}

const AuctionStateSchema = new mongoose.Schema({
  key: { type: String, default: 'current_auction', unique: true },
  data: { type: Object, required: true },
  updatedAt: { type: Date, default: Date.now }
});
const AuctionState = mongoose.models.AuctionState || mongoose.model('AuctionState', AuctionStateSchema);

let globalAuctionState = null;

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);

  // Send current live state to newly joined mobile
  if (globalAuctionState) {
    socket.emit('syncStateFromServer', globalAuctionState);
  } else if (mongoose.connection.readyState === 1) {
    try {
      const doc = await AuctionState.findOne({ key: 'current_auction' });
      if (doc && doc.data) {
        globalAuctionState = doc.data;
        socket.emit('syncStateFromServer', globalAuctionState);
      }
    } catch (e) {}
  }

  // Host or Team updates auction state
  socket.on('pushStateToServer', async (newState) => {
    globalAuctionState = newState;
    io.emit('syncStateFromServer', globalAuctionState);
    if (mongoose.connection.readyState === 1) {
      try {
        await AuctionState.findOneAndUpdate(
          { key: 'current_auction' },
          { data: globalAuctionState, updatedAt: new Date() },
          { upsert: true }
        );
      } catch (e) {}
    }
  });

  // Instant Bid Action
  socket.on('bidAction', (bidData) => {
    io.emit('bidReceived', bidData);
  });

  // Speech / Commentary Sync across all phones
  socket.on('broadcastSpeech', (speechObj) => {
    io.emit('playSpeechOnClients', speechObj);
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`GCSPL Mega Auction Server running on port ${PORT}`);
});
