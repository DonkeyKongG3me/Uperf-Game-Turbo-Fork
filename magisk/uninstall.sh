#!/system/bin/sh

USER_PATH=/sdcard/Android/yc/uperf

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

on_remove() {
    wait_until_login
    cp -af $USER_PATH/boost.conf /sdcard/boost.conf.keep 2>/dev/null
    rm -rf $USER_PATH
    if [ -f /sdcard/boost.conf.keep ]; then
        mkdir -p $USER_PATH
        mv /sdcard/boost.conf.keep $USER_PATH/boost.conf
    fi
    rm -f /data/powercfg*
    rm -rf /dev/uperf_boost /dev/uperf_geode /data/adb/uperf_ui
}

(on_remove &)
