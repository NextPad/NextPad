// Vorlagen in der Werkzeugleiste: an der Cursorstelle einfügen, Rückgängig, Englisch.
// node test/vorlagetest.mjs <basis-url>
import { chromium } from 'playwright'
const base = process.argv[2] || 'http://127.0.0.1:5093'
let pass = 0, fail = 0
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : ' ' + x}`) }
const b = await chromium.launch()
const errs = []
async function oeffnen (locale, pfad) {
  const p = await (await b.newContext({ locale })).newPage()
  p.on('pageerror', e => errs.push(e.message.slice(0, 150)))
  await p.goto(base + pfad); await p.waitForSelector('.ProseMirror')
  await p.waitForFunction(() => document.querySelector('#statusbar .ok') !== null)
  return p
}
const json = p => p.evaluate(() => window.nextpad.editor.getJSON().content)
const art = n => n.type === 'heading' ? 'h' + n.attrs.level : n.type
const text = n => (n.content || []).map(t => t.text || '').join('')

const p = await oeffnen('de-DE', `/open?padname=vorlage-${Date.now().toString(36)}`)
const auswahl = p.getByRole('combobox', { name: 'Vorlage an der Cursorstelle einfügen' })
check('Liste „Vorlage“ in der Werkzeugleiste', await auswahl.count() === 1)
const namen = await auswahl.locator('option').allTextContents()
check('zwei Vorlagen zur Wahl', namen.includes('Gruppenarbeit') && namen.includes('Protokoll'), namen.join(' | '))

await p.click('.ProseMirror'); await p.keyboard.type('Vorher')
await p.keyboard.press('Enter')
await p.keyboard.type('Nachher')
// Cursor an den Anfang von „Nachher“; die Pause trennt Tippen und Einfügen für Rückgängig
await p.evaluate(() => { const ed = window.nextpad.editor; let pos = 0; ed.state.doc.descendants((n, q) => { if (n.isTextblock && n.textContent === 'Nachher') pos = q + 1 }); ed.commands.setTextSelection(pos) })
await p.waitForTimeout(800)
await auswahl.selectOption('protokoll'); await p.waitForTimeout(300)
let inhalt = await json(p)
const i = inhalt.findIndex(n => art(n) === 'h1' && text(n) === 'Protokoll')
check('Vorlage an der Cursorstelle eingefügt', i > 0 && text(inhalt[0]) === 'Vorher' && text(inhalt[inhalt.length - 1]) === 'Nachher', inhalt.map(n => art(n) + ':' + text(n)).join(' / '))
check('Überschriften der Vorlage kommen mit', inhalt.some(n => art(n) === 'h2' && text(n) === 'Tagesordnung'))
check('Liste steht danach wieder auf „Vorlage“', await auswahl.inputValue() === '')
check('Fokus zurück im Text', await p.evaluate(() => document.querySelector('.ProseMirror').contains(document.activeElement)))

await p.keyboard.press('Control+z'); await p.waitForTimeout(300)
inhalt = await json(p)
check('Rückgängig nimmt die Vorlage wieder heraus', !inhalt.some(n => text(n) === 'Protokoll') && inhalt.some(n => text(n) === 'Vorher'), inhalt.map(n => art(n) + ':' + text(n)).join(' / '))

const en = await oeffnen('en-US', `/open?padname=template-${Date.now().toString(36)}`)
const enAuswahl = en.getByRole('combobox', { name: 'Insert template at the cursor' })
check('englische Liste', await enAuswahl.count() === 1 && (await enAuswahl.locator('option').allTextContents()).includes('Minutes'))
await en.click('.ProseMirror'); await enAuswahl.selectOption('gruppenarbeit'); await en.waitForTimeout(300)
check('englische Vorlage eingefügt', (await json(en)).some(n => art(n) === 'h1' && text(n) === 'Group work'))

check('keine Fehler auf der Seite', errs.length === 0, errs.join(' | '))
await b.close()
console.log(`${pass} ok, ${fail} fehlgeschlagen`)
process.exit(fail ? 1 : 0)
