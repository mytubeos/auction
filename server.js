require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const TEAMS = ['RCB', 'MI', 'KKR', 'DC', 'CSK', 'GT', 'LSG', 'RR', 'SRH', 'PBKS'];

// Passcodes. Set real ones with environment variables on Render:
//   HOST_PASSCODE, PASSCODE_RCB, PASSCODE_MI, ... PASSCODE_PBKS
const DEFAULT_HOST = 'gcspl2026';
const PASS = { host: process.env.HOST_PASSCODE || DEFAULT_HOST };
TEAMS.forEach(t => { PASS[t] = process.env['PASSCODE_' + t] || t.toLowerCase() + '123'; });
if (!process.env.HOST_PASSCODE) console.warn('WARNING: HOST_PASSCODE is not set. Using the default. Set it before sharing the link.');

const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

// ---- state kept by the server (the host browser is the auction engine) ----
let STATE = { main: null, live: null };
let hostSocket = null;
let hostReady = false;
const presence = {};
TEAMS.forEach(t => { presence[t] = 0; });

// ---- optional MongoDB persistence ----
let Model = null;
async function initDb() {
  if (!process.env.MONGODB_URI) { console.log('No MONGODB_URI: state is kept in memory only.'); return; }
  const mongoose = require('mongoose');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    Model = mongoose.models.AuctionState || mongoose.model('AuctionState', new mongoose.Schema({
      key: { type: String, unique: true }, data: Object, updatedAt: Date
    }));
    const doc = await Model.findOne({ key: 'gcspl_v2' });
    if (doc && doc.data) STATE = doc.data;
    console.log('Connected to MongoDB. Restored saved auction:', !!(doc && doc.data));
  } catch (e) { console.error('MongoDB error:', e.message); Model = null; }
}
let saveTimer = null;
function persist() {
  if (!Model) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    Model.findOneAndUpdate({ key: 'gcspl_v2' }, { data: STATE, updatedAt: new Date() }, { upsert: true }).catch(e => console.error('save', e.message));
  }, 1000);
}

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ ok: true }));

const publicHostStatus = () => !!(hostSocket && hostReady);

io.on('connection', socket => {
  socket.data = { role: 'guest', team: null, lastBid: 0 };
  socket.emit('state:init', { main: STATE.main, live: STATE.live, hostOnline: publicHostStatus(), presence });

  socket.on('login', (msg, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const role = msg && msg.role, pass = msg && msg.pass;
    if (!(role === 'host' || TEAMS.includes(role)) || !pass || !same(pass, PASS[role])) return reply({ ok: false, error: 'Wrong passcode.' });
    // leave any previous role
    if (socket.data.team) { presence[socket.data.team] = Math.max(0, presence[socket.data.team] - 1); socket.data.team = null; }
    if (role === 'host') {
      if (hostSocket && hostSocket.id !== socket.id) { hostSocket.data.role = 'guest'; hostSocket.emit('kicked'); }
      hostSocket = socket; hostReady = false; socket.data.role = 'host';
      io.emit('hostStatus', false); io.emit('presence', presence);
      return reply({ ok: true, role: 'host', state: STATE });
    }
    if (hostSocket && hostSocket.id === socket.id) { hostSocket = null; hostReady = false; io.emit('hostStatus', false); }
    socket.data.role = 'team'; socket.data.team = role; presence[role]++;
    io.emit('presence', presence);
    reply({ ok: true, role: 'team', team: role });
  });

  socket.on('host:push', (msg, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (socket.data.role !== 'host' || !msg || (msg.name !== 'main' && msg.name !== 'live') || typeof msg.doc !== 'object') return reply({ ok: false });
    STATE[msg.name] = msg.doc;
    socket.broadcast.emit('state:' + msg.name, msg.doc);
    persist();
    reply({ ok: true });
  });

  socket.on('host:ready', () => {
    if (socket.data.role !== 'host') return;
    hostReady = true; io.emit('hostStatus', true);
  });

  socket.on('bid', (msg, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const team = socket.data.team;
    if (!team) return reply({ ok: false, error: 'not-logged-in' });
    if (!publicHostStatus()) return reply({ ok: false, error: 'host-offline' });
    const now = Date.now();
    if (now - socket.data.lastBid < 250) return reply({ ok: false, error: 'too-fast' });
    socket.data.lastBid = now;
    if (!msg || !Number.isFinite(msg.pid) || !Number.isFinite(msg.amt)) return reply({ ok: false, error: 'bad-bid' });
    hostSocket.emit('bid', { team, pid: msg.pid, amt: msg.amt });   // team comes from the login, never from the client
    reply({ ok: true });
  });

  socket.on('disconnect', () => {
    if (socket.data.team) { presence[socket.data.team] = Math.max(0, presence[socket.data.team] - 1); io.emit('presence', presence); }
    if (hostSocket && hostSocket.id === socket.id) { hostSocket = null; hostReady = false; io.emit('hostStatus', false); }
  });
});

initDb().finally(() => server.listen(PORT, () => console.log('GCSPL auction server on port ' + PORT)));
