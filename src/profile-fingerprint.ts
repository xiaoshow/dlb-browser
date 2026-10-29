import type { FingerprintOptions } from './types'

/** Generate once at Profile creation. Never derive a new seed from time, mode or node. */
export function stableFingerprint(id: string): FingerprintOptions {
  return { seed: id, canvas: 'noise', webGL: 'noise', audio: 'noise' }
}
