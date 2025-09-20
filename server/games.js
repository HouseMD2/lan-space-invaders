// Simple authoritative game state + loop
const p = plist[i];
for (const a of asteroids) {
const dx = p.x - a.x, dy = p.y - a.y;
const r = a.r + 12;
if (dx*dx + dy*dy <= r*r) {
p.hp -= 25;
p.levelScore = (p.levelScore||0) - 50; // penalty
if (p.hp <= 0) {
p.x = WORLD.width*0.5; p.y = WORLD.height*0.8; p.vx=0; p.vy=0; p.hp = 100; // respawn
}
}
}
for (let j=i+1;j<plist.length;j++) {
const q = plist[j];
const dx = p.x - q.x, dy = p.y - q.y;
const r = 24;
if (dx*dx + dy*dy <= r*r) {
// bump both
p.vx += dx*0.05; p.vy += dy*0.05;
q.vx -= dx*0.05; q.vy -= dy*0.05;
p.levelScore = (p.levelScore||0) - 25;
q.levelScore = (q.levelScore||0) - 25;
}
}
}


// Level timeout
if (now - levelStart >= LEVEL_TIME_MS) {
endLevel();
}
}


// Broadcast snapshots
function snapshot() {
const payload = {
world: WORLD,
players: [...players.values()].map(p => ({
id: p.id, name: p.name, x: p.x, y: p.y, hp: p.hp,
levelScore: p.levelScore||0, totalScore: p.totalScore||0
})),
bullets: bullets,
asteroids: asteroids,
running, level: LEVELS[Math.min(levelIndex, LEVELS.length-1)].id,
timeLeftMs: running ? Math.max(0, LEVEL_TIME_MS - (Date.now()-levelStart)) : 0
};
io.emit('state', payload);
}


// Socket handlers
io.on('connection', socket => {
socket.on('join', ({ name }) => {
if (!name || typeof name !== 'string') return;
const p = {
id: socket.id, name: name.slice(0,20), x: 100, y: 700, vx:0, vy:0, hp:100,
upgrades: { speed: 1.0, fireRate: 280 },
_lastShotAt: 0, levelScore: 0, totalScore: 0
};
players.set(socket.id, p);
io.emit('player:added', { id: p.id, name: p.name });
});


socket.on('input', (inp) => {
inputs.set(socket.id, {
x: Math.max(-1, Math.min(1, +inp.x||0)),
y: Math.max(-1, Math.min(1, +inp.y||0)),
shoot: !!inp.shoot
});
});


socket.on('start', () => {
if (players.size >= 2 && !running) {
// reset per-level scores
for (const p of players.values()) p.levelScore = 0;
startLevel();
}
});


socket.on('disconnect', () => {
players.delete(socket.id);
inputs.delete(socket.id);
io.emit('player:removed', { id: socket.id });
if (players.size < 2 && running) endLevel();
});
});


// Main loops
setInterval(() => step(1000/TICK_HZ), 1000/TICK_HZ);
setInterval(() => snapshot(), 1000/SNAPSHOT_HZ);
}