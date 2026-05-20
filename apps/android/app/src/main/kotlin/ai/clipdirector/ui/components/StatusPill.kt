package ai.clipdirector.ui.components

import ai.clipdirector.data.job.JobStatus
import ai.clipdirector.ui.theme.statusColor
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * `status-pill` per DESIGN.md. Pill-shaped, surface-container-high background,
 * status color used for both the leading dot AND the text. A long history list
 * is scannable by color alone.
 */
@Composable
fun StatusPill(status: JobStatus, modifier: Modifier = Modifier) {
    val color = statusColor(status)
    Row(
        modifier = modifier
            .background(
                color = MaterialTheme.colorScheme.surfaceContainerHigh,
                shape = RoundedCornerShape(percent = 50),
            )
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(color = color, shape = CircleShape),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = status.name.lowercase(),
            style = MaterialTheme.typography.labelMedium,
            color = color,
        )
    }
}
