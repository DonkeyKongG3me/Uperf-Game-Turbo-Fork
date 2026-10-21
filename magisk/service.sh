#!/system/bin/sh

MODDIR=${0%/*}
BB="$MODDIR/bin/busybox/busybox"

boot_ok() {
    while [ "$(getprop sys.boot_completed)" != "1" ]; do
        sleep 2
    done
    rm -f "$MODDIR/flag/need_recuser"
}

(boot_ok &)

data/powercfg.sh /data/powercfg-base.sh /data/powercfg.json

chmod 0755 "$BB" "$MODDIR/bin/uperf"
"$BB" --install -s "$MODDIR/bin/busybox"

ASH_STANDALONE=1 nohup "$BB" sh "$MODDIR/script/boost_daemon.sh" >/dev/null 2>&1 &
