import { describe, expect, it } from 'vitest'
import { emailImagePath, imageProblem } from './emailImages.ts'

describe('emailImagePath', () => {
  it('keeps names readable and safe', () => {
    expect(emailImagePath('my photo.png', 'u1')).toBe('emailImages/u1-my photo.png')
    expect(emailImagePath('Şükrü/../x.png', 'u1')).toBe('emailImages/u1-' + 'Şükrü/../x.png'.replace(/[^A-Za-z0-9._\- ]+/g, '-'))
    expect(emailImagePath('Şükrü/../x.png', 'u1')).not.toContain('/..')
  })
  it('falls back for empty names', () => {
    expect(emailImagePath('', 'u1')).toBe('emailImages/u1-file')
  })
})

describe('imageProblem', () => {
  it('accepts a small image', () => {
    expect(imageProblem({ type: 'image/png', size: 1000 })).toBeNull()
  })
  it('refuses non-images', () => {
    expect(imageProblem({ type: 'application/pdf', size: 10 })).toBe('Images only')
  })
  it('refuses 5 MB or more', () => {
    expect(imageProblem({ type: 'image/jpeg', size: 5 * 1024 * 1024 })).toBe('Images must be under 5 MB')
    expect(imageProblem({ type: 'image/jpeg', size: 5 * 1024 * 1024 - 1 })).toBeNull()
  })
})
