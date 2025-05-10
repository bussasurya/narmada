const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const PORT = 3000;

app.use(express.static('public'));

// Load and transform dustbin data
let dustbins = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, 'dustbins.json'), 'utf8');
  const data = JSON.parse(raw);

  if (!data.dustbins || !Array.isArray(data.dustbins)) {
    throw new Error('Invalid JSON structure: "dustbins" array missing');
  }

  dustbins = data.dustbins.map(bin => ({
    id: bin.id,
    lat: bin.location.coordinates.latitude,
    lng: bin.location.coordinates.longitude,
    address: [
      bin.location.address,
      bin.location.area,
      bin.location.city || "",
      bin.location.district || ""
    ].filter(Boolean).join(", "),
    fill_level: bin.binDetails.fillLevel,
    capacity: bin.binDetails.capacity,
    wasteType: bin.binDetails.wasteType,
    maintenanceStatus: bin.maintenance.status
  }));

} catch (err) {
  console.error('Error loading dustbins.json:', err.message);
  process.exit(1);
}

// Haversine distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Find nearest dustbin with distance
function findNearestDustbin(userLat, userLon) {
  let nearest = null;
  let minDist = Infinity;

  for (let bin of dustbins) {
    const dist = calculateDistance(userLat, userLon, bin.lat, bin.lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = {
        ...bin,
        distance: dist
      };
    }
  }
  return nearest;
}

// Socket.IO logic
io.on('connection', (socket) => {
  socket.emit('initialData', dustbins);

  socket.on('positionUpdate', (coords) => {
    const nearest = findNearestDustbin(coords[0], coords[1]);
    socket.emit('nearestBin', nearest);
  });

  // Simulate fill level changes (slower)
  setInterval(() => {
    dustbins = dustbins.map(bin => {
      // Only allow fill level up to 90% (never 100%)
      let new_fill = bin.fill_level + Math.random() * 0.3; // SLOW FILL
      if (new_fill > 90) new_fill = 90 - Math.random() * 5; // Randomly cap between 85-90%
      return {
        ...bin,
        fill_level: new_fill
      };
    });
    io.emit('dataUpdate', dustbins);
  }, 5000); // every 5 seconds
});
// Add this route for manual reset (e.g., via browser or Postman)
app.get('/reset-bins', (req, res) => {
  dustbins = dustbins.map(bin => ({
    ...bin,
    fill_level: 0
  }));
  io.emit('dataUpdate', dustbins); // Notify all clients
  res.send('All bins reset to zero!');
});


server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
