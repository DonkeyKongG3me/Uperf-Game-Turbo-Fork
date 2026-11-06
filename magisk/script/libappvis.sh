#!/system/bin/sh
APPVIS_HOSTS="me.weishu.kernelsu me.weishu.kernelsu.pr com.rifsxd.ksunext com.sukisu.ultra com.sukisu.ultra.pr me.bmax.apatch com.dergoogler.mmrl com.dergoogler.mmrl.wx io.github.a13e300.ksuwebui"
APPVIS_PERM="com.android.permission.GET_INSTALLED_APPS"
APPVIS_QAP="android.permission.QUERY_ALL_PACKAGES"
APPVIS_MIOP="10022"
appvis_is_mi() {
    [ -n "$(getprop ro.mi.os.version.name)" ] || [ -n "$(getprop ro.miui.ui.version.name)" ] || [ -n "$(getprop ro.miui.ui.version.code)" ]
}
appvis_holds() {
    dumpsys package "$1" 2>/dev/null | grep -q "$APPVIS_QAP: granted=true"
}
appvis_users() {
    local u found=""
    for u in /data/user/*; do
        u="${u##*/}"
        case "$u" in "" | *[!0-9]*) continue ;; esac
        found="$found $u"
    done
    [ -n "$found" ] && echo "$found" || echo 0
}
appvis_caller() {
    local pid="$$" n=0 k v uid pp name
    while [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null && [ "$n" -lt 16 ]; do
        uid="" pp=""
        while read -r k v _; do
            case "$k" in
            Uid:) uid="$v" ;;
            PPid:) pp="$v" ;;
            esac
        done <"/proc/$pid/status" 2>/dev/null
        if [ -n "$uid" ] && [ "$uid" -ge 10000 ] 2>/dev/null; then
            name="$(tr '\0' '\n' <"/proc/$pid/cmdline" 2>/dev/null | head -n 1)"
            name="${name%%:*}"
            case "$name" in *.*) echo "$name"; return 0 ;; esac
            return 1
        fi
        pid="$pp"
        n=$((n + 1))
    done
    return 1
}
appvis_one() {
    local p="$1" u ok=1
    pm path "$p" >/dev/null 2>&1 || return 2
    if appvis_is_mi; then
        for u in $(appvis_users); do
            appops set --user "$u" "$p" "$APPVIS_MIOP" allow >/dev/null 2>&1 ||
                appops set "$p" "$APPVIS_MIOP" allow >/dev/null 2>&1
        done
        appops get "$p" "$APPVIS_MIOP" 2>/dev/null | grep -qi "allow" && ok=0
    fi
    for u in $(appvis_users); do
        pm grant --user "$u" "$p" "$APPVIS_PERM" >/dev/null 2>&1 && ok=0
    done
    if ! appvis_is_mi; then
        for u in $(appvis_users); do
            pm grant --user "$u" "$p" "$APPVIS_QAP" >/dev/null 2>&1
        done
        appvis_holds "$p" && ok=0
    fi
    return "$ok"
}
appvis_grant() {
    local list="$APPVIS_HOSTS" self p seen=" "
    if [ "$1" = "self" ]; then
        self="$(appvis_caller)"
        [ -n "$self" ] && list="$self $list"
    fi
    for p in $list; do
        case "$seen" in *" $p "*) continue ;; esac
        seen="$seen$p "
        appvis_one "$p"
        case "$?" in
        0) echo "ok:$p" ;;
        1) echo "na:$p" ;;
        esac
    done
    appvis_is_mi && echo "rom:mi" || echo "rom:aosp"
}
