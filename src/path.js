const S = 47,
  B = 92,
  D = 46,
  C = 58;
let offsets = new Int32Array(256);
function ensureCapacity(required) {
  if (required <= offsets.length) return;
  const next = new Int32Array(Math.max(required, offsets.length * 2));
  next.set(offsets);
  offsets = next;
}
function isDotDot(input, start, end) {
  return end - start === 2 && input.charCodeAt(start) === D && input.charCodeAt(start + 1) === D;
}
function separatorAt(input, index) {
  const c = input.charCodeAt(index);
  return c === S || c === B;
}
export function normalize(input) {
  if (typeof input !== 'string') throw new TypeError('path must be a string');
  let dirty = false;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (
      c === B ||
      (c === S && input.charCodeAt(i + 1) === S) ||
      (c === D && (i === 0 || separatorAt(input, i - 1)))
    ) {
      dirty = true;
      break;
    }
  }
  const driveRelative = input.length > 1 && input.charCodeAt(1) === C && !separatorAt(input, 2);
  if (!dirty) return driveRelative && input.length === 2 ? input + '.' : input;
  const driveAbsolute = input.length > 2 && input.charCodeAt(1) === C && separatorAt(input, 2);
  const unc = separatorAt(input, 0) && separatorAt(input, 1);
  const absolute = driveAbsolute || unc || separatorAt(input, 0);
  const scanStart = driveAbsolute ? 3 : driveRelative ? 2 : unc ? 2 : 0;
  let count = 0,
    segmentStart = scanStart;
  for (let i = scanStart; i <= input.length; i++) {
    const c = i < input.length ? input.charCodeAt(i) : S;
    if (c !== S && c !== B) continue;
    const segmentEnd = i;
    if (segmentEnd > segmentStart) {
      if (segmentEnd - segmentStart === 1 && input.charCodeAt(segmentStart) === D) {
        // skip "."
      } else if (isDotDot(input, segmentStart, segmentEnd)) {
        if (count && !isDotDot(input, offsets[(count - 1) * 2], offsets[(count - 1) * 2 + 1]))
          count--;
        else if (!absolute) {
          ensureCapacity((count + 1) * 2);
          offsets[count * 2] = segmentStart;
          offsets[count * 2 + 1] = segmentEnd;
          count++;
        }
      } else {
        ensureCapacity((count + 1) * 2);
        offsets[count * 2] = segmentStart;
        offsets[count * 2 + 1] = segmentEnd;
        count++;
      }
    }
    segmentStart = i + 1;
  }
  let out = driveAbsolute
    ? input.slice(0, 2) + '/'
    : driveRelative
      ? input.slice(0, 2)
      : unc
        ? '//'
        : absolute
          ? '/'
          : '';
  for (let i = 0; i < count; i++) {
    if (i && out[out.length - 1] !== '/') out += '/';
    out += input.slice(offsets[i * 2], offsets[i * 2 + 1]);
  }
  if (!count && driveRelative) out += '.';
  if (
    driveRelative &&
    input.length > 2 &&
    separatorAt(input, input.length - 1) &&
    out[out.length - 1] !== '/'
  )
    out += '/';
  return out || (absolute ? (driveAbsolute ? input.slice(0, 2) + '/' : '/') : '.');
}
export function isAbsolute(input) {
  return (
    typeof input === 'string' &&
    (input[0] === '/' ||
      input[0] === '\\' ||
      (input.length > 2 && input[1] === ':' && (input[2] === '/' || input[2] === '\\')))
  );
}
export function join(...paths) {
  let out = '';
  for (const part of paths) if (part) out += (out ? '/' : '') + part;
  return normalize(out);
}
export function resolve(...paths) {
  let out = '';
  for (let i = paths.length - 1; i >= 0; i--) {
    if (!paths[i]) continue;
    out = out ? paths[i] + '/' + out : paths[i];
    if (isAbsolute(paths[i])) break;
  }
  if (!isAbsolute(out)) out = process.cwd() + (out ? '/' + out : '');
  return normalize(out);
}
