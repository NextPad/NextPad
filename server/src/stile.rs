//! Gestaltungen für den PDF-Satz: Absender mit Logo oder Kürzel, Schnitt der Hausschrift und
//! Fließtextgruppe. Die Datei nennt `gestaltungen` in `theme.json`; Schriften und Logos liegen daneben
//! im Theme-Ordner, weil sie nicht ins öffentliche Repo dürfen. Was daraus im PDF wird, entscheidet die Satzvorlage.
use crate::texte::Sprache;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Deserialize, Debug, Clone)]
struct Eintrag {
    id: String,
    name: String,
    #[serde(default)]
    name_en: String,
    schrift: String,
    familie: String,
    #[serde(default)]
    fliesstext: String,
    #[serde(default)]
    schriften: Vec<String>,
    #[serde(default)]
    logo: String,
    #[serde(default)]
    logo_breite_mm: Option<f64>,
    #[serde(default)]
    kuerzel: String,
    #[serde(default)]
    beischrift: Vec<String>,
    #[serde(default)]
    beischrift_en: Vec<String>,
}

/// Fließtextgruppe eines Absenders; was daraus im PDF wird, entscheidet die Satzvorlage.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Fliesstext { Arial, ArialFett, Serif }

// Ohne PDF-Satz (Container-Image) bleibt nur die Auswahl, Schrift und Logo werden nicht gelesen
#[cfg_attr(not(feature = "pdf"), allow(dead_code))]
#[derive(Debug, Clone)]
pub struct Stil {
    pub id: String,
    name: String,
    name_en: String,
    pub schrift: PathBuf,
    pub familie: String,
    pub fliesstext: Fliesstext,
    /// weitere Schriften dieser Gestaltung, z. B. Liberation Serif für den Fließtext von SK und W
    pub schriften: Vec<PathBuf>,
    pub logo: Option<PathBuf>,
    pub logo_breite_mm: f64,
    /// Absender ohne Markenbild: Kürzel, darunter die Beischrift auf Deutsch und Englisch.
    pub kuerzel: Option<String>,
    pub beischrift: Vec<String>,
    pub beischrift_en: Vec<String>,
}

#[cfg_attr(not(feature = "pdf"), allow(dead_code))]
impl Stil {
    pub fn name(&self, sp: Sprache) -> &str {
        if sp == Sprache::En && !self.name_en.is_empty() { &self.name_en } else { &self.name }
    }
}

#[cfg(all(test, feature = "pdf"))]
impl Stil {
    pub fn test(id: &str, logo: Option<PathBuf>, kuerzel: Option<&str>, fliesstext: Fliesstext) -> Stil {
        Stil { id: id.into(), name: format!("{id} · Test"), name_en: String::new(), schrift: PathBuf::new(), familie: "Liberation Sans".into(), fliesstext,
            schriften: Vec::new(), logo, logo_breite_mm: 38.0, kuerzel: kuerzel.map(Into::into), beischrift: vec!["Zeile".into()], beischrift_en: Vec::new() }
    }
}

static STILE: OnceLock<Vec<Stil>> = OnceLock::new();

static VORGABE: OnceLock<String> = OnceLock::new();

/// Einmal beim Start: nur mit `gestaltungen` in `theme.json`.
pub fn laden(config: &crate::config::Config) {
    let liste = match (&config.marke.gestaltungen, config.theme_dir.as_deref()) {
        (Some(g), Some(dir)) => {
            let datei = dir.join(&g.datei);
            let l = lesen(&datei);
            if !l.is_empty() && !l.iter().any(|s| s.id == g.vorgabe) { tracing::warn!("Gestaltungen: Vorgabe {} fehlt in {}", g.vorgabe, datei.display()); }
            let _ = VORGABE.set(g.vorgabe.clone());
            l
        }
        _ => Vec::new(),
    };
    if !liste.is_empty() { tracing::info!("Gestaltungen für den PDF-Satz: {}", liste.iter().map(|s| s.id.as_str()).collect::<Vec<_>>().join(", ")); }
    let _ = STILE.set(liste);
}

/// Kennung der Vorgabe aus `theme.json`; sie gilt, wenn am Pad nichts gewählt ist.
pub fn vorgabe_id() -> &'static str { VORGABE.get().map(String::as_str).unwrap_or("") }

/// Gestaltung, die für ein Pad gilt: die gewählte, sonst die Vorgabe.
#[cfg_attr(not(feature = "pdf"), allow(dead_code))]
pub fn fuer(gewaehlt: Option<&str>) -> Option<&'static Stil> { gewaehlt.and_then(finde).or_else(|| finde(vorgabe_id())) }

pub fn alle() -> &'static [Stil] { STILE.get().map(Vec::as_slice).unwrap_or(&[]) }

pub fn finde(id: &str) -> Option<&'static Stil> { alle().iter().find(|s| s.id == id) }

/// Pfade in der Datei gelten relativ zu ihrem Ordner.
fn lesen(datei: &Path) -> Vec<Stil> {
    let ordner = datei.parent().unwrap_or(Path::new("."));
    let text = match std::fs::read_to_string(datei) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Vec::new(),
        Err(e) => { tracing::warn!("Gestaltungen: {} nicht lesbar: {e}", datei.display()); return Vec::new(); }
    };
    let eintraege: Vec<Eintrag> = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(e) => { tracing::warn!("Gestaltungen: {} ist kein gültiges JSON: {e}", datei.display()); return Vec::new(); }
    };
    let mut out: Vec<Stil> = Vec::new();
    for e in eintraege {
        match pruefen(ordner, e) {
            Ok(s) if out.iter().any(|o| o.id == s.id) => tracing::warn!("Gestaltungen: Kennung {} doppelt, übersprungen", s.id),
            Ok(s) => out.push(s),
            Err(m) => tracing::warn!("Gestaltungen: {m}"),
        }
    }
    out
}

/// Dateinamen ohne Pfadanteile, damit `stile.json` nicht aus dem Ordner hinauszeigt.
fn datei_im(ordner: &Path, name: &str) -> Option<PathBuf> {
    let ok = !name.is_empty() && !name.starts_with('.') && !name.contains(['/', '\\']);
    ok.then(|| ordner.join(name)).filter(|p| p.is_file())
}

fn schriftdatei(ordner: &Path, name: &str) -> Option<PathBuf> {
    datei_im(ordner, name).filter(|p| p.extension().and_then(|x| x.to_str()).is_some_and(|x| x.eq_ignore_ascii_case("ttf") || x.eq_ignore_ascii_case("otf")))
}

fn pruefen(ordner: &Path, e: Eintrag) -> Result<Stil, String> {
    let id_ok = !e.id.is_empty() && e.id.len() <= 40 && e.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if !id_ok { return Err(format!("Kennung {:?} ungültig (nur a–z, 0–9, -)", e.id)); }
    if e.name.trim().is_empty() || e.familie.trim().is_empty() { return Err(format!("{}: name und familie sind Pflicht", e.id)); }
    let fliesstext = match e.fliesstext.as_str() {
        "" | "arial" => Fliesstext::Arial,
        "arial-fett" => Fliesstext::ArialFett,
        "serif" => Fliesstext::Serif,
        x => return Err(format!("{}: fliesstext {x:?} unbekannt (arial, arial-fett, serif)", e.id)),
    };
    let schrift = schriftdatei(ordner, &e.schrift).ok_or_else(|| format!("{}: Schrift {:?} fehlt oder ist keine .ttf/.otf", e.id, e.schrift))?;
    let schriften = e.schriften.iter().map(|n| schriftdatei(ordner, n).ok_or_else(|| format!("{}: Schrift {n:?} fehlt oder ist keine .ttf/.otf", e.id))).collect::<Result<Vec<_>, _>>()?;
    let logo = if e.logo.is_empty() { None } else { Some(datei_im(ordner, &e.logo).ok_or_else(|| format!("{}: Logo {:?} fehlt", e.id, e.logo))?) };
    let logo_breite_mm = e.logo_breite_mm.unwrap_or(38.0);
    if !(5.0..=55.0).contains(&logo_breite_mm) { return Err(format!("{}: logo_breite_mm {logo_breite_mm} außerhalb 5–55", e.id)); }
    let kuerzel = Some(e.kuerzel.trim().to_string()).filter(|k| !k.is_empty());
    if kuerzel.is_some() && logo.is_some() { return Err(format!("{}: logo oder kuerzel, nicht beides", e.id)); }
    if kuerzel.as_ref().is_some_and(|k| k.chars().count() > 12 || k.chars().any(char::is_control)) { return Err(format!("{}: kuerzel höchstens 12 Zeichen", e.id)); }
    let zeilen = |v: Vec<String>| v.into_iter().map(|z| z.trim().to_string()).filter(|z| !z.is_empty()).collect::<Vec<_>>();
    let (beischrift, beischrift_en) = (zeilen(e.beischrift), zeilen(e.beischrift_en));
    if beischrift.len() + beischrift_en.len() > 4 || beischrift.iter().chain(&beischrift_en).any(|z| z.chars().count() > 80 || z.chars().any(char::is_control)) {
        return Err(format!("{}: Beischrift höchstens 4 Zeilen zu je 80 Zeichen", e.id));
    }
    Ok(Stil { id: e.id, name: e.name.trim().to_string(), name_en: e.name_en.trim().to_string(), schrift, familie: e.familie.trim().to_string(), fliesstext, schriften, logo, logo_breite_mm, kuerzel, beischrift, beischrift_en })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn liest_gueltige_und_ueberspringt_fehlerhafte() {
        let dir = std::env::temp_dir().join(format!("nextpad-stile-{}", crate::ids::random16()));
        std::fs::create_dir_all(&dir).unwrap();
        for f in ["sk.ttf", "serif.ttf", "sk.png"] { std::fs::write(dir.join(f), b"x").unwrap(); }
        std::fs::write(dir.join("stile.json"), r##"[
            {"id": "fb-sk", "name": "FB SK", "name_en": "Faculty SK", "schrift": "sk.ttf", "familie": "Muster Sans Kultur", "fliesstext": "serif", "schriften": ["serif.ttf"], "logo": "sk.png", "logo_breite_mm": 38},
            {"id": "fb-sk", "name": "doppelt", "schrift": "sk.ttf", "familie": "x"},
            {"id": "Gross", "name": "x", "schrift": "sk.ttf", "familie": "x"},
            {"id": "weg", "name": "x", "schrift": "../sk.ttf", "familie": "x"},
            {"id": "text", "name": "x", "schrift": "sk.ttf", "familie": "x", "fliesstext": "comic"},
            {"id": "fehlt", "name": "x", "schrift": "sk.ttf", "familie": "x", "schriften": ["nicht.ttf"]},
            {"id": "breit", "name": "x", "schrift": "sk.ttf", "familie": "x", "logo": "sk.png", "logo_breite_mm": 90},
            {"id": "ohne-logo", "name": "Ohne", "schrift": "sk.ttf", "familie": "x", "fliesstext": "arial-fett", "akzent": "#123456"},
            {"id": "zbx", "name": "ZBX", "schrift": "sk.ttf", "familie": "Muster Sans", "kuerzel": " ZBX ", "beischrift": ["Zentrum für Beispiele", " "], "beischrift_en": ["Centre for Examples"]},
            {"id": "beides", "name": "x", "schrift": "sk.ttf", "familie": "x", "logo": "sk.png", "kuerzel": "X"},
            {"id": "lang", "name": "x", "schrift": "sk.ttf", "familie": "x", "kuerzel": "X", "beischrift": ["1", "2", "3"], "beischrift_en": ["4", "5"]}
        ]"##).unwrap();
        let l = lesen(&dir.join("stile.json"));
        assert_eq!(l.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(), ["fb-sk", "ohne-logo", "zbx"]);
        assert_eq!((l[2].kuerzel.as_deref(), l[2].beischrift.len(), l[2].beischrift_en.len()), (Some("ZBX"), 1, 1));
        assert!(l[0].kuerzel.is_none());
        assert_eq!((l[0].fliesstext, l[0].schriften.len(), l[0].logo_breite_mm), (Fliesstext::Serif, 1, 38.0));
        assert_eq!(l[0].name(Sprache::En), "Faculty SK");
        assert_eq!((l[1].name(Sprache::En), l[1].fliesstext), ("Ohne", Fliesstext::ArialFett));
        assert!(l[1].logo.is_none());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn ohne_datei_keine_gestaltungen() {
        assert!(lesen(Path::new("/gibt/es/nicht/stile.json")).is_empty());
    }
}
