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
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class StationWidgetProvider extends AppWidgetProvider {

    // Hardcoded Standort: Cimbernstraße 71a, München
    private static final double HOME_LAT = 48.1126;
    private static final double HOME_LON = 11.5173;

    private static class StationDist {
        String name;
        double lat;
        double lon;
        int bikes;   // nur klassische Räder (30 Freiminuten mit Abo)
        int ebikes;  // E-Bikes — immer kostenpflichtig
        double distMeters;

        StationDist(String name, double lat, double lon, int bikes, int ebikes, double distMeters) {
            this.name = name;
            this.lat = lat;
            this.lon = lon;
            this.bikes = bikes;
            this.ebikes = ebikes;
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
                    String typesJson = fetchUrl("https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de/vehicle_types.json");
                    String freeJson = fetchUrl("https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_ml/de/free_bike_status.json");

                    if (infoJson == null || statusJson == null) return;

                    // E-Bike-Typen bestimmen (propulsion_type != "human")
                    Set<String> electricTypes = new HashSet<>();
                    if (typesJson != null) {
                        try {
                            JSONArray types = new JSONObject(typesJson).getJSONObject("data").getJSONArray("vehicle_types");
                            for (int i = 0; i < types.length(); i++) {
                                JSONObject vt = types.getJSONObject(i);
                                String prop = vt.optString("propulsion_type", "human");
                                if (!"human".equals(prop)) electricTypes.add(vt.getString("vehicle_type_id"));
                            }
                        } catch (Exception ignored) {
                        }
                    }

                    JSONObject infoObj = new JSONObject(infoJson);
                    JSONArray infoArray = infoObj.getJSONObject("data").getJSONArray("stations");

                    JSONObject statusObj = new JSONObject(statusJson);
                    JSONArray statusArray = statusObj.getJSONObject("data").getJSONArray("stations");

                    // Pro Station: klassische Räder und E-Bikes getrennt zählen
                    Map<String, int[]> bikesMap = new HashMap<>(); // [klassisch, e-bike]
                    for (int i = 0; i < statusArray.length(); i++) {
                        JSONObject st = statusArray.getJSONObject(i);
                        int total = st.optInt("num_bikes_available", 0);
                        int ebikes = 0;
                        JSONArray perType = st.optJSONArray("vehicle_types_available");
                        if (perType != null) {
                            for (int j = 0; j < perType.length(); j++) {
                                JSONObject vt = perType.getJSONObject(j);
                                if (electricTypes.contains(vt.optString("vehicle_type_id"))) {
                                    ebikes += vt.optInt("count", 0);
                                }
                            }
                        }
                        int classic = Math.max(0, total - ebikes);
                        bikesMap.put(st.getString("station_id"), new int[]{classic, ebikes});
                    }

                    List<StationDist> list = new ArrayList<>();
                    for (int i = 0; i < infoArray.length(); i++) {
                        JSONObject info = infoArray.getJSONObject(i);
                        String id = info.getString("station_id");
                        String name = info.optString("name", "Station");
                        double lat = info.getDouble("lat");
                        double lon = info.getDouble("lon");
                        int[] counts = bikesMap.containsKey(id) ? bikesMap.get(id) : new int[]{0, 0};
                        // Leere Stationen bringen nichts — Widget zeigt, wo es Räder gibt
                        if (counts[0] + counts[1] == 0) continue;

                        double dist = haversine(HOME_LAT, HOME_LON, lat, lon);
                        list.add(new StationDist(name, lat, lon, counts[0], counts[1], dist));
                    }

                    // Freistehende Raeder in der Naehe (max. 400 m) zaehlen wie eine Station
                    if (freeJson != null) {
                        try {
                            JSONArray free = new JSONObject(freeJson).getJSONObject("data").getJSONArray("bikes");
                            int freeClassic = 0, freeElectric = 0;
                            double nearestFree = Double.MAX_VALUE;
                            for (int i = 0; i < free.length(); i++) {
                                JSONObject fb = free.getJSONObject(i);
                                // Raeder mit station_id stehen an einer Station und sind
                                // bereits ueber station_status gezaehlt (sonst doppelt!)
                                if (!fb.optString("station_id", "").isEmpty()) continue;
                                if (fb.optBoolean("is_disabled", false) || fb.optBoolean("is_reserved", false)) continue;
                                if (!fb.has("lat") || !fb.has("lon")) continue;
                                double d = haversine(HOME_LAT, HOME_LON, fb.getDouble("lat"), fb.getDouble("lon"));
                                if (d > 400) continue;
                                if (electricTypes.contains(fb.optString("vehicle_type_id"))) freeElectric++;
                                else freeClassic++;
                                if (d < nearestFree) nearestFree = d;
                            }
                            if (freeClassic + freeElectric > 0) {
                                list.add(new StationDist("Freie Räder", HOME_LAT, HOME_LON,
                                        freeClassic, freeElectric, nearestFree));
                            }
                        } catch (Exception ignored) {
                        }
                    }

                    Collections.sort(list, new Comparator<StationDist>() {
                        @Override
                        public int compare(StationDist a, StationDist b) {
                            return Double.compare(a.distMeters, b.distMeters);
                        }
                    });

                    String st1Text = "1. Keine Station nahe";
                    String st2Text = "2. —";

                    if (list.size() > 0) st1Text = formatStation(list.get(0));
                    if (list.size() > 1) st2Text = formatStation(list.get(1));

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

    /** »Name«: N Räder (+M E) (Distanz) — E-Bikes getrennt, weil sie kostenpflichtig sind. */
    private static String formatStation(StationDist s) {
        String bikes = s.bikes + " " + (s.bikes == 1 ? "Rad" : "Räder");
        String extra = s.ebikes > 0 ? " +" + s.ebikes + " E" : "";
        return "📍 " + cleanName(s.name) + ": " + bikes + extra + " (" + formatDist(s.distMeters) + ")";
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
