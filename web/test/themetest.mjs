// Theme aus dem Theme-Ordner: Server mit NEXTPAD_THEME=beispiel und server/tests/theme-beispiel.
// node test/themetest.mjs <basis-url> [server-log]
import { chromium } from 'playwright'
const base = process.argv[2] || 'http://127.0.0.1:5199'
let fails = 0, oks = 0
const check = (name, cond, info = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (cond) oks++; else fails++ }

const start = await (await fetch(base + '/', { headers: { 'accept-language': 'de' } })).text()
check('Untertitel aus theme.json (de)', start.includes('Gemeinsam schreiben an der Hochschule Musterstadt'))
const startEn = await (await fetch(base + '/', { headers: { 'accept-language': 'en' } })).text()
check('Untertitel aus theme.json (en)', startEn.includes('Writing together at Musterstadt University'))
check('Akzent aus theme.json als Stilangabe', start.includes('--accent:#1d5c8a') && start.includes('--house-blue:#2a7ab0'))
check('Logo aus dem Theme-Ordner im Kopf', start.includes('/theme/logo.png?v='))
const logo = await fetch(base + '/theme/logo.png')
check('Logo als SVG ausgeliefert', logo.status === 200 && (logo.headers.get('content-type') || '').includes('svg'), String(logo.status))
const css = await fetch(base + '/theme/marke.css')
check('Stylesheet der Marke', css.status === 200 && (await css.text()).includes('#1d5c8a'), String(css.status))

const b = await chromium.launch()
const p = await (await b.newContext({ locale: 'de-DE' })).newPage()
const fehler = []
p.on('console', m => { if (m.type() === 'error') fehler.push(m.text()) })
await p.goto(`${base}/open?padname=theme-${Date.now().toString(36)}`); await p.waitForSelector('.ProseMirror')
check('Pad im Layout eckig', await p.evaluate(() => document.body.classList.contains('theme-eckig')))
check('Pad lädt marke.css', await p.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href.includes('/theme/marke.css?v='))))
const primary = await p.evaluate(() => getComputedStyle(document.body).getPropertyValue('--primary').trim())
check('Akzent der Marke greift im Editor', primary.toLowerCase() === '#1d5c8a', primary)
check('keine Konsolenfehler', fehler.length === 0, fehler.join(' | '))
if (process.env.NEXTPAD_OHNE_PDF !== '1') {
  const cookie = (await p.context().cookies()).map(c => `${c.name}=${c.value}`).join('; ')
  await p.keyboard.type('Probe der Hausvorlage')
  await p.waitForTimeout(800)
  const pad = new URL(p.url()).pathname.split('/')[2]
  const pdf = await fetch(`${base}/p/${pad}/export/pdf`, { headers: { Cookie: cookie } })
  const roh = Buffer.from(await pdf.arrayBuffer()).toString('latin1')
  check('PDF mit der Satzvorlage aus dem Theme', pdf.status === 200 && roh.startsWith('%PDF') && roh.includes('Hochschule Musterstadt'), String(pdf.status))
  // Absender und Dokumentart: Vorgabe und kaputte Vorlage stehen nicht zur Wahl
  const optionen = i => p.evaluate(i => [...document.querySelectorAll('select.tsel.gestaltung')[i]?.options || []].map(o => o.value), i)
  check('Absender zur Wahl: Vorgabe leer, dazu fb-x', JSON.stringify(await optionen(0)) === '["","fb-x"]', JSON.stringify(await optionen(0)))
  check('Dokumentart zur Wahl: standard und bericht', JSON.stringify(await optionen(1)) === '["standard","bericht"]', JSON.stringify(await optionen(1)))
  check('Editor in Vorlage standard ohne Absender', await p.evaluate(() => document.body.classList.contains('np-vorlage-standard') && !document.body.classList.contains('np-mit-absender')))
  const gespeichert = antwort => p.waitForResponse(r => r.url().endsWith('/gestaltung') && r.request().method() === 'POST').then(r => r.ok())
  let ok = gespeichert(); await p.selectOption('select.tsel.gestaltung >> nth=1', 'bericht')
  check('Dokumentart gespeichert', await ok)
  ok = gespeichert(); await p.selectOption('select.tsel.gestaltung >> nth=0', 'fb-x')
  check('Absender gespeichert', await ok)
  check('Editor zeigt Vorlage bericht mit Absender', await p.evaluate(() => document.body.classList.contains('np-vorlage-bericht') && document.body.classList.contains('np-mit-absender')))
  check('Fließtext des Absenders als Variable', (await p.evaluate(() => document.body.style.getPropertyValue('--np-fliesstext'))).includes('Serif'))
  const pdf2 = await fetch(`${base}/p/${pad}/export/pdf`, { headers: { Cookie: cookie } })
  const roh2 = Buffer.from(await pdf2.arrayBuffer()).toString('latin1')
  check('PDF mit Vorlage bericht und Absender fb-x', pdf2.status === 200 && roh2.includes('Bericht fb-x'), String(pdf2.status))
  const fremd = await p.evaluate(async b => (await fetch(b, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ art: 'kaputt' }) })).status, `${base}/p/${pad}/gestaltung`)
  check('ausgefallene Vorlage nicht wählbar', fremd === 400, String(fremd))
}
await b.close()
if (process.argv[3] && process.env.NEXTPAD_OHNE_PDF !== '1') {
  const log = (await import('node:fs')).readFileSync(process.argv[3], 'utf8')
  check('Probe: Vorlage standard aus dem Theme bereit', log.includes('Satzvorlage standard (satz/standard.typ) bereit'))
  check('Probe: kaputte Vorlage fällt aus, Server läuft', log.includes('Satzvorlage kaputt (satz/kaputt.typ) fällt aus'))
}
console.log(`\n${oks} ok, ${fails} fehlgeschlagen`)
process.exit(fails ? 1 : 0)
