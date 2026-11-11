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

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final int REQ_PERMS = 1001;
    private static final int REQ_BG_LOC = 1002;

    private static final String[][] MEMBERS = {
        {"🙋‍♂️ Jamshid", "6280077746", "#3b82f6"},
        {"🙋‍♀️ Dilrabo", "1512600413", "#ec4899"},
        {"🙋‍♂️ Dilmurod", "7748681452", "#8b5cf6"},
        {"🙋‍♂️ Мурат", "5123370336", "#0d9488"},
        {"🙋‍♂️ Jahongir", "780454115", "#f59e0b"}
    };

    private ScrollView scrollView;
    private LinearLayout contentLayout;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        scrollView = new ScrollView(this);
        scrollView.setBackgroundColor(Color.parseColor("#0f0c24"));

        contentLayout = new LinearLayout(this);
        contentLayout.setOrientation(LinearLayout.VERTICAL);
        contentLayout.setPadding(40, 56, 40, 56);
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
        renderUI();
    }

    private synchronized void renderUI() {
        if (contentLayout == null) return;
        contentLayout.removeAllViews();

        TextView iconView = new TextView(this);
        iconView.setText("🏠");
        iconView.setTextSize(56f);
        iconView.setGravity(Gravity.CENTER);
        contentLayout.addView(iconView);

        TextView titleView = new TextView(this);
        titleView.setText("Oilaviy Uy");
        titleView.setTextSize(26f);
        titleView.setTypeface(null, Typeface.BOLD);
        titleView.setTextColor(Color.WHITE);
        titleView.setGravity(Gravity.CENTER);
        titleView.setPadding(0, 12, 0, 18);
        contentLayout.addView(titleView);

        TextView statusBadge = new TextView(this);
        statusBadge.setText("🟢 24/7 Fon GPS Datchigi Faol");
        statusBadge.setTextSize(15f);
        statusBadge.setTypeface(null, Typeface.BOLD);
        statusBadge.setTextColor(Color.parseColor("#10b981"));
        statusBadge.setGravity(Gravity.CENTER);
        statusBadge.setPadding(28, 16, 28, 16);

        GradientDrawable badgeBg = new GradientDrawable();
        badgeBg.setColor(Color.parseColor("#1e1b4b"));
        badgeBg.setCornerRadius(24f);
        badgeBg.setStroke(2, Color.parseColor("#10b981"));
        statusBadge.setBackground(badgeBg);
        contentLayout.addView(statusBadge);

        String savedUid = getSavedUid();
        String savedName = getSavedName();

        TextView userText = new TextView(this);
        if (!savedUid.isEmpty() && !savedName.isEmpty()) {
            userText.setText("👤 " + savedName);
        } else {
            userText.setText("👤 Oila a'zongizni tanlang:");
        }
        userText.setTextSize(19f);
        userText.setTypeface(null, Typeface.BOLD);
        userText.setTextColor(Color.parseColor("#38bdf8"));
        userText.setGravity(Gravity.CENTER);
        userText.setPadding(0, 20, 0, 12);
        contentLayout.addView(userText);

        // A'zolarning 1-marta bosiladigan tugmalari (kodsiz ulanish)
        LinearLayout grid = new LinearLayout(this);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setGravity(Gravity.CENTER);
        grid.setPadding(0, 0, 0, 12);

        LinearLayout row1 = new LinearLayout(this);
        row1.setOrientation(LinearLayout.HORIZONTAL);
        row1.setGravity(Gravity.CENTER);
        row1.addView(createMemberBtn(MEMBERS[0][0], MEMBERS[0][1], MEMBERS[0][2], savedUid));
        row1.addView(createHSpacer(16));
        row1.addView(createMemberBtn(MEMBERS[1][0], MEMBERS[1][1], MEMBERS[1][2], savedUid));
        grid.addView(row1);

        grid.addView(createVSpacer(12));

        LinearLayout row2 = new LinearLayout(this);
        row2.setOrientation(LinearLayout.HORIZONTAL);
        row2.setGravity(Gravity.CENTER);
        row2.addView(createMemberBtn(MEMBERS[2][0], MEMBERS[2][1], MEMBERS[2][2], savedUid));
        row2.addView(createHSpacer(16));
        row2.addView(createMemberBtn(MEMBERS[3][0], MEMBERS[3][1], MEMBERS[3][2], savedUid));
        grid.addView(row2);

        grid.addView(createVSpacer(12));

        LinearLayout row3 = new LinearLayout(this);
        row3.setOrientation(LinearLayout.HORIZONTAL);
        row3.setGravity(Gravity.CENTER);
        row3.addView(createMemberBtn(MEMBERS[4][0], MEMBERS[4][1], MEMBERS[4][2], savedUid));
        grid.addView(row3);

        contentLayout.addView(grid);

        // Ogohlantirish kartochkasi (asl nusxadagi kabi)
        TextView descBox = new TextView(this);
        descBox.setText("⚠️ DIQQAT: Bu ilova 3D uyga kirish uchun EMAS!\nU faqat Telegramdan chiqib ketganingizda ham fonda GPS joylashuvni uzatib turuvchi datchik.\n\n🏠 3D Uyga esa TELEGRAM bot orqali kiriladi!");
        descBox.setTextSize(14f);
        descBox.setTextColor(Color.parseColor("#cbd5e1"));
        descBox.setGravity(Gravity.CENTER);
        descBox.setPadding(28, 24, 28, 24);

        GradientDrawable descBg = new GradientDrawable();
        descBg.setColor(Color.parseColor("#181432"));
        descBg.setCornerRadius(20f);
        descBox.setBackground(descBg);

        LinearLayout.LayoutParams descParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        descParams.setMargins(0, 16, 0, 20);
        descBox.setLayoutParams(descParams);
        contentLayout.addView(descBox);

        // 1. Telegram Botni ochish
        Button btnTg = createStyledButton("✈️ Telegram Botni ochish", "#6366f1");
        btnTg.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String curUid = getSavedUid();
                if (!curUid.isEmpty()) {
                    sendApkPing(curUid);
                    sendImmediateRealLocation(curUid);
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/HomeChat_3d_bot?start=xona")));
                } catch (Exception ignored) {}
            }
        });
        contentLayout.addView(btnTg);

        // 2. Batareyani 'Cheklovlarsiz' qilish (Redmi va barcha telefonlar uchun)
        Button btnBat = createStyledButton("🔋 1. Batareyani 'Cheklovlarsiz' qilish", "#059669");
        LinearLayout.LayoutParams pBat = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        pBat.setMargins(0, 14, 0, 0);
        btnBat.setLayoutParams(pBat);
        btnBat.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openBatterySettings();
            }
        });
        contentLayout.addView(btnBat);

        // 2.5 Fon ovozini sinash tugmasi
        Button btnTestVoice = createStyledButton("🔊 Fon ovozini sinash (Test)", "#0ea5e9");
        LinearLayout.LayoutParams pVoice = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        pVoice.setMargins(0, 10, 0, 0);
        btnTestVoice.setLayoutParams(pVoice);
        btnTestVoice.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    Intent svc = new Intent(MainActivity.this, LocationService.class);
                    svc.putExtra("test_voice", "p_camera");
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(svc);
                    } else {
                        startService(svc);
                    }
                    Toast.makeText(MainActivity.this, "🔊 Fon ovozi ishga tushirildi!", Toast.LENGTH_SHORT).show();
                } catch (Exception ex) {
                    Toast.makeText(MainActivity.this, "⚠️ Xato: " + ex.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }
        });
        contentLayout.addView(btnTestVoice);

        // 3. Joylashuvni 'Har doim' qilish
        Button btnLoc = createStyledButton("📍 2. Joylashuvni 'Har doim' qilish", "#d97706");
        LinearLayout.LayoutParams pLoc = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        pLoc.setMargins(0, 10, 0, 0);
        btnLoc.setLayoutParams(pLoc);
        btnLoc.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openAppPermissionSettings();
            }
        });
        contentLayout.addView(btnLoc);

        // Boshqa hisobga o'tkazish
        TextView rebindBtn = new TextView(this);
        rebindBtn.setText("🔄 Qurilmani boshqa hisobga qayta ulash");
        rebindBtn.setTextSize(13f);
        rebindBtn.setTextColor(Color.parseColor("#64748b"));
        rebindBtn.setGravity(Gravity.CENTER);
        rebindBtn.setPadding(0, 28, 0, 12);
        rebindBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                saveUid("", "");
                renderUI();
                Toast.makeText(MainActivity.this, "Ismingizni qaytadan tanlang", Toast.LENGTH_SHORT).show();
            }
        });
        contentLayout.addView(rebindBtn);

        if (!savedUid.isEmpty()) {
            sendApkPing(savedUid);
            sendImmediateRealLocation(savedUid);
            startGpsService();
        }
    }

    private Button createMemberBtn(final String label, final String uid, String colorHex, String activeUid) {
        Button btn = new Button(this);
        btn.setText(label);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(14f);
        btn.setTypeface(null, Typeface.BOLD);
        btn.setPadding(28, 18, 28, 18);

        boolean isSelected = uid.equals(activeUid);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(colorHex));
        bg.setCornerRadius(16f);
        if (isSelected) {
            bg.setStroke(3, Color.parseColor("#ffffff"));
        }
        btn.setBackground(bg);

        btn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String cleanName = label.replace("🙋‍♂️", "").replace("🙋‍♀️", "").trim();
                saveUid(uid, cleanName);
                sendApkPing(uid);
                sendImmediateRealLocation(uid);
                startGpsService();
                renderUI();
                Toast.makeText(MainActivity.this, "✅ " + cleanName + " tanlandi! Datchik faol.", Toast.LENGTH_SHORT).show();
            }
        });

        return btn;
    }

    private View createHSpacer(int widthDp) {
        View v = new View(this);
        int px = (int) (widthDp * getResources().getDisplayMetrics().density);
        v.setLayoutParams(new LinearLayout.LayoutParams(px, 1));
        return v;
    }

    private View createVSpacer(int heightDp) {
        View v = new View(this);
        int px = (int) (heightDp * getResources().getDisplayMetrics().density);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, px));
        return v;
    }

    private Button createStyledButton(String text, String colorHex) {
        Button btn = new Button(this);
        btn.setText(text);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(15f);
        btn.setTypeface(null, Typeface.BOLD);
        btn.setPadding(32, 22, 32, 22);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(colorHex));
        bg.setCornerRadius(18f);
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
            String host = data.getHost();
            String full = data.toString().toLowerCase();
            if ("settings".equalsIgnoreCase(host) || full.contains("settings")) {
                openAppPermissionSettings();
                return true;
            }
            if ("battery".equalsIgnoreCase(host) || full.contains("battery")) {
                openBatterySettings();
                return true;
            }

            String uid = data.getQueryParameter("uid");
            if (uid != null && !uid.trim().isEmpty()) {
                String name = data.getQueryParameter("name");
                if (name == null || name.trim().isEmpty()) {
                    name = "Oila a'zosi";
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

    private void openAppPermissionSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(intent);
            Toast.makeText(this, "📍 Ruxsatlar -> Joylashuv: 'Har doim ruxsat berish' ni tanlang", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(fallback);
            } catch (Exception ignored) {}
        }
    }

    private void openBatterySettings() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) {
                    Toast.makeText(this, "✅ Batareya allaqachon cheklovlarsiz!", Toast.LENGTH_SHORT).show();
                    return;
                }
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                Toast.makeText(this, "🔋 Batareya: 'Cheklovlarsiz' (Без ограничений) ni tanlang", Toast.LENGTH_LONG).show();
                return;
            }
        } catch (Exception ignored) {}
        openAppPermissionSettings();
    }

    private void saveUid(String uid, String name) {
        SharedPreferences sp = getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        sp.edit().putString("uid", uid).putString("name", name).apply();
    }

    private String getSavedUid() {
        SharedPreferences sp = getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        return sp.getString("uid", "");
    }

    private String getSavedName() {
        SharedPreferences sp = getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        return sp.getString("name", "");
    }

    private void sendApkPing(final String uid) {
        if (uid == null || uid.trim().isEmpty()) return;
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL("https://oila-ai-ll6d.onrender.com/api/action");
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
                if (loc == null) {
                    try {
                        loc = lm.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER);
                    } catch (Exception ignored) {}
                }
            }
            if (loc != null && (!loc.hasAccuracy() || loc.getAccuracy() <= 45f) && (System.currentTimeMillis() - loc.getTime()) < 120000L) {
                final double lat = loc.getLatitude();
                final double lon = loc.getLongitude();
                final float acc = loc.hasAccuracy() ? loc.getAccuracy() : 15f;
                new Thread(new Runnable() {
                    @Override
                    public void run() {
                        HttpURLConnection conn = null;
                        try {
                            URL url = new URL("https://oila-ai-ll6d.onrender.com/api/action");
                            conn = (HttpURLConnection) url.openConnection();
                            conn.setRequestMethod("POST");
                            conn.setConnectTimeout(8000);
                            conn.setReadTimeout(8000);
                            conn.setDoOutput(true);
                            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

                            String json = "{\"type\":\"auto_location\",\"id\":" + uid.trim()
                                    + ",\"source\":\"android_apk_init\""
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
