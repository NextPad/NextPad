# Sicherheit

English version: [SECURITY.md](SECURITY.md)

## Unterstützte Versionen

Sicherheitskorrekturen bekommt die jeweils neueste veröffentlichte Version.

## Schwachstelle melden

Sicherheitsrelevante Probleme werden nicht über öffentliche Issues gemeldet. Dafür die
private Meldung der Plattform nutzen (auf GitHub: „Report a vulnerability“ im Reiter
Security) oder den Maintainer direkt ansprechen.

Eine Meldung enthält eine Beschreibung des Problems, Schritte zum Nachvollziehen und die
betroffene Version. Meldungen werden bestätigt und so schnell bearbeitet, wie es die Zeit
des Maintainers erlaubt.

## Umfang

NextPad bildet die HTTP-API von Etherpad nach und verarbeitet API-Schlüssel und Geheimnisse
von LTI-Plattformen. Schlüssel und Geheimnisse sind schutzbedürftig: Sie landen nie im
Protokoll und sind per `.gitignore` von der Versionsverwaltung ausgenommen. Sicherheitsbefunde
zu laufenden Servern, Hostnamen, Versionsständen und Rohmessungen liegen in einem eigenen,
dauerhaft privaten Repository und gehören nicht hierher. Meldungen zu versehentlich
offengelegten Zugangsdaten oder umgehbarer Anmeldung in diesem Code gehören dazu.
