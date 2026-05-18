package ai.clipdirector.ui.processing

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun ProcessingScreen(onComplete: () -> Unit) {
    // TODO Phase 2: poll GET /jobs/{id} every ~3s, render status + progress bar, navigate on 'complete'.
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Directing your edit…", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(16.dp))
        LinearProgressIndicator()
        Spacer(Modifier.height(16.dp))
        Button(onClick = onComplete) { Text("(stub) Mark complete") }
    }
}
