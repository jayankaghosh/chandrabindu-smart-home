package com.chandrabindu.home.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Brand = Color(0xFF6661F2)
val Orange = Color(0xFFFF9500)
val Green = Color(0xFF34C759)

private val Light = lightColorScheme(
    primary = Brand,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE4E3FF),
    onPrimaryContainer = Color(0xFF1C1873),
    secondaryContainer = Color(0xFFEDEDF5),
    background = Color(0xFFF6F6FB),
    surface = Color(0xFFF6F6FB),
    surfaceContainerLow = Color(0xFFFFFFFF),
    surfaceContainer = Color(0xFFF0F0F7),
    surfaceContainerHigh = Color(0xFFE9E9F2),
    surfaceVariant = Color(0xFFE9E9F2),
    onSurface = Color(0xFF16161D),
    onSurfaceVariant = Color(0xFF5E5E6E),
    outlineVariant = Color(0xFFDADAE6),
    error = Color(0xFFD92D20),
)

private val Dark = darkColorScheme(
    primary = Color(0xFF8D89FF),
    onPrimary = Color(0xFF16134F),
    primaryContainer = Color(0xFF3B37A8),
    onPrimaryContainer = Color(0xFFE4E3FF),
    secondaryContainer = Color(0xFF26262F),
    background = Color(0xFF121218),
    surface = Color(0xFF121218),
    surfaceContainerLow = Color(0xFF1B1B23),
    surfaceContainer = Color(0xFF1F1F28),
    surfaceContainerHigh = Color(0xFF282832),
    surfaceVariant = Color(0xFF282832),
    onSurface = Color(0xFFEDEDF4),
    onSurfaceVariant = Color(0xFFA5A5B5),
    outlineVariant = Color(0xFF34343F),
    error = Color(0xFFFF6B5E),
)

@Composable
fun ChandrabinduTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, content = content)
}
