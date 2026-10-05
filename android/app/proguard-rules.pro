# Arena AI (fan-made)
# JavascriptInterface köprüsü ve izleyici sınıfları karıştırılmamalı.
-keepclassmembers class com.fanmade.arenaai.web.JsBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.fanmade.arenaai.monitor.** { *; }
-keep class com.fanmade.arenaai.notifications.** { *; }
-keepattributes *Annotation*
-keepattributes JavascriptInterface
