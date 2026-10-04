// Logos simplificados de cada red, para marcar en qué redes sale cada día.
export function LogoRed({ red, apagado = false }) {
  const estilo = apagado ? { opacity: 0.2, filter: 'grayscale(1)' } : undefined
  if (red === 'linkedin') return (
    <svg className="up-logo" style={estilo} viewBox="0 0 24 24" aria-label="LinkedIn"><rect width="24" height="24" rx="5" fill="#0A66C2" /><path fill="#fff" d="M7 9.5h2.6V18H7zM8.3 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM11.2 9.5h2.5v1.2c.4-.7 1.3-1.4 2.6-1.4 2.7 0 3.2 1.8 3.2 4.1V18h-2.6v-4c0-1 0-2.2-1.4-2.2s-1.6 1-1.6 2.1V18h-2.7z" /></svg>
  )
  if (red === 'x') return (
    <svg className="up-logo" style={estilo} viewBox="0 0 24 24" aria-label="X"><rect width="24" height="24" rx="5" fill="#0F0F0F" /><path fill="#fff" d="M13.3 10.9L18.5 5h-1.2l-4.5 5.1L9.2 5H5l5.4 7.7L5 19h1.2l4.7-5.4 3.8 5.4H19zm-1.7 1.9l-.6-.8-4.4-6.1h1.9l3.5 4.9.6.8 4.5 6.4h-1.9z" /></svg>
  )
  return (
    <svg className="up-logo" style={estilo} viewBox="0 0 24 24" aria-label="Instagram"><defs><linearGradient id="up-ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#F58529" /><stop offset=".5" stopColor="#DD2A7B" /><stop offset="1" stopColor="#8134AF" /></linearGradient></defs><rect width="24" height="24" rx="6" fill="url(#up-ig)" /><rect x="6" y="6" width="12" height="12" rx="3.5" fill="none" stroke="#fff" strokeWidth="1.6" /><circle cx="12" cy="12" r="2.8" fill="none" stroke="#fff" strokeWidth="1.6" /><circle cx="16" cy="8" r=".9" fill="#fff" /></svg>
  )
}
