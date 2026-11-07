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
    private long lastSentAt = 0;

    private final Runnable periodicTask = new Runnable() {
        @Override
        public void run() {
            pollAndSend();
            handler.postDelayed(this, 6000);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        acquireWakeLock();
        startForegroundCompat();
        startListeningLocation();
        handler.post(periodicTask);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundCompat();
        startListeningLocation();
        pollAndSend();
        return START_STICKY;
    }

    @SuppressLint("WakelockTimeout")
    private void acquireWakeLock() {
        try {
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
                ch.setDescription("24/7 fon rejimida oilaviy xarita uchun joylashuvni uzatadi");
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
              .setContentText("📍 24/7 Real-Time joylashuv ishlayapti")
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
                    locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 4000L, 0f, this, Looper.getMainLooper());
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

    @SuppressLint("MissingPermission")
    private void pollAndSend() {
        if (!hasLocationPerm() || locationManager == null) return;
        try {
            Location gps = null;
            Location net = null;
            try {
                gps = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            } catch (Exception ignored) {}
            try {
                net = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            } catch (Exception ignored) {}

            Location candidate = pickBetter(gps, net);
            candidate = pickBetter(bestLocation, candidate);
            if (candidate != null) {
                bestLocation = candidate;
                considerSending(candidate);
            }
        } catch (Exception ignored) {}
    }

    private Location pickBetter(Location a, Location b) {
        if (a == null) return b;
        if (b == null) return a;
        long timeDelta = b.getTime() - a.getTime();
        if (timeDelta > 20000) return b;
        if (timeDelta < -20000) return a;
        return b.getAccuracy() <= a.getAccuracy() ? b : a;
    }

    @Override
    public void onLocationChanged(Location loc) {
        if (loc == null) return;
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

        boolean first = Double.isNaN(lastSentLat);
        double distMoved = first ? Double.POSITIVE_INFINITY : distanceMeters(lastSentLat, lastSentLon, lat, lon);
        double minRealMove = Math.min(18.0, Math.max(5.0, acc * 0.65));

        final double sendLat;
        final double sendLon;
        if (first || (acc <= 65f && distMoved >= minRealMove)) {
            sendLat = lat;
            sendLon = lon;
            lastSentLat = lat;
            lastSentLon = lon;
            lastSentAt = now;
        } else if (now - lastSentAt >= 20000L) {
            sendLat = lastSentLat;
            sendLon = lastSentLon;
            lastSentAt = now;
        } else {
            return;
        }

        netPool.execute(new Runnable() {
            @Override
            public void run() {
                postLocation(uid.trim(), sendLat, sendLon, acc);
            }
        });
    }

    private void postLocation(String uid, double lat, double lon, float acc) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(API_URL);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

            String json = "{\"type\":\"auto_location\",\"id\":" + uid
                    + ",\"source\":\"android_apk\""
                    + ",\"lat\":" + lat
                    + ",\"lon\":" + lon
                    + ",\"accuracy\":" + acc + "}";
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
