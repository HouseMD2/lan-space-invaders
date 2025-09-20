import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createGame } from './game.js';


const app = express();
app.use(cors());


app.get('/', (_req, res) => res.send('LAN Space Invaders server OK'));


const server = createServer(app);
const io = new Server(server, {
cors: { origin: true, credentials: true }
});


createGame(io);


const PORT = process.env.PORT || 4000; // bind only to LAN
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
console.log(`Server listening on http://${HOST}:${PORT}`);
});