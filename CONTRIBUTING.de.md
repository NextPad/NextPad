# Mitwirken

English version: [CONTRIBUTING.md](CONTRIBUTING.md)

Beiträge sind willkommen: Fehlerberichte, Verbesserungsvorschläge und Pull Requests.
Dieses Dokument beschreibt den Entwicklungsablauf.

## Entwicklungsumgebung

```bash
git clone https://github.com/christiansteier/NextPad.git
cd NextPad
bash web/build.sh          # Editor- und Zeichenbrett-Bündel, vor dem ersten Rust-Bau nötig
cd server
cargo build
```

Der Editor in `web/` wird mit pnpm gebaut (siehe `web/README.md`); das Ergebnis
(`editor.js`, `editor.css`) bettet der Server aus `server/static/` ein. `web/build.sh`
kopiert die Quellen nach `~/.cache/nextpad-web` und baut dort, der Projektordner darf also
auf einem `noexec`-Mount liegen. Nach jeder Änderung in `web/src/` `web/build.sh` erneut
ausführen und die neu gebauten Dateien in `server/static/` mitcommitten.

## Tests und Prüfung

```bash
bash web/build.sh
cd server
cargo test                         # Unit-Tests
cargo clippy --all-targets -- -D warnings
cargo build                        # Programm für die Browsertests
cd ..
bash web/test/browsertests.sh      # Browser- und API-Tests gegen frisch gestartete Server
cd server && cargo build --release # Freigabe-Binary mit LTO, stripped
```

`web/test/browsertests.sh` startet vier Server mit leerem Datenbestand (Hauptserver, LTI
mit nachgespielter Plattform, Addon-Server, Erscheinungsbild) und führt die Tests in
`web/test/` mit Playwright (Chromium) aus: API, Sync, Zeitleiste, Wiederherstellen,
Editor, Gäste, Startseite, Sprachen, Ideensammlung, Quiz, Buzzer, Zeichenbrett, LTI,
Addons. Erstes Argument: Pfad zum Programm (Vorgabe `server/target/debug/nextpad`),
weitere Argumente wählen einzelne Tests. Einmalig vorher: `pnpm exec playwright install
chromium` im Bau-Verzeichnis von `web/build.sh`. Jeder Test endet mit Code 1, wenn eine
Prüfung fehlschlägt. Last-, Barrierefreiheits- und Pilottests (`belastung*`, `a11y-*`,
`ltipilot`, `remotetest`) laufen von Hand.

Die CI (`.github/workflows/ci.yml`) baut den Server, führt `cargo test`, clippy mit
`-D warnings`, `cargo audit` und dasselbe Testskript aus. Schlägt ein Browsertest fehl,
hängen Serverprotokolle und Testausgaben als Artefakt `browsertests` am Lauf.

## Konventionen

- Commit-Nachrichten auf GitHub englisch, im Imperativ, ohne Punkt am Ende („Keep
  indentation when restoring“). Darunter knappe Stichpunkte: was und warum.
- Keine Geheimnisse, keine Zugangsdaten, keine Pad-Inhalte im Repo. Was ignoriert wird,
  steht in `.gitignore`.
- Alles, was Menschen in NextPad lesen, gibt es auf Deutsch und Englisch: Texte gehören in
  `server/src/texte/de.rs` und `en.rs` (oder die Kataloge eines Addons), nie direkt in den
  Code. Ein Unit-Test prüft, dass beide Sprachen dieselben Schlüssel und Platzhalter haben.
- Dokumente für Menschen außerhalb des Projekts gibt es in beiden Sprachen: `X.md`
  englisch, `X.de.md` deutsch, gegenseitig verlinkt und inhaltlich synchron.
- Neue Funktionalität kommt mit Nachweis (Test oder Messung) und einem Eintrag in
  `CHANGELOG.md`.

## Pull Requests

Dieses GitHub-Repository wird aus einem eigenen Haupt-Repository veröffentlicht. Ein Pull
Request wird deshalb nicht hier gemergt: Sein Commit wird mit dir als Autor ins
Haupt-Repository übernommen und kommt mit dem nächsten Release hierher, das den Pull
Request schließt.

## Sicherheitsrelevante Meldungen

Siehe [`SECURITY.de.md`](SECURITY.de.md).
