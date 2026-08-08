const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const STATE_FILE = path.join(__dirname, 'state.json');

// ---- State (kept in memory, backed up to a file so a restart doesn't lose it) ----
function defaultState() {
  return { nextNumber: 1, tickets: [], nowServing: null, volunteers: [] };
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.volunteers) parsed.volunteers = []; // migrate older state files
    return parsed;
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), (err) => {
    if (err) console.error('Failed to save state:', err.message);
  });
}

let state = loadState();

// ---- Middleware ----
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- API ----
app.get('/api/state', (req, res) => {
  res.json(state);
});

app.post('/api/take', (req, res) => {
  const ticket = { number: state.nextNumber, status: 'waiting', createdAt: Date.now() };
  state.tickets.push(ticket);
  state.nextNumber += 1;
  saveState();
  res.json({ state, ticket });
});

app.post('/api/call-next', (req, res) => {
  const waiting = state.tickets
    .filter(t => t.status === 'waiting')
    .sort((a, b) => a.number - b.number);

  if (waiting.length === 0) {
    return res.json({ state, ok: false, message: 'No one waiting' });
  }

  const next = state.tickets.find(t => t.number === waiting[0].number);
  next.status = 'serving';
  next.calledAt = Date.now();
  state.nowServing = next.number;

  // Auto-assign the first available volunteer, if any
  const freeVolunteer = state.volunteers.find(v => v.status === 'available');
  if (freeVolunteer) {
    freeVolunteer.status = 'busy';
    freeVolunteer.currentTicket = next.number;
    next.assignedVolunteer = freeVolunteer.id;
  } else {
    next.assignedVolunteer = null;
  }

  saveState();
  res.json({ state, ok: true });
});

app.post('/api/done', (req, res) => {
  const serving = state.tickets.find(t => t.number === state.nowServing);
  if (serving) {
    serving.status = 'done';
    if (serving.assignedVolunteer) {
      const v = state.volunteers.find(v => v.id === serving.assignedVolunteer);
      if (v) { v.status = 'available'; v.currentTicket = null; }
    }
  }
  state.nowServing = null;
  saveState();
  res.json({ state });
});

// ---- Volunteers ----
app.post('/api/volunteers/add', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ state, ok: false, message: 'Name required' });
  state.volunteers.push({ id: makeId(), name, status: 'available', currentTicket: null });
  saveState();
  res.json({ state });
});

app.post('/api/volunteers/:id/remove', (req, res) => {
  const v = state.volunteers.find(v => v.id === req.params.id);
  if (v && v.status === 'busy') {
    return res.status(400).json({ state, ok: false, message: 'This volunteer is currently handling someone — mark them done first.' });
  }
  state.volunteers = state.volunteers.filter(v => v.id !== req.params.id);
  saveState();
  res.json({ state });
});

// Assign (or reassign) whoever is currently "now serving" to a specific volunteer
app.post('/api/assign', (req, res) => {
  const { volunteerId } = req.body;
  const ticket = state.tickets.find(t => t.number === state.nowServing);
  if (!ticket) return res.status(400).json({ state, ok: false, message: 'No one is currently being served' });

  const newVolunteer = state.volunteers.find(v => v.id === volunteerId);
  if (!newVolunteer) return res.status(400).json({ state, ok: false, message: 'Volunteer not found' });
  if (newVolunteer.status === 'busy' && newVolunteer.currentTicket !== ticket.number) {
    return res.status(400).json({ state, ok: false, message: 'That volunteer is already busy with someone else' });
  }

  // Free the previously assigned volunteer, if different
  if (ticket.assignedVolunteer && ticket.assignedVolunteer !== volunteerId) {
    const prev = state.volunteers.find(v => v.id === ticket.assignedVolunteer);
    if (prev) { prev.status = 'available'; prev.currentTicket = null; }
  }

  newVolunteer.status = 'busy';
  newVolunteer.currentTicket = ticket.number;
  ticket.assignedVolunteer = newVolunteer.id;

  saveState();
  res.json({ state, ok: true });
});

app.post('/api/reset', (req, res) => {
  const keptVolunteers = state.volunteers.map(v => ({ ...v, status: 'available', currentTicket: null }));
  state = defaultState();
  state.volunteers = keptVolunteers;
  saveState();
  res.json({ state });
});

app.listen(PORT, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  console.log(`\nQueue server running.\n`);
  console.log(`On this computer, open:`);
  console.log(`  Staff:   http://localhost:${PORT}/staff.html`);
  console.log(`  Kiosk:   http://localhost:${PORT}/kiosk.html`);
  console.log(`  Display: http://localhost:${PORT}/display.html\n`);
  console.log(`From other devices on the same WiFi, use this computer's local IP instead of localhost, e.g.:`);
  Object.values(nets).flat().forEach(net => {
    if (net.family === 'IPv4' && !net.internal) {
      console.log(`  http://${net.address}:${PORT}/kiosk.html`);
    }
  });
  console.log('');
});
