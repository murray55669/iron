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
	}

	play () {
		const socket = io();
		const movement = {
			up: false,
			down: false,
			left: false,
			right: false
		};

		document.addEventListener("keydown", function (evt) {
			switch (evt.keyCode) {
				case 65: // A
					movement.left = true;
					break;
				case 87: // W
					movement.up = true;
					break;
				case 68: // D
					movement.right = true;
					break;
				case 83: // S
					movement.down = true;
					break;
			}
		});

		document.addEventListener("keyup", function (evt) {
			switch (evt.keyCode) {
				case 65: // A
					movement.left = false;
					break;
				case 87: // W
					movement.up = false;
					break;
				case 68: // D
					movement.right = false;
					break;
				case 83: // S
					movement.down = false;
					break;
			}
		});

		socket.emit("new player", {
			name: this.username,
			color: this.color
		});
		setInterval(function () {
			socket.emit("movement", movement);
		}, SEND_RATE);

		const canvas = document.getElementById("viewport");
		canvas.width = 800;
		canvas.height = 600;
		const ctx = canvas.getContext("2d");
		socket.on("state", function (players) {
			ctx.clearRect(0, 0, 800, 600);
			Object.keys(players).forEach(key => {
				const player = players[key];
				ctx.fillStyle = player.color;
				ctx.beginPath();
				ctx.arc(player.x, player.y, 10, 0, 2 * Math.PI);
				ctx.fill();

				ctx.fillStyle = "black";
				ctx.beginPath();
				ctx.arc(player.x, player.y, 10, 0, 2 * Math.PI);
				ctx.stroke();

				ctx.fillStyle = "black";
				ctx.font = "12px serif";
				ctx.fillText(player.name, player.x - 10, player.y + 25);
			});
		});
	}
}

const ui = new Ui();
ui.login()
	.then((result) => {
		const g = new Game(result.name, result.color);
		g.play();
	});
