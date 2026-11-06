#!/system/bin/sh
MODDIR=${0%/*}
ID="$(grep '^id=' "$MODDIR/module.prop" | cut -d= -f2)"
[ -n "$ID" ] || ID=uperf
if [ -n "$KSU" ] || [ -n "$APATCH" ]; then
    echo "- Open the settings with this module's WebUI button."
    echo
    sh "$MODDIR/script/ctl.sh" status
    exit 0
fi
launch() {
    local out
    out="$(am start "$@" 2>&1)"
    case "$out" in *Error* | *Exception* | *"does not exist"*) return 1 ;; esac
    return 0
}
WX_CLS="com.dergoogler.mmrl.wx"
wx_activity() {
    case "$(dumpsys package "$1" 2>/dev/null)" in
    *".ui.webui.WebUIActivity"*) echo "$1/$WX_CLS.ui.webui.WebUIActivity" ;;
    *) echo "$1/$WX_CLS.ui.activity.webui.WebUIActivity" ;;
    esac
}
for WX in com.dergoogler.mmrl.wx com.dergoogler.mmrl.wx.debug; do
    pm path "$WX" >/dev/null 2>&1 || continue
    echo "- Opening settings in WebUI X..."
    launch -a android.intent.action.VIEW -f 0x08080000 -n "$(wx_activity "$WX")" -e MODULE_ID "$ID" && exit 0
    launch -n "$WX/$WX_CLS.ui.activity.MainActivity" && echo "  Couldn't open the module page directly. Tap Uperf Game Turbo in WebUI X." && exit 0
done
if pm path io.github.a13e300.ksuwebui >/dev/null 2>&1; then
    echo "- Opening settings in KSU WebUI Standalone..."
    echo "  (tip: WebUI X lets the back gesture go back a page instead of closing)"
    launch -n "io.github.a13e300.ksuwebui/.WebUIActivity" -e id "$ID" -e name "Uperf Game Turbo" && exit 0
fi
echo "! The settings screen is a WebUI. On Magisk it needs one of these free apps:"
echo "   - WebUI X (recommended): github.com/MMRLApp/WebUI-X-Portable/releases"
echo "   - KSU WebUI Standalone: github.com/KOWX712/KsuWebUIStandalone/releases"
echo "  Install one, then press Action again."
echo "- Opening the WebUI X download page..."
am start -a android.intent.action.VIEW -d "https://github.com/MMRLApp/WebUI-X-Portable/releases/latest" >/dev/null 2>&1
echo
sh "$MODDIR/script/ctl.sh" status
