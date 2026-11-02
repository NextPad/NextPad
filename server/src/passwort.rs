//! Passwortschutz freier Pads (Stufe 1): Argon2id-Hash und Begrenzung der Versuche je Pad.
use crate::sperre::Sperre;
use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use tokio::sync::Semaphore;

pub const MIN: usize = 6;
pub const MAX: usize = 128;
const FENSTER_MS: i64 = 15 * 60 * 1000;

pub fn zulaessig(pw: &str) -> bool { (MIN..=MAX).contains(&pw.chars().count()) }

fn hash_sync(pw: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default().hash_password(pw.as_bytes(), &salt).map_err(|e| anyhow::anyhow!("{e}"))?.to_string())
}

fn pruefen_sync(pw: &str, hash: &str) -> bool {
    PasswordHash::new(hash).is_ok_and(|h| Argon2::default().verify_password(pw.as_bytes(), &h).is_ok())
}

/// Argon2 braucht je Aufruf rund 19 MiB und einige zehn Millisekunden: höchstens vier gleichzeitig,
/// außerhalb der Threads, die Anfragen bedienen.
static ARGON: Semaphore = Semaphore::const_new(4);

pub async fn hash(pw: String) -> anyhow::Result<String> {
    let _p = ARGON.acquire().await?;
    tokio::task::spawn_blocking(move || hash_sync(&pw)).await?
}

pub async fn pruefen(pw: String, hash: String) -> bool {
    let Ok(_p) = ARGON.acquire().await else { return false };
    tokio::task::spawn_blocking(move || pruefen_sync(&pw, &hash)).await.unwrap_or(false)
}

/// Gesperrte Passwörter: zu leicht zu erraten, auch mit Begrenzung der Versuche.
const TRIVIAL: &[&str] = &[
    "123456", "1234567", "12345678", "123456789", "1234567890", "654321", "123123", "121212", "112233",
    "abcdef", "abc123", "qwertz", "qwerty", "asdfgh", "yxcvbn", "passwort", "passwort1", "password", "password1",
    "geheim", "geheim1", "hallo1", "hallo123", "letmein", "iloveyou", "seminar", "vorlesung", "moodle", "nextpad",
];

/// true: Passwort ist ein bekanntes Trivialpasswort, besteht aus einem einzigen Zeichen oder gleicht dem Pad-Namen.
pub fn trivial(pw: &str, pad: &str) -> bool {
    let k = pw.to_lowercase();
    let mut z = k.chars();
    let erstes = z.next();
    TRIVIAL.contains(&k.as_str()) || z.all(|c| Some(c) == erstes) || k == pad.to_lowercase()
}

/// Fehlschläge je Netz (IPv4-Adresse, IPv6 /64) bis zur Sperre; zurückgesetzt bei Erfolg.
const JE_NETZ: u32 = 30;
/// Ab so vielen Fehlschlägen je Pad wartet jeder weitere Versuch, doppelt so lange wie der vorige.
const BREMSE_AB: u32 = 20;
const BREMSE_MAX_MS: u64 = 30_000;

/// Zähler im laufenden Fenster: (Anzahl, Beginn), Schlüssel „n:“ für Netz, „p:“ für Pad
#[derive(Default)]
struct Zaehler(Mutex<HashMap<String, (u32, i64)>>);
static ZAEHLER: LazyLock<Zaehler> = LazyLock::new(Default::default);

fn bremse(n: u32) -> u64 { if n < BREMSE_AB { 0 } else { (1000u64 << (n - BREMSE_AB).min(5)).min(BREMSE_MAX_MS) } }

/// Meldet einen Versuch an, bevor das Passwort geprüft wird, unter einer Sperre, damit parallele Anfragen
/// nicht vorbeikommen. None: Aus diesem Netz sind gerade keine Versuche erlaubt. Some(ms): so lange warten.
/// Ein Pad wird nie ganz gesperrt, damit niemand mit dem Namen allein einen Hörsaal aussperren kann.
pub fn versuch(pad: &str, netz: &str, now: i64) -> Option<u64> { ZAEHLER.versuch(pad, netz, now) }

/// Richtiges Passwort: Der Versuch zählt nicht als Fehlschlag, der Zähler des Netzes beginnt neu.
pub fn erfolg(pad: &str, netz: &str) { ZAEHLER.erfolg(pad, netz) }

impl Zaehler {
    fn versuch(&self, pad: &str, netz: &str, now: i64) -> Option<u64> {
        let mut m = self.0.sperren();
        m.retain(|_, (_, start)| now - *start < FENSTER_MS);
        let n = m.entry(format!("n:{netz}")).or_insert((0, now));
        if n.0 >= JE_NETZ { return None; }
        n.0 += 1;
        let p = m.entry(format!("p:{pad}")).or_insert((0, now));
        p.0 += 1;
        Some(bremse(p.0 - 1))
    }

    fn erfolg(&self, pad: &str, netz: &str) {
        let mut m = self.0.sperren();
        m.remove(&format!("n:{netz}"));
        if let Some(p) = m.get_mut(&format!("p:{pad}")) { p.0 = p.0.saturating_sub(1); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_und_pruefung() {
        let h = hash_sync("seminar-3").unwrap();
        assert!(h.starts_with("$argon2id$"));
        assert!(pruefen_sync("seminar-3", &h));
        assert!(!pruefen_sync("seminar-4", &h));
        assert!(!pruefen_sync("seminar-3", "kein hash"));
    }

    #[test]
    fn laenge() {
        assert!(!zulaessig("12345"));
        assert!(zulaessig("123456"));
        assert!(zulaessig(&"ä".repeat(128)));
        assert!(!zulaessig(&"a".repeat(129)));
    }

    #[test]
    fn netz_wird_gesperrt_pad_nur_gebremst() {
        let z = Zaehler::default();
        let t = 1_000_000;
        for i in 0..JE_NETZ { assert!(z.versuch(&format!("pad-{i}"), "198.51.100.1", t).is_some()); }
        assert_eq!(z.versuch("pad-x", "198.51.100.1", t + 1), None);
        assert!(z.versuch("pad-x", "198.51.100.2", t + 1).is_some());
        assert!(z.versuch("pad-x", "198.51.100.1", t + FENSTER_MS).is_some());
    }

    #[test]
    fn bremse_je_pad() {
        let z = Zaehler::default();
        let t = 2_000_000;
        let mut warten = Vec::new();
        for i in 0..BREMSE_AB + 8 { warten.push(z.versuch("pad-bremse", &format!("203.0.113.{i}"), t).unwrap()); }
        assert!(warten[..BREMSE_AB as usize].iter().all(|w| *w == 0));
        assert_eq!(&warten[BREMSE_AB as usize..], &[1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    }

    #[test]
    fn erfolg_zaehlt_nicht_als_fehlschlag() {
        let z = Zaehler::default();
        let t = 3_000_000;
        for _ in 0..JE_NETZ - 1 { z.versuch("pad-saal", "192.0.2.7", t); }
        z.erfolg("pad-saal", "192.0.2.7");
        for _ in 0..JE_NETZ - 1 { assert!(z.versuch("pad-saal-2", "192.0.2.7", t).is_some()); }
        // 200 richtige Eingaben im Saal bremsen das Pad nicht
        for _ in 0..200 { assert_eq!(z.versuch("pad-voll", "192.0.2.8", t), Some(0)); z.erfolg("pad-voll", "192.0.2.8"); }
    }

    #[test]
    fn trivialpasswoerter() {
        assert!(trivial("123456", "x"));
        assert!(trivial("Passwort", "x"));
        assert!(trivial("aaaaaa", "x"));
        assert!(trivial("Gruppe-Rot", "gruppe-rot"));
        assert!(!trivial("kurs-2026", "x"));
    }
}
