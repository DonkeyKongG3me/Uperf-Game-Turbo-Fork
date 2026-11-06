#!/system/bin/sh
default_h() {
    case "$1" in performance | fast) echo 1 ;; *) echo 0 ;; esac
}
valid_btfield() {
    local n="${1#g}"
    n="${n%c}"
    case "$n" in "" | *[!0-9]*) return 1 ;; esac
    [ "$n" -eq 0 ] || { [ "$n" -ge 10 ] && [ "$n" -le 40 ]; }
}
valid_battemp() {
    case "$1" in "" | *[!0-9]*) return 1 ;; esac
    [ "$1" -eq 0 ] || { [ "$1" -ge 10 ] && [ "$1" -le 40 ]; }
}
valid_preset() {
    case "$1" in powersave | balance | performance | fast) return 0 ;; esac
    return 1
}
clean_apps() {
    local w pkg rest pre fl bt out=""
    for w in $1; do
        pkg="${w%%:*}"
        rest="${w#*:}"
        pre="${rest%%:*}"
        fl=""
        bt=""
        [ "$rest" != "$pre" ] && fl="${rest#*:}"
        case "$fl" in *:*) bt="${fl#*:}"; fl="${fl%%:*}" ;; esac
        valid_btfield "$bt" || bt=""
        case "$pkg" in "" | *[!A-Za-z0-9._]*) continue ;; esac
        valid_preset "$pre" || continue
        case "$fl" in [01][01][01]) ;; [01][01]) fl="${fl}0" ;; *) fl="1$(default_h "$pre")0" ;; esac
        case " $out " in *" $pkg:"*) continue ;; esac
        out="$out $pkg:$pre:$fl${bt:+:$bt}"
    done
    echo "${out# }"
}
write_conf() {
    mkdir -p "${CONF_FILE%/*}"
    {
        echo "# Uperf Game Turbo (per-app) settings, written by the WebUI."
        echo "FORMAT=2"
        echo "# Boosted apps as package:preset:THB"
        echo "#   preset: powersave = Efficiency, balance = Balanced, performance = Rapid, fast = Extreme"
        echo "#   T = 1 uses uperf's touch booster, H = 1 switches off thermal throttling"
        echo "#   B = 1 lifts the battery limits (MediaTek and Pixel)"
        echo "#   optional 4th field: own battery temperature in degC (0 = none), gN = use BAT_TEMP,"
        echo "#   a trailing c (25c, g25c) = keep spoofing while charging"
        echo "APPS=$1"
        echo "# seconds a boosted app may sit in the background before stock is restored"
        echo "EXIT_DELAY=$2"
        echo "# seconds between checks while no boosted app is open"
        echo "POLL_IDLE=$3"
        echo "# battery temperature (degC) written to the auto-detected battery temp node (under /sys/class/power_supply) every second"
        echo "# while a boosted app is open. 0 = Default (no spoofing), 10-40 otherwise"
        echo "BAT_TEMP=${4:-0}"
        echo "# 1 = the global battery temperature is switched on (apps with their own value ignore it)"
        echo "BAT_TEMP_ON=${5:-0}"
        echo "# 1 = keep spoofing the global battery temperature while the phone is charging (unsafe)"
        echo "BAT_TEMP_CHG=${6:-0}"
    } >"$CONF_FILE.tmp" && mv -f "$CONF_FILE.tmp" "$CONF_FILE"
}
