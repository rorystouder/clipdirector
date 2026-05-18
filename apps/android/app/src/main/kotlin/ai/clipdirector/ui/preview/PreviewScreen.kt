package ai.clipdirector.ui.preview

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun PreviewScreen(onHome: () -> Unit) {
    // TODO Phase 2: ExoPlayer (Media3) full-screen view, share + save-to-gallery + re-render actions.
    Column(modifier = Modifier.padding(16.dp)) {
        Text("Preview", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(16.dp))
        Text("TODO: ExoPlayer playback of downloaded MP4")
        Spacer(Modifier.height(16.dp))
        Button(onClick = onHome) { Text("Start Over") }
    }
}
