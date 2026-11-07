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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final int REQ_PERMS = 1001;
    private static final int REQ_BG_LOC = 1002;

    private TextView statusBadge;
    private TextView userSelectedText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        handleIncomingIntent(getIntent());

        ScrollView scrollView = new ScrollView(this);
        scrollView.setBackgroundColor(Color.parseColor("#0f0c24"));

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(48, 64, 48, 64);
        layout.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView iconView = new TextView(this);
        iconView.setText("🏠");
        iconView.setTextSize(64f);
        iconView.setGravity(Gravity.CENTER);
        layout.addView(iconView);

        TextView titleView = new TextView(this);
        titleView.setText("Oilaviy Uy");
        titleView.setTextSize(26f);
        titleView.setTypeface(null, Typeface.BOLD);
        titleView.setTextColor(Color.WHITE);
        titleView.setGravity(Gravity.CENTER);
        titleView.setPadding(0, 16, 0, 24);
        layout.addView(titleView);

        statusBadge = new TextView(this);
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
        layout.addView(statusBadge);

        userSelectedText = new TextView(this);
        userSelectedText.setTextSize(18f);
        userSelectedText.setTypeface(null, Typeface.BOLD);
        userSelectedText.setTextColor(Color.parseColor("#38bdf8"));
        userSelectedText.setGravity(Gravity.CENTER);
        userSelectedText.setPadding(0, 32, 0, 16);
        updateUserText();
        layout.addView(userSelectedText);

        final LinearLayout buttonsLayout = new LinearLayout(this);
        buttonsLayout.setOrientation(LinearLayout.HORIZONTAL);
        buttonsLayout.setGravity(Gravity.CENTER);
        buttonsLayout.setPadding(0, 0, 0, 16);

        Button btnJamshid = createStyledButton("🙋‍♂️ Jamshid", "#3b82f6");
        btnJamshid.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                saveUid("6280077746");
                updateUserText();
            }
        });
        buttonsLayout.addView(btnJamshid);

        View spacer = new View(this);
        buttonsLayout.addView(spacer, new LinearLayout.LayoutParams(24, 1));

        Button btnDilrabo = createStyledButton("🙋‍♀️ Dilrabo", "#ec4899");
        btnDilrabo.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                saveUid("1512600413");
                updateUserText();
            }
        });
        buttonsLayout.addView(btnDilrabo);
        layout.addView(buttonsLayout);

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
        descParams.setMargins(0, 32, 0, 32);
        descBox.setLayoutParams(descParams);
        layout.addView(descBox);

        Button btnTg = createStyledButton("✈️ Telegram Botni ochish", "#6366f1");
        btnTg.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://t.me/HomeChat_3d_bot")));
                } catch (Exception ignored) {}
            }
        });
        layout.addView(btnTg);

        scrollView.addView(layout);
        setContentView(scrollView);

        String curUid = getSavedUid();
        if (!curUid.isEmpty()) {
            sendApkPing(curUid);
            startGpsService();
        }
        updateUserText();
        fetchAdditionalMembers(buttonsLayout);

        requestNeededPermissions();
    }

    private void fetchAdditionalMembers(final LinearLayout container) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    URL url = new URL("https://oila-ai.onrender.com/api/state");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(6000);
                    conn.setReadTimeout(6000);
                    if (conn.getResponseCode() == 200) {
                        InputStream is = conn.getInputStream();
                        ByteArrayOutputStream baos = new ByteArrayOutputStream();
                        byte[] buf = new byte[1024];
                        int r;
                        while ((r = is.read(buf)) != -1) baos.write(buf, 0, r);
                        is.close();
                        String resp = baos.toString("UTF-8");
                        JSONObject obj = new JSONObject(resp);
                        final JSONArray members = obj.optJSONArray("members");
                        if (members != null) {
                            runOnUiThread(new Runnable() {
                                @Override
                                public void run() {
                                    for (int i = 0; i < members.length(); i++) {
                                        JSONObject m = members.optJSONObject(i);
                                        if (m == null || m.optBoolean("isAi", false)) continue;
                                        final String mid = String.valueOf(m.optLong("id"));
                                        if ("6280077746".equals(mid) || "1512600413".equals(mid)) continue;
                                        final String mname = m.optString("name", "A'zo");

                                        View spacer = new View(MainActivity.this);
                                        container.addView(spacer, new LinearLayout.LayoutParams(24, 1));

                                        Button btn = createStyledButton("🙋 " + mname, "#06b6d4");
                                        btn.setOnClickListener(new View.OnClickListener() {
                                            @Override
                                            public void onClick(View v) {
                                                saveUid(mid);
                                                updateUserText();
                                            }
                                        });
                                        container.addView(btn);
                                    }
                                }
                            });
                        }
                    }
                    conn.disconnect();
                } catch (Exception ignored) {}
            }
        }).start();
    }

    private Button createStyledButton(String text, String colorHex) {
        Button btn = new Button(this);
        btn.setText(text);
        btn.setTextColor(Color.WHITE);
        btn.setTextSize(15f);
        btn.setTypeface(null, Typeface.BOLD);
        btn.setPadding(36, 24, 36, 24);

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(colorHex));
        bg.setCornerRadius(20f);
        btn.setBackground(bg);
        return btn;
    }

    private void updateUserText() {
        String uid = getSavedUid();
        if ("6280077746".equals(uid)) {
            userSelectedText.setText("👤 Jamshid");
        } else if ("1512600413".equals(uid)) {
            userSelectedText.setText("👤 Dilrabo");
        } else if (!uid.isEmpty()) {
            userSelectedText.setText("👤 ID: " + uid);
        } else {
            userSelectedText.setText("👤 Jamshid");
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (handleIncomingIntent(intent)) {
            updateUserText();
        }
    }

    private boolean handleIncomingIntent(Intent intent) {
        if (intent == null) return false;
        Uri data = intent.getData();
        if (data != null) {
            String uid = data.getQueryParameter("uid");
            if (uid != null && !uid.trim().isEmpty()) {
                saveUid(uid.trim());
                return true;
            }
        }
        return false;
    }

    private void saveUid(String uid) {
        SharedPreferences sp = getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        sp.edit().putString("uid", uid).apply();
        sendApkPing(uid);
        startGpsService();
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
        if (uid.isEmpty()) uid = "6280077746";
        sendApkPing(uid);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, REQ_BG_LOC);
                return;
            }
        }
        askIgnoreBatteryOptimizations();
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
