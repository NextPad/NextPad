//! Theme aus dem Theme-Ordner: `theme.json` legt Marke, Farben und Texte über ein eingebautes
//! Layout (`basis`). Ohne `theme.json` liefert der Ordner wie bisher nur Logo, Startbild und Hausschrift.
use crate::texte::Sprache;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Höchste Formatversion von `theme.json`, die dieses Programm kennt.
pub const FORMAT: u32 = 1;
/// Eingebaute Layouts, Werte für NEXTPAD_THEME und für `basis`.
pub const EINGEBAUT: [&str; 4] = ["nextpad", "rund", "colibris", "eckig"];

#[derive(Debug, Clone, Default)]
pub struct Marke {
    /// Name aus `theme.json`; leer bei einem eingebauten Theme
    pub name: String,
    /// Stylesheet im Theme-Ordner, geladen nach dem Grundstil
    pub stylesheet: Option<String>,
    pub logo: String,
    pub hintergrund: String,
    pub hausschrift: String,
    /// Familienname der Hausschrift, wie Typst und CSS sie kennen; ohne Angabe nutzt nur die Seite sie
    pub hausschrift_familie: Option<String>,
    pub farben: Farben,
    /// Ersetzte Texte je Sprache und Schlüssel
    pub texte: Vec<(Sprache, &'static str, &'static str)>,
    /// Ordner mit weiteren Schriften für den PDF-Satz
    pub schriften: Vec<String>,
    /// Satzvorlagen als Typst-Module; geprüft erst beim Start (typeset::probe)
    pub satzvorlagen: Vec<Satzvorlage>,
    /// Absender für das PDF; gelesen von stile::laden
    pub gestaltungen: Option<Gestaltungen>,
}

/// Datei mit den Gestaltungen (Format von `stile.json`) und Kennung der Vorgabe, wenn niemand wählt.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Gestaltungen {
    pub datei: String,
    pub vorgabe: String,
}

/// Satzvorlage aus `theme.json`: Typst-Modul mit `#let vorlage(meta, body) = …`.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Satzvorlage {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub name_en: String,
    pub datei: String,
}

impl Satzvorlage {
    pub fn name(&self, sp: Sprache) -> &str { if sp == Sprache::En && !self.name_en.is_empty() { &self.name_en } else { &self.name } }
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Farben {
    #[serde(default)]
    pub akzent: Option<String>,
    #[serde(default)]
    pub akzent_dunkel: Option<String>,
    /// drei Hausfarben, wie im Erscheinungsbild
    #[serde(default)]
    pub haus: Option<[String; 3]>,
}

#[derive(Deserialize)]
struct Datei {
    format: Option<u32>,
    name: Option<String>,
    basis: Option<String>,
    #[serde(default)]
    stylesheet: Option<String>,
    #[serde(default)]
    logo: Option<String>,
    #[serde(default)]
    hintergrund: Option<String>,
    #[serde(default)]
    hausschrift: Option<Hausschrift>,
    #[serde(default)]
    farben: Farben,
    #[serde(default)]
    texte: BTreeMap<String, BTreeMap<String, String>>,
    #[serde(default)]
    schriften: Vec<String>,
    #[serde(default)]
    satzvorlagen: Vec<Satzvorlage>,
    #[serde(default)]
    gestaltungen: Option<Gestaltungen>,
    /// alle übrigen Schlüssel, nur für die Warnung
    #[serde(flatten)]
    rest: BTreeMap<String, serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Hausschrift { datei: String, #[serde(default)] familie: Option<String> }

/// NEXTPAD_THEME und Theme-Ordner auswerten: eingebautes Layout und Marke.
/// Startfehler: unbekannter Name ohne passendes `theme.json`, neueres Format, fehlende Pflichtangabe, Pfad nach draußen.
pub fn laden(wahl: &str, ordner: Option<&Path>) -> anyhow::Result<(String, Marke)> {
    let datei = ordner.map(|o| o.join("theme.json")).filter(|p| p.is_file());
    if EINGEBAUT.contains(&wahl) {
        if let Some(p) = &datei { tracing::info!("{} wird nicht gelesen: NEXTPAD_THEME={wahl} ist eingebaut", p.display()); }
        return Ok((wahl.to_string(), Marke::vorgabe()));
    }
    // bis 0.22 hieß das eckige Layout „hsd“; ohne theme.json bleibt der Wert gültig
    if wahl == "hsd" && datei.is_none() {
        tracing::warn!("NEXTPAD_THEME=hsd ohne theme.json im Theme-Ordner: gilt als „eckig“ mit hsd.css. Bitte NEXTPAD_THEME=eckig setzen oder ein theme.json anlegen.");
        let mut m = Marke::vorgabe();
        m.stylesheet = Some("hsd.css".into());
        return Ok(("eckig".into(), m));
    }
    let Some(p) = datei else {
        let wo = ordner.map(|o| format!(" in {}", o.display())).unwrap_or_else(|| " (NEXTPAD_THEME_DIR fehlt)".into());
        anyhow::bail!("NEXTPAD_THEME={wahl}: kein eingebautes Theme ({}) und kein theme.json{wo}", EINGEBAUT.join(", "));
    };
    let text = std::fs::read_to_string(&p).map_err(|e| anyhow::anyhow!("{} nicht lesbar: {e}", p.display()))?;
    let (basis, marke) = auswerten(&text, ordner.unwrap_or(Path::new(".")))
        .map_err(|e| anyhow::anyhow!("{}: {e}", p.display()))?;
    anyhow::ensure!(marke.name == wahl, "{}: name ist „{}“, NEXTPAD_THEME ist „{wahl}“", p.display(), marke.name);
    tracing::info!("Theme {wahl} aus {} (Basis {basis})", p.display());
    Ok((basis, marke))
}

impl Marke {
    fn vorgabe() -> Marke {
        Marke { logo: "logo.png".into(), hintergrund: "background.jpg".into(), hausschrift: "font.ttf".into(), ..Default::default() }
    }
}

fn auswerten(text: &str, ordner: &Path) -> anyhow::Result<(String, Marke)> {
    let d: Datei = serde_json::from_str(text).map_err(|e| anyhow::anyhow!("kein gültiges theme.json: {e}"))?;
    let format = d.format.ok_or_else(|| anyhow::anyhow!("format fehlt"))?;
    anyhow::ensure!(format >= 1 && format <= FORMAT,
        "Theme-Ordner hat Format {format}, dieses NextPad kennt Format {FORMAT}. NextPad aktualisieren oder das Theme auf einen älteren Stand setzen.");
    let name = d.name.filter(|n| !n.trim().is_empty()).ok_or_else(|| anyhow::anyhow!("name fehlt"))?;
    anyhow::ensure!(!EINGEBAUT.contains(&name.as_str()), "name „{name}“ ist ein eingebautes Theme");
    let basis = d.basis.ok_or_else(|| anyhow::anyhow!("basis fehlt"))?;
    anyhow::ensure!(EINGEBAUT.contains(&basis.as_str()), "basis „{basis}“ unbekannt, erlaubt sind {}", EINGEBAUT.join(", "));
    for k in d.rest.keys() { tracing::warn!("theme.json: unbekannter Schlüssel {k}"); }
    // nur eine ausdrücklich genannte Datei, die fehlt, ist eine Warnung wert; die Vorgaben sind freiwillig
    let pfad = |feld: &str, wert: Option<String>, vorgabe: &str| -> anyhow::Result<String> {
        let genannt = wert.is_some();
        let v = wert.unwrap_or_else(|| vorgabe.to_string());
        anyhow::ensure!(sicher(&v), "{feld}: „{v}“ zeigt aus dem Theme-Ordner hinaus");
        if genannt && !ordner.join(&v).is_file() { tracing::warn!("theme.json: {feld} {v} fehlt im Theme-Ordner"); }
        Ok(v)
    };
    let stylesheet = d.stylesheet.map(|s| pfad("stylesheet", Some(s), "")).transpose()?;
    let (schrift, familie) = match d.hausschrift { Some(h) => (Some(h.datei), h.familie.filter(|f| !f.trim().is_empty())), None => (None, None) };
    for (feld, wert) in [("farben.akzent", &d.farben.akzent), ("farben.akzent_dunkel", &d.farben.akzent_dunkel)] {
        if let Some(v) = wert { anyhow::ensure!(farbe(v), "{feld}: „{v}“ ist keine Farbe der Form #rrggbb"); }
    }
    if let Some(h) = &d.farben.haus { for v in h { anyhow::ensure!(farbe(v), "farben.haus: „{v}“ ist keine Farbe der Form #rrggbb"); } }
    let mut schriften = Vec::new();
    for s in d.schriften {
        anyhow::ensure!(sicher(&s), "schriften: „{s}“ zeigt aus dem Theme-Ordner hinaus");
        if ordner.join(&s).is_dir() { schriften.push(s); } else { tracing::warn!("theme.json: Schriftordner {s} fehlt im Theme-Ordner"); }
    }
    let mut satzvorlagen: Vec<Satzvorlage> = Vec::new();
    for v in d.satzvorlagen {
        anyhow::ensure!(kennung(&v.id), "satzvorlagen: Kennung „{}“ nur aus Kleinbuchstaben, Ziffern und Bindestrich", v.id);
        anyhow::ensure!(!satzvorlagen.iter().any(|w| w.id == v.id), "satzvorlagen: Kennung {} doppelt", v.id);
        anyhow::ensure!(sicher(&v.datei) && v.datei.ends_with(".typ"), "satzvorlagen: „{}“ muss eine .typ-Datei im Theme-Ordner sein", v.datei);
        if ordner.join(&v.datei).is_file() { satzvorlagen.push(v); } else { tracing::warn!("theme.json: Satzvorlage {} fehlt im Theme-Ordner", v.datei); }
    }
    let gestaltungen = match d.gestaltungen {
        Some(g) => {
            anyhow::ensure!(sicher(&g.datei) && g.datei.ends_with(".json"), "gestaltungen: „{}“ muss eine .json-Datei im Theme-Ordner sein", g.datei);
            anyhow::ensure!(kennung(&g.vorgabe), "gestaltungen: Vorgabe „{}“ nur aus Kleinbuchstaben, Ziffern und Bindestrich", g.vorgabe);
            if ordner.join(&g.datei).is_file() { Some(g) } else { tracing::warn!("theme.json: Gestaltungen {} fehlen im Theme-Ordner", g.datei); None }
        }
        None => None,
    };
    let marke = Marke {
        name,
        stylesheet,
        logo: pfad("logo", d.logo, "logo.png")?,
        hintergrund: pfad("hintergrund", d.hintergrund, "background.jpg")?,
        hausschrift: pfad("hausschrift", schrift, "font.ttf")?,
        hausschrift_familie: familie,
        farben: d.farben,
        texte: texte(d.texte),
        schriften,
        satzvorlagen,
        gestaltungen,
    };
    Ok((basis, marke))
}

/// Relativer Pfad im Theme-Ordner: keine Wurzel, kein `..`, kein verstecktes Element, kein Rückstrich.
pub fn sicher(p: &str) -> bool {
    !p.starts_with('/') && !p.contains('\\') && p.split('/').all(|t| !t.is_empty() && !t.starts_with('.'))
}

fn kennung(v: &str) -> bool { !v.is_empty() && !v.starts_with('-') && v.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') }

fn farbe(v: &str) -> bool { v.len() == 7 && v.starts_with('#') && v[1..].chars().all(|c| c.is_ascii_hexdigit()) }

/// Ersetzte Texte; nur Schlüssel, die der Katalog kennt. Die Werte leben bis zum Ende des Programms.
fn texte(roh: BTreeMap<String, BTreeMap<String, String>>) -> Vec<(Sprache, &'static str, &'static str)> {
    let mut out = Vec::new();
    for (sp, eintraege) in roh {
        let sprache = match sp.as_str() { "de" => Sprache::De, "en" => Sprache::En, _ => { tracing::warn!("theme.json: Sprache {sp} unbekannt, erlaubt sind de und en"); continue } };
        for (k, v) in eintraege {
            match crate::texte::schluessel(&k) {
                Some(s) => out.push((sprache, s, &*Box::leak(v.into_boxed_str()))),
                None => tracing::warn!("theme.json: Text {k} gibt es nicht"),
            }
        }
    }
    out
}

/// Datei im Theme-Ordner, nur über einen geprüften Namen.
pub fn datei(ordner: Option<&Path>, name: &str) -> Option<PathBuf> {
    let o = ordner?;
    (sicher(name)).then(|| o.join(name)).filter(|p| p.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Ordner(PathBuf);
    impl Ordner { fn path(&self) -> &Path { &self.0 } }
    impl Drop for Ordner { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }

    fn leer() -> Ordner {
        static N: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);
        let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let d = std::env::temp_dir().join(format!("nextpad-test-theme-{}-{n}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        Ordner(d)
    }

    fn ordner(json: &str) -> Ordner {
        let d = leer();
        std::fs::write(d.path().join("theme.json"), json).unwrap();
        d
    }

    #[test]
    fn beispiel_im_repo_ist_gueltig() {
        let o = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/theme-beispiel");
        let (basis, m) = laden("beispiel", Some(&o)).expect("Beispiel-Theme");
        assert_eq!(basis, "eckig");
        assert_eq!(m.stylesheet.as_deref(), Some("beispiel.css"));
        assert_eq!(m.hausschrift_familie, None);
        assert_eq!(m.farben.akzent.as_deref(), Some("#1d5c8a"));
        assert!(m.texte.iter().any(|(sp, k, _)| *sp == Sprache::En && *k == "look.untertitel_frei"));
    }

    #[test]
    fn neueres_format_ist_startfehler() {
        let d = ordner(r#"{"format": 2, "name": "x", "basis": "eckig"}"#);
        let e = laden("x", Some(d.path())).unwrap_err().to_string();
        assert!(e.contains("Format 2") && e.contains("kennt Format 1"), "{e}");
    }

    #[test]
    fn pflichtangaben_und_basis() {
        for (json, teil) in [
            (r#"{"name": "x", "basis": "eckig"}"#, "format fehlt"),
            (r#"{"format": 1, "basis": "eckig"}"#, "name fehlt"),
            (r#"{"format": 1, "name": "x"}"#, "basis fehlt"),
            (r#"{"format": 1, "name": "x", "basis": "hsd"}"#, "basis „hsd“ unbekannt"),
            (r#"{"format": 1, "name": "nextpad", "basis": "eckig"}"#, "eingebautes Theme"),
        ] {
            let d = ordner(json);
            let wahl = if json.contains("\"nextpad\"") { "nextpad-ordner" } else { "x" };
            let e = laden(wahl, Some(d.path())).map(|_| String::new()).unwrap_or_else(|e| e.to_string());
            assert!(e.contains(teil), "{json}: {e}");
        }
    }

    #[test]
    fn name_muss_zur_wahl_passen() {
        let d = ordner(r#"{"format": 1, "name": "y", "basis": "eckig"}"#);
        assert!(laden("x", Some(d.path())).unwrap_err().to_string().contains("name ist „y“"));
    }

    #[test]
    fn pfad_nach_draussen_ist_startfehler() {
        for p in ["../geheim.css", "/etc/passwd", "a/../../b", ".git/config", "a\\b"] {
            let d = ordner(&format!(r#"{{"format": 1, "name": "x", "basis": "eckig", "stylesheet": {}}}"#, serde_json::to_string(p).unwrap()));
            assert!(laden("x", Some(d.path())).unwrap_err().to_string().contains("hinaus"), "{p}");
        }
        assert!(sicher("stile/fb-a.png") && sicher("logo.png"));
    }

    #[test]
    fn fehlende_datei_nur_warnung() {
        let d = ordner(r#"{"format": 1, "name": "x", "basis": "rund", "stylesheet": "gibtsnicht.css"}"#);
        let (basis, m) = laden("x", Some(d.path())).unwrap();
        assert_eq!((basis.as_str(), m.stylesheet.as_deref()), ("rund", Some("gibtsnicht.css")));
        assert!(datei(Some(d.path()), "gibtsnicht.css").is_none());
    }

    #[test]
    fn satzvorlagen_und_schriften() {
        let d = ordner(r#"{"format": 1, "name": "x", "basis": "eckig", "schriften": ["fonts", "fehlt"],
            "satzvorlagen": [{"id": "bericht", "name": "Bericht", "datei": "satz/bericht.typ"}, {"id": "weg", "name": "Weg", "datei": "satz/weg.typ"}]}"#);
        std::fs::create_dir_all(d.path().join("satz")).unwrap();
        std::fs::create_dir_all(d.path().join("fonts")).unwrap();
        std::fs::write(d.path().join("satz/bericht.typ"), "#let vorlage(meta, body) = body").unwrap();
        let (_, m) = laden("x", Some(d.path())).unwrap();
        assert_eq!(m.schriften, vec!["fonts".to_string()]);
        assert_eq!(m.satzvorlagen.iter().map(|v| v.id.as_str()).collect::<Vec<_>>(), vec!["bericht"]);
        for (vorlage, teil) in [
            (r#"{"id": "Bericht", "name": "B", "datei": "satz/bericht.typ"}"#, "Kleinbuchstaben"),
            (r#"{"id": "b", "name": "B", "datei": "../b.typ"}"#, ".typ-Datei im Theme-Ordner"),
            (r#"{"id": "b", "name": "B", "datei": "satz/bericht.css"}"#, ".typ-Datei"),
        ] {
            let d = ordner(&format!(r#"{{"format": 1, "name": "x", "basis": "eckig", "satzvorlagen": [{vorlage}]}}"#));
            let e = laden("x", Some(d.path())).unwrap_err().to_string();
            assert!(e.contains(teil), "{vorlage}: {e}");
        }
    }

    /// Gestaltungen: Datei im Ordner als .json, Vorgabe als Kennung; fehlt die Datei, entfallen sie mit Warnung.
    #[test]
    fn gestaltungen_aus_theme_json() {
        let d = ordner(r#"{"format": 1, "name": "x", "basis": "eckig", "gestaltungen": {"datei": "g/stile.json", "vorgabe": "haus"}}"#);
        assert_eq!(laden("x", Some(d.path())).unwrap().1.gestaltungen, None);
        std::fs::create_dir_all(d.path().join("g")).unwrap();
        std::fs::write(d.path().join("g/stile.json"), "[]").unwrap();
        let g = laden("x", Some(d.path())).unwrap().1.gestaltungen.unwrap();
        assert_eq!((g.datei.as_str(), g.vorgabe.as_str()), ("g/stile.json", "haus"));
        for (wert, teil) in [(r#"{"datei": "../stile.json", "vorgabe": "haus"}"#, ".json-Datei"), (r#"{"datei": "g/stile.json", "vorgabe": "Haus"}"#, "Vorgabe")] {
            let d = ordner(&format!(r#"{{"format": 1, "name": "x", "basis": "eckig", "gestaltungen": {wert}}}"#));
            let e = laden("x", Some(d.path())).unwrap_err().to_string();
            assert!(e.contains(teil), "{wert}: {e}");
        }
    }

    #[test]
    fn falsche_farbe_ist_startfehler() {
        let d = ordner(r##"{"format": 1, "name": "x", "basis": "eckig", "farben": {"akzent": "rot"}}"##);
        assert!(laden("x", Some(d.path())).unwrap_err().to_string().contains("keine Farbe"));
    }

    #[test]
    fn eingebaut_und_alter_name_hsd() {
        let (b, m) = laden("rund", None).unwrap();
        assert_eq!((b.as_str(), m.stylesheet), ("rund", None));
        let d = leer();
        let (b, m) = laden("hsd", Some(d.path())).unwrap();
        assert_eq!((b.as_str(), m.stylesheet.as_deref()), ("eckig", Some("hsd.css")));
        assert!(laden("gibtsnicht", Some(d.path())).unwrap_err().to_string().contains("kein theme.json"));
    }

    #[test]
    fn unbekannte_texte_fallen_weg() {
        let d = ordner(r#"{"format": 1, "name": "x", "basis": "eckig", "texte": {"de": {"look.untertitel_frei": "Hallo", "gibt.es.nicht": "x"}, "fr": {"a": "b"}}}"#);
        let (_, m) = laden("x", Some(d.path())).unwrap();
        assert_eq!(m.texte, vec![(Sprache::De, "look.untertitel_frei", "Hallo")]);
    }
}
