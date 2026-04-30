-keep class com.vitallcam.android.** { *; }
-keep class com.jiangdg.ausbc.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
