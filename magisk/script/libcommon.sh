#!/system/bin/sh

# $1:value $2:list
has_val_in_list() {
    for item in $2; do
        if [ "$1" = "$item" ]; then
            echo "true"
            return
        fi
    done
    echo "false"
}

wait_until_login() {
    while [ "$(getprop sys.boot_completed)" != "1" ]; do
        sleep 1
    done

    local test_file="/sdcard/Android/.PERMISSION_TEST"
    true >"$test_file"
    while [ ! -f "$test_file" ]; do
        true >"$test_file"
        sleep 1
    done
    rm "$test_file"
}


log() {
    echo "$1" >>"$LOG_FILE"
}

clear_log() {
    true >"$LOG_FILE"
}

glog() {
    echo "$(date '+%m-%d %H:%M:%S') $1" >>"$GAME_LOG"
}

glog_trim() {
    if [ -f "$GAME_LOG" ] && [ "$(wc -l <"$GAME_LOG")" -gt 400 ]; then
        tail -n 200 "$GAME_LOG" >"$GAME_LOG.tmp" && mv -f "$GAME_LOG.tmp" "$GAME_LOG"
    fi
}
