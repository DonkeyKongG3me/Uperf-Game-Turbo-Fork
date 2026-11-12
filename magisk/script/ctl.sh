#!/system/bin/sh
BASEDIR="$(dirname "$(readlink -f "$0")")"
. "$BASEDIR/pathinfo.sh"
. "$BASEDIR/libconf.sh"
. "$BASEDIR/libsysinfo.sh"
. "$BASEDIR/libappvis.sh"
. "$BASEDIR/libbattemp.sh"
PIDFILE="$STATE_DIR/daemon.pid"
BASELINE="$STATE_DIR/baseline.list"
BB="$BIN_PATH/busybox/busybox"
RS="$(printf '\036')"
UI_DIR="/data/adb/uperf_ui"
UI_FILE="$UI_DIR/ui.json"
cur_preset() {
    local p=""
    [ -s "$STATE_DIR/preset" ] && read -r p <"$STATE_DIR/preset"
    [ -n "$p" ] || read -r p 2>/dev/null <"$USER_PATH_RAW/cur_powermode.txt"
    echo "$p"
}
daemon_pid() {
    local p
    p="$(cat "$PIDFILE" 2>/dev/null)"
    [ -n "$p" ] && [ -d "/proc/$p" ] && grep -q boost_daemon "/proc/$p/cmdline" 2>/dev/null && echo "$p"
}
do_stop() {
    local p i
    p="$(daemon_pid)"
    [ -n "$p" ] || return 0
    kill -TERM "$p"
    for i in $(seq 1 40); do
        [ -d "/proc/$p" ] || return 0
        sleep 0.5
    done
    echo "daemon did not exit, killing it"
    kill -9 "$p" 2>/dev/null
}
do_start() {
    [ -n "$(daemon_pid)" ] && return 0
    ASH_STANDALONE=1 "$BB" setsid nohup "$BB" sh "$SCRIPT_PATH/boost_daemon.sh" </dev/null >/dev/null 2>&1 &
    sleep 1
}
do_status() {
    local p a
    p="$(daemon_pid)"
    echo "Uperf Game Turbo (per-app)"
    if [ -n "$p" ]; then echo "watcher : running (pid $p)"; else echo "watcher : NOT running"; fi
    if [ -f "$STATE_DIR/active" ]; then
        a="$(cat "$STATE_DIR/active")"
        case "$a" in
        "dev @device") echo "state   : BOOSTED device-wide (This Device)" ;;
        "scr @screenoff") echo "state   : SCREEN OFF mode ($(cur_preset))" ;;
        "wait "*) echo "state   : BOOSTED for ${a#* } (launched from the settings, waiting for it to open)" ;;
        *) echo "state   : BOOSTED for ${a#* } (pid ${a%% *})" ;;
        esac
    else
        echo "state   : stock (no boosted app on screen)"
    fi
    if [ -s "$BASELINE" ]; then
        echo "baseline: $(wc -l <"$BASELINE") stock values recorded at boot"
    else
        echo "baseline: not recorded yet"
    fi
    a="$(pidof uperf 2>/dev/null)"
    echo "uperf   : ${a:-not running}"
    if ! bt_supported; then
        echo "bat temp: not supported (no writable node and no root mount, checked $BT_NODE)"
    elif [ -n "$(bt_pid)" ]; then
        echo "bat temp: spoofing $(($(cat "$BT_VALF" 2>/dev/null || echo 0) / 10)) C ($(bt_mode)), node reads $(cat "$BT_NODE" 2>/dev/null)$(bt_charging && { bt_chg_allowed && echo ', spoofing while charging' || echo ', paused while charging'; })"
    else
        echo "bat temp: real ($(cat "$BT_NODE" 2>/dev/null), will use $(bt_mode) mode on $BT_NODE)"
    fi
    echo "settings: $USER_PATH/boost.conf"
    echo "----- recent events -----"
    tail -n 12 "$GAME_LOG" 2>/dev/null
}
show() {
    local t="$1" f v
    shift
    echo "## $t"
    for f in "$@"; do
        [ -f "$f" ] || continue
        v="$(head -c 300 "$f" 2>/dev/null | tr '\n' ' ')"
        echo "$(stat -c '%a %U' "$f" 2>/dev/null) $f = $v"
    done
    echo
}
do_dump() {
    local out="$USER_PATH/state_dump.txt" p
    {
        echo "# state dump $(date '+%Y-%m-%d %H:%M:%S'), uptime $(cut -d' ' -f1 /proc/uptime)s"
        echo "# $(getprop ro.product.model) / $(getprop ro.board.platform) / Android $(getprop ro.build.version.release)"
        do_status
        echo
        echo "## screen probe (fast unlock detection)"
        cat "$STATE_DIR/probe.txt" 2>/dev/null || echo "not armed yet (arms at the first Screen Off session)"
        echo "candidates now:"
        while read -r p; do
            echo "  $p = $(cat "$p" 2>/dev/null)"
        done <"$STATE_DIR/probe_cands" 2>/dev/null
        [ -s "$STATE_DIR/probe_miss" ] && echo "missed unlocks this boot (2 = not used again): $(sort "$STATE_DIR/probe_miss" | uniq -c | awk '{ printf "%s x%s  ", $2, $1 }')"
        echo
        show "cpu online" /sys/devices/system/cpu/cpu[0-9]*/online
        for p in /sys/devices/system/cpu/cpufreq/policy*; do
            show "${p##*/}" "$p/related_cpus" "$p/scaling_governor" "$p/cpuinfo_min_freq" "$p/cpuinfo_max_freq" \
                "$p/scaling_min_freq" "$p/scaling_max_freq" "$p/scaling_cur_freq"
        done
        show "cpusets" /dev/cpuset/*/cpus /dev/cpuset/cpus
        show "cpuctl uclamp" /dev/cpuctl/*/cpu.uclamp.min /dev/cpuctl/*/cpu.uclamp.max /dev/cpuctl/*/cpu.uclamp.latency_sensitive
        show "mtk core_ctl" /sys/module/mtk_core_ctl/parameters/*
        show "fpsgo fbt" /sys/kernel/fpsgo/fbt/*
        show "fpsgo params" /sys/module/mtk_fpsgo/parameters/* /sys/kernel/fpsgo/minitop/enable
        show "gpu" /proc/gpufreqv2/aging_mode /sys/kernel/ged/hal/fastdvfs_mode /sys/class/devfreq/*mali*/cur_freq \
            /sys/class/devfreq/*mali*/max_freq /sys/class/devfreq/*mali*/min_freq
        echo "## /proc/gpufreqv2/limit_table"
        cat /proc/gpufreqv2/limit_table 2>/dev/null
        echo
        show "mtk misc" /proc/perfmgr/tchbst/user/usrtch /proc/mtk_batoc_throttling/battery_oc_protect_stop \
            /proc/perfmgr/syslimiter/syslimiter_force_disable /sys/kernel/eara_thermal/enable
        show "xiaomi" /sys/devices/virtual/thermal/thermal_message/cpu_limits /sys/module/migt/parameters/* \
            /proc/sys/glk/* /proc/sys/migt/*
        show "battery limits" /proc/mtk_batoc_throttling/battery_oc_protect_stop \
            /sys/devices/platform/low-battery-throttling/low_battery_protect_stop \
            /sys/devices/platform/low-battery-throttling/low_battery_protect_level \
            /sys/devices/virtual/pmic/mitigation/instruction/enable_sw_mitigation \
            /sys/devices/virtual/pmic/mitigation/instruction/enable_hw_mitigation \
            /sys/devices/virtual/pmic/mitigation/last_triggered_count/*
        show "battery temperature" "$BT_NODE" "$BT_VALF" "$BT_CHGF" "$BT_FAKE" $([ "$BT_NODE" = /sys/class/power_supply/battery/temp ] || echo /sys/class/power_supply/battery/temp) /sys/class/power_supply/battery/status
        show "samsung" /sys/power/cpufreq_max_limit /sys/power/cpufreq_min_limit
        echo "## cooling devices (type, state, owner)"
        for p in /sys/class/thermal/cooling_device*; do
            [ -f "$p/type" ] || continue
            echo "${p##*/} $(cat "$p/type" 2>/dev/null) state=$(cat "$p/cur_state" 2>/dev/null)/$(cat "$p/max_state" 2>/dev/null) $(stat -c '%a %U' "$p/cur_state" 2>/dev/null)"
        done
        echo
        echo "## thermal zones (type, policy, temp)"
        for p in /sys/class/thermal/thermal_zone*; do
            [ -f "$p/type" ] || continue
            echo "${p##*/} $(cat "$p/type" 2>/dev/null) $(cat "$p/policy" 2>/dev/null) $(cat "$p/temp" 2>/dev/null)"
        done
        echo
        show "ddr" /sys/class/devfreq/mtk-dvfsrc-devfreq/userspace/set_freq /sys/class/devfreq/mtk-dvfsrc-devfreq/cur_freq
        echo "## services"
        getprop | grep -iE '^\[init\.svc\.[^]]*(power|perf|therm|boost|joyose)'
        echo
        echo "## processes of interest"
        ps -A -o PID,NAME 2>/dev/null | grep -iE 'uperf|thermal|power|perf|boost|joyose' | head -40
        echo
        if [ -s "$BASELINE" ]; then
            echo "## differences from the stock baseline (recorded at boot)"
            while IFS='|' read -r kind mode own p v; do
                [ -e "$p" ] || continue
                m="$(stat -c '%a|%u:%g' "$p" 2>/dev/null)"
                [ "$m" != "$mode|$own" ] && echo "PERM  $p  stock=$mode|$own  now=$m"
                [ "$kind" = "raw" ] || continue
                case "$v" in "" | *"$RS"*) continue ;; esac
                c="$(cat "$p" 2>/dev/null)"
                [ "$c" != "$v" ] && echo "VALUE $p  stock=[$v]  now=[$c]"
            done <"$BASELINE" | sort -u
            echo
        fi
        echo "## last session (apply.log)"
        cat "$USER_PATH/apply.log" 2>/dev/null
    } >"$out" 2>&1
    echo "written: $out"
}
do_state() {
    local a
    if [ -n "$(daemon_pid)" ]; then echo "daemon=running"; else echo "daemon=stopped"; fi
    a="$(cat "$STATE_DIR/active" 2>/dev/null)"
    echo "active=${a#* }"
    echo "preset=$(cur_preset)"
    echo "uperf=$(pidof uperf 2>/dev/null)"
    echo "baseline=$(wc -l <"$BASELINE" 2>/dev/null)"
    echo "soc=$(getprop ro.soc.model)"
    echo "platform=$(getprop ro.board.platform)"
    echo "brand=$(getprop ro.product.brand)"
    echo "sdk=$(getprop ro.build.version.sdk)"
    echo "version=$(grep '^version=' "$MODULE_PATH/module.prop" | cut -d= -f2-)"
}
has() {
    local p
    for p in "$@"; do
        [ -e "$p" ] && { echo 1; return; }
    done
    echo 0
}
do_caps() {
    local fam
    fam="$(chip_family)"
    echo "family=$fam"
    echo "config=$(detect_config)"
    echo "th_mtk=$(has /proc/ppm/policy_status /proc/gpufreqv2/limit_table /proc/gpufreq/gpufreq_limit_table \
        /sys/kernel/fpsgo/fbt/thrm_enable /sys/kernel/fpsgo/fbt/thrm_temp_th /sys/kernel/eara_thermal/enable \
        /proc/perfmgr/syslimiter/syslimiter_force_disable)"
    echo "th_mi=$(has /sys/devices/virtual/thermal/thermal_message/cpu_limits)"
    echo "th_gpu=$(has /sys/class/kgsl/kgsl-3d0/throttling /sys/class/kgsl/kgsl-3d0/thermal_pwrlevel)"
    echo "th_msm=$(has /sys/module/msm_thermal/parameters/enabled /sys/module/msm_thermal/core_control/enabled)"
    case "$fam" in
    pixel | exynos) echo "th_cdev=$(thermal_cdevs | grep -c .)" ;;
    *) echo "th_cdev=0" ;;
    esac
    if [ "$fam" = "exynos" ]; then echo "th_exy=$(has /sys/power/cpufreq_max_limit)"; else echo "th_exy=0"; fi
    echo "batoc=$(has /proc/mtk_batoc_throttling/battery_oc_protect_stop /sys/devices/platform/low-battery-throttling/low_battery_protect_stop \
        /sys/devices/virtual/pmic/mitigation/instruction/enable_sw_mitigation)"
    echo "bat_low=$(has /sys/devices/platform/low-battery-throttling/low_battery_protect_stop \
        /sys/devices/virtual/pmic/mitigation/instruction/enable_sw_mitigation)"
    if bt_supported; then echo "bat_temp=1"; else echo "bat_temp=0"; fi
}
do_getconf() {
    if [ -f "$CONF_FILE" ]; then
        cat "$CONF_FILE"
    fi
}
do_setconf() {
    local apps ed pi bt bon bchg dev scr dp gt
    apps="$(clean_apps "$1")"
    case "$2" in "" | *[!0-9]*) ed=5 ;; *) ed="$2" ;; esac
    case "$3" in "" | *[!0-9]*) pi=2 ;; *) pi="$3" ;; esac
    bt="$4"
    if ! valid_battemp "$bt"; then
        bt="$(sed -n 's/^BAT_TEMP=\([0-9]*\).*/\1/p' "$CONF_FILE" 2>/dev/null | head -n1)"
        valid_battemp "$bt" || bt=0
    fi
    bon="$5"
    case "$bon" in 0 | 1) ;; *)
        bon="$(sed -n 's/^BAT_TEMP_ON=\([01]\).*/\1/p' "$CONF_FILE" 2>/dev/null | head -n1)"
        [ -n "$bon" ] || { [ "$bt" -gt 0 ] && bon=1 || bon=0; }
        ;;
    esac
    bchg="$6"
    case "$bchg" in 0 | 1) ;; *)
        bchg="$(sed -n 's/^BAT_TEMP_CHG=\([01]\).*/\1/p' "$CONF_FILE" 2>/dev/null | head -n1)"
        [ -n "$bchg" ] || bchg=0
        ;;
    esac
    if [ -n "$7" ]; then
        dev="$(clean_device "$7")"
    else
        dev="$(clean_device "$(sed -n 's/^DEVICE=//p' "$CONF_FILE" 2>/dev/null | head -n1 | tr -d ' \r')")"
    fi
    if [ -n "$8" ]; then
        scr="$(clean_screenoff "$8")"
    else
        scr="$(clean_screenoff "$(sed -n 's/^SCREEN_OFF=//p' "$CONF_FILE" 2>/dev/null | head -n1 | tr -d ' \r')")"
    fi
    write_conf "$apps" "$ed" "$pi" "$bt" "$bon" "$bchg" "$dev" "$scr" || { echo "error: could not write $CONF_FILE"; return 1; }
    mkdir -p "$STATE_DIR"
    true >"$STATE_DIR/reload"
    [ -f "$STATE_DIR/park_pid" ] && kill "$(cat "$STATE_DIR/park_pid")" 2>/dev/null
    dp="$(daemon_pid)"
    [ -n "$dp" ] && [ -f "$STATE_DIR/launch_ok" ] && kill -USR1 "$dp" 2>/dev/null
    gt="$(date '+%m-%d %H:%M:%S.%N' 2>/dev/null)"
    case "$gt" in
    *[!0-9.\ :-]* | "") gt="$(date '+%m-%d %H:%M:%S')" ;;
    *) gt="${gt%??????}" ;;
    esac
    echo "$gt settings saved, watcher notified" >>"$GAME_LOG" 2>/dev/null
    echo "ok"
}
launch_comp() {
    local c
    c="$(cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.LAUNCHER "$1" 2>/dev/null | tr -d '\r' | tail -n 1)"
    c="$(echo "$c" | tr -d ' \t')"
    case "$c" in "$1"/?*) echo "$c"; return 0 ;; esac
    return 1
}
do_launchable() {
    if [ -n "$1" ]; then
        case "$1" in *[!A-Za-z0-9._]*) return 1 ;; esac
        launch_comp "$1"
        return
    fi
    cmd package query-activities --components -a android.intent.action.MAIN -c android.intent.category.LAUNCHER 2>/dev/null |
        tr -d '\r' | sed -n 's/^[[:space:]]*\([A-Za-z0-9._]*\/[^[:space:]]*\)[[:space:]]*$/\1/p'
}
do_launch() {
    local pkg="$1" comp out p
    case "$pkg" in "" | *[!A-Za-z0-9._]*) echo "error: bad package name"; return 1 ;; esac
    comp="$(launch_comp "$pkg")"
    if [ -z "$comp" ]; then
        echo "error: $pkg has no launchable screen"
        return 1
    fi
    p="$(daemon_pid)"
    if [ -n "$p" ] && [ -f "$STATE_DIR/launch_ok" ]; then
        echo "$pkg $(date +%s)" >"$STATE_DIR/launch"
        kill -USR1 "$p" 2>/dev/null
    fi
    out="$(am start -n "$comp" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -f 0x10200000 2>&1)"
    case "$out" in
    *Error* | *Exception*)
        rm -f "$STATE_DIR/launch"
        echo "error: $(echo "$out" | grep -m1 -E 'Error|Exception')"
        return 1
        ;;
    esac
    echo "ok"
}
do_resetstock() {
    local r
    if [ ! -s "$BASELINE" ]; then
        echo "error: the stock values aren't recorded yet. They are recorded about a minute after boot, with the screen on."
        return 1
    fi
    do_stop >/dev/null
    r="$(ASH_STANDALONE=1 "$BB" sh "$SCRIPT_PATH/boost_daemon.sh" --reset 2>&1 | tail -n 1)"
    do_start
    echo "$r"
    case "$r" in ok:*) return 0 ;; esac
    return 1
}
do_savelogs() {
    local out f
    out="$USER_PATH/uperf_logs_$(date '+%Y%m%d_%H%M%S').txt"
    mkdir -p "$USER_PATH"
    do_dump >/dev/null 2>&1
    {
        echo "#### Uperf Game Turbo (per-app) logs"
        echo "# saved $(date '+%Y-%m-%d %H:%M:%S')"
        echo "# module $(grep '^version=' "$MODULE_PATH/module.prop" | cut -d= -f2-)"
        echo "# $(getprop ro.product.manufacturer) $(getprop ro.product.model), $(getprop ro.soc.model) ($(getprop ro.board.platform)), Android $(getprop ro.build.version.release), $(getprop ro.build.display.id)"
        echo "# kernel $(uname -r)"
        for f in boost.conf boost.log apply.log state_dump.txt uperf_log.txt; do
            echo
            echo "#### $f"
            cat "$USER_PATH_RAW/$f" 2>/dev/null || echo "(missing)"
        done
    } >"$out" 2>&1
    if [ -s "$out" ]; then echo "written: $out"; else echo "error: could not write $out"; return 1; fi
}
FM_DIR="/storage/emulated/0/Android/yc/uperf"
FM_DOC="content://com.android.externalstorage.documents/document/primary%3AAndroid%2Fyc%2Fuperf"
FM_KNOWN="com.sec.android.app.myfiles com.mi.android.globalFileexplorer com.android.fileexplorer com.google.android.apps.nbu.files com.coloros.filemanager com.oneplus.filemanager com.huawei.filemanager com.hihonor.filemanager bin.mt.plus bin.mt.plus.canary com.mixplorer com.mixplorer.silver pl.solidexplorer2 me.zhanghai.android.files com.amaze.filemanager com.ghisler.android.TotalCommander com.lonelycatgames.Xplore nextapp.fx com.cxinventor.file.explorer com.speedsoftware.rootexplorer com.estrongs.android.pop com.alphainventor.filemanager"
fm_start() {
    local out
    out="$(am start -f 0x10008000 "$@" --es org.openintents.extra.ABSOLUTE_PATH "$FM_DIR" --eu android.provider.extra.INITIAL_URI "$FM_DOC" --es explorer_path "$FM_DIR" 2>&1)"
    case "$out" in *Error* | *Exception* | *"does not exist"* | *"brought to the front"*) return 1 ;; esac
    return 0
}
fm_plain() {
    local out
    out="$(am start -f 0x10000000 "$@" 2>&1)"
    case "$out" in *Error* | *Exception* | *"does not exist"*) return 1 ;; esac
    return 0
}
do_fmlist() {
    local t p installed
    installed=" $(pm list packages 2>/dev/null | tr -d '\r' | sed 's/^package://' | tr '\n' ' ') "
    {
        for t in resource/folder inode/directory; do
            cmd package query-activities --components -a android.intent.action.VIEW -d "file://$FM_DIR" -t "$t" 2>/dev/null
        done
        cmd package query-activities --components -a android.intent.action.VIEW -d "$FM_DOC" -t vnd.android.document/directory 2>/dev/null
        for p in $FM_KNOWN; do
            case "$installed" in *" $p "*) echo "$p/" ;; esac
        done
    } | tr -d '\r' | sed -n 's/^[[:space:]]*\([A-Za-z0-9._]*\)\/.*$/\1/p' | sort -u
}
do_fmopen() {
    local pkg="$1" f="${2##*/}" t comp out
    case "$pkg" in "" | *[!A-Za-z0-9._]*) echo "error: bad package name"; return 1 ;; esac
    mkdir -p "$USER_PATH"
    case "$f" in uperf_logs_*.txt) [ -f "$USER_PATH_RAW/$f" ] || f="" ;; *) f="" ;; esac
    case "$pkg" in
    com.mi.android.globalFileexplorer | com.android.fileexplorer)
        for t in resource/folder inode/directory; do
            fm_start -a android.intent.action.VIEW -d "file://$FM_DIR" -t "$t" -p "$pkg" && echo "launched" && return 0
        done
        ;;
    bin.mt.plus | bin.mt.plus.canary)
        if [ -n "$f" ]; then
            for t in "-n $pkg/bin.mt.plus.OpenTextActivity" "-p $pkg"; do
                out="$(am start -f 0x10000000 $t -a android.intent.action.VIEW -d "file://$FM_DIR/$f" -t text/plain 2>&1)"
                case "$out" in *Error* | *Exception* | *"does not exist"*) ;; *) echo "file"; return 0 ;; esac
            done
        fi
        ;;
    com.sec.android.app.myfiles)
        fm_start -a samsung.myfiles.intent.action.LAUNCH_MY_FILES -p "$pkg" --es samsung.myfiles.intent.extra.START_PATH "$FM_DIR" && echo "ok" && return 0
        ;;
    com.android.documentsui | com.google.android.documentsui)
        fm_start -n "$pkg/com.android.documentsui.files.FilesActivity" -a android.intent.action.VIEW -d "$FM_DOC" && echo "ok" && return 0
        ;;
    com.google.android.apps.nbu.files)
        if [ -n "$f" ] && appops get "$pkg" MANAGE_EXTERNAL_STORAGE 2>/dev/null | grep -q "allow"; then
            fm_plain -n "$pkg/.gateway.txt.TextPreviewGatewayHandler" -a android.intent.action.VIEW -d "file://$FM_DIR/$f" -t text/plain && echo "file" && return 0
        fi
        fm_plain -n "$pkg/.gateway.browse.BrowseGatewayHandler" -a android.intent.action.VIEW -d "content://com.android.externalstorage.documents/root/primary" -t vnd.android.document/root && echo "root" && return 0
        ;;
    esac
    for t in resource/folder inode/directory; do
        fm_start -a android.intent.action.VIEW -d "file://$FM_DIR" -t "$t" -p "$pkg" && echo "ok" && return 0
    done
    fm_start -a android.intent.action.VIEW -d "$FM_DOC" -t vnd.android.document/directory -p "$pkg" && echo "ok" && return 0
    comp="$(launch_comp "$pkg")"
    if [ -n "$comp" ] && fm_start -n "$comp" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER; then
        echo "launched"
        return 0
    fi
    echo "error: $pkg could not be opened"
    return 1
}
do_hasshortcut() {
    case "$1" in "" | *[!A-Za-z0-9._-]*) echo "no"; return 0 ;; esac
    dumpsys shortcut 2>/dev/null | awk -v id="id=shortcut_$1" '
        n > 0 { n--; if ($0 ~ /flags=/) { if ($0 ~ /\[[^]]*Pin/) f = 1; n = 0 } }
        index($0, id) {
            c = substr($0, index($0, id) + length(id), 1)
            if (c == "" || c == "," || c == " ") {
                if ($0 ~ /flags=/) { if ($0 ~ /\[[^]]*Pin/) f = 1 } else n = 4
            }
        }
        END { print (f ? "yes" : "no") }'
}
do_uiset() {
    mkdir -p "$UI_DIR"
    echo "$1" | base64 -d >"$UI_FILE.tmp" 2>/dev/null && [ -s "$UI_FILE.tmp" ] && mv -f "$UI_FILE.tmp" "$UI_FILE" && echo ok
}
do_colors() {
    echo "overlay=$(settings get secure theme_customization_overlay_packages 2>/dev/null)"
    dumpsys wallpaper 2>/dev/null | grep -m4 -iE 'primaryColor|mMainColors|colors' | tr '\n' ' ' | sed 's/^/wallpaper=/'
    echo
}
case "$1" in
state) do_state ;;
caps) do_caps ;;
uperfcfg) cat "$USER_PATH_RAW/uperf.json" 2>/dev/null ;;
getconf) do_getconf ;;
setconf) do_setconf "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$9" ;;
launchable) do_launchable "$2" ;;
launch) do_launch "$2" ;;
savelogs) do_savelogs ;;
fmlist) do_fmlist ;;
fmopen) do_fmopen "$2" "$3" ;;
hasshortcut) do_hasshortcut "$2" ;;
resetstock) do_resetstock ;;
uiget) cat "$UI_FILE" 2>/dev/null ;;
uiset) do_uiset "$2" ;;
uireset) rm -f "$UI_FILE"; echo ok ;;
pkgdates)
    for f in /data/app/*/base.apk /data/app/*/*/base.apk; do
        [ -f "$f" ] || continue
        d="${f%/base.apk}"; d="${d##*/}"
        echo "$(stat -c %Y "$f") ${d%%-*}"
    done
    ;;
colors) do_colors ;;
appvis) appvis_grant "$2" ;;
log)
    case "$2" in
    session) cat "$LOG_FILE" 2>/dev/null ;;
    uperf) cat "$USER_PATH/uperf_log.txt" 2>/dev/null ;;
    *) tail -n 200 "$GAME_LOG" 2>/dev/null ;;
    esac
    ;;
start) do_start; do_status ;;
stop) do_stop; do_status ;;
restart) do_stop; do_start; do_status ;;
dump) do_dump ;;
rebaseline)
    if [ -f "$STATE_DIR/active" ]; then
        echo "leave the boosted app first (with This Device on, switch it off; Screen Off mode ends when the screen is on)"
    else
        rm -f "$BASELINE" "$STATE_DIR/had_session"
        echo "baseline will be re-recorded within ~10 s"
    fi
    ;;
*) do_status ;;
esac
