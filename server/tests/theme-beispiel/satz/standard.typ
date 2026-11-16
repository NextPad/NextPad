// Satzvorlage der Hochschule Musterstadt: ersetzt die eingebaute Vorlage standard.
// meta: titel, kopf, fuss, datum, produkt, akzent, rahmen, logo, hausschrift, sprache, region, seite, von
#let vorlage(meta, body) = {
  let akzent = rgb(meta.akzent)
  set document(title: meta.titel, author: "Hochschule Musterstadt")
  set page(paper: "a4", margin: (top: 30mm, bottom: 22mm, x: 24mm),
    header: [#grid(columns: (1fr, auto), align: (left + horizon, right + horizon),
        if meta.logo != none { image(meta.logo, height: 10mm) } else { text(weight: "bold", meta.produkt) },
        text(size: 8pt, fill: luma(80), meta.kopf))
      #v(-1mm) #line(length: 100%, stroke: 1.2pt + akzent)],
    footer: context [#set text(size: 8pt, fill: luma(80)); Hochschule Musterstadt · #meta.fuss #h(1fr) #counter(page).display()])
  set text(font: ("Liberation Sans", "Noto Emoji"), size: 10.5pt, lang: meta.sprache, region: meta.region)
  show heading: set text(fill: akzent)
  show heading.where(level: 1): set text(size: 20pt)
  body
}
