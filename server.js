/* eslint-disable no-console */
"use strict";
// Dependencies
const express = require("express");
const http = require("http");
const path = require("path");
const socketIO = require("socket.io");
const mat = require("gl-matrix");
const app = express();
const server = http.Server(app);
const io = socketIO(server);

const TICK_RATE = 1000 / 60;
const SERVER_PORT = process.env.PORT || 1337;

const MAX_X = 800;
const MIN_X = 0;
const MAX_Y = 600;
const MIN_Y = 0;

app.set("port", SERVER_PORT);
app.use("/img", express.static(path.resolve(__dirname, "img")));
app.use("/js", express.static(path.resolve(__dirname, "js")));
app.use("/lib", express.static(path.resolve(__dirname, "lib")));
app.use("/css", express.static(path.resolve(__dirname, "css")));

// Routing
app.get("/", (request, response) => {
	response.sendFile(path.join(__dirname, "index.html"));
});

// Starts the server.
server.listen(SERVER_PORT, () => {
	console.log(`Starting server on port ${SERVER_PORT}`);
});

// Add the WebSocket handlers
const players = {};
let shotIndex = 0;
const shots = {};
io.on("connection", (socket) => {
	socket.on("player-new", (data) => {
		players[socket.id] = {
			x: 300,
			y: 300,
			color: data.color,
			name: data.name,
			input: {}
		};
	});
	socket.on("player-input", (data) => {
		const player = players[socket.id] || {};
		player.input = data;
	});
	socket.on("disconnect", () => {
		delete players[socket.id];
	});
});

setInterval(() => {
	Object.values(players).forEach(p => {
		const vMove = [(p.input.right || 0) - (p.input.left || 0), (p.input.down || 0) - (p.input.up || 0)];
		mat.vec2.scale(vMove, mat.vec2.normalize(vMove, vMove), 5);
		p.x += vMove[0];
		p.y += vMove[1];
		if (p.x > MAX_X) p.x = MAX_X;
		if (p.x < MIN_X) p.x = MIN_X;
		if (p.y > MAX_Y) p.y = MAX_Y; 
		if (p.y < MIN_Y) p.y = MIN_Y;
		
		if (p.input.mouseClick) {
			const vDir = [
				p.input.mouseClick[0] - p.x,
				p.input.mouseClick[1] - p.y
			];
			mat.vec2.scale(vDir, mat.vec2.normalize(vDir, vDir), 25);
			shots[shotIndex++] = {
				point: [p.x, p.y],
				dir: vDir
			};
		}
	});
	
	Object.keys(shots).forEach(id => {
		const s = shots[id];
		mat.vec2.add(s.point, s.point, s.dir);
		if (s.x > MAX_X || s.y > MAX_Y || s.x < MIN_X || s.y < MIN_Y) {
			delete shots[id];
			return;
		}
	});

	io.sockets.emit("state", {
		players: players,
		shots: shots
	});
}, TICK_RATE);