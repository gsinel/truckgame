package com.fanmade.arenaai.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.fanmade.arenaai.data.Prefs

private val ArenaPurple = Color(0xFF5B3DF5)
private val ArenaPurpleLight = Color(0xFF9D86FF)

@Composable
fun ArenaTheme(content: @Composable () -> Unit) {
    val darkTheme = Prefs.darkApp || isSystemInDarkTheme()
    val context = LocalContext.current
    val scheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && darkTheme -> dynamicDarkColorScheme(context)
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> dynamicLightColorScheme(context)
        darkTheme -> darkColorScheme(primary = ArenaPurpleLight, secondary = ArenaPurpleLight)
        else -> lightColorScheme(primary = ArenaPurple, secondary = ArenaPurple)
    }
    MaterialTheme(
        colorScheme = scheme,
        typography = Typography(),
        content = content,
    )
}
