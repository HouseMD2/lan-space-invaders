# LAN Space Invaders (Raspberry Pi + Expo Web)

**Play in your browser on the local network.** The Raspberry Pi runs the authoritative game server and also serves the built web client. Players just visit `http://<pi-ip>:4000/` — no installs.

## Layout

lan-space-invaders/
├─ server/ # Node + Socket.IO + static hosting
└─ client/ # Expo (React Native Web) game UI


## Quick Start

### On the Raspberry Pi (first time)
```bash
sudo apt-get update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v

git clone https://github.com/HouseMD2/lan-space-invaders.git
cd lan-space-invaders/server
npm install
npm start
# Server listening on http://0.0.0.0:4000
hostname -I   # note your LAN IP

Build the web client (on any dev machine)
cd lan-space-invaders/client
npm install
npm run build:web   # exports to ../server/public


Copy server/public/ to the Pi if needed, then on the Pi:

cd ~/lan-space-invaders/server
npm start


Open on any device in your Wi-Fi:

http://<PI-IP>:4000/

Controls & Rules

WASD to move, Space to shoot, rounds are 2 minutes.

+100 for asteroids, −50 if hit by asteroid, −25 bumping a player.

5 levels increasing difficulty. Winners get small upgrades next level.

With >2 players, the weakest over the last 3 levels is eliminated each 3rd level.

Optional

Autostart on boot: see server/systemd/lsi-server.service.

LAN-only: enable UFW on Pi and allow port 4000 from your subnet only.

Dev

Client live dev: cd client && npm run web

Server dev: cd server && npm start
