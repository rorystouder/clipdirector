package ai.clipdirector.ui.history

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun HistoryScreen() {
    // TODO Phase 2: list past jobs (local cache + server reconcile), tap to preview or re-prompt.
    Column(modifier = Modifier.padding(16.dp)) {
        Text("History", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(16.dp))
        Text("TODO: past jobs list")
    }
}
