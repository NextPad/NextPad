// Bildschirmfotos für die Projektseite (site/bilder). Server im Design hsd ohne Theme-Dateien (kein Hochschullogo,
// keine Hausschrift), Logo und Startbild auf „keins“, Untertitel neutral, Akzent im NextPad-Blau. Schreibt PNG nach <ziel>.
// node test/projektseite-bilder.mjs <basis-url> <api-key> <ziel>
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const [base, key, out] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const b = await chromium.launch()
const wait = ms => new Promise(r => setTimeout(r, ms))
async function person(name, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, ...opts })
  const p = await ctx.newPage()
  p.named = name
  return p
}
async function rename(p) { const r = await p.evaluate(async n => (await fetch('/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n }) })).status, p.named); if (r !== 200) console.log('Name', p.named, r) }
const shot = (p, name, full = false) => p.screenshot({ path: `${out}/${name}.png`, fullPage: full })

// Startseite hell, dunkel, Telefon
for (const [name, opts] of [['start', {}], ['start-dunkel', { colorScheme: 'dark' }], ['start-telefon', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const p = await person('x', opts); await p.goto(base + '/'); await wait(300); await shot(p, name); await p.context().close()
}

// Pad mit zwei Personen
const pad = 'Audiofeature'
// frisch anlegen, sonst sammeln sich in der Zeitleiste die Autoren früherer Läufe
await fetch(`${base}/api/1.2.15/deletePad`, { method: 'POST', body: new URLSearchParams({ apikey: key, padID: pad }) })
await fetch(`${base}/open?padname=${pad}`, { redirect: 'manual' })
const html = '<h1>Audio-Feature: Klang des Campus</h1><h2>Aufgabe</h2><p>Bis Freitag produzieren wir ein fünfminütiges Feature über die Geräusche auf dem Campus Derendorf. Ergebnis: Skript und fertige Mischung.</p><h2>Wer macht was?</h2><ul><li><strong>Lea:</strong> Interviews mit Studierenden vor der Mensa</li><li><strong>Jonas:</strong> Atmo im Hörsaal und am Fahrradständer</li><li><strong>Mira:</strong> Schnitt und Mischung im Tonstudio</li></ul><h2>Stand</h2><p>Erste Aufnahmen am Mittwoch: 14 O-Töne, davon 9 brauchbar.</p>'
await fetch(`${base}/api/1.2.15/setHTML`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ apikey: key, padID: pad, html }) })
const lea = await person('Lea'), jonas = await person('Jonas')
for (const p of [lea, jonas]) { await p.goto(`${base}/p/${pad}`); await rename(p); await p.reload(); await p.waitForSelector('.ProseMirror') }
await jonas.locator('.ProseMirror p').last().click(); await jonas.keyboard.press('End'); await jonas.keyboard.type(' Die Moderation sprechen wir am Donnerstag ein.', { delay: 20 })
await lea.locator('.ProseMirror li').first().click(); await lea.keyboard.press('End')
await wait(800); await shot(lea, 'pad')
// Zeitleiste: Regler kurz vor das Ende, damit Jonas' Satz halb geschrieben ist
await jonas.click('button[title="Frühere Stände ansehen"]'); await jonas.waitForSelector('#timeline .tl-slider')
await jonas.evaluate(() => { const s = document.querySelector('#timeline .tl-slider'); s.value = String(Math.max(0, +s.max - 14)); s.dispatchEvent(new Event('input')) })
await wait(500); await shot(jonas, 'zeitleiste')

// Ideensammlung mit drei Personen, danach Leinwand
const host = await person('Mira')
await host.goto(base + '/new?typ=ideen'); await host.waitForSelector('#add-form:not([hidden])')
const url = host.url()
await host.click('#prompt-edit'); await host.fill('#prompt-form input, #prompt-form textarea', 'Welche Themen soll das Campusradio im nächsten Semester aufgreifen?'); await host.press('#prompt-form input, #prompt-form textarea', 'Enter')
const ideas = ['Porträts von Erstsemestern', 'Ein Blick hinter die Kulissen im Tonstudio', 'Gespräche mit Lehrenden über KI in Medienberufen', 'Tipps für die erste Kameraübung', 'Eine Sendung zur Prüfungszeit']
for (const t of ideas) { await host.fill('#add-form textarea', t); await host.click('#add-form button[type=submit]'); await wait(250) }
const votes = { 'Gespräche mit Lehrenden über KI in Medienberufen': 3, 'Ein Blick hinter die Kulissen im Tonstudio': 2, 'Porträts von Erstsemestern': 2, 'Eine Sendung zur Prüfungszeit': 1 }
for (let i = 0; i < 3; i++) {
  const v = await person('v' + i); await v.goto(url); await v.waitForSelector('.idea')
  for (const [t, n] of Object.entries(votes)) if (i < n) await v.locator('.idea', { hasText: t }).locator('.vote').click()
  await wait(200); await v.context().close()
}
await host.locator('.idea', { hasText: 'Porträts von Erstsemestern' }).locator('.vote').click()
await host.goto(url); await host.waitForSelector('.idea'); await wait(400); await shot(host, 'ideen', true)
const wall = await person('w', { viewport: { width: 1280, height: 720 } }); await wall.goto(url + '/leinwand'); await wait(1000); await shot(wall, 'leinwand')

// Zeichenbrett mit ein paar Formen
const board = await person('Mira'); await board.goto(base + '/new?typ=zeichenbrett'); await board.waitForSelector('.excalidraw', { timeout: 30000 }); await wait(1500)
const drag = async (k, x1, y1, x2, y2) => { await board.keyboard.press(k); await board.mouse.move(x1, y1); await board.mouse.down(); await board.mouse.move(x2, y2, { steps: 8 }); await board.mouse.up() }
await board.mouse.click(1000, 650)  // Fokus auf die Fläche, sonst geht das erste Kürzel verloren
await drag('r', 420, 280, 680, 460); await drag('a', 700, 370, 860, 370); await drag('o', 880, 270, 1160, 470)
const text = async (x, y, t) => { await board.keyboard.press('Escape'); await board.mouse.dblclick(x, y); await wait(300); await board.keyboard.type(t); await board.keyboard.press('Escape'); await wait(200) }
await text(550, 370, 'Szene 1: Totale'); await text(1020, 370, 'Szene 2: Interview'); await text(520, 560, 'Storyboard von Mira, Videoübung')
await board.keyboard.press('Escape'); await board.mouse.click(1240, 680); await wait(500); await shot(board, 'zeichenbrett')

await b.close()
console.log('Bilder in', out)
