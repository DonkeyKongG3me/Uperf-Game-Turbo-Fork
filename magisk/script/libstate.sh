#!/system/bin/sh

SAVED="$STATE_DIR/saved.list"
BASELINE="$STATE_DIR/baseline.list"
THR_SNAP="$STATE_DIR/threads.snap"
SET_LIST="$STATE_DIR/settings.list"
ACTIVE_FLAG="$STATE_DIR/active"
VERIFY_LOG="$STATE_DIR/verify.txt"

RS="$(printf '\036')"
NL='
'

ST_MODE="apply"

st_init() {
    mkdir -p "$STATE_DIR"
    chmod 0700 "$STATE_DIR"
}


_st_record() {
    local meta v=""
    meta="$(stat -c '%a|%u:%g' "$2" 2>/dev/null)" || return 1
    if [ -f "$2" ]; then
        v="$(cat "$2" 2>/dev/null)"
        v="${v//$NL/$RS}"
    fi
    echo "$1|$meta|$2|$v" >>"${3:-$SAVED}"
}

_st_note() {
    if [ "$ST_MODE" = "baseline" ]; then
        _st_record "$1" "$2" "$BASELINE"
    elif [ -s "$BASELINE" ]; then
        echo "$1|?|?|$2|" >>"$SAVED"
    else
        _st_record "$1" "$2" "$SAVED"
    fi
}

st_record_only() {
    local p
    for p in $2; do
        [ -f "$p" ] && _st_note "$1" "$p"
    done
}


lock_val() {
    lock_val_k raw "$1" "$2"
}

lock_val_k() {
    local p
    for p in $3; do
        if [ -f "$p" ]; then
            _st_note "$1" "$p"
            [ "$ST_MODE" = "apply" ] || continue
            chown root:root "$p" 2>/dev/null
            chmod 0666 "$p" 2>/dev/null
            echo "$2" 2>/dev/null >"$p"
            chmod 0444 "$p" 2>/dev/null
        fi
    done
}

mask_val() {
    local p
    for p in $2; do
        if [ -f "$p" ]; then
            _st_note raw "$p"
            [ "$ST_MODE" = "apply" ] || continue
            echo "$1" 2>/dev/null >"$p"
        fi
    done
}

mutate() {
    local p
    for p in $2; do
        if [ -f "$p" ]; then
            _st_note raw "$p"
            [ "$ST_MODE" = "apply" ] || continue
            chmod 0666 "$p" 2>/dev/null
            echo "$1" 2>/dev/null >"$p"
        fi
    done
}

lock() {
    local p
    for p in $1; do
        if [ -f "$p" ]; then
            _st_note perm "$p"
            [ "$ST_MODE" = "apply" ] || continue
            chown root:root "$p" 2>/dev/null
            chmod 0444 "$p" 2>/dev/null
        fi
    done
}

perm_val() {
    local p
    for p in $2; do
        if [ -e "$p" ]; then
            _st_note perm "$p"
            [ "$ST_MODE" = "apply" ] || continue
            chmod "$1" "$p" 2>/dev/null
        fi
    done
}


st_setting() {
    local old
    [ "$ST_MODE" = "apply" ] || return 0
    old="$(settings get "$1" "$2" 2>/dev/null)"
    [ -n "$old" ] || old="null"
    grep -q "^$1|$2|" "$SET_LIST" 2>/dev/null || echo "$1|$2|$old" >>"$SET_LIST"
    settings put "$1" "$2" "$3" 2>/dev/null
}

st_restore_settings() {
    local ns key old
    [ -f "$SET_LIST" ] || return 0
    while IFS='|' read -r ns key old; do
        if [ "$old" = "null" ]; then
            settings delete "$ns" "$key" >/dev/null 2>&1
        else
            settings put "$ns" "$key" "$old" 2>/dev/null
        fi
    done <"$SET_LIST"
    rm -f "$SET_LIST"
}


thr_collect() {
    local pid stat_files="" status_files=""
    for pid in "$@"; do
        [ -d "/proc/$pid/task" ] || continue
        stat_files="$stat_files /proc/$pid/task/*/stat /proc/$pid/task/*/cpuset"
        status_files="$status_files /proc/$pid/task/*/status"
    done
    [ -n "$stat_files" ] || return 0
    {
        grep -H '' $stat_files 2>/dev/null
        grep -H '^Cpus_allowed:' $status_files 2>/dev/null
    } | awk '
        {
            i = index($0, ":"); fn = substr($0, 1, i - 1); c = substr($0, i + 1)
            split(fn, a, "/"); pid = a[3]; tid = a[5]; typ = a[6]
            P[tid] = pid
        }
        typ == "stat" {
            rest = c; sub(/^.*\) /, "", rest)
            p1 = index(c, "(")
            cm = substr(c, p1 + 1, length(c) - length(rest) - p1 - 2)
            gsub(/[ \t]/, "_", cm); if (cm == "") cm = "-"
            comm[tid] = cm
            split(rest, f, " ")
            rtp[tid] = f[38]; pol[tid] = f[39]; nic[tid] = f[17]; next
        }
        typ == "cpuset" { cs[tid] = c; next }
        typ == "status" { sub(/^Cpus_allowed:[ \t]*/, "", c); m[tid] = c; next }
        END {
            for (t in P) if (t in pol)
                print P[t], t, pol[t], rtp[t], nic[t], ((t in m) ? m[t] : "-"), ((t in cs && cs[t] != "") ? cs[t] : "-"), comm[t]
        }'
}

thr_snapshot() {
    local grp="$1"
    shift
    [ $# -gt 0 ] || return 0
    thr_collect "$@" | sed "s/^/$grp /" >>"$THR_SNAP"
}

full_cpu_mask() {
    awk '{ n = split($0, a, /[-,]/); m = 1; for (i = 0; i <= a[n]; i++) m *= 2; printf "%x\n", m - 1 }' /sys/devices/system/cpu/possible 2>/dev/null
}

thr_restore() {
    local pids full fifo
    [ -f "$THR_SNAP" ] || return 0
    full="$(full_cpu_mask)"
    [ -n "$full" ] || full="ff"
    fifo="$(getprop sys.use_fifo_ui)"
    pids="$(awk '{ print $2 }' "$THR_SNAP" | sort -u) $*"
    thr_collect $pids >"$STATE_DIR/threads.now"
    awk -v full="$full" -v fifo="$fifo" '
        function norm(x) { x = tolower(x); gsub(/,/, "", x); sub(/^0+/, "", x); return x }
        function isrt(p) { return (p == 1 || p == 2) }
        function uithread(tid, pid, comm) { return (tid == pid || comm == "RenderThread") }
        function setpol(tid, pol, rtp) {
            if (pol == 1) print "chrt -f -p " rtp " " tid
            else if (pol == 2) print "chrt -r -p " rtp " " tid
            else if (pol == 3) print "chrt -b -p 0 " tid
            else if (pol == 5) print "chrt -i -p 0 " tid
            else print "chrt -o -p 0 " tid
        }
        function sanitize(pid, tid, pol, mask, comm) {
            if (pol != 0 && !(isrt(pol) && fifo == "true" && uithread(tid, pid, comm))) {
                print "chrt -o -p 0 " tid; print "renice 0 -p " tid
            }
            if (mask != "-" && norm(mask) != norm(full)) print "taskset -p " full " " tid
        }
        FNR == NR {
            G[$3] = $1; SP[$3] = $4; SR[$3] = $5; SN[$3] = $6; SM[$3] = $7; SC[$3] = $8
            if (!($2 in PG)) PG[$2] = $1
            next
        }
        {
            pid = $1; tid = $2; pol = $3; rtp = $4; nice = $5; mask = $6; cs = $7; comm = $8
            g = (tid in G) ? G[tid] : ((pid in PG) ? PG[pid] : "game")
            if (g == "game" || !(tid in G)) {
                if (g != "sys") sanitize(pid, tid, pol, mask, comm)
                next
            }
            ui = uithread(tid, pid, comm)
            polchg = (pol != SP[tid] || (isrt(SP[tid]) && rtp != SR[tid]))
            if (g == "app" && ui && fifo == "true" && isrt(pol)) polchg = 0
            if (polchg) setpol(tid, SP[tid], SR[tid])
            if (!isrt(SP[tid]) && (polchg || nice != SN[tid]) && !(g == "app" && ui && !polchg))
                print "renice " SN[tid] " -p " tid
            if (SM[tid] != "-" && mask != "-" && norm(mask) != norm(SM[tid])) print "taskset -p " SM[tid] " " tid
            if (g == "sys" && SC[tid] != "-" && cs != SC[tid]) {
                d = (SC[tid] == "/") ? "" : SC[tid]
                print "echo " tid " > /dev/cpuset" d "/tasks"
            }
        }' "$THR_SNAP" "$STATE_DIR/threads.now" >"$STATE_DIR/threads.fix"
    log "thread fixes: $(wc -l <"$STATE_DIR/threads.fix")"
    sh "$STATE_DIR/threads.fix" >/dev/null 2>&1
    rm -f "$THR_SNAP" "$STATE_DIR/threads.now" "$STATE_DIR/threads.fix"
}


_st_num() {
    echo "${1//$RS/$NL}" | grep -m1 '[0-9]' | grep -oE -- '-?[0-9]+' | tail -n1
}

_st_put_back() {
    local kind="$1" p="$2" v="$3" n line id st
    case "$kind" in
    raw)
        case "$v" in
        "" | *"$RS"*) ;;
        *) echo "$v" >"$p" 2>/dev/null ;;
        esac
        ;;
    perm | online) ;;
    num)
        n="$(_st_num "$v")"
        [ -n "$n" ] && echo "$n" >"$p" 2>/dev/null
        ;;
    cpumin)
        cat "${p%/*}/cpuinfo_min_freq" >"$p" 2>/dev/null
        ;;
    cpumax)
        cat "${p%/*}/cpuinfo_max_freq" >"$p" 2>/dev/null
        ;;
    ppmlimit)
        for id in 0 1 2 3; do
            echo "$id -1" >"$p" 2>/dev/null
        done
        ;;
    ppmen)
        case "$v" in
        *disabled*) echo 0 >"$p" 2>/dev/null ;;
        *enabled*) echo 1 >"$p" 2>/dev/null ;;
        esac
        ;;
    ppmstatus)
        echo "${v//$RS/$NL}" | sed -nE 's/^\[ *([0-9]+)\].*: *(enabled|disabled).*/\1 \2/p' |
            while read -r id st; do
                if [ "$st" = "enabled" ]; then
                    echo "$id 1" >"$p" 2>/dev/null
                else
                    echo "$id 0" >"$p" 2>/dev/null
                fi
            done
        ;;
    gpulimit)
        echo "${v//$RS/$NL}" | awk '
            { gsub(/[][]/, "") }
            !c && /c_enable/ {
                for (i = 1; i <= NF; i++) { if ($i == "c_enable") c = i; if ($i == "f_enable") f = i }
                next
            }
            c && f && $1 ~ /^[0-9]+$/ && $c ~ /^[01]$/ && $f ~ /^[01]$/ { print $1, $c, $f }
        ' >"$STATE_DIR/gpulimit.tmp"
        if [ -s "$STATE_DIR/gpulimit.tmp" ]; then
            while read -r line; do
                echo "$line" >"$p" 2>/dev/null
            done <"$STATE_DIR/gpulimit.tmp"
        else
            for id in 0 1 2 3 4 5 6 7 8 9 10; do
                echo "$id 1 1" >"$p" 2>/dev/null
            done
        fi
        rm -f "$STATE_DIR/gpulimit.tmp"
        ;;
    batoc)
        n="$(_st_num "$v")"
        echo "stop ${n:-0}" >"$p" 2>/dev/null
        ;;
    usrtch)
        n="$(echo "${v//$RS/$NL}" | grep -i -m1 'enable' | grep -o '[0-9][0-9]*' | head -n1)"
        echo "enable ${n:-1}" >"$p" 2>/dev/null
        ;;
    aging)
        case "$v" in
        *[Dd]isable* | 0 | *": 0"*) echo "disable" >"$p" 2>/dev/null ;;
        *) echo "enable" >"$p" 2>/dev/null ;;
        esac
        ;;
    esac
}

_st_restore_pass() {
    local kind mode own p v cur
    while IFS='|' read -r kind mode own p v; do
        [ -e "$p" ] || continue
        if [ "$1" = "retry" ]; then
            [ "$kind" = "raw" ] || continue
            case "$v" in "" | *"$RS"*) continue ;; esac
            cur="$(cat "$p" 2>/dev/null)"
            [ "$cur" = "$v" ] && continue
        fi
        [ -f "$p" ] && chmod 0666 "$p" 2>/dev/null
        _st_put_back "$kind" "$p" "$v"
        chmod "$mode" "$p" 2>/dev/null
        chown "$own" "$p" 2>/dev/null
    done <"$STATE_DIR/restore.list"
}

_st_verify() {
    local kind mode own p v cur meta bad=0
    : >"$VERIFY_LOG"
    while IFS='|' read -r kind mode own p v; do
        [ -e "$p" ] || continue
        meta="$(stat -c '%a|%u:%g' "$p" 2>/dev/null)"
        if [ "$meta" != "$mode|$own" ]; then
            echo "PERM  $p  want=$mode|$own  got=$meta" >>"$VERIFY_LOG"
            bad=$((bad + 1))
        fi
        [ "$kind" = "raw" ] || continue
        case "$v" in "" | *"$RS"*) continue ;; esac
        cur="$(cat "$p" 2>/dev/null)"
        if [ "$cur" != "$v" ]; then
            echo "VALUE $p  want=[$v]  got=[$cur]" >>"$VERIFY_LOG"
            bad=$((bad + 1))
        fi
    done <"$STATE_DIR/restore.list"
    echo "$bad"
}

st_restore_values() {
    local bad
    [ -f "$SAVED" ] || return 0
    awk -F'|' '
        function upd(path, kind) {
            if (!(path in K)) { K[path] = kind; return }
            if (K[path] == "perm" && kind != "perm") K[path] = kind
        }
        FILENAME == base {
            if (!($4 in B)) B[$4] = $0
            upd($4, $1); next
        }
        {
            if (!($4 in idx)) { idx[$4] = ++n; P[n] = $4; S[$4] = $0 }
            upd($4, $1)
        }
        END {
            for (i = n; i > 0; i--) {
                p = P[i]
                line = (p in B) ? B[p] : S[p]
                split(line, f, "|")
                if (f[2] == "?") { print "nobase|" p > "/dev/stderr"; continue }
                sub(/^[^|]*/, K[p], line); print line
            }
        }' base="$BASELINE" "$BASELINE" "$SAVED" >"$STATE_DIR/restore.list" 2>"$STATE_DIR/nobase.txt"
    if [ ! -s "$BASELINE" ]; then
        log "no boot baseline yet: restoring values recorded at game start"
    fi
    [ -s "$STATE_DIR/nobase.txt" ] && log "no stock value known for: $(cut -d'|' -f2 "$STATE_DIR/nobase.txt" | tr '\n' ' ')"
    log "restoring $(wc -l <"$STATE_DIR/restore.list") nodes"
    _st_restore_pass all
    _st_restore_pass retry
    bad="$(_st_verify)"
    if [ "$bad" = "0" ]; then
        log "verify: every node back to stock"
    else
        log "verify: $bad node(s) differ from stock:"
        cat "$VERIFY_LOG" >>"$LOG_FILE"
    fi
    rm -f "$SAVED" "$STATE_DIR/restore.list" "$STATE_DIR/nobase.txt"
}
