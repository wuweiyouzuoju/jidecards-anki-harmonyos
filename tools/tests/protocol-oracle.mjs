// SPDX-License-Identifier: AGPL-3.0-or-later
// Test-only value representation: includes absent properties, NaN, Maps and consumed readers.
export function pack(value) {
  if (value === undefined) return { $undefined: true };
  if (typeof value === 'bigint') return { $bigint: String(value) };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $number: String(value) };
  if (value instanceof Uint8Array) return { $bytes: Buffer.from(value).toString('hex') };
  if (value instanceof Map) return { $map: [...value].map(([key, item]) => [pack(key), pack(item)]) };
  if (value && typeof value.转为字节 === 'function') return { $writer: pack(value.转为字节()) };
  if (value?.字节流 instanceof Uint8Array) return { $reader: pack(value.字节流.slice(value.位置)) };
  if (Array.isArray(value)) return value.map(pack);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).map(key => [key, pack(value[key])]));
  return value;
}
export function unpack(value, Writer, Reader) {
  if (value?.$undefined) return undefined;
  if (value?.$bigint !== undefined) return BigInt(value.$bigint);
  if (value?.$number !== undefined) return Number(value.$number);
  if (value?.$bytes !== undefined) return new Uint8Array(Buffer.from(value.$bytes, 'hex'));
  if (value?.$map) return new Map(value.$map.map(([key, item]) => [unpack(key, Writer, Reader), unpack(item, Writer, Reader)]));
  if (value?.$writer) { const writer = new Writer(); writer.写入原始字节(unpack(value.$writer, Writer, Reader)); return writer; }
  if (value?.$reader) return new Reader(unpack(value.$reader, Writer, Reader));
  if (Array.isArray(value)) return value.map(item => unpack(item, Writer, Reader));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unpack(item, Writer, Reader)]));
  return value;
}
export function execute(fn, inputs, Writer, Reader) {
  const args = unpack(inputs, Writer, Reader);
  try { return { value: pack(fn(...args)), after: pack(args) }; }
  catch (error) { return { error: { name: error.name, message: error.message }, after: pack(args) }; }
}
