function clasificarCambio(nombre) {
  if (!nombre) return null
  const parte = nombre.split(/[\\/]/)[0]
  if (parte === 'dist') return 'dist'
  if (nombre === 'electron.cjs' || nombre === 'package.json') return 'nucleo'
  return null
}

module.exports = { clasificarCambio }
