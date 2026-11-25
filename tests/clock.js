// A clock of a test's own, in a window's place of the real one: its timers,
// its intervals and its Date.now. Time passes there only when a test says so,
// so nothing a test waits for depends on how fast the machine runs it.
//
// What is not a timer (a promise, a fake IndexedDB request, a Response being
// read) still runs on the real event loop, and is let run, turn by turn,
// before the clock moves and after each timer it fires.

// TURNS is how many turns of the event loop let that work finish. A chain of
// requests takes a turn each; a slow machine makes a turn longer and not the
// chain.
const TURNS = 60;

// LONGEST is how far until moves the clock, and SLACK how often it lets the
// rest run with no timer to fire.
const LONGEST = 10000;
const SLACK = 50;

// The real ones, whatever a test does to the globals.
const { setTimeout: realTimeout, setImmediate: realImmediate } = globalThis;

async function drain() {
  for (let i = 0; i < TURNS; i++) {
    await new Promise((done) => (i % 10 === 9 ? realTimeout(done, 0) : realImmediate(done)));
  }
}

// clock takes over window's timers, before any script runs in it, and answers
// with what moves them. after is the clock of a page opened before this one,
// whose time this one starts no earlier than.
export function clock(window, after) {
  const start = Math.max(window.Date.now(), after ? after.now() : 0);
  let now = 0;
  let last = 0;
  const timers = new Map();

  function add(fn, ms, args, every) {
    const id = ++last;
    timers.set(id, { id, at: now + Math.max(0, Number(ms) || 0), fn: () => fn(...args), every });
    return id;
  }

  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, 0);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, Math.max(1, Number(ms) || 0));
  window.clearTimeout = window.clearInterval = (id) => void timers.delete(id);
  window.Date.now = () => start + now;

  // due is the first timer to fire by the time until, in the order set.
  function due(until) {
    let first = null;
    for (const t of timers.values()) {
      if (t.at <= until && (!first || t.at < first.at)) first = t;
    }
    return first;
  }

  // settle lets ms pass, with the work that is under way and everything that
  // falls due in it.
  async function settle(ms = 0) {
    const until = now + ms;
    await drain();
    for (let t = due(until); t; t = due(until)) {
      now = Math.max(now, t.at);
      if (t.every) {
        t.at = now + t.every;
      } else {
        timers.delete(t.id);
      }
      t.fn();
      await drain();
    }
    now = until;
  }

  return {
    settle,
    now: () => start + now,
    // until lets time pass until test() holds, and fails if LONGEST does not
    // bring it. With no timer left, what is not a timer is let run SLACK times
    // more before it gives up.
    until: async (test) => {
      const end = now + LONGEST;
      let slack = SLACK;
      await drain();
      while (!test()) {
        const next = due(end);
        if (next) {
          slack = SLACK;
          await settle(Math.max(0, next.at - now));
        } else if (slack--) {
          await drain();
        } else {
          throw new Error(timers.size ? LONGEST + " ms passed, and it has not happened" : "nothing left to run, and it has not happened");
        }
      }
    },
  };
}
