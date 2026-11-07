package uz.oilaviy.uy;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class MainActivity extends Activity {
    private static final int REQ_PERMS = 1001;
    private static final int REQ_BG_LOC = 1002;

    private ScrollView scrollView;
    private LinearLayout contentLayout;
    private String currentPairCode = null;
    private boolean isPollingPair = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        scrollView = new ScrollView(this);
        scrollView.setBackgroundColor(Color.parseColor("#0f0c24"));

        contentLayout = new LinearLayout(this);
        contentLayout.setOrientation(LinearLayout.VERTICAL);
        contentLayout.setPadding(48, 64, 48, 64);
        contentLayout.setGravity(Gravity.CENTER_HORIZONTAL);
        scrollView.addView(contentLayout);
        setContentView(scrollView);

        handleIncomingIntent(getIntent());
        renderUI();
        requestNeededPermissions();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (getSavedUid().isEmpty()) {
            if (currentPairCode == null) {
                fetchNewPairCode();
            } else if (!isPollingPair) {
                startPairPolling();
            }
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        isPollingPair = false;
    }

    private synchronized void renderUI() {
        contentLayout.removeAllViews();

        TextView iconView = new TextView(this);
        iconView.setText("🏠");
        iconView.setTextSize(64f);
        iconView.setGravity(Gravity.CENTER);
        contentLayout.addView(iconView);

        TextView titleView = new TextView(this);
        titleView.setText("Oilaviy Uy");
        titleView.setTextSize(26f);
        titleView.setTypeface(null, Typeface.BOLD);
        titleView.setTextColor(Color.WHITE);
        titleView.setGravity(Gravity.CENTER);
        titleView.setPadding(0, 16, 0, 24);
        contentLayout.addView(titleView);

        String uid = getSavedUid();
        if (uid.isEmpty()) {
            renderPairingUI();
        } else {
            renderActiveSensorUI(uid);
        }
    }

    private void renderPairingUI() {
        TextView badge = new TextView(this);
        badge.setText("🟡 Telegramga ulanish kutilmoqda");
        badge.setTextSize(15f);
        badge.setTypeface(null, Typeface.BOLD);
        badge.setTextColor(Color.parseColor("#f59e0b"));
        badge.setGravity(Gravity.CENTER);
        badge.setPadding(32, 18, 32, 18);

        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setColor(Color.parseColor("#451a03"));
        badgeBg.setCornerRadius(24f);
        badgeBg.setStroke(2, Color.parseColor("#f59e0b"));
        badge.setBackground(badgeBg);
        contentLayout.addView(badge);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER);
        card.setPadding(36, 36, 36, 36);

        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#181432"));
        cardBg.setCornerRadius(24f);
        cardBg.setStroke(1, Color.parseColor("#2e2652"));
        card.setBackground(cardBg);

        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        cardParams.setMargins(0, 32, 0, 32);
        card.setLayoutParams(cardParams);

        TextView label = new TextView(this);
        label.setText("🔑 Sizning ulanish kodingiz:");
        label.setTextSize(15f);
        label.setTextColor(Color.parseColor("#94a3b8"));
        label.setGravity(Gravity.CENTER);
        card.addView(label);

        final TextView codeView = new TextView(this);
        String formattedCode = (currentPairCode != null && currentPairCode.length() == 6)
                ? currentPairCode.substring(0, 3) + " " + currentPairCode.substring(3)
                : "Yuklanmoqda...";
        codeView.setText(formattedCode);
        codeView.setTextSize(36f);
        codeView.setTypeface(null, Typeface.BOLD);
        codeView.setTextColor(Color.parseColor("#38bdf8"));
        codeView.setGravity(Gravity.CENTER);
        codeView.setPadding(0, 16, 0, 20);
        card.addView(codeView);

        TextView desc = new TextView(this);
        desc.setText("Ilovani Telegram hisobingizga ulash uchun ushbu kodni botingizga yuboring.\n\n🔒 Har bir a'zo o'z kodi orqali ulanadi, hech kim birovning nomini tanlay olmaydi.");
        desc.setTextSize(14f);
        desc.setTextColor(Color.parseColor("#cbd5e1"));
        desc.setGravity(Gravity.CENTER);
        desc.setLineSpacing(4f, 1.15f);
        card.addView(desc);

        contentLayout.addView(card);

        Button btnSend = createStyledButton("✈️ Kodni Telegram Botga yuborish", "#6366f1");
        btnSend.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (currentPairCode != null && !currentPairCode.isEmpty()) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/HomeChat_3d_bot?start=pair_" + currentPairCode)));
                    } catch (Exception ignored) {}
                } else {
                    Toast.makeText(MainActivity.this, "Kod yuklanmoqda...", Toast.LENGTH_SHORT).show();
                    fetchNewPairCode();
                }
            }
        });
        contentLayout.addView(btnSend);

        fetchNewPairCode();
    }

    private void renderActiveSensorUI(final String uid) {
        TextView statusBadge = new TextView(this);
        statusBadge.setText("🟢 24/7 Fon GPS Datchigi Faol");
        statusBadge.setTextSize(15f);
        statusBadge.setTypeface(null, Typeface.BOLD);
        statusBadge.setTextColor(Color.parseColor("#10b981"));
        statusBadge.setGravity(Gravity.CENTER);
        statusBadge.setPadding(32, 20, 32, 20);

        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setColor(Color.parseColor("#1e1b4b"));
        badgeBg.setCornerRadius(24f);
        badgeBg.setStroke(2, Color.parseColor("#10b981"));
        statusBadge.setBackground(badgeBg);
        contentLayout.addView(statusBadge);

        SharedPreferences sp = getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        String name = sp.getString("name", "Oila a'zosi");

        TextView userText = new TextView(this);
        userText.setText("👤 " + name);
        userText.setTextSize(20f);
        userText.setTypeface(null, Typeface.BOLD);
        userText.setTextColor(Color.parseColor("#38bdf8"));
        userText.setGravity(Gravity.CENTER);
        userText.setPadding(0, 24, 0, 16);
        contentLayout.addView(userText);

        TextView descBox = new TextView(this);
        descBox.setText("⚠️ DIQQAT: Bu ilova 3D uyga kirish uchun EMAS!\nU faqat Telegramdan chiqib ketganingizda ham fonda GPS joylashuvni uzatib turuvchi datchik.\n\n🏠 3D Uyga esa TELEGRAM bot orqali kiriladi!");
        descBox.setTextSize(15f);
        descBox.setTextColor(Color.parseColor("#cbd5e1"));
        descBox.setGravity(Gravity.CENTER);
        descBox.setPadding(32, 32, 32, 32);

        GradientDrawable descBg = new GradientDrawable();
        descBg.setColor(Color.parseColor("#181432"));
        descBg.setCornerRadius(20f);
        descBox.setBackground(descBg);

        LinearLayout.LayoutParams descParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        descParams.setMargins(0, 24, 0, 28);
        descBox.setLayoutParams(descParams);
        contentLayout.addView(descBox);

        Button btnTg = createStyledButton("✈️ Telegram Botni ochish", "#6366f1");
        btnTg.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                sendApkPing(uid);
                sendImmediateRealLocation(uid);
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/HomeChat_3d_bot?start=xona")));
                } catch (Exception ignored) {}
            }
        });
        contentLayout.addView(btnTg);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Button bgPermBtn = createStyledButton("⚙️ 24/7 Fon ruxsatini yoqish ('Har doim')", "#d97706");
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            p.setMargins(0, 20, 0, 0);
            bgPermBtn.setLayoutParams(p);
            bgPermBtn.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    try {
                        requestPermissions(new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, REQ_BG_LOC);
                    } catch (Exception e) {
                        try {
                            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                            intent.setData(Uri.parse("package:" + getPackageName()));
                            startActivity(intent);
                        } catch (Exception ignored) {}
                    }
                }
            });
            contentLayout.addView(bgPermBtn);
        }

        TextView rebindBtn = new TextView(this);
        rebindBtn.setText("🔄 Qurilmani boshqa hisobga qayta ulash");
        rebindBtn.setTextSize(13f);
        rebindBtn.setTextColor(Color.parseColor("#64748b"));
        rebindBtn.setGravity(Gravity.CENTER);
        rebindBtn.setPadding(0, 36, 0, 16);
        rebindBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                saveUid("", "");
                currentPairCode = null;
                renderUI();
            }
        });
        contentLayout.addView(rebindBtn);

        sendApkPing(uid);
        sendImmediateRealLocation(uid);
        startGpsService();
    }

    private void fetchNewPairCode() {
        if (!getSavedUid().isEmpty()) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    URL url = new URL("https://oila-ai.onrender.com/api/pair/request");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(6000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

                    String reqJson = "{\"deviceId\":\"" + getOrCreateDeviceId() + "\"}";
                    byte[] b = reqJson.getBytes(StandardCharsets.UTF_8);
                    conn.setFixedLengthStreamingMode(b.length);
                    OutputStream os = conn.getOutputStream();
                    os.write(b);
                    os.flush();
                    os.close();

                    if (conn.getResponseCode() == 200) {
                        InputStream is = conn.getInputStream();
                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        byte[] buf = new byte[1024];
                        int r;
                        while ((r = is.read(buf)) != -1) baos.write(buf, 0, r);
                        is.close();
                        JSONObject res = new JSONObject(baos.toString("UTF-8"));
                        if (res.optBoolean("ok", false)) {
                            currentPairCode = res.optString("code", "");
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    if (getSavedUid().isEmpty()) {
                                        renderUI();
                                    }
                                }
                            });
                            startPairPolling();
                        }
                    }
                } catch (Exception ignored) {}
            }
        }).start();
    }

    private void startPairPolling() {
        if (isPollingPair) return;
        isPollingPair = true;
        new Thread(new Runnable() {
            @Override
            public void run() {
                while (isPollingPair && !isFinishing() && getSavedUid().isEmpty()) {
                    if (currentPairCode == null || currentPairCode.isEmpty()) {
                        try { Thread.sleep(2000); } catch (InterruptedException e) { break; }
                        continue;
                    }
                    try {
                        String urlStr = "https://oila-ai.onrender.com/api/pair/status?code=" + currentPairCode + "&deviceId=" + getOrCreateDeviceId();
                        URL url = new URL(urlStr);
                        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestMethod("GET");
                        conn.setConnectTimeout(5000);
                        conn.setReadTimeout(5000);
                        if (conn.getResponseCode() == 200) {
                            InputStream is = conn.getInputStream();
                            ByteArrayOutputStream baos = new ByteArrayOutputStream();
                            byte[] buf = new byte[1024];
                            int r;
                            while ((r = is.read(buf)) != -1) baos.write(buf, 0, r);
                            is.close();
                            JSONObject res = new JSONObject(baos.toString("UTF-8"));
                            if (res.optBoolean("paired", false)) {
                                String uid = res.optString("uid", "");
                                String name = res.optString("name", "Oila a'zosi");
                                if (!uid.isEmpty()) {
                                    saveUid(uid, name);
                                    isPollingPair = false;
                                    runOnUiThread(new Runnable() {
                                        @Override
                                        public void run() {
                                            Toast.makeText(MainActivity.this, "✅ Muvaffaqiyatli ulandi!", Toast.LENGTH_SHORT).show();
                                            renderUI();
                                        }
                                    });
                                    break;
                                }
                            }
                        }
                    } catch (Exception ignored) {}
                    try { Thread.sleep(2000); } catch (InterruptedException e) { break; }
                }
                isPollingPair = false;
            }
        }).start();
    }

    private String getOrCreateDeviceId() {
        SharedPreferences sp = getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        String devId = sp.getString("device_id", "");
        if (devId.isEmpty()) {
            devId = UUID.randomUUID().toString();
            sp.edit().putString("device_id", devId).apply();
        }
        return devId;
    }

    private Button createStyledButton(String text, String colorHex) {
        Button btn = new Button(this);
        btn.setText(text);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(16f);
        btn.setTypeface(null, Typeface.BOLD);
        btn.setPadding(36, 28, 36, 28);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(colorHex));
        bg.setCornerRadius(20f);
        btn.setBackground(bg);
        return btn;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (handleIncomingIntent(intent)) {
            renderUI();
        }
    }

    private boolean handleIncomingIntent(Intent intent) {
        if (intent == null) return false;
        Uri data = intent.getData();
        if (data != null) {
            String uid = data.getQueryParameter("uid");
            if (uid != null && !uid.trim().isEmpty()) {
                String name = data.getQueryParameter("name");
                if (name == null || name.trim().isEmpty()) {
                    name = "1512600413".equals(uid) ? "Dilrabo" : "Jamshid";
                }
                saveUid(uid.trim(), name);
                sendApkPing(uid.trim());
                sendImmediateRealLocation(uid.trim());
                startGpsService();
                return true;
            }
        }
        return false;
    }

    private void saveUid(String uid, String name) {
        SharedPreferences sp = getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        sp.edit().putString("uid", uid).putString("name", name).apply();
    }

    private void sendApkPing(final String uid) {
        if (uid == null || uid.trim().isEmpty()) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL("https://oila-ai.onrender.com/api/action");
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(6000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

                    String json = "{\"type\":\"apk_ping\",\"id\":" + uid.trim() + ",\"source\":\"android_apk\"}";
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
        }).start();
    }

    private String getSavedUid() {
        SharedPreferences sp = getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        return sp.getString("uid", "");
    }

    private void requestNeededPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            List<String> needed = new ArrayList<>();
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
            }
            if (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            }
            if (Build.VERSION.SDK_INT >= 33) {
                if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    needed.add(Manifest.permission.POST_NOTIFICATIONS);
                }
            }
            if (!needed.isEmpty()) {
                requestPermissions(needed.toArray(new String[0]), REQ_PERMS);
                return;
            }
        }
        onForegroundPermissionsGranted();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMS) {
            onForegroundPermissionsGranted();
        } else if (requestCode == REQ_BG_LOC) {
            startGpsService();
            askIgnoreBatteryOptimizations();
        }
    }

    private void onForegroundPermissionsGranted() {
        startGpsService();
        String uid = getSavedUid();
        if (!uid.isEmpty()) {
            sendApkPing(uid);
            sendImmediateRealLocation(uid);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, REQ_BG_LOC);
                return;
            }
        }
        askIgnoreBatteryOptimizations();
    }

    @SuppressLint("MissingPermission")
    private void sendImmediateRealLocation(final String uid) {
        if (uid == null || uid.trim().isEmpty()) return;
        try {
            android.location.LocationManager lm = (android.location.LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return;
            android.location.Location loc = null;
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                try {
                    loc = lm.getLastKnownLocation(android.location.LocationManager.GPS_PROVIDER);
                } catch (Exception ignored) {}
                try {
                    android.location.Location net = lm.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER);
                    if (loc == null || (net != null && net.getTime() > loc.getTime())) {
                        loc = net;
                    }
                } catch (Exception ignored) {}
            }
            if (loc != null) {
                final double lat = loc.getLatitude();
                final double lon = loc.getLongitude();
                final float acc = loc.hasAccuracy() ? loc.getAccuracy() : 20f;
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        HttpURLConnection conn = null;
                        try {
                            URL url = new URL("https://oila-ai.onrender.com/api/action");
                            conn = (HttpURLConnection) url.openConnection();
                            conn.setRequestMethod("POST");
                            conn.setConnectTimeout(5000);
                            conn.setReadTimeout(5000);
                            conn.setDoOutput(true);
                            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

                            String json = "{\"type\":\"auto_location\",\"id\":" + uid.trim()
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
                }).start();
            }
        } catch (Exception ignored) {}
    }

    @SuppressLint("BatteryLife")
    private void askIgnoreBatteryOptimizations() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    i.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                }
            }
        } catch (Exception ignored) {}
    }

    private void startGpsService() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                    checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    return;
                }
            }
            Intent svc = new Intent(this, LocationService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(svc);
            } else {
                startService(svc);
            }
        } catch (Exception ignored) {}
    }
}
