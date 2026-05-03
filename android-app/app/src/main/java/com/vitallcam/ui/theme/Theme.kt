package com.vitallcam.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Typography
import androidx.compose.material.darkColors
import androidx.compose.material.lightColors
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp

private val DarkColors = darkColors(
    primary = Teal600,
    primaryVariant = Teal700,
    secondary = Dourado500,
    background = Neutral950,
    surface = Neutral900,
    onBackground = White85,
    onSurface = White85,
    onPrimary = White85,
)

private val LightColors = lightColors(
    primary = Teal600,
    primaryVariant = Teal700,
    secondary = Dourado500,
    background = Neutral950,
    surface = Neutral900,
    onBackground = White85,
    onSurface = White85,
    onPrimary = White85,
)

private val VitallTypography = Typography(
    body1 = TextStyle(fontSize = 14.sp),
    body2 = TextStyle(fontSize = 12.sp),
    button = TextStyle(fontSize = 13.sp),
    caption = TextStyle(fontSize = 11.sp),
)

@Composable
fun VitallCamTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    // O design da câmera é sempre escuro (bg-neutral-950) — força DarkColors.
    MaterialTheme(
        colors = DarkColors,
        typography = VitallTypography,
        content = content,
    )
}
