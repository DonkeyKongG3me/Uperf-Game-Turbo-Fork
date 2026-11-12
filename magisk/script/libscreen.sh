#!/system/bin/sh

PROBE_GLOBS="${PROBE_GLOBS:-/sys/class/backlight/*/brightness /sys/class/backlight/*/actual_brightness /sys/class/leds/lcd-backlight/brightness /sys/class/leds/*backlight*/brightness /sys/class/leds/*lcd*/brightness /sys/class/drm/card*-*/dpms}"
PROBE_STEP=0.25
PROBE_BACKUP=24
PROBE_BACKUP_S=6
PROBE_GAP=100
PROBE_SETTLE_N=5
PROBE_SETTLE_S=0.3
PROBE_MAXFALSE=20
PROBE_N=0
PROBE_ACTIVE=0
PROBE_FALSE=0
PROBE_LASTCONF=0
PROBE_SEEN=0
PROBE_I=0
PROBE_LIFTED=0
PROBE_LASTINFO=""
PROBE_BLIND=""
PROBE_INFO="$STATE_DIR/probe.txt"
PROBE_CANDS="$STATE_DIR/probe_cands"
PROBE_MISS_FILE="$STATE_DIR/probe_miss"

uptime_cs() {
    local u
    read -r u _ </proc/uptime
    CS="${u%.*}${u#*.}"
}

probe_read() {
    local p
    eval "p=\$PROBE_P_$1"
    PV=""
    read -r PV 2>/dev/null <"$p"
    PV="${PV%% *}"
    [ -n "$PV" ] || PV="?"
}

probe_init() {
    local p real seen="" n=0 desc="" i
    PROBE_BLIND=""
    [ -f "$PROBE_MISS_FILE" ] && PROBE_BLIND="$(awk '{ c[$0]++ } END { for (p in c) if (c[p] >= 2) printf "%s ", p }' "$PROBE_MISS_FILE")"
    rm -f "$PROBE_CANDS"
    for p in $PROBE_GLOBS; do
        [ -r "$p" ] || continue
        case "$p" in
        */drm/*)
            [ "$(cat "${p%/dpms}/status" 2>/dev/null)" = connected ] || continue
            ;;
        esac
        real="$(readlink -f "$p" 2>/dev/null)"
        [ -n "$real" ] || real="$p"
        case " $seen " in *" $real "*) continue ;; esac
        seen="$seen $real"
        n=$((n + 1))
        eval "PROBE_P_$n=\$p; PROBE_ON_$n=; PROBE_OFF_$n=; PROBE_OFF0_$n=; PROBE_USE_$n=0"
        echo "$p" >>"$PROBE_CANDS"
        [ "$n" -ge 8 ] && break
    done
    PROBE_N=$n
    if [ "$n" -eq 0 ]; then
        glog "screen probe: no backlight or display power file found, unlock is detected with dumpsys every ${POLL_IDLE} s"
        return
    fi
    i=1
    while [ "$i" -le "$n" ]; do
        probe_read "$i"
        eval "desc=\"\$desc \$PROBE_P_$i=\$PV\""
        i=$((i + 1))
    done
    glog "screen probe: $n candidate file(s):$desc"
}

probe_note_on() {
    local i=1
    while [ "$i" -le "$PROBE_N" ]; do
        probe_read "$i"
        eval "PROBE_ON_$i=\$PV"
        i=$((i + 1))
    done
}

probe_settle() {
    local n=0 i p on held t0 ms files
    uptime_cs
    t0=$CS
    while :; do
        held=0
        files=""
        i=1
        while [ "$i" -le "$PROBE_N" ]; do
            eval "p=\$PROBE_P_$i; on=\$PROBE_ON_$i"
            if [ -n "$on" ] && [ "$on" != "?" ]; then
                case " $PROBE_BLIND " in *" $p "*) ;; *)
                    probe_read "$i"
                    if [ "$PV" = "$on" ]; then
                        held=1
                        files="$files $p"
                    fi
                    ;;
                esac
            fi
            i=$((i + 1))
        done
        [ "$held" = 1 ] || break
        [ "$n" -lt "$PROBE_SETTLE_N" ] || break
        sleep "$PROBE_SETTLE_S"
        n=$((n + 1))
    done
    [ "$n" -gt 0 ] || return 0
    uptime_cs
    ms=$(((CS - t0) * 10))
    if [ "$held" = 1 ]; then
        glog "screen probe: still at the screen-on value after ${ms} ms, never dropped:$files"
    else
        glog "screen probe: file(s) left the screen-on value ${ms} ms after screen off, waited for it"
    fi
}

probe_arm() {
    local i=1 p on use=0 info="" why
    PROBE_ACTIVE=0
    PROBE_FALSE=0
    PROBE_SEEN=0
    PROBE_LASTCONF=0
    PROBE_LIFTED=0
    TICK=0
    if [ "$PROBE_N" -eq 0 ]; then
        echo "screen probe: no candidate files on this phone, dumpsys every ${POLL_IDLE} s" >"$PROBE_INFO"
        return
    fi
    probe_settle
    while [ "$i" -le "$PROBE_N" ]; do
        eval "p=\$PROBE_P_$i; on=\$PROBE_ON_$i"
        probe_read "$i"
        eval "PROBE_OFF_$i=' $PV '; PROBE_OFF0_$i=\$PV; PROBE_USE_$i=0"
        why=""
        if [ "$PV" = "?" ]; then
            why="unreadable"
        elif case " $PROBE_BLIND " in *" $p "*) true ;; *) false ;; esac; then
            why="missed 2 unlocks earlier this boot"
        elif [ -n "$on" ] && [ "$on" = "$PV" ]; then
            why="reads $PV both with the screen on and off (re-read for ${PROBE_SETTLE_N} x ${PROBE_SETTLE_S} s)"
        fi
        if [ -z "$why" ]; then
            eval "PROBE_USE_$i=1"
            use=$((use + 1))
            info="$info$NL  watching $p: off=$PV, last seen on=${on:-not yet}"
        else
            info="$info$NL  skipped  $p: $why"
        fi
        i=$((i + 1))
    done
    printf '%s\n' "screen probe, armed $(date '+%m-%d %H:%M:%S')$info" >"$PROBE_INFO"
    if [ "$info" != "$PROBE_LASTINFO" ]; then
        PROBE_LASTINFO="$info"
        glog "screen probe: file check$(echo "$info" | sed 's/^  /| /' | tr '\n' ' ')"
    fi
    if [ "$use" -gt 0 ]; then
        PROBE_ACTIVE=1
        glog "screen probe: watching $use file(s) every ${PROBE_STEP} s, dumpsys backup every ${PROBE_BACKUP_S} s"
    else
        glog "screen probe: no usable file this time, unlock is detected with dumpsys every ${POLL_IDLE} s"
    fi
}

probe_changed() {
    local i=1 off use
    while [ "$i" -le "$PROBE_N" ]; do
        eval "use=\$PROBE_USE_$i"
        if [ "$use" = 1 ]; then
            probe_read "$i"
            eval "off=\$PROBE_OFF_$i"
            case "$off" in *" $PV "*) ;; *)
                PROBE_I=$i
                return 0
                ;;
            esac
        fi
        i=$((i + 1))
    done
    return 1
}

probe_tick() {
    local p off t0 nv
    probe_changed || return 1
    nv="$PV"
    uptime_cs
    [ "$PROBE_SEEN" = 0 ] && PROBE_SEEN=$CS
    [ $((CS - PROBE_LASTCONF)) -ge "$PROBE_GAP" ] || return 1
    PROBE_LASTCONF=$CS
    lift_screen_off
    PROBE_LIFTED=1
    t0=$CS
    eval "p=\$PROBE_P_$PROBE_I; off=\$PROBE_OFF_$PROBE_I"
    off="$(echo $off | tr ' ' '/')"
    if screen_on; then
        uptime_cs
        glog "screen on: seen on $p ($off -> $nv), $PRESET lifted at once, dumpsys confirmed in $(((CS - t0) * 10)) ms$([ "$PROBE_FALSE" -gt 0 ] && echo ", $PROBE_FALSE false alarm(s) while off")"
        PROBE_ACTIVE=0
        screen_back_on
        uptime_cs
        glog "screen on: handover finished $(((CS - PROBE_SEEN) * 10)) ms after the change was seen"
        return 0
    fi
    apply_rules
    PROBE_LIFTED=0
    eval "PROBE_OFF_$PROBE_I=\"\$PROBE_OFF_$PROBE_I\$nv \""
    PROBE_FALSE=$((PROBE_FALSE + 1))
    PROBE_SEEN=0
    [ "$PROBE_FALSE" -le 3 ] && glog "screen probe: $p changed ($off -> $nv) but the screen is still off (always-on display?), counting $nv as off"
    if [ "$PROBE_FALSE" -ge "$PROBE_MAXFALSE" ]; then
        PROBE_ACTIVE=0
        glog "screen probe: $PROBE_FALSE false alarms, back to dumpsys every ${POLL_IDLE} s until the next screen off"
    fi
    return 1
}

probe_missed() {
    local i=1 p v0 off use list="" n
    sleep 1
    while [ "$i" -le "$PROBE_N" ]; do
        eval "use=\$PROBE_USE_$i; p=\$PROBE_P_$i; v0=\$PROBE_OFF0_$i; off=\$PROBE_OFF_$i"
        if [ "$use" = 1 ]; then
            probe_read "$i"
            list="$list $p=$PV"
            if [ "$PV" = "$v0" ]; then
                echo "$p" >>"$PROBE_MISS_FILE"
                n="$(grep -cxF "$p" "$PROBE_MISS_FILE")"
                if [ "$n" -ge 2 ]; then
                    PROBE_BLIND="$PROBE_BLIND $p"
                    list="$list (still unchanged 1 s later, miss $n, not used again this boot)"
                else
                    list="$list (still unchanged 1 s later, miss $n of 2, still used)"
                fi
            else
                case "$off" in
                *" $PV "*) list="$list (a value also seen while the screen was off)" ;;
                *) list="$list (changed within 1 s: slow backlight fade-in or the 1 s confirmation limit, still used)" ;;
                esac
            fi
        fi
        i=$((i + 1))
    done
    PROBE_ACTIVE=0
    glog "screen on: the backup dumpsys check saw it first, re-checked the watched file(s) 1 s later:$list"
}
