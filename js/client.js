/* eslint-disable no-console */
"use strict";

const SEND_RATE = 1000 / 60;
const $WINDOW = $(window);
const $DOCUMENT = $(document);
const $BODY = $(`body`);

class Ui {
	constructor () {
		this._overlays = [];
	}

	/**
	 * Display the login screen
	 * @returns {Promise<any>} object containing player name and colour
	 */
	login () {
		const self = this;
		return new Promise((resolve) => {
			const $txtIntro = $(`<p>New phone, who dis?</p>`);
			const $wrpIpts = $(`<div/>`);
			const $iptName = $(`<input placeholder="sweet nickname">`).appendTo($wrpIpts);
			const $iptTeam = $(`<select/>`).appendTo($wrpIpts);
			$iptTeam.append(`<option value="1">Red</option>`).append(`<option value="2">Not Red</option>`);
			const $btnGo = $(`<button>Enter</button>`).click(() => {
				const n = $iptName.val();
				const t = Number($iptTeam.val());
				if (n && t && (t === 1 || t === 2)) {
					Ui._closeOverlay(self);
					resolve({name: n, team: t});
				} else self.error(`invalid name or team`);
			});
			self._fullscreenOverlay(self, $txtIntro, $wrpIpts, $btnGo);
		});
	}

	/**
	 * Display an error message
	 * @param e error message
	 */
	error (e) {
		const self = this;
		this._fullscreenOverlay(self, `<p>listen here u lil shit: ${e.message || e}</p>`, $(`<button>Yeah?</button>`).click(() => {
			Ui._closeOverlay(self);
		}))
	}

	/**
	 * Render a fullscreen background, onto which the elements are placed and centred
	 * @param self this Ui instance
	 * @param eles elements to place in the overlay
	 * @private
	 */
	_fullscreenOverlay (self, ...eles) {
		const $over = $(`<div class="overlay-wrp bg1">`).append($(`<div class="overlay-wrp-inn bg2">`).append(eles)).appendTo($BODY);
		self._overlays.push($over);
	}

	/**
	 * Close the most recently opened overlay
	 * @param self this Ui instance
	 * @private
	 */
	static _closeOverlay (self) {
		const $close = self._overlays.pop();
		if ($close) $close.remove();
	}
}

class Game {
	constructor (username, team) {
		this.username = username;
		this.team = team;

		// client state
		this.canvas = null;
		this.$canvas = null;
		this.maxX = null;
		this.maxY = null;
		this.socket = null;
		this.input = {};

		// game state
		this.curPlayer = {};
		this.dead = false;
		this.players = {};
		this.ball = null;
		this.score = null;

		// keybinds
		this.kUp = 87; // W
		this.kLeft = 65; // A
		this.kRight = 68; // S
		this.kDown = 83; // D
		this.kRespawn = 82; // R
	}

	/**
	 * [[ 14 :: Start the game already! ]]
	 */
	play () {
		const self = this;

		this._setup(self);
		this._runLoop(self);
	}

	/**
	 * Initialise client state and networking, add event handlers
	 * @param self this Game
	 * @private
	 */
	_setup (self) {
		self.canvas = document.getElementById("viewport");
		self.$canvas = $(self.canvas);
		self.maxX = self.$canvas.width();
		self.maxY = self.$canvas.height();
		self.canvas.width = self.maxX;
		self.canvas.height = self.maxY;
		self.ctx = self.canvas.getContext("2d");
		self.socket = io();
		self.input = {
			up: false,
			down: false,
			left: false,
			right: false
		};

		$DOCUMENT.on("keydown", (evt) => {
			switch (evt.keyCode) {
				case self.kLeft:
					self.input.left = true;
					break;
				case self.kUp:
					self.input.up = true;
					break;
				case self.kRight:
					self.input.right = true;
					break;
				case self.kDown:
					self.input.down = true;
					break;
				case this.kRespawn:
					self.input.respawn = true;
					break;
			}
		});

		$DOCUMENT.on("keyup", (evt) => {
			switch (evt.keyCode) {
				case self.kLeft:
					self.input.left = false;
					break;
				case self.kUp:
					self.input.up = false;
					break;
				case self.kRight:
					self.input.right = false;
					break;
				case self.kDown:
					self.input.down = false;
					break;
				case this.kRespawn:
					self.input.respawn = false;
					break;
			}
		});

		$WINDOW.on("resize", () => {
			self.maxX = self.$canvas.width();
			self.maxY = self.$canvas.height();
			self.canvas.width = self.maxX;
			self.canvas.height = self.maxY;
		});

		self.$canvas.on("mousedown", (evt) => {
			self.input.mouseClick = util.getCursorPosition(self.$canvas, evt);
		});
		self.$canvas.on("mousemove", (evt) => {
			const point = util.getCursorPosition(self.$canvas, evt);
			self.input.mousePos = self.ptXYIpt(point);
		});
		self.$canvas.on("mouseup", () => {
			self.input.mouseClick = null;
		});

		// join the game
		self.socket.emit("player-new", {
			name: self.username,
			team: self.team
		});

		// data received handler
		self.socket.on("state", (data) => {
			self.players = data.players;
			self.ball = data.ball;
			self.score = data.score;
		});

		// data sending loop
		setInterval(() => {
			self.socket.emit("player-input", self.input);
		}, SEND_RATE);
	}

	/**
	 * Offsets an X-axis point relative to the current player (camera) position
	 * @param point
	 */
	ptX (point) {
		return (this.curPlayer ? point - this.curPlayer.x : point) + this.maxX / 2;
	}

	/**
	 * Offsets a Y-axis point relative to the current player (camera) position
	 * @param point
	 */
	ptY (point) {
		return (this.curPlayer ? point - this.curPlayer.y : point) + this.maxY / 2;
	}

	ptXIpt (point) {
		return (this.curPlayer ? this.curPlayer.x + point : point) - this.maxX / 2;
	}

	ptYIpt (point) {
		return (this.curPlayer ? this.curPlayer.y + point : point) - this.maxY / 2;
	}

	ptXYIpt (point) {
		return [this.ptXIpt(point[0]), this.ptYIpt(point[1])];
	}

	/**
	 * Run the game rendering loop
	 * @param self this Game
	 * @private
	 */
	_runLoop (self) {
		function drawLine (colour, ...pts) {
			self.ctx.strokeStyle = colour;
			self.ctx.beginPath();
			pts.forEach(pt => self.ctx.lineTo(self.ptX(pt[0]), self.ptY(pt[1])));
			self.ctx.stroke();
			self.ctx.closePath();
		}

		function drawCircle (colour, centre, radius) {
			self.ctx.fillStyle = colour;
			self.ctx.beginPath();
			self.ctx.arc(self.ptX(centre[0]), self.ptY(centre[1]), radius, 0, 2 * Math.PI);
			self.ctx.fill();
		}

		let then = 0;
		let fpsSmooth = 0.99; // larger = more smoothing
		let fps = 60; // assume 60 for the first frame, adjust frame-by-frame thereafter
		function tick (now) {
			const deltaTime = now - then;
			then = now;

			self.ctx.clearRect(0, 0, self.maxX, self.maxY);

			// draw walls
			drawLine("#000000", [0, 0], [C.MAX_X, 0], [C.MAX_X, C.MAX_Y], [0, C.MAX_Y], [0, 0]);

			// draw halfway line
			drawLine("#444444", [C.MAX_X / 2, 0], [C.MAX_X / 2, C.MAX_Y]);

			// draw goals
			drawCircle("#ff000066", [C.X_GOAL_1, C.Y_GOAL_1], C.SZ_GOAL);
			drawCircle("#2c33b266", [C.X_GOAL_2, C.Y_GOAL_2], C.SZ_GOAL);

			// handle/draw players
			Object.keys(self.players).forEach(key => {
				const player = self.players[key];
				if (player.id === self.socket.id) self.curPlayer = player;

				// draw lad
				self.ctx.fillStyle = player.team === 1 ? "#ff0000" : "#2c33b2";
				self.ctx.beginPath();
				self.ctx.arc(self.ptX(player.x), self.ptY(player.y), C.SZ_PLAYER, 0, 2 * Math.PI);
				self.ctx.fill();

				// draw outline
				self.ctx.strokeStyle = "#000000";
				self.ctx.beginPath();
				self.ctx.arc(self.ptX(player.x), self.ptY(player.y), C.SZ_PLAYER, 0, 2 * Math.PI);
				self.ctx.stroke();
				self.ctx.closePath();

				// draw name
				self.ctx.fillStyle = "black";
				self.ctx.font = "12px serif";
				self.ctx.fillText(player.name, self.ptX(player.x - 10), self.ptY(player.y + 25));

				// draw power bar
				// outline
				self.ctx.fillStyle = "#000000";
				self.ctx.beginPath();
				self.ctx.lineTo(self.ptX(player.x - 10), self.ptY(player.y - 20));
				self.ctx.lineTo(self.ptX(player.x + 10), self.ptY(player.y - 20));
				self.ctx.lineTo(self.ptX(player.x + 10), self.ptY(player.y - 16));
				self.ctx.lineTo(self.ptX(player.x - 10), self.ptY(player.y - 16));
				self.ctx.fill();
				self.ctx.closePath();
				// content
				self.ctx.fillStyle = "#ffff00";
				self.ctx.beginPath();
				const lineLen = (player.shotPower * 18) - 9;
				self.ctx.lineTo(self.ptX(player.x - 9), self.ptY(player.y - 19));
				self.ctx.lineTo(self.ptX(player.x + lineLen), self.ptY(player.y - 19));
				self.ctx.lineTo(self.ptX(player.x + lineLen), self.ptY(player.y - 17));
				self.ctx.lineTo(self.ptX(player.x - 9), self.ptY(player.y - 17));
				self.ctx.fill();
				self.ctx.closePath();

				if (player.dead) {
					self.ctx.strokeStyle = "#000000";
					self.ctx.beginPath();
					self.ctx.moveTo(self.ptX(player.x - C.SZ_PLAYER), self.ptY(player.y - C.SZ_PLAYER));
					self.ctx.lineTo(self.ptX(player.x + C.SZ_PLAYER), self.ptY(player.y + C.SZ_PLAYER));
					self.ctx.moveTo(self.ptX(player.x - C.SZ_PLAYER), self.ptY(player.y + C.SZ_PLAYER));
					self.ctx.lineTo(self.ptX(player.x + C.SZ_PLAYER), self.ptY(player.y - C.SZ_PLAYER));
					self.ctx.stroke();
					self.ctx.closePath();
				}
			});

			// draw ball
			if (self.ball) {
				const ballCol = self.ball.team === 0 ? "#000000" : self.ball.team === 1 ? "#ff0000" : "#2c33b2";
				self.ctx.fillStyle = ballCol;
				self.ctx.beginPath();
				self.ctx.arc(self.ptX(self.ball.point[0]), self.ptY(self.ball.point[1]), 2, 0, 2 * Math.PI);
				self.ctx.fill();

				// draw tracer FIXME test code
				const p1 = self.ball.point;
				const p2 = [self.ball.point[0] + self.ball.dir[0], self.ball.point[1] + self.ball.dir[1]];
				const m = (p2[1] - p1[1]) / (p2[0] - p1[0]);
				const c = p1[1] - (m * p1[0]);
				// y = mx + c
				// x = (y - c) / m
				const out1 = c < 0 ? [(0 - c) / m, 0] : c > C.MAX_Y ? [(C.MAX_Y - c) / m, C.MAX_Y] : [0, c];
				const y2 = (m * C.MAX_X) + c;
				const out2 = y2 > C.MAX_Y ? [(C.MAX_Y - c) / m, C.MAX_Y] : y2 < 0 ? [(0 - c) / m, 0] : [C.MAX_X, y2];

				self.ctx.strokeStyle = `${ballCol}44`;
				self.ctx.beginPath();
				self.ctx.lineTo(self.ptX(out1[0]), self.ptY(out1[1]));
				self.ctx.lineTo(self.ptX(out2[0]), self.ptY(out2[1]));
				self.ctx.stroke();
				self.ctx.closePath();
			}

			// draw score
			if (self.score) {
				self.ctx.fillStyle = "black";
				self.ctx.font = "16px serif";
				self.ctx.fillText(`SCORE: ${self.score["1"]} - ${self.score["2"]}`, self.maxX / 2, 20);
			}

			// handle player death state change TODO automate/standardise this for all server data?
			if (self.curPlayer.dead) {
				if (!self.dead) {
					// on newly dead
					self.dead = true;
					self._sfx("cantwake.wav", 1);
				}
			} else {
				if (self.dead) {
					self.dead = false;
				}
			}

			// draw death overlay
			if (self.dead) {
				// red overlay
				self.ctx.fillStyle = "#ff000099";
				self.ctx.beginPath();
				self.ctx.lineTo(0, 0);
				self.ctx.lineTo(self.maxX, 0);
				self.ctx.lineTo(self.maxX, self.maxY);
				self.ctx.lineTo(0, self.maxY);
				self.ctx.fill();

				// dead text
				self.ctx.fillStyle = "black";
				self.ctx.font = "52px serif";
				self.ctx.fillText(`W A S T E D`, 260, 326);

				// respawn text
				if (self.curPlayer.canRespawn) {
					self.ctx.font = "24px serif";
					self.ctx.fillText(`Press ${String.fromCharCode(self.kRespawn)} to respawn`, 260, 386);
				}
			}

			// draw FPS
			self.ctx.fillStyle = "black";
			self.ctx.font = "12px serif";
			let curFps = 1000 / deltaTime;
			curFps = (curFps * fpsSmooth) + (fps * (1 - fpsSmooth));
			self.ctx.fillText(`FPS: ${curFps.toFixed(2)}`, 0, 12);
			fps = curFps;

			requestAnimationFrame(tick);
		}
		requestAnimationFrame(tick);
	}

	/**
	 * Play a sound
	 * @param name the name of the sound (filename in /sound/)
	 * @param vol volume between 0.00 and 1.00
	 * @private
	 */
	_sfx (name, vol) {
		const audio = document.createElement("audio");
		audio.volume = vol;
		audio.src = `sound/${name}`;
		audio.loop = false;
		$BODY.append(audio);
		audio.addEventListener("ended", () => {
			audio.parentNode.removeChild(audio);
		});
		audio.play();
	}
}

const ui = new Ui();
ui.login()
	.then((result) => {
		const g = new Game(result.name, result.team);
		g.play();
	});
