/* eslint-disable no-console */
"use strict";
// Dependencies
const express = require("express");
const http = require("http");
const path = require("path");
const socketIO = require("socket.io");
const mat = require("gl-matrix");
const util = require("./js/util");
const C = require("./js/const");

const app = express();
const server = http.Server(app);
const io = socketIO(server);

const TICK_RATE = 1000 / 60;
const SERVER_PORT = process.env.PORT || 1337;

const MIN_SHOT_INTV = 1000 / 3;

const SPD_PLAYER = 5;
const SPD_SHOT = 1; // FIXME test code; restore (to 7)

const TM_SPAWN_PROT = 1000;
const TM_DEATH_COOLOFF = 2000;

class Player {
	constructor (socketId, name, color) {
		this.id = socketId;
		this.color = color;
		this.oppColor = util.invertColor(color);
		this.name = name;
		this.input = {};
		this.lastShot = 0;
		this.lastDead = 0;
		this.canRespawn = false;
	}

	respawn () {
		const now = Date.now();
		this.x = util.getRandomInt(C.MIN_X + 50, C.MAX_X - 50);
		this.y = util.getRandomInt(C.MIN_Y + 50, C.MAX_Y - 50);
		this.lastSpawn = now;
		this.dead = false;
		this.shield = true;
	}
}

class GameServer {
	start () {
		const self = this;

		this._setup(self);
		this._runLoop(self);
	}

	_setup (self) {
		function doSetupRouting () {
			app.use("/img", express.static(path.resolve(__dirname, "img")));
			app.use("/js", express.static(path.resolve(__dirname, "js")));
			app.use("/lib", express.static(path.resolve(__dirname, "lib")));
			app.use("/css", express.static(path.resolve(__dirname, "css")));
			app.use("/sound", express.static(path.resolve(__dirname, "sound")));

			app.get("/", (request, response) => {
				response.sendFile(path.join(__dirname, "index.html"));
			});
		}

		function doStartServer () {
			server.listen(SERVER_PORT, () => {
				console.log(`Starting server on port ${SERVER_PORT}`);
			});
		}

		function doAddSocketHandlers () {
			self.players = {};
			self.shotIndex = 0;
			self.shots = {};
			io.on("connection", (socket) => {
				socket.on("player-new", (data) => {
					const newPlayer = new Player(socket.id, data.name, data.color);
					self.players[socket.id] = newPlayer;
					newPlayer.respawn();
				});

				socket.on("player-input", (data) => {
					const player = self.players[socket.id] || {};
					player.input = data;
				});

				socket.on("disconnect", () => {
					delete self.players[socket.id];
				});
			});
		}

		app.set("port", SERVER_PORT);
		doSetupRouting();
		doStartServer();
		doAddSocketHandlers();
	}

	_runLoop (self) {
		function doTickStartCleanup () {
			Object.values(self.players).forEach(p => {
				p.canRespawn = false;
			});
		}

		function doProcessPlayerInput (now) {
			function doMovePlayer (p) {
				const vMove = [(p.input.right || 0) - (p.input.left || 0), (p.input.down || 0) - (p.input.up || 0)];
				mat.vec2.scale(vMove, mat.vec2.normalize(vMove, vMove), SPD_PLAYER);
				p.x += vMove[0];
				p.y += vMove[1];
				if (p.x > C.MAX_X) p.x = C.MAX_X;
				if (p.x < C.MIN_X) p.x = C.MIN_X;
				if (p.y > C.MAX_Y) p.y = C.MAX_Y;
				if (p.y < C.MIN_Y) p.y = C.MIN_Y;
			}

			function doFireShot (p) {
				if (p.input.mouseClick && (now - p.lastShot) > MIN_SHOT_INTV) {
					if (Object.keys(self.shots).length) return; // FIXME test code
					p.lastShot = now;
					const vDir = [
						p.input.mouseClick[0] - p.x,
						p.input.mouseClick[1] - p.y
					];
					mat.vec2.normalize(vDir, vDir);
					// ensure the shot starts outside the player
					const temp = [];
					mat.vec2.scale(temp, vDir, C.SZ_PLAYER + 1);
					const startPoint = [p.x, p.y];
					mat.vec2.add(startPoint, startPoint, temp);
					mat.vec2.scale(vDir, vDir, SPD_SHOT); // pre-scale the movement vector, instead of doing it every loop
					self.shots[self.shotIndex++] = {
						point: startPoint,
						dir: vDir,
						isNew: true,
						bounces: 2
					};
				}
			}

			function doRespawn (p) {
				if (p.lastDead < (now - TM_DEATH_COOLOFF)) {
					if (p.input.respawn) {
						p.respawn();
					} else {
						p.canRespawn = true;
					}
				}
			}

			Object.values(self.players).forEach(p => {
				if (p.dead) {
					doRespawn(p);
				}

				if (!p.dead) {
					doMovePlayer(p);
					doFireShot(p);
				}
			});
		}

		function doUpdateShots (now) {
			function doCheckCollision (id, s) {
				// check for player-shot collisions
				Object.values(self.players).forEach(p => {
					const basePos = s.point;
					const endPos = [...basePos];
					mat.vec2.add(endPos, basePos, s.dir);
					const pPos = [p.x, p.y];

					if (lineSegmentInCircle(basePos, endPos, pPos, C.SZ_PLAYER)) {
						if (p.shield) {
							const hitPoint = findIntersect(pPos, C.SZ_PLAYER, basePos);
							const scaledNormal = [];
							mat.vec2.sub(scaledNormal, hitPoint, pPos);
							mat.vec2.normalize(scaledNormal, scaledNormal);
							// reflected vector = d - 2(d.n)*n
							const refDir = [];
							const scale = 2 * (mat.vec2.dot(s.dir, scaledNormal));
							mat.vec2.scale(scaledNormal, scaledNormal, scale);
							mat.vec2.sub(refDir, s.dir, scaledNormal);

							// rebound the shot
							s.dir = refDir;
						} else {
							p.dead = true;
							p.lastDead = now;
							delete self.shots[id];
						}
					}
				});
			}

			function doMoveShot (id, s) {
				mat.vec2.add(s.point, s.point, s.dir);

				// handle wall bounces
				const bX = s.point[0] > C.MAX_X || s.point[0] < C.MIN_X;
				const bY = s.point[1] > C.MAX_Y || s.point[1] < C.MIN_Y;
				if (bX || bY) {
					if (s.bounces <= 0) {
						delete self.shots[id];
						return;
					}
					if (bX) {
						s.dir[0] *= -1;
					}
					if (bY) {
						s.dir[1] *= -1;
					}
					// s.bounces--; // FIXME test code; restore
					mat.vec2.add(s.point, s.point, s.dir);
				}
			}

			Object.keys(self.shots).forEach(id => {
				const s = self.shots[id];
				doCheckCollision(id, s);
				doMoveShot(id, s);
			});
		}

		function doSendDataToClients () {
			io.sockets.emit("state", {
				players: self.players,
				shots: self.shots
			});
		}

		function doTickEndCleanup (now) {
			Object.values(self.players).forEach(p => {
				if (p.lastSpawn < (now - TM_SPAWN_PROT)) {
					// p.shield = false; // FIXME test code; restore
				}
			});

			Object.keys(self.shots).forEach(id => {
				self.shots[id].isNew = false;
			});
		}

		setInterval(() => {
			const now = Date.now();
			doTickStartCleanup();
			doProcessPlayerInput(now);
			doUpdateShots(now);
			doSendDataToClients();
			doTickEndCleanup(now);
		}, TICK_RATE);
	}
}

const gameServer = new GameServer();
gameServer.start();

// QUICK MAFS TODO refactor this?
/**
 * Finds the intersection between a circles border
 * and a line from the origin to the otherLineEndPoint.
 * @param  {Array} origin            - center of the circle and start of the line
 * @param  {number} radius            - radius of the circle
 * @param  {Array} otherLineEndPoint - end of the line
 * @return {Array}                   - point of the intersection
 */
function findIntersect (origin, radius, otherLineEndPoint) {
	const v = [];
	mat.vec2.sub(v, otherLineEndPoint, origin);

	const lineLength = mat.vec2.length(v);
	if (lineLength === 0) throw new Error("Length has to be positive");
	mat.vec2.normalize(v, v);
	mat.vec2.scale(v, v, radius);
	const out = [];
	mat.vec2.add(out, origin, v);
	return out;
}
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