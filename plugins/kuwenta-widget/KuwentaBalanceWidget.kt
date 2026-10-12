package __PACKAGE__

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

abstract class KuwentaBalanceWidget : AppWidgetProvider() {
  protected abstract val balanceKey: String
  protected abstract val titleResource: Int
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val saved = context.getSharedPreferences("kuwenta_widgets", Context.MODE_PRIVATE)
    for (id in ids) {
      val views = RemoteViews(context.packageName, R.layout.kuwenta_balance_widget)
      views.setTextViewText(R.id.kuwenta_balance_title, context.getString(titleResource))
      views.setTextViewText(R.id.kuwenta_balance_amount, saved.getString(balanceKey, "--"))
      views.setTextViewText(R.id.kuwenta_balance_updated, saved.getString("updated", context.getString(R.string.kuwenta_widget_open)))
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse("kuwenta://accounts")).apply {
        setClassName(context.packageName, "${context.packageName}.MainActivity")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
      }
      views.setOnClickPendingIntent(R.id.kuwenta_balance_root, PendingIntent.getActivity(
        context, 4, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      ))
      manager.updateAppWidget(id, views)
    }
  }
}
class KuwentaCashWidget : KuwentaBalanceWidget() {
  override val balanceKey = "cash"
  override val titleResource = R.string.kuwenta_widget_cash
}
class KuwentaAvailableWidget : KuwentaBalanceWidget() {
  override val balanceKey = "available"
  override val titleResource = R.string.kuwenta_widget_available
}
