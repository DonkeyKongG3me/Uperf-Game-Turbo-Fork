#!/system/bin/sh

BASEDIR="$(dirname "$(readlink -f "$0")")"
. "$BASEDIR/pathinfo.sh"
. "$BASEDIR/libcommon.sh"
. "$BASEDIR/libsysinfo.sh"
. "$BASEDIR/libstate.sh"
. "$BASEDIR/libtweaks.sh"
. "$BASEDIR/libconf.sh"

PIDFILE="$STATE_DIR/daemon.pid"

APP_LIST=""
TARGET_PKGS=""
UNLOCK_THERMAL=0
UPERF_TOUCH=1
SIG=""
EXIT_DELAY=5
POLL_IDLE=2
PRESET="fast"

GPID=""
GPKG=""
GSKIP=0
PAUSED=0
AWAY=0
TICK=0
RESTARTS=0

RELOAD_FLAG="$STATE_DIR/reload"


migrate_conf() {
    local key val pkgs="" preset=fast ed=5 pi=2 ktb=0 apps="" w
    if [ -f "$OLD_CONF_FILE" ]; then
        while IFS='=' read -r key val; do
            val="$(echo "$val" | tr -d '"\r' | sed 's/#.*//; s/^[ \t]*//; s/[ \t]*$//')"
            case "$key" in
            TARGET_PKGS) pkgs="$val" ;;
            PRESET) preset="$val" ;;
            EXIT_DELAY) ed="$val" ;;
            POLL_IDLE) pi="$val" ;;
            KERNEL_TOUCH_BOOST) ktb="$val" ;;
            esac
        done <"$OLD_CONF_FILE"
        for w in $pkgs; do apps="$apps $w:$preset:11"; done
        write_conf "$(clean_apps "$apps")" "$ed" "$pi"
        mv -f "$OLD_CONF_FILE" "$OLD_CONF_FILE.migrated"
        glog "settings moved from geode.conf to boost.conf"
    else
        write_conf "" 5 2
    fi
}

load_conf() {
    local key val w pkg rest pre fl list="" pkgs="" fmt=1
    [ -f "$CONF_FILE" ] || migrate_conf
    grep -q '^FORMAT=2' "$CONF_FILE" && fmt=2
    APP_LIST=""
    TARGET_PKGS=""
    while IFS='=' read -r key val; do
        key="$(echo "$key" | tr -d ' \r\t')"
        val="$(echo "$val" | tr -d '"\r' | sed 's/#.*//; s/^[ \t]*//; s/[ \t]*$//')"
        case "$key" in
        APPS)
            for w in $val; do
                pkg="${w%%:*}"
                rest="${w#*:}"
                [ "$rest" = "$w" ] && rest="fast"
                pre="${rest%%:*}"
                fl=""
                [ "$rest" != "$pre" ] && fl="${rest#*:}"
                case "$pkg" in "" | *[!A-Za-z0-9._]*) continue ;; esac
                valid_preset "$pre" || pre="fast"
                case "$fl" in [01][01]) ;; *) fl="1$(default_h "$pre")" ;; esac
                [ "$fmt" = 2 ] || fl="1$(case "$pre" in performance | fast) echo "${fl#?}" ;; *) echo 0 ;; esac)"
                list="$list $pkg:$pre:$fl"
                pkgs="$pkgs $pkg"
            done
            ;;
        EXIT_DELAY | POLL_IDLE)
            case "$val" in "" | *[!0-9]*) ;; *) eval "$key=$val" ;; esac
            ;;
        esac
    done <"$CONF_FILE"
    APP_LIST="${list# }"
    TARGET_PKGS="${pkgs# }"
    [ "$POLL_IDLE" -ge 1 ] 2>/dev/null || POLL_IDLE=2
    [ "$POLL_IDLE" -le 10 ] || POLL_IDLE=10
    [ "$EXIT_DELAY" -le 60 ] 2>/dev/null || EXIT_DELAY=60
}

preset_for() {
    local e
    REPLY="fast"
    REPLY_FL=11
    for e in $APP_LIST; do
        case "$e" in "$1":*)
            e="${e#*:}"
            REPLY="${e%%:*}"
            REPLY_FL="${e#*:}"
            break
            ;;
        esac
    done
    if [ -f "$USER_PATH_RAW/uperf.json" ] && ! grep -q "\"$REPLY\"" "$USER_PATH_RAW/uperf.json"; then
        REPLY="fast"
    fi
}

session_for() {
    local t h
    preset_for "$1"
    set_tier "$REPLY"
    t="${REPLY_FL%?}"
    h="${REPLY_FL#?}"
    NEW_TOUCH="$t"
    NEW_THERMAL="$h"
    NEW_SIG="$TIER$t$h"
}


is_target() {
    [ -n "$1" ] || return 1
    case " $TARGET_PKGS " in
    *" $1 "*) return 0 ;;
    esac
    return 1
}

fg_adj() {
    local adj=""
    read -r adj 2>/dev/null <"/proc/$1/oom_score_adj"
    [ -n "$adj" ] && [ "$adj" -lt 200 ]
}

find_target_fg() {
    local pid c pkg cs procs=/dev/cpuset/top-app/cgroup.procs
    if [ -r "$procs" ]; then
        while read -r pid; do
            c=""
            read -r c 2>/dev/null <"/proc/$pid/cmdline"
            if is_target "$c" && fg_adj "$pid"; then
                FG_PID="$pid"
                FG_PKG="$c"
                return 0
            fi
        done <"$procs"
        return 1
    fi
    [ -n "$TARGET_PKGS" ] || return 1
    for pkg in $TARGET_PKGS; do
        for pid in $(pidof "$pkg" 2>/dev/null); do
            cs=""
            read -r cs 2>/dev/null <"/proc/$pid/cpuset"
            if [ "$cs" = "/top-app" ] && fg_adj "$pid"; then
                FG_PID="$pid"
                FG_PKG="$pkg"
                return 0
            fi
        done
    done
    return 1
}

screen_on() {
    local w
    w="$(dumpsys power 2>/dev/null | grep -m1 'mWakefulness=')"
    case "$w" in
    *Asleep* | *Dozing*) return 1 ;;
    esac
    return 0
}

game_state() {
    local c="" adj=""
    [ -d "/proc/$GPID" ] || return 2
    read -r c 2>/dev/null <"/proc/$GPID/cmdline"
    [ "$c" = "$GPKG" ] || return 2
    read -r adj 2>/dev/null <"/proc/$GPID/oom_score_adj"
    [ -n "$adj" ] && [ "$adj" -ge 200 ] && return 1
    TICK=$((TICK + 1))
    if [ $((TICK % 3)) -eq 0 ] && ! screen_on; then
        return 3
    fi
    return 0
}

top_app_extras() {
    local pid uid
    [ -r /dev/cpuset/top-app/cgroup.procs ] || return 0
    while read -r pid; do
        [ "$pid" = "$GPID" ] && continue
        uid="$(stat -c %u "/proc/$pid" 2>/dev/null)"
        [ -n "$uid" ] && [ "$uid" -ge 10000 ] && echo "$pid"
    done </dev/cpuset/top-app/cgroup.procs
}


enter_game() {
    local t0 home sys_pids app_pids
    GPID="$1"
    GPKG="$2"
    session_for "$GPKG"
    PRESET="$REPLY"
    UPERF_TOUCH="$NEW_TOUCH"
    UNLOCK_THERMAL="$NEW_THERMAL"
    SIG="$NEW_SIG"
    PAUSED=0
    AWAY=0
    TICK=0
    RESTARTS=0
    t0="$(date +%s)"

    if [ ! -f "$USER_PATH_RAW/uperf.json" ]; then
        glog "ERROR: $USER_PATH/uperf.json missing, reinstall the module. Not boosting $GPKG."
        GSKIP=1
        return
    fi
    GSKIP=0

    st_init
    echo "$GPID $GPKG" >"$ACTIVE_FLAG"
    true >"$STATE_DIR/had_session"
    clear_log
    log "$(date '+%H:%M:%S') enter $GPKG pid=$GPID preset=$PRESET tier=$TIER thermal_unlock=$UNLOCK_THERMAL uperf_touch=$UPERF_TOUCH baseline=$([ -s "$BASELINE" ] && echo yes || echo no)"

    if uperf_sched_enabled; then
        PROC_TABLE="$(proc_table)"
        home="$(home_package)"
        sys_pids="$(pids_by_regex '/system/bin/surfaceflinger|system_server|swapd|compactd' | grep -vx "$GPID")"
        app_pids="$(pids_by_regex "	(com\.android\.systemui|com\.android\.providers\.media[^	]*|${home:-no.home.found})	" | grep -vx "$GPID")"
        thr_snapshot sys $sys_pids
        thr_snapshot app $app_pids
        thr_snapshot game "$GPID"
        PROC_TABLE=""
        log "thread snapshot taken (uperf sched module is on)"
    fi

    record_uperf_knobs
    apply_game_tweaks >>"$LOG_FILE" 2>&1
    log "$(date '+%H:%M:%S') tweaks applied"
    if uperf_start "$PRESET" >>"$LOG_FILE" 2>&1; then
        log "$(date '+%H:%M:%S') uperf running ($(($(date +%s) - t0)) s)"
    else
        glog "uperf failed to start (see uperf_log.txt)"
    fi
    glog "enter $GPKG: preset $PRESET on, thermal limits $([ "$UNLOCK_THERMAL" = 1 ] && echo OFF || echo stock), uperf touch boost $([ "$UPERF_TOUCH" = 1 ] && echo on || echo off) ($(($(date +%s) - t0)) s)"
}

switch_app() {
    local old="$GPKG" oldtier="$TIER"
    session_for "$2"
    if [ "$NEW_SIG" != "$SIG" ]; then
        TIER="$oldtier"
        leave_game "switching to $2"
        return 0
    fi
    GPID="$1"
    GPKG="$2"
    if [ "$REPLY" != "$PRESET" ]; then
        PRESET="$REPLY"
        echo "$PRESET" >"$USER_PATH/cur_powermode.txt"
    fi
    echo "$GPID $GPKG" >"$ACTIVE_FLAG"
    [ "$PAUSED" = 1 ] && uperf_resume
    PAUSED=0
    AWAY=0
    glog "switch $old -> $GPKG: preset $PRESET"
}

apply_reload() {
    rm -f "$RELOAD_FLAG"
    load_conf
    glog "settings reloaded: ${APP_LIST:-no apps selected}"
    [ -n "$GPID" ] || return 0
    if ! is_target "$GPKG"; then
        leave_game "removed from the list"
        return 0
    fi
    local oldtier="$TIER"
    session_for "$GPKG"
    if [ "$NEW_SIG" != "$SIG" ]; then
        TIER="$oldtier"
        leave_game "options changed ($REPLY)"
        return 0
    fi
    if [ "$REPLY" != "$PRESET" ]; then
        PRESET="$REPLY"
        echo "$PRESET" >"$USER_PATH/cur_powermode.txt"
        glog "$GPKG: preset changed to $PRESET"
    fi
}

take_baseline() {
    local t0
    t0="$(date +%s)"
    rm -f "$BASELINE"
    ST_MODE="baseline"
    record_uperf_knobs >/dev/null 2>&1
    apply_game_tweaks >/dev/null 2>&1
    ST_MODE="apply"
    glog "stock baseline recorded: $(wc -l <"$BASELINE" 2>/dev/null) nodes ($(($(date +%s) - t0)) s)"
}

baseline_due() {
    local up
    [ -s "$BASELINE" ] && return 1
    [ -f "$STATE_DIR/had_session" ] && return 1
    read -r up _ </proc/uptime
    [ "${up%%.*}" -ge 45 ] || return 1
    screen_on
}

park_idle() {
    [ -f "$RELOAD_FLAG" ] && return 0
    glog "no apps boosted: watcher paused until one is"
    sleep 3600 &
    echo $! >"$STATE_DIR/park_pid"
    [ -f "$RELOAD_FLAG" ] && kill $! 2>/dev/null
    wait $! 2>/dev/null
    rm -f "$STATE_DIR/park_pid"
}

leave_game() {
    local t0 extras fixed
    t0="$(date +%s)"
    st_init
    log "$(date '+%H:%M:%S') leave ($1)"
    uperf_stop
    if [ -f "$THR_SNAP" ]; then
        extras="$(top_app_extras)"
        thr_restore $extras
    fi
    st_restore_values
    st_restore_settings
    fixed="$(fix_cpu_governors)"
    [ -n "$fixed" ] && log "governor fixed: $fixed"
    log "governors now: $(cat /sys/devices/system/cpu/cpufreq/policy*/scaling_governor 2>/dev/null | tr '\n' ' ')"
    killall mi_thermald 2>/dev/null
    rm -f "$ACTIVE_FLAG"
    if grep -q 'verify: every node back' "$LOG_FILE" 2>/dev/null; then
        glog "leave ${GPKG:-game} ($1): stock restored, verified ($(($(date +%s) - t0)) s)"
    else
        glog "leave ${GPKG:-game} ($1): stock restored, see apply.log ($(($(date +%s) - t0)) s)"
    fi
    GPID=""
    GPKG=""
    SIG=""
    PAUSED=0
    AWAY=0
}

reset_stock() {
    local fixed
    st_init
    if [ ! -s "$BASELINE" ]; then
        echo "error: the stock values aren't recorded yet. They are recorded about a minute after boot, with the screen on."
        return 1
    fi
    clear_log
    log "$(date '+%H:%M:%S') reset to stock (requested from the settings)"
    uperf_stop
    [ -f "$THR_SNAP" ] && thr_restore
    cp -f "$BASELINE" "$SAVED"
    st_restore_values
    st_restore_settings
    fixed="$(fix_cpu_governors)"
    [ -n "$fixed" ] && log "governor fixed: $fixed"
    killall mi_thermald 2>/dev/null
    rm -f "$ACTIVE_FLAG"
    if grep -q 'verify: every node back' "$LOG_FILE" 2>/dev/null; then
        glog "reset to stock: $(wc -l <"$BASELINE") values put back, verified"
        echo "ok: every value is back to stock"
    else
        glog "reset to stock: done, some values differ (see apply.log)"
        echo "ok: done, but a few values differ from stock (details in apply.log)"
    fi
}

on_term() {
    [ -f "$STATE_DIR/park_pid" ] && kill "$(cat "$STATE_DIR/park_pid")" 2>/dev/null && rm -f "$STATE_DIR/park_pid"
    if [ -f "$ACTIVE_FLAG" ]; then
        leave_game "watcher stopped"
    fi
    rm -f "$PIDFILE"
    exit 0
}


main() {
    local old n=0 st
    wait_until_login
    st_init
    mkdir -p "$USER_PATH"

    old="$(cat "$PIDFILE" 2>/dev/null)"
    if [ -n "$old" ] && [ "$old" != "$$" ] && [ -d "/proc/$old" ] && grep -q boost_daemon "/proc/$old/cmdline" 2>/dev/null; then
        exit 0
    fi
    echo "$$" >"$PIDFILE"
    trap on_term TERM INT HUP

    load_conf
    glog_trim
    if [ -f "$ACTIVE_FLAG" ]; then
        read -r GPID GPKG <"$ACTIVE_FLAG"
        leave_game "recovered after restart"
    fi
    if [ ! -f "$STATE_DIR/had_session" ] && ! pidof uperf >/dev/null 2>&1; then
        st="$(fix_cpu_governors)"
        [ -n "$st" ] && glog "governor left on powersave by an earlier run, fixed: $st"
    fi
    rm -f "$RELOAD_FLAG"
    glog "watcher started, apps: ${APP_LIST:-none selected yet}"

    while true; do
        [ -f "$RELOAD_FLAG" ] && apply_reload
        if [ -z "$GPID" ]; then
            if [ -z "$TARGET_PKGS" ] && { [ -s "$BASELINE" ] || [ -f "$STATE_DIR/had_session" ]; }; then
                park_idle
                continue
            fi
            n=$((n + 1))
            if [ $n -ge $((30 / POLL_IDLE + 1)) ]; then
                n=0
                load_conf
            fi
            if find_target_fg; then
                enter_game "$FG_PID" "$FG_PKG"
                continue
            fi
            if [ $((n % 5)) -eq 0 ] && baseline_due; then
                take_baseline
            fi
            sleep "$POLL_IDLE"
            continue
        fi

        game_state
        st=$?
        if [ "$GSKIP" = 1 ]; then
            if [ $st -ne 0 ]; then
                GPID=""
                GPKG=""
            fi
            sleep 2
            continue
        fi
        case $st in
        0)
            if [ "$PAUSED" = 1 ]; then
                uperf_resume
                PAUSED=0
                glog "back in $GPKG"
            elif [ "$RESTARTS" -lt 3 ] && [ $((TICK % 5)) -eq 0 ] && [ -z "$(UPERF_PIDS)" ]; then
                RESTARTS=$((RESTARTS + 1))
                glog "uperf not running, restarting it ($RESTARTS/3)"
                uperf_start "$PRESET" >>"$LOG_FILE" 2>&1
            fi
            AWAY=0
            ;;
        1)
            if find_target_fg && [ "$FG_PID" != "$GPID" ]; then
                switch_app "$FG_PID" "$FG_PKG"
                sleep 1
                continue
            fi
            if [ "$PAUSED" = 0 ]; then
                uperf_pause
                PAUSED=1
            fi
            AWAY=$((AWAY + 1))
            [ "$AWAY" -ge "$EXIT_DELAY" ] && leave_game "in background"
            ;;
        2)
            if find_target_fg && [ "$FG_PID" != "$GPID" ]; then
                switch_app "$FG_PID" "$FG_PKG"
            else
                leave_game "closed"
            fi
            ;;
        3) leave_game "screen off" ;;
        esac
        sleep 1
    done
}

if [ "$1" = "--reset" ]; then
    reset_stock
    exit $?
fi
main "$@"
