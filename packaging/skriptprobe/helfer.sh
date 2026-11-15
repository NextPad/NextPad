# Nachbildung der YunoHost-Helfer 2.1, nur so weit, wie die NextPad-Skripte sie nutzen.
# ynh_backup/ynh_restore folgen den Regeln aus /usr/share/yunohost/helpers.v2.1.d/backup.
ynh_print_info() { echo "INFO: $*"; }
ynh_print_warn() { echo "WARN: $*"; }
ynh_die() { echo "DIE: $*"; exit 1; }
ynh_script_progression() { echo "== $*"; }
ynh_app_setting_get() { [ "$1" = "--key=do_not_backup_data" ] && echo "${DO_NOT_BACKUP_DATA:-}"; return 0; }
ynh_app_setting_set_default() { :; }
ynh_exec_as_app() { "$@"; }
ynh_systemctl() { echo "systemctl $*"; }
ynh_setup_source() { install -m 750 "$NEU_BIN" "$install_dir/nextpad"; }
ynh_config_add_nginx() { :; }
ynh_config_add_systemd() { :; }
ynh_config_add() {
    local a d=""
    for a in "$@"; do case "$a" in --destination=*) d="${a#--destination=}" ;; esac; done
    if [ -n "$d" ]; then echo "erzeugt" > "$d"; fi
}
ynh_string_random() { echo zufall; }
yunohost() { :; }
systemctl() { :; }
chown() { :; }
install() {
    local a=()
    while (($#)); do case "$1" in -o|-g) shift 2 ;; *) a+=("$1"); shift ;; esac; done
    command install "${a[@]}"
}
ist_daten() { [[ "$1" =~ ^$data_dir ]]; }
ynh_backup() {
    local t="$1"
    case "$t" in /etc/*) return 0 ;; esac
    if ist_daten "$t" && { [ "${DO_NOT_BACKUP_DATA:-0}" = "1" ] || [ "${BACKUP_CORE_ONLY:-0}" -eq 1 ]; }; then
        echo "INFO: $t nicht gesichert (Daten)"; return 0
    fi
    [ -e "$t" ] || ynh_die "ynh_backup: $t fehlt"
    mkdir -p "$ARCHIV$(dirname "$t")"; cp -a "$t" "$ARCHIV$t"
}
ynh_restore() {
    local t="$1"
    case "$t" in /etc/*) return 0 ;; esac
    if [ ! -e "$ARCHIV$t" ]; then
        if ist_daten "$t"; then echo "INFO: $t nicht im Archiv, übersprungen"; return 0; fi
        ynh_die "ynh_restore: $t nicht im Archiv"
    fi
    if [ -e "$t" ]; then mkdir -p "$CACHE"; mv "$t" "$CACHE/$(basename "$t").backup.$RANDOM"; fi
    mkdir -p "$(dirname "$t")"; cp -a "$ARCHIV$t" "$t"
}
