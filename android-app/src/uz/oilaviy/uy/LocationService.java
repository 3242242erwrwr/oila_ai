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

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;
    private final ExecutorService netPool = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean listeningRegistered = false;

    private double lastSentLat = Double.NaN;
    private double lastSentLon = Double.NaN;
    private float lastSentAcc = 20f;
    private volatile long lastSentAt = 0;
    private long lastMoveAt = 0;
    private long lastLocationFixTime = 0;
    private long lastGpsRealFixAt = 0;
    private long lastAlarmScheduledAt = 0;

    private final Runnable periodicTask = new Runnable() {
        @Override
        public void run() {
            ensureListening();
            pollAndHeartbeat();
            scheduleWatchdogAlarm();
            handler.postDelayed(this, 4000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        acquireWakeLock();
        startForegroundCompat();
        startListeningLocation();
        pollAndHeartbeat();
        scheduleWatchdogAlarm();
        handler.postDelayed(periodicTask, 4000);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        acquireWakeLock();
        startForegroundCompat();
        ensureListening();
        pollAndHeartbeat();
        scheduleWatchdogAlarm();
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Android 8+ da PendingIntent.getService xato berishining oldini olish uchun BroadcastReceiver orqali tiriltiramiz
        try {
            Intent restartIntent = new Intent(getApplicationContext(), BootReceiver.class);
            int piFlags = PendingIntent.FLAG_ONE_SHOT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(getApplicationContext(), 1, restartIntent, piFlags);
            AlarmManager am = (AlarmManager) getApplicationContext().getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                am.set(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 1500, pi);
            }
        } catch (Exception ignored) {}
        super.onTaskRemoved(rootIntent);
    }

    private void scheduleWatchdogAlarm() {
        long now = System.currentTimeMillis();
        if (now - lastAlarmScheduledAt < 45000L) return;
        lastAlarmScheduledAt = now;
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent i = new Intent(getApplicationContext(), BootReceiver.class);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(getApplicationContext(), 999, i, piFlags);
            long triggerAt = now + 60000L;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            } else {
                am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }
        } catch (Exception ignored) {}
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

        // Agar oxirgi GPS keshda yangi koordinata bo'lsa darrov tekshiramiz (ba'zi telefonlarda callback kechikishi mumkin)
        if (locationManager != null) {
            try {
                Location gps = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                if (gps != null && gps.getTime() > lastLocationFixTime && (!gps.hasAccuracy() || gps.getAccuracy() <= 50f)) {
                    lastGpsRealFixAt = now;
                    lastLocationFixTime = gps.getTime();
                    considerSending(gps);
                    return;
                }
            } catch (Exception ignored) {}
        }

        if (now - lastSentAt < 18000L) return;

        // Agar tayanch nuqtamiz bo'lsa, turgan joyidan tebrantirmasdan jonli heartbeat yuboramiz
        if (!Double.isNaN(lastSentLat) && !Double.isNaN(lastSentLon)) {
            sendAnchoredHeartbeat();
            return;
        }

        // Birinchi ishga tushganda NETWORK dan boshlang'ich nuqta olamiz
        if (locationManager != null) {
            try {
                Location net = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                if (net != null && (!net.hasAccuracy() || net.getAccuracy() <= 45f)) {
                    if (net.getTime() > 0) lastLocationFixTime = net.getTime();
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

        if (loc.getTime() > 0 && lastLocationFixTime > 0 && loc.getTime() + 1500L < lastLocationFixTime) {
            return;
        }

        boolean isGps = LocationManager.GPS_PROVIDER.equals(provider);
        if (isGps) {
            if (acc > 55f) return;
            lastGpsRealFixAt = now;
            if (loc.getTime() > 0) lastLocationFixTime = loc.getTime();
            considerSending(loc);
            return;
        }

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
        if (acc > 55f && !Double.isNaN(lastSentLat)) return;
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

        if (!first && lastMoveAt > 0) {
            double dtSec = Math.max(1.0, (now - lastMoveAt) / 1000.0);
            if ((distMoved / dtSec) > 75.0 && acc > 12f) {
                return;
            }
        }

        double minRealMove = acc <= 15f ? 7.0 : Math.min(22.0, Math.max(12.0, acc * 0.9));

        if (first || distMoved >= minRealMove) {
            if (!first && (now - lastSentAt) < 2200L) {
                return;
            }
            lastSentLat = lat;
            lastSentLon = lon;
            lastSentAcc = acc;
            lastSentAt = now;
            lastMoveAt = now;
            sendAsyncLocation(uid, lat, lon, acc, speedKmh, provider);
        } else if (now - lastSentAt >= 18000L) {
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
                    lastSentAt = Math.min(lastSentAt, System.currentTimeMillis() - 13000L);
                }
            }
        });
    }

    private void sendHeartbeatPingOnly() {
        final String uid = getUid();
        if (uid.isEmpty()) return;

        final long now = System.currentTimeMillis();
        if (now - lastSentAt < 18000L) return;
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
