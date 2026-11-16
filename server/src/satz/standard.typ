// Eingebaute Satzvorlage „standard“. Ein Theme mit einer Vorlage der Kennung „standard“ ersetzt sie.
// meta: titel, kopf, fuss, datum, produkt, akzent, rahmen, logo, hausschrift, sprache, region, seite, von
#let vorlage(meta, body) = {
  let schrift = ("Arial", "Liberation Sans", "Noto Emoji")
  let links = if meta.logo != none { image(meta.logo, height: 11mm) } else { text(size: 13pt, weight: "bold", meta.produkt) }
  let linie = if meta.rahmen { rgb(meta.akzent) } else { luma(160) }
  set document(title: meta.titel, author: "NextPad")
  set page(paper: "a4", margin: (top: 34mm, bottom: 24mm, left: 25mm, right: 22mm),
    header: [#grid(columns: (1fr, auto), align: (left + horizon, right + horizon), links, text(size: 8pt, fill: luma(80), meta.kopf))
      #v(-1.5mm) #line(length: 100%, stroke: 0.8pt + linie)],
    footer: context [#set text(size: 8pt, fill: luma(80)); #meta.fuss #h(1fr) #meta.seite #counter(page).display() #meta.von #counter(page).final().first()])
  set text(font: schrift, size: 10.5pt, lang: meta.sprache, region: meta.region, hyphenate: true)
  set par(leading: 0.62em, spacing: 0.9em, justify: false)
  set list(indent: 0.6em, body-indent: 0.5em, marker: ([•], [–], [·]))
  set enum(indent: 0.6em, body-indent: 0.5em)
  show heading: set text(font: schrift, weight: "bold", hyphenate: false)
  show heading: set block(above: 1.3em, below: 0.6em)
  show heading.where(level: 1): set text(size: 20pt)
  show heading.where(level: 1): it => if meta.hausschrift != none {
    set text(font: (meta.hausschrift,) + schrift, weight: "regular", size: 22pt)
    it
  } else { it }
  show heading.where(level: 2): set text(size: 14pt)
  show heading.where(level: 3): set text(size: 12pt)
  show heading.where(level: 4): set text(size: 11pt)
  show raw: set text(font: ("DejaVu Sans Mono", "Liberation Mono", "Liberation Sans"), size: 9.5pt)
  show raw.where(block: true): block.with(fill: luma(245), inset: 8pt, width: 100%)
  show link: underline
  body
}
