const SIZE = 15;
const RADIUS = SIZE * 0.25;
const STRENGTH = 15;
const REST = 0.005;

export class DisplacementField {
  readonly size = SIZE;
  readonly data = new Float32Array(SIZE * SIZE * 4);

  push(x: number, y: number, dx: number, dy: number) {
    const gx = x * SIZE;
    const gy = y * SIZE;
    for (let row = 0; row < SIZE; row++) {
      for (let column = 0; column < SIZE; column++) {
        const distance = Math.hypot(gx - column, gy - row);
        if (distance >= RADIUS) continue;
        const power = Math.min(RADIUS / Math.max(distance, 0.001), 10);
        const index = 4 * (column + row * SIZE);
        this.data[index] += STRENGTH * dx * power;
        this.data[index + 1] -= STRENGTH * dy * power;
      }
    }
  }

  step(seconds: number) {
    const decay = Math.pow(0.9, seconds * 60);
    let moving = false;
    for (let index = 0; index < this.data.length; index += 4) {
      this.data[index] *= decay;
      this.data[index + 1] *= decay;
      if (Math.abs(this.data[index]) > REST || Math.abs(this.data[index + 1]) > REST) moving = true;
    }
    if (!moving) this.clear();
    return moving;
  }

  clear() {
    this.data.fill(0);
  }
}
