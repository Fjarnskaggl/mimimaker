// Every piece in the catalogue, as plain JSON data, in picker order
// (theme by theme). To add a piece, add an object to its theme's file;
// the tests validate it and the loader does the rest.

import { BASICS } from './basics.js';
import { LIVING } from './living.js';
import { BEDROOM } from './bedroom.js';
import { KITCHEN } from './kitchen.js';
import { BATHROOM } from './bathroom.js';
import { CAFE } from './cafe.js';
import { LIBRARY } from './library.js';
import { DECOR } from './decor.js';

export const PIECES = [...BASICS, ...LIVING, ...BEDROOM, ...KITCHEN, ...BATHROOM, ...CAFE, ...LIBRARY, ...DECOR];
