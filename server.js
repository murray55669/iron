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

const SERVER_PORT = 1337;

app.set("port", SERVER_PORT);
app.use("/static", express.static(path.resolve(__dirname, "static")));
app.use("/js", express.static(path.resolve(__dirname, "js")));

// Routing
app.get("/", function (request, response) {
	response.sendFile(path.join(__dirname, 'index.html'));
});

// Starts the server.
server.listen(SERVER_PORT, function () {
	console.log(`Starting server on port ${SERVER_PORT}`);
});

// Add the WebSocket handlers
io.on("connection", function (socket) {
});

// FIXME remove
setInterval(function () {
	io.sockets.emit("message", "hi!");
}, 1000);