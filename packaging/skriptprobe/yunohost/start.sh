#!/usr/bin/env bash
# Wegwerf-YunoHost in einem podman-Container und fünf Proben für Sicherung, Wiederherstellung und Upgrade.
# Aufruf: bash packaging/skriptprobe/yunohost/start.sh <neues-programm> <altes-paket-verzeichnis> <altes-programm>
#   <neues-programm>   Release-Bau für Debian 12 (cargo build --release in rust:1-bookworm)
#   <altes-paket-…>    packaging/nextpad_ynh eines früheren Stands, z. B. aus git archive
#   <altes-programm>   das Release-Asset, auf das dessen Manifest zeigt (Prüfsumme muss passen)
# Der Container heißt ynh-probe und bleibt stehen; entfernen mit: podman rm -f ynh-probe
# Läuft rootless. Nicht auf einem Server mit echten Daten ausführen.
set -euo pipefail
HIER=$(cd "$(dirname "$0")" && pwd); REPO=$(cd "$HIER/../../.." && pwd)
NEU=$(realpath "${1:?neues Programm fehlt}"); ALTPKG=$(realpath "${2:?altes Paket fehlt}"); ALT=$(realpath "${3:?altes Programm fehlt}")
T=$(mktemp -d)
cat > "$T/Containerfile" <<'CF'
FROM docker.io/library/debian:bookworm
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends systemd systemd-sysv dbus curl ca-certificates procps sqlite3 python3 && apt-get clean
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
CF
podman build -q -t ynh-probe-basis "$T" >/dev/null
podman run -d --name ynh-probe --hostname ynhprobe.test --systemd=always --cap-add SYS_ADMIN,NET_ADMIN,NET_RAW ynh-probe-basis >/dev/null
sleep 5
c() { podman exec ynh-probe bash -c "$1"; }

# podman bindet resolv.conf ein; das Paket resolvconf will sie ersetzen und bricht sonst ab.
# Nach der Installation zeigt sie auf dnsmasq, das im Container nicht startet: deshalb danach wieder die Datei von podman.
c 'cp /etc/resolv.conf /root/resolv.podman && umount /etc/resolv.conf && cp /root/resolv.podman /etc/resolv.conf'
c 'curl -fsSL https://install.yunohost.org -o /root/install.sh && bash /root/install.sh -a > /root/install.log 2>&1' || { echo "YunoHost-Installation gescheitert, siehe /root/install.log im Container"; exit 1; }
c 'rm -f /etc/resolv.conf && cp /root/resolv.podman /etc/resolv.conf'
c 'umask 077; tr -dc A-Za-z0-9 < /dev/urandom | head -c 24 > /root/pw; yunohost tools postinstall --domain ynhprobe.test --username probe --fullname "Probe Person" --password "$(cat /root/pw)" --ignore-dyndns --force-diskspace > /root/postinstall.log 2>&1'
# Ohne rsyslog fehlen die Logdateien, und fail2ban startet nicht; YunoHost verweigert dann jede App-Aktion.
c 'touch /var/log/mail.log /var/log/auth.log && systemctl restart fail2ban'

# Beide Programme kommen über einen lokalen Webserver, so ist kein Release auf GitHub nötig
SUM=$(sha256sum "$NEU" | cut -d' ' -f1)
for v in 1 2; do
  P=$T/pkg-neu$([ $v = 2 ] && echo 2 || true); cp -r "$REPO/packaging/nextpad_ynh" "$P"
  python3 - "$P/manifest.toml" "$v" "$SUM" <<'PY'
import sys, re, pathlib
p = pathlib.Path(sys.argv[1]); t = p.read_text()
t, a = re.subn(r'^version = "[^"]+"', f'version = "0.99.0~ynh{sys.argv[2]}"', t, count=1, flags=re.M)
t, b = re.subn(r'(\[resources\.sources\.main\]\s*\n\s*url = )"[^"]+"', r'\1"http://127.0.0.1:8099/nextpad"', t)
t, s = re.subn(r'(\[resources\.sources\.main\][^\[]*?sha256 = )"[0-9a-f]+"', rf'\1"{sys.argv[3]}"', t, flags=re.S)
assert (a, b, s) == (1, 1, 1), (a, b, s)
p.write_text(t)
PY
done
printf '\n# Nur für die Probe: das neue Programm hätte migriert, dann scheitert das Upgrade\nsqlite3 "$data_dir/data/nextpad.sqlite" "PRAGMA user_version=99;"\nynh_die "Probe: Upgrade bricht ab"\n' >> "$T/pkg-neu2/scripts/upgrade"
ALTSUM=$(sed -n '/\[resources.sources.main\]/,/sha256/p' "$ALTPKG/manifest.toml" | grep -o '[0-9a-f]\{64\}')
[ "$(sha256sum "$ALT" | cut -d' ' -f1)" = "$ALTSUM" ] || { echo "Prüfsumme des alten Programms passt nicht zum alten Manifest"; exit 1; }
cp -r "$ALTPKG" "$T/pkg-alt"
sed -i 's#^\(\s*url = \)"https://github.com/[^"]*"#\1"http://127.0.0.1:8099/alt"#' "$T/pkg-alt/manifest.toml"
c 'mkdir -p /root/bin'
podman cp "$NEU" ynh-probe:/root/bin/nextpad; podman cp "$ALT" ynh-probe:/root/bin/alt
for p in pkg-alt pkg-neu pkg-neu2; do podman cp "$T/$p" ynh-probe:/root/$p; done
podman cp "$HIER/daten.sh" ynh-probe:/root/daten.sh; podman cp "$HIER/proben.sh" ynh-probe:/root/proben.sh
rm -rf "$T"

c 'systemd-run --quiet --unit probe-http --working-directory=/root/bin python3 -m http.server 8099 --bind 127.0.0.1; sleep 1
   yunohost app install /root/pkg-alt --force --args "domain=ynhprobe.test&path=/np&init_main_permission=visitors&theme=nextpad&allow_free_pads=1&addon_ideen=1&addon_quiz=1&addon_zeichenbrett=1" > /root/inst-alt.log 2>&1'
c 'bash /root/daten.sh'
c 'bash /root/proben.sh alle'
