// Codeblöcke: Markdown-Zaun, Einfügen, Dialog, Absatzstil, Autorenfarbe, Tab/Esc, Export.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
let pass = 0, fail = 0
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : ' ' + x}`) }
const base = process.env.NEXTPAD_URL || 'http://127.0.0.1:5090'
const key = readFileSync(process.env.NEXTPAD_KEY_FILE || process.env.HOME + '/.cache/nextpad-data/api-keys.txt', 'utf8').trim()
const api = async (fn, args) => (await (await fetch(`${base}/api/1.2/${fn}`, { method: 'POST', body: new URLSearchParams({ apikey: key, ...args }) })).json()).data
const G = (await api('createGroup', {})).groupID
const P = (await api('createGroupPad', { groupID: G, padName: 'code' + Date.now() })).padID
const A = (await api('createAuthorIfNotExistsFor', { authorMapper: 'code1', name: 'Code Tester' })).authorID
const S = (await api('createSession', { groupID: G, authorID: A, validUntil: String(Math.floor(Date.now() / 1000) + 3600) })).sessionID
const browser = await chromium.launch(); const ctx = await browser.newContext()
await ctx.addCookies([{ name: 'sessionID', value: S, domain: new URL(base).hostname, path: '/' }])
const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 150)))
await page.goto(`${base}/p/${P}`); await page.waitForSelector('.ProseMirror'); await page.waitForFunction(() => document.querySelector('#statusbar .ok') !== null)
const json = () => page.evaluate(() => window.nextpad.editor.getJSON())
const blocks = async () => (await json()).content.filter(n => n.type === 'codeBlock')
const text = n => (n.content || []).map(t => t.text).join('')
const paste = t => page.evaluate(t => { const dt = new DataTransfer(); dt.setData('text/plain', t); document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) }, t)
await page.evaluate(() => window.nextpad.editor.commands.focus('end')); await page.waitForTimeout(200)

// 1. Zaun mit Sprache tippen, Tab rückt ein, Umschalt+Tab aus
await page.keyboard.type('```python'); await page.keyboard.press('Enter')
await page.keyboard.type('if a < b:'); await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.type('print("ja")')
await page.waitForTimeout(200)
let cb = await blocks()
check('Zaun ergibt Codeblock mit Sprache', cb.length === 1 && cb[0].attrs.language === 'python', JSON.stringify(cb))
check('Enter bleibt im Block, Tab rückt um zwei Leerzeichen ein', cb[0] && text(cb[0]) === 'if a < b:\n  print("ja")', JSON.stringify(text(cb[0] || {})))
check('Autorenfarbe im Block', (cb[0]?.content || []).every(t => (t.marks || []).some(m => m.type === 'author')) && await page.locator('.ProseMirror pre span.author').count() > 0)
await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(100)
check('Umschalt+Tab rückt aus', text((await blocks())[0]) === 'if a < b:\nprint("ja")')
// mit Auswahl rückt Tab jede markierte Zeile am Anfang ein
await page.evaluate(() => { const ed = window.nextpad.editor; let a = 0, b = 0; ed.state.doc.descendants((n, p) => { if (n.type.name === 'codeBlock') { a = p + 1; b = p + n.nodeSize - 1 } }); ed.commands.setTextSelection({ from: a, to: b }) })
await page.keyboard.press('Tab'); await page.waitForTimeout(100)
check('Tab mit Auswahl rückt alle Zeilen ein', text((await blocks())[0]) === '  if a < b:\n  print("ja")', JSON.stringify(text((await blocks())[0])))
await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(100)
check('Umschalt+Tab mit Auswahl rückt alle Zeilen aus', text((await blocks())[0]) === 'if a < b:\nprint("ja")')
await page.evaluate(() => { const ed = window.nextpad.editor; let p0 = 0; ed.state.doc.descendants((n, p) => { if (n.type.name === 'codeBlock') p0 = p + 1 + n.textContent.indexOf('print') }); ed.commands.setTextSelection(p0) })
await page.keyboard.press('Tab'); await page.waitForTimeout(100)

// 2. Esc gibt Tab frei: Fokus verlässt den Editor
await page.keyboard.press('Escape'); await page.keyboard.press('Tab'); await page.waitForTimeout(100)
check('Esc und Tab verlassen den Editor', await page.evaluate(() => !document.querySelector('.ProseMirror').contains(document.activeElement)))
check('Inhalt dabei unverändert', text((await blocks())[0]) === 'if a < b:\n  print("ja")')

// 3. Eingefügter Text im Codeblock bleibt wörtlich
await page.evaluate(() => { const ed = window.nextpad.editor; let end = 0; ed.state.doc.descendants((n, p) => { if (n.type.name === 'codeBlock') end = p + n.nodeSize - 1 }); ed.commands.focus(); ed.commands.setTextSelection(end) })
await page.keyboard.press('Enter'); await paste('# kein Titel\n- keine Liste'); await page.waitForTimeout(200)
cb = await blocks()
check('Einfügen im Block bleibt Text', cb.length === 1 && text(cb[0]).endsWith('\n# kein Titel\n- keine Liste') && !(await json()).content.some(n => n.type === 'bulletList'), JSON.stringify(text(cb[0] || {})))

// 4. Dreimal Enter verlässt den Block
await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.type('danach'); await page.waitForTimeout(200)
const doc = await json(); const after = doc.content[doc.content.findIndex(n => n.type === 'codeBlock') + 1]
check('Dreimal Enter verlässt den Block', after?.type === 'paragraph' && text(after) === 'danach' && text((await blocks())[0]).endsWith('keine Liste'), JSON.stringify(after))

// 5. Markdown mit Zaun einfügen und im Dialog
await page.keyboard.press('Enter'); await paste('Vorher\n\n```js\nlet x = 1 < 2\n```'); await page.waitForTimeout(300)
cb = await blocks()
check('Eingefügtes Markdown mit Zaun', cb.length === 2 && cb[1].attrs.language === 'js' && text(cb[1]) === 'let x = 1 < 2', JSON.stringify(cb[1]))
await page.click('button[title^="Markdown-Text einfügen"]'); await page.waitForSelector('#mddialog textarea')
await page.fill('#mddialog textarea', '~~~\nohne Sprache\n~~~'); await page.click('#mddialog button[value="ok"]'); await page.waitForTimeout(300)
cb = await blocks()
check('Dialog mit Zaun', cb.length === 3 && text(cb[2]) === 'ohne Sprache' && !cb[2].attrs.language, JSON.stringify(cb[2]))

// 6. Absatzstil „Code“ und zurück zu „Normal“
await page.evaluate(() => { const ed = window.nextpad.editor; ed.commands.focus('end') })
await page.keyboard.press('Enter'); await page.keyboard.type('aus der Leiste')
const stil = page.locator('select[aria-label="Absatzstil"]')
check('Absatzstil kennt „Code“', await stil.locator('option[value="code"]').count() === 1)
await stil.selectOption('code'); await page.waitForTimeout(200)
cb = await blocks()
check('Absatzstil macht Codeblock', cb.length === 4 && text(cb[3]) === 'aus der Leiste')
await stil.selectOption('p'); await page.waitForTimeout(200)
check('„Normal“ macht wieder Absatz', (await blocks()).length === 3)

// 7. Exporte
await page.waitForTimeout(800)
const exp = async f => (await fetch(`${base}/p/${encodeURIComponent(P)}/export/${f}`, { headers: { Cookie: 'sessionID=' + S } })).text()
const md = await exp('md')
check('Markdown-Export mit Sprache und ohne Maskierung', md.includes('```python\nif a < b:\n  print("ja")\n# kein Titel\n- keine Liste\n```') && md.includes('```js\nlet x = 1 < 2\n```'), md)
const html = await exp('html')
check('HTML-Export mit Sprachklasse', html.includes('<pre><code class="language-python">') && html.includes('&lt;'))
const txt = await exp('txt')
check('Text-Export mit Einrückung', txt.includes('if a < b:\n  print("ja")'))
check('Etherpad-API getHTML mit Codeblock', ((await api('getHTML', { padID: P })).html || '').includes('<pre><code class="language-js">'))
await browser.close(); check('keine Fehler im Browser', !errors.length, errors.join(' / '))
console.log(`\n${pass} ok, ${fail} fehlgeschlagen`); process.exit(fail ? 1 : 0)
