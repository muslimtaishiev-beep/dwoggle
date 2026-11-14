import { CHECK_IDS, type Check, type Report } from '../api/types.ts'

/** Surface to deepest: green, heat, flood, landslide, earthquake, whatever order the API used. */
export function sortChecks(checks: readonly Check[]): Check[] {
  return [...checks].sort((a, b) => CHECK_IDS.indexOf(a.id) - CHECK_IDS.indexOf(b.id))
}

export function hasNoData(report: Report): boolean {
  return report.checks.every((check) => check.grade === null)
}
