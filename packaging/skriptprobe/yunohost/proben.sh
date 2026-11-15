#!/usr/bin/env bash
# Läuft im Wegwerf-Container: fünf Proben für Sicherung, Wiederherstellung und Upgrade gegen eine echte YunoHost.
# Vorbereitet von start.sh: altes Paket installiert, daten.sh gelaufen, /root/pkg-neu und /root/pkg-neu2
# (Version 0.99.0~ynh1 und ~ynh2, das zweite bricht nach dem Schnappschuss ab), Webserver probe-http auf :8099.
# Aufruf: bash proben.sh [alle|upgrade|sicherung|last|rueckfall|ohnedaten]
set -uo pipefail
U=https://127.0.0.1/np; H="Host: ynhprobe.test"; KEY=$(cat /root/key)
DB=/home/yunohost.app/nextpad/data/nextpad.sqlite; SN=/home/yunohost.app/nextpad/data/snapshots
AR=/home/yunohost.app/nextpad/archiv; BIN=/var/www/nextpad/nextpad
ok=0; fehl=0
pruef() { if eval "$2"; then echo "ok    $1"; ok=$((ok+1)); else echo "FEHL  $1"; fehl=$((fehl+1)); fi; }
texte_gleich() {
    local id; for id in $(cat /root/pad-a /root/pad-b /root/pad-c); do
        diff -q <(curl -sk -H "$H" "$U/api/1.2/getText?apikey=$KEY&padID=$id") /root/vorher/$id.json >/dev/null || return 1
    done
}
gesperrt() { [ "$(curl -sk -H "$H" -o /dev/null -w %{http_code} $U/p/$(cat /root/pad-c))" = 403 ]; }
uv() { sqlite3 "$1" "pragma user_version;"; }
bereit() { local i; for i in $(seq 1 30); do curl -sk -H "$H" -o /dev/null -w %{http_code} $U/ | grep -q 200 && return 0; sleep 1; done; return 1; }
version() { yunohost app info nextpad --output-as json | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])"; }


case "${1:-alle}" in
upgrade|alle)
ALTV=$(version); ALTUV=$(uv $DB); echo "$ALTV" > /root/alt-version
echo "--- Probe 3: Upgrade $ALTV (Schema $ALTUV) → 0.99.0~ynh1 mit Daten"
yunohost app upgrade nextpad -f /root/pkg-neu --no-safety-backup > /root/p3.log 2>&1; rc=$?
NEUUV=$(uv $DB); echo "$NEUUV" > /root/neu-uv
pruef "Upgrade läuft" "[ $rc = 0 ] && [ \"\$(version)\" = 0.99.0~ynh1 ] && bereit"
pruef "Kopie vor dem Upgrade" "ls $SN/vor-upgrade-$ALTV-*.sqlite >/dev/null 2>&1"
if [ "$ALTUV" != "$NEUUV" ]; then
pruef "Kopie vor der Schemaänderung $ALTUV→$NEUUV" "ls $SN/vor-schema-$ALTUV-$NEUUV-*.sqlite >/dev/null 2>&1"
fi
pruef "getText aller Pads unverändert" "texte_gleich"
pruef "Passwort-Pad weiter gesperrt" "gesperrt"
;;&
sicherung|alle)
echo "--- Probe 1: Sicherung, Purge, Wiederherstellung"
yunohost backup delete p1 >/dev/null 2>&1
yunohost backup create --apps nextpad --name p1 > /root/p1b.log 2>&1; rc=$?
pruef "Sicherung läuft" "[ $rc = 0 ]"
tar -tf /home/yunohost.backup/archives/p1.tar > /root/p1-inhalt.txt
pruef "Archiv enthält Schnappschuss, nicht die laufende Datei" "grep -q 'snapshots/sicherung.sqlite\$' /root/p1-inhalt.txt && ! grep -q 'data/nextpad.sqlite' /root/p1-inhalt.txt"
yunohost app remove nextpad --purge > /root/p1x.log 2>&1
pruef "Purge entfernt Daten" "[ ! -e $DB ]"
yunohost backup restore p1 --apps nextpad --force > /root/p1r.log 2>&1; rc=$?
pruef "Wiederherstellung läuft" "[ $rc = 0 ] && bereit"
pruef "getText aller Pads unverändert" "texte_gleich"
pruef "Passwort-Pad weiter gesperrt" "gesperrt"
pruef "API-Schlüssel wieder da" "[ \"\$(grep -v '^#' /home/yunohost.app/nextpad/secrets/api-keys.txt | head -n1)\" = \"$KEY\" ]"
;;&
last|alle)
echo "--- Probe 2: Sicherung unter Schreiblast"
curl -sk -H "$H" -X POST "$U/api/1.2/createPad?apikey=$KEY&padID=lastpad" -o /dev/null
( for i in $(seq 1 400); do curl -sk -H "$H" -X POST "$U/api/1.2/setText?apikey=$KEY&padID=lastpad" --data-urlencode "text=Last $i $(head -c 3000 /dev/urandom | base64 -w0)" -o /dev/null; done ) & L=$!
sleep 1
yunohost backup delete p2 >/dev/null 2>&1
yunohost backup create --apps nextpad --name p2 > /root/p2b.log 2>&1; rc=$?
lauf=$(kill -0 $L 2>/dev/null && echo ja || echo nein); wait $L
pruef "Sicherung läuft, Last lief währenddessen ($lauf)" "[ $rc = 0 ] && [ $lauf = ja ]"
rm -rf /root/p2x; mkdir -p /root/p2x
tar -xf /home/yunohost.backup/archives/p2.tar -C /root/p2x --wildcards '*sicherung.sqlite'
f=$(find /root/p2x -name sicherung.sqlite | head -1)
pruef "Schnappschuss besteht check (Exit 0)" "[ -n \"$f\" ] && $BIN check \"$f\" >/root/p2c.log 2>&1"
pruef "Schnappschuss enthält Lastpad" "[ \"\$(sqlite3 \"$f\" \"select count(*) from pads where id='lastpad'\")\" = 1 ]"
;;&
rueckfall|alle)
echo "--- Probe 4: erzwungen gescheitertes Upgrade, Rückfall auf den Schnappschuss"
NEUUV=$(cat /root/neu-uv)
pruef "Ausgang 0.99.0~ynh1, Schema $NEUUV" "[ \"\$(version)\" = 0.99.0~ynh1 ] && [ \"\$(uv $DB)\" = $NEUUV ]"
yunohost app upgrade nextpad -f /root/pkg-neu2 > /root/p4.log 2>&1; rc=$?
pruef "Upgrade scheitert" "[ $rc != 0 ] && grep -q 'Probe: Upgrade bricht ab' /root/p4.log"
pruef "YunoHost setzt 0.99.0~ynh1 zurück" "[ \"\$(version)\" = 0.99.0~ynh1 ] && bereit"
pruef "Schnappschuss vor dem Upgrade eingesetzt, Schema $NEUUV" "[ \"\$(uv $DB)\" = $NEUUV ]"
pruef "neuere Datenbank in archiv/" "ls $AR/neuer-als-programm-*.sqlite >/dev/null 2>&1"
pruef "getText aller Pads unverändert" "texte_gleich"
pruef "Passwort-Pad weiter gesperrt" "gesperrt"
;;&
ohnedaten|alle)
echo "--- Probe 5: Wiederherstellung ohne Daten bricht ab"
yunohost app setting nextpad do_not_backup_data -v 1
yunohost backup delete p5 >/dev/null 2>&1
yunohost backup create --apps nextpad --name p5 > /root/p5b.log 2>&1
pruef "Sicherung ohne Daten warnt" "grep -q 'KEINE Pads' /root/p5b.log"
yunohost app remove nextpad --purge > /root/p5x.log 2>&1
yunohost backup restore p5 --apps nextpad --force > /root/p5r.log 2>&1; rc=$?
pruef "Wiederherstellung bricht ab" "[ $rc != 0 ] && grep -q 'leerer Datenbank' /root/p5r.log"
pruef "keine leere Datenbank angelegt, App nicht installiert" "[ ! -e $DB ] && ! yunohost app list --output-as json | grep -q '\"id\": \"nextpad\"'"
yunohost backup restore p1 --apps nextpad --force > /root/p5z.log 2>&1
pruef "danach aus p1 wieder da" "bereit && texte_gleich && gesperrt"
;;
esac
echo; echo "$ok ok, $fehl fehlgeschlagen"
