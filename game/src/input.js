// Input is deliberately thin: key set, pointer lock, and the handful of edge-triggered keys the
// game cares about (reload, plant, buy, scoreboard, weapon slots).
export function createInput({ canvas, onKey, onMouseMove, onMouseDown, onMouseUp, onLockChange }) {
  const keys = new Set();
  const locked = { value: false };

  function keyName(event) {
    return event.code || event.key;
  }

  window.addEventListener('keydown', (event) => {
    const code = keyName(event);
    if (['Tab', 'Space', 'KeyB', 'KeyE', 'Digit1', 'Digit2', 'Digit3', 'KeyR', 'KeyC'].includes(code)) event.preventDefault();
    if (!keys.has(code)) onKey?.(code, { first: true, event });
    keys.add(code);
  });

  window.addEventListener('keyup', (event) => {
    const code = keyName(event);
    keys.delete(code);
    onKey?.(code, { first: false, event });
  });

  window.addEventListener('mousemove', (event) => {
    if (!locked.value) return;
    onMouseMove?.(event.movementX || 0, event.movementY || 0);
  });

  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) onMouseDown?.(event);
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) onMouseUp?.(event);
  });

  document.addEventListener('pointerlockchange', () => {
    locked.value = document.pointerLockElement === canvas;
    onLockChange?.(locked.value);
  });

  function requestLock() {
    if (document.pointerLockElement === canvas) return;
    try {
      const pending = canvas.requestPointerLock?.();
      // a browser refuses a lock asked for outside a click; that is not an error worth showing
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    } catch {
      /* refused: the overlay's Play button asks again on the next click */
    }
  }

  function exitLock() {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  }

  return { keys, locked, requestLock, exitLock, has: (code) => keys.has(code) };
}
