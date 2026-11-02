#!/system/bin/sh
soc_model() {
	soc_model=$(getprop ro.soc.model)
	echo "$soc_model"
}
match_linux_version() {
	cat /proc/version | grep -i "$1"
}
get_socid() {
	if [ -f /sys/devices/soc0/soc_id ]; then
		cat /sys/devices/soc0/soc_id
	else
		cat /sys/devices/system/soc/soc0/id
	fi
}
get_nr_core() {
	cat /proc/stat | grep -c "cpu[0-9]"
}
get_maxfreq() {
	cat "/sys/devices/system/cpu/cpu$1/cpufreq/cpuinfo_max_freq"
}
get_socname() {
	cat "/sys/devices/soc0/machine" |  tr '[:upper:]' '[:lower:]'
}
is_aarch64() {
	if [ "$(getprop ro.product.cpu.abi)" = "arm64-v8a" ]; then
		echo "true"
	else
		echo "false"
	fi
}
is_eas() {
	if [ "$(grep sched /sys/devices/system/cpu/cpu0/cpufreq/scaling_available_governors)" != "" ]; then
		echo "true"
	else
		echo "false"
	fi
}
is_mtk() {
	soc_model="$(getprop ro.soc.model)"
	hw_check="$(getprop ro.hardware)
                    $(getprop ro.board.platform)
                    $(getprop ro.boot.hardware)
                    $(getprop ro.soc.manufacturer)
                    $soc_model"
	pattern='(mt[0-9]{4}|mediatek|dimensity|helio[ _-]g?[0-9]{2})'
	echo "$hw_check" | tr '[:upper:]' '[:lower:]' | grep -qE "$pattern"
	[ $? -eq 0 ] && echo "true" || echo "false"
}
miui_check() {
	if [ "$(printf '%s\n' "90" "$(getprop ro.miui.ui.version.name)" | sort -V | head -n1)" = "90" ]; then
		echo "true"
	else
		echo "false"
	fi
}
_get_sm6150_type() {
	case "$(get_socid)" in
	365 | 366) echo "sdm730" ;;
	355 | 369) echo "sdm675" ;;
	esac
}
_get_sdm76x_type() {
	if [ "$(get_maxfreq 7)" -gt 2300000 ]; then
		echo "sdm765"
	else
		echo "sdm750"
	fi
}
_get_lahaina_type() {
	if [ "$(get_maxfreq 7)" -gt 2600000 ]; then
		echo "sdm888"
	else
		if [ "$(get_maxfreq 4)" -gt 2300000 ]; then
			echo "sdm778"
		else
			echo "sdm780"
		fi
	fi
}
_get_taro_type() {
	if [ "$(get_socname)" = cape ] || [ "$(get_socname)" = capep ] || [ "$(get_socname)" = ukee ] || [ "$(get_socname)" = ukeep ]; then
		echo "sdm8g1+"
	else
		if [ "$(get_socname)" = waipio ] || [ "$(get_socname)" = waipiop ]; then
			echo "sdm8g1"
		else
			echo "sdm7g1"
		fi
	fi
}
_get_volcano_type() {
	case "$(soc_model)" in
	*-AC | *-ac) echo "sdm7sg4" ;;
	*) echo "sdm7sg3" ;;
	esac
}
_get_pinekala_type() {
	if [ "$(soc_model)" = "SM8650" ]; then
		echo "sdm8g3"
	elif [ "$(soc_model)" = "SM8650Q" ]; then
		echo "sdm8g3q"
	else
		echo "sdm7+g3"
	fi
}
_get_kalama_type() {
	if [ "$(get_maxfreq 7)" -gt 3300000 ]; then
		echo "sdm8cxg2"
	else
		echo "sdm8g2"
	fi
}
_get_sun_type() {
	if [ "$(soc_model)" = "SM8750" ]; then
		echo "sdm8e"
	elif [ "$(soc_model)" = "SM8735" ]; then
		echo "sdm8sg4"
	else
		echo "sdm8e"
	fi
}
_get_rk30sdk() {
	if [ -d /sys/devices/system/cpu/cpu7 ]; then
		echo "rk3588"
	else
		echo "rk356"
	fi
}
get_config_name() {
	case "$1" in
	"rk30sdk") _get_rk30sdk ;;
	"pineapple") _get_pinekala_type ;;
	"kalama") _get_kalama_type ;;
	"taro") _get_taro_type ;;
	"lahaina") _get_lahaina_type ;;
	"shima") _get_lahaina_type ;;
	"yupik") _get_lahaina_type ;;
	"sun") _get_sun_type ;;
	"canoe") echo "sdm8eg5" ;;
	"volcano" | "sm7635") _get_volcano_type ;;
	"cliffs") echo "sdm8sg3" ;;
	"kona") echo "sdm865" ;;
	"msmnile") echo "sdm855" ;;
	"sdm845") echo "sdm845" ;;
	"lito") _get_sdm76x_type ;;
	"sm6150") _get_sm6150_type ;;
	"holi") echo "sdm695" ;;
	"sdm710") echo "sdm710" ;;
	"atoll") echo "sdm720" ;;
	"curtana") echo "sdm720" ;;
	"msm8960") echo "sdm600" ;;
	"msm8939") echo "sdm616" ;;
	"msm8916") echo "sdm616" ;;
	"MSM8916") echo "sdm616" ;;
	"sky") echo "sdm4g2" ;;
	"parrot") echo "sdm4g2" ;;
	"msm8937") echo "sdm439" ;;
	"msm8953") echo "sdm625" ;;
	"msm8953pro") echo "sdm625" ;;
	"msm8952Pro") echo "sdm653" ;;
	"msm8952") echo "sdm653" ;;
	"msm8976SG") echo "sdm653" ;;
	"sdm660") echo "sdm660" ;;
	"sdm636") echo "sdm660" ;;
	"trinket") echo "sdm665" ;;
	"bengal") echo "sdm680" ;;
	"msm8956") echo "sdm808" ;;
	"msm8992") echo "sdm808" ;;
	"msm8994") echo "sdm810" ;;
	"msm8998") echo "sdm835" ;;
	"msm8996") echo "sdm820" ;;
	"msm8909") echo "sdm210" ;;
	"msm8996pro") echo "sdm820" ;;
	"exynos850") echo "e850" ;;
	"exynos5") echo "e8895" ;;
	"s5e9925") echo "e2200" ;;
	"exynos2100") echo "e2100" ;;
	"s5e8825") echo "e1280" ;;
	"erd8825") echo "e1280" ;;
	"erd8835") echo "e1380" ;;
	"universal9925") echo "e2200" ;;
	"exynos1080") echo "e1080" ;;
	"exynos990") echo "e990" ;;
	"exynos7884B") echo "e7884" ;;
	"universal1080") echo "e1080" ;;
	"s5e9815") echo "e1080" ;;
	"erd9815_rt") echo "e1080" ;;
	"universal990") echo "e990" ;;
	"universal5420") echo "e5420" ;;
	"universal9825") echo "e9820" ;;
	"universal9820") echo "e9820" ;;
	"universal9810") echo "e9810" ;;
	"universal8895") echo "e8895" ;;
	"universal8890") echo "e8890" ;;
	"universal7420") echo "e7420" ;;
	"universal7884") echo "e7884" ;;
	"universal7884B") echo "e7884" ;;
	"mt6580") echo "mt6580" ;;
	"mt6765") echo "mtp35" ;;
	"mt6768") echo "mtg80" ;;
	"mt6750") echo "mtp10" ;;
	"OPPO R9m") echo "mtp10" ;;
	"mt6757") echo "mtp20" ;;
	"k57pv1_dm_64") echo "mtp20" ;;
	"mt6739") echo "mt6739" ;;
	"mt6755") echo "mt6755" ;;
	"mt6781") echo "mt6781" ;;
	"viva") echo "mt6781" ;;
	"fleur") echo "mt6781" ;;
	"mt6761") echo "mta22" ;;
	"mt6771") echo "mtp70" ;;
	"mt8167") echo "mt8167" ;;
	"mt8175") echo "mt8173" ;;
	"mt8173") echo "mt8173" ;;
	"mt6779") echo "mtp90" ;;
	"mt6789") echo "mtg99" ;;
	"mt6785") echo "mtg90t" ;;
	"Infinix-X6827") echo "mtg96" ;;
	"mt6827") echo "mtg96" ;;
	"mt6795") echo "mtx10" ;;
	"mt6797") echo "mtx20" ;;
	"mt6799") echo "mtx30" ;;
	"mt6833") echo "mtd720" ;;
	"mt6833p") echo "mtd720" ;;
	"mt6833v") echo "mtd720" ;;
	"mt6835") echo "mtd6000" ;;
	"mt6853") echo "mtd720" ;;
	"mt6873") echo "mtd820" ;;
	"mt6875") echo "mtd820" ;;
	"mt6877") echo "mtd920" ;;
	"mt6855") echo "mtd930" ;;
	"cancunf") echo "mtd930" ;;
	"mt6885") echo "mtd1000" ;;
	"mt6886") echo "mtd7000" ;;
	"mt6878") echo "mtd7300" ;;
	"mt6889") echo "mtd1000" ;;
	"mt6891") echo "mtd1200" ;;
	"mt6893") echo "mtd1200" ;;
	"mt6895") echo "mtd8100" ;;
	"rm6893") echo "mtd1200" ;;
	"mt6897") echo "mtd8300" ;;
	"mt6899") echo "mtd8400" ;;
	"mt6899v1_64") echo "mtd8400" ;;
	"mt6983") echo "mtd9000" ;;
	"mt6985") echo "mtd9200" ;;
	"mt6989") echo "mtd9300" ;;
	"mt6991") echo "mtd9400" ;;
	"mt6993") echo "mtd9500" ;;
	"gs101") echo "gs101" ;;
	"gs201") echo "gs201" ;;
	"cheetah") echo "gs201" ;;
	"husky") echo "gs301" ;;
	"zuma") echo "gs301" ;;
	"shiba") echo "gs301" ;;
	"comet") echo "gs401" ;;
	"caiman") echo "gs401" ;;
	"tokay") echo "gs401" ;;
	"komodo") echo "gs401" ;;
	"zumapro") echo "gs401" ;;
	"PRL") echo "kirin65x" ;;
	"BLN") echo "kirin65x" ;;
	"hi6250") echo "kirin65x" ;;
	"kirin655") echo "kirin65x" ;;
	"kirin658") echo "kirin65x" ;;
	"kirin659") echo "kirin65x" ;;
	"MAR") echo "kirin710" ;;
	"INE") echo "kirin710" ;;
	"ANE") echo "kirin710" ;;
	"JSN") echo "kirin710" ;;
	"kirin710") echo "kirin710" ;;
	"JKM-AL20") echo "kirin710" ;;
	"STF") echo "kirin960" ;;
	"HWI") echo "kirin960" ;;
	"kirin960") echo "kirin960" ;;
	"hi3660") echo "kirin960" ;;
	"CMR") echo "kirin960" ;;
	"BKL") echo "kirin970" ;;
	"ALP") echo "kirin970" ;;
	"COR") echo "kirin970" ;;
	"kirin970") echo "kirin970" ;;
	"ELE") echo "kirin980" ;;
	"kirin980") echo "kirin980" ;;
	"kirin990") echo "kirin990" ;;
	"LIO-AL00") echo "kirin990" ;;
	"OXP-AN00") echo "kirin990" ;;
	"ANA-AN00") echo "kirin990" ;;
	"ELS-AN10") echo "kirin990" ;;
	"EBG-AN00") echo "kirin990" ;;
	"TAS-AN00") echo "kirin990" ;;
	"LIO-AN00P") echo "kirin990" ;;
	"OXF-AN00") echo "kirin990" ;;
	"OCE-AL50") echo "kirin990" ;;
	"SCMR-W09") echo "kirin990" ;;
	"TAH-AN00m") echo "kirin990" ;;
	"kirin9000") echo "kirin9000" ;;
	"JAD") echo "kirin9000" ;;
	"hi3650") echo "kirin955" ;;
	"FRD") echo "kirin955" ;;
	"EVA-TL00") echo "kirin955" ;;
	"kirin955") echo "kirin955" ;;
	"sp9863a") echo "sp9863" ;;
	"ums312") echo "t310" ;;
	"ums9230") echo "t606" ;;
	"ums9621") echo "t8200" ;;
	"ums512") echo "t618" ;;
	"ud710") echo "t710" ;;
	"ums9620") echo "t770" ;;
	"sp9832e") echo "sp9832" ;;
	"ums312_2h10") echo "t310" ;;
	"ums9230_1h10") echo "t606" ;;
	"ums512_1h10") echo "t618" ;;
	"ud710_7h10") echo "t710" ;;
	"ums9620_2h10") echo "t770" ;;
	"sp9832e_1h10") echo "sp9832" ;;
	"sp9863a_1h10") echo "sp9863" ;;
	"m2521") echo "t8200" ;;
	"tegra") echo "tegra" ;;
	"dragon") echo "tegra" ;;
	"tegraa210_dragon") echo "tegra" ;;
	"O1_asic") echo "xro1" ;;
	"song") echo "song1" ;;
	"rk356x") echo "rk356" ;;
	"rk3588") echo "rk3588" ;;
	*) echo "unsupported" ;;
	esac
}
detect_config() {
	local c
	c="$(get_config_name "$(getprop ro.board.platform)")"
	[ "$c" = "unsupported" ] && c="$(get_config_name "$(getprop ro.product.board)")"
	echo "$c"
}
chip_family() {
	case "$(detect_config)" in
	gs*) echo "pixel" ;;
	e[0-9]*) echo "exynos" ;;
	kirin*) echo "kirin" ;;
	t[0-9]* | sp*) echo "unisoc" ;;
	tegra*) echo "tegra" ;;
	rk*) echo "rockchip" ;;
	xro1) echo "xring" ;;
	song1) echo "surge" ;;
	mt*) echo "mediatek" ;;
	sdm*) echo "qualcomm" ;;
	*) if [ "$(is_mtk)" = "true" ]; then echo "mediatek"; else echo "other"; fi ;;
	esac
}
zone_hot() {
	local tp ty tt lo=""
	read -r tp 2>/dev/null <"$1/temp" || return 1
	for ty in "$1"/trip_point_*_type; do
		[ -f "$ty" ] || continue
		[ "$(cat "$ty" 2>/dev/null)" = "passive" ] || continue
		read -r tt 2>/dev/null <"${ty%_type}_temp" || continue
		case "$tt" in "" | *[!0-9-]*) continue ;; esac
		if [ -z "$lo" ] || [ "$tt" -lt "$lo" ]; then lo="$tt"; fi
	done
	[ -n "$lo" ] && [ "$tp" -ge "$lo" ] 2>/dev/null
}
thermal_cdevs() {
	local z c d t h hot=" "
	for z in /sys/class/thermal/thermal_zone*; do
		[ -f "$z/policy" ] || continue
		read -r t 2>/dev/null <"$z/policy"
		[ "$t" = "user_space" ] && continue
		if zone_hot "$z"; then h=1; else h=0; fi
		[ "$h" = 1 ] || continue
		for c in "$z"/cdev[0-9]*; do
			[ -L "$c" ] || continue
			d="$(readlink -f "$c")"
			hot="$hot${d##*/} "
		done
	done
	for d in /sys/class/thermal/cooling_device*; do
		[ -f "$d/type" ] && [ -f "$d/cur_state" ] || continue
		read -r t 2>/dev/null <"$d/type"
		case "$t" in *[Bb][Aa][Tt]* | *[Cc][Hh][Aa][Rr][Gg]* | *[Cc][Hh][Gg]* | *[Uu][Ss][Bb]*) continue ;; esac
		case "$t" in
		*[Cc][Pp][Uu]* | *[Gg][Pp][Uu]* | *[Tt][Pp][Uu]* | *[Gg]3[Dd]* | [Bb][Ii][Gg] | [Mm][Ii][Dd] | [Ll][Ii][Tt][Tt][Ll][Ee]) ;;
		*) continue ;;
		esac
		case "$hot" in *" ${d##*/} "*) echo "$d 1" ;; *) echo "$d 0" ;; esac
	done
}
