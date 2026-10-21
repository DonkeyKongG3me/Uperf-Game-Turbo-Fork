#!/system/bin/sh

# "pid<TAB>argv<TAB>comm" for every process
proc_table() {
    local d a c
    for d in /proc/[0-9]*; do
        a=""
        c=""
        read -r a 2>/dev/null <"$d/cmdline"
        read -r c 2>/dev/null <"$d/comm"
        echo "${d#/proc/}	$a	$c"
    done
}

pids_by_regex() {
    echo "$PROC_TABLE" | grep -iE "$1" | cut -f1
}

home_package() {
    cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null |
        tail -n1 | cut -d/ -f1
}


want_thermal() {
    [ "$ST_MODE" = "baseline" ] || [ "$UNLOCK_THERMAL" = "1" ]
}

want_perf() {
    [ "$ST_MODE" = "baseline" ] || [ "$TIER" = "perf" ]
}

want_mid() {
    [ "$ST_MODE" = "baseline" ] || [ "$TIER" = "perf" ] || [ "$TIER" = "mid" ]
}

set_tier() {
    case "$1" in
    performance | fast) TIER="perf" ;;
    balance) TIER="mid" ;;
    *) TIER="eco" ;;
    esac
}

want_touch_override() {
    [ "$ST_MODE" = "baseline" ] || [ "$UPERF_TOUCH" = "1" ]
}


set_cpufreq_min() {
    local kv
    lock_val "$1" /sys/module/msm_performance/parameters/cpu_min_freq
    for kv in $1; do
        lock_val_k cpumin "${kv#*:}" "/sys/devices/system/cpu/cpu${kv%:*}/cpufreq/scaling_min_freq"
    done
}

set_cpufreq_max() {
    local kv
    lock_val "$1" /sys/module/msm_performance/parameters/cpu_max_freq
    for kv in $1; do
        lock_val_k cpumax "${kv#*:}" "/sys/devices/system/cpu/cpu${kv%:*}/cpufreq/scaling_max_freq"
    done
}

set_corectl_param() {
    local kv
    for kv in $2; do
        lock_val "${kv#*:}" "/sys/devices/system/cpu/cpu${kv%:*}/core_ctl/$1"
    done
}

record_uperf_knobs() {
    local p
    st_record_only raw "/sys/devices/system/cpu/cpufreq/policy*/scaling_governor"
    st_record_only cpumin "/sys/devices/system/cpu/cpu*/cpufreq/scaling_min_freq"
    st_record_only cpumax "/sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq"
    st_record_only raw "/sys/module/msm_performance/parameters/cpu_min_freq /sys/module/msm_performance/parameters/cpu_max_freq"
    st_record_only raw "/sys/kernel/msm_performance/parameters/cpu_min_freq /sys/kernel/msm_performance/parameters/cpu_max_freq"
    st_record_only ppmlimit "/proc/ppm/policy/hard_userlimit_max_cpu_freq /proc/ppm/policy/hard_userlimit_min_cpu_freq"
    for p in $(grep -oE '"/(sys|proc|dev)/[^"]*"' "$USER_PATH_RAW/uperf.json" 2>/dev/null | tr -d '"' | sort -u); do
        case "$p" in
        */scaling_min_freq) st_record_only cpumin "$p" ;;
        */scaling_max_freq) st_record_only cpumax "$p" ;;
        *) st_record_only raw "$p" ;;
        esac
    done
    st_record_only raw "/proc/sys/fs/inotify/max_queued_events /proc/sys/fs/inotify/max_user_watches /proc/sys/fs/inotify/max_user_instances"
}


unify_sched() {
    local d
    for d in /dev/stune/*/; do
        lock_val "0" "$d/schedtune.boost"
        lock_val "0" "$d/schedtune.prefer_idle"
    done
    for d in /dev/cpuctl/*/; do
        lock_val "0" "$d/cpu.uclamp.min"
        lock_val "0" "$d/cpu.uclamp.latency_sensitive"
    done
    for d in kernel walt; do
        mask_val "0" "/proc/sys/$d/sched_force_lb_enable"
    done
}

unify_devfreq() {
    local df d
    want_perf || return 0
    for df in /sys/class/devfreq; do
        for d in $df/*cpubw $df/*gpubw $df/*llccbw $df/*cpu-cpu-llcc-bw $df/*cpu-llcc-ddr-bw $df/*cpu-llcc-lat $df/*llcc-ddr-lat $df/*cpu-ddr-latfloor $df/*cpu-l3-lat $df/*cdsp-l3-lat $df/*cpu-ddr-qoslat $df/*bpu-ddr-latfloor $df/*snoc_cnoc_keepalive; do
            lock_val "9999000000" "$d/max_freq"
        done
    done
    for d in DDR LLCC L3; do
        lock_val "9999000000" "/sys/devices/system/cpu/bus_dcvs/$d/*/max_freq"
    done
}

unify_lpm() {
    local d
    want_perf || return 0
    lock_val "0" /sys/module/lpm_levels/parameters/lpm_ipi_prediction
    lock_val "0" /sys/module/lpm_levels/parameters/lpm_prediction
    lock_val "2" /sys/module/lpm_levels/parameters/bias_hyst
    for d in kernel walt; do
        mask_val "255" "/proc/sys/$d/sched_busy_hysteresis_enable_cpus"
        mask_val "2000000" "/proc/sys/$d/sched_busy_hyst_ns"
    done
}

disable_hotplug() {
    local i
    if want_thermal; then
        lock_val "0" /sys/module/msm_thermal/core_control/enabled
        lock_val "N" /sys/module/msm_thermal/parameters/enabled
    fi
    want_mid || return 0
    mutate "0" /sys/power/cpuhotplug/enabled
    mutate "0" /sys/devices/system/cpu/cpuhotplug/enabled

    lock_val "0" /sys/kernel/intelli_plug/intelli_plug_active
    lock_val "0" /sys/module/blu_plug/parameters/enabled
    lock_val "0" /sys/devices/virtual/misc/mako_hotplug_control/enabled
    lock_val "0" /sys/module/autosmp/parameters/enabled
    lock_val "0" /sys/kernel/zen_decision/enabled

    set_corectl_param "enable" "0:0 6:0 7:0"

    for i in 0 1 2 3 4 5 6 7 8 9; do
        lock_val_k online "1" "/sys/devices/system/cpu/cpu$i/online"
    done
}

disable_kernel_boost() {
    local i
    if want_touch_override; then
        lock_val "0" "/sys/devices/system/cpu/cpu_boost/*"
        lock_val "0" "/sys/devices/system/cpu/cpu_boost/parameters/*"
        lock_val "0" "/sys/module/cpu_boost/parameters/*"
        lock_val "0" "/proc/sys/walt/input_boost/*"
        lock_val_k usrtch "enable 0" /proc/perfmgr/tchbst/user/usrtch
        mutate "0" "/sys/class/input_booster/*"
        lock_val "0" "/sys/kernel/cpu_input_boost/*"
        lock_val "0" "/sys/module/cpu_input_boost/parameters/*"
    fi

    lock_val "0" "/sys/module/msm_performance/parameters/*"
    lock_val "0" "/sys/kernel/msm_performance/parameters/*"

    set_cpufreq_min "0:0 1:0 2:0 3:0 4:0 5:0 6:0 7:0"
    set_cpufreq_max "0:9999000 1:9999000 2:9999000 3:9999000 4:9999000 5:9999000 6:9999000 7:9999000"

    if want_thermal; then
        lock_val_k ppmen "1" /proc/ppm/enabled
        for i in 0 1 2 3 4 5 6 7 8 9 10; do
            lock_val_k ppmstatus "$i 0" /proc/ppm/policy_status
        done
        lock_val_k ppmstatus "6 1" /proc/ppm/policy_status
        lock "/proc/ppm/policy/*"
        lock "/proc/ppm/*"
        lock_val "1" /proc/perfmgr/syslimiter/syslimiter_force_disable
        lock_val "300" /sys/kernel/fpsgo/fbt/thrm_temp_th
        lock_val "-1" /sys/kernel/fpsgo/fbt/thrm_limit_cpu
        lock_val "-1" /sys/kernel/fpsgo/fbt/thrm_sub_cpu
    fi
    if want_mid; then
        lock_val "0" "/sys/module/mtk_fpsgo/parameters/boost_affinity*"
        lock_val "0" "/sys/module/fbt_cpu/parameters/boost_affinity*"
        lock_val "9999000" "/sys/kernel/fpsgo/fbt/limit_*"
        lock_val "0" /sys/kernel/fpsgo/fbt/switch_idleprefer
    fi

    lock_val "N" "/sys/module/control_center/parameters/*"
    lock_val "0" /sys/module/aigov/parameters/enable
    lock_val "0" "/sys/module/houston/parameters/*"
    lock_val "0" /sys/module/opchain/parameters/chain_on

    lock_val "0" "/sys/module/dsboost/parameters/*"
    lock_val "0" "/sys/module/devfreq_boost/parameters/*"
}

disable_userspace_boost() {
    perm_val 0000 /dev/migt
    perm_val 0000 "/sys/module/migt/parameters/*"
}

disable_userspace_thermal() {
    local i maxfreq
    want_thermal || return 0
    for i in 0 2 4 6 7; do
        maxfreq="$(cat "/sys/devices/system/cpu/cpu$i/cpufreq/cpuinfo_max_freq" 2>/dev/null)"
        [ -n "$maxfreq" ] && [ "$maxfreq" -gt "0" ] &&
            lock_val_k perm "cpu$i $maxfreq" /sys/devices/virtual/thermal/thermal_message/cpu_limits
    done
}

mtk_once() {
    local i
    want_mid && lock_val "0" /sys/module/mtk_core_ctl/parameters/policy_enable

    if [ -d "/proc/gpufreqv2" ]; then
        if want_thermal; then
            lock_val_k aging "disable" /proc/gpufreqv2/aging_mode
            lock_val_k batoc "stop 1" /proc/mtk_batoc_throttling/battery_oc_protect_stop
            for i in $(seq 0 10); do
                lock_val_k gpulimit "$i 0 0" /proc/gpufreqv2/limit_table
            done
            lock_val_k gpulimit "1 1 1" /proc/gpufreqv2/limit_table
            lock_val_k gpulimit "3 1 1" /proc/gpufreqv2/limit_table

            lock_val "0" /sys/kernel/fpsgo/fbt/thrm_enable
            lock_val "300000" /sys/kernel/fpsgo/fbt/thrm_temp_th
        fi
    elif [ -d "/proc/gpufreq" ]; then
        for i in $(seq 0 9); do
            lock_val "0" "/sys/devices/system/cpu/cpu$i/sched_load_boost"
        done
        if want_perf; then
            lock_val "0" /sys/module/cache_ctl/parameters/enable
            lock /sys/devices/system/cpu/sched/set_sched_isolation
            for i in $(seq 0 9); do
                lock_val_k perm "$i" /sys/devices/system/cpu/sched/set_sched_deisolation
            done
            for i in 0 1 2; do
                lock_val_k ppmlimit "$i 3200000" /proc/ppm/policy/hard_userlimit_max_cpu_freq
                lock_val_k ppmlimit "$i 3200000" /proc/ppm/policy/hard_userlimit_min_cpu_freq
            done
        fi
        want_thermal && lock_val "0" /proc/gpufreq/gpufreq_aging_enable
        if want_thermal; then
            for i in $(seq 0 8); do
                lock_val_k gpulimit "$i 0 0" /proc/gpufreq/gpufreq_limit_table
            done
            lock_val_k gpulimit "1 1 1" /proc/gpufreq/gpufreq_limit_table
            lock_val "0" /sys/kernel/eara_thermal/enable
            lock_val "0" /proc/wmt_tm/tx_thro
            lock_val "-1" /proc/wmt_tm/tx_thro_limit

            lock_val "0" /sys/kernel/fpsgo/fbt/thrm_enable
            lock_val "300000" /sys/kernel/fpsgo/fbt/thrm_temp_th
        fi
    fi
}


platform_special() {
    local i d df BUS_DIR MAX_FREQ MIN_PWRLVL n
    if [ "$IS_MTK" = "true" ]; then
        if want_mid; then
            if [ -d "/data/adb/modules/asoul_affinity_opt" ]; then
                mask_val "0" /sys/module/mtk_fpsgo/parameters/boost_affinity
                mask_val "0" /sys/module/fbt_cpu/parameters/boost_affinity
                mask_val "0" /sys/kernel/fpsgo/minitop/enable
            else
                mask_val "1" /sys/module/mtk_fpsgo/parameters/boost_affinity
                mask_val "1" /sys/module/fbt_cpu/parameters/boost_affinity
                mask_val "1" /sys/kernel/fpsgo/minitop/enable
            fi
            mask_val "0" /sys/module/mtk_core_ctl/parameters/policy_enable
        fi
        mask_val "0" /sys/module/mtk_fpsgo/parameters/perfmgr_enable
        if want_thermal; then
            mask_val "0" /sys/kernel/fpsgo/fbt/thrm_enable
            mask_val "95000" /sys/kernel/fpsgo/fbt/thrm_temp_th
            mask_val "-1" /sys/kernel/fpsgo/fbt/thrm_limit_cpu
            mask_val "-1" /sys/kernel/fpsgo/fbt/thrm_sub_cpu
        fi

        if [ -d "/proc/gpufreqv2" ]; then
            if want_thermal; then
                lock_val_k aging "disable" /proc/gpufreqv2/aging_mode
                lock_val_k batoc "stop 1" /proc/mtk_batoc_throttling/battery_oc_protect_stop
                for i in $(seq 0 10); do
                    lock_val_k gpulimit "$i 0 0" /proc/gpufreqv2/limit_table
                done
                lock_val_k gpulimit "1 1 1" /proc/gpufreqv2/limit_table
                lock_val_k gpulimit "3 1 1" /proc/gpufreqv2/limit_table
            fi
            lock_val "0" /sys/kernel/ged/hal/fastdvfs_mode
        else
            want_thermal && lock_val "0" /proc/gpufreq/gpufreq_aging_enable
            for i in $(seq 0 9); do
                mask_val "0" "/sys/devices/system/cpu/cpu$i/sched_load_boost"
            done
            if want_perf; then
                mask_val "" /sys/devices/system/cpu/sched/cpu_prefer
                [ "$ST_MODE" = "apply" ] && [ -f /sys/devices/system/cpu/sched/set_sched_isolation ] &&
                    echo "" >/sys/devices/system/cpu/sched/set_sched_isolation 2>/dev/null
                for i in $(seq 0 9); do
                    [ "$ST_MODE" = "apply" ] && [ -f /sys/devices/system/cpu/sched/set_sched_deisolation ] &&
                        echo "$i" >/sys/devices/system/cpu/sched/set_sched_deisolation 2>/dev/null
                done
                lock_val "0" /sys/devices/system/cpu/sched/hint_enable
                lock_val "65" /sys/devices/system/cpu/sched/hint_load_thresh
                for i in 0 1 2; do
                    lock_val_k ppmlimit "$i 3200000" /proc/ppm/policy/hard_userlimit_max_cpu_freq
                    lock_val_k ppmlimit "$i 3200000" /proc/ppm/policy/hard_userlimit_min_cpu_freq
                done
            fi
            if want_thermal; then
                lock_val_k num "0" /proc/ppm/cobra_limit_to_budget
                lock_val_k num "0" /proc/ppm/cobra_budget_to_limit
                lock "/proc/ppm/policy/*"
                lock "/proc/ppm/*"
                for i in $(seq 0 8); do
                    lock_val_k gpulimit "$i 0 0" /proc/gpufreq/gpufreq_limit_table
                done
                lock_val_k gpulimit "1 1 1" /proc/gpufreq/gpufreq_limit_table
                mask_val "0" /sys/kernel/eara_thermal/enable
            fi
        fi
    else
        BUS_DIR="/sys/devices/system/cpu/bus_dcvs"
        if want_perf; then
            for d in $(ls "$BUS_DIR" 2>/dev/null); do
                [ -f "$BUS_DIR/$d/hw_max_freq" ] || continue
                MAX_FREQ="$(cat "$BUS_DIR/$d/hw_max_freq")"
                for df in $(ls "$BUS_DIR/$d"); do
                    lock_val "$MAX_FREQ" "$BUS_DIR/$d/$df/max_freq"
                done
            done
        fi

        n="$(cat /sys/class/kgsl/kgsl-3d0/num_pwrlevels 2>/dev/null)"
        if [ -n "$n" ] && [ "$n" -gt 0 ]; then
            MIN_PWRLVL=$((n - 1))
            mask_val "$MIN_PWRLVL" /sys/class/kgsl/kgsl-3d0/default_pwrlevel
            mask_val "$MIN_PWRLVL" /sys/class/kgsl/kgsl-3d0/min_pwrlevel
        fi
        want_thermal && mask_val "0" /sys/class/kgsl/kgsl-3d0/thermal_pwrlevel
        want_perf && mask_val "0" /sys/class/kgsl/kgsl-3d0/bus_split
        mask_val "0" /sys/class/kgsl/kgsl-3d0/force_bus_on
        mask_val "0" /sys/class/kgsl/kgsl-3d0/force_clk_on
        mask_val "0" /sys/class/kgsl/kgsl-3d0/force_no_nap
        mask_val "0" /sys/class/kgsl/kgsl-3d0/force_rail_on
        want_thermal && mask_val "0" /sys/class/kgsl/kgsl-3d0/throttling
        mask_val "0" /proc/sys/walt/sched_boost
        mask_val "0" /sys/module/metis/parameters/cluaff_control
        mask_val "0" /sys/module/metis/parameters/mi_fboost_enable
        mask_val "0" /sys/module/metis/parameters/mi_freq_enable
        mask_val "0" /sys/module/metis/parameters/mi_link_enable
        mask_val "0" /sys/module/metis/parameters/mi_switch_enable
        mask_val "0" /sys/module/metis/parameters/mi_viptask
        mask_val "0" /sys/module/metis/parameters/mpc_fboost_enable
        mask_val "0" /sys/module/metis/parameters/vip_link_enable
        mask_val "0" /sys/module/perfmgr/parameters/perfmgr_enable
    fi

    want_mid && mask_val "0" /sys/module/cpufreq_bouncing/parameters/enable
    mask_val "0" /proc/task_info/task_sched_info/task_sched_info_enable
    mask_val "0" /proc/oplus_scheduler/sched_assist/sched_assist_enabled
}


miui_migt() {
    local migt glk
    [ -n "$(getprop ro.miui.ui.version.name)" ] || return 0

    migt=/sys/module/migt/parameters
    if [ -e $migt ]; then
        lock_val '0:0 1:0 2:0 3:0 4:0 5:0 6:0 7:0' $migt/migt_freq
        lock_val '0' $migt/mi_freq_enable
        lock_val '0' $migt/force_stask_to_big
        lock_val '0' $migt/force_reset_runtime
        if want_mid; then
            lock_val '0' $migt/glk_freq_limit_start
            lock_val '0' $migt/glk_freq_limit_walt
            lock_val '0 0 0' $migt/glk_maxfreq
            lock_val '0 0 0' $migt/migt_ceiling_freq
            lock_val '1' $migt/glk_disable
            lock_val '0' $migt/glk_fbreak_enable
        fi
        want_perf && st_setting secure speed_mode_enable 1
        perm_val 000 "$migt/*"
        perm_val 000 /sys/module/migt
        perm_val 000 /sys/module/sched_walt/holders/migt/parameters
    fi

    glk=/proc/sys/glk
    if [ -d $glk ] && want_mid; then
        lock_val '1' $glk/glk_disable
        lock_val '0' $glk/freq_break_enable
        lock_val '0 0 0' $glk/game_maxfreq_limit
        lock_val '30 30 30' $glk/game_lowspeed_load
        lock_val '80 80 80' $glk/game_hispeed_load
    fi

    migt=/proc/sys/migt
    if [ -d $migt ]; then
        lock_val '0' $migt/force_stask_tob
        lock_val '0' $migt/enable_pkg_monitor
        lock_val '0' $migt/boost_pid
    fi

    perm_val 000 /sys/class/misc/migt
    perm_val 000 /sys/module/sched_walt/holders/migt
}


UPERF_PIDS() {
    pidof uperf 2>/dev/null
}

uperf_start() {
    local i p t cfg
    lock_val "1048576" /proc/sys/fs/inotify/max_queued_events
    lock_val "1048576" /proc/sys/fs/inotify/max_user_watches
    lock_val "1024" /proc/sys/fs/inotify/max_user_instances

    printf '%s\n' "# generated by geode daemon, edit geode.conf instead" "* $1" "- $1" >"$USER_PATH/perapp_powermode.txt"
    echo "$1" >"$USER_PATH/cur_powermode.txt"

    cfg="$USER_PATH/uperf.json"
    if [ "$UPERF_TOUCH" = "0" ]; then
        cfg="$STATE_DIR/uperf_notouch.json"
        awk '/"input"[ \t]*:/ { f = 1 } f && /"enable"/ { sub(/true/, "false"); f = 0 } { print }' \
            "$USER_PATH/uperf.json" >"$cfg" 2>/dev/null || cfg="$USER_PATH/uperf.json"
    fi

    mv -f "$USER_PATH/uperf_log.txt" "$USER_PATH/uperf_log.txt.bak" 2>/dev/null
    "$BIN_PATH/uperf" "$cfg" -o "$USER_PATH/uperf_log.txt" </dev/null >/dev/null 2>&1 &

    for i in 1 2 3 4 5 6 7 8 9 10; do
        [ -n "$(UPERF_PIDS)" ] && break
        sleep 0.2
    done
    sleep 0.5
    for p in $(UPERF_PIDS); do
        for t in /proc/"$p"/task/*; do
            echo "${t##*/}" >/dev/cpuset/background/tasks 2>/dev/null
        done
    done
    [ -n "$(UPERF_PIDS)" ]
}

uperf_pause() {
    killall -STOP uperf 2>/dev/null
}

uperf_resume() {
    killall -CONT uperf 2>/dev/null
}

uperf_stop() {
    local i
    killall -CONT uperf 2>/dev/null
    killall uperf 2>/dev/null
    for i in 1 2 3 4 5 6 7 8 9 10; do
        [ -z "$(UPERF_PIDS)" ] && return 0
        sleep 0.2
    done
    killall -9 uperf 2>/dev/null
    sleep 0.2
}


apply_game_tweaks() {
    [ -n "$IS_MTK" ] || IS_MTK="$(is_mtk)"

    disable_kernel_boost
    disable_hotplug
    unify_sched
    unify_devfreq
    unify_lpm

    disable_userspace_thermal
    disable_userspace_boost

    [ "$IS_MTK" = "true" ] && mtk_once

    platform_special
    miui_migt
}

fix_cpu_governors() {
    local p g avail best want
    for p in /sys/devices/system/cpu/cpufreq/policy*; do
        [ -f "$p/scaling_governor" ] || continue
        read -r g <"$p/scaling_governor"
        case "$g" in powersave | userspace | performance) ;; *) continue ;; esac
        want=""
        [ -s "$BASELINE" ] && want="$(grep -F "|$p/scaling_governor|" "$BASELINE" | head -n1 | cut -d'|' -f5)"
        if [ -z "$want" ] || [ "$want" = "$g" ]; then
            read -r avail <"$p/scaling_available_governors"
            best=""
            for want in sugov_ext schedutil walt schedhorizon interactive; do
                case " $avail " in *" $want "*) best="$want"; break ;; esac
            done
            want="$best"
        fi
        [ -n "$want" ] || continue
        chmod 0666 "$p/scaling_governor" 2>/dev/null
        echo "$want" >"$p/scaling_governor" 2>/dev/null
        echo "${p##*/}: $g -> $want"
    done
}

uperf_sched_enabled() {
    awk '/"sched"[ \t]*:/ { s = 1 } s && /"enable"/ { print; exit }' "$USER_PATH_RAW/uperf.json" 2>/dev/null | grep -q true
}
