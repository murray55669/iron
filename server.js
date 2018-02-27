/* eslint-disable no-console */
"use strict";
// Dependencies
const express = require("express");
const http = require("http");
const path = require("path");
const socketIO = require("socket.io");
const app = express();
const server = http.Server(app);
const io = socketIO(server);

const TICK_RATE = 1000 / 60;
const SERVER_PORT = 1337;

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
	socket.on("new player", (data) => {
		players[socket.id] = {
			x: 300,
			y: 300,
			color: data.color,
			name: data.name
		};
	});
	socket.on("movement", (data) => {
		const player = players[socket.id] || {};
		if (data.left) {
			player.x -= 5;
		}
		if (data.up) {
			player.y -= 5;
		}
		if (data.right) {
			player.x += 5;
		}
		if (data.down) {
			player.y += 5;
		}
	});
	socket.on("disconnect", () => {
		delete players[socket.id];
	});
});

setInterval(() => {
	io.sockets.emit("state", players);
}, TICK_RATE);