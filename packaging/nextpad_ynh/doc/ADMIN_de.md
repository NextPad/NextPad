## Dateien

| Ort | Inhalt |
|---|---|
| `__DATA_DIR__/data/` | Datenbank (SQLite mit WAL) |
| `__DATA_DIR__/secrets/api-keys.txt` | API-Schlüssel für Moodle; Zeile: `<schlüssel> [https://moodle-adresse]` (mit Adresse zeigt NextPad Profilbilder aus diesem Moodle) |
| `__DATA_DIR__/secrets/lti-platforms.json` | optional: Moodle-Instanzen für die Anmeldung per LTI 1.3 (Format in `server/README.de.md` des Projekts) |
| `__DATA_DIR__/theme/` | optional: eigenes Theme mit `theme.json` oder nur `logo.png`, `font.ttf`, `background.jpg` (nicht im Paket) |
| `__INSTALL_DIR__/nextpad.env` | erzeugte Einstellungen; ändern über das Konfigurationsfenster |

Nach Änderungen an Dateien in `secrets/` oder `theme/`: `systemctl restart __APP__`.

## Moodle einrichten

Plugin Etherpad Lite (Website-Administration › Plugins › Aktivitäten › Etherpad Lite):

- Server-URL: `https://__DOMAIN____PATH__/` (mit Schrägstrich am Ende)
- API-Schlüssel: erste Zeile aus `secrets/api-keys.txt`
- Die Quelladresse des Moodle-Servers im Konfigurationsfenster unter „Quelladressen“ eintragen.
- Moodle-Adresse unter „Seiten, die NextPad einbetten dürfen“ ergänzen.

## Wartung

```bash
sudo yunohost app shell __APP__        # Umgebung der App
systemctl status __APP__ ; journalctl -u __APP__ -f
```

Zusammenführen des Update-Logs und Probelauf der Aufbewahrung von Hand (mit den Einstellungen des Dienstes):

```bash
sudo -u __APP__ bash -c 'set -a; . __INSTALL_DIR__/nextpad.env; __INSTALL_DIR__/nextpad compact'
sudo -u __APP__ bash -c 'set -a; . __INSTALL_DIR__/nextpad.env; NEXTPAD_RETENTION=dry-run __INSTALL_DIR__/nextpad retention-run'
```

## Sicherung und Wiederherstellung

- `yunohost backup create --apps __APP__` sichert das Programm, `secrets/`, `theme/` und einen Schnappschuss der Datenbank (`data/snapshots/sicherung.sqlite`), nie die laufende Datei.
- Vor jedem Upgrade legt das Paket `data/snapshots/vor-upgrade-<version>-<zeit>.sqlite` an. Die automatische Sicherung von YunoHost vor einem Upgrade enthält keine Pads.
- Startet ein neues Programm auf einer älteren Datenbank, legt es vorher `data/snapshots/vor-schema-<alt>-<neu>-<datum>.sqlite` an. Von beiden Arten bleiben die zwei jüngsten.
- Auf einer Datenbank mit höherer Schemaversion startet ein Programm nicht. Scheitert ein Upgrade, setzt die Wiederherstellung den jüngsten Schnappschuss vor dem Upgrade ein und legt die neuere Datenbank nach `archiv/`.
- `archiv/` mit früheren Ständen und Hand-Sicherungen wird weder gesichert noch automatisch geleert.
- Mit der Einstellung `do_not_backup_data=1` enthält eine Sicherung keine Pads.
- `yunohost app remove __APP__ --purge` löscht auch `data/snapshots/` und `archiv/`.

Von Hand (das Ziel muss für `__APP__` beschreibbar sein):

```bash
sudo -u __APP__ __INSTALL_DIR__/nextpad snapshot __DATA_DIR__/data/snapshots/hand.sqlite --quelle __DATA_DIR__/data/nextpad.sqlite
sudo __INSTALL_DIR__/nextpad check __DATA_DIR__/data/nextpad.sqlite   # 0 passt, 3 neuer als das Programm, 1 Fehler
```

Die Oberfläche gibt es auf Deutsch und Englisch; jede Person wechselt mit „DE | EN“. Die Mail vor dem Löschen kommt in der Sprache, die die besitzende Person zuletzt gewählt hat, sonst in beiden.
