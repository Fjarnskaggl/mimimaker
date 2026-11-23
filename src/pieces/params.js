// Shorthands for parameter definitions in piece files. They only build
// plain objects, so every piece stays pure JSON data.

/** A length in real-world cm (scaled to model mm before building). */
export const num = (key, label, min, max, step = 1) => ({ key, label, type: 'number', min, max, step, unit: 'cm' });
/** A whole-number count (not scaled). */
export const cnt = (key, label, min, max) => ({ key, label, type: 'number', min, max, step: 1 });
/** A choice from a list of words. */
export const sel = (key, label, options) => ({ key, label, type: 'select', options });
