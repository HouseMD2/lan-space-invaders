export function createGame(io) {
  const TICK_HZ = 60;
  const SNAPSHOT_HZ = 20;
  const LEVEL_TIME_MS = 2 * 60 * 1000;

  const WORLD = { width: 1200, height: 800 };
  const LEVELS = [
    { id: 1, asteroids: 10, asteroidSpeed: 1.5, spawnMs: 2000 },
    { id: 2, asteroids: 14, asteroidSpeed: 1.8, spawnMs: 1700 },
    { id: 3, asteroids: 18, asteroidSpeed: 2.1, spawnMs: 1500 },
    { id: 4, asteroids: 22, asteroidSpeed: 2.5, spawnMs: 1200 },
    { id: 5, asteroids: 28, asteroidSpeed: 3.0, spawnMs: 1000 }
  ];

  const players = new Map();
  let bullets = [];
  let asteroids = [];
  let inputs = new Map();

  let levelIndex = 0;
  let running = false;
  let levelStart = 0;
  let levelNumber = 0;
  let levelHistory = [];

  function resetForLevel() {
    bullets = [];
    asteroids = [];
    for (const p of players.values()) {
      p.x = WORLD.width * (0.3 + Math.random() * 0.4);
      p.y = WORLD.height * (0.3 + Math.random() * 0.4);
      p.vx = 0; p.vy = 0;
      p.hp = 100;
    }
  }

  function startLevel() {
    running = true;
    levelStart = Date.now();
    levelNumber += 1;
    const cfg = LEVELS[Math.min(levelIndex, LEVELS.length - 1)];
    resetForLevel();
    io.emit('level:start', { level: cfg.id, number: levelNumber, durationMs: LEVEL_TIME_MS });
  }

  function endLevel() {
    running = false;
    const scoreEntries = [...players.values()].map(p => [p.id, p.levelScore || 0]).sort((a,b)=>b[1]-a[1]);
    const winnerId = scoreEntries[0]?.[0] ?? null;
    const scores = Object.fromEntries(scoreEntries);
    levelHistory.push({ winnerId, scores });

    if (winnerId && players.has(winnerId)) {
      const w = players.get(winnerId);
      w.upgrades.speed = Math.min(w.upgrades.speed + 0.1, 1.6);
      w.upgrades.fireRate = Math.max(w.upgrades.fireRate * 0.9, 150);
    }

    if (levelHistory.length >= 3 && players.size > 2) {
      const aggregate = {};
      for (const p of players.values()) aggregate[p.id] = 0;
      for (let i = levelHistory.length - 3; i < levelHistory.length; i++) {
        const h = levelHistory[i];
        for (const [pid, pts] of Object.entries(h.scores)) aggregate[pid] = (aggregate[pid] || 0) + pts;
      }
      const weakestId = Object.entries(aggregate).sort((a,b)=>a[1]-b[1])[0]?.[0];
      if (weakestId && players.has(weakestId)) {
        io.to(weakestId).emit('eliminated');
        players.delete(weakestId);
        inputs.delete(weakestId);
        io.emit('player:removed', { id: weakestId });
      }
    }

    io.emit('level:end', { winnerId, scores });

    if (players.size >= 2) {
      levelIndex = Math.min(levelIndex + 1, LEVELS.length - 1);
      setTimeout(startLevel, 2500);
    } else {
      io.emit('game:over');
    }
  }

  function addAsteroid(cfg) {
    const edge = Math.floor(Math.random()*4);
    let x,y,vx,vy;
    const speed = cfg.asteroidSpeed + Math.random()*0.8;
    if (edge === 0)      { x = 0; y = Math.random()*WORLD.height; vx = speed; vy = (Math.random()-0.5)*speed; }
    else if (edge === 1) { x = WORLD.width; y = Math.random()*WORLD.height; vx = -speed; vy = (Math.random()-0.5)*speed; }
    else if (edge === 2) { x = Math.random()*WORLD.width; y = 0; vx = (Math.random()-0.5)*speed; vy = speed; }
    else                 { x = Math.random()*WORLD.width; y = WORLD.height; vx = (Math.random()-0.5)*speed; vy = -speed; }
    asteroids.push({ id: 'a'+Date.now()+Math.random(), x,y,vx,vy, r: 18 + Math.random()*12 });
  }

  function step() {
    if (!running) return;
    const now = Date.now();
    const cfg = LEVELS[Math.min(levelIndex, LEVELS.length - 1)];

    if (!step._spawnAt) step._spawnAt = now;
    if (asteroids.length < cfg.asteroids && now - step._spawnAt >= cfg.spawnMs) {
      addAsteroid(cfg);
      step._spawnAt = now;
    }

    for (const p of players.values()) {
      const inp = inputs.get(p.id) || { x:0, y:0, shoot:false };
      const accel = 0.6 * p.upgrades.speed;
      p.vx += inp.x * accel;
      p.vy += inp.y * accel;
      p.vx *= 0.95; p.vy *= 0.95;
      p.x += p.vx; p.y += p.vy;
      p.x = Math.max(0, Math.min(WORLD.width, p.x));
      p.y = Math.max(0, Math.min(WORLD.height, p.y));

      const canShoot = now - (p._lastShotAt||0) >= p.upgrades.fireRate;
      if (inp.shoot && canShoot) {
        p._lastShotAt = now;
        bullets.push({ id:'b'+now+Math.random(), owner: p.id, x: p.x, y: p.y-14, vx: 0, vy: -8 });
      }
    }

    bullets.forEach(b => { b.x += b.vx; b.y += b.vy; });
    bullets = bullets.filter(b => b.x>=-20 && b.x<=WORLD.width+20 && b.y>=-20 && b.y<=WORLD.height+20);

    for (const a of asteroids) { a.x += a.vx; a.y += a.vy; }
    asteroids = asteroids.filter(a => a.x>-50 && a.x<WORLD.width+50 && a.y>-50 && a.y<WORLD.height+50);

    const killAst = new Set();
    const killBul = new Set();
    for (const b of bullets) {
      for (const a of asteroids) {
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx*dx + dy*dy <= a.r*a.r) {
          killAst.add(a.id); killBul.add(b.id);
          const owner = players.get(b.owner);
          if (owner) {
            owner.levelScore = (owner.levelScore||0) + 100;
            owner.totalScore = (owner.totalScore||0) + 100;
          }
        }
      }
    }
    bullets = bullets.filter(b => !killBul.has(b.id));
    asteroids = asteroids.filter(a => !killAst.has(a.id));

    const plist = [...players.values()];
    for (let i=0;i<plist.length;i++) {
      const p = plist[i];
      for (const a of asteroids) {
        const dx = p.x - a.x, dy = p.y - a.y;
        const r = a.r + 12;
        if (dx*dx + dy*dy <= r*r) {
          p.hp -= 25;
          p.levelScore = (p.levelScore||0) - 50;
          if (p.hp <= 0) {
            p.x = WORLD.width*0.5; p.y = WORLD.height*0.8; p.vx=0; p.vy=0; p.hp = 100;
          }
        }
      }
      for (let j=i+1;j<plist.length;j++) {
        const q = plist[j];
        const dx = p.x - q.x, dy = p.y - q.y;
        const r = 24;
        if (dx*dx + dy*dy <= r*r) {
          p.vx += dx*0.05; p.vy += dy*0.05;
          q.vx -= dx*0.05; q.vy -= dy*0.05;
          p.levelScore = (p.levelScore||0) - 25;
          q.levelScore = (q.levelScore||0) - 25;
        }
      }
    }

    if (now - levelStart >= LEVEL_TIME_MS) endLevel();
  }

  function snapshot() {
    const payload = {
      world: WORLD,
      players: [...players.values()].map(p => ({
        id: p.id, name: p.name, x: p.x, y: p.y, hp: p.hp,
        levelScore: p.levelScore||0, totalScore: p.totalScore||0
      })),
      bullets,
      asteroids,
      running,
      level: LEVELS[Math.min(levelIndex, LEVELS.length-1)].id,
      timeLeftMs: running ? Math.max(0, LEVEL_TIME_MS - (Date.now()-levelStart)) : 0
    };
    io.emit('state', payload);
  }

  io.on('connection', socket => {
    socket.on('join', ({ name }) => {
      if (!name || typeof name !== 'string') return;
      const p = {
        id: socket.id, name: name.slice(0,20),
        x: 100, y: 700, vx:0, vy:0, hp:100,
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

  setInterval(step, 1000 / TICK_HZ);
  setInterval(snapshot, 1000 / SNAPSHOT_HZ);
}
