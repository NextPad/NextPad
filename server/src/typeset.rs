//! PDF-Satz mit Typst: Pad-Inhalt in einer Satzvorlage, eingebaut neutral oder aus dem Theme-Ordner.
//!
//! Typst läuft als Bibliothek im Server, ohne Pakete aus dem Netz. Wurzel des Satzes ist der Theme-Ordner,
//! nur lesend; was NextPad selbst beisteuert (Hauptdatei, eingebaute Vorlage, Logo), liegt unter `/__nextpad/`.
//! Nutzertext kommt nur als String-Literal in den Satz (render::to_typst).
//! Schriften: Liberation Sans (maßgleich zu Arial, OFL) ist eingebaut; Arial und die Hausschrift
//! einer Einrichtung kommen zur Laufzeit aus NEXTPAD_THEME_DIR, weil sie nicht ins öffentliche Repo dürfen.
use crate::render::typst_str as q;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};

const LIB_REGULAR: &[u8] = include_bytes!("../static/fonts/LiberationSans-Regular.ttf");
const LIB_BOLD: &[u8] = include_bytes!("../static/fonts/LiberationSans-Bold.ttf");
const LIB_ITALIC: &[u8] = include_bytes!("../static/fonts/LiberationSans-Italic.ttf");
const LIB_BOLDITALIC: &[u8] = include_bytes!("../static/fonts/LiberationSans-BoldItalic.ttf");
// Emoji (👍, 👎 der Bewertung und alles andere, was Arial nicht hat), einfarbig: Noto Emoji, OFL
/// Festbreite für Codeblöcke, Liberation Mono 2.1.5 unverändert
const LIB_MONO: &[u8] = include_bytes!("../static/fonts/LiberationMono-Regular.ttf");
const EMOJI: &[u8] = include_bytes!("../static/fonts/NotoEmoji.ttf");

/// Eingebaute Vorlage `standard`: Kopf mit Logo oder Produktname und Akzentlinie, Fuß mit Seitenzahl.
const STANDARD_TYP: &str = include_str!("satz/standard.typ");
/// Ordner für alles, was NextPad dem Satz beisteuert; Vorlagen im Theme-Ordner erreichen ihn nicht.
const EIGEN: &str = "__nextpad";

struct Fonts { book: LazyHash<FontBook>, fonts: Vec<Font> }

fn library() -> &'static LazyHash<Library> {
    static L: OnceLock<LazyHash<Library>> = OnceLock::new();
    L.get_or_init(|| LazyHash::new(Library::default()))
}

/// Schriften einmal laden: eingebaute, alle .ttf/.otf im Theme-Ordner und in den Ordnern aus `schriften`,
/// dazu die Schriften der Gestaltungen.
fn fonts(theme_dir: Option<&Path>, schriften: &[String]) -> &'static Fonts {
    static F: OnceLock<Fonts> = OnceLock::new();
    F.get_or_init(|| {
        let mut fonts: Vec<Font> = Vec::new();
        for data in [LIB_REGULAR, LIB_BOLD, LIB_ITALIC, LIB_BOLDITALIC, LIB_MONO, EMOJI] { fonts.extend(Font::iter(Bytes::new(data))); }
        if let Some(dir) = theme_dir {
            let ordner = std::iter::once(dir.to_path_buf()).chain(schriften.iter().map(|s| dir.join(s)));
            for o in ordner {
                let Ok(rd) = std::fs::read_dir(&o) else { continue };
                let mut dateien: Vec<PathBuf> = rd.flatten().map(|e| e.path()).collect();
                dateien.sort();
                for p in dateien {
                    let ok = p.extension().and_then(|x| x.to_str()).map(|x| matches!(x.to_ascii_lowercase().as_str(), "ttf" | "otf")).unwrap_or(false);
                    if ok { if let Ok(b) = std::fs::read(&p) { fonts.extend(Font::iter(Bytes::new(b))); } }
                }
            }
        }
        let mut gestaltung: Vec<&Path> = crate::stile::alle().iter().flat_map(|s| std::iter::once(s.schrift.as_path()).chain(s.schriften.iter().map(PathBuf::as_path))).collect();
        gestaltung.sort();
        gestaltung.dedup();
        for p in gestaltung {
            match std::fs::read(p) {
                Ok(b) => fonts.extend(Font::iter(Bytes::new(b))),
                Err(e) => tracing::warn!("Gestaltungen: Schrift {} nicht lesbar: {e}", p.display()),
            }
        }
        Fonts { book: LazyHash::new(FontBook::from_fonts(&fonts)), fonts }
    })
}

struct Doc {
    /// Theme-Ordner als Wurzel; ohne ihn gibt es nur die eigenen Dateien
    root: Option<PathBuf>,
    main: FileId,
    quellen: Vec<(FileId, Source)>,
    dateien: Vec<(FileId, Bytes)>,
    fonts: &'static Fonts,
}

impl Doc {
    /// Datei im Theme-Ordner zu einer Typst-Kennung: nur im Projekt, nicht unter `/__nextpad/`, nur geprüfte Pfade.
    fn im_theme(&self, id: FileId) -> FileResult<PathBuf> {
        let rp = id.get();
        if !matches!(rp.root(), VirtualRoot::Project) { return Err(FileError::AccessDenied); }
        let rel = rp.vpath().get_without_slash();
        if rel == EIGEN || rel.starts_with(&format!("{EIGEN}/")) { return Err(FileError::NotFound(rel.into())); }
        crate::theme::datei(self.root.as_deref(), rel).ok_or_else(|| FileError::NotFound(rel.into()))
    }
}

impl World for Doc {
    fn library(&self) -> &LazyHash<Library> { library() }
    fn book(&self) -> &LazyHash<FontBook> { &self.fonts.book }
    fn main(&self) -> FileId { self.main }
    fn source(&self, id: FileId) -> FileResult<Source> {
        if let Some((_, s)) = self.quellen.iter().find(|(i, _)| *i == id) { return Ok(s.clone()); }
        let p = self.im_theme(id)?;
        let text = std::fs::read_to_string(&p).map_err(|e| FileError::from_io(e, &p))?;
        Ok(Source::new(id, text))
    }
    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if let Some((_, b)) = self.dateien.iter().find(|(i, _)| *i == id) { return Ok(b.clone()); }
        let p = self.im_theme(id)?;
        std::fs::read(&p).map(Bytes::new).map_err(|e| FileError::from_io(e, &p))
    }
    fn font(&self, index: usize) -> Option<Font> { self.fonts.fonts.get(index).cloned() }
    fn today(&self, _offset: Option<typst::foundations::Duration>) -> Option<Datetime> { None }
}

fn file_id(path: &str) -> FileId {
    RootedPath::new(VirtualRoot::Project, VirtualPath::new(path).expect("fester Pfad")).intern()
}

pub struct Options<'a> {
    /// Familie der Hausschrift aus theme.json, gesetzt für Ebene 1
    pub hausschrift: Option<&'a str>,
    /// Logo der Einrichtung und Akzentlinie im Kopf (Layouts mit Rahmen: nextpad, rund, eckig)
    pub rahmen: bool,
    pub theme_dir: Option<&'a Path>,
    /// Logo der Einrichtung mit Bildart (aus look::logo), Akzentfarbe und Produktname
    pub logo: Option<(Vec<u8>, &'static str)>,
    pub accent: &'a str,
    pub product: &'a str,
    /// Kopfzeile rechts, z. B. „NextPad · Stand 24.10.2026“
    pub header: &'a str,
    /// Fußzeile links (Pad-Name)
    pub footer: &'a str,
    pub title: &'a str,
    /// Datum des Exports in der Schreibweise der Sprache
    pub datum: &'a str,
    /// Sprache für Silbentrennung und „Seite x von y“
    pub sprache: crate::texte::Sprache,
    /// Kennung der Satzvorlage; unbekannt oder ausgefallen gilt `standard`
    pub vorlage: &'a str,
    /// Schriftordner aus theme.json, relativ zum Theme-Ordner
    pub schriften: &'a [String],
    /// Gestaltung des Absenders (gewählt oder Vorgabe), als `meta.absender`
    pub absender: Option<&'a crate::stile::Stil>,
}

/// Satzvorlagen aus dem Theme, die die Probe beim Start bestanden haben, und die Fehler der übrigen.
#[derive(Default)]
struct Probe { gut: Vec<crate::theme::Satzvorlage>, fehler: Vec<(String, String)> }
static PROBE: OnceLock<Probe> = OnceLock::new();

/// Einmal beim Start: jede Satzvorlage des Themes mit Beispieltext setzen. Eine Vorlage, die scheitert, fällt aus;
/// ihr Typst-Fehler steht im Log und auf der Verwaltungsseite. NextPad startet trotzdem.
pub fn probe(config: &crate::config::Config) {
    let m = &config.marke;
    let mut p = Probe::default();
    if !m.name.is_empty() {
        let beispiel = format!("#heading(level: 1)[#{}]\n\n#{}\n\n- #{}\n", q("Probe der Satzvorlage"), q("Absatz mit Umlauten: äöü ß 👍"), q("Punkt"));
        for v in &m.satzvorlagen {
            let o = Options { hausschrift: m.hausschrift_familie.as_deref(), rahmen: true, theme_dir: config.theme_dir.as_deref(), logo: None,
                accent: "#333333", product: "NextPad", header: "Probe", footer: "Probe", title: "Probe", datum: "1.1.2026", sprache: crate::texte::Sprache::De, vorlage: &v.id, schriften: &m.schriften, absender: crate::stile::fuer(None) };
            match setzen(&o, Some(&v.datei), &beispiel) {
                Ok(_) => { tracing::info!("Satzvorlage {} ({}) bereit", v.id, v.datei); p.gut.push(v.clone()); }
                Err(e) => { tracing::error!("Satzvorlage {} ({}) fällt aus, es gilt standard: {e}", v.id, v.datei); p.fehler.push((v.id.clone(), e.to_string())); }
            }
        }
    }
    let _ = PROBE.set(p);
}

/// Fehler der Satzvorlagen aus der Probe beim Start: (Kennung, Meldung).
pub fn probe_fehler() -> &'static [(String, String)] { PROBE.get().map(|p| p.fehler.as_slice()).unwrap_or(&[]) }

/// Vorlagen zur Wahl im Editor: zuerst `standard` (eingebaut oder aus dem Theme), dann die übrigen in der Reihenfolge
/// aus `theme.json`; nur, was die Probe bestanden hat.
pub fn vorlagen(sp: crate::texte::Sprache) -> Vec<(&'static str, &'static str)> {
    let gut: &'static [crate::theme::Satzvorlage] = PROBE.get().map(|p| p.gut.as_slice()).unwrap_or(&[]);
    let standard = gut.iter().find(|v| v.id == "standard").map(|v| v.name(sp)).unwrap_or_else(|| crate::texte::t(sp, "art.standard"));
    std::iter::once(("standard", standard)).chain(gut.iter().filter(|v| v.id != "standard").map(|v| (v.id.as_str(), v.name(sp)))).collect()
}

/// Datei der Vorlage im Theme-Ordner, wenn sie die Probe bestanden hat; sonst die eingebaute.
fn vorlage_datei(id: &str) -> Option<&'static str> {
    let gut = &PROBE.get()?.gut;
    gut.iter().find(|v| v.id == id).or_else(|| gut.iter().find(|v| v.id == "standard")).map(|v| v.datei.as_str())
}

/// Setzt den Pad-Inhalt (Typst-Markup aus render::to_typst) als PDF.
pub fn pdf(o: &Options, body: &str) -> anyhow::Result<Vec<u8>> {
    setzen(o, o.theme_dir.and(vorlage_datei(o.vorlage)), body)
}

/// `meta.absender`: Logo als Pfad ab Theme-Ordner, nur wenn es darin liegt.
fn absender(o: &Options) -> String {
    let Some(a) = o.absender else { return "none".into() };
    let opt = |v: Option<&str>| v.map(q).unwrap_or_else(|| "none".into());
    let liste = |v: &[String]| format!("({})", v.iter().map(|z| format!("{}, ", q(z))).collect::<String>());
    let logo = a.logo.as_deref().zip(o.theme_dir).and_then(|(l, d)| l.strip_prefix(d).ok()).and_then(|r| r.to_str()).map(|r| format!("/{r}"));
    let fliesstext = match a.fliesstext { crate::stile::Fliesstext::Arial => "arial", crate::stile::Fliesstext::ArialFett => "arial-fett", crate::stile::Fliesstext::Serif => "serif" };
    format!("(id: {}, name: {}, familie: {}, fliesstext: {}, logo: {}, logo_breite: {:?}, kuerzel: {}, beischrift: {}, beischrift_en: {})",
        q(&a.id), q(a.name(o.sprache)), q(&a.familie), q(fliesstext), opt(logo.as_deref()), a.logo_breite_mm, opt(a.kuerzel.as_deref()), liste(&a.beischrift), liste(&a.beischrift_en))
}

/// Hauptdatei: importiert die Vorlage und übergibt `meta`. Pfade in Vorlagen gelten relativ zur Vorlage,
/// absolute ab dem Theme-Ordner; das Logo liegt unter `/__nextpad/`. Die Tabellen-Hooks, die render::to_typst
/// aufruft, darf die Vorlage selbst definieren; sonst gelten die eingebauten.
fn hauptdatei(o: &Options, vorlage: &str, logo: Option<&str>, body: &str) -> String {
    let (lang, region) = match o.sprache { crate::texte::Sprache::De => ("de", "de"), crate::texte::Sprache::En => ("en", "gb") };
    let opt = |v: Option<&str>| v.map(q).unwrap_or_else(|| "none".into());
    format!(r#"#import {vorlage} as np-vorlage
#let np-modul = dictionary(np-vorlage)
#let np-linie = np-modul.at("np-linie", default: (n, kopf) => 0.5pt + luma(150))
#let np-kopf = np-modul.at("np-kopf", default: kopf => if kopf {{ (_, y) => if y == 0 {{ luma(235) }} }} else {{ none }})
#let np-quer = np-modul.at("np-quer", default: inhalt => page(flipped: true, inhalt))
#show: np-vorlage.vorlage.with((
  titel: {titel}, kopf: {kopf}, fuss: {fuss}, datum: {datum}, produkt: {produkt}, akzent: {akzent}, rahmen: {rahmen},
  logo: {logo}, hausschrift: {hausschrift}, sprache: {lang}, region: {region},
  seite: {seite}, von: {von}, absender: {absender},
))

{body}
"#, absender = absender(o), vorlage = q(vorlage), titel = q(o.title), datum = q(o.datum), kopf = q(o.header), fuss = q(o.footer), produkt = q(o.product), akzent = q(o.accent),
        rahmen = o.rahmen, logo = opt(logo), hausschrift = opt(o.hausschrift), lang = q(lang), region = q(region),
        seite = q(crate::texte::t(o.sprache, "export.seite")), von = q(crate::texte::t(o.sprache, "export.von")))
}

fn setzen(o: &Options, vorlage: Option<&str>, body: &str) -> anyhow::Result<Vec<u8>> {
    let fonts = fonts(o.theme_dir, o.schriften);
    // WebP setzt Typst nicht sicher; dann der Produktname statt des Logos
    let logo_pfad = o.logo.as_ref().and_then(|(_, t)| match *t { "image/png" => Some("logo.png"), "image/jpeg" => Some("logo.jpg"), "image/svg+xml" => Some("logo.svg"), _ => None })
        .filter(|_| o.rahmen).map(|n| format!("/{EIGEN}/{n}"));
    let mut dateien = Vec::new();
    if let (Some(p), Some((b, _))) = (&logo_pfad, &o.logo) { dateien.push((file_id(p), Bytes::new(b.clone()))); }
    let main = file_id(&format!("/{EIGEN}/main.typ"));
    let standard = file_id(&format!("/{EIGEN}/standard.typ"));
    let vorlage_pfad = match vorlage { Some(d) => format!("/{d}"), None => format!("/{EIGEN}/standard.typ") };
    let text = hauptdatei(o, &vorlage_pfad, logo_pfad.as_deref(), body);
    let quellen = vec![(main, Source::new(main, text)), (standard, Source::new(standard, STANDARD_TYP.to_string()))];
    let world = Doc { root: o.theme_dir.map(Path::to_path_buf), main, quellen, dateien, fonts };
    let warned = typst::compile::<typst_layout::PagedDocument>(&world);
    let doc = warned.output.map_err(|errs| anyhow::anyhow!("Satz: {}", errs.iter().map(|e| e.message.to_string()).collect::<Vec<_>>().join("; ")))?;
    let opts = typst_pdf::PdfOptions { creator: typst::foundations::Smart::Custom(Some("NextPad".into())), ..Default::default() };
    let out = typst_pdf::pdf(&doc, &opts);
    // Satz-Cache begrenzen (wie typst-cli nach jedem Lauf), sonst wächst der Speicher im Dauerbetrieb
    typst::comemo::evict(10);
    out.map_err(|errs| anyhow::anyhow!("PDF: {}", errs.iter().map(|e| e.message.to_string()).collect::<Vec<_>>().join("; ")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts<'a>() -> Options<'a> {
        Options { hausschrift: None, rahmen: true, theme_dir: None, logo: None, accent: "#007a96", product: "NextPad", header: "Kopf", footer: "Fuß", title: "Test", datum: "15.11.2026", sprache: crate::texte::Sprache::De, vorlage: "standard", schriften: &[], absender: None }
    }

    #[test]
    fn satz_mit_sonderzeichen() {
        let o = Options { header: "NextPad · Stand 24.10.2026", footer: "Pad \"x\" #1", ..opts() };
        let body = format!("#heading(level: 1)[#{}]\n\n#{} #strong[#{}]\n\n- #{}\n", q("Überschrift #1 *x*"), q("Text mit \\ und \" und $ und ] und <a>"), q("fett"), q("Punkt"));
        assert!(pdf(&o, &body).expect("PDF").starts_with(b"%PDF"));
    }
    #[test]
    fn satz_mit_svg_logo_und_akzent() {
        let svg = include_bytes!("../static/logo.svg").to_vec();
        let o = Options { logo: Some((svg, "image/svg+xml")), product: "Pads", ..opts() };
        assert!(pdf(&o, "Text").expect("PDF").starts_with(b"%PDF"));
    }
    #[test]
    fn emoji_aus_eingebauter_schrift() {
        let body = format!("#heading(level: 1)[#{}]\n\n#{}\n", q("Abstimmung 👍"), q("Stimmen: 👍 15 · 👎 2"));
        let p = pdf(&opts(), &body).expect("PDF");
        assert!(p.windows(9).any(|w| w == b"NotoEmoji"), "Noto Emoji fehlt im PDF");
    }

    /// Hauptdatei: Hausschrift, Logo und Akzent nur als Werte in `meta`; ohne Rahmen trotzdem gültig.
    #[test]
    fn hauptdatei_uebergibt_meta() {
        let t = hauptdatei(&Options { hausschrift: Some("Musterstadt Sans"), ..opts() }, "/__nextpad/standard.typ", Some("/__nextpad/logo.png"), "x");
        assert!(t.contains(r#"hausschrift: "Musterstadt Sans""#) && t.contains(r#"logo: "/__nextpad/logo.png""#) && t.contains(r##"akzent: "#007a96""##), "{t}");
        let n = hauptdatei(&Options { rahmen: false, ..opts() }, "/__nextpad/standard.typ", None, "x");
        assert!(n.contains("rahmen: false") && n.contains("logo: none") && n.contains("hausschrift: none"), "{n}");
        for rahmen in [true, false] {
            assert!(pdf(&Options { rahmen, ..opts() }, "Text").expect("PDF").starts_with(b"%PDF"));
        }
    }

    /// `meta.absender` mit Logo-Pfad ab Theme-Ordner; Tabellen-Hooks aus der Vorlage gehen vor den eingebauten.
    #[test]
    fn absender_und_hooks() {
        let d = std::env::temp_dir().join(format!("nextpad-test-absender-{}", std::process::id()));
        std::fs::create_dir_all(d.join("satz")).unwrap();
        std::fs::write(d.join("stile.json"), "[]").unwrap();
        let st = crate::stile::Stil::test("fb-x", Some(d.join("fb-x.png")), Some("FBX"), crate::stile::Fliesstext::Serif);
        let o = Options { theme_dir: Some(&d), absender: Some(&st), ..opts() };
        let t = hauptdatei(&o, "/satz/v.typ", None, "x");
        assert!(t.contains(r#"absender: (id: "fb-x""#) && t.contains(r#"logo: "/fb-x.png""#) && t.contains(r#"fliesstext: "serif""#) && t.contains(r#"kuerzel: "FBX""#) && t.contains("logo_breite: 38.0"), "{t}");
        assert!(hauptdatei(&opts(), "/satz/v.typ", None, "x").contains("absender: none"));
        // Hooks: ohne eigene gelten die eingebauten; eine Vorlage, die np-linie überschreibt, wird auch genommen
        std::fs::write(d.join("satz/v.typ"), "#let vorlage(meta, body) = { set document(author: meta.absender.id); body }").unwrap();
        std::fs::write(d.join("satz/h.typ"), "#let np-linie = none\n#let vorlage(meta, body) = body").unwrap();
        let tabelle = "#table(columns: 2, stroke: np-linie(2, true), fill: np-kopf(true), [a], [b], [c], [d])\n#np-quer[x]";
        let mit = setzen(&o, Some("satz/v.typ"), tabelle).expect("eingebaute Hooks");
        assert!(mit.windows(4).any(|w| w == b"fb-x"), "Absender fehlt im PDF");
        assert!(setzen(&o, Some("satz/h.typ"), tabelle).is_err(), "np-linie aus der Vorlage nicht genommen");
        let _ = std::fs::remove_dir_all(&d);
    }

    /// Vorlagen aus dem Theme-Ordner sehen nur den Ordner selbst, nichts darüber und nichts unter /__nextpad/.
    #[test]
    fn vorlage_aus_dem_theme_und_grenzen() {
        let d = std::env::temp_dir().join(format!("nextpad-test-satz-{}", std::process::id()));
        std::fs::create_dir_all(d.join("satz")).unwrap();
        std::fs::write(d.join("satz/bericht.typ"), "#let vorlage(meta, body) = { set page(paper: \"a5\"); [Bericht: #meta.titel]; body }").unwrap();
        std::fs::write(d.join("satz/draussen.typ"), "#let vorlage(meta, body) = { read(\"../../geheim.txt\"); body }").unwrap();
        std::fs::write(d.join("satz/eigen.typ"), "#let vorlage(meta, body) = { read(\"/__nextpad/main.typ\"); body }").unwrap();
        std::fs::write(d.join("satz/kaputt.typ"), "#let vorlage(meta, body) = { nichtda(body) }").unwrap();
        let o = Options { theme_dir: Some(&d), ..opts() };
        assert!(setzen(&o, Some("satz/bericht.typ"), "Text").expect("Bericht").starts_with(b"%PDF"));
        for v in ["satz/draussen.typ", "satz/eigen.typ", "satz/kaputt.typ"] {
            assert!(setzen(&o, Some(v), "Text").is_err(), "{v} hätte scheitern müssen");
        }
        let _ = std::fs::remove_dir_all(&d);
    }
}
