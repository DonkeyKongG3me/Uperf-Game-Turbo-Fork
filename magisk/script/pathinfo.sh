#!/system/bin/sh

MODULE_PATH="$(dirname "$(readlink -f "$0")")"
MODULE_PATH="${MODULE_PATH%/script}"
SCRIPT_PATH="$MODULE_PATH/script"
BIN_PATH="$MODULE_PATH/bin"
FLAG_PATH="$MODULE_PATH/flag"

USER_PATH="/sdcard/Android/yc/uperf"
USER_PATH_RAW="/data/media/0/Android/yc/uperf"
CONF_FILE="$USER_PATH_RAW/boost.conf"
OLD_CONF_FILE="$USER_PATH_RAW/geode.conf"
GAME_LOG="$USER_PATH/boost.log"
LOG_FILE="$USER_PATH/apply.log"

STATE_DIR="/dev/uperf_boost"

PATH="$BIN_PATH/busybox:$PATH"
