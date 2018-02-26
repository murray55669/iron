/* eslint-disable no-console */
"use strict";
let socket = io();
socket.on('message', function (data) {
	console.log(data);
});
