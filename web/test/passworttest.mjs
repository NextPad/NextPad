// Passwortschutz freier Pads: Besitz setzt das Passwort, alle Wege ohne Freigabe sind zu.
// node test/passworttest.mjs   (NEXTPAD_URL, NEXTPAD_KEY_FILE; Server mit NEXTPAD_ALLOW_FREE_PADS=true)
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
let pass = 0, fail = 0
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : ' ' + x}`) }
const base = process.env.NEXTPAD_URL || 'http://127.0.0.1:5090'
const key = readFileSync(process.env.NEXTPAD_KEY_FILE || process.env.HOME + '/.cache/nextpad-data/api-keys.txt', 'utf8').split('\n').find(l => l && !l.startsWith('#')).split(' ')[0].trim()
const browser = await chromium.launch(); const errors = []
async function person() {
  const ctx = await browser.newContext({ locale: 'de-DE' }); const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message.slice(0, 150)))
  return page
}
const bereit = async p => { await p.waitForSelector('.ProseMirror'); await p.waitForFunction(() => document.querySelector('#statusbar .ok') !== null) }
const hatText = (p, t) => p.waitForFunction(t => document.querySelector('.ProseMirror')?.textContent.includes(t), t, { timeout: 8000 }).then(() => true, () => false)
const wsVersuch = (p, id) => p.evaluate(id => new Promise(res => {
  const w = new WebSocket(`${location.origin.replace('http', 'ws')}${location.pathname.replace(/\/p\/.*$/, '')}/ws/${encodeURIComponent(id)}`)
  w.onopen = () => { w.close(); res('offen') }; w.onerror = () => res('fehler'); setTimeout(() => res('zeit'), 5000)
}), id)

// Besitz legt an und schreibt
const a = await person()
await a.goto(`${base}/new`); await bereit(a)
check('Besitz sieht einmal den Hinweis auf den Schutz', await a.isVisible('#schutz-tipp'))
await a.click('#schutz-tipp button:has-text("Passwort setzen")')
check('Hinweis öffnet den Schutz-Bereich', await a.evaluate(() => document.activeElement?.id === 'pw-neu' && !document.getElementById('schutz-tipp')))
await a.click('button[title="Teilnehmende"]')
const padUrl = a.url(); const padId = decodeURIComponent(padUrl.split('/p/')[1])
await a.evaluate(() => window.nextpad.editor.commands.focus('end')); await a.waitForTimeout(200); await a.keyboard.type('Geheimer Plan', { delay: 10 })
await a.waitForFunction(() => document.querySelector('.ProseMirror').textContent.includes('Geheimer Plan'))
await a.waitForTimeout(500)
await a.click('button[title="Teilnehmende"]')
check('Schutz: ohne Passwort angezeigt', (await a.textContent('.popup .schutz')).includes('Offen:'), await a.textContent('.popup .schutz'))
await a.fill('#pw-neu', 'kurz'); await a.click('.popup .schutz button:has-text("Passwort setzen")')
check('zu kurzes Passwort abgelehnt', (await a.textContent('#pw-meldung')).includes('6 bis 128'))
await a.fill('#pw-neu', '123456'); await a.click('.popup .schutz button:has-text("Passwort setzen")')
await a.waitForFunction(() => document.querySelector('#pw-meldung')?.textContent.includes('zu leicht'))
check('Trivialpasswort abgelehnt', true)
await a.fill('#pw-neu', 'kurs-2026'); await a.click('.popup .schutz button:has-text("Passwort setzen")')
await a.waitForFunction(() => document.querySelector('#pw-meldung')?.textContent.includes('Gespeichert'))
check('Passwort gesetzt', (await a.textContent('.popup .schutz')).includes('Mit Passwort:'))

// Fremde ohne Passwort
const b = await person()
const r = await b.goto(padUrl)
check('Seite ohne Freigabe: Passwortseite 403', r.status() === 403 && !!(await b.$('#passwort')) && !(await b.$('.ProseMirror')), `${r.status()} ${await b.textContent('h1')}`)
check('Export ohne Freigabe 403', (await b.request.get(`${padUrl}/export/md`)).status() === 403)
for (const dunkel of [false, true]) {
  await b.emulateMedia({ colorScheme: dunkel ? 'dark' : 'light' })
  await b.waitForTimeout(500) // Farbübergänge abwarten
  const v = (await new AxeBuilder({ page: b }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations
  check(`Passwortseite axe ${dunkel ? 'dunkel' : 'hell'}`, !v.length, v.map(x => x.id + '×' + x.nodes.length).join(','))
}
check('Zeitleiste ohne Freigabe 403', (await b.request.get(`${padUrl}/history`)).status() === 403)
check('Live-Verbindung ohne Freigabe zu', (await wsVersuch(b, padId)) !== 'offen')
const ro = (await (await fetch(`${base}/api/1.2/getReadOnlyID?` + new URLSearchParams({ padID: padId, apikey: key }))).json()).data?.readOnlyID
const roPage = await person(); const rr = await roPage.goto(`${base}/p/${ro}`)
check('Lesemodus ohne Freigabe: Passwortseite', rr.status() === 403 && !!(await roPage.$('#passwort')), String(rr.status()))

// falsch, dann richtig
await b.fill('#passwort', 'falsch-123'); await b.click('button[type=submit]')
check('falsches Passwort: Meldung', (await b.textContent('#pw-fehler')).includes('stimmt nicht'))
await b.fill('#passwort', 'kurs-2026'); await b.click('button[type=submit]'); await bereit(b)
check('richtiges Passwort: Pad mit Inhalt', await hatText(b, 'Geheimer Plan'), await b.textContent('.ProseMirror'))
const ex = await b.request.get(`${padUrl}/export/md`); check('Export mit Freigabe 200 und Inhalt', ex.status() === 200 && (await ex.text()).includes('Geheimer Plan'), String(ex.status()))
check('Live-Verbindung mit Freigabe offen', (await wsVersuch(b, padId)) === 'offen')
await b.click('button[title="Teilnehmende"]')
check('Fremde sehen keinen Schutz-Bereich', !(await b.$('.popup .schutz')))

// Wechsel beendet alte Freigaben
await a.click('.popup .schutz label.zeigen input')
check('Passwort lässt sich anzeigen', (await a.getAttribute('#pw-neu', 'type')) === 'text')
let frage = ''
a.once('dialog', d => { frage = d.message(); d.dismiss() })
await a.fill('#pw-neu', 'neues-wort'); await a.click('.popup .schutz button:has-text("Passwort ändern")')
await a.waitForTimeout(300)
check('Ändern fragt nach, Abbrechen ändert nichts', frage.includes('Passwort ändern?') && (await a.inputValue('#pw-neu')) === 'neues-wort', frage)
a.once('dialog', d => d.accept())
await a.click('.popup .schutz button:has-text("Passwort ändern")')
await a.waitForFunction(() => document.querySelector('#pw-neu')?.value === '' && document.querySelector('#pw-meldung')?.textContent.includes('Gespeichert'))
await b.waitForSelector('#zugang-hinweis', { timeout: 15000 }).then(() => check('offenes Pad zeigt nach Passwortwechsel einen Hinweis', true), () => check('offenes Pad zeigt nach Passwortwechsel einen Hinweis', false, b.url()))
check('Hinweis lässt den Text stehen', await hatText(b, 'Geheimer Plan'))
await Promise.all([b.waitForNavigation(), b.click('#zugang-hinweis button')])
check('„Neu laden“ führt zur Passwortseite', !!(await b.$('#passwort')))
const r2 = await b.goto(padUrl)
check('nach Passwortwechsel wieder gesperrt', r2.status() === 403 && !!(await b.$('#passwort')), String(r2.status()))

// Begrenzung der Fehlversuche, Besitz kommt trotzdem hinein
const c = await person(); await c.goto(padUrl)
const status = []
for (let i = 0; i < 12; i++) status.push((await c.request.post(`${padUrl}/entsperren`, { form: { passwort: 'rate-' + i } })).status())
check('Fehlversuche sperren das Pad nicht', status.every(x => x === 403), status.join(','))
const g = await person(); await g.goto(padUrl); await g.fill('#passwort', 'neues-wort')
await Promise.all([g.waitForNavigation(), g.press('#passwort', 'Enter')]); await bereit(g)
check('nach fremden Fehlversuchen kommt das richtige Passwort sofort hinein', await hatText(g, 'Geheimer Plan'))
await g.click('button[title="Teilnehmende"]')
check('Schloss an der Personenzahl für alle mit Freigabe', await g.isVisible('button.users .schloss'))
await a.reload(); await bereit(a)
check('Besitz kommt trotz Sperre hinein', await hatText(a, 'Geheimer Plan'), await a.textContent('.ProseMirror'))

// entfernen
await a.click('button[title="Teilnehmende"]'); await a.click('.popup .schutz button:has-text("Passwort entfernen")')
await a.waitForFunction(() => document.querySelector('#pw-meldung')?.textContent.includes('entfernt'))
const d = await person(); await d.goto(padUrl); await bereit(d)
check('ohne Passwort wieder offen', await hatText(d, 'Geheimer Plan'), await d.textContent('.ProseMirror'))

// Name mit Leerzeichen: Formular und Weiterleitung kodieren den Pfad richtig
const e = await person(); await e.goto(`${base}/`); await e.fill('#padname', 'Gruppe Rot 3'); await e.press('#padname', 'Enter'); await bereit(e)
await e.click('button[title="Teilnehmende"]'); await e.fill('#pw-neu', 'rot-rot-rot'); await e.click('.popup .schutz button:has-text("Passwort setzen")')
await e.waitForFunction(() => document.querySelector('#pw-meldung')?.textContent.includes('Gespeichert'))
const f2 = await person(); const rf = await f2.goto(e.url())
await f2.fill('#passwort', 'rot-rot-rot'); await f2.click('button[type=submit]')
check('Name mit Leerzeichen: entsperrt ins richtige Pad', rf.status() === 403 && await f2.waitForSelector('.ProseMirror', { timeout: 8000 }).then(() => f2.url() === e.url(), () => false), f2.url())

// Besitz-Link: ein weiterer Browser verwaltet das Pad, auch mit Passwort, ohne es einzugeben
await e.click('.popup .besitz summary')
await e.click('.popup .besitz button:has-text("Besitz-Link erstellen")')
await e.waitForSelector('#besitz-link')
const link1 = await e.inputValue('#besitz-link')
check('Besitz-Link mit Geheimnis im Fragment', /\/besitz#[A-Za-z0-9]{32}$/.test(link1), link1)
const h = await person(); await h.goto(link1)
check('Besitz-Seite entfernt das Geheimnis aus der Adresse', !h.url().includes('#'), h.url())
await Promise.all([h.waitForNavigation(), h.click('button:has-text("In diesem Browser übernehmen")')]); await bereit(h)
check('über den Link ins Pad mit Passwort, ohne Eingabe', h.url() === e.url(), h.url())
await h.click('button[title="Teilnehmende"]')
check('neuer Browser verwaltet das Pad', !!(await h.$('.popup .schutz')) && (await h.textContent('.popup .owner')).includes('Mein Pad'))
await e.reload(); await bereit(e); await e.click('button[title="Teilnehmende"]')
check('bisheriger Browser behält den Besitz', !!(await e.$('.popup .schutz')))
check('Besitz-Link zugeklappt, solange nichts angezeigt wird', !(await e.$eval('.popup .besitz', d => d.open)))
await e.click('.popup .besitz summary')
e.once('dialog', d => d.accept())
await e.click('.popup .besitz button:has-text("Neuen Besitz-Link erstellen")'); await e.waitForSelector('#besitz-link')
check('neuer Link ersetzt den alten', (await e.inputValue('#besitz-link')) !== link1)
const rh = await h.reload()
check('über den alten Link hinzugekommen: Besitz entzogen, Passwort wieder nötig', rh.status() === 403 && !!(await h.$('#passwort')), String(rh.status()))
const k = await person(); await k.goto(link1)
const rk = await Promise.all([k.waitForNavigation(), k.click('button:has-text("In diesem Browser übernehmen")')]).then(([r]) => r)
check('alter Link gilt nicht mehr', rk.status() === 403 && (await k.textContent('#besitz-fehler')).includes('gilt nicht mehr'), String(rk.status()))
for (const dunkel of [false, true]) {
  await k.emulateMedia({ colorScheme: dunkel ? 'dark' : 'light' })
  await k.waitForTimeout(500) // Farbübergänge abwarten
  const v = (await new AxeBuilder({ page: k }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations
  check(`Besitz-Seite axe ${dunkel ? 'dunkel' : 'hell'}`, !v.length, v.map(x => x.id + ': ' + x.nodes.map(n => n.target.join(' ') + ' ' + (n.any[0]?.message || '')).join(' | ')).join(','))
}
await e.click('.popup .besitz button:has-text("Besitz-Link widerrufen")')
await e.waitForFunction(() => document.querySelector('#besitz-meldung')?.textContent.includes('Widerrufen'))
check('Besitz-Link widerrufen', !(await e.$('#besitz-link')))

await browser.close(); check('keine Fehler im Browser', !errors.length, errors.join(' / '))
console.log(`\n${pass} ok, ${fail} fehlgeschlagen`); process.exit(fail ? 1 : 0)
