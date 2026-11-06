#!/system/bin/sh
BASEDIR="$(dirname "$(readlink -f "$0")")"
. "$BASEDIR/pathinfo.sh"
. "$BASEDIR/libbattemp.sh"
DPID="$1"
SPOOFING=0
LASTW=""
ORIG=""
CHG_NOTED=0
MODE=""
wlog() {
    echo "$(date '+%m-%d %H:%M:%S') battery temp: $1" >>"$GAME_LOG"
}
bt_clean_mount() {
    local i=0
    while bt_mounted && [ $i -lt 5 ]; do
        umount "$BT_REAL" 2>/dev/null || umount -l "$BT_REAL" 2>/dev/null
        i=$((i + 1))
    done
}
bt_mount_fake() {
    local ctx
    echo "$1" >"$BT_FAKE" 2>/dev/null || return 1
    chmod 0644 "$BT_FAKE" 2>/dev/null
    ctx="$(/system/bin/stat -c %C "$BT_REAL" 2>/dev/null)"
    case "$ctx" in u:*) ;; *) ctx="u:object_r:sysfs_batteryinfo:s0" ;; esac
    /system/bin/chcon "$ctx" "$BT_FAKE" 2>/dev/null
    mount -o bind "$BT_FAKE" "$BT_REAL" 2>/dev/null || return 1
    bt_mounted
}
bt_apply() {
    if [ "$MODE" = mount ]; then
        echo "$1" >"$BT_FAKE" 2>/dev/null
        bt_mounted || bt_mount_fake "$1"
    else
        echo "$1" >"$BT_NODE" 2>/dev/null
    fi
}
bt_release() {
    local i cur real
    [ "$SPOOFING" = 1 ] || return 0
    SPOOFING=0
    if [ "$MODE" = mount ]; then
        bt_clean_mount
        read -r cur 2>/dev/null <"$BT_NODE"
        if bt_mounted; then
            wlog "could not remove the fake reading, it goes away on reboot"
        else
            wlog "real reading back ($cur)"
        fi
        return 0
    fi
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
    [ "$MODE" = mount ] && bt_clean_mount
    rm -f "$BT_PIDF"
    exit 0
}
trap finish TERM INT HUP
echo "$$" >"$BT_PIDF"
bt_clean_mount
MODE="$(bt_mode)"
if [ "$MODE" = mount ]; then
    wlog "node $BT_REAL is read-only, using a bind mounted fake value (apps can take up to a minute to notice a change)"
    [ "$(readlink /proc/1/ns/mnt 2>/dev/null)" = "$(readlink /proc/self/ns/mnt 2>/dev/null)" ] ||
        wlog "warning: not in the global mount namespace, other apps may not see the fake value (restart the phone or the watcher)"
fi
read -r ORIG 2>/dev/null <"$BT_NODE"
while true; do
    [ -n "$DPID" ] && [ -d "/proc/$DPID" ] || break
    v=""
    read -r v 2>/dev/null <"$BT_VALF"
    case "$v" in "" | *[!0-9]*) break ;; esac
    [ "$v" -ge 100 ] && [ "$v" -le 400 ] || break
    if bt_charging && ! bt_chg_allowed; then
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
        wlog "spoofing again"
    fi
    if [ "$SPOOFING" = 0 ]; then
        read -r ORIG 2>/dev/null <"$BT_NODE"
        wlog "spoofing $((v / 10)) C (real reading was $ORIG)"
    elif [ "$v" != "$LASTW" ]; then
        wlog "now $((v / 10)) C"
    fi
    if ! bt_apply "$v"; then
        wlog "could not bind mount over $BT_REAL (SELinux or mount denied), spoof not applied"
        break
    fi
    SPOOFING=1
    LASTW="$v"
    sleep 1
done
finish
