#!/system/bin/sh
BASEDIR="$(dirname "$(readlink -f "$0")")"
. "$BASEDIR/pathinfo.sh"
. "$BASEDIR/libcommon.sh"
. "$BASEDIR/libsysinfo.sh"
. "$BASEDIR/libstate.sh"
. "$BASEDIR/libtweaks.sh"
. "$BASEDIR/libconf.sh"
. "$BASEDIR/libbattemp.sh"
. "$BASEDIR/libscreen.sh"
PIDFILE="$STATE_DIR/daemon.pid"
APP_LIST=""
TARGET_PKGS=""
UNLOCK_THERMAL=0
UNLOCK_BATOC=0
UPERF_TOUCH=1
SIG=""
EXIT_DELAY=5
POLL_IDLE=2
PRESET="fast"
BAT_TEMP=0
BAT_TEMP_ON=""
BAT_TEMP_CHG=0
GPID=""
GPKG=""
GSKIP=0
PAUSED=0
AWAY=0
TICK=0
RESTARTS=0
RELOAD_FLAG="$STATE_DIR/reload"
LAUNCH_FLAG="$STATE_DIR/launch"
DEV_KEY="@device"
DEVICE=""
SCR_KEY="@screenoff"
SCREEN_OFF=""
BRIDGE="balance"
LAUNCH_SIG=0
LAUNCH_PKG=""
NAP_PID=""
FAST_DEV=0
PEND=0
load_conf() {
    local key val w pkg rest pre fl bt list="" pkgs="" fmt=1
    if [ ! -f "$CONF_FILE" ]; then
        if restore_conf; then
            glog "boost.conf was missing (module removed instead of updated, or a cleaner?), restored your last saved settings"
        else
            write_conf "" 5 2
        fi
    fi
    cmp -s "$CONF_FILE" "$CONF_BACKUP" 2>/dev/null || cp -f "$CONF_FILE" "$CONF_BACKUP" 2>/dev/null
    grep -q '^FORMAT=2' "$CONF_FILE" && fmt=2
    APP_LIST=""
    TARGET_PKGS=""
    DEVICE=""
    SCREEN_OFF=""
    BAT_TEMP=0
    BAT_TEMP_ON=""
    BAT_TEMP_CHG=0
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
                bt=""
                [ "$rest" != "$pre" ] && fl="${rest#*:}"
                case "$fl" in *:*) bt="${fl#*:}"; fl="${fl%%:*}" ;; esac
                valid_btfield "$bt" || bt=""
                case "$pkg" in "" | *[!A-Za-z0-9._]*) continue ;; esac
                valid_preset "$pre" || pre="fast"
                case "$fl" in [01][01][01]) ;; [01][01]) fl="${fl}0" ;; *) fl="$(default_h "$pre")$(default_h "$pre")0" ;; esac
                [ "$fmt" = 2 ] || fl="1$(case "$pre" in performance | fast) echo "${fl#?}" ;; *) echo 00 ;; esac)"
                list="$list $pkg:$pre:$fl${bt:+:$bt}"
                pkgs="$pkgs $pkg"
            done
            ;;
        DEVICE)
            DEVICE="$(clean_device "$val")"
            ;;
        SCREEN_OFF)
            SCREEN_OFF="$(clean_screenoff "$val")"
            ;;
        EXIT_DELAY | POLL_IDLE)
            case "$val" in "" | *[!0-9]*) ;; *) eval "$key=$val" ;; esac
            ;;
        BAT_TEMP)
            valid_battemp "$val" && BAT_TEMP="$val"
            ;;
        BAT_TEMP_ON)
            case "$val" in 0 | 1) BAT_TEMP_ON="$val" ;; esac
            ;;
        BAT_TEMP_CHG)
            case "$val" in 0 | 1) BAT_TEMP_CHG="$val" ;; esac
            ;;
        esac
    done <"$CONF_FILE"
    if [ -n "$DEVICE" ]; then
        list="$DEV_KEY:$DEVICE"
        pkgs=""
    fi
    APP_LIST="${list# }"
    [ "$BAT_TEMP_ON" = 0 ] && BAT_TEMP=0
    TARGET_PKGS="${pkgs# }"
    [ "$POLL_IDLE" -ge 1 ] 2>/dev/null || POLL_IDLE=2
    [ "$POLL_IDLE" -le 10 ] || POLL_IDLE=10
    [ "$EXIT_DELAY" -le 60 ] 2>/dev/null || EXIT_DELAY=60
}
preset_for() {
    local e
    if [ "$1" = "$SCR_KEY" ]; then
        REPLY="so_${SCREEN_OFF:-powersave}"
        REPLY_FL=000
        REPLY_BT=0
        has_preset "$REPLY" || REPLY="${SCREEN_OFF:-powersave}"
        has_preset "$REPLY" || REPLY="powersave"
        return
    fi
    REPLY="fast"
    REPLY_FL=110
    REPLY_BT=""
    for e in $APP_LIST; do
        case "$e" in "$1":*)
            e="${e#*:}"
            REPLY="${e%%:*}"
            REPLY_FL="${e#*:}"
            case "$REPLY_FL" in *:*) REPLY_BT="${REPLY_FL#*:}"; REPLY_FL="${REPLY_FL%%:*}" ;; esac
            break
            ;;
        esac
    done
    if [ -f "$USER_PATH_RAW/uperf.json" ] && ! grep -q "\"$REPLY\"" "$USER_PATH_RAW/uperf.json"; then
        REPLY="fast"
    fi
}
session_for() {
    local t h b
    preset_for "$1"
    set_tier "$REPLY"
    t="${REPLY_FL%??}"
    h="${REPLY_FL#?}"
    h="${h%?}"
    b="${REPLY_FL#??}"
    NEW_TOUCH="$t"
    NEW_THERMAL="$h"
    NEW_BATOC="$b"
    NEW_SIG="$TIER$t$h$b"
    case "$REPLY_BT" in
    "" | g*)
        NEW_BT="$BAT_TEMP"
        NEW_BT_CHG="$BAT_TEMP_CHG"
        ;;
    *)
        NEW_BT="${REPLY_BT%c}"
        NEW_BT_CHG=0
        case "$REPLY_BT" in *c) NEW_BT_CHG=1 ;; esac
        ;;
    esac
}
ensure_uperf_json() {
    [ -f "$USER_PATH_RAW/uperf.json" ] && return 0
    [ -f "$MODULE_PATH/uperf_default.json" ] || return 1
    mkdir -p "$USER_PATH_RAW"
    cp -f "$MODULE_PATH/uperf_default.json" "$USER_PATH_RAW/uperf.json" || return 1
    glog "uperf.json was missing (module removed instead of updated, or a cleaner?), restored it from the module"
}
lift_screen_off() {
    has_preset "$BRIDGE" && [ -n "$(UPERF_PIDS)" ] || return 1
    printf '%s\n' "* $BRIDGE" "- $BRIDGE" >"$USER_PATH/perapp_powermode.txt"
    echo "$BRIDGE" >"$USER_PATH/cur_powermode.txt"
    echo "$BRIDGE" >"$STATE_DIR/preset"
}
has_preset() {
    [ -f "$USER_PATH_RAW/uperf.json" ] || return 1
    grep -q "\"$1\"" "$USER_PATH_RAW/uperf.json"
}
apply_rules() {
    printf '%s\n' "* $PRESET" "- $PRESET" >"$USER_PATH/perapp_powermode.txt"
    echo "$PRESET" >"$STATE_DIR/preset"
    echo "$PRESET" >"$USER_PATH/cur_powermode.txt"
}
sname() {
    case "$1" in
    "$DEV_KEY") echo "this device" ;;
    "$SCR_KEY") echo "screen off" ;;
    *) echo "${1:-game}" ;;
    esac
}
nap() {
    [ "$LAUNCH_SIG" = 1 ] && return 0
    sleep "$1" &
    NAP_PID=$!
    [ "$LAUNCH_SIG" = 1 ] || wait "$NAP_PID" 2>/dev/null
    kill "$NAP_PID" 2>/dev/null
    NAP_PID=""
}
on_usr1() {
    LAUNCH_SIG=1
    [ -n "$NAP_PID" ] && kill "$NAP_PID" 2>/dev/null
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
    [ -n "$TARGET_PKGS" ] || return 1
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
    probe_note_on
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
    UNLOCK_BATOC="$NEW_BATOC"
    SIG="$NEW_SIG"
    ENTER_BT="$NEW_BT"
    ENTER_BT_CHG="$NEW_BT_CHG"
    PAUSED=0
    AWAY=0
    TICK=0
    RESTARTS=0
    t0="$(date +%s)"
    ensure_uperf_json
    if [ ! -f "$USER_PATH_RAW/uperf.json" ]; then
        glog "ERROR: $USER_PATH/uperf.json missing, reinstall the module. Not boosting $(sname "$GPKG")."
        GSKIP=1
        return
    fi
    GSKIP=0
    st_init
    echo "$GPID $GPKG" >"$ACTIVE_FLAG"
    true >"$STATE_DIR/had_session"
    clear_log
    log "$(date '+%H:%M:%S') enter $(sname "$GPKG") pid=$GPID preset=$PRESET tier=$TIER thermal_unlock=$UNLOCK_THERMAL battery_limit_off=$UNLOCK_BATOC uperf_touch=$UPERF_TOUCH baseline=$([ -s "$BASELINE" ] && echo yes || echo no)"
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
    bt_set "$ENTER_BT" "$ENTER_BT_CHG"
    glog "enter $(sname "$GPKG"): preset $PRESET on, battery temp $(bt_desc), thermal limits $([ "$UNLOCK_THERMAL" = 1 ] && echo OFF || echo stock), battery limits $([ "$UNLOCK_BATOC" = 1 ] && echo OFF || echo stock), uperf touch boost $([ "$UPERF_TOUCH" = 1 ] && echo on || echo off) ($(($(date +%s) - t0)) s)"
}
switch_app() {
    local old="$GPKG" oldtier="$TIER"
    session_for "$2"
    if [ "$NEW_SIG" != "$SIG" ]; then
        TIER="$oldtier"
        leave_game "switching to $(sname "$2")"
        return 0
    fi
    GPID="$1"
    GPKG="$2"
    PRESET="$REPLY"
    TICK=0
    apply_rules
    echo "$GPID $GPKG" >"$ACTIVE_FLAG"
    [ "$PAUSED" = 1 ] && uperf_resume
    PAUSED=0
    AWAY=0
    bt_set "$NEW_BT" "$NEW_BT_CHG"
    glog "switch $(sname "$old") -> $(sname "$GPKG"): preset $PRESET, battery temp $(bt_desc)"
}
apply_reload() {
    rm -f "$RELOAD_FLAG"
    [ -z "$GPID" ] && FAST_DEV=1
    load_conf
    glog "settings reloaded: ${APP_LIST:-no apps selected}, screen off: ${SCREEN_OFF:-stock}"
    [ -n "$GPID" ] || return 0
    if [ "$GPKG" = "$DEV_KEY" ]; then
        if [ -z "$DEVICE" ]; then
            leave_game "device mode switched off"
            return 0
        fi
    elif [ "$GPKG" = "$SCR_KEY" ]; then
        if [ -z "$SCREEN_OFF" ]; then
            leave_game "screen off mode switched off"
            return 0
        fi
    elif ! is_target "$GPKG"; then
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
        glog "$(sname "$GPKG"): preset changed to $PRESET"
    fi
    apply_rules
    if [ "$NEW_BT" != "$BT_CUR" ] || [ "$NEW_BT_CHG" != "$BT_CHG_CUR" ]; then
        bt_set "$NEW_BT" "$NEW_BT_CHG"
        glog "$(sname "$GPKG"): battery temp $(bt_desc)"
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
    glog "nothing boosted: watcher paused until an app, this device or screen off mode is set"
    sleep 3600 &
    echo $! >"$STATE_DIR/park_pid"
    [ -f "$RELOAD_FLAG" ] && kill $! 2>/dev/null
    wait $! 2>/dev/null
    kill $! 2>/dev/null
    rm -f "$STATE_DIR/park_pid"
}
leave_game() {
    local t0 extras fixed
    t0="$(date +%s)"
    st_init
    log "$(date '+%H:%M:%S') leave ($1)"
    bt_stop
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
        glog "leave $(sname "$GPKG") ($1): stock restored, verified ($(($(date +%s) - t0)) s)"
    else
        glog "leave $(sname "$GPKG") ($1): stock restored, see apply.log ($(($(date +%s) - t0)) s)"
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
    bt_stop
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
    rm -f "$STATE_DIR/launch_ok" "$LAUNCH_FLAG"
    [ -f "$STATE_DIR/park_pid" ] && kill "$(cat "$STATE_DIR/park_pid")" 2>/dev/null && rm -f "$STATE_DIR/park_pid"
    if [ -f "$ACTIVE_FLAG" ]; then
        leave_game "watcher stopped"
    fi
    rm -f "$PIDFILE"
    exit 0
}
device_ready() {
    [ -n "$DEVICE" ] || return 1
    if [ "$FAST_DEV" = 1 ]; then
        FAST_DEV=0
    else
        screen_on || return 1
    fi
    if [ ! -s "$BASELINE" ] && [ ! -f "$STATE_DIR/had_session" ]; then
        baseline_due || return 1
        take_baseline
    fi
    return 0
}
device_tick() {
    TICK=$((TICK + 1))
    if [ $((TICK % 3)) -eq 0 ] && ! screen_on; then
        screen_went_off
        return
    fi
    if [ "$GSKIP" = 0 ] && [ "$RESTARTS" -lt 3 ] && [ $((TICK % 5)) -eq 0 ] && [ -z "$(UPERF_PIDS)" ]; then
        RESTARTS=$((RESTARTS + 1))
        glog "uperf not running, restarting it ($RESTARTS/3)"
        uperf_start "$PRESET" >>"$LOG_FILE" 2>&1
    fi
    nap 1
}
scr_ready() {
    [ -n "$SCREEN_OFF" ] || return 1
    [ -s "$BASELINE" ] || [ -f "$STATE_DIR/had_session" ]
}
enter_screen_off() {
    [ -n "$GPID" ] && switch_app scr "$SCR_KEY"
    [ -n "$GPID" ] || enter_game scr "$SCR_KEY"
    probe_arm
}
screen_went_off() {
    if scr_ready; then
        enter_screen_off
    else
        leave_game "screen off"
    fi
}
screen_back_on() {
    if [ "$PROBE_LIFTED" = 1 ]; then
        PROBE_LIFTED=0
        sleep 0.2
    elif lift_screen_off; then
        sleep 0.3
    fi
    glog "screen on: left $PRESET"
    if find_target_fg; then
        switch_app "$FG_PID" "$FG_PKG"
        [ -n "$GPID" ] || enter_game "$FG_PID" "$FG_PKG"
    elif [ -n "$DEVICE" ]; then
        switch_app dev "$DEV_KEY"
        [ -n "$GPID" ] || enter_game dev "$DEV_KEY"
    else
        leave_game "screen on"
    fi
}
uperf_watchdog() {
    if [ "$GSKIP" = 0 ] && [ "$RESTARTS" -lt 3 ] && [ -z "$(UPERF_PIDS)" ]; then
        RESTARTS=$((RESTARTS + 1))
        glog "uperf not running, restarting it ($RESTARTS/3)"
        uperf_start "$PRESET" >>"$LOG_FILE" 2>&1
    fi
}
screen_off_tick() {
    TICK=$((TICK + 1))
    if [ "$PROBE_ACTIVE" = 1 ]; then
        probe_tick && return
        if [ $((TICK % PROBE_BACKUP)) -eq 0 ]; then
            if screen_on; then
                glog "screen on: found by the 6 s backup dumpsys check"
                screen_back_on
                probe_missed
                return
            fi
            uperf_watchdog
        fi
        nap "$PROBE_STEP"
        return
    fi
    if screen_on; then
        glog "screen on: found by the regular dumpsys check (every ${POLL_IDLE} s)"
        screen_back_on
        return
    fi
    if [ "$GSKIP" = 0 ] && [ "$RESTARTS" -lt 3 ] && [ $((TICK % 5)) -eq 0 ] && [ -z "$(UPERF_PIDS)" ]; then
        RESTARTS=$((RESTARTS + 1))
        glog "uperf not running, restarting it ($RESTARTS/3)"
        uperf_start "$PRESET" >>"$LOG_FILE" 2>&1
    fi
    nap "$POLL_IDLE"
}
take_launch() {
    local pkg="" t="" now
    [ -f "$LAUNCH_FLAG" ] || return 1
    read -r pkg t <"$LAUNCH_FLAG"
    rm -f "$LAUNCH_FLAG"
    case "$t" in "" | *[!0-9]*) return 1 ;; esac
    now="$(date +%s)"
    [ $((now - t)) -le 15 ] || return 1
    is_target "$pkg" || return 1
    [ "$pkg" = "$GPKG" ] && return 1
    LAUNCH_PKG="$pkg"
    return 0
}
launch_boost() {
    PEND=20
    glog "launch $1 from the settings: applying its mode now"
    if [ -n "$GPID" ]; then
        switch_app wait "$1"
        [ -n "$GPID" ] && return 0
    fi
    enter_game wait "$1"
}
launch_tick() {
    if find_target_fg; then
        if [ "$FG_PKG" = "$GPKG" ]; then
            GPID="$FG_PID"
            echo "$GPID $GPKG" >"$ACTIVE_FLAG"
            glog "$GPKG is open (pid $GPID)"
        else
            switch_app "$FG_PID" "$FG_PKG"
        fi
        return
    fi
    PEND=$((PEND - 1))
    if [ "$PEND" -le 0 ]; then
        leave_game "launched app never came to the front"
        return
    fi
    nap 1
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
    trap on_usr1 USR1
    true >"$STATE_DIR/launch_ok"
    load_conf
    glog_trim
    ensure_uperf_json
    probe_init
    bt_stop
    if [ -f "$ACTIVE_FLAG" ]; then
        read -r GPID GPKG <"$ACTIVE_FLAG"
        leave_game "recovered after restart"
    fi
    if [ ! -f "$STATE_DIR/had_session" ] && ! pidof uperf >/dev/null 2>&1; then
        st="$(fix_cpu_governors)"
        [ -n "$st" ] && glog "governor left on powersave by an earlier run, fixed: $st"
    fi
    rm -f "$RELOAD_FLAG" "$LAUNCH_FLAG"
    glog "watcher started, apps: ${APP_LIST:-none selected yet}, screen off: ${SCREEN_OFF:-stock}"
    while true; do
        [ -f "$RELOAD_FLAG" ] && apply_reload
        if [ "$LAUNCH_SIG" = 1 ] || [ -f "$LAUNCH_FLAG" ]; then
            LAUNCH_SIG=0
            if take_launch; then
                launch_boost "$LAUNCH_PKG"
                continue
            fi
        fi
        if [ -z "$GPID" ]; then
            if [ -z "$TARGET_PKGS" ] && [ -z "$DEVICE" ] && [ -z "$SCREEN_OFF" ] && { [ -s "$BASELINE" ] || [ -f "$STATE_DIR/had_session" ]; }; then
                park_idle
                continue
            fi
            n=$((n + 1))
            if [ $n -ge $((30 / POLL_IDLE + 1)) ]; then
                n=0
                load_conf
            fi
            if scr_ready && ! screen_on; then
                enter_screen_off
                continue
            fi
            if find_target_fg && screen_on; then
                enter_game "$FG_PID" "$FG_PKG"
                continue
            fi
            if device_ready; then
                enter_game dev "$DEV_KEY"
                continue
            fi
            if [ $((n % 5)) -eq 0 ] && baseline_due; then
                take_baseline
            fi
            nap "$POLL_IDLE"
            continue
        fi
        if [ "$GPKG" = "$DEV_KEY" ]; then
            device_tick
            continue
        fi
        if [ "$GPKG" = "$SCR_KEY" ]; then
            screen_off_tick
            continue
        fi
        if [ "$GPID" = wait ]; then
            launch_tick
            continue
        fi
        game_state
        st=$?
        if [ "$GSKIP" = 1 ]; then
            if [ $st -ne 0 ]; then
                GPID=""
                GPKG=""
            fi
            nap 2
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
                nap 1
                continue
            fi
            if [ $((AWAY % 3)) -eq 1 ] && scr_ready && ! screen_on; then
                screen_went_off
                nap 1
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
        3) screen_went_off ;;
        esac
        nap 1
    done
}
if [ "$1" = "--reset" ]; then
    reset_stock
    exit $?
fi
main "$@"
