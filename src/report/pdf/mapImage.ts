import type { LatLon } from '../../api/types.ts'
import { MAP_3D } from '../../config.ts'

/** The satellite picture of a place for the PDF: tiles around it, stitched, with the checked circle drawn on. */
const ZOOM = 16
const SIZE = { width: 900, height: 420 }
const TILE = 256

function tileXY({ lat, lon }: LatLon, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom
  const rad = (lat * Math.PI) / 180
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = url
  })
}

/** A JPEG data URL of the place from above, or null if the tiles could not be had. */
export async function mapImage(point: LatLon, radiusM: number): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE.width
    canvas.height = SIZE.height
    const context = canvas.getContext('2d')
    if (!context) return null
    const centre = tileXY(point, ZOOM)
    const left = centre.x * TILE - SIZE.width / 2
    const top = centre.y * TILE - SIZE.height / 2
    const jobs: Promise<void>[] = []
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + SIZE.width) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + SIZE.height) / TILE); ty++) {
        const url = MAP_3D.satellite.tiles.replace('{z}', String(ZOOM)).replace('{x}', String(tx)).replace('{y}', String(ty))
        jobs.push(loadImage(url).then((image) => context.drawImage(image, tx * TILE - left, ty * TILE - top, TILE, TILE)))
      }
    }
    await Promise.all(jobs)
    // The checked circle: metres to pixels at this latitude and zoom.
    const metresPerPixel = (156543.03392 * Math.cos((point.lat * Math.PI) / 180)) / 2 ** ZOOM
    const r = radiusM / metresPerPixel
    context.lineWidth = 4
    context.strokeStyle = '#ffffff'
    context.setLineDash([12, 8])
    context.beginPath()
    context.arc(SIZE.width / 2, SIZE.height / 2, r, 0, Math.PI * 2)
    context.stroke()
    context.setLineDash([])
    context.fillStyle = '#ce6142'
    context.beginPath()
    context.arc(SIZE.width / 2, SIZE.height / 2, 8, 0, Math.PI * 2)
    context.fill()
    context.lineWidth = 3
    context.strokeStyle = '#ffffff'
    context.stroke()
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch {
    return null
  }
}
