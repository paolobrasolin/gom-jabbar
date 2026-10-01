import { describe, it, expect, beforeEach } from 'vitest'
import { showStartupError } from './startupError'

beforeEach(() => document.body.replaceChildren())

describe('the startup storage error (#94)', () => {
  it('is a failure like any other: red, its icon, an alert, once', () => {
    showStartupError('Non riesco ad aprire l’archivio')
    showStartupError('Non riesco ad aprire l’archivio')
    const box = document.querySelectorAll('.msg.failure.startup')
    expect(box).toHaveLength(1)
    expect(box[0]).toHaveAttribute('role', 'alert')
    expect(box[0]).toHaveTextContent('Non riesco ad aprire l’archivio')
    const svg = box[0].querySelector('svg.icon')!
    expect(svg).toHaveAttribute('data-icon', 'failed')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(0)
  })
})
