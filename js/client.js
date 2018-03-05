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
			const $iptColor = $(`<input type="color">`).appendTo($wrpIpts);
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
		this.dead = false;
		this.players = {};
		this.shots = {};
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
		self.canvas.width = 800;
		self.canvas.height = 600;
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
				case 65: // A
					self.input.left = true;
					break;
				case 87: // W
					self.input.up = true;
					break;
				case 68: // D
					self.input.right = true;
					break;
				case 83: // S
					self.input.down = true;
					break;
			}
		});

		$DOCUMENT.on("keyup", (evt) => {
			switch (evt.keyCode) {
				case 65: // A
					self.input.left = false;
					break;
				case 87: // W
					self.input.up = false;
					break;
				case 68: // D
					self.input.right = false;
					break;
				case 83: // S
					self.input.down = false;
					break;
			}
		});

		self.$canvas.on("mousedown", (evt) => {
			self.input.mouseClick = getCursorPosition(self.$canvas, evt);
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

			self.ctx.clearRect(0, 0, 800, 600);

			// draw players
			Object.keys(self.players).forEach(key => {
				const player = self.players[key];
				self.ctx.fillStyle = player.color;
				self.ctx.beginPath();
				self.ctx.arc(player.x, player.y, 10, 0, 2 * Math.PI);
				self.ctx.fill();

				self.ctx.strokeStyle = player.oppColor;
				self.ctx.beginPath();
				self.ctx.arc(player.x, player.y, 10, 0, 2 * Math.PI);
				self.ctx.stroke();
				self.ctx.closePath();

				self.ctx.fillStyle = "black";
				self.ctx.font = "12px serif";
				self.ctx.fillText(player.name, player.x - 10, player.y + 25);

				if (player.dead) {
					self.ctx.strokeStyle = player.oppColor;
					self.ctx.beginPath();
					self.ctx.moveTo(player.x - 10, player.y - 10);
					self.ctx.lineTo(player.x + 10, player.y + 10);
					self.ctx.moveTo(player.x - 10, player.y + 10);
					self.ctx.lineTo(player.x + 10, player.y - 10);
					self.ctx.stroke();
					self.ctx.closePath();

					if (player.id === self.socket.id) {
						if (!self.dead) {
							self.dead = true;
							self._sfx("cantwake.wav", 1);
						}
					}
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
				if (shot.nu) {
					self._sfx("shq_pap.mp3", 0.3);
				}
			});

			// draw death overlay
			if (self.dead) {
				// red overlay
				self.ctx.fillStyle = "#ff000099";
				self.ctx.beginPath();
				self.ctx.lineTo(0, 0);
				self.ctx.lineTo(800, 0);
				self.ctx.lineTo(800, 600);
				self.ctx.lineTo(0, 600);
				self.ctx.fill();

				// dead text
				self.ctx.fillStyle = "black";
				self.ctx.font = "52px serif";
				self.ctx.fillText(`W A S T E D`, 260, 326);
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
