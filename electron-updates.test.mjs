import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificarCambio } from './electron-updates.cjs'

test('un archivo dentro de dist/ se clasifica como "dist"', () => {
  assert.equal(clasificarCambio('dist'), 'dist')
  assert.equal(clasificarCambio('dist/index.html'), 'dist')
  assert.equal(clasificarCambio('dist\\assets\\index-XYZ.js'), 'dist')
})

test('electron.cjs y package.json se clasifican como "nucleo"', () => {
  assert.equal(clasificarCambio('electron.cjs'), 'nucleo')
  assert.equal(clasificarCambio('package.json'), 'nucleo')
})

test('no reacciona a backups tipo dist-backup-* ni a otros archivos', () => {
  assert.equal(clasificarCambio('dist-backup-20260912/index.html'), null)
  assert.equal(clasificarCambio('dist-anterior/index.html'), null)
  assert.equal(clasificarCambio('README.md'), null)
  assert.equal(clasificarCambio(undefined), null)
})
