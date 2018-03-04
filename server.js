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

const MIN_SHOT_INTV = 1000 / 3;

const SPD_PLAYER = 5;
const SPD_SHOT = 15;

app.set("port", SERVER_PORT);
app.use("/img", express.static(path.resolve(__dirname, "img")));
app.use("/js", express.static(path.resolve(__dirname, "js")));
app.use("/lib", express.static(path.resolve(__dirname, "lib")));
app.use("/css", express.static(path.resolve(__dirname, "css")));
app.use("/sound", express.static(path.resolve(__dirname, "sound")));


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
			input: {},
			lastShot: 0,
			dead: false
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
	const now = Date.now();
	// process player inputs
	Object.values(players).forEach(p => {
		// do movement
		const vMove = [(p.input.right || 0) - (p.input.left || 0), (p.input.down || 0) - (p.input.up || 0)];
		mat.vec2.scale(vMove, mat.vec2.normalize(vMove, vMove), SPD_PLAYER);
		p.x += vMove[0];
		p.y += vMove[1];
		if (p.x > MAX_X) p.x = MAX_X;
		if (p.x < MIN_X) p.x = MIN_X;
		if (p.y > MAX_Y) p.y = MAX_Y;
		if (p.y < MIN_Y) p.y = MIN_Y;

		// fire shots
		if (p.input.mouseClick && (now - p.lastShot) > MIN_SHOT_INTV) {
			p.lastShot = now;
			const vDir = [
				p.input.mouseClick[0] - p.x,
				p.input.mouseClick[1] - p.y
			];
			const point = [p.x + vDir[0], p.y + vDir[1]];
			mat.vec2.scale(vDir, mat.vec2.normalize(vDir, vDir), SPD_SHOT);
			shots[shotIndex++] = {
				point: point,
				dir: vDir,
				nu: true,
				bounces: 0
			};
		}
	});

	// update shots
	Object.keys(shots).forEach(id => {
		const s = shots[id];
		// check for player-shot collisions
		Object.values(players).forEach(p => {
			const basePos = s.point;
			const endPos = [...basePos];
			mat.vec2.add(endPos, basePos, s.dir);

			if (lineInCircle(basePos[0], basePos[1], endPos[0], endPos[1], s.point[0], s.point[1], 10)) {
				p.dead = true;
			}
		});

		// move shots
		mat.vec2.add(s.point, s.point, s.dir);
		const bX = s.point[0] > MAX_X || s.point[0] < MIN_X;
		const bY = s.point[1] > MAX_Y || s.point[1] < MIN_Y;
		if (bX || bY) {
			if (s.bounces > 1) delete shots[id];
			if (bX) {
				s.dir[0] *= -1;
			}
			if (bY) {
				s.dir[1] *= -1;
			}
			s.bounces++;
			mat.vec2.add(s.point, s.point, s.dir);
		}
	});

	// send data to clients
	io.sockets.emit("state", {
		players: players,
		shots: shots
	});

	// cleanup
	Object.keys(shots).forEach(id => {
		shots[id].nu = false;
	});
}, TICK_RATE);

function pointInCircle (x, y, cx, cy, radius) {
	const distancesquared = (x - cx) * (x - cx) + (y - cy) * (y - cy);
	return distancesquared <= radius * radius;
}

function lineInCircle (x1, y1, x2, y2, xC, yC, rad) {
	x1 -= xC;
	x2 -= xC;
	y1 -= yC;
	y2 -= yC;
	const dx = x2 - x1;
	const dy = y2 - y1;
	const drSquared = (dx * dx) + (dy * dy);
	const D = x1 * y2 - x2 * y1;
	return rad * rad * drSquared > (D * D);
}