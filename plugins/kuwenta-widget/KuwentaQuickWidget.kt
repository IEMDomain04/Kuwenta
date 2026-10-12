package __PACKAGE__

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/** Static shortcuts: no background tasks, financial data, or network access. */
class KuwentaQuickWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) {
      val views = RemoteViews(context.packageName, R.layout.kuwenta_quick_widget)
      val actions = listOf(
        Triple(R.id.kuwenta_widget_title, 0, "kuwenta://"),
        Triple(R.id.kuwenta_widget_expense, 1, "kuwenta://transaction?type=EXPENSE"),
        Triple(R.id.kuwenta_widget_income, 2, "kuwenta://transaction?type=INCOME"),
        Triple(R.id.kuwenta_widget_quick, 3, "kuwenta://transaction?quick=1")
      )
      for ((viewId, requestCode, link) in actions) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(link)).apply {
          setClassName(context.packageName, "${context.packageName}.MainActivity")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        views.setOnClickPendingIntent(viewId, PendingIntent.getActivity(
          context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        ))
      }
      manager.updateAppWidget(id, views)
    }
  }
}
