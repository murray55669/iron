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
	constructor (socketId, name, team) {
		this.id = socketId;
		this.team = team;
		this.name = name;
		this.input = {};
		this.clickStart = null;
		this.clickEnd = null;
		this.lastDead = 0;
		this.canRespawn = false;
		this.shotPower = 0;
	}

	respawn () {
		const now = Date.now();
		const minX = this.team === 1 ? 1 : C.MAX_X / 2;
		const maxX = this.team === 1 ? C.MAX_X / 2 : C.MAX_X - 1;
		const minY = this.team === 1 ? 1 : C.MAX_Y / 2;
		const maxY = this.team === 1 ? C.MAX_Y / 2 : C.MAX_Y - 1;

		this.x = util.getRandomInt(minX, maxX);
		this.y = util.getRandomInt(minY, maxY);
		this.lastSpawn = now;
		this.dead = false;
	}
}

class Ball {
	constructor () {
		this.reset();
	}

	reset () {
		this.point = [C.MAX_X / 2, C.MAX_Y / 2];
		this.dir = [0, 0];
		this.team = 0;
		this.caughtBy = [];
		this.lastShot = 0;
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
			self.ball = new Ball();
			self.score = {
				1: 0,
				2: 0
			};
			io.on("connection", (socket) => {
				socket.on("player-new", (data) => {
					const newPlayer = new Player(socket.id, data.name, data.team);
					self.players[socket.id] = newPlayer;
					newPlayer.respawn();
				});

				socket.on("player-input", (data) => {
					const player = self.players[socket.id] || {};
					player.input = data;
				});

				socket.on("disconnect", () => {
					delete self.players[socket.id];
					if (self.ball.caughtBy.length === 1 && self.ball.caughtBy[0] === socket.id) {
						self.ball.caughtBy = [];
						self.ball.team = 0;
					}
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
				p.dir = vMove;
				p.x += vMove[0];
				p.y += vMove[1];
				if (p.x > C.MAX_X) p.x = C.MAX_X;
				if (p.x < C.MIN_X) p.x = C.MIN_X;
				if (p.y > C.MAX_Y) p.y = C.MAX_Y;
				if (p.y < C.MIN_Y) p.y = C.MIN_Y;
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
					if (self.ball.caughtBy.length === 1 && self.ball.caughtBy[0] === p.id) {
						if (p.input.mouseClick) {
							if (!p.clickStart) {
								p.clickStart = now;
							} else {
								p.shotPower = Math.min((now - p.clickStart) / C.TM_MAX_SHOT_CHANNEL, 1);
							}
						} else {
							if (p.clickStart) {
								p.clickEnd = now;
								p.shotPower = 0;
							}
						}
					}
					doMovePlayer(p);
				}
			});
		}

		function doUpdateBall (now) {
			function doCheckCollision (b) {
				const basePos = b.point;
				const endPos = [...basePos];
				mat.vec2.add(endPos, basePos, b.dir);
				// cheeky hack to prevent the ball "stalling" and becoming un-interactable
				// FIXME replace with point-circle intersection check
				if (b.dir[0] === 0 && b.dir[1] === 0) {
					mat.vec2.add(endPos, endPos, [0.1, 0.1]);
				}
				// check for ball-goal collisions
				let inGoal = false;
				const g1 = [C.X_GOAL_1, C.Y_GOAL_1];
				const g2 = [C.X_GOAL_2, C.Y_GOAL_2];
				function checkHandleGoal (goalPoint, team) {
					if (lineSegmentInCircle(basePos, endPos, goalPoint, C.SZ_GOAL)) {
						inGoal = true;
						const nuScore = ++self.score[team];
						if (nuScore >= 5) {
							Object.values(self.players).forEach(p => {
								if (p.team !== team) p.dead = true;
							});
							self.score = {1: 0, 2: 0};
						}
					}
				}
				checkHandleGoal(g2, 1);
				checkHandleGoal(g1, 2);
				if (inGoal) {
					b.reset();
					return;
				}

				// check for player-ball collisions
				Object.values(self.players).forEach(p => {
					if (p.dead) return;
					const pPos = [p.x, p.y];

					if ((now - b.lastShot > C.TM_MIN_SHOT_DUR) && lineSegmentInCircle(basePos, endPos, pPos, C.SZ_PLAYER_BALL_CATCH)) {
						b.team = p.team;
						if (!b.caughtBy.includes(p.id)) b.caughtBy.push(p.id);
					}

					if (lineSegmentInCircle(basePos, endPos, pPos, C.SZ_PLAYER)) {
						const hitPoint = findIntersect(pPos, C.SZ_PLAYER, basePos);
						const scaledNormal = [];
						mat.vec2.sub(scaledNormal, hitPoint, pPos);
						mat.vec2.normalize(scaledNormal, scaledNormal);
						// reflected vector = d - 2(d.n)*n
						const refDir = [];
						const scale = 2 * (mat.vec2.dot(b.dir, scaledNormal));
						mat.vec2.scale(scaledNormal, scaledNormal, scale);
						mat.vec2.sub(refDir, b.dir, scaledNormal);

						// rebound the ball
						b.dir = refDir;

						// add player speed, scaled for the bantz
						const pSpeed = [...p.dir];
						mat.vec2.scale(pSpeed, pSpeed, 2); // TODO tweak scaling
						mat.vec2.add(b.dir, b.dir, pSpeed);
					}
				});

				if (b.caughtBy.length > 1) {
					b.caughtBy = [];
					b.team = 0;
				}
			}

			function doMoveBall (b) {
				function doMove () {
					mat.vec2.add(b.point, b.point, b.dir);
				}

				function doBounce () {
					// handle wall bounces
					const bX = b.point[0] > C.MAX_X || b.point[0] < C.MIN_X;
					const bY = b.point[1] > C.MAX_Y || b.point[1] < C.MIN_Y;
					if (bX || bY) {
						if (bX) {
							b.dir[0] *= -1;
						}
						if (bY) {
							b.dir[1] *= -1;
						}
						doMove();
					}
				}

				function doFixBallSpeed () {
					if (mat.vec2.length(b.dir) > 0.01) {
						mat.vec2.scale(b.dir, b.dir, 0.99);
					} else {
						b.dir = [0, 0];
					}
				}

				function getBallSpeed (clickDuration, maxSpeed, maxDuration) {
					return Math.min(clickDuration / (maxDuration / maxSpeed), maxSpeed);
				}

				if (b.caughtBy.length !== 1) {
					doMove();
					doBounce();
					doFixBallSpeed();
				} else {
					const p = self.players[b.caughtBy[0]];
					if (p && p.input.mousePos) {
						b.dir = [0, 0];

						// keep the ball stuck to the player
						const norm = [];
						mat.vec2.sub(norm, p.input.mousePos, [p.x, p.y]);
						mat.vec2.normalize(norm, norm);
						const newPoint = [];
						mat.vec2.scale(newPoint, norm, C.SZ_PLAYER_BALL_CATCH);
						mat.vec2.add(newPoint, newPoint, [p.x, p.y]);
						b.point = newPoint;

						// fire the ball
						if (p.clickStart && p.clickEnd) {
							const speed = getBallSpeed(p.clickEnd - p.clickStart, C.SPD_MAX_SHOT, C.TM_MAX_SHOT_CHANNEL);
							b.dir = mat.vec2.scale(b.dir, norm, speed);
							b.lastShot = now;
							b.caughtBy = [];
							doMove();
						}
					}
				}
			}

			doCheckCollision(self.ball);
			doMoveBall(self.ball);
		}

		function doSendDataToClients () {
			// TODO only send the data needed, instead of all the internals
			io.sockets.emit("state", {
				players: self.players,
				ball: self.ball,
				score: self.score
			});
		}

		function doTickEndCleanup (now) {
			// clean up player inputs
			Object.values(self.players).forEach(p => {
				if (p.clickStart && p.clickEnd) {
					p.clickStart = null;
					p.clickEnd = null;
				}
			});

			// reset the ball if it's outside the play area
			const bX = self.ball.point[0] > C.MAX_X || self.ball.point[0] < C.MIN_X;
			const bY = self.ball.point[1] > C.MAX_Y || self.ball.point[1] < C.MIN_Y;
			if (bX || bY) {
				self.ball.reset();
			}
		}

		setInterval(() => {
			const now = Date.now();
			doTickStartCleanup();
			doProcessPlayerInput(now);
			doUpdateBall(now);
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