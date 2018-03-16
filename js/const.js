"use strict";
(function (exports) {
	exports.MAX_X = 800;
	exports.MIN_X = 0;
	exports.MAX_Y = 600;
	exports.MIN_Y = 0;
	exports.SZ_PLAYER = 10;
	exports.SZ_PLAYER_BALL_CATCH = 20;
	exports.TM_MIN_SHOT_DUR = 250;
	exports.TM_MAX_SHOT_CHANNEL = 750;
	exports.SPD_MAX_SHOT = 15;
	exports.X_GOAL_1 = 65;
	exports.Y_GOAL_1 = exports.MAX_Y / 2;
	exports.X_GOAL_2 = exports.MAX_X - exports.X_GOAL_1;
	exports.Y_GOAL_2 = exports.MAX_Y / 2;
	exports.SZ_GOAL = 25;
}(typeof exports === "undefined" ? this.C = {} : exports));