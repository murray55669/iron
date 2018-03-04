/* eslint-disable no-console */
"use strict";

const SEND_RATE = 1000 / 60;
const $BODY = $(`body`);

class Ui {
	constructor () {
		this._overlays = [];
	}

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

	error (e) {
		const self = this;
		this._fullscreenOverlay(self, `<p>listen here u lil shit: ${e.message || e}</p>`, $(`<button>Yeah?</button>`).click(() => {
			Ui._closeOverlay(self);
		}))
	}

	_fullscreenOverlay (self, ...eles) {
		const $over = $(`<div class="overlay-wrp bg1">`).append($(`<div class="overlay-wrp-inn bg2">`).append(eles)).appendTo($BODY);
		self._overlays.push($over);
	}

	static _closeOverlay (self) {
		const $close = self._overlays.pop();
		if ($close) $close.remove();
	}
}

class Game {
	constructor (username, color) {
		this.username = username;
		this.color = color;

		this.dead = false;
	}

	play () {
		const self = this;

		const canvas = document.getElementById("viewport");
		const $canvas = $(canvas);
		const socket = io();
		const input = {
			up: false,
			down: false,
			left: false,
			right: false
		};

		document.addEventListener("keydown", function (evt) {
			switch (evt.keyCode) {
				case 65: // A
					input.left = true;
					break;
				case 87: // W
					input.up = true;
					break;
				case 68: // D
					input.right = true;
					break;
				case 83: // S
					input.down = true;
					break;
			}
		});

		document.addEventListener("keyup", function (evt) {
			switch (evt.keyCode) {
				case 65: // A
					input.left = false;
					break;
				case 87: // W
					input.up = false;
					break;
				case 68: // D
					input.right = false;
					break;
				case 83: // S
					input.down = false;
					break;
			}
		});

		socket.emit("player-new", {
			name: this.username,
			color: this.color
		});
		$canvas.on("mousedown", (evt) => {
			input.mouseClick = getCursorPosition($canvas, evt);
		});
		$canvas.on("mouseup", (evt) => {
			input.mouseClick = null;
		});
		setInterval(function () {
			socket.emit("player-input", input);
		}, SEND_RATE);

		canvas.width = 800;
		canvas.height = 600;
		const ctx = canvas.getContext("2d");
		let players = {};
		let shots = {};

		socket.on("state", function (data) {
			players = data.players;
			shots = data.shots;
		});

		let then = 0;
		let fpsSmooth = 0.99; // larger = more smoothing
		let fps = 60;
		function tick (now) {
			const deltaTime = now - then;
			then = now;

			ctx.clearRect(0, 0, 800, 600);

			// draw players
			Object.keys(players).forEach(key => {
				const player = players[key];
				ctx.fillStyle = player.color;
				ctx.beginPath();
				ctx.arc(player.x, player.y, 10, 0, 2 * Math.PI);
				ctx.fill();

				ctx.strokeStyle = player.oppColor;
				ctx.beginPath();
				ctx.arc(player.x, player.y, 10, 0, 2 * Math.PI);
				ctx.stroke();
				ctx.closePath();

				ctx.fillStyle = "black";
				ctx.font = "12px serif";
				ctx.fillText(player.name, player.x - 10, player.y + 25);

				if (player.dead) {
					ctx.strokeStyle = player.oppColor;
					ctx.beginPath();
					ctx.moveTo(player.x - 10, player.y - 10);
					ctx.lineTo(player.x + 10, player.y + 10);
					ctx.moveTo(player.x - 10, player.y + 10);
					ctx.lineTo(player.x + 10, player.y - 10);
					ctx.stroke();
					ctx.closePath();

					if (player.id === socket.id) {
						if (!self.dead) {
							self.dead = true;
							self.sfx("cantwake.wav", 1);
						}
					}
				}
			});

			// fire shots
			Object.keys(shots).forEach(key => {
				const shot = shots[key];
				ctx.fillStyle = "#ff0000";
				ctx.beginPath();
				ctx.arc(shot.point[0], shot.point[1], 2, 0, 2 * Math.PI);
				ctx.fill();

				// TODO better handling for sound; this doesn't always play
				if (shot.nu) {
					self.sfx("auuugch.wav", 0.3);
				}
			});

			// draw death overlay
			if (self.dead) {
				// red overlay
				ctx.fillStyle = "#ff000099";
				ctx.beginPath();
				ctx.lineTo(0, 0);
				ctx.lineTo(800, 0);
				ctx.lineTo(800, 600);
				ctx.lineTo(0, 600);
				ctx.fill();

				// dead text
				ctx.fillStyle = "black";
				ctx.font = "52px serif";
				ctx.fillText(`W A S T E D`, 260, 326);
			}

			// draw FPS
			ctx.fillStyle = "black";
			ctx.font = "12px serif";
			let curFps = 1000 / deltaTime;
			curFps = (curFps * fpsSmooth) + (fps * (1 - fpsSmooth));
			ctx.fillText(`FPS: ${curFps.toFixed(2)}`, 0, 12);
			fps = curFps;

			requestAnimationFrame(tick);
		}
		requestAnimationFrame(tick);
	}

	sfx (name, vol) {
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
