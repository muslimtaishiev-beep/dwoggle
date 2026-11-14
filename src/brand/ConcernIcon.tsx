import type { Concern } from '../auth/types.ts'
import { LineIcon } from './LineIcon.tsx'

export function ConcernIcon({ concern }: { concern: Concern }) {
  return <LineIcon name={concern} size={18} />
}
