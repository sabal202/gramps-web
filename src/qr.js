/*
Thin wrapper around the `qrcode-generator` npm package, producing a
standalone SVG string for a given piece of text (typically the webcal://
subscription URL). Kept as a single small function so the QR implementation
can be swapped without touching the view that uses it.
*/

import qrcode from 'qrcode-generator'

// Render `text` as a QR code and return it as a standalone SVG markup string.
export function renderQrSvg(text) {
  // type 0 = automatic size, 'M' = medium error correction
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({scalable: true})
}
