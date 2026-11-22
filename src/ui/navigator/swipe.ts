/** A touch's position on screen. */
export interface Point {
	x: number;
	y: number;
}

/** How far right a swipe must travel to go back. */
const swipeDistance = 60;

/** Whether a touch from `start` to `end` is a swipe back: mostly rightward, and far enough. */
export function swipesBack(start: Point, end: Point): boolean {
	const dx = end.x - start.x;
	return dx >= swipeDistance && Math.abs(end.y - start.y) * 2 <= dx;
}
