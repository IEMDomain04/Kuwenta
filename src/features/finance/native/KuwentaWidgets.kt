package kuwenta.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KuwentaWidgets : Module() {
  override fun definition() = ModuleDefinition {
    Name("KuwentaWidgets")
    AsyncFunction("updateBalances") { cash: String, available: String, updated: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("App is not ready.")
      val saved = context.getSharedPreferences("kuwenta_widgets", Context.MODE_PRIVATE)
      if (saved.getString("cash", null) != cash || saved.getString("available", null) != available || saved.getString("updated", null) != updated) {
        check(saved.edit().putString("cash", cash).putString("available", available).putString("updated", updated).commit())
      }
      val manager = AppWidgetManager.getInstance(context)
      for (name in listOf("KuwentaCashWidget", "KuwentaAvailableWidget")) {
        val component = ComponentName(context.packageName, "${context.packageName}.$name")
        val ids = manager.getAppWidgetIds(component)
        if (ids.isNotEmpty()) context.sendBroadcast(Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
          setComponent(component)
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        })
      }
    }
  }
}
