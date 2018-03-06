/* eslint-disable no-console */
"use strict";

const SEND_RATE = 1000 / 60;
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
			const $iptColor = $(`<input type="color" value="#888888">`).appendTo($wrpIpts);
			const $btnGo = $(`<button>Enter</button>`).click(() => {
				const n = $iptName.val();
				const c = $iptColor.val();
				if (n && c) {
					Ui._closeOverlay(self);
					resolve({name: n, color: c});
				} else self.error(`invalid name or colour`);
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
	constructor (username, color) {
		this.username = username;
		this.color = color;

		// client state
		this.canvas = null;
		this.$canvas = null;
		this.socket = null;
		this.input = {};

		// game state
		this.curPlayer = {};
		this.dead = false;
		this.players = {};
		this.shots = {};

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
		self.canvas.width = C.MAX_X;
		self.canvas.height = C.MAX_Y;
		self.ctx = self.canvas.getContext("2d");
		self.$canvas = $(self.canvas);
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

		self.$canvas.on("mousedown", (evt) => {
			self.input.mouseClick = util.getCursorPosition(self.$canvas, evt);
		});
		self.$canvas.on("mousemove", (evt) => {
			if (self.input.mouseClick) {
				self.input.mouseClick = util.getCursorPosition(self.$canvas, evt);
			}
		});
		self.$canvas.on("mouseup", () => {
			self.input.mouseClick = null;
		});

		// join the game
		self.socket.emit("player-new", {
			name: self.username,
			color: self.color
		});

		// data received handler
		self.socket.on("state", (data) => {
			self.players = data.players;
			self.shots = data.shots;
		});

		// data sending loop
		setInterval(() => {
			self.socket.emit("player-input", self.input);
		}, SEND_RATE);
	}

	/**
	 * Run the game rendering loop
	 * @param self this Game
	 * @private
	 */
	_runLoop (self) {
		let then = 0;
		let fpsSmooth = 0.99; // larger = more smoothing
		let fps = 60; // assume 60 for the first frame, adjust frame-by-frame thereafter
		function tick (now) {
			const deltaTime = now - then;
			then = now;

			self.ctx.clearRect(0, 0, C.MAX_X, C.MAX_Y);

			// handle/draw players
			Object.keys(self.players).forEach(key => {
				const player = self.players[key];
				if (player.id === self.socket.id) self.curPlayer = player;

				self.ctx.fillStyle = player.color;
				self.ctx.beginPath();
				self.ctx.arc(player.x, player.y, C.SZ_PLAYER, 0, 2 * Math.PI);
				self.ctx.fill();

				self.ctx.strokeStyle = player.oppColor;
				self.ctx.beginPath();
				self.ctx.arc(player.x, player.y, C.SZ_PLAYER, 0, 2 * Math.PI);
				self.ctx.stroke();
				self.ctx.closePath();

				self.ctx.fillStyle = "black";
				self.ctx.font = "12px serif";
				self.ctx.fillText(player.name, player.x - 10, player.y + 25);

				if (player.dead) {
					self.ctx.strokeStyle = player.oppColor;
					self.ctx.beginPath();
					self.ctx.moveTo(player.x - C.SZ_PLAYER, player.y - C.SZ_PLAYER);
					self.ctx.lineTo(player.x + C.SZ_PLAYER, player.y + C.SZ_PLAYER);
					self.ctx.moveTo(player.x - C.SZ_PLAYER, player.y + C.SZ_PLAYER);
					self.ctx.lineTo(player.x + C.SZ_PLAYER, player.y - C.SZ_PLAYER);
					self.ctx.stroke();
					self.ctx.closePath();
				}

				if (player.shield) {
					self.ctx.fillStyle = "#28b8e277";
					self.ctx.beginPath();
					self.ctx.arc(player.x, player.y, C.SZ_PLAYER + 2, 0, 2 * Math.PI);
					self.ctx.fill();
				}
			});

			// fire shots
			Object.keys(self.shots).forEach(key => {
				const shot = self.shots[key];
				self.ctx.fillStyle = "#ff0000";
				self.ctx.beginPath();
				self.ctx.arc(shot.point[0], shot.point[1], 2, 0, 2 * Math.PI);
				self.ctx.fill();

				// TODO better handling for sound; this doesn't always play
				if (shot.isNew) {
					self._sfx("shaq_pap_short.mp3", 0.3);
				}
			});

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
				self.ctx.lineTo(C.MAX_X, 0);
				self.ctx.lineTo(C.MAX_X, C.MAX_Y);
				self.ctx.lineTo(0, C.MAX_Y);
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
		const g = new Game(result.name, result.color);
		g.play();
	});
