import './brand.css'

/**
 * The world above ground, behind the sign-in page and the first question of the dig, traced from the
 * designer's frame (1280 x 728): sand mountains right of centre and two bands of earth along the bottom.
 * The mountains are drawn in that frame's coordinates and placed relative to the centre of the page;
 * the earth stretches to the full width. Decorative only.
 */
export function SurfaceScene() {
  return (
    <div className="surface-scene" aria-hidden="true">
      <svg className="surface-scene__mountains" viewBox="440 380 1000 300" preserveAspectRatio="none">
        <path className="surface-scene__far" d="M500 660 L736 444 Q746 435 756 444 L992 660 Z" />
        <path className="surface-scene__far" d="M810 660 L1168 441 Q1180 432 1192 442 L1418 660 Z" />
        <path
          className="surface-scene__snow"
          d="M1150 453 L1168 441 Q1180 432 1192 442 L1212 458 L1203 455 L1196 463 L1186 453 L1176 464 L1166 453 L1158 459 Z"
        />
        <path className="surface-scene__near" d="M468 662 L588 574 Q610 557 632 572 L702 610 L770 642 L770 662 Z" />
        <path className="surface-scene__near" d="M1028 662 Q1120 602 1198 576 Q1228 566 1258 576 Q1330 598 1440 646 L1440 662 Z" />
      </svg>
      <svg className="surface-scene__ground" viewBox="0 0 1280 100" preserveAspectRatio="none">
        <path
          className="surface-scene__earth"
          d="M0 24 C80 18 200 10 300 12 C400 14 450 24 520 22 C640 18 720 6 820 5 C920 4 1000 12 1080 13 C1160 14 1220 4 1280 2 L1280 100 L0 100 Z"
        />
        <path className="surface-scene__earth-deep" d="M0 72 C300 66 600 74 900 68 C1100 64 1200 66 1280 65 L1280 100 L0 100 Z" />
      </svg>
    </div>
  )
}
