# Buzzer messen

<aside class="np-kasten np-ziel" aria-label="Worum es geht">
<p class="np-kasten-titel">Worum es geht</p>

- eine Buzzer-Messung mit mehreren Handys durchführen
- das Urteil der Messung lesen
- einschätzen, was die Messung nicht zeigt

</aside>

Beim Buzzern zählt, wer zuerst drückt. Gewertet wird der Moment des Drückens. Dafür stellt jedes Handy seine Uhr laufend nach dem Server. Die Messung zeigt, wie stark dieser Uhrabgleich im WLAN schwankt.

<figure class="np-film">
<video src="../medien/quiz-messen.mp4" poster="../medien/quiz-messen.png" muted loop playsinline controls preload="metadata"></video>
<figcaption>Die Messung mit drei Geräten: Die Leitung sendet Signale, iPhone und Android-Handy drücken, am Ende steht das Urteil.</figcaption>
</figure>

## Schritte

1. Im Menü des Quiz **Buzzer-Messung** öffnen.
2. Die Messseite hat einen eigenen QR-Code. Die Handys öffnen sie darüber.
3. Auf jedem Handy **Mitmessen** tippen. Es braucht mindestens drei Handys.
4. Die Leitung sieht, wie viele Handys mitmessen. Die Handys einige Minuten offen lassen.
5. **Signal senden** wählen oder die Leertaste drücken.
6. Auf allen Handys erscheint „Jetzt drücken!“. Alle drücken sofort.
7. Jedes Handy zeigt die eigene Reaktionszeit.
8. Nach 10 bis 20 Signalen steht das **Urteil**.
9. Bei Bedarf **Rohdaten als CSV** sichern. Danach **Messdaten löschen**.

## Das Urteil lesen

- „Der Uhrabgleich trägt“: In 95 % der Fälle schwankt der Abgleich um weniger als 50 ms. Das reicht. Liegen zwei Teams näher als 50 ms beieinander, zeigt das Spiel ohnehin „gleichauf“.
- „Der Uhrabgleich reicht nicht“: Die Schwankung ist größer. Ein anderes WLAN kann helfen.
- „Noch zu wenige Daten“: Es fehlen Handys oder Zeit.

Unter dem Urteil stehen weitere Werte. Sie gehen nicht ins Urteil ein. Dazu gehört „Wer war zuerst?“. Dort steht, in wie vielen Runden die Reihenfolge nach Eingang beim Server anders gewesen wäre.

## Grenzen

- Die Messung zeigt, wie stark der Abgleich schwankt. Ob eine Uhr richtig geht, zeigt sie nicht.
- Ist der Weg im WLAN dauerhaft in eine Richtung länger, bleibt dieser Fehler unsichtbar.
- Gespeichert werden je Gerät eine Nummer, die grobe Geräteart und Zeitpunkte. Namen werden nicht gespeichert.
