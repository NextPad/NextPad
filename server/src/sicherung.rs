//! Schnappschüsse und Prüfung der Datenbank: `nextpad snapshot`, `nextpad check` und die
//! Kopie vor einer Schema-Migration. Die SQLite-Bibliothek steckt im Programm, das Paket braucht kein `sqlite3`.
use crate::store::SCHEMA_VERSION;
use anyhow::{anyhow, bail, Context, Result};
use rusqlite::{Connection, OpenFlags};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub fn schema(conn: &Connection) -> rusqlite::Result<i64> {
    conn.pragma_query_value(None, "user_version", |r| r.get(0))
}

pub fn integritaet(conn: &Connection) -> Result<()> {
    let zeilen: Vec<String> = conn.prepare("PRAGMA integrity_check")?.query_map([], |r| r.get(0))?.collect::<rusqlite::Result<_>>()?;
    if zeilen.len() == 1 && zeilen[0] == "ok" { Ok(()) } else { bail!("integrity_check: {}", zeilen.join("; ")) }
}

/// Konsistenter Stand über `VACUUM INTO`, erst in eine versteckte Datei daneben, dann geprüft und umbenannt.
/// Ein vorhandenes Ziel wird nie überschrieben. Gibt die Größe in Bytes zurück.
pub fn kopie(quelle: &Connection, ziel: &Path) -> Result<u64> {
    if ziel.exists() { bail!("{} gibt es schon, nichts überschrieben", ziel.display()); }
    let name = ziel.file_name().and_then(|n| n.to_str()).ok_or_else(|| anyhow!("Ziel {} hat keinen Dateinamen", ziel.display()))?;
    let tmp = ziel.with_file_name(format!(".{name}.tmp-{}", std::process::id()));
    let _ = std::fs::remove_file(&tmp);
    let erwartet = schema(quelle)?;
    let erg = (|| -> Result<u64> {
        quelle.execute("VACUUM INTO ?1", [tmp.to_str().ok_or_else(|| anyhow!("Pfad {} ist kein UTF-8", tmp.display()))?])?;
        let k = Connection::open_with_flags(&tmp, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        integritaet(&k)?;
        let v = schema(&k)?;
        if v != erwartet { bail!("Kopie hat Schemaversion {v} statt {erwartet}"); }
        drop(k);
        std::fs::File::open(&tmp)?.sync_all()?;
        Ok(std::fs::metadata(&tmp)?.len())
    })();
    match erg {
        Ok(n) => {
            std::fs::rename(&tmp, ziel)?;
            if let Some(Ok(d)) = ziel.parent().map(std::fs::File::open) { let _ = d.sync_all(); }
            Ok(n)
        }
        Err(e) => { let _ = std::fs::remove_file(&tmp); Err(e) }
    }
}

/// Schemaversion vor dem Öffnen; `None` heißt neue, leere Datenbank.
pub fn schema_vorher(conn: &Connection) -> rusqlite::Result<Option<i64>> {
    let tabellen: i64 = conn.query_row("SELECT COUNT(*) FROM sqlite_master", [], |r| r.get(0))?;
    if tabellen == 0 { Ok(None) } else { schema(conn).map(Some) }
}

/// Kopie vor der Migration nach `snapshots/vor-schema-<alt>-<neu>-<datum>.sqlite` neben der Datenbank.
pub fn vor_schema(conn: &Connection, db: &Path, alt: i64, neu: i64) -> Result<PathBuf> {
    let dir = db.parent().unwrap_or(Path::new(".")).join("snapshots");
    std::fs::create_dir_all(&dir).with_context(|| format!("{} anlegen", dir.display()))?;
    let jetzt = crate::ids::now_ms();
    let (y, m, d) = crate::pdf::ymd(jetzt);
    let mut ziel = dir.join(format!("vor-schema-{alt}-{neu}-{y}-{m:02}-{d:02}.sqlite"));
    if ziel.exists() { ziel = dir.join(format!("vor-schema-{alt}-{neu}-{y}-{m:02}-{d:02}-{jetzt}.sqlite")); }
    let n = kopie(conn, &ziel).with_context(|| format!("Kopie vor der Migration nach {}", ziel.display()))?;
    tracing::info!("Schemaversion {alt} → {neu}: Kopie vorher in {} ({n} Bytes)", ziel.display());
    Ok(ziel)
}

/// `nextpad snapshot <ziel> [--quelle <datenbank>]`: Stand der laufenden Datenbank, ohne Migration.
pub fn befehl_snapshot(args: &[String]) -> Result<()> {
    let ziel = args.get(2).filter(|a| !a.starts_with("--")).map(PathBuf::from)
        .ok_or_else(|| anyhow!("Aufruf: nextpad snapshot <ziel> [--quelle <datenbank>]"))?;
    let quelle = match args.iter().position(|a| a == "--quelle") {
        Some(i) => PathBuf::from(args.get(i + 1).ok_or_else(|| anyhow!("--quelle braucht eine Datei"))?),
        None => crate::config::db_path(Path::new(&crate::config::var("DATA").unwrap_or_else(|| "./data".into()))),
    };
    let c = Connection::open_with_flags(&quelle, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .with_context(|| format!("{} öffnen", quelle.display()))?;
    c.busy_timeout(Duration::from_secs(30))?;
    let n = kopie(&c, &ziel)?;
    println!("ok {} schema={} bytes={n}", ziel.display(), schema(&c)?);
    Ok(())
}

/// `nextpad check <datei>`: Exit 0 unversehrt und passend, 3 unversehrt, aber neuer als dieses Programm,
/// 1 bei jedem Fehler. Öffnet nur lesend und legt nichts an.
pub fn befehl_check(args: &[String]) -> Result<i32> {
    let datei = args.get(2).map(PathBuf::from).ok_or_else(|| anyhow!("Aufruf: nextpad check <datei>"))?;
    let c = Connection::open_with_flags(&datei, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .with_context(|| format!("{} öffnen", datei.display()))?;
    c.busy_timeout(Duration::from_secs(30))?;
    integritaet(&c).with_context(|| datei.display().to_string())?;
    let v = schema(&c)?;
    println!("ok {} schema={v} programm={SCHEMA_VERSION}", datei.display());
    Ok(if v > SCHEMA_VERSION { 3 } else { 0 })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::Store;

    fn ordner(k: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nextpad-test-sich-{k}-{}-{}", std::process::id(), crate::ids::now_ms()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// Kopie aus einer laufenden WAL-Datenbank: Inhalt und Schemaversion bleiben, ein vorhandenes Ziel nicht überschrieben.
    #[test]
    fn kopie_der_laufenden_datenbank() {
        let d = ordner("k");
        let db = d.join("nextpad.sqlite");
        let store = Store::open(&db, &[]).unwrap();
        store.create_pad("p1", None).unwrap();
        let c = Connection::open(&db).unwrap();
        assert!(d.join("nextpad.sqlite-wal").exists(), "WAL liegt neben der Datenbank");
        let ziel = d.join("kopie.sqlite");
        assert!(kopie(&c, &ziel).unwrap() > 0);
        let k = Connection::open_with_flags(&ziel, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        assert_eq!(schema(&k).unwrap(), SCHEMA_VERSION);
        assert_eq!(k.query_row("SELECT COUNT(*) FROM pads WHERE id='p1'", [], |r| r.get::<_, i64>(0)).unwrap(), 1);
        assert!(kopie(&c, &ziel).is_err(), "vorhandenes Ziel bleibt");
        assert!(std::fs::read_dir(&d).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().contains(".tmp-")), "keine Reste");
        drop(store);
        let _ = std::fs::remove_dir_all(&d);
    }

    /// Ältere Datenbank: Kopie vorher, danach aktuelle Version. Neuere Datenbank: Start verweigert, nichts verändert.
    #[test]
    fn schemaversion_beim_oeffnen() {
        let d = ordner("v");
        let db = d.join("nextpad.sqlite");
        drop(Store::open(&db, &[]).unwrap());
        assert!(!d.join("snapshots").exists(), "neue Datenbank braucht keine Kopie");
        Connection::open(&db).unwrap().pragma_update(None, "user_version", 0).unwrap();
        drop(Store::open(&db, &[]).unwrap());
        let kopien: Vec<_> = std::fs::read_dir(d.join("snapshots")).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        assert!(kopien.len() == 1 && kopien[0].starts_with(&format!("vor-schema-0-{SCHEMA_VERSION}-")), "{kopien:?}");
        assert_eq!(schema(&Connection::open(&db).unwrap()).unwrap(), SCHEMA_VERSION);
        Connection::open(&db).unwrap().pragma_update(None, "user_version", SCHEMA_VERSION + 1).unwrap();
        let fehler = Store::open(&db, &[]).err().expect("neuere Datenbank startet nicht").to_string();
        assert!(fehler.contains("Schemaversion"), "{fehler}");
        assert_eq!(schema(&Connection::open(&db).unwrap()).unwrap(), SCHEMA_VERSION + 1, "Version bleibt");
        let _ = std::fs::remove_dir_all(&d);
    }

    /// `check`: 0 passend, 3 neuer, Fehler bei fehlender oder kaputter Datei, und es entsteht keine neue Datei.
    #[test]
    fn pruefung_fuer_skripte() {
        let d = ordner("c");
        let db = d.join("nextpad.sqlite");
        drop(Store::open(&db, &[]).unwrap());
        let a = |p: &Path| vec!["nextpad".to_string(), "check".into(), p.display().to_string()];
        assert_eq!(befehl_check(&a(&db)).unwrap(), 0);
        Connection::open(&db).unwrap().pragma_update(None, "user_version", SCHEMA_VERSION + 1).unwrap();
        assert_eq!(befehl_check(&a(&db)).unwrap(), 3);
        let fehlt = d.join("fehlt.sqlite");
        assert!(befehl_check(&a(&fehlt)).is_err() && !fehlt.exists());
        let kaputt = d.join("kaputt.sqlite");
        std::fs::write(&kaputt, b"keine Datenbank").unwrap();
        assert!(befehl_check(&a(&kaputt)).is_err());
        let _ = std::fs::remove_dir_all(&d);
    }
}
