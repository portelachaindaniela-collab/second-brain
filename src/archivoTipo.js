export function detectarTipo(bytes, mime = false) {
  const text = new TextDecoder().decode(bytes)
  if (text.slice(0, 1024).includes('%PDF-')) return mime ? 'application/pdf' : 'pdf'
  let imageMime
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) imageMime = 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) imageMime = 'image/jpeg'
  if (/^GIF8[79]a/.test(text)) imageMime = 'image/gif'
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') imageMime = 'image/webp'
  if (imageMime) return mime ? imageMime : 'imagen'
  const inicio = text.replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '').trimStart()
  if (/^(?:<!doctype\s+html\b|<html\b|<head\b|<body\b|<(?:meta|title|style|script|main|section|div|h[1-6]|p|table|article)\b)/i.test(inicio)) return mime ? 'text/html' : 'html'
  return 'otro'
}
