// Mood timings. TIMING is what he uses now; OLD keeps the values from before the mood change,
// so the tests (and anyone tuning him) can see how much faster each mood moves.
export const OLD = { drainPerSec: 0.1, rageMs: 15000, chatterMin: 25000, chatterMax: 50000 };
export const TIMING = {
  drainPerSec: 0.25,               // rage meter units per second: a hard drop wears off in 4 s (was 10 s)
  rageMs: 10000,                   // RAGE lasts 10 s (was 15 s)
  chatterMin: 12000,               // idle lines follow his mood sooner: 12-22 s (was 25-50 s)
  chatterMax: 22000,
  gladHalfLife: 1.2,               // a good moment's happiness halves every 1.2 s (new)
  pokeCount: 5,                    // this many pokes inside the window make him angry (new)
  pokeWindow: 4000,
  dazeMs: 2600,                    // dizzy after a throw that ended on the page floor (new)
  repairDelay: 400,                // happy this long, then he starts repairing (new)
  askDelay: 2600,                  // angry this long, then he asks for a candy (new)
  askEvery: 20000,                 // and asks again this often while still angry
};
/** Happiness above this shows the happy face. */
export const GLAD_FACE = 0.45;
