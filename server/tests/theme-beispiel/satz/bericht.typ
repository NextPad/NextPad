// Zweite Vorlage der Hochschule Musterstadt: zeigt den Absender aus meta.absender im Kopf.
#let vorlage(meta, body) = {
  let a = meta.absender
  set document(title: meta.titel, author: "Bericht " + if a != none { a.id } else { "ohne" })
  set page(paper: "a4", margin: (top: 30mm, bottom: 22mm, x: 24mm),
    header: [#if a != none and a.kuerzel != none [#text(size: 14pt, weight: "bold", a.kuerzel) #h(1em)] #text(size: 8pt, if a != none { a.name } else { meta.produkt }) #h(1fr) #text(size: 8pt, meta.datum)])
  set text(font: ("Liberation Sans", "Noto Emoji"), size: 10.5pt, lang: meta.sprache, region: meta.region)
  body
}
