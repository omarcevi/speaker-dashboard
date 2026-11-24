import { describe, expect, it } from 'vitest'
import { emailImagePath, imageProblem } from './emailImages.ts'

describe('emailImagePath', () => {
  it('keeps names readable and safe', () => {
    expect(emailImagePath('my photo.png', 'u1')).toBe('emailImages/u1-my photo.png')
    expect(emailImagePath('Şükrü Çelik.png', 'u1')).toBe('emailImages/u1--kr- -elik.png')
    expect(emailImagePath('../x.png', 'u1')).toBe('emailImages/u1-..-x.png')
  })
  it('falls back for empty names', () => {
    expect(emailImagePath('', 'u1')).toBe('emailImages/u1-file')
  })
})

describe('imageProblem', () => {
  it('accepts a small PNG, JPEG, GIF or WebP', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) expect(imageProblem({ type, size: 1000 })).toBeNull()
  })
  it('refuses other types, other images included', () => {
    for (const type of ['application/pdf', 'image/svg+xml', 'image/heic', '']) {
      expect(imageProblem({ type, size: 10 })).toBe('Use a PNG, JPEG, GIF or WebP image')
    }
  })
  it('refuses 5 MB or more', () => {
    expect(imageProblem({ type: 'image/jpeg', size: 5 * 1024 * 1024 })).toBe('Images must be under 5 MB')
    expect(imageProblem({ type: 'image/jpeg', size: 5 * 1024 * 1024 - 1 })).toBeNull()
  })
})
