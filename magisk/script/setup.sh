#!/system/bin/sh

BASEDIR="$(dirname "$(readlink -f "$0")")"
. "$BASEDIR/pathinfo.sh"
. "$BASEDIR/libsysinfo.sh"

abort() {
    echo "$1"
    echo "! Uperf Game Turbo installation failed."
    exit 1
}

set_perm() {
    chown "$2:$3" "$1"
    chmod "$4" "$1"
    chcon "$5" "$1"
}

set_perm_recursive() {
    find "$1" -type d 2>/dev/null | while read -r dir; do
        set_perm "$dir" "$2" "$3" "$4" "$6"
    done
    find "$1" -type f -o -type l 2>/dev/null | while read -r file; do
        set_perm "$file" "$2" "$3" "$5" "$6"
    done
}

install_uperf() {
    echo "- Finding platform-specific configuration..."
    echo "- ro.board.platform=$(getprop ro.board.platform)"
    echo "- ro.product.board=$(getprop ro.product.board)"
    
    local target
    local cfgname

    target="$(getprop ro.board.platform)"
    cfgname="$(get_config_name "$target")"

    if [ "$cfgname" = "unsupported" ]; then
        target="$(getprop ro.product.board)"
        cfgname="$(get_config_name "$target")"
    fi

    if [ "$cfgname" = "unsupported" ] || [ ! -f "$MODULE_PATH/config/$cfgname.json" ]; then
        abort "! Target chipset [$target] is not supported."
    fi

    echo "- Using configuration: $cfgname.json"
    echo "- Uperf config directory: $USER_PATH"

    mkdir -p "$USER_PATH"
    mv -f "$USER_PATH/uperf.json" "$USER_PATH/uperf.json.bak" 2>/dev/null
    cp -f "$MODULE_PATH/config/$cfgname.json" "$USER_PATH/uperf.json"
    rm -rf "$MODULE_PATH/config"
    
    set_perm_recursive "$BIN_PATH" 0 0 0755 0755 u:object_r:system_file:s0
}

fix_module_prop() {
    mkdir -p /data/adb/modules/uperf/
    cp -f "$MODULE_PATH/module.prop" /data/adb/modules/uperf/module.prop
}

if [ -n "$SUKISU_ULTRA" ] || [ -d "/data/adb/sukisu_ultra" ]; then
    ROOT_NAME="SukiSu Ultra"
    HAS_NATIVE_WEBUI=true
elif [ -n "$RESUKISU" ] || [ -d "/data/adb/resukisu" ]; then
    ROOT_NAME="ReSukiSu"
    HAS_NATIVE_WEBUI=true
elif [ -n "$APATCH" ]; then
    ROOT_NAME="APatch"
    HAS_NATIVE_WEBUI=true
elif [ -n "$KSU" ]; then
    ROOT_NAME="KernelSU / KernelSU Next"
    HAS_NATIVE_WEBUI=true
else
    ROOT_NAME="Magisk"
    HAS_NATIVE_WEBUI=false
fi

echo "  Uperf URL: https://github.com/yc9559/uperf/"
echo "  Uperf Game Turbo URL: https://github.com/yinwanxi/Uperf-Game-Turbo"
echo "  Author: @DonkeyKongG3me on Telegram"

echo ""

install_uperf

echo ""
echo "* Root manager detected: $ROOT_NAME"

fix_module_prop

if [ "$HAS_NATIVE_WEBUI" = false ]; then
    if ! pm path io.github.a13e300.ksuwebui >/dev/null 2>&1 && ! pm path com.dergoogler.mmrl.wx >/dev/null 2>&1; then
        echo ""
        echo "! Magisk requires WebUI X (recommended) or KSU WebUI Standalone to display settings."
        echo "  Tapping the Action button will open the web browser download page."
    fi
fi

if [ -d /data/adb/modules/asoul_affinity_opt ]; then
    echo ""
    echo "! Warning: AsoulOpt detected (running globally). Remove it via your Root Manager if you prefer purely stock behavior."
fi

echo ""
echo "====================================================="
echo " ‼️  ACTION REQUIRED TO OPEN SETTINGS  ‼️"
echo " Use the module's 「▶️ ACTION 」 button inside your"
echo " root manager to open the WebUI settings interface!"
echo "====================================================="
echo ""
echo "* Installation complete. Please reboot your device."
