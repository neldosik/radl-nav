package de.radlnavi.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class StationWidgetProvider extends AppWidgetProvider {

    // Hardcoded Standort: Cimbernstraße 71a, München
    private static final double HOME_LAT = 48.1126;
    private static final double HOME_LON = 11.5173;

    private static class StationDist {
        String name;
        double lat;
        double lon;
        int bikes;
        double distMeters;

        StationDist(String name, double lat, double lon, int bikes, double distMeters) {
            this.name = name;
            this.lat = lat;
            this.lon = lon;
            this.bikes = bikes;
            this.distMeters = distMeters;
        }
    }

    @Override
    public void onUpdate(final Context context, final AppWidgetManager appWidgetManager, final int[] appWidgetIds) {
        for (final int appWidgetId : appWidgetIds) {
            final RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.station_widget_layout);
            Intent intent = new Intent(context, MainActivity.class);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                    context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    String infoJson = fetchUrl("https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de/station_information.json");
                    String statusJson = fetchUrl("https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de/station_status.json");

                    if (infoJson == null || statusJson == null) return;

                    JSONObject infoObj = new JSONObject(infoJson);
                    JSONArray infoArray = infoObj.getJSONObject("data").getJSONArray("stations");

                    JSONObject statusObj = new JSONObject(statusJson);
                    JSONArray statusArray = statusObj.getJSONObject("data").getJSONArray("stations");

                    Map<String, Integer> bikesMap = new HashMap<>();
                    for (int i = 0; i < statusArray.length(); i++) {
                        JSONObject st = statusArray.getJSONObject(i);
                        bikesMap.put(st.getString("station_id"), st.optInt("num_bikes_available", 0));
                    }

                    List<StationDist> list = new ArrayList<>();
                    for (int i = 0; i < infoArray.length(); i++) {
                        JSONObject info = infoArray.getJSONObject(i);
                        String id = info.getString("station_id");
                        String name = info.optString("name", "Station");
                        double lat = info.getDouble("lat");
                        double lon = info.getDouble("lon");
                        int bikes = bikesMap.containsKey(id) ? bikesMap.get(id) : 0;

                        double dist = haversine(HOME_LAT, HOME_LON, lat, lon);
                        list.add(new StationDist(name, lat, lon, bikes, dist));
                    }

                    Collections.sort(list, new Comparator<StationDist>() {
                        @Override
                        public int compare(StationDist a, StationDist b) {
                            return Double.compare(a.distMeters, b.distMeters);
                        }
                    });

                    String st1Text = "1. Keine Station nahe";
                    String st2Text = "2. —";

                    if (list.size() > 0) {
                        StationDist s1 = list.get(0);
                        st1Text = "📍 " + cleanName(s1.name) + ": " + s1.bikes + " " + (s1.bikes == 1 ? "Rad" : "Räder") + " (" + formatDist(s1.distMeters) + ")";
                    }

                    if (list.size() > 1) {
                        StationDist s2 = list.get(1);
                        st2Text = "📍 " + cleanName(s2.name) + ": " + s2.bikes + " " + (s2.bikes == 1 ? "Rad" : "Räder") + " (" + formatDist(s2.distMeters) + ")";
                    }

                    for (int appWidgetId : appWidgetIds) {
                        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.station_widget_layout);
                        views.setTextViewText(R.id.widget_title, "🚲 NÄCHSTE STATIONEN (MYRADL)");
                        views.setTextViewText(R.id.widget_st1, st1Text);
                        views.setTextViewText(R.id.widget_st2, st2Text);

                        Intent intent = new Intent(context, MainActivity.class);
                        PendingIntent pendingIntent = PendingIntent.getActivity(
                                context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

                        appWidgetManager.updateAppWidget(appWidgetId, views);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }).start();
    }

    private static String fetchUrl(String urlString) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlString);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Android; Mobile; RadlNavi/1.0)");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            if (conn.getResponseCode() != 200) return null;
            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            return sb.toString();
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static double haversine(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371000; // Radius in Metern
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private static String cleanName(String name) {
        if (name == null) return "";
        return name.replace("Station", "").trim();
    }

    private static String formatDist(double meters) {
        if (meters < 1000) {
            return Math.round(meters) + "m";
        }
        return String.format("%.1fkm", meters / 1000.0);
    }
}
