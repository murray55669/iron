const $control = $(`#control`);
const $btnDone = $control.find(`#btn-done`);
const $btnClear = $control.find(`#btn-clear`);
const $iptCulLine = $control.find(`#ipt-cul-line`);
const $iptCulFill = $control.find(`#ipt-cul-fill`);

const $output = $(`#output`);
const $outShape = $output.find(`#out-shape`);

const $canvas = $(`#viewport`);
const canvas = $canvas.get(0);
canvas.width = 800;
canvas.height = 600;
const ctx = canvas.getContext("2d");

let drawing = false;
let points = [];
$canvas.click((evt) => {
	const cur = getCursorPosition($canvas, evt);
	if (!drawing) {
		drawing = true;
	}

	points.push(cur);
	draw();
});

$btnDone.click(() => {
	if (!drawing) return;
	drawing = false;

	draw(true);

	// move the coordinates to the top-left corner
	const minX = getPointArrayMin(0);
	const minY = getPointArrayMin(1);
	points.forEach(it => {
		it[0] -= minX;
		it[1] -= minY;
	});

	$outShape.text(JSON.stringify({
		culLine: $iptCulLine.val(),
		culFill: $iptCulFill.val(),
		points: points
	}, null, 2));
	points = [];
});

$btnClear.click(() => {
	clear();
	points = [];
});

function getPointArrayMin (subIndex) {
	return Math.min.apply(null, points.map(it => it[subIndex]))
}

function draw (doFill) {
	ctx.beginPath();
	points.forEach(p => {
		ctx.lineTo(...p);
	});
	ctx.strokeStyle = $iptCulLine.val();
	ctx.clearRect(0, 0, 800, 600);
	if (doFill) {
		ctx.fillStyle = $iptCulFill.val();
		ctx.fill();
		ctx.lineTo(...points[0]);
	}
	ctx.stroke();
	ctx.closePath();
}

function clear () {
	ctx.closePath();
	ctx.clearRect(0, 0, 800, 600);
}
