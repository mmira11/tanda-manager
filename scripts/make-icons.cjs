// Draws the Tanda icon (a ring of members around a $, the gold dot is whose turn it is)
// into every PNG the site uses, plus the link-preview image. Run after changing the design:
//   node scripts/make-icons.cjs
// Needs Playwright with Chromium (preinstalled in the dev container; not an app dependency).
const { chromium } = require('playwright')
const { join } = require('node:path')

const TEAL = '#127A74'
const GOLD = '#F5B942'
const CREAM = '#FBF8F3'

// The mark on a 100×100 canvas. It stays inside the middle ~62%, so Android's round
// and squircle masks (safe zone: middle 80%) never clip it.
function mark({ dot = '#fff', ring = 'rgba(255,255,255,.35)', gold = GOLD, gap = TEAL } = {}) {
  const dots = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * 2 * Math.PI - Math.PI / 2
    const x = (50 + 24 * Math.cos(a)).toFixed(2)
    const y = (50 + 24 * Math.sin(a)).toFixed(2)
    return i === 0
      ? `<circle cx="${x}" cy="${y}" r="7.5" fill="${gold}" stroke="${gap}" stroke-width="3"/>`
      : `<circle cx="${x}" cy="${y}" r="5" fill="${dot}"/>`
  }).join('')
  return `<circle cx="50" cy="50" r="24" fill="none" stroke="${ring}" stroke-width="3"/>${dots}
    <text x="50" y="58" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="22" fill="${dot}">$</text>`
}

const square = size => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${TEAL}"/>${mark()}</svg>`

// Link preview (1200×630), same layout as before with the new mark.
const og = `<div style="width:1200px;height:630px;position:relative;overflow:hidden;background:${CREAM};font-family:Inter,Arial,sans-serif">
  <div style="position:absolute;right:-90px;top:-260px;width:620px;height:620px;border-radius:50%;background:${TEAL}"></div>
  <div style="position:absolute;right:90px;top:420px;width:120px;height:120px;border-radius:50%;background:${GOLD}"></div>
  <div style="position:absolute;left:690px;top:490px;width:260px;height:260px;border-radius:50%;background:#F4876B"></div>
  <svg style="position:absolute;left:850px;top:20px" width="260" height="260" viewBox="0 0 100 100">${mark({ dot: '#fff', ring: 'rgba(255,255,255,.4)', gap: TEAL })}</svg>
  <div style="position:absolute;left:90px;top:120px;width:120px;height:120px;border-radius:50%;overflow:hidden">${square(120)}</div>
  <div style="position:absolute;left:90px;top:270px;font-size:110px;font-weight:800;letter-spacing:-3px;color:#1C1917">Tanda</div>
  <div style="position:absolute;left:92px;top:405px;font-size:38px;font-weight:700;color:#57534E">Saving together, one tap away</div>
  <div style="position:absolute;left:92px;top:462px;font-size:38px;font-weight:700;color:#C44832">Ahorrando juntos, a un toque</div>
</div>`

const outputs = [
  ['public/icons/tanda-192.png', 192],
  ['public/icons/tanda-512.png', 512],
  ['public/icons/tanda-maskable-512.png', 512],
  ['public/icons/apple-touch-icon.png', 180],
  ['public/icons/favicon-32.png', 32],
]

;(async () => {
  const browser = await chromium.launch()
  const fonts = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;800&display=swap" rel="stylesheet">'
  for (const [file, size] of outputs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    await page.setContent(`<html><head>${fonts}</head><body style="margin:0">${square(size)}</body></html>`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: join(__dirname, '..', file), omitBackground: false })
    await page.close()
    console.log('wrote', file)
  }
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.setContent(`<html><head>${fonts}</head><body style="margin:0">${og}</body></html>`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: join(__dirname, '..', 'public/og-image.png') })
  console.log('wrote public/og-image.png')
  await browser.close()
})()
