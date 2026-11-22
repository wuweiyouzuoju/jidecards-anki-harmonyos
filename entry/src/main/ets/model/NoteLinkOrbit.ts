// SPDX-License-Identifier: AGPL-3.0-or-later
export interface OrbitPoint { x: number; y: number; z: number; }
export interface OrbitNode { index: number; x: number; y: number; depth: number; radius: number; }

function limit(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class NoteLinkOrbit {
  private points: OrbitPoint[] = [];
  private yaw: number = -.3;
  private pitch: number = .14;
  private zoom: number = 1;
  private panX: number = 0;
  private panY: number = 0;
  private yawSpeed: number = 0;
  private pitchSpeed: number = 0;
  private lastDrag: number = 0;
  private idleAt: number = 0;
  private direction: number = 1;
  paused: boolean = false;

  reset(count: number, time: number, recenter: boolean): void {
    this.points = [{ x: 0, y: 0, z: 0 }];
    for (let index: number = 1; index < count; index++) {
      const y: number = .89 * Math.cos(Math.PI * (index - .5) / (count - 1));
      const radius: number = Math.sqrt(1 - y * y);
      const angle: number = index * Math.PI * (3 - Math.sqrt(5)) + .65;
      this.points.push({ x: radius * Math.sin(angle), y, z: radius * Math.cos(angle) });
    }
    this.idleAt = time + 1000;
    if (recenter) {
      this.zoom = 1; this.panX = 0; this.panY = 0;
      this.stop();
    }
  }

  stop(): void { this.yawSpeed = 0; this.pitchSpeed = 0; this.lastDrag = 0; }

  rotate(dx: number, dy: number, time: number): void {
    const yaw: number = dx * .009;
    const pitch: number = dy * .008;
    this.yaw += yaw;
    this.pitch = limit(this.pitch + pitch, -1.42, 1.42);
    const interval: number = this.lastDrag > 0 ? limit(time - this.lastDrag, 10, 65) : 18;
    this.yawSpeed = .38 * this.yawSpeed + .62 * limit(yaw / interval, -.006, .006);
    this.pitchSpeed = .38 * this.pitchSpeed + .62 * limit(pitch / interval, -.004, .004);
    if (Math.abs(yaw) > .008) this.direction = Math.sign(yaw);
    this.lastDrag = time;
  }

  move(dx: number, dy: number, scale: number, width: number, height: number): void {
    this.zoom = limit(this.zoom * scale, .52, 3.5);
    this.panX = limit(this.panX + dx, -width * .45, width * .45);
    this.panY = limit(this.panY + dy, -height * .45, height * .45);
  }

  release(time: number, cancel: boolean): void {
    this.idleAt = time + 750;
    if (cancel || time - this.lastDrag > 105) this.stop();
  }

  step(time: number, elapsed: number): boolean {
    if (this.points.length < 2) return false;
    const damping: number = Math.exp(-elapsed / 86);
    const advance: number = 86 * (1 - damping);
    this.yaw += advance * this.yawSpeed;
    const nextPitch: number = this.pitch + advance * this.pitchSpeed;
    this.pitch = limit(nextPitch, -1.42, 1.42);
    this.yawSpeed *= damping;
    this.pitchSpeed = this.pitch === nextPitch ? this.pitchSpeed * damping : 0;
    if (Math.abs(this.yawSpeed) + Math.abs(this.pitchSpeed) < .00005) this.stop();
    if (!this.paused && time > this.idleAt) {
      const speed: number = limit((time - this.idleAt) / 1200, 0, 1);
      this.yaw += elapsed * .00013 * speed * this.direction;
    }
    return !this.paused || this.yawSpeed !== 0 || this.pitchSpeed !== 0;
  }

  project(width: number, height: number, focus: number): OrbitNode[] {
    const sy: number = Math.sin(this.yaw);
    const cy: number = Math.cos(this.yaw);
    const sp: number = Math.sin(this.pitch);
    const cp: number = Math.cos(this.pitch);
    const scale: number = Math.min(width, height) * .335 * this.zoom * focus;
    return this.points.map((point: OrbitPoint, index: number): OrbitNode => {
      const x: number = cy * point.x + sy * point.z;
      const z: number = cy * point.z - sy * point.x;
      const depth: number = sp * point.y + cp * z;
      const perspective: number = 3.9 / (3.9 - depth);
      return { index, depth, x: width / 2 + this.panX + x * scale * perspective,
        y: height / 2 + this.panY - (cp * point.y - sp * z) * scale * perspective,
        radius: (index === 0 ? 13 : 8) * perspective * Math.sqrt(this.zoom) };
    });
  }
}
