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

if pm path com.dergoogler.mmrl.wx >/dev/null 2>&1; then
    echo "- Opening settings in WebUI X..."
    am start -n "com.dergoogler.mmrl.wx/.ui.activity.webui.WebUIActivity" -e MODULE_ID "$ID" -e MOD_ID "$ID" >/dev/null 2>&1 && exit 0
fi

if pm path io.github.a13e300.ksuwebui >/dev/null 2>&1; then
    echo "- Opening settings in KSU WebUI Standalone..."
    echo "  (tip: WebUI X lets the back gesture go back a page instead of closing)"
    am start -n "io.github.a13e300.ksuwebui/.WebUIActivity" -e id "$ID" >/dev/null 2>&1 && exit 0
fi

echo "! The settings screen is a WebUI. On Magisk it needs one of these free apps:"
echo "   - WebUI X (recommended): github.com/MMRLApp/WebUI-X-Portable/releases"
echo "   - KSU WebUI Standalone: github.com/KOWX712/KsuWebUIStandalone/releases"
echo "  Install one, then press Action again."
echo "- Opening the WebUI X download page..."
am start -a android.intent.action.VIEW -d "https://github.com/MMRLApp/WebUI-X-Portable/releases/latest" >/dev/null 2>&1
echo
sh "$MODDIR/script/ctl.sh" status
