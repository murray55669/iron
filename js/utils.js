function getCursorPosition ($canvas, event) {
	const canOffset = $canvas.offset();
	const x = event.clientX + document.body.scrollLeft + document.documentElement.scrollLeft - Math.floor(canOffset.left);
	const y = event.clientY + document.body.scrollTop + document.documentElement.scrollTop - Math.floor(canOffset.top) + 1;

	return [x, y];
}