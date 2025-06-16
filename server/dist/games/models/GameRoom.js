"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameState = void 0;
/**
 * حالات اللعبة المحتملة
 */
var GameState;
(function (GameState) {
    GameState["WAITING"] = "waiting";
    GameState["PLAYING"] = "playing";
    GameState["COMPLETED"] = "completed";
    GameState["ABANDONED"] = "abandoned";
})(GameState || (exports.GameState = GameState = {}));
