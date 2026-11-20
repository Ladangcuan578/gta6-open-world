// Keyboard and mouse state for Solstice City v4. The game reads keys by
// code (KeyW, ArrowUp, ...) and the mouse position in screen pixels for
// aiming. Clicks are queued so a single click fires exactly one shot.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.clickQueue = [];
    this._canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed = this.pressed || new Set();
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.clickQueue.push({ x: this.mouseX, y: this.mouseY });
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // True once per key press: consuming the code here so a single press
  // cannot fire again on the next fixed step of the same frame (at the
  // 3-5 fps SwiftShader manages, one frame runs up to forty steps, and
  // without this a press of E would enter and exit the car forty times).
  wasPressed(code) {
    if (this.pressed && this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame() {
    this.pressed = new Set();
    this.clickQueue.length = 0;
  }
}
