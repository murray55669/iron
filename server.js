/* eslint-disable no-console */
"use strict";
// Dependencies
const express = require("express");
const http = require("http");
const path = require("path");
const socketIO = require("socket.io");
const mat = require("gl-matrix");
const utils = require("./js/utils");

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
const SPD_SHOT = 7;

const SZ_PLAYER = 10;

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
			id: socket.id,
			x: 300,
			y: 300,
			color: data.color,
			oppColor: utils.invertColor(data.color),
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
		if (p.dead) return; // p dead, bruh

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
			mat.vec2.normalize(vDir, vDir);
			// ensure the shot starts outside the player
			const temp = [];
			mat.vec2.scale(temp, vDir, SZ_PLAYER + 1);
			const startPoint = [p.x, p.y];
			mat.vec2.add(startPoint, startPoint, temp);
			mat.vec2.scale(vDir, vDir, SPD_SHOT); // pre-scale the movement vector, instead of doing it every loop
			shots[shotIndex++] = {
				point: startPoint,
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
			const pPos = [p.x, p.y];

			if (lineSegmentInCircle(basePos, endPos, pPos, SZ_PLAYER)) {
				p.dead = true;
				delete shots[id];
			}
		});

		// move shots
		mat.vec2.add(s.point, s.point, s.dir);
		const bX = s.point[0] > MAX_X || s.point[0] < MIN_X;
		const bY = s.point[1] > MAX_Y || s.point[1] < MIN_Y;
		if (bX || bY) {
			if (s.bounces > 1) {
				delete shots[id];
				return;
			}
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

function lineSegmentInCircle (p1, p2, pC, radC) {
	// https://stackoverflow.com/a/1084899/5987433
	const d = [];
	mat.vec2.sub(d, p2, p1);
	const f = [];
	mat.vec2.sub(f, p1, pC);

	const a = mat.vec2.dot(d, d);
	const b = 2 * mat.vec2.dot(f, d);
	const c = mat.vec2.dot(f, f) - radC * radC;

	let discriminant = b * b - 4 * a * c;
	if (discriminant < 0) {
		// no intersection
		return false;
	} else {
		// ray didn't totally miss sphere, so there is a solution to the equation.
		discriminant = Math.sqrt(discriminant);
		// either solution may be on or off the ray so need to test both t1 is always the smaller value, because BOTH discriminant and a are nonnegative.
		const t1 = (-b - discriminant) / (2 * a);
		const t2 = (-b + discriminant) / (2 * a);

		// 4x HIT cases:
		//          -o->             --|-->  |            |  --|->            | -> |
		// Impale(t1 hit,t2 hit), Poke(t1 hit,t2>1), ExitWound(t1<0, t2 hit), CompletelyInside(t1<0, t2>1)

		// 2x HIT cases:
		//       ->  o                     o ->
		// FallShort (t1>1,t2>1), Past (t1<0,t2<0)

		if (t1 >= 0 && t1 <= 1) {
			// t1 is the intersection, and it's closer than t2 (since t1 uses -b - discriminant)
			// Impale, Poke
			return true;
		}
		// here t1 didn't intersect so we are either started inside the sphere or completely past it
		if (t2 >= 0 && t2 <= 1) {
			// ExitWound
			return true;
		}
		if (t1 < 0 && t2 > 1) {
			// CompletelyInside
			return true;
		}
		// no intersection: FallShort, Past
		return false;
	}
}