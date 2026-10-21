#!/system/bin/sh

BASEDIR="$(dirname "$(readlink -f "$0")")"
. "$BASEDIR/pathinfo.sh"
. "$BASEDIR/libconf.sh"

PIDFILE="$STATE_DIR/daemon.pid"
BASELINE="$STATE_DIR/baseline.list"
BB="$BIN_PATH/busybox/busybox"
RS="$(printf '\036')"
UI_DIR="/data/adb/uperf_ui"
UI_FILE="$UI_DIR/ui.json"

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
        echo "state   : BOOSTED for ${a#* } (pid ${a%% *})"
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
    echo "preset=$(cat "$USER_PATH_RAW/cur_powermode.txt" 2>/dev/null)"
    echo "uperf=$(pidof uperf 2>/dev/null)"
    echo "baseline=$(wc -l <"$BASELINE" 2>/dev/null)"
    echo "soc=$(getprop ro.soc.model)"
    echo "platform=$(getprop ro.board.platform)"
    echo "brand=$(getprop ro.product.brand)"
    echo "sdk=$(getprop ro.build.version.sdk)"
    echo "version=$(grep '^version=' "$MODULE_PATH/module.prop" | cut -d= -f2-)"
}

do_getconf() {
    if [ -f "$CONF_FILE" ]; then
        cat "$CONF_FILE"
    elif [ -f "$OLD_CONF_FILE" ]; then
        echo "LEGACY=1"
        cat "$OLD_CONF_FILE"
    fi
}

do_setconf() {
    local apps ed pi
    apps="$(clean_apps "$1")"
    case "$2" in "" | *[!0-9]*) ed=5 ;; *) ed="$2" ;; esac
    case "$3" in "" | *[!0-9]*) pi=2 ;; *) pi="$3" ;; esac
    write_conf "$apps" "$ed" "$pi" || { echo "error: could not write $CONF_FILE"; return 1; }
    [ -f "$OLD_CONF_FILE" ] && mv -f "$OLD_CONF_FILE" "$OLD_CONF_FILE.migrated"
    mkdir -p "$STATE_DIR"
    true >"$STATE_DIR/reload"
    [ -f "$STATE_DIR/park_pid" ] && kill "$(cat "$STATE_DIR/park_pid")" 2>/dev/null
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
getconf) do_getconf ;;
setconf) do_setconf "$2" "$3" "$4" ;;
savelogs) do_savelogs ;;
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
        echo "leave the game first"
    else
        rm -f "$BASELINE" "$STATE_DIR/had_session"
        echo "baseline will be re-recorded within ~10 s"
    fi
    ;;
*) do_status ;;
esac
