// Solstice City — keyboard and mouse input.
// Held keys are a set; one-shot presses are queued and taken once per frame,
// so a press between two frames is never lost and never counted twice.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedSet = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.lightsOn = true; // headlights: L toggles them, on by default at dusk
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
      if (!e.repeat) {
        this.pressedSet.add(e.code);
        if (e.code === 'KeyL') this.lightsOn = !this.lightsOn;
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.clicked = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = false;
    });
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // Take and clear the one-shot presses since the last call.
  takePressed() {
    const out = this.pressedSet;
    this.pressedSet = new Set();
    return out;
  }

  endFrame() {
    this.mouse.clicked = false;
  }
}
