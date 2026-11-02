#!/system/bin/sh
BASEDIR="$(dirname "$(readlink -f "$0")")"
. "$BASEDIR/pathinfo.sh"
. "$BASEDIR/libbattemp.sh"
DPID="$1"
SPOOFING=0
LASTW=""
ORIG=""
CHG_NOTED=0
wlog() {
    echo "$(date '+%m-%d %H:%M:%S') battery temp: $1" >>"$GAME_LOG"
}
bt_release() {
    local i cur real
    [ "$SPOOFING" = 1 ] || return 0
    SPOOFING=0
    i=0
    while [ $i -lt 3 ]; do
        sleep 1
        read -r cur 2>/dev/null <"$BT_NODE"
        if [ -n "$cur" ] && [ "$cur" != "$LASTW" ]; then
            wlog "real reading back ($cur)"
            return 0
        fi
        i=$((i + 1))
    done
    echo "-22" >"$BT_NODE" 2>/dev/null
    sleep 1
    read -r cur 2>/dev/null <"$BT_NODE"
    case "$cur" in
    "-22" | "")
        real="$(bt_zone_temp "$LASTW")"
        [ -n "$real" ] || real="$ORIG"
        if [ -n "$real" ]; then
            echo "$real" >"$BT_NODE" 2>/dev/null
            wlog "this kernel keeps written values, put back $real (stays until reboot or the next spoof)"
        else
            wlog "this kernel keeps written values and no real reading was found, reboot to see the real temperature"
        fi
        ;;
    *) wlog "real reading back ($cur)" ;;
    esac
}
finish() {
    bt_release
    rm -f "$BT_PIDF"
    exit 0
}
trap finish TERM INT HUP
echo "$$" >"$BT_PIDF"
read -r ORIG 2>/dev/null <"$BT_NODE"
while true; do
    [ -n "$DPID" ] && [ -d "/proc/$DPID" ] || break
    v=""
    read -r v 2>/dev/null <"$BT_VALF"
    case "$v" in "" | *[!0-9]*) break ;; esac
    [ "$v" -ge 100 ] && [ "$v" -le 400 ] || break
    if bt_charging; then
        if [ "$CHG_NOTED" = 0 ]; then
            CHG_NOTED=1
            wlog "paused while charging"
        fi
        bt_release
        sleep 1
        continue
    fi
    if [ "$CHG_NOTED" = 1 ]; then
        CHG_NOTED=0
        wlog "unplugged, spoofing again"
    fi
    if [ "$SPOOFING" = 0 ]; then
        read -r ORIG 2>/dev/null <"$BT_NODE"
        wlog "spoofing $((v / 10)) C (real reading was $ORIG)"
    elif [ "$v" != "$LASTW" ]; then
        wlog "now $((v / 10)) C"
    fi
    echo "$v" >"$BT_NODE" 2>/dev/null
    SPOOFING=1
    LASTW="$v"
    sleep 1
done
finish
