#!/usr/bin/env bash
# Läuft im Container nach der Installation des alten Pakets: drei Pads, c mit Passwort, getText in /root/vorher/.
set -uo pipefail
U=https://127.0.0.1/np; H="Host: ynhprobe.test"
KEY=$(grep -v '^#' /home/yunohost.app/nextpad/secrets/api-keys.txt | head -n1)
echo "$KEY" > /root/key; chmod 600 /root/key
mkdir -p /root/vorher; rm -f /root/vorher/*
neu() { local jar=/root/jar-$1; rm -f $jar; curl -sk -H "$H" -c $jar -b $jar -o /dev/null -w "%{redirect_url}" $U/new | sed 's#.*/p/##' | tee /root/id-$1; curl -sk -H "$H" -c $jar -b $jar -o /dev/null $U/p/$(cat /root/id-$1); }
for n in a b c; do
  id=$(neu $n); echo "$id" > /root/pad-$n
  curl -sk -H "$H" -X POST "$U/api/1.2/setText?apikey=$KEY&padID=$id" --data-urlencode "text=Probe $n vom $(date +%T): Umlaute äöüß, Zeile 2" -o /root/set-$n.json
  echo "pad $n $id setText $(cat /root/set-$n.json)"
done
c=$(cat /root/pad-c)
curl -sk -H "$H" -b /root/jar-c -c /root/jar-c -H "Content-Type: application/json" -H "Origin: https://ynhprobe.test" -X POST "$U/p/$c/passwort" -d '{"passwort":"Probe-Kennwort-2026-xyz"}'; echo
for n in a b c; do id=$(cat /root/pad-$n); curl -sk -H "$H" "$U/api/1.2/getText?apikey=$KEY&padID=$id" > /root/vorher/$id.json; done
echo "ohne Kennwort auf c: $(curl -sk -H "$H" -o /dev/null -w %{http_code} $U/p/$c)"
sqlite3 /home/yunohost.app/nextpad/data/nextpad.sqlite "select count(*) from pads; pragma user_version;" 
ls /root/vorher
