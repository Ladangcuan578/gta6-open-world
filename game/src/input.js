// Keyboard and mouse input: held keys, edge-triggered presses, and mouse drag for
// orbiting the chase camera. No pointer lock: dragging with the mouse is enough and
// keeps the game playable inside the screenshot harness.
export const ACTION = {
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
  BRAKE: 'brake',
  RUN: 'run',
  ENTER: 'enter',
  WHEEL: 'wheel',
  SHOOT: 'shoot',
  LIGHTS: 'lights',
  CAMERA: 'camera',
  RADIO: 'radio',
  PAUSE: 'pause',
  RELOAD: 'reload',
};

const KEYMAP = {
  KeyW: ACTION.UP,
  ArrowUp: ACTION.UP,
  KeyS: ACTION.DOWN,
  ArrowDown: ACTION.DOWN,
  KeyA: ACTION.LEFT,
  ArrowLeft: ACTION.LEFT,
  KeyD: ACTION.RIGHT,
  ArrowRight: ACTION.RIGHT,
  Space: ACTION.BRAKE,
  ShiftLeft: ACTION.RUN,
  ShiftRight: ACTION.RUN,
  KeyE: ACTION.ENTER,
  KeyQ: ACTION.WHEEL,
  KeyL: ACTION.LIGHTS,
  KeyC: ACTION.CAMERA,
  KeyM: ACTION.RADIO,
  KeyP: ACTION.PAUSE,
  Escape: ACTION.PAUSE,
  KeyR: ACTION.RELOAD,
  Digit1: 'slot1',
  Digit2: 'slot2',
  Digit3: 'slot3',
  Digit4: 'slot4',
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  let mouseDown = false;
  let dragX = 0;
  let dragY = 0;
  let lastX = 0;
  let lastY = 0;

  function onKeyDown(event) {
    const action = KEYMAP[event.code];
    if (action) {
      if (!held.has(action)) pressed.add(action);
      held.add(action);
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    const action = KEYMAP[event.code];
    if (action) held.delete(action);
  }
  function onMouseDown(event) {
    mouseDown = true;
    lastX = event.clientX;
    lastY = event.clientY;
    if (!pressed.has(ACTION.SHOOT)) pressed.add(ACTION.SHOOT);
    held.add(ACTION.SHOOT);
  }
  function onMouseUp() {
    mouseDown = false;
    held.delete(ACTION.SHOOT);
  }
  function onMouseMove(event) {
    if (!mouseDown) return;
    dragX += event.clientX - lastX;
    dragY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  }
  function onBlur() {
    held.clear();
    mouseDown = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('blur', onBlur);

  return {
    is(action) {
      return held.has(action);
    },
    wasPressed(action) {
      return pressed.has(action);
    },
    // Steering: -1 left, 0 none, +1 right. Throttle: -1 reverse, 0 none, +1 forward.
    steer() {
      return (held.has(ACTION.RIGHT) ? 1 : 0) - (held.has(ACTION.LEFT) ? 1 : 0);
    },
    throttle() {
      return (held.has(ACTION.UP) ? 1 : 0) - (held.has(ACTION.DOWN) ? 1 : 0);
    },
    takeDrag() {
      const out = { x: dragX, y: dragY };
      dragX = 0;
      dragY = 0;
      return out;
    },
    endFrame() {
      pressed.clear();
    },
    // For scripted shots and play-tests: pretend a key is held this frame.
    inject(action) {
      held.add(action);
      pressed.add(action);
    },
    release(action) {
      held.delete(action);
    },
  };
}
