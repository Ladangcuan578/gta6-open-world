// Solstice City v3 — input. Keyboard state plus the mouse aim: the game
// reads keys by code (KeyW, KeyA, ...) so layouts never matter, and the
// mouse position in client pixels for drive-by and on-foot shooting.

export class Input {
  constructor() {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: null };
    this._pressed = new Set();
  }

  attach(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this._pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.clicked = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once, on the frame the key went down; consumed by the caller.
  pressed(code) {
    return this._pressed.has(code);
  }

  // Call at the end of each frame so pressed() only fires once per press.
  endFrame() {
    this._pressed.clear();
    this.mouse.clicked = null;
  }

  get forward() {
    return this.down('KeyW') || this.down('ArrowUp');
  }
  get back() {
    return this.down('KeyS') || this.down('ArrowDown');
  }
  get left() {
    return this.down('KeyA') || this.down('ArrowLeft');
  }
  get right() {
    return this.down('KeyD') || this.down('ArrowRight');
  }
  get handbrake() {
    return this.down('Space');
  }
}
