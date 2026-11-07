package uz.oilaviy.uy;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        SharedPreferences sp = context.getSharedPreferences("family_prefs", Context.MODE_PRIVATE);
        String uid = sp.getString("uid", "");
        if (uid != null && !uid.trim().isEmpty()) {
            try {
                Intent svc = new Intent(context, LocationService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(svc);
                } else {
                    context.startService(svc);
                }
            } catch (Exception ignored) {}
        }
    }
}
