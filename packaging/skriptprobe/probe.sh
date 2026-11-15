#!/usr/bin/env bash
# Probelauf der Paket-Skripte gegen nachgebildete Helfer. Ersetzt nicht die Probe auf einer echten YunoHost.
set -uo pipefail
# Aufruf: bash packaging/skriptprobe/probe.sh <neues-programm> <programm-bis-0.21>
W=$(cd "$(dirname "$0")/../.." && pwd)
NEU=$(realpath "${1:?neues Programm fehlt}")
ALT=$(realpath "${2:?Programm bis 0.21 fehlt}")
R=$(mktemp -d /tmp/ynhprobe.XXXX)
H=$R/helfer.sh
cp "$W/packaging/skriptprobe/helfer.sh" "$H"
mkdir -p "$R/pkg/settings/scripts" "$R/pkg/scripts"
cp "$W/packaging/nextpad_ynh/scripts/_common.sh" "$R/pkg/settings/scripts/"
cp "$W/packaging/nextpad_ynh/scripts/_common.sh" "$R/pkg/scripts/"
for s in backup restore upgrade; do sed "s#/usr/share/yunohost/helpers#$H#" "$W/packaging/nextpad_ynh/scripts/$s" > "$R/pkg/scripts/$s"; done

export app=$(whoami) domain=x path=/np
export install_dir=$R/install data_dir=$R/data
export ARCHIV=$R/archiv-a CACHE=$R/cache NEU_BIN=$NEU
lauf() { (cd "$R/pkg/scripts" && bash -eu -o pipefail "./$1") > "$R/log-$2.txt" 2>&1; echo $?; }
ok=0; fehl=0
pruef() { if eval "$2"; then echo "ok    $1"; ok=$((ok+1)); else echo "FEHL  $1"; fehl=$((fehl+1)); echo "      Log: $3"; tail -5 "$3" | sed 's/^/      /'; fi; }
neu_db() {
    rm -rf "$data_dir" "$install_dir"; mkdir -p "$data_dir/data" "$data_dir/secrets" "$data_dir/theme" "$install_dir"
    install -m 750 "$1" "$install_dir/nextpad"; echo "NEXTPAD_DATA=x" > "$install_dir/nextpad.env"; echo "schluessel" > "$data_dir/secrets/api-keys.txt"
    python3 - "$data_dir/data/nextpad.sqlite" "$2" <<'EOF'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1]); c.execute("PRAGMA journal_mode=WAL")
c.execute("CREATE TABLE IF NOT EXISTS pads (id TEXT PRIMARY KEY, created INTEGER)"); c.execute("INSERT INTO pads VALUES ('probe-pad', 1)")
c.execute(f"PRAGMA user_version={int(sys.argv[2])}"); c.commit()
EOF
}
pads() { python3 -c "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('SELECT COUNT(*) FROM pads').fetchone()[0])" "$1" 2>/dev/null; }
uv() { python3 -c "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('PRAGMA user_version').fetchone()[0])" "$1" 2>/dev/null; }
SV=$(grep -o 'SCHEMA_VERSION: i64 = [0-9]*' "$W/server/src/store.rs" | grep -o '[0-9]*$')

echo "--- 1 volle Sicherung, Purge, Wiederherstellung"
neu_db "$NEU" "$SV"; rm -rf "$ARCHIV"
rc=$(lauf backup 1b)
pruef "Sicherung läuft" "[ $rc = 0 ]" "$R/log-1b.txt"
pruef "Schnappschuss im Archiv" "[ -s $ARCHIV$data_dir/data/snapshots/sicherung.sqlite ]" "$R/log-1b.txt"
pruef "laufende Datenbank nicht im Archiv" "[ ! -e $ARCHIV$data_dir/data/nextpad.sqlite ]" "$R/log-1b.txt"
rm -rf "$data_dir" "$install_dir"
rc=$(lauf restore 1r)
pruef "Wiederherstellung läuft" "[ $rc = 0 ]" "$R/log-1r.txt"
pruef "Pad wieder da" "[ \"\$(pads $data_dir/data/nextpad.sqlite)\" = 1 ]" "$R/log-1r.txt"
pruef "Schlüssel wieder da" "[ -s $data_dir/secrets/api-keys.txt ]" "$R/log-1r.txt"

echo "--- 2 Wiederherstellung über vorhandene Datenbank legt sie beiseite"
python3 -c "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute(\"INSERT INTO pads VALUES ('neu',2)\"); c.commit()" "$data_dir/data/nextpad.sqlite"
rc=$(lauf restore 2r)
pruef "läuft" "[ $rc = 0 ]" "$R/log-2r.txt"
pruef "Stand aus dem Archiv (1 Pad)" "[ \"\$(pads $data_dir/data/nextpad.sqlite)\" = 1 ]" "$R/log-2r.txt"
pruef "alte Datenbank in archiv/" "ls $data_dir/archiv/vor-restore-*.sqlite >/dev/null 2>&1" "$R/log-2r.txt"

echo "--- 3 Sicherung vor Upgrade (BACKUP_CORE_ONLY) und Rückfall mit passender Datenbank"
neu_db "$NEU" "$SV"; rm -rf "$ARCHIV"
rc=$(BACKUP_CORE_ONLY=1 lauf backup 3b)
pruef "läuft" "[ $rc = 0 ]" "$R/log-3b.txt"
pruef "kein Schnappschuss" "[ ! -e $ARCHIV$data_dir/data/snapshots/sicherung.sqlite ]" "$R/log-3b.txt"
rc=$(lauf restore 3r)
pruef "Rückfall läuft, Datenbank bleibt" "[ $rc = 0 ] && [ \"\$(pads $data_dir/data/nextpad.sqlite)\" = 1 ]" "$R/log-3r.txt"

echo "--- 4 Rückfall mit Datenbank neuer als das Programm"
mkdir -p "$data_dir/data/snapshots"; cp "$data_dir/data/nextpad.sqlite" "$data_dir/data/snapshots/vor-upgrade-0.21.0~ynh1-2026-11-15-100000.sqlite"
python3 -c "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute(\"INSERT INTO pads VALUES ('nach-upgrade',3)\"); c.execute('PRAGMA user_version=$((SV+1))'); c.commit()" "$data_dir/data/nextpad.sqlite"
rc=$(lauf restore 4r)
pruef "läuft" "[ $rc = 0 ]" "$R/log-4r.txt"
pruef "Stand vor dem Upgrade eingesetzt" "[ \"\$(uv $data_dir/data/nextpad.sqlite)\" = $SV ] && [ \"\$(pads $data_dir/data/nextpad.sqlite)\" = 1 ]" "$R/log-4r.txt"
pruef "neuere Datenbank in archiv/" "ls $data_dir/archiv/neuer-als-programm-*.sqlite >/dev/null 2>&1" "$R/log-4r.txt"

echo "--- 5 Archiv ohne Schnappschuss und ohne Datenbank"
rm -rf "$data_dir"
rc=$(lauf restore 5r)
pruef "bricht ab" "[ $rc != 0 ] && grep -q 'leerer Datenbank' $R/log-5r.txt" "$R/log-5r.txt"
pruef "legt keine Datenbank an" "[ ! -e $data_dir/data/nextpad.sqlite ]" "$R/log-5r.txt"

echo "--- 6 do_not_backup_data"
neu_db "$NEU" "$SV"; rm -rf "$ARCHIV"
rc=$(DO_NOT_BACKUP_DATA=1 lauf backup 6b)
pruef "läuft mit Warnung" "[ $rc = 0 ] && grep -q 'KEINE Pads' $R/log-6b.txt" "$R/log-6b.txt"

echo "--- 7 Upgrade vom alten Programm (ohne snapshot) mit Hand-Sicherungen"
neu_db "$ALT" 0; touch "$data_dir/data/nextpad.sqlite.vor-0.20.0-2026-11-04"
for i in 1 2 3; do mkdir -p "$data_dir/data/snapshots"; cp "$data_dir/data/nextpad.sqlite" "$data_dir/data/snapshots/vor-upgrade-alt$i-2026-11-0$i-000000.sqlite"; touch -d "2026-11-0$i" "$data_dir/data/snapshots/vor-upgrade-alt$i-2026-11-0$i-000000.sqlite"; done
rc=$(YNH_APP_CURRENT_VERSION=0.21.0~ynh1 lauf upgrade 7u)
pruef "läuft" "[ $rc = 0 ]" "$R/log-7u.txt"
pruef "Kopie vom alten Programm" "grep -q 'altes Programm ohne snapshot' $R/log-7u.txt && ls $data_dir/data/snapshots/vor-upgrade-0.21.0~ynh1-*.sqlite >/dev/null" "$R/log-7u.txt"
pruef "Hand-Sicherung in archiv/" "[ -e $data_dir/archiv/nextpad.sqlite.vor-0.20.0-2026-11-04 ] && [ ! -e $data_dir/data/nextpad.sqlite.vor-0.20.0-2026-11-04 ]" "$R/log-7u.txt"
pruef "zwei jüngste vor-upgrade bleiben" "[ \$(ls $data_dir/data/snapshots/vor-upgrade-*.sqlite | wc -l) = 2 ] && grep -q 'Älterer Schnappschuss gelöscht' $R/log-7u.txt" "$R/log-7u.txt"
pruef "neues Programm installiert" "grep -q -a 'Aufruf: nextpad snapshot' $install_dir/nextpad" "$R/log-7u.txt"

echo "--- 8 Upgrade vom neuen Programm"
rc=$(YNH_APP_CURRENT_VERSION=0.22.0~ynh1 lauf upgrade 8u)
pruef "Schnappschuss über snapshot" "[ $rc = 0 ] && ls $data_dir/data/snapshots/vor-upgrade-0.22.0~ynh1-*.sqlite >/dev/null && ! grep -q 'altes Programm' $R/log-8u.txt" "$R/log-8u.txt"
pruef "Schnappschuss besteht check" "\"$NEU\" check \$(ls -1t $data_dir/data/snapshots/vor-upgrade-0.22.0~ynh1-*.sqlite | head -1) >/dev/null" "$R/log-8u.txt"

echo; echo "$ok ok, $fehl fehlgeschlagen (Logs in $R)"
[ "$fehl" = 0 ] && rm -rf "$R"
