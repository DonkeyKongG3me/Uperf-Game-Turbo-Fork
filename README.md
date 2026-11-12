<div align="center">

<img src="assets/banner.png" alt="Uperf Game Turbo Fork Logo" width="200">

# Uperf Game Turbo

**Brand new performance module for Android supporting 118 CPUs, with 4 customizable profiles for every app.**

[![Release](https://img.shields.io/github/v/release/DonkeyKongG3me/Uperf-Game-Turbo-Fork?style=flat-square)](https://github.com/DonkeyKongG3me/Uperf-Game-Turbo-Fork/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/DonkeyKongG3me/Uperf-Game-Turbo-Fork/total?style=flat-square)](https://github.com/DonkeyKongG3me/Uperf-Game-Turbo-Fork/releases)
[![License](https://img.shields.io/github/license/DonkeyKongG3me/Uperf-Game-Turbo-Fork?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/DonkeyKongG3me/Uperf-Game-Turbo-Fork?style=flat-square)](https://github.com/DonkeyKongG3me/Uperf-Game-Turbo-Fork/stargazers)

</div>

## Overview:

 **Uperf Game Turbo** is a **revolutionary Magisk/APatch/KernelSU module** that offers **4 performance profiles that apply in select apps or your entire device**. It can dramatically improve the **speed and responsiveness of your device**, or improve the **battery life** if you decide to use efficient presets.
 
 ## QNA:

 ### Why do I need yet another performance module?
 
- **Good question.** This module is designed to activate performance profiles **only for apps you assign** so you don't have to remove it after one use. Stock performance returns as soon as you leave a boosted app.
 
 
 ### Is my device supported?
 
- **Most likely.** The module uses the original **Uperf-Game-Turbo's 118 CPU configs** (***with a little tweaks from my end***), so there's a high chance that your device is supported.

- **See the full supported CPU list here:** https://pastebin.com/YdXKdBuk
 
 ### Good to know:
 
- The installation script automatically checks if your device is supported. Sometimes, an **incorrect profile may be assigned to your device.** **Check what config was applied before rebooting!**
 
 ### Is it open source?
 
- Yes, **the entire module is open source.** Download the release you want to check and inspect the contents inside. Note that **some files come from the original uperf module,** which **may not be open source!**

---

### **Features:**

- **Performance profiles** that each app can use based on your choice.

- **Apply performance profiles** to the **entire device** or while your screen is off. (***V1.3+ required***)

- **4 performance profiles** ranging from ***Efficient*** to ***Extreme***

- 3 special **Screen Off profiles.**

- **Disable CPU throttling**, **spoof battery temperature**, **increase touch response** in boosted apps and **more** (***V1.1+ required***)

- Toggle to **disable & enable** the module in the UI (***No reboot required***)

- Sliders to change **how often** the module scans for **boosted apps**

- **2 UI styles** to pick from - **Miuix** and **M3E**

- **Gather useful logs** directly from the app that can be used for debugging

- ***and much more :)***

---

### ❗ Magisk dependency

You need to install [WebUI X](https://github.com/MMRLApp/WebUI-X-Portable/releases) (recommended) or [KSU WebUI Standalone](https://github.com/KOWX712/KsuWebUIStandalone/releases) to use this module. This is only required for Magisk.

---

### Screenshots:

<details>
<summary><b>Tap to view MIUIx screenshots</b></summary>
<br>
<p align="center">
  <img src="assets/miuix-1-home.jpg" alt="Homepage" height="320" /> &nbsp;
  <img src="assets/miuix-2-boosted.jpg" alt="App boost" height="320" />
  <br><br>
  <img src="assets/miuix-3-app-profile.jpg" alt="Boost profiles" height="320" /> &nbsp;
  <img src="assets/miuix-4-settings-appearance.jpg" alt="Appearance" height="320" />
  <br><br>
  <img src="assets/miuix-5-settings-options.jpg" alt="Settings" height="320" /> &nbsp;
  <img src="assets/miuix-6-settings-info.jpg" alt="Information" height="320" />
</p>
</details>


<details>
<summary><b>Tap to view M3e screenshots</b></summary>
<br>
<p align="center">
  <img src="assets/m3e-1-home.jpg" alt="Homepage" height="320" /> &nbsp;
  <img src="assets/m3e-2-boosted.jpg" alt="App boost" height="320" />
  <br><br>
  <img src="assets/m3e-3-app-profile.jpg" alt="Boost profiles" height="320" /> &nbsp;
  <img src="assets/m3e-4-settings-appearance.jpg" alt="Appearance" height="320" />
  <br><br>
  <img src="assets/m3e-5-settings-options.jpg" alt="Settings" height="320" /> &nbsp;
  <img src="assets/m3e-6-settings-info.jpg" alt="Information" height="320" />
</p>
</details>

---

### Performance overview

| Profile | Behavior |
| --- | --- |
| Efficient | Power saving profile that limits the CPU to 0.7W and ramp-up speed to 0.9ms. |
| Balanced | Balanced profile that limits the CPU to 2W and ramp-up speed to 0.2ms. |
| Rapid | Rapid profile that doesn't limit the CPU and ramp-up speed. |
| Extreme | Extreme profile that always runs the CPU and memory at 100% with no ramp delay. |

---

### 📩 How to install:

1. Download from the latest release.
2. Open your root manager and flash the module.
3. Reboot.
4. Open the module's settings. On KernelSU and APatch use the WebUI button. On Magisk press Action (WebUI X or KSU WebUI Standalone must be installed).
5. Choose the apps you want to boost.
6. Done!

## ⚖️ Licenses:

Distributed under the same license as the upstream projects. See [LICENSE](LICENSE) and the notices in the Credits section.
