// Makes the system "Back" button (Android, browser back, iOS swipe) close the
// topmost modal / panel / clean output instead of leaving the app.

const stack = [];
let ignore = 0;
let seq = 0;

window.addEventListener('popstate', () => {
  if (ignore > 0) {
    ignore--;
    return;
  }
  const entry = stack.pop();
  if (entry) {
    entry.closing = true;
    try {
      entry.close();
    } catch (err) {
      console.warn(err);
    }
  }
});

/** Registers something closable; returns an id to release it later. */
export function pushBack(close) {
  const id = ++seq;
  stack.push({ id, close, closing: false });
  try {
    history.pushState({ luzmapBack: id }, '');
  } catch (_) {
    /* ignored (sandboxed iframes) */
  }
  return id;
}

/** Call when the thing was closed by the UI (not by Back). */
export function releaseBack(id) {
  const i = stack.findIndex((e) => e.id === id);
  if (i < 0) return;
  const [entry] = stack.splice(i, 1);
  if (entry.closing) return;
  if (i === stack.length && history.state && history.state.luzmapBack === id) {
    ignore++;
    history.back();
  }
}

export const backDepth = () => stack.length;
