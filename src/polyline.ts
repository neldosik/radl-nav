/** Декодер Google-полилиний; MOTIS v2+ отдаёт precision 6. Возвращает [lon, lat] для GeoJSON. */
export function decodePolyline(str: string, precision = 6): [number, number][] {
  const factor = Math.pow(10, precision)
  const coords: [number, number][] = []
  let index = 0
  let lat = 0
  let lon = 0
  while (index < str.length) {
    for (const which of [0, 1] as const) {
      let shift = 0
      let result = 0
      let byte = 0
      do {
        byte = str.charCodeAt(index++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (which === 0) lat += delta
      else lon += delta
    }
    coords.push([lon / factor, lat / factor])
  }
  return coords
}
