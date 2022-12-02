export function encodeHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (uint8) =>
    uint8.toString(16).padStart(2, '0'),
  ).join('')
}
