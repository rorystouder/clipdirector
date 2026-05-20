package ai.clipdirector.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * Typography per /DESIGN.md.
 *
 * Note: DESIGN.md targets Inter (body) + Space Grotesk (display/headline/label)
 * via Google Fonts. Wiring `androidx.compose.ui:ui-text-google-fonts` plus the
 * GoogleFont.Provider cert array is a follow-up; for now we use the system
 * sans-serif (Roboto Flex on API 33+) which matches the metrics closely enough
 * that the design lands. Spacing, sizing, weight, and tracking — the parts that
 * actually define the visual identity — match the spec exactly.
 */

private val Sans = FontFamily.SansSerif       // Will become Inter via GoogleFont
private val Display = FontFamily.SansSerif    // Will become Space Grotesk via GoogleFont

val DisplayLarge = TextStyle(
    fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 48.sp,
    lineHeight = 56.sp, letterSpacing = (-0.02).em,
)
val DisplayMedium = TextStyle(
    fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 36.sp,
    lineHeight = 44.sp, letterSpacing = (-0.01).em,
)
val HeadlineLarge = TextStyle(
    fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 28.sp,
    lineHeight = 36.sp,
)
val HeadlineMedium = TextStyle(
    fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 22.sp,
    lineHeight = 30.sp,
)
val TitleMedium = TextStyle(
    fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 18.sp,
    lineHeight = 26.sp,
)
val BodyLarge = TextStyle(
    fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 16.sp,
    lineHeight = 24.sp,
)
val BodyMedium = TextStyle(
    fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 14.sp,
    lineHeight = 20.sp,
)
val BodySmall = TextStyle(
    fontFamily = Sans, fontWeight = FontWeight.Normal, fontSize = 12.sp,
    lineHeight = 16.sp,
)
val LabelLarge = TextStyle(
    fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
    lineHeight = 20.sp, letterSpacing = 0.05.em,
)
val LabelMedium = TextStyle(
    fontFamily = Display, fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
    lineHeight = 16.sp, letterSpacing = 0.08.em,
)
val LabelCaps = TextStyle(
    fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 11.sp,
    lineHeight = 14.sp, letterSpacing = 0.12.em,
)

/**
 * Material3 Typography mapped from our token scale. The DESIGN.md scale has
 * 11 levels; M3 has 15 slots, so a few have direct mappings and a few we
 * promote / reuse. The `bodyLarge` slot intentionally points at our `BodyLarge`
 * so OutlinedTextField defaults look right.
 */
val ClipDirectorTypography = Typography(
    displayLarge = DisplayLarge,
    displayMedium = DisplayMedium,
    displaySmall = HeadlineLarge,
    headlineLarge = HeadlineLarge,
    headlineMedium = HeadlineMedium,
    headlineSmall = TitleMedium,
    titleLarge = HeadlineMedium,
    titleMedium = TitleMedium,
    titleSmall = LabelLarge,
    bodyLarge = BodyLarge,
    bodyMedium = BodyMedium,
    bodySmall = BodySmall,
    labelLarge = LabelLarge,
    labelMedium = LabelMedium,
    labelSmall = LabelCaps,
)
