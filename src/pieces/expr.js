// Tiny, safe arithmetic expressions for declarative pieces.
//
// Piece files are data, so every computed number is a string expression such
// as "d - t" or "min(w * 0.08, back * 0.3)". There is no eval: expressions are
// parsed into closures that can only read names from the environment and
// call the whitelisted functions below.
//
//   numbers 1.5 · strings 'doors' · names w, t, k · ( )
//   unary - !   * / %   + -   < <= > >= == !=   &&   ||   a ? b : c
//   min max round floor ceil abs sqrt clamp sin cos (radians) hash(k, seed)
//
// Operators keep JavaScript's precedence and left-to-right evaluation, so an
// expression written in the same order as JS code gives bit-identical floats.

export const FUNCTIONS = {
  min: Math.min,
  max: Math.max,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  /** Repeatable pseudo-random number in [0, 1) for (k, seed): variety without randomness. */
  hash: (k, seed = 0) => { const x = Math.sin(k * 127.1 + seed * 311.7) * 43758.5453; return x - Math.floor(x); },
  clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
};

export const CONSTANTS = { PI: Math.PI };

export class ExprError extends Error {}

const TOKEN_RE = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|'([^']*)'|([A-Za-z_]\w*)|(<=|>=|==|!=|&&|\|\||[-+*/%()<>!?:,]))/y;

function tokenize(src) {
  const out = [];
  TOKEN_RE.lastIndex = 0;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    TOKEN_RE.lastIndex = i;
    const m = TOKEN_RE.exec(src);
    if (!m) throw new ExprError(`unexpected "${src.slice(i).trim()[0]}" at ${i} in "${src}"`);
    const at = i;
    i = TOKEN_RE.lastIndex;
    if (m[1] !== undefined) out.push({ type: 'num', value: Number(m[1]), at });
    else if (m[2] !== undefined) out.push({ type: 'str', value: m[2], at });
    else if (m[3] !== undefined) out.push({ type: 'name', value: m[3], at });
    else out.push({ type: 'op', value: m[4], at });
  }
  return out;
}

const BINARY = {
  '||': [1, (a, b) => (env) => a(env) || b(env)],
  '&&': [2, (a, b) => (env) => a(env) && b(env)],
  '==': [3, (a, b) => (env) => a(env) === b(env)],
  '!=': [3, (a, b) => (env) => a(env) !== b(env)],
  '<': [4, (a, b) => (env) => a(env) < b(env)],
  '<=': [4, (a, b) => (env) => a(env) <= b(env)],
  '>': [4, (a, b) => (env) => a(env) > b(env)],
  '>=': [4, (a, b) => (env) => a(env) >= b(env)],
  '+': [5, (a, b) => (env) => a(env) + b(env)],
  '-': [5, (a, b) => (env) => a(env) - b(env)],
  '*': [6, (a, b) => (env) => a(env) * b(env)],
  '/': [6, (a, b) => (env) => a(env) / b(env)],
  '%': [6, (a, b) => (env) => a(env) % b(env)],
};

/**
 * Parse an expression. Returns { fn(env), names, calls } where `names` are
 * the free variables it reads and `calls` the functions it uses.
 * Throws ExprError on bad syntax or unknown functions.
 */
export function compileExpr(src) {
  if (typeof src === 'number') return { fn: () => src, names: new Set(), calls: new Set() };
  if (typeof src !== 'string') throw new ExprError(`expected an expression, got ${JSON.stringify(src)}`);
  const toks = tokenize(src);
  const names = new Set(), calls = new Set();
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v) => toks[pos]?.type === 'op' && toks[pos].value === v;
  const expect = (v) => {
    if (!isOp(v)) throw new ExprError(`expected "${v}" ${toks[pos] ? `at ${toks[pos].at}` : 'at end'} in "${src}"`);
    pos++;
  };

  function primary() {
    const tk = toks[pos++];
    if (!tk) throw new ExprError(`unexpected end of "${src}"`);
    if (tk.type === 'num' || tk.type === 'str') { const v = tk.value; return () => v; }
    if (tk.type === 'name') {
      if (isOp('(')) {
        pos++;
        const f = Object.hasOwn(FUNCTIONS, tk.value) && FUNCTIONS[tk.value];
        if (!f) throw new ExprError(`unknown function "${tk.value}" in "${src}"`);
        calls.add(tk.value);
        const args = [];
        if (!isOp(')')) {
          do args.push(ternary()); while (isOp(',') && ++pos);
        }
        expect(')');
        return (env) => f(...args.map((a) => a(env)));
      }
      const name = tk.value;
      if (Object.hasOwn(CONSTANTS, name)) { const v = CONSTANTS[name]; return () => v; }
      names.add(name);
      return (env) => {
        const v = Object.hasOwn(env, name) ? env[name] : undefined;
        if (v === undefined) throw new ExprError(`"${name}" is not defined in "${src}"`);
        return v;
      };
    }
    if (tk.value === '(') { const e = ternary(); expect(')'); return e; }
    if (tk.value === '-') { const e = unary(); return (env) => -e(env); }
    if (tk.value === '!') { const e = unary(); return (env) => !e(env); }
    throw new ExprError(`unexpected "${tk.value}" at ${tk.at} in "${src}"`);
  }
  const unary = primary;

  function binary(minPrec) {
    let left = unary();
    for (;;) {
      const tk = peek();
      const op = tk?.type === 'op' && BINARY[tk.value];
      if (!op || op[0] < minPrec) return left;
      pos++;
      const right = binary(op[0] + 1);
      left = op[1](left, right);
    }
  }

  function ternary() {
    const cond = binary(1);
    if (!isOp('?')) return cond;
    pos++;
    const a = ternary();
    expect(':');
    const b = ternary();
    return (env) => (cond(env) ? a(env) : b(env));
  }

  const fn = ternary();
  if (pos < toks.length) throw new ExprError(`unexpected "${toks[pos].value}" at ${toks[pos].at} in "${src}"`);
  return { fn, names, calls };
}

/** Evaluate an expression (string or number) against an environment. */
export function evalExpr(src, env) {
  return compileExpr(src).fn(env);
}

const TEMPLATE_RE = /\{([^{}]+)\}/g;

/** Expressions inside `{…}` of a template string such as "Book {k + 1}". */
export function templateExprs(str) {
  return [...String(str).matchAll(TEMPLATE_RE)].map((m) => m[1]);
}

/** Fill a template string: "Book {k + 1}" → "Book 3". */
export function fillTemplate(str, env) {
  return String(str).replace(TEMPLATE_RE, (_, e) => String(evalExpr(e, env)));
}
