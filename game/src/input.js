// Void Bloom — keyboard and mouse input. Movement keys are read as a held vector;
// the mouse aims; holding the left button (or Space) fires; Shift or the right
// button dashes. One-shot presses — confirm, pause, mute, upgrade picks — are
// queued as bit flags and taken exactly once by the loop, so a press between two
// frames is never lost and never counted twice. Clicks are also queued with
// their client coordinates for the upgrade cards, whose field-space rectangles
// live in the renderer; the shell converts and hit-tests them.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_PICK_1 = 8;
export const ACTION_PICK_2 = 16;
export const ACTION_PICK_3 = 32;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const PICKS = new Map([['Digit1', ACTION_PICK_1], ['Digit2', ACTION_PICK_2], ['Digit3', ACTION_PICK_3]]);

export function createInput(canvas) {
  const held = { left: false, right: false, up: false, down: false, space: false };
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let mouseDown = false;
  let dashQueued = false;
  let actions = 0;
  const clicks = [];

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (event.code === 'Space') {
      held.space = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      if (!event.repeat) dashQueued = true;
    } else if (PICKS.has(event.code)) {
      if (!event.repeat) actions |= PICKS.get(event.code);
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (event.code === 'Space') held.space = false;
  });
  window.addEventListener('blur', () => {
    held.left = held.right = held.up = held.down = held.space = false;
    mouseDown = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 2) {
      dashQueued = true;
      return;
    }
    if (event.button !== 0) return;
    mouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;
    clicks.push({ x: event.clientX, y: event.clientY });
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === 0) mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Held movement as a vector with each axis in -1..1. */
    move() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    /** Mouse position in client (CSS pixel) coordinates. */
    mouse() {
      return { x: mouseX, y: mouseY };
    },
    firing() {
      return mouseDown || held.space;
    },
    /** True once per dash press since the last call. */
    takeDash() {
      const was = dashQueued;
      dashQueued = false;
      return was;
    },
    /** The one-shot ACTION_* presses since the last call. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Queued left clicks in client coordinates since the last call. */
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
  };
}
