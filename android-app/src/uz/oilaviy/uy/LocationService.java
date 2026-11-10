package uz.oilaviy.uy;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocationService extends Service implements LocationListener {
    private static final String CHANNEL_ID = "family_gps_channel";
    private static final int NOTIF_ID = 777;
    private static final String API_URL = "https://oila-ai.onrender.com/api/action";
    private static final String ACTION_HEARTBEAT = "uz.oilaviy.uy.HEARTBEAT";

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;
    private final ExecutorService netPool = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean listeningRegistered = false;

    private double lastSentLat = Double.NaN;
    private double lastSentLon = Double.NaN;
    private float lastSentAcc = 20f;
    private long lastSentAt = 0;
    private long lastMoveAt = 0;
    private long lastLocationFixTime = 0;
    private long lastGpsRealFixAt = 0;

    private final Runnable periodicTask = new Runnable() {
        @Override
        public void run() {
            ensureListening();
            pollAndHeartbeat();
            scheduleNextAlarm();
            handler.postDelayed(this, 5000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        acquireWakeLock();
        startForegroundCompat();
        startListeningLocation();
        pollAndHeartbeat();
        scheduleNextAlarm();
        handler.postDelayed(periodicTask, 5000);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        acquireWakeLock();
        startForegroundCompat();
        ensureListening();
        pollAndHeartbeat();
        scheduleNextAlarm();
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        try {
            Intent restartServiceIntent = new Intent(getApplicationContext(), LocationService.class);
            restartServiceIntent.setPackage(getPackageName());
            int piFlags = PendingIntent.FLAG_ONE_SHOT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getService(getApplicationContext(), 1, restartServiceIntent, piFlags);
            AlarmManager am = (AlarmManager) getApplicationContext().getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                am.set(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 1000, pi);
            }
        } catch (Exception ignored) {}
        super.onTaskRemoved(rootIntent);
    }

    private void scheduleNextAlarm() {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(this, LocationService.class);
            i.setAction(ACTION_HEARTBEAT);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getService(this, 999, i, piFlags);
            long triggerAt = System.currentTimeMillis() + 20000L;

            if (Build.VERSION.SDK_INT >= 31) {
                if (am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }
        } catch (Exception e) {
            try {
                AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
                if (am != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent i = new Intent(this, LocationService.class);
                    i.setAction(ACTION_HEARTBEAT);
                    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
                    PendingIntent pi = PendingIntent.getService(this, 999, i, piFlags);
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 20000L, pi);
                }
            } catch (Exception ignored) {}
        }
    }

    @SuppressLint("WakelockTimeout")
    private void acquireWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) return;
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OilaviyUy::GpsWakeLock");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (Exception ignored) {}
    }

    private void startForegroundCompat() {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID,
                        "Oilaviy Uy Jonli Joylashuv",
                        NotificationManager.IMPORTANCE_LOW
                );
                ch.setDescription("24/7 fon rejimida oilaviy xarita uchun jonli joylashuvni uzatadi");
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }

            Intent openIntent = new Intent(this, MainActivity.class);
            int piFlags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                    : PendingIntent.FLAG_UPDATE_CURRENT;
            PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent, piFlags);

            Notification.Builder nb = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Notification.Builder(this, CHANNEL_ID)
                    : new Notification.Builder(this);

            nb.setContentTitle("🏠 Oilaviy Uy")
              .setContentText("🟢 24/7 Aniq GPS datchigi faol")
              .setSmallIcon(R.drawable.ic_launcher)
              .setContentIntent(pi)
              .setOngoing(true);

            Notification notif = nb.build();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIF_ID, notif);
            }
        } catch (Exception ignored) {}
    }

    private void ensureListening() {
        if (!listeningRegistered) {
            startListeningLocation();
        }
    }

    @SuppressLint("MissingPermission")
    private void startListeningLocation() {
        if (!hasLocationPerm()) return;
        try {
            if (locationManager == null) {
                locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            }
            if (locationManager == null) return;
            try {
                locationManager.removeUpdates(this);
            } catch (Exception ignored) {}

            boolean registeredAny = false;
            try {
                if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 0f, this, Looper.getMainLooper());
                    registeredAny = true;
                }
            } catch (Exception ignored) {}
            try {
                if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15000L, 0f, this, Looper.getMainLooper());
                    registeredAny = true;
                }
            } catch (Exception ignored) {}
            listeningRegistered = registeredAny;
        } catch (Exception ignored) {}
    }

    private boolean hasLocationPerm() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressLint("MissingPermission")
    private void pollAndHeartbeat() {
        if (!hasLocationPerm()) return;
        final long now = System.currentTimeMillis();

        // Agar yaqinda signal yuborilgan bo'lsa (20 soniya ichida), ortiqcha heartbeat shart emas
        if (now - lastSentAt < 20000L) return;

        // Agar tayanch nuqtamiz bo'lsa, turgan joyidan tebrantirmasdan jonli heartbeat yuboramiz
        if (!Double.isNaN(lastSentLat) && !Double.isNaN(lastSentLon)) {
            sendAnchoredHeartbeat();
            return;
        }

        // Hali hech qanday koordinata olinmagan bo'lsa, oxirgi toza GPS ni tekshiramiz
        if (locationManager != null) {
            try {
                Location gps = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (gps != null && (!gps.hasAccuracy() || gps.getAccuracy() <= 50f)) {
                    considerSending(gps);
                    return;
                }
                Location net = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                if (net != null && (!net.hasAccuracy() || net.getAccuracy() <= 45f)) {
                    considerSending(net);
                    return;
                }
            } catch (Exception ignored) {}
        }

        sendHeartbeatPingOnly();
    }

    @Override
    public void onLocationChanged(Location loc) {
        if (loc == null) return;
        final long now = System.currentTimeMillis();
        final String provider = loc.getProvider() != null ? loc.getProvider() : "";
        final float acc = loc.hasAccuracy() ? loc.getAccuracy() : 20f;

        // Eski keshlangan nuqta hech qachon yangisini orqaga tortmasligi uchun vaqt tekshiruvi:
        if (loc.getTime() > 0 && lastLocationFixTime > 0 && loc.getTime() + 1500L < lastLocationFixTime) {
            return;
        }

        boolean isGps = LocationManager.GPS_PROVIDER.equals(provider);
        if (isGps) {
            if (acc > 50f) return;
            lastGpsRealFixAt = now;
            if (loc.getTime() > 0) lastLocationFixTime = loc.getTime();
            considerSending(loc);
            return;
        }

        // NETWORK_PROVIDER: agar oxirgi 60 soniyada toza GPS ishlagan bo'lsa YOKI bizda allaqachon aniq nuqta bo'lsa -> uyali antenna sakrashini BLOKLAYMIZ!
        if (!Double.isNaN(lastSentLat) && (now - lastGpsRealFixAt < 120000L || acc > 35f)) {
            return;
        }
        if (acc > 45f) return;
        if (loc.getTime() > 0) lastLocationFixTime = loc.getTime();
        considerSending(loc);
    }

    private void considerSending(final Location loc) {
        if (loc == null) return;
        final float acc = loc.hasAccuracy() ? loc.getAccuracy() : 15f;
        if (acc > 50f && !Double.isNaN(lastSentLat)) return;
        if (acc > 80f) return;

        final String uid = getUid();
        if (uid.isEmpty()) return;

        final double lat = loc.getLatitude();
        final double lon = loc.getLongitude();
        final long now = System.currentTimeMillis();
        final String provider = loc.getProvider() != null ? loc.getProvider() : "gps";
        final float speedKmh = loc.hasSpeed() ? Math.max(0f, loc.getSpeed() * 3.6f) : 0f;

        boolean first = Double.isNaN(lastSentLat);
        double distMoved = first ? Double.POSITIVE_INFINITY : distanceMeters(lastSentLat, lastSentLon, lat, lon);

        // GPS sakrash (teleport) filtri: 1 soniyada 270 km/soatdan tez sakrasa va aniqligi 12m dan yomon bo'lsa rad etamiz
        if (!first && lastMoveAt > 0) {
            double dtSec = Math.max(1.0, (now - lastMoveAt) / 1000.0);
            if ((distMoved / dtSec) > 75.0 && acc > 12f) {
                return;
            }
        }

        // Harakatlanish chegarasi: GPS aniq bo'lsa (<=15m) atigi 7m, aks holda 12-22m
        double minRealMove = acc <= 15f ? 7.0 : Math.min(22.0, Math.max(12.0, acc * 0.9));

        if (first || distMoved >= minRealMove) {
            // Tez yurayotganda serverni bosib tashlamaslik uchun kamida 2.2 soniya oraliq
            if (!first && (now - lastSentAt) < 2200L) {
                return;
            }
            lastSentLat = lat;
            lastSentLon = lon;
            lastSentAcc = acc;
            lastSentAt = now;
            lastMoveAt = now;
            sendAsyncLocation(uid, lat, lon, acc, speedKmh, provider);
        } else if (now - lastSentAt >= 20000L) {
            // Turgan joyda tebranmasligi uchun aynan oxirgi turgan nuqta (lastSentLat, lastSentLon) yuboriladi
            lastSentAt = now;
            sendAsyncLocation(uid, lastSentLat, lastSentLon, lastSentAcc, 0f, provider);
        }
    }

    private void sendAnchoredHeartbeat() {
        final String uid = getUid();
        if (uid.isEmpty()) return;
        lastSentAt = System.currentTimeMillis();
        sendAsyncLocation(uid, lastSentLat, lastSentLon, lastSentAcc, 0f, "heartbeat");
    }

    private String getUid() {
        SharedPreferences sp = getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        String uid = sp.getString("uid", "");
        return uid == null ? "" : uid.trim();
    }

    private void sendAsyncLocation(final String uid, final double lat, final double lon, final float acc, final float speedKmh, final String provider) {
        netPool.execute(new Runnable() {
            @Override
            public void run() {
                boolean ok = postLocation(uid, lat, lon, acc, speedKmh, provider);
                if (!ok) {
                    // Tarmoq uzilib qolsa 5 soniyadan keyin qayta urinib ko'rish uchun
                    lastSentAt = Math.min(lastSentAt, System.currentTimeMillis() - 15000L);
                }
            }
        });
    }

    private void sendHeartbeatPingOnly() {
        final String uid = getUid();
        if (uid.isEmpty()) return;

        final long now = System.currentTimeMillis();
        if (now - lastSentAt < 20000L) return;
        lastSentAt = now;

        netPool.execute(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(API_URL);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(6000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

                    String json = "{\"type\":\"apk_ping\",\"id\":" + uid + ",\"source\":\"android_apk\"}";
                    byte[] body = json.getBytes(StandardCharsets.UTF_8);
                    conn.setFixedLengthStreamingMode(body.length);
                    OutputStream os = conn.getOutputStream();
                    os.write(body);
                    os.flush();
                    os.close();
                    conn.getResponseCode();
                } catch (Exception ignored) {
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        });
    }

    private boolean postLocation(String uid, double lat, double lon, float acc, float speedKmh, String provider) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(API_URL);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

            String safeProv = provider == null ? "gps" : provider.replace("\"", "");
            String json = "{\"type\":\"auto_location\",\"id\":" + uid
                    + ",\"source\":\"android_apk\""
                    + ",\"provider\":\"" + safeProv + "\""
                    + ",\"speed\":" + Math.round(speedKmh)
                    + ",\"lat\":" + lat
                    + ",\"lon\":" + lon
                    + ",\"accuracy\":" + acc + "}";
            byte[] body = json.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(body.length);
            OutputStream os = conn.getOutputStream();
            os.write(body);
            os.flush();
            os.close();
            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static double distanceMeters(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371000.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2.0 * R * Math.asin(Math.sqrt(a));
    }

    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override
    public void onProviderEnabled(String provider) {
        listeningRegistered = false;
        startListeningLocation();
    }
    @Override public void onProviderDisabled(String provider) {}

    @Override
    public void onDestroy() {
        handler.removeCallbacks(periodicTask);
        listeningRegistered = false;
        try {
            if (locationManager != null) locationManager.removeUpdates(this);
        } catch (Exception ignored) {}
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
