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
	});

	io.sockets.emit("state", players);
}, TICK_RATE);