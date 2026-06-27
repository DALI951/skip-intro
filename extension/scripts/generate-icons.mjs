import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deflateSync } from 'zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function createPNG(size) {
  const width = size
  const height = size
  const rawData = Buffer.alloc((width * 4 + 1) * height, 0)

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (width * 4 + 1)
    rawData[rowOffset] = 0
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 4
      const t = x / width
      const r = Math.round(0x7c + (0xa7 - 0x7c) * t)
      const g = Math.round(0x3a + (0x8b - 0x3a) * t)
      const b = Math.round(0xed + (0xfa - 0xed) * t)
      rawData[px] = r
      rawData[px + 1] = g
      rawData[px + 2] = b
      rawData[px + 3] = 255
    }
  }

  const deflated = deflateSync(rawData)

  function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeB = Buffer.from(type, 'ascii')
    const crcData = Buffer.concat([typeB, data])
    const crc = crc32(crcData)
    const crcB = Buffer.alloc(4)
    crcB.writeUInt32BE(crc)
    return Buffer.concat([len, typeB, data, crcB])
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])

  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', deflated), iend])
}

function crc32(buf) {
  let crc = 0xFFFFFFFF
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

const outDir = resolve(root, 'public/icons')
mkdirSync(outDir, { recursive: true })

for (const size of [16, 48, 128]) {
  writeFileSync(resolve(outDir, `${size}.png`), createPNG(size))
  console.log(`Created ${size}x${size} icon`)
}
