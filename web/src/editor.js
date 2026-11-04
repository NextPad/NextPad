// NextPad-Editor: TipTap auf ProseMirror, Yjs-Sync über y-websocket gegen den Rust-Server.
import { Editor, Mark, Extension, InputRule } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import { Markdown } from '@tiptap/markdown'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import CodeBlock from '@tiptap/extension-code-block'
import { batchRemoteUpdates } from './yjs-batch.js'
import { tableExtensions, addTableTools } from './table-tools.js'
import { createRating, thumbSvg } from './rating.js'
import { TableOfContents, createTocSidebar } from './toc.js'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import { DOMSerializer } from '@tiptap/pm/model'
import { tx, locale } from './texte.js'

const cfg = JSON.parse(document.getElementById('nextpad-config').textContent)
const testFlags = new URLSearchParams(location.search) // nur für Tests: ?nocaret=1 schaltet die Cursor-Anzeige ab
const palette = cfg.palette

function colorFor(id) {
  let h = 1469598103934665603n
  for (const b of new TextEncoder().encode(id)) { h ^= BigInt(b); h = (h * 1099511628211n) & 0xffffffffffffffffn }
  return palette[Number(h % BigInt(palette.length))]
}

// Mark "author": trägt die Autorenkennung je Zeichen; Farbe aus der Palette.
const AuthorMark = Mark.create({
  name: 'author',
  inclusive: true,
  excludes: 'author',
  addAttributes() {
    return { id: { default: null, parseHTML: el => el.getAttribute('data-author'), renderHTML: a => a.id ? { 'data-author': a.id } : {} } }
  },
  parseHTML() { return [{ tag: 'span[data-author]' }] },
  renderHTML({ HTMLAttributes, mark }) {
    const id = mark.attrs.id
    const style = id && showColors ? `background-color:${colorFor(id)}` : ''
    return ['span', { ...HTMLAttributes, class: 'author', style, title: id ? (names.get(id) || '') : '' }, 0]
  },
})

// Plugin: Die Mark des eigenen Autors ist immer als gespeicherte Mark aktiv, damit alles,
// was lokal getippt wird, die eigene Kennung trägt. Fremde Marks bleiben unangetastet.
const authorKey = new PluginKey('nextpad-author')
const AuthorTagging = Extension.create({
  name: 'authorTagging',
  addProseMirrorPlugins() {
    const me = cfg.author.id
    return [new Plugin({
      key: authorKey,
      appendTransaction(trs, oldState, newState) {
        if (!me || cfg.readonly) return null
        const authorType = newState.schema.marks.author
        const current = newState.storedMarks || newState.selection.$from.marks()
        const mine = current.find(m => m.type === authorType && m.attrs.id === me)
        if (mine) return null
        const others = current.filter(m => m.type !== authorType)
        return newState.tr.setStoredMarks([...others, authorType.create({ id: me })])
      },
    })]
  },
})

// Einrücken von Absätzen und Überschriften (wie Tab in Etherpad); Listen rücken weiter über ihre Verschachtelung ein.
const MAX_INDENT = 8
const inList = ed => ed.isActive('listItem') || ed.isActive('taskItem')
const Indent = Extension.create({
  name: 'indent',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        indent: {
          // null statt 0, damit nicht jeder Absatz im Dokument ein Attribut mitschleppt
          default: null,
          parseHTML: el => Math.min(MAX_INDENT, Math.max(0, parseInt(el.getAttribute('data-indent'), 10) || 0)) || null,
          renderHTML: a => a.indent ? { 'data-indent': a.indent, style: `padding-left: ${a.indent * 2}em` } : {},
        },
      },
    }]
  },
  addCommands() {
    const step = d => () => ({ tr, state, dispatch }) => {
      const { from, to } = state.selection
      let changed = false
      state.doc.nodesBetween(from, to, (node, pos) => {
        if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return
        const n = Math.min(MAX_INDENT, Math.max(0, (node.attrs.indent || 0) + d))
        if (n === (node.attrs.indent || 0)) return false
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: n || null })
        changed = true
        return false
      })
      if (changed && dispatch) dispatch(tr)
      return changed
    }
    return { indent: step(1), outdent: step(-1) }
  },
  // Einrückung gilt nur auf oberster Ebene: wird aus einem eingerückten Absatz ein Listenpunkt, fällt sie weg
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('nextpad-indent'),
      appendTransaction(trs, _old, state) {
        if (!trs.some(t => t.docChanged)) return null
        let tr = null
        state.doc.descendants((node, pos, parent) => {
          if (parent === state.doc) return node.type.name !== 'paragraph' && node.type.name !== 'heading'
          if (node.attrs.indent) (tr ||= state.tr).setNodeMarkup(pos, undefined, { ...node.attrs, indent: null })
        })
        return tr
      },
    })]
  },
  addKeyboardShortcuts() {
    // in Listen und Tabellen gelten deren eigene Tab-Tasten
    const free = ed => !inList(ed) && !ed.isActive('table') && !ed.isActive('codeBlock')
    return {
      Tab: ({ editor: ed }) => free(ed) && ed.commands.indent(),
      'Shift-Tab': ({ editor: ed }) => free(ed) && ed.commands.outdent(),
    }
  },
})

// Markdown-Aufgabe getippt: „- [ ] “ macht erst einen Listenpunkt, „[ ] “ darin wird dann zur Aufgabe („[x] “ erledigt)
const TaskShortcut = Extension.create({
  name: 'taskShortcut',
  addInputRules() {
    return [new InputRule({
      find: /^\[([ xX])\]\s$/,
      handler: ({ state, range, match, chain }) => {
        const $f = state.doc.resolve(range.from)
        if ($f.depth < 2 || $f.node(-1).type.name !== 'listItem') return null
        chain().deleteRange(range).toggleTaskList().updateAttributes('taskItem', { checked: match[1] !== ' ' }).run()
      },
    })]
  },
})

// Codeblock: ``` mit Sprache, Absatzstil „Code“; nur die Autorenfarbe als Mark.
// Tab rückt die Zeilen um zwei Leerzeichen ein, Umschalt+Tab aus. Esc gibt Tab frei: die nächste
// Tab-Taste verlässt den Editor (keine Tastaturfalle, WCAG 2.1.2).
const CODE_INDENT = '  '
let codeEscaped = false
function codeLines(state) {
  // Anfänge der markierten Zeilen im Codeblock als Dokumentpositionen
  const { $from, from, to } = state.selection
  const start = $from.start(), text = $from.parent.textContent
  const a = from - start, b = to - start
  const pos = [start + text.lastIndexOf('\n', a - 1) + 1]
  for (let i = text.indexOf('\n', a); i !== -1 && i < b; i = text.indexOf('\n', i + 1)) pos.push(start + i + 1)
  return pos
}
const NextCodeBlock = CodeBlock.extend({
  marks: 'author',
  addKeyboardShortcuts() {
    const inCode = ed => ed.isActive('codeBlock')
    return {
      ...this.parent?.(),
      Tab: ({ editor: ed }) => {
        if (!inCode(ed)) return false
        if (codeEscaped) { codeEscaped = false; return false }
        const { state } = ed, { empty } = state.selection
        if (empty) return ed.commands.insertContent(CODE_INDENT)
        const tr = state.tr
        for (const p of codeLines(state).reverse()) tr.insertText(CODE_INDENT, p)
        ed.view.dispatch(tr); return true
      },
      'Shift-Tab': ({ editor: ed }) => {
        if (!inCode(ed)) return false
        if (codeEscaped) { codeEscaped = false; return false }
        const { state } = ed, text = state.selection.$from.parent.textContent, start = state.selection.$from.start()
        const tr = state.tr
        for (const p of codeLines(state).reverse()) {
          let n = 0; while (n < CODE_INDENT.length && text[p - start + n] === ' ') n++
          if (n) tr.delete(p, p + n)
        }
        if (tr.docChanged) ed.view.dispatch(tr)
        return true
      },
      Escape: ({ editor: ed }) => { if (!inCode(ed)) return false; codeEscaped = true; return true },
    }
  },
  addProseMirrorPlugins() {
    // jede andere Taste oder ein Klick hebt die Freigabe wieder auf
    return [...(this.parent?.() || []), new Plugin({
      key: new PluginKey('nextpad-code-escape'),
      props: {
        handleKeyDown(_view, ev) { if (ev.key !== 'Escape' && ev.key !== 'Tab' && ev.key !== 'Shift') codeEscaped = false; return false },
        handleClick() { codeEscaped = false; return false },
      },
    })]
  },
}).configure({ HTMLAttributes: { spellcheck: 'false' } })

const names = new Map()
let showColors = true

// Markdown als Eingabe: eingefügter Klartext, der nach Markdown aussieht, wird als Markdown gelesen.
const looksLikeMarkdown = t => /^(#{1,6} |[-*+] |\d+\. |> |[-*+] \[[ xX]\] |```|~~~)/m.test(t) || /^\s*\|.*\|\s*\n\s*\|?\s*:?-{3,}/m.test(t) || /\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)]+\)|~~[^~]+~~/.test(t)
const MarkdownPaste = Extension.create({
  name: 'markdownPaste',
  addProseMirrorPlugins() {
    const ed = this.editor
    return [new Plugin({
      key: new PluginKey('nextpad-markdown-paste'),
      props: {
        handlePaste(view, event) {
          const cd = event.clipboardData
          // im Codeblock bleibt eingefügter Text, wie er ist
          if (!cd || cd.types.includes('text/html') || ed.isActive('codeBlock')) return false
          const text = cd.getData('text/plain')
          if (!text || !looksLikeMarkdown(text)) return false
          ed.commands.insertContent(text, { contentType: 'markdown' })
          return true
        },
      },
    })]
  },
})

const ydoc = new Y.Doc()
const wsBase = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + cfg.basePath + '/ws'
const provider = new WebsocketProvider(wsBase, encodeURIComponent(cfg.urlId), ydoc, { disableBc: true })
const remoteBatch = batchRemoteUpdates(provider)
const myName = cfg.author.guest ? tx('gast') : (cfg.author.name || tx('gast'))
provider.awareness.setLocalStateField('user', { name: myName, color: cfg.author.color, id: cfg.author.id, avatar: cfg.author.avatar || null })
provider.awareness.on('change', () => {
  provider.awareness.getStates().forEach(s => { if (s.user && s.user.id) names.set(s.user.id, s.user.name) })
  renderStatus()
})

// Profilbilder nur von Moodle-Hosts (CSP erlaubt nur diese); sonst Initiale bzw. „Gast“.
function avatarEl(user, size) {
  const wrap = document.createElement('span'); wrap.className = 'avatar'; wrap.style.width = wrap.style.height = size + 'px'; wrap.style.backgroundColor = user.color || '#ccc'
  if (user.avatar && /^https:\/\//.test(user.avatar)) {
    const img = document.createElement('img'); img.src = user.avatar; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.loading = 'lazy'
    img.addEventListener('error', () => { img.remove(); wrap.textContent = (user.name || 'G').trim().charAt(0).toUpperCase() })
    wrap.appendChild(img)
  } else { wrap.textContent = (user.name || 'G').trim().charAt(0).toUpperCase() }
  return wrap
}
function renderCaret(user) {
  const caret = document.createElement('span'); caret.className = 'collaboration-carets__caret'; caret.style.borderColor = user.color
  const label = document.createElement('div'); label.className = 'collaboration-carets__label'; label.style.backgroundColor = user.color
  if (user.avatar) label.appendChild(avatarEl(user, 18))
  label.appendChild(document.createTextNode(user.name || tx('gast')))
  caret.appendChild(label); return caret
}

const editor = new Editor({
  element: document.getElementById('editor'),
  editable: !cfg.readonly,
  // Name der Schreibfläche für Screenreader (TipTap setzt role=textbox ohne Namen)
  editorProps: { attributes: { 'aria-label': cfg.readonly ? tx('text_lesen') : tx('text'), 'aria-multiline': 'true' } },
  extensions: [
    StarterKit.configure({ undoRedo: false, link: false, codeBlock: false, blockquote: false, horizontalRule: false, heading: { levels: [1, 2, 3, 4] } }),
    TextStyle, Color, FontSize,
    TextAlign.configure({ types: ['heading', 'paragraph'] }), Indent,
    TaskList, TaskItem.configure({ nested: true }), TaskShortcut, NextCodeBlock,
    ...tableExtensions, TableOfContents,
    createRating({ ydoc, me: cfg.author.id, readonly: cfg.readonly }),
    Markdown, MarkdownPaste,
    AuthorMark, ...(testFlags.has('noauthor') ? [] : [AuthorTagging]),
    Collaboration.configure({ document: ydoc, field: 'default' }),
    ...(testFlags.has('nocaret') ? [] : [CollaborationCaret.configure({ provider, user: { name: myName, color: cfg.author.color, avatar: cfg.author.avatar || null }, render: renderCaret })]),
  ],
})

// Werkzeugleiste nach dem Vorbild von Etherpad (Skin Colibris): Symbole aus Etherpads Symbolschrift.
const tb = document.getElementById('toolbar')
const sb = document.getElementById('statusbar')
const edBox = document.getElementById('editorcontainerbox')
const I = { tasks: '\ue832', table: '\uf0ce', toc: '\ue82e', bold: '', italic: '', underline: '', strike: '', ol: '', ul: '', indent: '', outdent: '', undo: '', redo: '', eye: '', alignL: '', alignC: '', alignR: '', alignJ: '', md: '', history: '', share: '', users: '', cog: '', pdf: '', file: '', code: '', times: '' }
function ibtn(parent, icon, title, fn, isActive) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'ib'; b.title = title; b.setAttribute('aria-label', title)
  const i = document.createElement('span'); i.className = 'buttonicon'; i.textContent = icon; i.setAttribute('aria-hidden', 'true'); b.appendChild(i)
  b.addEventListener('click', () => { fn(); editor.commands.focus() }); b._isActive = isActive; parent.appendChild(b); return b
}
const sep = parent => { const s = document.createElement('span'); s.className = 'separator'; parent.appendChild(s) }
function select(parent, title, label, entries, onChange) {
  const sel = document.createElement('select'); sel.title = title; sel.setAttribute('aria-label', title); sel.className = 'tsel'
  const o0 = document.createElement('option'); o0.value = ''; o0.textContent = label; sel.appendChild(o0)
  for (const [v, t] of entries) { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o) }
  sel.addEventListener('change', () => { if (sel.value !== '') onChange(sel.value); sel.value = ''; editor.commands.focus() })
  parent.appendChild(sel); return sel
}
const menuLeft = document.createElement('div'); menuLeft.className = 'menu_left'; tb.appendChild(menuLeft)
// Logo der Einrichtung; bei freien Pads führt es wie das Haus-Symbol zur Startseite
if (cfg.logo) {
  const lg = document.createElement('img'); lg.src = cfg.logo; lg.alt = cfg.logoAlt || ''; lg.className = 'toolbar-logo'
  if (cfg.free) {
    const a = document.createElement('a'); a.className = 'toolbar-home'; a.href = `${cfg.basePath}/`; a.title = tx('startseite')
    a.setAttribute('aria-label', cfg.logoAlt ? `${cfg.logoAlt}, ${tx('startseite')}` : tx('startseite')); lg.alt = ''
    a.appendChild(lg); menuLeft.appendChild(a)
  } else menuLeft.appendChild(lg)
  const s0 = document.createElement('span'); s0.className = 'separator'; menuLeft.appendChild(s0)
}
const menuRight = document.createElement('div'); menuRight.className = 'menu_right'; tb.appendChild(menuRight)
if (!cfg.readonly) {
  ibtn(menuLeft, I.bold, tx('fett'), () => editor.chain().toggleBold().run(), () => editor.isActive('bold'))
  ibtn(menuLeft, I.italic, tx('kursiv'), () => editor.chain().toggleItalic().run(), () => editor.isActive('italic'))
  ibtn(menuLeft, I.underline, tx('unterstrichen'), () => editor.chain().toggleUnderline().run(), () => editor.isActive('underline'))
  ibtn(menuLeft, I.strike, tx('durchgestrichen'), () => editor.chain().toggleStrike().run(), () => editor.isActive('strike'))
  sep(menuLeft)
  ibtn(menuLeft, I.ol, tx('nummeriert'), () => editor.chain().toggleOrderedList().run(), () => editor.isActive('orderedList'))
  ibtn(menuLeft, I.ul, tx('aufzaehlung'), () => editor.chain().toggleBulletList().run(), () => editor.isActive('bulletList'))
  ibtn(menuLeft, I.tasks, tx('aufgaben'), () => editor.chain().focus().toggleTaskList().run(), () => editor.isActive('taskList'))
  ibtn(menuLeft, I.indent, tx('einruecken'), () => { editor.commands.focus(); inList(editor) ? editor.commands.sinkListItem(editor.isActive('taskItem') ? 'taskItem' : 'listItem') : editor.commands.indent() })
  ibtn(menuLeft, I.outdent, tx('ausruecken'), () => { editor.commands.focus(); inList(editor) ? editor.commands.liftListItem(editor.isActive('taskItem') ? 'taskItem' : 'listItem') : editor.commands.outdent() })
  sep(menuLeft)
  ibtn(menuLeft, I.undo, tx('rueckgaengig'), () => editor.chain().undo().run())
  ibtn(menuLeft, I.redo, tx('wiederholen'), () => editor.chain().redo().run())
  sep(menuLeft)
}
ibtn(menuLeft, I.eye, tx('autorenfarben'), () => { showColors = !showColors; document.getElementById('editor').classList.toggle('no-colors', !showColors) }, () => !showColors)
if (!cfg.readonly) {
  sep(menuLeft)
  select(menuLeft, tx('schriftgroesse'), tx('schriftgroesse'), [['', tx('standard')], ...[8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 30, 36, 48].map(n => [n + 'px', String(n)])], v => v ? editor.chain().setFontSize(v).run() : editor.chain().unsetFontSize().run())
  select(menuLeft, tx('textfarbe'), tx('farbe'), [['', tx('schwarz')], ['#e60028', tx('rot')], ['#2e8b57', tx('gruen')], ['#1e5bc6', tx('blau')], ['#c9a800', tx('gelb')], ['#e07a00', tx('orange')], ['#6f42c1', tx('violett')], ['#8b4513', tx('braun')]], v => v ? editor.chain().setColor(v).run() : editor.chain().unsetColor().run())
  sep(menuLeft)
  ibtn(menuLeft, I.alignL, tx('links'), () => editor.chain().setTextAlign('left').run(), () => editor.isActive({ textAlign: 'left' }))
  ibtn(menuLeft, I.alignC, tx('zentriert'), () => editor.chain().setTextAlign('center').run(), () => editor.isActive({ textAlign: 'center' }))
  ibtn(menuLeft, I.alignR, tx('rechts'), () => editor.chain().setTextAlign('right').run(), () => editor.isActive({ textAlign: 'right' }))
  ibtn(menuLeft, I.alignJ, tx('blocksatz'), () => editor.chain().setTextAlign('justify').run(), () => editor.isActive({ textAlign: 'justify' }))
  sep(menuLeft)
  select(menuLeft, tx('absatzstil'), tx('stil'), [['p', tx('normal')], ...[1, 2, 3, 4].map(n => [String(n), tx('ueberschrift', { n })]), ['code', tx('code')]], v => v === 'p' ? editor.chain().setParagraph().run() : v === 'code' ? editor.chain().setCodeBlock().run() : editor.chain().setHeading({ level: +v }).run())
  sep(menuLeft)
  ibtn(menuLeft, I.md, tx('markdown'), () => openMarkdownDialog())
  sep(menuLeft)
  addTableTools(editor, menuLeft, { ibtn, select, icon: I.table })
  const rateBtn = ibtn(menuLeft, '', tx('bewertung'), () => editor.chain().focus().insertRating().run())
  rateBtn.querySelector('.buttonicon').innerHTML = thumbSvg('up', 15)
}
const tocBtn = ibtn(menuRight, I.toc, tx('inhalt_umschalten'), () => toc.toggle(), () => toc.open)
const toc = createTocSidebar(editor, edBox, { readonly: cfg.readonly, onChange: open => { tocBtn.classList.toggle('selected', open); tocBtn.setAttribute('aria-pressed', String(open)) } })
// Dunkler Modus: eigene Wahl merkt sich der Browser, sonst gilt die Einstellung des Geräts
const THEME_KEY = 'nextpad.theme'
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const storedTheme = () => { try { return localStorage.getItem(THEME_KEY) } catch { return null } }
const isDark = () => (storedTheme() || (darkQuery.matches ? 'dark' : 'light')) === 'dark'
function applyTheme() {
  document.documentElement.dataset.theme = isDark() ? 'dark' : 'light'
  if (darkBtn) { darkBtn.classList.toggle('selected', isDark()); darkBtn.setAttribute('aria-pressed', String(isDark())) }
}
let darkBtn = null
darkBtn = ibtn(menuRight, '\u25D0', tx('dunkel'), () => {
  try { localStorage.setItem(THEME_KEY, isDark() ? 'light' : 'dark') } catch {}
  applyTheme()
}, isDark)
darkQuery.addEventListener('change', () => { if (!storedTheme()) applyTheme() })
applyTheme()
// Sprache wählen (DE | EN), führt auf dieses Pad zurück
{
  const w = document.createElement('span'); w.className = 'sprachwahl'
  const zurueck = encodeURIComponent(location.pathname + location.search)
  for (const [l, kurz, name] of [['de', 'DE', 'Deutsch'], ['en', 'EN', 'English']]) {
    const a = document.createElement('a'); a.className = 'ib' + (cfg.lang === l ? ' selected' : ''); a.href = `${cfg.basePath}/sprache/${l}?zurueck=${zurueck}`
    a.lang = l; a.hreflang = l; a.textContent = kurz; a.setAttribute('aria-label', name)
    if (cfg.lang === l) a.setAttribute('aria-current', 'true')
    w.appendChild(a)
  }
  menuRight.appendChild(w)
}
// aus Moodle gestartet: zurück in den Kurs, auch aus der eingebetteten Ansicht heraus
if (cfg.course) { const k = document.createElement('a'); k.className = 'ib'; k.href = cfg.course; k.target = '_top'; k.textContent = tx('zum_kurs'); menuRight.appendChild(k) }
if (cfg.free) { const home = document.createElement('a'); home.className = 'ib'; home.href = `${cfg.basePath}/`; home.title = tx('startseite'); home.innerHTML = '<span class="buttonicon" aria-hidden="true"></span>'; menuRight.appendChild(home) }

window.nextpad = { editor, provider, ydoc, remoteBatch }

// Zuletzt geöffnet (Startseite): freie Pads mit Titel aus der ersten Zeile, nur in diesem Browser
function rememberPad() {
  if (!cfg.free) return
  try {
    const title = (editor.state.doc.firstChild?.textContent || '').trim().slice(0, 60)
    let l = JSON.parse(localStorage.getItem('nextpad.recent') || '[]'); if (!Array.isArray(l)) l = []
    const old = l.find(e => e && e.id === cfg.urlId)
    l = l.filter(e => e && e.id !== cfg.urlId)
    l.unshift({ id: cfg.urlId, t: Date.now(), title: title || old?.title || '' })
    localStorage.setItem('nextpad.recent', JSON.stringify(l.slice(0, 10)))
  } catch {}
}
rememberPad()
provider.on('sync', synced => { if (synced) rememberPad() })
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') rememberPad() })
editor.on('transaction', () => { for (const b of tb.querySelectorAll('button')) if (b._isActive) b.classList.toggle('selected', !!b._isActive()) })

// Fußleiste wie bei Etherpad: links Zeitleiste und Export, rechts Teilnehmende
const fl = document.createElement('div'); fl.className = 'menu_left'; sb.appendChild(fl)
const fr = document.createElement('div'); fr.className = 'menu_right'; sb.appendChild(fr)
ibtn(fl, I.history, tx('staende'), () => toggleTimeline(), () => timelineOpen)
const exportBtn = ibtn(fl, I.share, tx('exportieren'), () => togglePopup(exportPopup))
const exportPopup = document.createElement('div'); exportPopup.className = 'popup'; exportPopup.hidden = true
// Einladen nur bei freien Pads: Gruppenpads aus Moodle erreicht nur, wer im Kurs ist
if (cfg.free) exportPopup.appendChild(einladen())
exportPopup.insertAdjacentHTML('beforeend', `<h2>${tx('export_titel')}</h2>`)
for (const [label, fmt, icon, title] of [['HTML', 'html', I.code, tx('export_als', { format: 'HTML' })], ['Markdown', 'md', I.md, tx('export_als', { format: 'Markdown' })], [tx('export_text'), 'txt', I.file, tx('export_als', { format: tx('export_text') })], ['PDF', 'pdf', I.pdf, tx('export_als', { format: 'PDF' })], [tx('drucken'), 'print', I.pdf, tx('druckansicht')]].filter(([, fmt]) => fmt !== 'pdf' || cfg.pdf !== false)) {
  const a = document.createElement('a'); a.href = `${cfg.basePath}/p/${encodeURIComponent(cfg.urlId)}/export/${fmt}`; a.target = '_blank'; a.rel = 'noopener'; a.title = title
  a.innerHTML = `<span class="buttonicon" aria-hidden="true">${icon}</span> ${label}`; exportPopup.appendChild(a)
}
sb.appendChild(exportPopup)
const conn = document.createElement('span'); conn.className = 'conn'; fl.appendChild(conn)
const usersBtn = document.createElement('button'); usersBtn.type = 'button'; usersBtn.className = 'ib users'; usersBtn.title = tx('teilnehmende'); usersBtn.innerHTML = `<span class="buttonicon" aria-hidden="true">${I.users}</span> <span class="count">1</span><svg class="schloss" role="img" viewBox="0 0 16 16" width="12" height="12" hidden><title></title><path fill="currentColor" d="M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7h1Zm2 0h4V5a2 2 0 0 0-4 0v2Z"/></svg>`
usersBtn.querySelector('.schloss title').textContent = tx('mit_passwort')
usersBtn.addEventListener('click', () => togglePopup(usersPopup)); fr.appendChild(usersBtn)
const usersPopup = document.createElement('div'); usersPopup.className = 'popup right'; usersPopup.hidden = true; sb.appendChild(usersPopup)
// Link zum Pad kopieren oder über das Teilen-Menü des Geräts weitergeben; ohne Zwischenablage markiert zum Selbstkopieren
function einladen() {
  const box = document.createElement('div'); box.className = 'einladen'
  const link = `${location.origin}${cfg.basePath}/p/${encodeURIComponent(cfg.urlId)}`
  box.innerHTML = `<h2>${tx('einladen')}</h2><p class="hinweis">${tx(cfg.readonly ? 'link_hinweis_lesen' : 'link_hinweis')}</p>`
  const status = document.createElement('p'); status.className = 'status'; status.setAttribute('role', 'status')
  const knopf = (text, icon, fn) => { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span class="buttonicon" aria-hidden="true">${icon}</span> <span>${text}</span>`; b.addEventListener('click', fn); box.appendChild(b); return b }
  const kopieren = knopf(tx('link_kopieren'), I.file, async () => {
    try {
      await navigator.clipboard.writeText(link)
      status.textContent = tx('link_kopiert'); kopieren.lastChild.textContent = tx('link_kopiert')
      setTimeout(() => { kopieren.lastChild.textContent = tx('link_kopieren'); status.textContent = '' }, 2500)
    } catch {
      status.textContent = tx('link_selbst')
      let f = box.querySelector('input.link')
      if (!f) { f = document.createElement('input'); f.className = 'link'; f.readOnly = true; f.value = link; f.setAttribute('aria-label', tx('link_feld')); box.appendChild(f) }
      f.focus(); f.select()
    }
  })
  if (navigator.share) knopf(tx('link_teilen'), I.share, () => navigator.share({ title: document.title, url: link }).catch(() => {}))
  box.appendChild(status)
  return box
}
function togglePopup(p) { const open = p.hidden; for (const x of sb.querySelectorAll('.popup')) x.hidden = true; p.hidden = !open }
document.addEventListener('click', e => { if (!sb.contains(e.target)) for (const x of sb.querySelectorAll('.popup')) x.hidden = true })

// Meldung zum Passwort; das Popup wird nach dem Speichern neu aufgebaut, weil der Server neu verbinden lässt
let pwMeldung = ''
// Besitz-Link: einmal gezeigt, übersteht aber das Neuaufbauen des Popups
let besitzAnzeige = null, besitzOffen = false
function renderStatus() {
  if (!sb) return
  const users = []
  provider.awareness.getStates().forEach(s => { if (s.user) users.push(s.user) })
  conn.textContent = provider.wsconnected ? tx('verbunden') : tx('getrennt'); conn.className = 'conn ' + (provider.wsconnected ? 'ok' : 'warn')
  usersBtn.querySelector('.count').textContent = String(users.length)
  usersBtn.querySelector('.schloss').hidden = !cfg.passwort
  usersPopup.innerHTML = `<h2>${tx('teilnehmende')}</h2>`
  if (cfg.free && !cfg.readonly && !cfg.login) {
    const row = document.createElement('div'); row.className = 'me'
    const lab = document.createElement('label'); lab.textContent = tx('mein_name'); lab.htmlFor = 'myname'
    const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.id = 'myname'; nameInput.value = cfg.author.name || tx('gast'); nameInput.maxLength = 60; nameInput.className = 'myname'; nameInput.style.backgroundColor = cfg.author.color
    nameInput.addEventListener('change', async () => {
      const name = nameInput.value.trim() || tx('gast')
      const r = await fetch(`${cfg.basePath}/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
      if (r.ok) { cfg.author.name = name; provider.awareness.setLocalStateField('user', { name, color: cfg.author.color, id: cfg.author.id }); names.set(cfg.author.id, name) }
    })
    row.append(lab, nameInput); usersPopup.appendChild(row)
  }
  if (cfg.login) {
    // über Moodle angemeldet: Abmelden auch im Pad, nicht nur auf der Startseite
    const box = document.createElement('div'); box.className = 'me login'
    const who = document.createElement('p'); who.textContent = tx('angemeldet_als', { name: cfg.author.name || '' })
    const form = document.createElement('form'); form.method = 'post'; form.action = `${cfg.basePath}/logout`
    const out = document.createElement('button'); out.type = 'submit'; out.textContent = tx('abmelden')
    form.appendChild(out); box.append(who, form); usersPopup.appendChild(box)
  }
  if (cfg.owner && !cfg.readonly) {
    const box = document.createElement('div'); box.className = 'owner'
    const h = document.createElement('h3'); h.textContent = tx('mein_pad')
    const info = document.createElement('p'); info.className = 'exp'
    const fmt = ms => new Date(ms).toLocaleDateString(locale)
    const setInfo = () => { info.textContent = cfg.expires ? tx('bleibt_bis', { datum: fmt(cfg.expires) }) : tx('von_mir') }
    setInfo(); box.append(h, info)
    const row2 = document.createElement('div'); row2.className = 'actions'
    if (cfg.expires) {
      const ext = document.createElement('button'); ext.type = 'button'; ext.textContent = tx('verlaengern')
      ext.addEventListener('click', async e => { e.stopPropagation(); const r = await fetch(`${cfg.basePath}/p/${encodeURIComponent(cfg.urlId)}/extend`, { method: 'POST' }); if (r.ok) { const j = await r.json(); cfg.expires = j.until; setInfo() } })
      row2.appendChild(ext)
    }
    const del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = tx('loeschen')
    del.addEventListener('click', async e => {
      e.stopPropagation()
      if (!confirm(tx('loeschen_frage'))) return
      const r = await fetch(`${cfg.basePath}/p/${encodeURIComponent(cfg.urlId)}/delete`, { method: 'POST' })
      if (r.ok) { try { const l = JSON.parse(localStorage.getItem('nextpad.recent') || '[]').filter(x => x && x.id !== cfg.urlId); localStorage.setItem('nextpad.recent', JSON.stringify(l)) } catch {} location.href = `${cfg.basePath}/` }
    })
    row2.appendChild(del); box.appendChild(row2)
    // Schutz: Passwort setzen, ändern, entfernen; Ende-zu-Ende folgt als weitere Wahl
    const schutz = document.createElement('div'); schutz.className = 'schutz'
    const sh = document.createElement('h3'); sh.textContent = tx('schutz')
    const stand = document.createElement('p'); stand.className = 'exp'
    const pwLabel = document.createElement('label'); pwLabel.htmlFor = 'pw-neu'; pwLabel.textContent = tx('pw_label')
    const pwIn = document.createElement('input'); pwIn.type = 'password'; pwIn.id = 'pw-neu'; pwIn.maxLength = 128; pwIn.autocomplete = 'new-password'; pwIn.setAttribute('aria-describedby', 'pw-meldung pw-hinweis')
    const pwRow = document.createElement('div'); pwRow.className = 'actions'
    const pwSet = document.createElement('button'); pwSet.type = 'button'
    const pwDel = document.createElement('button'); pwDel.type = 'button'; pwDel.textContent = tx('pw_entfernen')
    const zeigen = document.createElement('label'); zeigen.className = 'zeigen'
    const zeigenBox = document.createElement('input'); zeigenBox.type = 'checkbox'; zeigenBox.addEventListener('change', () => { pwIn.type = zeigenBox.checked ? 'text' : 'password' })
    zeigen.append(zeigenBox, document.createTextNode(' ' + tx('pw_zeigen')))
    const meldung = document.createElement('p'); meldung.id = 'pw-meldung'; meldung.className = 'exp'; meldung.setAttribute('role', 'status'); meldung.textContent = pwMeldung
    const hinweis = document.createElement('p'); hinweis.id = 'pw-hinweis'; hinweis.className = 'exp'; hinweis.textContent = tx('pw_hinweis')
    const zeigeSchutz = () => { stand.textContent = tx(cfg.passwort ? 'schutz_an' : 'schutz_aus'); pwSet.textContent = tx(cfg.passwort ? 'pw_aendern' : 'pw_setzen'); pwDel.hidden = !cfg.passwort }
    const sende = async pw => {
      const r = await fetch(`${cfg.basePath}/p/${encodeURIComponent(cfg.urlId)}/passwort`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passwort: pw }) }).catch(() => null)
      if (!r || !r.ok) { pwMeldung = meldung.textContent = tx(r && r.status === 400 ? 'pw_laenge' : r && r.status === 422 ? 'pw_trivial' : 'pw_fehler'); return }
      cfg.passwort = (await r.json()).passwort; pwIn.value = ''; pwMeldung = meldung.textContent = tx(cfg.passwort ? 'pw_gespeichert' : 'pw_entfernt'); zeigeSchutz()
    }
    pwSet.addEventListener('click', e => { e.stopPropagation(); const pw = pwIn.value; if ([...pw].length < 6 || [...pw].length > 128) { pwMeldung = meldung.textContent = tx('pw_laenge'); pwIn.focus(); return }
      if (cfg.passwort && !confirm(tx('pw_aendern_frage'))) return
      sende(pw)
    })
    pwIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); pwSet.click() } })
    pwDel.addEventListener('click', e => { e.stopPropagation(); sende('') })
    pwRow.append(pwSet, pwDel); schutz.append(sh, stand, pwLabel, pwIn, zeigen, pwRow, meldung, hinweis); zeigeSchutz()
    box.appendChild(schutz)
    // Besitz-Link; mit Anmeldung über die Lernplattform hängt der Besitz am Konto, nicht am Browser
    if (!cfg.login) box.appendChild(besitzBereich())
    usersPopup.appendChild(box)
  }
  for (const u of users) { const el = document.createElement('div'); el.className = 'user'; el.append(avatarEl(u, 28), document.createTextNode(u.name || tx('gast'))); usersPopup.appendChild(el) }
  if (cfg.readonly) { const ro = document.createElement('span'); ro.textContent = tx('nur_lesen'); ro.className = 'warn ro'; if (!fl.querySelector('.ro')) fl.appendChild(ro) }
}
provider.on('status', renderStatus)

function besitzBereich() {
  // aufklappbar, damit das Popup klein bleibt; selten gebraucht
  const b = document.createElement('details'); b.className = 'schutz besitz'; b.open = besitzOffen || !!besitzAnzeige
  b.addEventListener('toggle', () => { besitzOffen = b.open })
  const h = document.createElement('summary'); h.textContent = tx('besitz')
  const erkl = document.createElement('p'); erkl.className = 'exp'; erkl.textContent = tx('besitz_erklaerung')
  const row = document.createElement('div'); row.className = 'actions'
  const neu = document.createElement('button'); neu.type = 'button'; neu.textContent = tx(cfg.besitzLink ? 'besitz_neu' : 'besitz_erstellen')
  const weg = document.createElement('button'); weg.type = 'button'; weg.textContent = tx('besitz_widerrufen'); weg.hidden = !cfg.besitzLink
  const meldung = document.createElement('p'); meldung.id = 'besitz-meldung'; meldung.className = 'exp'; meldung.setAttribute('role', 'status')
  b.append(h, erkl)
  if (besitzAnzeige && besitzAnzeige.link) {
    const lab = document.createElement('label'); lab.htmlFor = 'besitz-link'; lab.textContent = tx('besitz_link')
    const feld = document.createElement('input'); feld.type = 'text'; feld.id = 'besitz-link'; feld.readOnly = true; feld.value = besitzAnzeige.link; feld.setAttribute('aria-describedby', 'besitz-meldung')
    const kopie = document.createElement('button'); kopie.type = 'button'; kopie.textContent = tx('kopieren')
    kopie.addEventListener('click', async e => {
      e.stopPropagation()
      try { await navigator.clipboard.writeText(feld.value); meldung.textContent = tx('kopiert') } catch { feld.select() }
    })
    b.append(lab, feld)
    row.append(kopie)
  }
  meldung.textContent = besitzAnzeige ? besitzAnzeige.text : ''
  const sende = async widerrufen => {
    const r = await fetch(`${cfg.basePath}/p/${encodeURIComponent(cfg.urlId)}/besitzlink`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ widerrufen }) }).catch(() => null)
    if (!r || !r.ok) { besitzAnzeige = { text: tx('pw_fehler') }; renderStatus(); return }
    const j = await r.json()
    cfg.besitzLink = !widerrufen
    besitzAnzeige = widerrufen ? { text: tx('besitz_widerrufen_ok') } : { link: `${location.origin}${cfg.basePath}/p/${encodeURIComponent(cfg.urlId)}/besitz#${j.geheimnis}`, text: tx('besitz_einmal') }
    renderStatus()
    document.getElementById(widerrufen ? 'besitz-meldung' : 'besitz-link')?.focus()
  }
  neu.addEventListener('click', e => { e.stopPropagation(); if (cfg.besitzLink && !confirm(tx('besitz_frage'))) return; sende(false) })
  weg.addEventListener('click', e => { e.stopPropagation(); sende(true) })
  row.append(neu, weg)
  b.append(row, meldung)
  return b
}
// Passwort geändert: Der Server lässt die Verbindung nicht mehr zu. Antwortet die Seite mit 403, erscheint ein
// Hinweis mit „Neu laden“. Kein automatisches Neuladen: Ungespeicherter Text bleibt so zum Kopieren stehen.
let zugangGeprueft = 0
provider.on('status', async ({ status }) => {
  if (status !== 'disconnected' || !cfg.free || Date.now() - zugangGeprueft < 5000) return
  zugangGeprueft = Date.now()
  const r = await fetch(location.href, { method: 'HEAD', cache: 'no-store' }).catch(() => null)
  if (!r || r.status !== 403 || document.getElementById('zugang-hinweis')) return
  const h = document.createElement('div'); h.id = 'zugang-hinweis'; h.className = 'leiste'; h.setAttribute('role', 'alert')
  const p = document.createElement('p'); p.textContent = tx('pw_gewechselt')
  const b = document.createElement('button'); b.type = 'button'; b.textContent = tx('neu_laden'); b.addEventListener('click', () => location.reload())
  h.append(p, b); document.body.prepend(h)
})
renderStatus()

// Einmal je Pad und Browser: Wer ein offenes Pad besitzt, erfährt, wo sich ein Passwort setzen lässt.
function schutzTipp() {
  if (!cfg.owner || !cfg.free || cfg.readonly || cfg.passwort) return
  const key = 'nextpad.schutztipp.' + cfg.urlId
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1') } catch { return }
  const h = document.createElement('div'); h.id = 'schutz-tipp'; h.className = 'leiste'; h.setAttribute('role', 'status')
  const p = document.createElement('p'); p.textContent = tx('schutz_tipp')
  const setzen = document.createElement('button'); setzen.type = 'button'; setzen.textContent = tx('schutz_tipp_setzen')
  const zu = document.createElement('button'); zu.type = 'button'; zu.textContent = tx('schliessen')
  setzen.addEventListener('click', e => { e.stopPropagation(); h.remove(); if (usersPopup.hidden) togglePopup(usersPopup); document.getElementById('pw-neu')?.focus() })
  zu.addEventListener('click', () => h.remove())
  h.append(p, setzen, zu); document.body.prepend(h)
}
schutzTipp()

// Markdown-Dialog: Text eingeben oder einfügen, wird an der Cursorposition als formatierter Text übernommen
function openMarkdownDialog() {
  const dlg = document.createElement('dialog'); dlg.id = 'mddialog'
  dlg.innerHTML = `<form method="dialog"><label for="mdtext">${tx('md_titel')}</label>
    <textarea id="mdtext" rows="10" placeholder="${tx('md_beispiel')}"></textarea>
    <div class="row"><button type="submit" value="ok">${tx('uebernehmen')}</button> <button type="submit" value="abbrechen">${tx('abbrechen')}</button></div></form>`
  document.body.appendChild(dlg)
  dlg.addEventListener('close', () => { if (dlg.returnValue === 'ok') { const md = dlg.querySelector('textarea').value; if (md.trim()) editor.chain().focus().insertContent(md, { contentType: 'markdown' }).run() } dlg.remove() })
  dlg.showModal(); dlg.querySelector('textarea').focus()
}

// Zeitleiste wie Etherpads Timeslider: Schieberegler über alle Schritte (Vollstände und einzelne Updates),
// Abspielen, Zeit und Autor je Schritt, Dokument im jeweiligen Stand mit Autorenfarben.
let timelineOpen = false
let panel = null
async function toggleTimeline() {
  for (const x of sb.querySelectorAll('.popup')) x.hidden = true
  if (timelineOpen) { panel.remove(); panel = null; timelineOpen = false; return }
  timelineOpen = true
  panel = document.createElement('div'); panel.id = 'timeline'
  panel.innerHTML = `<div class="tl-controls">
      <button type="button" class="tl-prev" title="${tx('schritt_zurueck')}" aria-label="${tx('schritt_zurueck')}">◀</button>
      <button type="button" class="tl-play" title="${tx('abspielen')}" aria-label="${tx('abspielen')}">▶</button>
      <button type="button" class="tl-next" title="${tx('schritt_vor')}" aria-label="${tx('schritt_vor')}">▶|</button>
      <input type="range" class="tl-slider" min="0" max="0" value="0" aria-label="${tx('zeitpunkt')}">
      <span class="tl-pos"></span>
      <button type="button" class="tl-restore" hidden>${tx('wiederherstellen')}</button>
    </div>
    <div class="tl-info"></div>
    <div class="tl-authors"></div>
    <div class="snapshot ProseMirror"></div>`
  document.getElementById('app').appendChild(panel)
  const slider = panel.querySelector('.tl-slider'), info = panel.querySelector('.tl-info'), pos = panel.querySelector('.tl-pos'), view = panel.querySelector('.snapshot'), authorsEl = panel.querySelector('.tl-authors')
  const res = await fetch(`${cfg.basePath}/p/${encodeURIComponent(cfg.urlId)}/history`)
  if (!res.ok) { info.textContent = tx('verlauf_fehlt'); return }
  const h = await res.json()
  if (h.truncated) info.dataset.truncated = '1'
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0))
  // Schritte: Vollstände (Snapshots) und Updates, nach Zeit geordnet
  const points = []
  for (const sn of h.snapshots) points.push({ kind: 'snapshot', ts: sn.ts, label: sn.label, bytes: b64(sn.state) })
  for (const u of h.updates) points.push({ kind: 'update', ts: u.ts, seq: u.seq, author: u.author, bytes: b64(u.bytes) })
  points.sort((a, b) => a.ts - b.ts || (a.kind === 'snapshot' ? -1 : 1))
  if (!points.length) { info.textContent = tx('kein_verlauf'); return }
  for (const a of Object.keys(h.authors || {})) names.set(a, h.authors[a].name)
  slider.max = String(points.length - 1); slider.value = slider.max
  const serializer = DOMSerializer.fromSchema(editor.schema)
  // Dokument bis Schritt k: vom letzten Vollstand davor aufbauen, dann Updates anwenden; vorwärts inkrementell
  let cache = { k: -1, doc: null }
  function docAt(k) {
    let start = 0
    if (cache.doc && cache.k <= k) { start = cache.k + 1 } else {
      let base = -1
      for (let i = k; i >= 0; i--) if (points[i].kind === 'snapshot') { base = i; break }
      cache.doc = new Y.Doc({ gc: false })
      if (base >= 0) { Y.applyUpdate(cache.doc, points[base].bytes); start = base + 1 } else start = 0
      cache.k = base
    }
    for (let i = start; i <= k; i++) { if (points[i].kind === 'snapshot') Y.applyUpdate(cache.doc, points[i].bytes); else Y.applyUpdate(cache.doc, points[i].bytes) }
    cache.k = k
    return cache.doc
  }
  function render(k) {
    const d = docAt(k)
    const node = yXmlFragmentToProseMirrorRootNode(d.getXmlFragment('default'), editor.schema)
    view.innerHTML = ''
    view.appendChild(serializer.serializeFragment(node.content))
    const p = points[k]
    const when = new Date(p.ts).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'medium' })
    const who = p.kind === 'update' && p.author ? (names.get(p.author) || p.author) : (p.kind === 'snapshot' ? p.label : tx('unbekannt'))
    info.textContent = `${when} · ${p.kind === 'snapshot' ? tx('stand') : tx('aenderung')} · ${who}`
    pos.textContent = `${k + 1} / ${points.length}`
    restoreBtn.disabled = k === points.length - 1
    // Autoren bis hierher
    const seen = new Map()
    for (let i = 0; i <= k; i++) { const a = points[i].author; if (a && !seen.has(a)) seen.set(a, names.get(a) || a) }
    authorsEl.innerHTML = ''
    for (const [id, name] of seen) { const el = document.createElement('span'); el.className = 'user'; el.style.backgroundColor = colorFor(id); el.textContent = name; authorsEl.appendChild(el) }
  }
  // Wiederherstellen (wem das Pad gehört): der Server baut den Stand nach und legt ihn als neue Änderung obendrauf
  const restoreBtn = panel.querySelector('.tl-restore')
  restoreBtn.hidden = !cfg.restore
  restoreBtn.addEventListener('click', async () => {
    const p = points[+slider.value]
    const when = new Date(p.ts).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
    if (!confirm(tx('wiederherstellen_frage', { wann: when }))) return
    restoreBtn.disabled = true
    const r = await fetch(`${cfg.basePath}/p/${encodeURIComponent(cfg.urlId)}/wiederherstellen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p.kind === 'snapshot' ? { ts: p.ts } : { seq: p.seq }) })
    if (r.ok) { toggleTimeline(); return }
    info.textContent = tx('wiederherstellen_fehler', { grund: (await r.text()) || r.status })
    restoreBtn.disabled = false
  })
  let playing = null
  const stop = () => { if (playing) { clearInterval(playing); playing = null; panel.querySelector('.tl-play').textContent = '▶' } }
  slider.addEventListener('input', () => { stop(); render(+slider.value) })
  panel.querySelector('.tl-prev').addEventListener('click', () => { stop(); slider.value = String(Math.max(0, +slider.value - 1)); render(+slider.value) })
  panel.querySelector('.tl-next').addEventListener('click', () => { stop(); slider.value = String(Math.min(points.length - 1, +slider.value + 1)); render(+slider.value) })
  panel.querySelector('.tl-play').addEventListener('click', () => {
    if (playing) return stop()
    if (+slider.value >= points.length - 1) slider.value = '0'
    panel.querySelector('.tl-play').textContent = '❚❚'
    playing = setInterval(() => { const n = +slider.value + 1; if (n >= points.length) return stop(); slider.value = String(n); render(n) }, 120)
  })
  render(points.length - 1)
}
