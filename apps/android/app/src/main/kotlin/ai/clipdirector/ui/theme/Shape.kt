package ai.clipdirector.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Corner radii per /DESIGN.md `rounded` scale.
 *   xs  = 4  → M3.extraSmall  (chips, internal badges)
 *   sm  = 8  → M3.small       (text fields, secondary buttons)
 *   md  = 12 → M3.medium      (cards, primary buttons)  ← default for new containers
 *   lg  = 16 → M3.large       (clip thumbnails, prompt-card groups)
 *   xl  = 24 → M3.extraLarge  (hero / decorative)
 */
val ClipDirectorShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp),
)
