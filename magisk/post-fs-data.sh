#!/system/bin/sh

MODDIR=${0%/*}

if [ -f "$MODDIR/flag/need_recuser" ]; then
    rm -f "$MODDIR/flag/need_recuser"
    true >"$MODDIR/disable"
else
    true >"$MODDIR/flag/need_recuser"
fi
