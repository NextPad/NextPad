+++
title = "NextPad · Etherpad-Alternative für Lehre, Moodle und ILIAS"
description = "Gemeinsam schreiben in der Lehre: Pad mit Zeitleiste, Ideensammlung, Quiz und Zeichenbrett. Ohne Konto für Teilnehmer*innen, Daten auf dem eigenen Server."

[extra]
kicker = "Für die Lehre · freie Software (EUPL-1.2)"
h1 = "Gemeinsam schreiben, spielerisch lernen und zeichnen"
lead = "Gruppen schreiben im selben Text, das Plenum sammelt Fragen und stimmt ab, Teams treten im Quiz gegeneinander an. Teilnehmer*innen brauchen kein Konto, ein Link oder QR-Code genügt, am Desktop und auf mobilen Geräten. Die Daten bleiben auf dem Server der Bildungseinrichtung."
facts = ["ohne Konto für die Teilnehmer*innen", "am Desktop und auf mobilen Geräten", "Daten bleiben auf dem eigenen Server", "für sich allein oder in Moodle und ILIAS", "Deutsch und Englisch"]
hero_alt = "Ein Pad im Browser: Überschrift „Audio-Feature: Klang des Campus“, eine Liste mit Aufgaben für Lea, Jonas und Mira, Jonas’ neuer Satz farbig markiert."

lehre_title = "In der Lehre einsetzen"
lehre_text = "Pads sind vor allem Werkzeuge für Präsenz- und Seminarphasen: Gruppen arbeiten gleichzeitig, Lehrende sehen, was entsteht. NextPad baut darauf auf und ergänzt, was im Raum gebraucht wird."
szenarien = [
  { tool = "Pad", title = "Gruppenarbeit in der Sitzung", text = "Drei bis sechs Studierende schreiben im selben Text. Im Moodle-Gruppenmodus bekommt jede Gruppe ihr eigenes Pad." },
  { tool = "Autorenfarben", title = "Beteiligung sichtbar machen", text = "Jede Person schreibt in ihrer Farbe. Die Gruppe sieht selbst, wer beigetragen hat, ohne dass etwas bewertet wird." },
  { tool = "Daumen", title = "Thesen im Text bewerten", text = "Daumen hoch oder runter direkt neben einer These oder einem Vorschlag, eine Stimme je Person. So entsteht ein Meinungsbild mitten im Text." },
  { tool = "Aufgabenliste", title = "Arbeitsaufträge abhaken", text = "Kästchen zum Abhaken, mit <code>- [ ]</code> getippt oder per Knopf. Alle sehen live, was erledigt ist." },
  { tool = "Zeitleiste", title = "Schreibprozesse reflektieren", text = "Die Zeitleiste zeigt, wie ein Text entstanden ist: was gestrichen wurde, wann die Wende kam. Geeignet für Aufgaben wie „Vergleicht den ersten Entwurf mit dem Ergebnis“." },
  { tool = "Ideensammlung", title = "Fragen im Plenum sammeln", text = "Auch in großen Gruppen kommen Fragen und Ideen zusammen, ohne Namen, mit einer Stimme je Person. Die Leinwand zeigt das Ergebnis live." },
  { tool = "Quiz", title = "Spielerisch wiederholen", text = "Am Ende einer Einheit treten Teams auf der Quiz-Tafel gegeneinander an und buzzern mit dem Telefon. Teams haben nur Namen, Personen werden nicht erfasst." },
  { tool = "Zeichenbrett", title = "Skizzieren und planen", text = "Storyboards, Mindmaps oder Ablaufpläne entstehen gemeinsam auf dem Zeichenbrett, auf demselben Server." },
]

why_title = "Warum NextPad und nicht Etherpad?"
why_text = "Etherpad hat das gemeinsame Schreiben im Browser an Hochschulen bekannt gemacht, oft über <code>mod_etherpadlite</code> in Moodle. NextPad behält, was die Lehre daran nutzt. Was den Betrieb schwer macht, lässt es weg."
why = [
  { big = "Gleich", title = "für Lehrende in Moodle und ILIAS", text = "In Moodle bleibt die Aktivität „Etherpad Lite“, wie sie ist: Gruppen, Zeitfenster, Sicherung und Wiederherstellung von Kursen laufen weiter. In ILIAS kommt NextPad als externes Werkzeug in den Kurs. Bestehende Pads bleiben erreichbar." },
  { big = "Mehr", title = "Werkzeuge für den Raum", text = "Zeitleiste zum Nachvollziehen, Ideensammlung mit Leinwand, Quiz mit Buzzer und Zeichenbrett, alles auf einem Server. Der Chat fällt weg; er wurde kaum genutzt." },
  { big = "Leichter", title = "zu betreiben", text = "Ein Programm statt eines Node-Servers mit über tausend npm-Paketen und Plugins. Ein Update heißt: eine Datei tauschen. Auch 100 Personen in einem Pad antworten im Test in unter 80 ms." },
]

feat_title = "Was drinsteckt"
feat_text = "Ein Pad als Kern, dazu Ideensammlung, Quiz und Zeichenbrett, je Server ein- und ausschaltbar. Alles funktioniert ohne Lernplattform, live für alle, die gerade dabei sind, auch am Telefon."

moodle_title = "Mit Moodle und ILIAS"
moodle_text = "Wer schon eine Lernplattform nutzt, holt NextPad in die Kurse. Moodle braucht dafür nicht einmal ein neues Plugin."
steps = [
  { title = "Server und Schlüssel eintragen", text = "Im Plugin Etherpad Lite die Adresse von NextPad und den API-Schlüssel setzen. Mehr ändert sich in Moodle nicht." },
  { title = "Weiterarbeiten wie bisher", text = "Moodle legt Pads, Autoren und Sitzungen selbst über die API an. Gruppenmodus, Kurs-Reset, Sicherung und Wiederherstellung laufen über dieselben Aufrufe wie bei Etherpad." },
  { title = "Optional: LTI 1.3", text = "Als „Externes Tool“ eingebunden, wird jede Aktivität zu einem eigenen Pad, einer Ideensammlung oder einem Quiz. Die Rollen kommen aus Moodle: Lehrende moderieren und leiten, Studierende machen mit. Namen, Profilbilder und Sprache werden übernommen, ein Knopf führt zurück zum Kurs. Noten überträgt NextPad nicht." },
]
moodle_name = "Moodle"
moodle_how = "über die Etherpad-API und LTI 1.3"
ilias = { name = "ILIAS", status = "erprobt mit ILIAS 11", text = "Die Administration trägt NextPad einmal als LTI-Provider ein. Danach legen Lehrende Pad, Ideensammlung oder Quiz als Objekt in den Kurs. Rollen, Namen und Sprache kommen aus ILIAS. QR-Code und „Zurück zum Kurs“ führen ab Version 0.19 nach ILIAS." }
api_label = "Beispiel eines API-Aufrufs"
api_c1 = "So fragt mod_etherpadlite an, NextPad antwortet wie Etherpad"
api_c2 = "Antwort"
api_caption = "Die nachgebildete API steht in <code>docs/api-spezifikation.md</code>."

themes_title = "Drei Erscheinungsbilder"
themes_text = "Eine Einstellung beim Einrichten wählt die Form für Startseite, Pads, Ideensammlung und Quiz: eckig, leicht rund oder rund. Alle drei erfüllen WCAG 2.2 AA, hell wie dunkel. Die Schriften liegen im Programm und kommen nicht von fremden Servern."
themes = [
  { name = "Eckig", wert = "nextpad", standard = true, text = "Klare Kanten, Petrol als Akzent, Schrift NextPad Sans mit den Maßen von Arial. Logo und Hausfarben lassen sich in der Verwaltung setzen.", alt = "Startseite im Theme eckig: Kopf mit NextPad-Zeichen, Feld für den Pad-Namen, Knopf in Petrol, Vorlagen als Kacheln mit geraden Ecken." },
  { name = "Rund", wert = "rund", text = "Große Rundungen, Knöpfe als Pillen, Blau als Akzent. Die Schrift Lexend wurde für gute Lesbarkeit entworfen. Logo und Hausfarben lassen sich in der Verwaltung setzen.", alt = "Startseite im Theme rund: helles Blau im Hintergrund, Karte mit großen Rundungen, Knopf als blaue Pille, Schrift Lexend." },
  { name = "Leicht rund", wert = "colibris", text = "Wie Etherpad mit Quicksand und Bleistift-Hintergrund. Vertraut für alle, die vorher mit Etherpad gearbeitet haben.", alt = "Startseite im Theme leicht rund: grüner Hintergrund mit Buntstiften, dunkles Feld mit „Neues Pad“ und Eingabe für den Namen." },
]
themes_hint = "Das Theme wählt die Variable <code>NEXTPAD_THEME</code>, bei YunoHost die Installation. Einrichtungen mit eigenem Corporate Design nutzen das Theme <code>hsd</code> als Vorlage."

ops_title = "Datenschutz, Betrieb, Barrierefreiheit"
cards = [
  { title = "Keine fremden Dienste", text = "Keine Tracker, keine Schriften oder Skripte von Dritten. Alles, was der Browser lädt, kommt vom eigenen Server." },
  { title = "Eigene Pads löschen", text = "Wer ein freies Pad anlegt, besitzt es und kann es jederzeit löschen oder um ein Jahr verlängern. Auf Wunsch löscht NextPad ungenutzte Pads nach einer einstellbaren Frist, ab Werk ist sie aus. Wer über Moodle oder ILIAS angemeldet ist, bekommt vorher eine Mail mit dem Inhalt. Pads in Kursen folgen dem Kurs." },
  { title = "Kleine Angriffsfläche", text = "Ein Programm ohne Node.js und ohne Plugins zur Laufzeit. Pad-Inhalte bleiben Daten, die Anmeldung über Moodle nimmt nur RS256-signierte Tokens an." },
  { title = "Einfach zu betreiben", text = "SQLite im Datenverzeichnis, Konfiguration über Umgebungsvariablen. Reverse-Proxy mit TLS davor, fertig." },
  { title = "Barrierefreiheit geprüft", text = "Startseite und Ideensammlung werden in jedem Theme mit axe gegen WCAG 2.2 AA geprüft, hell und dunkel, bei jedem Testlauf. Bedienflächen sind mindestens 44 px groß." },
  { title = "Zwei Sprachen", text = "Oberfläche, Hilfe, Exporte und Mails auf Deutsch und Englisch. Die Wahl wird gemerkt, sonst gilt die Sprache aus Moodle oder dem Browser. Was Menschen schreiben, bleibt, wie es ist." },
]

inst_title = "Installieren"
inst_text = "Drei Wege, je nach Umgebung. Die Einstellungen beschreibt <a href=\"https://github.com/NextPad/NextPad/blob/main/server/README.md\"><code>server/README.md</code></a>."
ways = [
  { title = "Binary", text = "Für Linux x86-64 aus den Releases laden und starten.", code = "<span class=\"c\"># Datenverzeichnis und Adresse</span>\nNEXTPAD_DATA=/srv/nextpad \\\nNEXTPAD_PUBLIC_URL=https://pads.example.org \\\n./nextpad", link = "releases/latest", link_text = "Zu den Releases" },
  { title = "Container", text = "Mit docker compose nach dem Muster von linuxserver.io, Daten unter <code>./config</code>.", code = "cp .env.example .env\ndocker compose up -d --build", link = "blob/main/docs/docker.md", link_text = "Anleitung Container" },
  { title = "YunoHost", text = "Als App mit Einstellungsseite für API-Schlüssel, LTI und Admins.", code = "yunohost app install \\\n  ./packaging/nextpad_ynh", link = "tree/main/packaging/nextpad_ynh", link_text = "YunoHost-Paket" },
]

[[extra.features]]
tag = "Startseite"
title = "Sofort loslegen, ohne Lernplattform"
text = ["Auf der Startseite einen Namen eingeben oder eine Vorlage wählen, schon ist ein Pad, eine Sammlung, ein Quiz oder ein Zeichenbrett da. Teilen geht per Link oder QR-Code. Freie Pads haben Besitzregeln und eine einstellbare Aufbewahrungsfrist. Hell und dunkel folgt dem System.", "Name, Farben, Logo und Startbild stellen Admins im Browser ein. Die Abstufungen der Farben rechnet NextPad so aus, dass der Kontrast reicht."]
imgs = [
  { src = "start.webp", cls = "pic-light", w = 1600, h = 1000, alt = "Startseite von NextPad mit Eingabefeld für einen Pad-Namen und Vorlagen." },
  { src = "start-dunkel.webp", cls = "pic-dark", w = 1600, h = 1000, alt = "Startseite von NextPad im dunklen Modus." },
]

[[extra.features]]
tag = "Pad"
title = "Schreiben mit Zeitleiste"
text = ["Gemeinsames Schreiben über Yjs (CRDT) und den Editor TipTap. Jede Person hat ihre Farbe, die Zeitleiste spielt die Entstehung Schritt für Schritt ab."]
items = ["Markdown beim Tippen und Einfügen: <code>#</code> für Überschriften, <code>-</code> für Listen, <code>- [ ]</code> für Kästchen, Tabellen mit <code>|</code>", "Daumen hoch und runter im Text, eine Stimme je Person", "Inhaltsverzeichnis am Rand oder als Block im Text", "Zeitleiste mit Zeit und Autor je Schritt, frühere Fassung wiederherstellen", "Export als HTML, Markdown, Text und PDF"]
imgs = [{ src = "zeitleiste.webp", w = 1600, h = 1000, alt = "Zeitleiste über dem Pad: Der Schieberegler steht kurz vor dem Ende, Jonas’ Satz ist erst halb geschrieben." }]

[[extra.features]]
tag = "Ideensammlung"
title = "Fragen und Ideen sammeln, abstimmen, zeigen"
text = ["Beiträge ohne Namen eintragen, mit einer Stimme je Person abstimmen. Die Leinwand-Ansicht mit QR-Code gehört auf den Beamer, moderiert wird von der Person, die die Sammlung angelegt hat."]
imgs = [
  { src = "ideen.webp", w = 1600, h = 1748, alt = "Ideensammlung mit der Frage „Welche Themen soll das Campusradio im nächsten Semester aufgreifen?“ und fünf Ideen, nach Stimmen sortiert." },
  { src = "leinwand.webp", w = 1600, h = 900, alt = "Leinwand-Ansicht derselben Sammlung mit großem QR-Code zum Mitmachen." },
]

[[extra.features]]
tag = "Quiz"
title = "Quiz-Tafel mit Buzzer"
text = ["Fragen nach Kategorie und Punkten als Tabelle anlegen, die Tafel auf den Beamer, die Teams buzzern mit dem Telefon. Wer zuerst drückt, steht groß auf der Leinwand, ein Countdown begrenzt die Zeit je Frage."]
items = ["Teams wählen per QR-Code, Spiel starten, beenden, neu beginnen", "Buzzer-Messung misst im Raum, wie schnell jedes Telefon Signal und Druck überträgt", "Als Aktivität in Moodle und ILIAS über LTI 1.3"]
board = true

[[extra.features]]
tag = "Zeichenbrett"
title = "Skizzieren auf demselben Server"
text = ["Excalidraw synchronisiert über denselben Yjs-Server wie die Pads. Formen, Pfeile und Text, ohne zusätzlichen Dienst."]
imgs = [{ src = "zeichenbrett.webp", w = 1600, h = 1000, alt = "Zeichenbrett mit einem Storyboard: Rechteck „Szene 1: Totale“, Pfeil, Ellipse „Szene 2: Interview“." }]

[extra.board]
label = "Beispiel einer Quiz-Tafel: vier Kategorien mit Fragen zu 100, 200 und 300 Punkten, drei Felder gespielt, eine Frage offen, Team Blau hat zuerst gebuzzert."
cats = ["Kamera", "Ton", "Schnitt", "Medienrecht"]
done = [0, 2, 5]
now = 6
team1 = "Team Blau"
team2 = "Team Gelb"
buzz = "Team Blau war zuerst"

+++
