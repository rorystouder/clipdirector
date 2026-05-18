package ai.clipdirector.ui.clips

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ClipSelectScreen(onNext: () -> Unit) {
    // TODO Phase 2: MediaStore query, multi-select grid, 1-12 clip cap, total-duration check (≤ MAX_RAW_FOOTAGE_MINUTES).
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Select Clips (1–12)", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(16.dp))
        Text("TODO: MediaStore grid here")
        Spacer(Modifier.height(16.dp))
        Button(onClick = onNext) { Text("Next") }
    }
}
