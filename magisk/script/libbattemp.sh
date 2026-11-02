#!/system/bin/sh
BT_NODE="/sys/class/power_supply/bms/temp"
BT_PIDF="$STATE_DIR/battemp.pid"
BT_VALF="$STATE_DIR/battemp_val"
bt_supported() {
    local m
    [ -f "$BT_NODE" ] || return 1
    m="$(stat -c %a "$BT_NODE" 2>/dev/null)"
    case "$m" in [2367]??) return 0 ;; esac
    return 1
}
bt_charging() {
    local s="" f
    for f in /sys/class/power_supply/battery/status /sys/class/power_supply/bms/status; do
        [ -f "$f" ] || continue
        read -r s 2>/dev/null <"$f"
        break
    done
    case "$s" in Charging | Full) return 0 ;; esac
    return 1
}
bt_zone_temp() {
    local z t v
    for z in /sys/class/thermal/thermal_zone*; do
        read -r t 2>/dev/null <"$z/type"
        case "$t" in battery | mtktsbattery | battery_temp | batt_therm | battery-therm | bat_therm) ;; *) continue ;; esac
        read -r v 2>/dev/null <"$z/temp"
        case "$v" in "" | *[!0-9-]*) continue ;; esac
        [ "$v" -gt 1000 ] && v=$((v / 100))
        [ "$v" = "$1" ] && continue
        [ "$v" -gt -200 ] && [ "$v" -lt 800 ] && { echo "$v"; return 0; }
    done
    return 1
}
bt_pid() {
    local p
    p="$(cat "$BT_PIDF" 2>/dev/null)"
    [ -n "$p" ] && [ -d "/proc/$p" ] && grep -q battemp_writer "/proc/$p/cmdline" 2>/dev/null && echo "$p"
}
BT_CUR=0
bt_set() {
    local c="$1"
    case "$c" in "" | *[!0-9]*) c=0 ;; esac
    if [ "$c" -ge 10 ] && [ "$c" -le 40 ] && bt_supported; then
        echo "$((c * 10))" >"$BT_VALF"
        if [ -z "$(bt_pid)" ]; then
            ASH_STANDALONE=1 "$BIN_PATH/busybox/busybox" sh "$SCRIPT_PATH/battemp_writer.sh" "$$" </dev/null >/dev/null 2>&1 &
        fi
        BT_CUR="$c"
    else
        bt_stop
    fi
}
bt_stop() {
    local p
    rm -f "$BT_VALF"
    p="$(bt_pid)"
    [ -n "$p" ] && kill -TERM "$p" 2>/dev/null
    BT_CUR=0
}
bt_desc() {
    if [ "$BT_CUR" -gt 0 ] 2>/dev/null; then echo "spoofed to $BT_CUR C"; else echo "real"; fi
}
