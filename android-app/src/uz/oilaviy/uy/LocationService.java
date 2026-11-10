package uz.oilaviy.uy;

import android.Manifest;
import android.annotation.SuppressLint;
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
import android.os.SystemClock;

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

    private Location bestLocation = null;
    private double lastSentLat = Double.NaN;
    private double lastSentLon = Double.NaN;
    private float lastSentAcc = 15f;
    private volatile long lastSentAt = 0;
    private long lastGpsElapsedNs = 0;
    private long lastNetElapsedNs = 0;

    private final Runnable periodicTask = new Runnable() {
        @Override
        public void run() {
            pollAndSend();
            handler.postDelayed(this, 2000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        acquireWakeLock();
        startForegroundCompat();
        startListeningLocation();
        pollAndSend();
        handler.postDelayed(periodicTask, 2000);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        acquireWakeLock();
        startForegroundCompat();
        startListeningLocation();
        pollAndSend();
        return START_STICKY;
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
                ch.setDescription("24/7 Real-Time 1 Hz GPS kuzatuv");
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
              .setContentText("🟢 24/7 Real-Time GPS (1s) faol")
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

    @SuppressLint("MissingPermission")
    private void startListeningLocation() {
        if (!hasLocationPerm()) return;
        try {
            if (locationManager == null) {
                locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            }
            if (locationManager == null) return;
            try {
                if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this, Looper.getMainLooper());
                }
            } catch (Exception ignored) {}
            try {
                if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 4000L, 0f, this, Looper.getMainLooper());
                }
            } catch (Exception ignored) {}
            try {
                if (locationManager.isProviderEnabled(LocationManager.PASSIVE_PROVIDER)) {
                    locationManager.requestLocationUpdates(LocationManager.PASSIVE_PROVIDER, 4000L, 0f, this, Looper.getMainLooper());
                }
            } catch (Exception ignored) {}
        } catch (Exception ignored) {}
    }

    private boolean hasLocationPerm() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private long getElapsedNs(Location loc) {
        if (loc == null) return 0L;
        try {
            return loc.getElapsedRealtimeNanos();
        } catch (Exception e) {
            return 0L;
        }
    }

    private long ageMs(Location loc) {
        long ns = getElapsedNs(loc);
        if (ns <= 0L) return Long.MAX_VALUE / 2L;
        return Math.max(0L, (SystemClock.elapsedRealtimeNanos() - ns) / 1_000_000L);
    }

    @SuppressLint("MissingPermission")
    private void pollAndSend() {
        if (!hasLocationPerm() || locationManager == null) return;
        try {
            Location gps = null;
            Location net = null;
            Location passive = null;
            try { gps = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER); } catch (Exception ignored) {}
            try { net = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER); } catch (Exception ignored) {}
            try { passive = locationManager.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER); } catch (Exception ignored) {}

            Location candidate = pickBetter(gps, net);
            candidate = pickBetter(candidate, passive);
            candidate = pickBetter(bestLocation, candidate);
            if (candidate != null) {
                bestLocation = candidate;
                considerSending(candidate);
            } else {
                sendHeartbeatPingOnly();
            }
        } catch (Exception ignored) {}
    }

    private Location pickBetter(Location a, Location b) {
        if (a == null) return b;
        if (b == null) return a;

        boolean aIsGps = LocationManager.GPS_PROVIDER.equals(a.getProvider());
        boolean bIsGps = LocationManager.GPS_PROVIDER.equals(b.getProvider());
        float accA = a.hasAccuracy() ? a.getAccuracy() : 20f;
        float accB = b.hasAccuracy() ? b.getAccuracy() : 20f;
        long ageA = ageMs(a);
        long ageB = ageMs(b);

        if (aIsGps && !bIsGps && accA <= 40f && ageA < 25000L) return a;
        if (bIsGps && !aIsGps && accB <= 40f && ageB < 25000L) return b;

        // Yangiroq nuqta har doim g'olib (0.5s dan yangi bo'lsa darrov oladi!)
        if (ageB + 500L < ageA) return b;
        if (ageA + 500L < ageB) return a;
        return accB <= accA ? b : a;
    }

    @Override
    public void onLocationChanged(Location loc) {
        if (loc == null) return;
        long elNs = getElapsedNs(loc);
        boolean isGps = LocationManager.GPS_PROVIDER.equals(loc.getProvider());
        float acc = loc.hasAccuracy() ? loc.getAccuracy() : 20f;

        if (isGps) {
            if (elNs > 0L && lastGpsElapsedNs > 0L && elNs < lastGpsElapsedNs) {
                return;
            }
            if (elNs > 0L) lastGpsElapsedNs = elNs;
            // Yangi GPS kelgan zahoti kesh kutmasdan darhol yangilaymiz
            if (acc <= 45f || bestLocation == null || !LocationManager.GPS_PROVIDER.equals(bestLocation.getProvider())) {
                bestLocation = loc;
            } else {
                bestLocation = pickBetter(bestLocation, loc);
            }
            considerSending(bestLocation);
            return;
        }

        long sinceGpsMs = lastGpsElapsedNs > 0L ? (SystemClock.elapsedRealtimeNanos() - lastGpsElapsedNs) / 1_000_000L : Long.MAX_VALUE;
        if (sinceGpsMs < 25000L && bestLocation != null && (bestLocation.hasAccuracy() ? bestLocation.getAccuracy() : 20f) <= 40f) {
            return;
        }
        if (elNs > 0L && lastNetElapsedNs > 0L && elNs < lastNetElapsedNs) {
            return;
        }
        if (elNs > 0L) lastNetElapsedNs = elNs;
        bestLocation = pickBetter(bestLocation, loc);
        considerSending(bestLocation);
    }

    private void considerSending(final Location loc) {
        if (loc == null) return;
        final float acc = loc.hasAccuracy() ? loc.getAccuracy() : 15f;
        if (acc > 120f) return;

        SharedPreferences sp = getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        final String uid = sp.getString("uid", "");
        if (uid == null || uid.trim().isEmpty()) return;

        final double lat = loc.getLatitude();
        final double lon = loc.getLongitude();
        final long now = System.currentTimeMillis();
        final String provider = loc.getProvider() != null ? loc.getProvider() : "gps";
        final float speedMps = loc.hasSpeed() ? Math.max(0f, loc.getSpeed()) : 0f;
        final float speedKmh = speedMps * 3.6f;

        boolean first = Double.isNaN(lastSentLat);
        double distMoved = first ? Double.POSITIVE_INFINITY : distanceMeters(lastSentLat, lastSentLon, lat, lon);

        // Harakat bo'lsa (tezlik >= 1 m/s) 2.5m dan ham darrov yuboramiz; to'xtab turganda esa 4.5-14m sakrashni bloklaymiz
        boolean isMoving = LocationManager.GPS_PROVIDER.equals(provider) && speedMps >= 1.0f && acc <= 25f;
        double minRealMove = isMoving ? 2.5 : (acc <= 12f ? 4.5 : Math.min(14.0, Math.max(5.5, acc * 0.55)));
        boolean accuracyOk = (acc <= 65f) || (acc <= 85f && distMoved >= 20.0);

        final double sendLat;
        final double sendLon;
        final float sendSpeed;
        final String sendProv;

        if (first || (accuracyOk && distMoved >= minRealMove)) {
            if (!first && (now - lastSentAt) < 850L) {
                return;
            }
            sendLat = lat;
            sendLon = lon;
            sendSpeed = speedKmh;
            sendProv = provider;
            lastSentLat = lat;
            lastSentLon = lon;
            lastSentAcc = acc;
            lastSentAt = now;
        } else if (now - lastSentAt >= 15000L) {
            sendLat = lastSentLat;
            sendLon = lastSentLon;
            sendSpeed = 0f;
            sendProv = "heartbeat";
            lastSentAt = now;
        } else {
            return;
        }

        final String cleanUid = uid.trim();
        netPool.execute(new Runnable() {
            @Override
            public void run() {
                boolean ok = postLocation(cleanUid, sendLat, sendLon, lastSentAcc, sendSpeed, sendProv);
                if (!ok) {
                    lastSentAt = Math.min(lastSentAt, System.currentTimeMillis() - 12000L);
                }
            }
        });
    }

    private void sendHeartbeatPingOnly() {
        SharedPreferences sp = getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        final String uid = sp.getString("uid", "");
        if (uid == null || uid.trim().isEmpty()) return;

        final long now = System.currentTimeMillis();
        if (now - lastSentAt < 15000L) return;
        lastSentAt = now;

        final String cleanUid = uid.trim();
        netPool.execute(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(API_URL);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

                    String json = "{\"type\":\"apk_ping\",\"id\":" + cleanUid + ",\"source\":\"android_apk\"}";
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
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
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
    @Override public void onProviderEnabled(String provider) {}
    @Override public void onProviderDisabled(String provider) {}

    @Override
    public void onDestroy() {
        handler.removeCallbacks(periodicTask);
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
