// Links, Zitate und Trennlinien: tippen, einfügen, Dialog, Knopf, abgelehnte Adressen, Lesemodus, Exporte.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
let pass = 0, fail = 0
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : ' ' + x}`) }
const base = process.env.NEXTPAD_URL || 'http://127.0.0.1:5090'
const key = readFileSync(process.env.NEXTPAD_KEY_FILE || process.env.HOME + '/.cache/nextpad-data/api-keys.txt', 'utf8').trim()
const api = async (fn, args) => (await (await fetch(`${base}/api/1.2/${fn}`, { method: 'POST', body: new URLSearchParams({ apikey: key, ...args }) })).json()).data
const G = (await api('createGroup', {})).groupID
const P = (await api('createGroupPad', { groupID: G, padName: 'link' + Date.now() })).padID
const R = (await api('getReadOnlyID', { padID: P })).readOnlyID
const A = (await api('createAuthorIfNotExistsFor', { authorMapper: 'link1', name: 'Link Tester' })).authorID
const S = (await api('createSession', { groupID: G, authorID: A, validUntil: String(Math.floor(Date.now() / 1000) + 3600) })).sessionID
const browser = await chromium.launch(); const ctx = await browser.newContext()
await ctx.addCookies([{ name: 'sessionID', value: S, domain: new URL(base).hostname, path: '/' }])
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 150)))
await page.goto(`${base}/p/${P}`); await page.waitForSelector('.ProseMirror'); await page.waitForFunction(() => document.querySelector('#statusbar .ok') !== null)
const html = () => page.evaluate(() => window.nextpad.editor.getHTML())
const ende = async () => { await page.evaluate(() => window.nextpad.editor.commands.focus('end')); await page.waitForTimeout(100) }
const einfuegen = async t => { await page.evaluate(t => { const dt = new DataTransfer(); dt.setData('text/plain', t); document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) }, t); await page.waitForTimeout(400) }

// 1. Tippen
await ende()
await page.keyboard.type('> getipptes Zitat'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter')
await page.keyboard.type('---'); await page.keyboard.type('nach der Linie '); await page.keyboard.type('https://example.org/getippt '); await page.keyboard.press('Enter')
let h = await html()
check('Getippt: Zitat', /<blockquote><p>.*getipptes Zitat.*<\/p><\/blockquote>/.test(h), h)
check('Getippt: Trennlinie', h.includes('<hr>'), h)
check('Getippt: Adresse wird Link', /<a [^>]*href="https:\/\/example\.org\/getippt"/.test(h), h)
check('Link mit rel und target', /<a [^>]*target="_blank"[^>]*rel="noopener noreferrer nofollow"/.test(h), h)

// 2. Einfügen: das Beispiel aus der Probe gegen den Pilot
await ende()
await einfuegen('## Eingefügt\n\n> Zitat eingefügt\n\n---\n\n[Linktext](https://example.org/md) eingefügt\n\n![Bild](https://example.org/bild.png)\n\n###### Ebene sechs\n\n```\n###### im Zaun ![x](y)\n```')
h = await html()
check('Einfügen: Überschrift, Zitat und Linie', /<h2[ >]/.test(h) && /<blockquote><p>(<span[^>]*>)?Zitat eingefügt/.test(h) && (h.match(/<hr>/g) || []).length === 2, h)
check('Einfügen: Link mit Adresse', /<a [^>]*href="https:\/\/example\.org\/md"[^>]*>.*Linktext/.test(h), h)
check('Einfügen: Bild bleibt als Zeichenfolge', (await page.evaluate(() => window.nextpad.editor.getText())).includes('![Bild](https://example.org/bild.png)') && !h.includes('<img'), h)
check('Einfügen: Ebene 6 wird Ebene 4', /<h4[^>]*>.*Ebene sechs/.test(h) && !/<h1[^>]*>.*Ebene sechs/.test(h), h)
check('Einfügen: im Codezaun bleibt alles wörtlich', h.includes('###### im Zaun ![x](y)'), h)

// 3. Abgelehnte Adressen beim Einfügen und im Dialog
await ende()
await einfuegen('[böse](javascript:alert(1)) und [daten](data:text/html,x)')
h = await html()
check('javascript: und data: werden kein Link', !/href="(javascript|data):/i.test(h) && h.includes('böse'), h)
await page.keyboard.press('Enter'); await page.keyboard.type('Markierter Text')
await page.keyboard.down('Shift'); for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift')
await page.click('button[title^="Link einfügen"]'); await page.waitForSelector('#linkdialog')
await page.fill('#linkadresse', 'javascript:alert(1)'); await page.click('#linkdialog button[value="ok"]'); await page.waitForTimeout(200)
check('Dialog lehnt javascript: ab und bleibt offen', await page.locator('#linkdialog').count() === 1 && (await page.textContent('#linkfehler')).includes('http://'))
check('Fehlermeldung ist für Screenreader angebunden', await page.getAttribute('#linkadresse', 'aria-invalid') === 'true' && await page.getAttribute('#linkfehler', 'role') === 'alert')
await page.fill('#linkadresse', 'example.org/dialog'); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
h = await html()
check('Dialog: Adresse ohne Protokoll bekommt https://', /<a [^>]*href="https:\/\/example\.org\/dialog"[^>]*>.*Text/.test(h) && await page.locator('#linkdialog').count() === 0, h)

// 4. Feld am Link: volle Adresse, Öffnen, Ändern, Entfernen
await page.evaluate(() => { const ed = window.nextpad.editor; ed.chain().focus().setTextSelection(ed.state.selection.to - 2).run() }); await page.waitForTimeout(400)
check('Feld zeigt die volle Adresse', await page.isVisible('#linkfeld') && (await page.textContent('#linkfeld .adresse')) === 'https://example.org/dialog')
check('Feld: „Öffnen“ ist ein Link in neuem Tab', await page.getAttribute('#linkfeld a', 'href') === 'https://example.org/dialog' && await page.getAttribute('#linkfeld a', 'target') === '_blank')
const ziel = await page.evaluate(() => [...document.querySelectorAll('#linkfeld a, #linkfeld button')].map(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) }))
check('Feld: Ziele mindestens 44 px', ziel.length === 3 && ziel.every(n => n >= 44), JSON.stringify(ziel))
await page.keyboard.press('Control+k'); await page.waitForSelector('#linkdialog')
check('Strg+K öffnet den Dialog mit der Adresse', await page.inputValue('#linkadresse') === 'https://example.org/dialog' && await page.locator('#linkdialog a.oeffnen').count() === 1)
await page.click('#linkdialog button[value="entfernen"]'); await page.waitForTimeout(300)
h = await html()
check('„Link entfernen“ lässt den Text stehen', !h.includes('example.org/dialog') && h.includes('Text'), h)
// Knopf ohne Markierung: Dialog mit Textfeld, Mailadresse bekommt mailto:
await ende(); await page.keyboard.press('Enter')
await page.click('button[title^="Link einfügen"]'); await page.waitForSelector('#linktext')
await page.fill('#linkadresse', 'post@example.org'); await page.fill('#linktext', 'Schreib uns'); await page.click('#linkdialog button[value="ok"]'); await page.waitForTimeout(300)
h = await html()
check('Knopf ohne Markierung fügt Link mit Text ein', /<a [^>]*href="mailto:post@example\.org"[^>]*>.*Schreib uns/.test(h), h)

// 5. Absatzstil „Zitat“ und zurück
await ende(); await page.keyboard.press('Enter'); await page.keyboard.type('aus der Leiste')
const stil = page.locator('select[aria-label="Absatzstil"]')
await stil.selectOption('quote'); await page.waitForTimeout(200)
check('Absatzstil macht Zitat', /<blockquote><p>[^]*aus der Leiste[^]*<\/p><\/blockquote>/.test(await html()))
await stil.selectOption('p'); await page.waitForTimeout(200)
check('„Normal“ hebt das Zitat auf', !/<blockquote><p>(?:(?!<\/blockquote>)[^])*aus der Leiste/.test(await html()))

// 6. Exporte und Etherpad-API
await page.waitForTimeout(900)
const exp = async f => (await fetch(`${base}/p/${encodeURIComponent(P)}/export/${f}`, { headers: { Cookie: 'sessionID=' + S } })).text()
const md = await exp('md')
check('Markdown-Export: Link, Zitat, Linie', md.includes('[Linktext](https://example.org/md)') && md.includes('> Zitat eingefügt') && md.includes('\n---\n') && md.includes('#### Ebene sechs'), md)
const ex = await exp('html')
check('HTML-Export: Link mit rel, Zitat, Linie', ex.includes('href="https://example.org/md" target="_blank" rel="noopener noreferrer nofollow"') && ex.includes('<blockquote>') && ex.includes('<hr>') && !/href="(javascript|data):/i.test(ex), ex)
const txt = await exp('txt')
check('Text-Export: Adresse hinter dem Linktext', txt.includes('Linktext (https://example.org/md)') && txt.includes('> Zitat eingefügt') && txt.includes('Schreib uns (mailto:post@example.org)'), txt)
if (!process.env.NEXTPAD_OHNE_PDF) { const r = await fetch(`${base}/p/${encodeURIComponent(P)}/export/pdf`, { headers: { Cookie: 'sessionID=' + S } }); check('PDF-Export gelingt', r.status === 200 && (await r.arrayBuffer()).byteLength > 1000, String(r.status)) }
const viaApi = (await api('getHTML', { padID: P })).html || ''
check('Etherpad-API getHTML mit Link, Zitat und Linie', viaApi.includes('<a href="https://example.org/md"') && viaApi.includes('<blockquote>') && viaApi.includes('<hr>'))
// setHTML: geprüfter Import, auch gegen eine von außen gesetzte Adresse
const P2 = (await api('createGroupPad', { groupID: G, padName: 'link2' + Date.now() })).padID
await api('setHTML', { padID: P2, html: '<html><body><p><a href="https://example.org/api">gut</a> <a href="javascript:alert(1)">böse</a></p><blockquote>Zitat</blockquote><hr><p>Ende</p></body></html>' })
const zurueck = (await api('getHTML', { padID: P2 })).html || ''
check('setHTML: Link, Zitat und Linie kommen an, javascript: nicht', zurueck.includes('<a href="https://example.org/api"') && zurueck.includes('<blockquote>') && zurueck.includes('<hr>') && !/javascript/i.test(zurueck) && zurueck.includes('böse'), zurueck)
const page2 = await ctx.newPage(); page2.on('pageerror', e => errors.push('P2 ' + e.message.slice(0, 150)))
await page2.goto(`${base}/p/${P2}`); await page2.waitForSelector('.ProseMirror'); await page2.waitForFunction(() => document.querySelector('#statusbar .ok') !== null)
const h2 = await page2.evaluate(() => window.nextpad.editor.getHTML())
check('Importiertes Pad im Editor: Link, Zitat, Linie', /<a [^>]*href="https:\/\/example\.org\/api"/.test(h2) && h2.includes('<blockquote>') && h2.includes('<hr>'), h2)
await page2.close()

// 7. Lesemodus: kein Feld, kein Knopf, der Klick öffnet den Link selbst
const lese = await ctx.newPage(); lese.on('pageerror', e => errors.push('lesen ' + e.message.slice(0, 150)))
await lese.goto(`${base}/p/${R}`); await lese.waitForSelector('.ProseMirror a[href="https://example.org/md"]')
check('Lesemodus: kein Link-Knopf', await lese.locator('button[title^="Link einfügen"]').count() === 0)
const [neu] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), lese.click('.ProseMirror a[href="https://example.org/md"]')])
check('Lesemodus: Klick öffnet den Link in neuem Tab', !!neu && neu.url().startsWith('https://example.org/md') || !!neu, neu ? neu.url() : 'kein Tab')
check('Lesemodus: kein Feld am Link', !(await lese.isVisible('#linkfeld')))
await browser.close(); check('keine Fehler im Browser', !errors.length, errors.join(' / '))
console.log(`\n${pass} ok, ${fail} fehlgeschlagen`); process.exit(fail ? 1 : 0)
