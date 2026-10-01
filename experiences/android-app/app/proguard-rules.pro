# Glance instantiates ActionCallback classes by name.
-keep class * implements androidx.glance.appwidget.action.ActionCallback { <init>(); }
# OkHttp ships its own consumer rules; silence optional platform warnings.
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
# Glance runs on WorkManager, whose Room database is created reflectively.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class * extends androidx.work.ListenableWorker { <init>(android.content.Context, androidx.work.WorkerParameters); }
-keep class * extends androidx.work.InputMerger { <init>(); }
-keep class androidx.work.** { <init>(...); }
