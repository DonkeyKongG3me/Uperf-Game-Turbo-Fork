#!/system/bin/sh

# $1:preset -> default thermal flag
default_h() {
    case "$1" in performance | fast) echo 1 ;; *) echo 0 ;; esac
}

valid_preset() {
    case "$1" in powersave | balance | performance | fast) return 0 ;; esac
    return 1
}

clean_apps() {
    local w pkg rest pre fl out=""
    for w in $1; do
        pkg="${w%%:*}"
        rest="${w#*:}"
        pre="${rest%%:*}"
        fl=""
        [ "$rest" != "$pre" ] && fl="${rest#*:}"
        case "$pkg" in "" | *[!A-Za-z0-9._]*) continue ;; esac
        valid_preset "$pre" || continue
        case "$fl" in [01][01]) ;; *) fl="1$(default_h "$pre")" ;; esac
        case " $out " in *" $pkg:"*) continue ;; esac
        out="$out $pkg:$pre:$fl"
    done
    echo "${out# }"
}

write_conf() {
    mkdir -p "${CONF_FILE%/*}"
    {
        echo "# Uperf Game Turbo (per-app) settings, written by the WebUI."
        echo "FORMAT=2"
        echo "# Boosted apps as package:preset:TH"
        echo "#   preset: powersave = Efficiency, balance = Balanced, performance = Rapid, fast = Extreme"
        echo "#   T = 1 uses uperf's touch booster, H = 1 switches off thermal limits"
        echo "APPS=$1"
        echo "# seconds a boosted app may sit in the background before stock is restored"
        echo "EXIT_DELAY=$2"
        echo "# seconds between checks while no boosted app is open"
        echo "POLL_IDLE=$3"
    } >"$CONF_FILE.tmp" && mv -f "$CONF_FILE.tmp" "$CONF_FILE"
}
